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
      details: { failure: 'protocol-error', errorName: 'TypeError', phase, rpcCode: -32602 }
    })
    expect(JSON.stringify(events)).not.toContain('private server failure')
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
        launch: { source: 'manual', invalid: true, kind: 'shim', resolution: 'entry-missing' },
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
