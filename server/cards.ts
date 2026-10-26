import { createHash, randomBytes } from 'node:crypto'
import QRCode from 'qrcode'
import sharp from 'sharp'
import PDFDocument from 'pdfkit'
import type pg from 'pg'

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function generateCredential() {
  const raw = randomBytes(16).toString('base64url')
  const code = [...randomBytes(6)].map((byte) => alphabet[byte % 32]).join('')
  return { uri: `cma://v1/${raw}`, tokenHash: createHash('sha256').update(raw).digest('hex'), shortCode: `${code.slice(0, 3)}-${code.slice(3)}` }
}

export async function renderCard(credential: ReturnType<typeof generateCredential>, memberCode: string) {
  if (!/^CM-\d{4,}$/.test(memberCode)) throw new Error('Invalid member code')
  const qr = await QRCode.toBuffer(credential.uri, { errorCorrectionLevel: 'H', margin: 2, width: 550 })
  const qrSvg = (await QRCode.toString(credential.uri, { type: 'svg', errorCorrectionLevel: 'H', margin: 2 }))
    .replace(/^<\?xml[^>]*\?>\s*/, '').replace('<svg ', '<svg width="550" height="550" ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="920" viewBox="0 0 720 920">
    <rect width="720" height="920" fill="#ffffff"/>
    <rect width="720" height="120" fill="#0c243a"/>
    <text x="45" y="74" fill="#fff" font-family="Arial" font-size="31" font-weight="bold">GRACE ARENA</text>
    <g transform="translate(85 165)">${qrSvg}</g>
    <text x="360" y="770" text-anchor="middle" fill="#0c243a" font-family="Arial" font-size="42" font-weight="bold">${memberCode}</text>
    <text x="360" y="830" text-anchor="middle" fill="#0c243a" font-family="Arial" font-size="34">${credential.shortCode}</text>
    <text x="360" y="878" text-anchor="middle" fill="#485f70" font-family="Arial" font-size="18">Present this card at check-in</text>
  </svg>`
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  const pdf = await new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ size: [288, 368], margin: 15 })
    const chunks: Buffer[] = []
    document.on('data', (data: Buffer) => chunks.push(data))
    document.on('end', () => resolve(Buffer.concat(chunks)))
    document.on('error', reject)
    document.rect(0, 0, 288, 52).fill('#0c243a')
    document.fontSize(17).fillColor('#ffffff').text('GRACE ARENA', 18, 18)
    document.image(qr, 23, 60, { width: 242 })
    document.fontSize(20).fillColor('#0c243a').text(memberCode, 0, 302, { width: 288, align: 'center' })
    document.fontSize(14).text(credential.shortCode, 0, 334, { width: 288, align: 'center' })
    document.end()
  })
  return { png, pdf }
}

export async function issueCard(db: Pick<pg.Pool, 'connect'>, personId: string, staffId: string, allowReplacement = true) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query('SELECT id,member_code FROM people WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [personId])
    const person = result.rows[0] as { id: string; member_code: string } | undefined
    if (!person) throw new Error('Person not found')
    if (!allowReplacement) {
      const existing = await client.query("SELECT id FROM qr_cards WHERE person_id=$1 AND status='ACTIVE'", [personId])
      if (existing.rows.length) throw new Error('Supervisor approval required to replace an active card')
    }
    const credential = generateCredential()
    const assets = await renderCard(credential, person.member_code)
    await client.query("UPDATE qr_cards SET status='REVOKED_SECURITY',revoked_at=now(),revoked_by_staff_id=$2 WHERE person_id=$1 AND status='ACTIVE'", [personId, staffId])
    await client.query('INSERT INTO qr_cards(person_id,token_hash,short_code,issued_by_staff_id) VALUES($1,$2,$3,$4)', [personId, credential.tokenHash, credential.shortCode, staffId])
    await client.query("INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id) VALUES($1,'CARD_ISSUED','person',$2)", [staffId, personId])
    await client.query('COMMIT')
    return { memberCode: person.member_code, shortCode: credential.shortCode, png: assets.png.toString('base64'), pdf: assets.pdf.toString('base64') }
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release() }
}

export async function revokeCard(db: Pick<pg.Pool, 'query'>, cardId: string, staffId: string) {
  const result = await db.query(`WITH revoked AS (
    UPDATE qr_cards SET status='REVOKED_LOST',revoked_at=now(),revoked_by_staff_id=$2
    WHERE id=$1 AND status='ACTIVE' RETURNING id
  ) INSERT INTO audit_logs(actor_staff_id,action_type,target_entity,target_id)
    SELECT $2,'CARD_REVOKED','card',id FROM revoked RETURNING id`, [cardId, staffId])
  if (!result.rows.length) throw new Error('Active card not found')
}

export async function listActiveCards(db: Pick<pg.Pool, 'query'>, search: string) {
  const result = await db.query(`SELECT c.id,c.short_code,c.status,c.issued_at,p.id AS person_id,p.member_code,p.first_name,p.last_name
    FROM qr_cards c JOIN people p ON p.id=c.person_id
    WHERE c.status='ACTIVE' AND p.deleted_at IS NULL
      AND ($1 = '' OR p.full_name_normalized ILIKE '%' || lower($1) || '%' OR p.member_code ILIKE '%' || $1 || '%')
    ORDER BY c.issued_at DESC LIMIT 100`, [search.slice(0, 80)])
  return result.rows
}
