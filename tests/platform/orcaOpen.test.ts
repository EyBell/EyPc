import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const openerModule = require_(resolve(process.cwd(), 'preload/orca/open.cjs')) as {
  createOpener: (dependencies: Record<string, unknown>) => { openTask: (paneKey: string, options?: { handle?: string }) => Promise<Record<string, unknown>> }
  normalizePaneKey: (value: unknown) => string
}

const PANE = '2e625d72-50d4-473d-854d-e6faa62e4039:e971fc98-d84d-43c4-ae40-ef3877e16485'
const HANDLE = 'term_056d6ca9-312c-4a27-8025-9cffd5d01297'
const ORCA_WINDOW = {
  id: 'w1',
  instanceId: 'darwin:1:2',
  platform: 'darwin',
  nativeRef: '1:0:2',
  appId: 'com.stablyai.orca',
  appName: 'Orca',
  pid: 1,
  title: 'EyPc',
  minimized: false,
  focused: false,
  relationship: 'root',
  canActivate: true,
  userVisible: true
}

function opener(options: {
  navigated?: boolean
  ok?: boolean
  handle?: string
  platform?: string
  windows?: unknown[]
  activateOutcome?: string
} = {}) {
  const calls: string[][] = []
  const launches: string[][] = []
  const activations: unknown[] = []
  const value = openerModule.createOpener({
    lookupHandle: async () => options.handle === undefined ? HANDLE : options.handle,
    platform: options.platform || 'darwin',
    windowsList: options.windows
      ? async () => ({ windows: options.windows })
      : undefined,
    windowsActivate: options.windows
      ? async (request: unknown) => {
          activations.push(request)
          return { outcome: options.activateOutcome || 'activated' }
        }
      : undefined,
    execFile: (file: string, args: string[], _opts: unknown, done: (error?: Error | null) => void) => {
      launches.push([file, ...args])
      done(null)
    },
    cli: {
      json: async (args: string[]) => {
        calls.push(args)
        return {
          ok: options.ok !== false,
          result: { focus: { navigated: options.navigated !== false, handle: HANDLE } }
        }
      }
    }
  })
  return { value, calls, launches, activations }
}

describe('Orca terminal opener', () => {
  it('only admits pane keys', () => {
    expect(openerModule.normalizePaneKey(PANE.toUpperCase())).toBe(PANE)
    expect(openerModule.normalizePaneKey('term_abc')).toBe('')
  })

  it('switches the tab then activates the Orca window like a Codex jump', async () => {
    const context = opener({ windows: [ORCA_WINDOW] })
    const result = await context.value.openTask(PANE)
    expect(result).toMatchObject({ outcome: 'dispatched', confirmsRead: false })
    expect(context.calls).toEqual([['terminal', 'switch', '--terminal', HANDLE]])
    expect(context.activations).toEqual([{ mode: 'root-current', root: ORCA_WINDOW }])
    expect(context.launches).toEqual([])
  })

  it('falls back to osascript activate when no Orca window is listed', async () => {
    const context = opener()
    await context.value.openTask(PANE)
    expect(context.launches[0]).toEqual(['osascript', '-e', 'tell application id "com.stablyai.orca" to activate'])
  })

  it('does not raise Orca when the switch never runs', async () => {
    const context = opener({ handle: '', windows: [ORCA_WINDOW] })
    await context.value.openTask(PANE)
    expect(context.activations).toEqual([])
    expect(context.launches).toEqual([])
  })

  it('refuses a missing handle without dispatching', async () => {
    const context = opener({ handle: '' })
    const result = await context.value.openTask(PANE)
    expect(result.outcome).toBe('unavailable')
    expect(context.calls).toEqual([])
  })
})
