import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const cli = require_(resolve(process.cwd(), 'preload/orca/cli.cjs')) as {
  resolveOrcaExecutable: (dependencies?: Record<string, unknown>) => string
  LINUX_SCREEN_READER: string
}

describe('Orca CLI resolution', () => {
  it('prefers ORCA_CLI_COMMAND', () => {
    expect(cli.resolveOrcaExecutable({
      env: { ORCA_CLI_COMMAND: '/opt/orca/bin/orca' },
      platform: 'linux'
    })).toBe('/opt/orca/bin/orca')
  })

  it('never falls through to the Linux screen reader', () => {
    expect(cli.resolveOrcaExecutable({
      platform: 'linux',
      which: () => cli.LINUX_SCREEN_READER,
      fs: { existsSync: () => false }
    })).toBe('')
  })
})
