export function createScanLock() {
  const seen = new Map<string, number>()
  return {
    accept(value: string, now = Date.now()): boolean {
      const last = seen.get(value)
      if (last !== undefined && now - last < 3000) return false
      seen.set(value, now)
      if (seen.size > 500)
        for (const [key, time] of seen) if (now - time > 3000) seen.delete(key)
      return true
    },
  }
}
