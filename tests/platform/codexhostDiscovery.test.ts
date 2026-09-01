import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const discoveryModule = require('../../preload/codex/codexhost-discovery.cjs') as {
  CODEXHOST_LIST_TTL_MS: number
  codexhostHarnessLabel(value: unknown): string
  createCodexhostDiscovery(dependencies?: Record<string, unknown>): {
    codexhostRowsForScan(input?: Record<string, unknown>): Promise<{
      rows: Array<Record<string, any>>
      turns: Map<string, Record<string, any>>
    }>
    isExternalThreadId(threadId: string): boolean
    isExternalThreadKey(key: string): boolean
    codexhostResetDiscovery(): void
  }
}

const RUNTIME_PID = 29660
const CHILD_PID = 29678
const ENDPOINT = 'http://127.0.0.1:58874'
const TOKEN = 'c0'.repeat(32)
const CLI = '/Users/tester/.local/bin/codexhost'
const PI_ID = '97417b4a-2d81-4234-9f9b-4ff799a01f9f'
const CLAUDE_ID = 'a81b5e79-bc0d-4cad-b408-51ae1a884243'
const NATIVE_ID = '01a052cb-77fa-7fd3-8acd-cb7e45f659ee'

function processTable() {
  return [
    `29444 /opt/codex-host/target/debug/codexhost launch --shim x --host-runtime /opt/codex-host/packages/host-runtime/dist/main.js`,
    `29445 /usr/bin/open -n --env CODEXHOST_HOST_RUNTIME_PATH=/opt/codex-host/packages/host-runtime/dist/main.js /Applications/ChatGPT.app`,
    `${RUNTIME_PID} /opt/node/bin/node /opt/codex-host/packages/host-runtime/dist/main.js -c features.x=1 app-server --analytics-default-enabled`
  ].join('\n')
}

function listPayload() {
  return JSON.stringify({
    threads: [
      { threadId: CLAUDE_ID, harnessId: 'claude-code', status: 'running', cwd: '/repo/gonavi', title: '260901-供应商调优' },
      { threadId: PI_ID, harnessId: 'pi', status: 'completed', cwd: '/repo/gonavi', title: '你好' },
      { threadId: NATIVE_ID, harnessId: 'codex', status: 'completed', cwd: '/repo/gonavi', title: '原生任务' },
      { threadId: 'not-a-thread-id', harnessId: 'pi', status: 'completed', cwd: '/repo/gonavi', title: 'x' }
    ],
    nextCursor: null
  })
}

function fakeExecFile(calls: Array<{ command: string; args: string[] }>, options: { failList?: boolean } = {}) {
  return (command: string, args: string[], _settings: unknown, done: (error: Error | null, stdout?: string) => void) => {
    calls.push({ command, args })
    if (command === 'ps' && args[0] === '-axww') return done(null, processTable())
    if (command === 'pgrep') return done(null, `${CHILD_PID}\n`)
    if (command === 'ps' && args[0] === 'eww') {
      return done(null, `${CHILD_PID} node adapter CODEXHOST_RUNTIME_ENDPOINT=${ENDPOINT} CODEXHOST_RUNTIME_TOKEN=${TOKEN} CODEXHOST_CLI_PATH=${CLI}`)
    }
    if (command === CLI) {
      if (options.failList) return done(null, JSON.stringify({ error: { code: 'RUNTIME_UNREACHABLE', message: 'x' } }))
      return done(null, listPayload())
    }
    return done(new Error('unexpected command'))
  }
}

describe('codexhost external conversation discovery', () => {
  it('labels harnesses for display', () => {
    expect(discoveryModule.codexhostHarnessLabel('pi')).toBe('Pi')
    expect(discoveryModule.codexhostHarnessLabel('claude-code')).toBe('Claude Code')
    expect(discoveryModule.codexhostHarnessLabel('mystery')).toBe('mystery')
  })

  it('discovers the rendezvous from runtime children and shapes external rows with synthetic turns', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    let clock = 1_000_000
    const discovery = discoveryModule.createCodexhostDiscovery({
      execFile: fakeExecFile(calls),
      now: () => clock
    })
    const result = await discovery.codexhostRowsForScan({
      roots: ['/repo/gonavi'],
      threadKey: (threadId: string) => `key:${threadId}`
    })

    // Native codex threads and invalid ids are excluded; harness rows remain.
    expect(result.rows.map((row) => row.id).sort()).toEqual([NATIVE_ID < PI_ID ? PI_ID : PI_ID, CLAUDE_ID].sort())
    const claudeRow = result.rows.find((row) => row.id === CLAUDE_ID)!
    expect(claudeRow).toMatchObject({
      name: 'Claude Code · 260901-供应商调优',
      status: { type: 'active' },
      cwd: '/repo/gonavi',
      codexhostExternal: true,
      codexhostHarnessId: 'claude-code'
    })
    expect(result.turns.get(CLAUDE_ID)).toMatchObject({ status: 'inProgress' })
    expect(result.turns.get(PI_ID)).toMatchObject({ status: 'completed' })
    expect(result.turns.get(PI_ID)!.completedAt).toBeGreaterThan(0)
    expect(discovery.isExternalThreadId(PI_ID)).toBe(true)
    expect(discovery.isExternalThreadId(NATIVE_ID)).toBe(false)
    expect(discovery.isExternalThreadKey(`key:${PI_ID}`)).toBe(true)

    // Inside the TTL a second scan serves the snapshot without new exec work.
    const callCount = calls.length
    clock += 1_000
    await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
    expect(calls.length).toBe(callCount)

    discovery.codexhostResetDiscovery()
    expect(discovery.isExternalThreadId(PI_ID)).toBe(false)
  })

  it('fails open when the CLI answers with an error and drops the rendezvous', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const discovery = discoveryModule.createCodexhostDiscovery({
      execFile: fakeExecFile(calls, { failList: true }),
      now: () => 5_000_000
    })
    const result = await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
    expect(result.rows).toEqual([])
    expect(result.turns.size).toBe(0)
  })

  it('fails open with no runtime process at all', async () => {
    const discovery = discoveryModule.createCodexhostDiscovery({
      execFile: (_c: string, _a: string[], _s: unknown, done: (e: Error | null, out?: string) => void) => done(null, ''),
      now: () => 5_000_000
    })
    const result = await discovery.codexhostRowsForScan({ roots: ['/repo/gonavi'] })
    expect(result.rows).toEqual([])
  })
})
