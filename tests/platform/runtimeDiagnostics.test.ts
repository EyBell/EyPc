import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require_ = createRequire(import.meta.url)
const diagnosticsModule = require_(resolve(process.cwd(), 'preload/diagnostics.cjs')) as {
  createRuntimeDiagnostics(options: Record<string, unknown>): {
    record(input: Record<string, unknown>): any
    configure(input: Record<string, unknown>): any
    snapshot(): any
    clear(): any
  }
}

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('runtime diagnostics v3', () => {
  it('keeps exact operational evidence while structurally excluding conversation and command bodies', () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-runtime-diagnostics-'))
    roots.push(root)
    const diagnostics = diagnosticsModule.createRuntimeDiagnostics({
      fs: require_('node:fs'),
      path: require_('node:path'),
      directory: root,
      random: () => 0.5
    })
    const decision = diagnostics.record({
      level: 'info',
      scope: 'task-push',
      event: 'state-proposal',
      outcome: 'proposed',
      provider: 'claude',
      phase: 'completed',
      reason: 'native-unread-completion',
      evidence: 'native-unread',
      taskRef: 'local_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      details: {
        stateRevision: 42,
        sourcePath: '/Users/example/.claude/projects/project.jsonl',
        activeBranch: false,
        prompt: 'must never be persisted',
        commandArgs: ['must', 'never', 'be', 'persisted'],
        nested: { stdout: 'must never be persisted', terminalWatermark: 37 }
      }
    })
    expect(decision).toMatchObject({
      v: 3,
      provider: 'claude',
      phase: 'completed',
      reason: 'native-unread-completion',
      evidence: 'native-unread',
      taskRef: 'local_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      details: {
        stateRevision: 42,
        sourcePath: '/Users/example/.claude/projects/project.jsonl',
        activeBranch: false,
        nested: { terminalWatermark: 37 }
      }
    })
    const persisted = readdirSync(root).map((name) => readFileSync(join(root, name), 'utf8')).join('')
    expect(persisted).toContain('local_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(persisted).toContain('/Users/example/.claude/projects/project.jsonl')
    expect(persisted).not.toContain('must never be persisted')
  })

  it('applies error/info/debug thresholds and a persistent manual off switch', () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-runtime-diagnostics-'))
    roots.push(root)
    const diagnostics = diagnosticsModule.createRuntimeDiagnostics({
      fs: require_('node:fs'),
      path: require_('node:path'),
      directory: root,
      settings: { enabled: true, level: 'error' }
    })
    expect(readdirSync(root)).toHaveLength(0)
    expect(diagnostics.record({ level: 'info', scope: 'runtime-action', event: 'dispatch', outcome: 'handled' })).toBeNull()
    expect(diagnostics.record({ level: 'error', scope: 'runtime-action', event: 'dispatch', outcome: 'failed' })).toMatchObject({ level: 'error' })
    diagnostics.configure({ enabled: false, level: 'debug' })
    expect(diagnostics.snapshot()).toMatchObject({ status: 'disabled', settings: { enabled: false, level: 'debug' } })
    expect(diagnostics.record({ level: 'error', scope: 'runtime-action', event: 'dispatch', outcome: 'failed' })).toBeNull()
    diagnostics.configure({ enabled: true, level: 'debug' })
    expect(diagnostics.record({ level: 'debug', scope: 'state-storage', event: 'write', outcome: 'persisted' })).toMatchObject({ level: 'debug' })
    expect(diagnostics.snapshot().totals.filtered).toBe(3)
  })

  it('rejects calls without an explicit level and leaves a forced error breadcrumb', () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-runtime-diagnostics-'))
    roots.push(root)
    const diagnostics = diagnosticsModule.createRuntimeDiagnostics({
      fs: require_('node:fs'),
      path: require_('node:path'),
      directory: root,
      settings: { enabled: true, level: 'debug', userConfigured: false, defaultsRevision: 3 }
    })

    expect(diagnostics.record({ scope: 'task-kernel', event: 'implicit-level', outcome: 'should-not-write' })).toBeNull()
    expect(diagnostics.snapshot()).toMatchObject({
      totals: { events: 2, error: 1 },
      recent: [
        expect.objectContaining({ event: 'process-start', level: 'info' }),
        expect.objectContaining({
          scope: 'runtime-diagnostics',
          event: 'diagnostics-level-missing',
          outcome: 'rejected',
          code: 'level-required',
          errorCode: 'level-required',
          level: 'error'
        })
      ]
    })
    expect(JSON.stringify(diagnostics.snapshot().recent)).not.toContain('should-not-write')
  })

  it('rotates bounded JSONL files, removes expired files, and reports exact storage limits', () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-runtime-diagnostics-'))
    roots.push(root)
    const stalePath = join(root, 'runtime-1-1.jsonl')
    writeFileSync(stalePath, '{"stale":true}\n')
    utimesSync(stalePath, new Date(1), new Date(1))
    let now = Date.now()
    const diagnostics = diagnosticsModule.createRuntimeDiagnostics({
      fs: require_('node:fs'),
      path: require_('node:path'),
      directory: root,
      now: () => now++,
      random: () => 0.5,
      maxFileBytes: 900,
      maxTotalBytes: 2_700,
      retentionMs: 1_000
    })

    for (let index = 0; index < 12; index += 1) {
      diagnostics.record({
        level: 'info',
        scope: 'task-push', event: 'claude-state', outcome: 'accepted',
        durationMs: index === 0 ? 301 : 10 + index, count: index, cache: 'provider-direct',
        details: { generation: index, phase: index % 2 ? 'running' : 'completed' }
      })
    }

    const files = readdirSync(root).filter((name) => name.endsWith('.jsonl'))
    expect(files.length).toBeGreaterThan(1)
    expect(files.reduce((sum, name) => sum + statSync(join(root, name)).size, 0)).toBeLessThanOrEqual(2_700)
    expect(statSync(root).mode & 0o777).toBe(0o700)
    expect(files.every((name) => (statSync(join(root, name)).mode & 0o777) === 0o600)).toBe(true)
    expect(readdirSync(root)).not.toContain('runtime-1-1.jsonl')
    expect(diagnostics.snapshot()).toMatchObject({
      revision: 'eypc-runtime-diagnostics-v3',
      status: 'ok',
      settings: { enabled: true, level: 'debug' },
      totals: { events: 13, info: 13, slow: 1, writeFailures: 0 },
      storage: { maxFileBytes: 900, maxTotalBytes: 2_700, retentionDays: 0 }
    })
  })

  it('clears only diagnostics-owned JSONL files and starts a fresh file on the next event', () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-runtime-diagnostics-'))
    roots.push(root)
    const diagnostics = diagnosticsModule.createRuntimeDiagnostics({
      fs: require_('node:fs'),
      path: require_('node:path'),
      directory: root,
      now: (() => { let value = 100; return () => value++ })()
    })
    const foreignFile = join(root, 'keep.jsonl')
    writeFileSync(foreignFile, '{"owned":false}\n')
    expect(readdirSync(root).some((name) => /^runtime-[0-9]+-[0-9]+\.jsonl$/.test(name))).toBe(true)

    expect(diagnostics.clear()).toEqual({
      outcome: 'cleared',
      removedFiles: 1,
      failedFiles: 0,
      remainingFiles: 0,
      remainingBytes: 0
    })
    expect(existsSync(foreignFile)).toBe(true)
    expect(diagnostics.snapshot()).toMatchObject({
      activeFile: '',
      totals: { events: 0, filtered: 0, debug: 0, info: 0, error: 0, slow: 0, writeFailures: 0 },
      storage: { fileCount: 0, totalBytes: 0 },
      recent: []
    })

    diagnostics.record({ level: 'info', scope: 'runtime-diagnostics', event: 'after-clear', outcome: 'written' })
    expect(diagnostics.snapshot()).toMatchObject({
      totals: { events: 1 },
      storage: { fileCount: 1 }
    })
    expect(diagnostics.snapshot().activeFile).toMatch(/runtime-[0-9]+-[0-9]+\.jsonl$/)
  })
})
