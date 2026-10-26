// Use only against a disposable local server + disposable database with a fresh active card.
const base = process.env.CMAMS_LOAD_URL ?? ''
const serviceId = process.env.CMAMS_LOAD_SERVICE_ID ?? ''
const credential = process.env.CMAMS_LOAD_CARD ?? ''
const cookie = process.env.CMAMS_LOAD_COOKIE ?? ''
const url = new URL(base)
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^https?:$/.test(url.protocol) ||
    !/^[0-9a-f-]{36}$/i.test(serviceId) || !credential || !cookie) {
  throw new Error('Set local CMAMS_LOAD_URL, CMAMS_LOAD_SERVICE_ID, CMAMS_LOAD_CARD, and CMAMS_LOAD_COOKIE; remote targets are prohibited')
}

const count = 50
const started = performance.now()
const results = await Promise.all(Array.from({ length: count }, async () => {
  const response = await fetch(new URL(`/api/v1/services/${serviceId}/check-ins`, url), {
    method: 'POST', headers: { origin: url.origin, 'content-type': 'application/json', cookie },
    body: JSON.stringify({ credential, eventId: crypto.randomUUID() }),
  })
  if (!response.ok) throw new Error(`Load request failed with status ${response.status}`)
  return (await response.json() as { outcome: string }).outcome
}))
const successes = results.filter((outcome) => outcome === 'CHECKED_IN').length
const duplicates = results.filter((outcome) => outcome === 'ALREADY_CHECKED_IN').length
if (successes !== 1 || duplicates !== count - 1) throw new Error(`Unexpected check-in outcomes: ${successes} new, ${duplicates} duplicate`)
process.stdout.write(`50 concurrent arrivals: 1 check-in, 49 duplicates in ${Math.round(performance.now() - started)}ms.\n`)
export {}
