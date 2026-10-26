/** Protects maintenance scripts from accidentally touching an unrelated Supabase project. */
export function assertChurchDatabase(connection: string, projectRef: string): void {
  const url = new URL(connection)
  const direct = url.hostname === `db.${projectRef}.supabase.co` && decodeURIComponent(url.username) === 'postgres'
  const pooler = /^aws-[\w-]+\.pooler\.supabase\.com$/.test(url.hostname) &&
    decodeURIComponent(url.username) === `postgres.${projectRef}`
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/postgres' || (!direct && !pooler)) {
    throw new Error('DATABASE_URL does not identify the approved church Supabase project')
  }
}
