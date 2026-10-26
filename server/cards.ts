import { createHash, randomBytes } from 'node:crypto'
import type pg from 'pg'

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const shortCodeAttempts = 8

function generateShortCode() {
  const code = [...randomBytes(6)]
    .map((byte) => alphabet[byte % 32])
    .join('')
  return `${code.slice(0, 3)}-${code.slice(3)}`
}

export function generateCredential() {
  const raw = randomBytes(16).toString('base64url')
  return {
    uri: `cma://v1/${raw}`,
    tokenHash: createHash('sha256').update(raw).digest('hex'),
    shortCode: generateShortCode(),
  }
}

export async function issueCard(
  db: Pick<pg.Pool, 'connect'>,
  personId: string,
  staffId: string,
  allowReplacement = true
) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      'SELECT id,member_code FROM people WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',
      [personId]
    )
    const person = result.rows[0] as
      | { id: string; member_code: string }
      | undefined
    if (!person) throw new Error('Person not found')
    if (!allowReplacement) {
      const existing = await client.query(
        "SELECT id FROM qr_cards WHERE person_id=$1 AND status='ACTIVE'",
        [personId]
      )
      if (existing.rows.length)
        throw new Error(
          'Supervisor approval required to replace an active card'
        )
    }
    const credential = generateCredential()
    await client.query(
      "UPDATE qr_cards SET status='REVOKED_SECURITY',revoked_at=now(),revoked_by_staff_id=$2 WHERE person_id=$1 AND status='ACTIVE'",
      [personId, staffId]
    )
    let cardId: string | undefined
    let issuedShortCode = credential.shortCode
    for (let attempt = 0; attempt < shortCodeAttempts; attempt++) {
      issuedShortCode =
        attempt === 0 ? credential.shortCode : generateShortCode()
      const inserted = await client.query(
        `INSERT INTO qr_cards(person_id,token_hash,short_code,issued_by_staff_id)
         VALUES($1,$2,$3,$4)
         ON CONFLICT (short_code) DO NOTHING
         RETURNING id`,
        [personId, credential.tokenHash, issuedShortCode, staffId]
      )
      if (inserted.rows.length) {
        cardId = (inserted.rows[0] as { id: string }).id
        break
      }
    }
    if (!cardId)
      throw new Error('Could not allocate a unique card short code')
    await client.query(
      "INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id) VALUES($1,'CARD_ISSUED','person',$2)",
      [staffId, personId]
    )
    await client.query('COMMIT')
    return {
      memberCode: person.member_code,
      shortCode: issuedShortCode,
      credential: credential.uri,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function revokeCard(
  db: Pick<pg.Pool, 'query'>,
  cardId: string,
  staffId: string
) {
  const result = await db.query(
    `WITH revoked AS (
    UPDATE qr_cards SET status='REVOKED_LOST',revoked_at=now(),revoked_by_staff_id=$2
    WHERE id=$1 AND status='ACTIVE' RETURNING id
  ) INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id)
    SELECT $2,'CARD_REVOKED','card',id FROM revoked RETURNING id`,
    [cardId, staffId]
  )
  if (!result.rows.length) throw new Error('Active card not found')
}

export async function listActiveCards(
  db: Pick<pg.Pool, 'query'>,
  search: string
) {
  const result = await db.query(
    `SELECT c.id,c.short_code,c.status,c.issued_at,p.id AS person_id,p.member_code,p.first_name,p.last_name
    FROM qr_cards c JOIN people p ON p.id=c.person_id
    WHERE c.status='ACTIVE' AND p.deleted_at IS NULL
      AND ($1 = '' OR p.full_name_normalized ILIKE '%' || lower($1) || '%' OR p.member_code ILIKE '%' || $1 || '%')
    ORDER BY c.issued_at DESC LIMIT 100`,
    [search.slice(0, 80)]
  )
  return result.rows
}
