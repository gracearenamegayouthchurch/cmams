import { z } from 'zod'
import type pg from 'pg'

type Db = Pick<pg.Pool, 'query'>
type SmsClient = Pick<pg.PoolClient, 'query'>
export const smsSettingsInput = z.object({
  enabled: z.boolean(),
  welcomeMode: z.enum(['MANUAL', 'IMMEDIATE', 'DAILY']),
  dailyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  welcomeTemplate: z.string().trim().min(1).max(1400),
}).strict().refine((value) => !/\{(?!firstName\})[^{}]*\}/.test(value.welcomeTemplate), { path: ['welcomeTemplate'], message: 'Only {firstName} is supported' })

export type SmsSettings = { enabled: boolean; welcome_mode: 'MANUAL' | 'IMMEDIATE' | 'DAILY'; daily_time: string; welcome_template: string }
export class SmsError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export function nextWelcomeTime(now: Date, time: string): Date {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Invalid daily time')
  const [hour, minute] = time.split(':').map(Number)
  // Africa/Lagos has a fixed UTC+01:00 offset; use UTC calendar arithmetic.
  const local = new Date(now.getTime() + 3_600_000)
  const due = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour - 1, minute))
  if (due <= now) due.setUTCDate(due.getUTCDate() + 1)
  return due
}

export function renderWelcome(template: string, firstName: string): string {
  if (/\{[^{}]+\}/.test(template.replaceAll('{firstName}', ''))) throw new Error('Unsupported SMS placeholder')
  const body = template.replaceAll('{firstName}', firstName).trim()
  if (!body || body.length > 1530) throw new Error('SMS body exceeds 1530 characters')
  return body
}

export async function getSmsSettings(db: Db): Promise<SmsSettings> {
  const result = await db.query('SELECT enabled,welcome_mode,daily_time,welcome_template FROM sms_settings WHERE id=true')
  if (!result.rows[0]) throw new Error('SMS migration is not applied')
  return result.rows[0] as SmsSettings
}

export async function updateSmsSettings(db: Db, input: unknown, actor: string) {
  const settings = smsSettingsInput.parse(input)
  const result = await db.query(`UPDATE sms_settings SET enabled=$1,welcome_mode=$2,daily_time=$3,welcome_template=$4,
    updated_at=now(),updated_by_staff_id=$5 WHERE id=true RETURNING enabled,welcome_mode,daily_time,welcome_template`,
  [settings.enabled, settings.welcomeMode, settings.dailyTime, settings.welcomeTemplate, actor])
  return result.rows[0] as SmsSettings
}

export async function queueWelcome(client: SmsClient, personId: string, phone: string | null, firstName: string) {
  if (!phone) return
  const settings = await getSmsSettings(client)
  const held = !settings.enabled || settings.welcome_mode === 'MANUAL'
  const due = settings.welcome_mode === 'DAILY' ? nextWelcomeTime(new Date(), settings.daily_time) : new Date()
  await client.query(`INSERT INTO sms_outbox(kind,person_id,recipient,body,status,due_at)
    VALUES('WELCOME',$1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
  [personId, phone.replace(/^\+/, ''), renderWelcome(settings.welcome_template, firstName), held ? 'HELD' : 'PENDING', held ? null : due])
}

export async function listWelcomeMessages(db: Db) {
  const result = await db.query(`SELECT o.id,o.person_id,p.first_name,p.last_name,o.recipient,o.body,o.status,o.due_at,o.created_at,o.failure_reason
    FROM sms_outbox o JOIN people p ON p.id=o.person_id
    WHERE o.kind='WELCOME' ORDER BY o.created_at DESC LIMIT 100`)
  return result.rows
}

type Job = { id: string; recipient: string; body: string }
type Sender = (to: string, body: string) => Promise<{ id?: string }>

async function deliver(db: Db, job: Job, send: Sender) {
  try {
    const result = await send(job.recipient, job.body)
    await db.query("UPDATE sms_outbox SET status='SENT',provider_id=$2,finished_at=now() WHERE id=$1 AND status='PROCESSING'", [job.id, result.id ?? null])
    return 'SENT'
  } catch (error) {
    // A timeout or transport error may mean the provider accepted the SMS: never automatically resend.
    const rejected = error instanceof SmsError && error.status === 422
    await db.query("UPDATE sms_outbox SET status=$2,failure_reason=$3,finished_at=now() WHERE id=$1 AND status='PROCESSING'", [job.id, rejected ? 'FAILED' : 'UNCERTAIN', rejected ? 'Provider rejected message' : 'Delivery outcome unknown; review provider dashboard'])
    return rejected ? 'FAILED' : 'UNCERTAIN'
  }
}

export async function sendManualWelcome(db: Db, id: string, send: Sender) {
  const uuid = z.uuid().parse(id)
  const settings = await getSmsSettings(db)
  if (!settings.enabled) throw new SmsError('Live SMS is disabled in admin settings', 409)
  const claimed = await db.query(`UPDATE sms_outbox SET status='PROCESSING',claimed_at=now()
    WHERE id=$1 AND kind='WELCOME' AND status='HELD'
    RETURNING id,recipient,body`, [uuid])
  if (!claimed.rows[0]) throw new SmsError('Message is no longer available for manual sending', 409)
  return deliver(db, claimed.rows[0] as Job, send)
}

export async function sendImmediateWelcome(db: Db, personId: string, send: Sender) {
  const settings = await getSmsSettings(db)
  if (!settings.enabled || settings.welcome_mode !== 'IMMEDIATE') return 'SKIPPED'
  const claimed = await db.query(`UPDATE sms_outbox SET status='PROCESSING',claimed_at=now()
    WHERE person_id=$1 AND kind='WELCOME' AND status='PENDING' AND due_at<=now()
    RETURNING id,recipient,body`, [personId])
  return claimed.rows[0] ? deliver(db, claimed.rows[0] as Job, send) : 'SKIPPED'
}

export async function processSmsOutbox(db: Db, send: Sender) {
  const settings = await getSmsSettings(db)
  if (!settings.enabled || settings.welcome_mode === 'MANUAL') return { processed: 0 }
  // Unfinished claims require human review: a crashed worker may already have sent them.
  await db.query(`UPDATE sms_outbox SET status='UNCERTAIN',failure_reason='Worker interrupted; review provider dashboard',finished_at=now()
    WHERE status='PROCESSING' AND claimed_at < now() - interval '10 minutes'`)
  let processed = 0
  // Function runtime is 30s and a provider call can take 15s; one claim per tick.
  for (let i = 0; i < 1; i++) {
    const claimed = await db.query(`UPDATE sms_outbox SET status='PROCESSING',claimed_at=now()
      WHERE id=(SELECT id FROM sms_outbox WHERE status='PENDING' AND due_at<=now() AND kind='WELCOME'
      ORDER BY due_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,recipient,body`)
    if (!claimed.rows[0]) break
    await deliver(db, claimed.rows[0] as Job, send)
    processed++
  }
  return { processed }
}
