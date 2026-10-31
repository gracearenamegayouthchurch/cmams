/**
 * Normalizes Nigerian numbers to international format.
 * The provider accepts malformed numbers but cannot route them, so remove the
 * local trunk zero after the +234 country code before saving or sending.
 */
export function normalizePhone(input: string): string {
  let digits = input.trim().replace(/[\s\-().]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('2340') && digits.length === 14) digits = `234${digits.slice(4)}`
  else if (digits.startsWith('0') && digits.length === 11) digits = `234${digits.slice(1)}`
  return `+${digits}`
}
