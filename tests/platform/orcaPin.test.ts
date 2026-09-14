import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const pinModule = require_(resolve(process.cwd(), 'preload/orca/pin.cjs')) as {
  createPinner: (dependencies: Record<string, unknown>) => {
    setPin: (paneKey: string, request?: { pinned?: boolean }) => Promise<Record<string, unknown>>
  }
}

const PANE = '2e625d72-50d4-473d-854d-e6faa62e4039:e971fc98-d84d-43c4-ae40-ef3877e16485'
const HANDLE = 'term_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('Orca tab pin', () => {
  it('writes terminal.pin --pinned for the session handle', async () => {
    const calls: string[][] = []
    const pinner = pinModule.createPinner({
      lookupSession: async () => ({ paneKey: PANE, handle: HANDLE }),
      cli: { json: async (args: string[]) => { calls.push(args); return { ok: true } } }
    })
    const result = await pinner.setPin(PANE, { pinned: true })
    expect(result).toMatchObject({ outcome: 'completed', method: 'terminal.pin', providerPin: true })
    expect(calls).toEqual([['terminal', 'pin', '--terminal', HANDLE, '--pinned']])
  })

  it('writes --no-pinned when clearing the tab pin', async () => {
    const calls: string[][] = []
    const pinner = pinModule.createPinner({
      lookupSession: async () => ({ paneKey: PANE, handle: HANDLE }),
      cli: { json: async (args: string[]) => { calls.push(args); return { ok: true } } }
    })
    const result = await pinner.setPin(PANE, { pinned: false })
    expect(result).toMatchObject({ outcome: 'completed', providerPin: false })
    expect(calls[0]?.at(-1)).toBe('--no-pinned')
  })

  it('refuses a session without a terminal handle', async () => {
    const pinner = pinModule.createPinner({
      lookupSession: async () => ({ paneKey: PANE, worktreeId: 'repo::/tmp/EyPc' }),
      cli: { json: async () => ({ ok: true }) }
    })
    const result = await pinner.setPin(PANE, { pinned: true })
    expect(result).toMatchObject({ outcome: 'failed', errorCode: 'unsupported' })
  })
})
