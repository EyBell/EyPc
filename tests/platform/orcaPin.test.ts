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
function reply(args: string[], pinned: boolean) {
  return { ok: true, result: args[1] === 'pin'
    ? { pin: { handle: HANDLE, tabId: PANE.slice(0, 36), isPinned: pinned } }
    : { terminals: [{ handle: HANDLE, tabId: PANE.slice(0, 36), leafId: PANE.slice(37), isPinned: pinned, connected: true }] } }
}

describe('Orca tab pin', () => {
  it('writes terminal.pin --pinned for the session handle', async () => {
    const calls: string[][] = []
    const pinner = pinModule.createPinner({
      lookupSession: async () => ({ paneKey: PANE, handle: HANDLE }),
      cli: { json: async (args: string[]) => { calls.push(args); return reply(args, true) } }
    })
    const result = await pinner.setPin(PANE, { pinned: true })
    expect(result).toMatchObject({ outcome: 'completed', method: 'terminal.pin', providerPin: true })
    expect(calls).toEqual([['terminal', 'pin', '--terminal', HANDLE, '--pinned'], ['terminal', 'list']])
  })

  it('writes --no-pinned when clearing the tab pin', async () => {
    const calls: string[][] = []
    const pinner = pinModule.createPinner({
      lookupSession: async () => ({ paneKey: PANE, handle: HANDLE }),
      cli: { json: async (args: string[]) => { calls.push(args); return reply(args, false) } }
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

describe('Orca pin native readback', () => {
  it('does not write when lookup resolves a different pane', async () => {
    let called = false
    const pinner = pinModule.createPinner({
      lookupSession: async () => ({ paneKey: PANE.replace('2e625d72', '3e625d72'), handle: HANDLE }),
      cli: { json: async () => { called = true; return { ok: true } } }
    })
    expect(await pinner.setPin(PANE, { pinned: true })).toMatchObject({ outcome: 'failed', errorCode: 'stale-target' })
    expect(called).toBe(false)
  })
  it.each(['missing-receipt', 'wrong-tab', 'unchanged', 'missing-field', 'stale-handle', 'unavailable'])('fails closed for %s', async (fault) => {
    const pinner = pinModule.createPinner({
      lookupSession: async () => ({ paneKey: PANE, handle: HANDLE }),
      cli: { json: async (args: string[]) => {
        if (args[1] === 'pin') {
          if (fault === 'missing-receipt') return { ok: true }
          if (fault === 'wrong-tab') return { ok: true, result: { pin: { handle: HANDLE, tabId: 'other', isPinned: true } } }
          return reply(args, true)
        }
        if (fault === 'unavailable') return { ok: false }
        const row: Record<string, unknown> = { handle: HANDLE, tabId: PANE.slice(0,36), leafId: PANE.slice(37), isPinned: true }
        if (fault === 'unchanged') row.isPinned = false
        if (fault === 'missing-field') delete row.isPinned
        if (fault === 'stale-handle') row.handle = 'term_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        return { ok: true, result: { terminals: [row] } }
      } }
    })
    expect(await pinner.setPin(PANE, { pinned: true })).toMatchObject({ outcome: 'failed', errorCode: 'unverified' })
  })
})
