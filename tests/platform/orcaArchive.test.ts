import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const archiveModule = require_(resolve(process.cwd(), 'preload/orca/archive.cjs')) as {
  createArchiver: (dependencies: Record<string, unknown>) => { archiveTask: (paneKey: string) => Promise<Record<string, unknown>> }
}

const PANE = '2e625d72-50d4-473d-854d-e6faa62e4039:e971fc98-d84d-43c4-ae40-ef3877e16485'
const HANDLE = 'term_056d6ca9-312c-4a27-8025-9cffd5d01297'

describe('Orca terminal archive', () => {
  it('refuses a working session', async () => {
    const calls: string[][] = []
    const archiver = archiveModule.createArchiver({
      lookupSession: async () => ({ paneKey: PANE, handle: HANDLE, state: 'working' }),
      cli: { json: async (args: string[]) => { calls.push(args); return { ok: true } } }
    })
    const result = await archiver.archiveTask(PANE)
    expect(result.outcome).toBe('failed')
    expect(result.errorCode).toBe('live')
    expect(calls).toEqual([])
  })

  it('closes a completed pane and never uses --all or --tab', async () => {
    const calls: string[][] = []
    const archiver = archiveModule.createArchiver({
      lookupSession: async () => ({ paneKey: PANE, handle: HANDLE, state: 'done' }),
      cli: { json: async (args: string[]) => { calls.push(args); return { ok: true } } }
    })
    const result = await archiver.archiveTask(PANE)
    expect(result.outcome).toBe('archived')
    expect(calls).toEqual([['terminal', 'close', '--terminal', HANDLE]])
  })
})
