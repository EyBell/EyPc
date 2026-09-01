import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const discoveryModule = require('../../preload/codex/subagent-discovery.cjs') as {
  CODEX_SUBAGENT_DISCOVERY_MAX_AGE_MS: number
  CODEX_SUBAGENT_DISCOVERY_LIMIT: number
  createCodexSubagentDiscovery(dependencies?: Record<string, unknown>): {
    codexRecentRolloutThreadCandidates(input?: Record<string, unknown>): Array<{ threadId: string; mtimeMs: number }>
  }
}

const VALID_THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function discovery() {
  return discoveryModule.createCodexSubagentDiscovery({
    fs: require('node:fs'),
    path: require('node:path'),
    validThreadId: (value: unknown) => typeof value === 'string' && VALID_THREAD_ID.test(value)
  })
}

const roots: string[] = []

function sessionsRoot() {
  const root = mkdtempSync(join(tmpdir(), 'eypc-subagent-discovery-'))
  roots.push(root)
  return root
}

function writeRollout(root: string, day: string, basename: string, mtimeMs: number) {
  const directory = join(root, ...day.split('/'))
  mkdirSync(directory, { recursive: true })
  const file = join(directory, basename)
  writeFileSync(file, '{"type":"session_meta"}\n')
  utimesSync(file, mtimeMs / 1000, mtimeMs / 1000)
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('codex subagent rollout discovery', () => {
  it('returns only unknown, recent thread ids from rollout basenames, newest first', () => {
    const root = sessionsRoot()
    const now = 1_788_180_000_000
    const subagentId = 'a1345678-1234-4234-8234-123456789abc'
    const knownId = 'b1345678-1234-4234-8234-123456789abc'
    const staleId = 'c1345678-1234-4234-8234-123456789abc'
    const segmentedId = 'd1345678-1234-4234-8234-123456789abc'
    writeRollout(root, '2026/08/31', `rollout-2026-08-31T15-38-40-${subagentId}.jsonl`, now - 60_000)
    // A history-segment continuation keeps the thread id as the FIRST uuid.
    writeRollout(root, '2026/08/31', `rollout-2026-08-31T16-58-41-${segmentedId}_e1345678-1234-4234-8234-123456789abc.jsonl`, now - 30_000)
    writeRollout(root, '2026/08/31', `rollout-2026-08-31T10-00-00-${knownId}.jsonl`, now - 120_000)
    writeRollout(root, '2026/08/20', `rollout-2026-08-20T10-00-00-${staleId}.jsonl`,
      now - discoveryModule.CODEX_SUBAGENT_DISCOVERY_MAX_AGE_MS - 60_000)
    writeRollout(root, '2026/08/31', 'notes.txt', now - 1_000)

    const candidates = discovery().codexRecentRolloutThreadCandidates({
      root,
      knownIds: new Set([knownId]),
      nowMs: now
    })
    expect(candidates.map((candidate) => candidate.threadId)).toEqual([segmentedId, subagentId])
  })

  it('keeps the newest mtime per thread and honors the limit', () => {
    const root = sessionsRoot()
    const now = 1_788_180_000_000
    const repeatedId = 'a2345678-1234-4234-8234-123456789abc'
    writeRollout(root, '2026/08/30', `rollout-2026-08-30T10-00-00-${repeatedId}.jsonl`, now - 500_000)
    writeRollout(root, '2026/08/31', `rollout-2026-08-31T10-00-00-${repeatedId}_b2345678-1234-4234-8234-123456789abc.jsonl`, now - 1_000)
    const others = ['c2345678', 'd2345678', 'e2345678'].map((prefix, index) => {
      const threadId = `${prefix}-1234-4234-8234-123456789abc`
      writeRollout(root, '2026/08/31', `rollout-2026-08-31T11-00-0${index}-${threadId}.jsonl`, now - 10_000 * (index + 1))
      return threadId
    })

    const candidates = discovery().codexRecentRolloutThreadCandidates({ root, nowMs: now, limit: 2 })
    expect(candidates).toEqual([
      { threadId: repeatedId, mtimeMs: now - 1_000 },
      { threadId: others[0], mtimeMs: now - 10_000 }
    ])
  })

  it('classifies machine sub-run thread sources and remembers discovered runs', async () => {
    const machineChecks = discoveryModule as unknown as {
      isSubAgentThreadSource(value: unknown): boolean
    }
    expect(machineChecks.isSubAgentThreadSource('subagent')).toBe(true)
    expect(machineChecks.isSubAgentThreadSource('guardian_review')).toBe(true)
    expect(machineChecks.isSubAgentThreadSource({ subAgent: { other: 'guardian' } })).toBe(true)
    expect(machineChecks.isSubAgentThreadSource('vscode')).toBe(false)
    expect(machineChecks.isSubAgentThreadSource('user')).toBe(false)
    expect(machineChecks.isSubAgentThreadSource(undefined)).toBe(false)

    const root = sessionsRoot()
    const now = 1_788_180_000_000
    const rootId = 'a4345678-1234-4234-8234-123456789abc'
    const subagentId = 'b4345678-1234-4234-8234-123456789abc'
    writeRollout(root, '2026/08/31', `rollout-2026-08-31T15-38-40-${subagentId}.jsonl`, now - 60_000)
    const factory = discoveryModule.createCodexSubagentDiscovery({
      fs: require('node:fs'),
      path: require('node:path'),
      validThreadId: (value: unknown) => typeof value === 'string' && VALID_THREAD_ID.test(value),
      readThread: async (threadId: string) => ({
        thread: { id: threadId, parentThreadId: rootId, threadSource: 'subagent' }
      })
    }) as unknown as {
      codexDiscoverSubagentThreadRows(input: Record<string, unknown>): Promise<Array<Record<string, unknown>>>
      codexIsMachineRunThread(threadId: string): boolean
      codexResetSubagentDiscovery(): void
    }
    const rows = await factory.codexDiscoverSubagentThreadRows({
      root,
      rows: [{ id: rootId }],
      nowMs: now
    })
    expect(rows.map((row) => row.id)).toEqual([subagentId])
    expect(factory.codexIsMachineRunThread(subagentId)).toBe(true)
    expect(factory.codexIsMachineRunThread(rootId)).toBe(false)
    factory.codexResetSubagentDiscovery()
    expect(factory.codexIsMachineRunThread(subagentId)).toBe(false)
  })

  it('degrades to empty on a missing root instead of throwing', () => {
    expect(discovery().codexRecentRolloutThreadCandidates({ root: '/nonexistent/eypc-test', nowMs: Date.now() }))
      .toEqual([])
    expect(discovery().codexRecentRolloutThreadCandidates({ nowMs: Date.now() })).toEqual([])
  })
})
