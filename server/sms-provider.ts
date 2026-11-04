import { SmsError } from './sms.js'
import { deliveredValues, failedValues } from './sms-delivery-status.js'

type Fetcher = typeof fetch
export function smsConfigured() {
  return !!(process.env.BULKSMS_API_TOKEN && process.env.BULKSMS_SENDER_ID)
}

function providerConfig() {
  const token = process.env.BULKSMS_API_TOKEN
  const from = process.env.BULKSMS_SENDER_ID
  if (!token || !from) throw new SmsError('BulkSMSNigeria is not configured', 503)
  return { token, from }
}

export async function sendBulkSms(to: string, body: string, fetcher: Fetcher = fetch): Promise<{ id?: string }> {
  const { token, from } = providerConfig()
  if (!/^[1-9]\d{7,14}$/.test(to) || !body.trim() || body.length > 1530) throw new SmsError('Invalid message', 422)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetcher('https://www.bulksmsnigeria.com/api/v2/sms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ from, to, body }),
      signal: controller.signal,
    })
    const result = await response.json() as { status?: string; code?: string; data?: { message_id?: string } }
    if (!response.ok || result.status !== 'success') throw new SmsError('Provider rejected message', [400, 409, 422].includes(response.status) ? 422 : 503)
    return { id: result.data?.message_id }
  } finally { clearTimeout(timeout) }
}

export async function fetchDeliveryStatus(providerId: string, fetcher: Fetcher = fetch): Promise<string> {
  const { token } = providerConfig()
  if (!providerId.trim()) throw new SmsError('Invalid provider message', 422)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetcher(`https://www.bulksmsnigeria.com/api/v2/delivery-reports?message_id=${encodeURIComponent(providerId)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
    })
    const result = await response.json() as {
      status?: string
      data?: { reports?: { recipient?: string; delivery_status?: string }[] }
    }
    if (!response.ok || result.status !== 'success') throw new SmsError('Could not retrieve delivery report', 503)
    const statuses = (result.data?.reports ?? []).map((report) => report.delivery_status?.trim().toLowerCase() ?? '')
    if (statuses.length === 0) return 'sent awaiting status'
    if (statuses.every((status) => deliveredValues.has(status))) return statuses[0]
    // A message with any recipient still pending cannot be treated as failed.
    if (statuses.some((status) => !deliveredValues.has(status) && !failedValues.has(status))) return 'sent awaiting status'
    // Mixed delivered/failed recipients need review; resending the whole message would duplicate a delivery.
    if (!statuses.every((status) => failedValues.has(status))) return 'sent awaiting status'
    return statuses[0]
  } finally { clearTimeout(timeout) }
}
