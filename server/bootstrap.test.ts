import { expect, it, vi } from 'vitest'
import { createFirstAdmin } from './bootstrap.js'

it('refuses to overwrite an existing administrator', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ count: '1' }] })
  await expect(createFirstAdmin({ query }, 'pastor@example.com', 'Pastor', 'long secret password')).rejects.toThrow('already exists')
  expect(query).toHaveBeenCalledTimes(1)
})
