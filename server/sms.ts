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
export type DeliveryState = 'PENDING' | 'DELIVERED' | 'FAILED'
export class SmsError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

const deliveredValues = new Set(['delivrd', 'delivered', 'success'])
const failedValues = new Set(['undeliv', 'expired', 'rejectd', 'failed', 'rejected', 'invalid'])
export function deliveryState(status: string): DeliveryState {
  const value = status.trim().toLowerCase()
  if (deliveredValues.has(value)) return 'DELIVERED'
  if (failedValues.has(value)) return 'FAILED'
  return 'PENDING'
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
  const result = await db.query(`SELECT o.id,o.person_id,p.first_name,p.last_name,o.recipient,o.body,o.status,
    o.delivery_state,o.delivery_checked_at,o.due_at,o.created_at,o.failure_reason,o.provider_id,
    COALESCE((SELECT json_agg(json_build_object('outcome',a.outcome,'attempted_at',a.attempted_at,'failure_reason',a.failure_reason)
      ORDER BY a.attempted_at DESC) FROM sms_attempts a WHERE a.outbox_id=o.id),'[]'::json) AS attempts
    FROM sms_outbox o JOIN people p ON p.id=o.person_id
    WHERE o.kind='WELCOME' ORDER BY o.created_at DESC LIMIT 100`)
  return result.rows
}

type Job = { id: string; recipient: string; body: string; provider_id?: string | null }
type Sender = (to: string, body: string) => Promise<{ id?: string }>

async function recordAttempt(db: Db, job: Job, actor: string | null, outcome: 'SENT' | 'FAILED' | 'UNCERTAIN', providerId?: string, reason?: string) {
  await db.query(`INSERT INTO sms_attempts(outbox_id,attempted_by_staff_id,recipient,body,provider_id,outcome,failure_reason)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [job.id, actor, job.recipient, job.body, providerId ?? null, outcome, reason ?? null])
}

async function deliver(db: Db, job: Job, send: Sender, actor: string | null = null) {
  try {
    const result = await send(job.recipient, job.body)
    await recordAttempt(db, job, actor, 'SENT', result.id)
    await db.query("UPDATE sms_outbox SET status='SENT',provider_id=$2,delivery_state='PENDING',finished_at=now() WHERE id=$1 AND status='PROCESSING'", [job.id, result.id ?? null])
    return 'SENT'
  } catch (error) {
    // A timeout or transport error may mean the provider accepted the SMS: never automatically resend.
    const rejected = error instanceof SmsError && error.status === 422
    const reason = rejected ? 'Provider rejected message' : 'Delivery outcome unknown; review provider dashboard'
    await recordAttempt(db, job, actor, rejected ? 'FAILED' : 'UNCERTAIN', undefined, reason)
    await db.query("UPDATE sms_outbox SET status=$2,failure_reason=$3,delivery_state=$4,finished_at=now() WHERE id=$1 AND status='PROCESSING'",
      [job.id, rejected ? 'FAILED' : 'UNCERTAIN', reason, rejected ? 'FAILED' : 'PENDING'])
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

export async function refreshDelivery(db: Db, id: string, lookup: (providerId: string) => Promise<string>) {
  const jobId = z.uuid().parse(id)
  const found = await db.query('SELECT provider_id FROM sms_outbox WHERE id=$1 AND kind=$2', [jobId, 'WELCOME'])
  if (!found.rows[0]) throw new SmsError('Message not found', 404)
  const providerId = found.rows[0].provider_id as string | null
  if (!providerId) throw new SmsError('No provider message to check yet', 409)
  const state = deliveryState(await lookup(providerId))
  const updated = await db.query(`UPDATE sms_outbox SET
    delivery_state=CASE WHEN delivery_state='DELIVERED' THEN 'DELIVERED' ELSE $2 END,
    delivery_checked_at=now() WHERE id=$1 RETURNING delivery_state`, [jobId, state])
  return updated.rows[0].delivery_state as DeliveryState
}

export async function resendWelcome(db: Db, id: string, actor: string, send: Sender) {
  const jobId = z.uuid().parse(id)
  const settings = await getSmsSettings(db)
  if (!settings.enabled) throw new SmsError('Live SMS is disabled in admin settings', 409)
  const found = await db.query(`SELECT id,recipient,body,status,delivery_state,provider_id FROM sms_outbox
    WHERE id=$1 AND kind='WELCOME'`, [jobId])
  const job = found.rows[0] as (Job & { status: string; delivery_state: DeliveryState }) | undefined
  if (!job) throw new SmsError('Message not found', 404)
  if (job.status !== 'SENT' || job.delivery_state !== 'FAILED')
    throw new SmsError('Only a message confirmed as failed can be resent', 409)
  // Claim atomically so two admins cannot both pay for the same resend.
  const claimed = await db.query(`UPDATE sms_outbox SET status='PROCESSING',claimed_at=now(),failure_reason=NULL
    WHERE id=$1 AND kind='WELCOME' AND status='SENT' AND delivery_state='FAILED'
    RETURNING id,recipient,body`, [jobId])
  if (!claimed.rows[0]) throw new SmsError('Only a message confirmed as failed can be resent', 409)
  return deliver(db, claimed.rows[0] as Job, send, actor)
}
