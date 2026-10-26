import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { Writable } from 'node:stream'
import { getDb } from '../server/db'
import { createFirstAdmin } from '../server/bootstrap'

try { process.loadEnvFile('.env.local') } catch { /* optional local env file */ }

async function promptHidden(label: string): Promise<string> {
  let muted = false
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) stdout.write(chunk, encoding)
      callback()
    },
  })
  const rl = createInterface({ input: stdin, output, terminal: true })
  try {
    stdout.write(label)
    muted = true
    const value = await rl.question('')
    stdout.write('\n')
    return value
  } finally {
    rl.close()
  }
}

const [email, fullName] = process.argv.slice(2)
if (!email || !fullName || !stdin.isTTY) {
  process.stderr.write('Usage: pnpm bootstrap-admin admin@example.com "Full Name" (run in an interactive terminal)\n')
  process.exitCode = 1
} else {
  const password = await promptHidden('First admin password (minimum 12 characters): ')
  try {
    await createFirstAdmin(getDb(), email, fullName, password)
    process.stdout.write('First administrator created.\n')
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Could not create administrator'}\n`)
    process.exitCode = 1
  } finally {
    await getDb().end()
  }
}
