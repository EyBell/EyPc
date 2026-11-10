import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createCodexRuntimeDiagnostics } = require('../../preload/codex/runtime-diagnostics.cjs')
const { createRuntimeDiagnostics } = require('../../preload/diagnostics.cjs')
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function fixture(overrides: Record<string, unknown> = {}) {
  const events: any[] = []
  const diagnostics = createCodexRuntimeDiagnostics({
    process: { platform: 'win32' },
    runtimeDiagnostics: { record: (event: unknown) => events.push(event) },
    startCodexServer: async () => true,
    sendCodexRpc: async () => ({}),
    ...overrides
  })
  return { diagnostics, events }
}

describe('Codex runtime failure diagnostics', () => {
  it.each([
    ['local-state', 'pinned-project-ids', 'backup', 'invalid-data'],
    ['app-server', '', '', 'request-failed'],
    ['task-projection', '', '', 'projection-failed']
  ])('preserves safe %s context through snapshot errors and preflight reads', (stage, field, source, category) => {
    const { diagnostics, events } = fixture()
    const failure = Object.assign(new TypeError('private text C:\\private\\state.json'), { code: 'protocol-error' })
    diagnostics.captureFailure(failure, { stage, field, source, category, raw: 'private payload' })
    const snapshot = diagnostics.snapshotFailure(failure)
    expect(snapshot).toMatchObject({
      ok: false, error: { code: 'protocol-error', diagnostic: { stage, category, ...(field ? { field } : {}), ...(source ? { source } : {}) } }
    })
    expect(diagnostics.preflightRead(snapshot)).toMatchObject({
      provider: 'codex', status: 'unavailable', errorCode: 'codex-task-preflight-failed',
      diagnostic: snapshot.error.diagnostic
    })
    expect(events[0]).toMatchObject({ event: 'codex-snapshot-read', outcome: 'failed', details: { diagnostic: snapshot.error.diagnostic } })
    expect(JSON.stringify([snapshot, events])).not.toContain('private')
    if (stage === 'local-state') expect(snapshot.error.message).toContain('本地状态')
    if (stage === 'task-projection') expect(snapshot.error.message).toContain('任务投影')
  })

  it('keeps the original local field and source through enclosing projection contexts', () => {
    const { diagnostics } = fixture()
    const failure = Object.assign(new Error('private'), {
      code: 'protocol-error', codexDiagnostic: { stage: 'local-state', field: 'pinned-thread-ids', category: 'invalid-data' }
    })
    diagnostics.captureFailure(failure, { stage: 'local-state', source: 'primary', category: 'read-failed' })
    diagnostics.captureFailure(failure, { stage: 'task-projection', category: 'projection-failed' })
    expect(diagnostics.errorResult(failure).error.diagnostic).toEqual({
      stage: 'local-state', field: 'pinned-thread-ids', source: 'primary', category: 'invalid-data'
    })
  })

  it('filters untrusted diagnostic properties and keeps a failed read distinct from healthy zero tasks', () => {
    const { diagnostics, events } = fixture()
    const privateValue = 'C:\\private\\state.json --secret'
    const failedRead = diagnostics.preflightRead({ ok: false, error: { code: 'protocol-error', codexDiagnostic: privateValue,
      diagnostic: { stage: 'local-state', field: privateValue, source: privateValue, category: privateValue, payload: privateValue } } })
    diagnostics.coldPreflight({
      startedAt: Date.now(), providers: { codex: true }, rows: [failedRead], taskCount: 0,
      providerHealth: { codex: { status: 'unavailable', generation: 0 } }, sourceGenerations: { codex: 0 }, sourceLaneGenerations: { codex: { interaction: 0 } }
    })
    expect(events[0]).toMatchObject({ outcome: 'failed', details: {
      taskCount: 0, providerResults: { codex: { health: 'unavailable', projection: 'not-run', empty: 'not-evaluated' } }
    } })
    expect(JSON.stringify(events)).not.toContain(privateValue)
    diagnostics.coldPreflight({
      startedAt: Date.now(), providers: { codex: true }, rows: [{ provider: 'codex', status: 'ready', projection: 'completed', taskCount: 0 }],
      taskCount: 0, providerHealth: { codex: { status: 'ready', generation: 5 } }, sourceGenerations: { codex: 5 }, sourceLaneGenerations: { codex: { interaction: 5 } }
    })
    expect(events[1]).toMatchObject({ outcome: 'accepted', details: {
      providerResults: { codex: { health: 'ready', projection: 'completed', empty: 'healthy-empty' } }
    } })
  })

  it('reports partial-source health and projection failure without accepting a partial draft', () => {
    const { diagnostics, events } = fixture()
    const input = {
      startedAt: Date.now(), providers: { codex: true, claude: true }, taskCount: 1,
      rows: [{ provider: 'codex', status: 'ready', projection: 'completed', taskCount: 1 },
        { provider: 'claude', status: 'unavailable' }],
      providerHealth: { codex: { status: 'ready', generation: 3 }, claude: { status: 'unavailable', generation: 0 } },
      sourceGenerations: { codex: 3, claude: 0 }, sourceLaneGenerations: { codex: { interaction: 3 }, claude: { interaction: 0 } }
    }
    diagnostics.coldPreflight(input)
    expect(events[0]).toMatchObject({ outcome: 'degraded', details: { providerResults: {
      codex: { health: 'ready', projection: 'completed', empty: 'nonempty' },
      claude: { health: 'unavailable', projection: 'not-run', empty: 'not-evaluated' }
    } } })
    diagnostics.coldPreflight({ ...input, rows: [{ provider: 'codex', status: 'ready', projection: 'failed' }] },
      Object.assign(new Error('private projection data'), { code: 'protocol-error' }))
    expect(events[1]).toMatchObject({ outcome: 'failed', details: { diagnostic: { stage: 'task-projection' },
      providerResults: { codex: { projection: 'failed', empty: 'not-evaluated' } } } })
    expect(JSON.stringify(events)).not.toContain('private')
  })

  it.each(['timeout', 'not-authenticated', 'runtime-unavailable', 'process-exited', 'protocol-error', 'unavailable'])('preserves the public %s error classification', (code) => {
    const { diagnostics } = fixture()
    expect(diagnostics.errorResult({ code })).toMatchObject({ ok: false, error: { code }, receivedAt: expect.any(Number) })
    expect(diagnostics.errorResult({ code: 'ETIMEDOUT' }).error.code).toBe('timeout')
  })

  it.each(['startup', 'thread-list'])('keeps the %s stage on inventory failure', async (phase) => {
    const failure = Object.assign(new TypeError('private server failure'), { code: 'protocol-error', rpcCode: -32602 })
    const reject = async () => { throw failure }
    const { diagnostics, events } = fixture(phase === 'startup' ? { startCodexServer: reject } : { sendCodexRpc: reject })
    await expect(diagnostics.request('thread/list', {}, 100)).rejects.toMatchObject({ diagnosticPhase: phase })
    diagnostics.inventoryFailure(failure, 'plugin-enter', true)
    expect(events[0]).toMatchObject({
      event: 'codex-inventory-membership', outcome: 'failed',
      details: { failure: 'protocol-error', errorName: 'TypeError', phase, rpcCode: -32602,
        diagnostic: { stage: 'app-server', category: 'request-failed' } }
    })
    expect(JSON.stringify(events)).not.toContain('private server failure')
  })

  it('attributes a failed non-list RPC to App Server without claiming a missing CLI', async () => {
    const failure = new Error('private config response')
    const { diagnostics } = fixture({ sendCodexRpc: async () => { throw failure } })
    await expect(diagnostics.request('config/read', {}, 100)).rejects.toBe(failure)
    const result = diagnostics.snapshotFailure(failure)
    expect(result.error).toEqual({
      code: 'unavailable', message: 'Codex App Server 请求失败',
      diagnostic: { stage: 'app-server', category: 'request-failed' }
    })
  })

  it('persists the safe launch summary and process exit without raw errors or paths', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eypc-codex-diagnostics-'))
    roots.push(directory)
    const sink = createRuntimeDiagnostics({ fs, path, directory })
    const { diagnostics } = fixture({ runtimeDiagnostics: sink })
    const failure = Object.assign(new ReferenceError('private server failure'), { code: 'runtime-unavailable' })
    diagnostics.captureLaunch(failure, {
      command: 'private executable', source: 'manual', launchMode: 'manual', invalid: true,
      manualLaunchPathState: 'invalid', launchCandidates: [{ source: 'manual', state: 'unusable', path: 'private path' }],
      launchDiagnostic: { kind: 'shim', resolution: 'entry-missing' },
      desktopSearch: { state: 'failed', packages: 0, nativeCode: 'EACCES', path: 'private path' },
      launchSearch: [{ source: 'manual', checked: 1, nonExecutable: 1, unusable: 1, path: 'private path' }]
    })
    diagnostics.inventoryFailure(failure, 'plugin-enter', true)
    diagnostics.processEnd({ code: 'ENOENT', exitCode: 127 }, failure, 'node-not-found')
    await sink.flush()
    const persisted = fs.readFileSync(sink.snapshot().activeFile, 'utf8')
    const events = persisted.trim().split('\n').map((line) => JSON.parse(line))
    expect(events.find((event) => event.event === 'codex-inventory-membership')).toMatchObject({
      details: {
        failure: 'runtime-unavailable', errorName: 'ReferenceError',
        launch: { source: 'manual', invalid: true, kind: 'shim', resolution: 'entry-missing',
          desktop: { state: 'failed', packages: 0, nativeCode: 'EACCES' } },
        search: [{ source: 'manual', checked: 1, nonExecutable: 1, unusable: 1 }]
      }
    })
    expect(events.find((event) => event.event === 'codex-process-end')).toMatchObject({
      details: { nativeCode: 'ENOENT', exitCode: 127, startupHint: 'node-not-found' }
    })
    expect(persisted).not.toContain('private server failure')
    expect(persisted).not.toContain('private executable')
    expect(persisted).not.toContain('private path')
  })

  it('keeps host runtime evidence distinct from an external Node requirement', () => {
    const { diagnostics, events } = fixture({
      process: { platform: 'win32', versions: { node: '22.21.1', electron: 'private/runtime/path' } }
    })
    diagnostics.startup({ detected: false }, 'failed', { code: 'runtime-unavailable' })
    expect(events[0]).toMatchObject({ event: 'codex-startup', outcome: 'failed',
      details: { phase: 'startup', failure: 'runtime-unavailable', host: { platform: 'win32', node: '22.21.1', electron: '' } } })
    expect(diagnostics.errorResult({ code: 'runtime-unavailable' }).error.message).not.toContain('Node')
    expect(JSON.stringify(events)).not.toContain('private')
  })

  it('reports an unknown plan instead of resolving again when no failed-attempt snapshot exists', () => {
    const resolveCodexLaunchPlan = vi.fn(() => { throw new Error('must not scan') })
    const { diagnostics, events } = fixture({ resolveCodexLaunchPlan })
    diagnostics.inventoryFailure({ code: 'runtime-unavailable' }, 'plugin-enter', false)
    expect(resolveCodexLaunchPlan).not.toHaveBeenCalled()
    expect(events[0].details).toMatchObject({ launch: null, search: [] })
  })

  it('keeps independent snapshots through interleaved failures and later plan mutation', () => {
    const { diagnostics, events } = fixture()
    const first = { code: 'runtime-unavailable' }
    const second = { code: 'protocol-error' }
    const plan = {
      source: 'configured', detected: false, launchMode: 'automatic',
      launchCandidates: [{ source: 'configured', state: 'unusable' }],
      launchDiagnostic: { kind: 'javascript', resolution: 'node-missing' },
      launchSearch: [{ source: 'configured', checked: 1, unusable: 1 }]
    }
    diagnostics.captureLaunch(first, plan)
    plan.source = 'path'
    plan.launchCandidates[0]!.source = 'path'
    plan.launchSearch[0]!.checked = 99
    diagnostics.captureLaunch(second, plan)
    diagnostics.captureLaunch(first, plan)
    diagnostics.inventoryFailure(second, 'plugin-enter', true)
    diagnostics.inventoryFailure(first, 'stat-recovery', false)
    expect(events[0].details.launch.source).toBe('path')
    expect(events[1].details).toMatchObject({
      launch: { source: 'configured', candidates: [{ source: 'configured' }] },
      search: [{ source: 'configured', checked: 1 }]
    })
  })

  it('filters all diagnostic enums and counters before persistence', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eypc-codex-diagnostics-'))
    roots.push(directory)
    const sink = createRuntimeDiagnostics({ fs, path, directory })
    const { diagnostics } = fixture({ runtimeDiagnostics: sink })
    const failure = { code: 'runtime-unavailable' }
    const privateValue = 'C:\\private\\sensitive.exe --private-text'
    diagnostics.captureLaunch(failure, {
      source: privateValue, launchMode: privateValue, manualLaunchPathState: privateValue,
      launchDiagnostic: { kind: privateValue, resolution: privateValue, nativeCode: privateValue },
      launchCandidates: [{ source: privateValue, state: privateValue }],
      launchSearch: [{ source: privateValue, checked: privateValue, failed: -1, missing: Infinity, nativeCode: privateValue }]
    })
    diagnostics.inventoryFailure(failure, 'plugin-enter', false)
    await sink.flush()
    const persisted = fs.readFileSync(sink.snapshot().activeFile, 'utf8')
    expect(persisted).not.toContain(privateValue)
    const event = persisted.trim().split('\n').map((line) => JSON.parse(line))
      .find((entry) => entry.event === 'codex-inventory-membership')
    expect(event.details).toMatchObject({
      launch: { source: 'unknown', mode: 'unknown', kind: 'unknown', resolution: 'unknown' },
      search: [{ source: 'unknown', checked: 0, failed: 0, missing: 0 }]
    })
  })
})
