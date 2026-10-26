import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('generates routes for each church operation', () => {
  const routes = readFileSync(new URL('./src/routeTree.gen.ts', import.meta.url), 'utf8')
  for (const path of ['/scan', '/desk', '/directory', '/services', '/cards', '/reports']) {
    expect(routes).toContain(`'${path}'`)
  }
  for (const demo of ['/clerk', '/tasks', '/users', '/apps', '/chats', '/sign-up']) {
    expect(routes).not.toContain(`'${demo}'`)
  }
})
