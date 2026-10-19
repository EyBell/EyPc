import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const discoveryModule = require('../../preload/codex/subagent-discovery.cjs') as {
  CODEX_SUBAGENT_DISCOVERY_MAX_AGE_MS: number
  CODEX_SUBAGENT_DISCOVERY_LIMIT: number
  isInternalReviewThreadSource(value: unknown): boolean
  codexThreadSourceKind(value: unknown): 'guardian_review' | 'other' | 'unknown'
  createCodexSubagentDiscovery(dependencies?: Record<string, unknown>): {
    codexRecentRolloutThreadCandidates(input?: Record<string, unknown>): Array<{ threadId: string; mtimeMs: number }>
    codexDiscoverSubagentThreadRows(input?: Record<string, unknown>): Promise<Array<Record<string, unknown>>>
    codexObserveThreadRows(rows: unknown): string[]
    codexObserveThreadSourceKind(threadId: string, kind: unknown): boolean
    codexIsInternalReviewThread(threadId: string): boolean
    codexIsMachineRunThread(threadId: string): boolean
    codexResetSubagentDiscovery(): void
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
  it('uses exact machine parent lineage before inherited fork history and keeps ordinary cross-session forks isolated', () => {
    const { createCodexInventoryThreadTopology } = require('../../preload/codex/inventory-thread-topology.cjs')
    const ids = ['a', 'b', 'c', 'd'].map(prefix => `${prefix}7345678-1234-4234-8234-123456789abc`)
    const [rootId, childId, nestedId, ordinaryId] = ids
    const topology = createCodexInventoryThreadTopology({
      record: (value: unknown) => value && typeof value === 'object' ? value : {},
      validThreadId: (value: unknown) => typeof value === 'string' && VALID_THREAD_ID.test(value),
      nativeString: (value: unknown) => typeof value === 'string' ? value : ''
    }).codexInventoryThreadTopology([
      { id: rootId, sessionId: rootId, threadSource: 'user' },
      { id: childId, sessionId: childId, threadSource: 'subagent', parentThreadId: rootId, forkedFromId: rootId },
      { id: nestedId, sessionId: nestedId, threadSource: 'subagent', parentThreadId: childId },
      { id: ordinaryId, sessionId: ordinaryId, threadSource: 'user', parentThreadId: rootId, forkedFromId: rootId }
    ])
    expect(topology.relations.get(childId)).toBe(rootId)
    expect(topology.relations.get(nestedId)).toBe(rootId)
    expect(topology.depths.get(nestedId)).toBe(2)
    expect(topology.isolated.has(childId)).toBe(false)
    expect(topology.isolated.has(ordinaryId)).toBe(true)
  })

  it('discovers nested descendants before their parents and reuses verified metadata across root admission', async () => {
    const root = sessionsRoot()
    const now = 1_788_180_000_000
    const ids = ['a', 'b', 'c', 'd', 'e'].map(prefix => `${prefix}1345678-1234-4234-8234-123456789abc`)
    const [rootId, childId, nestedId, cycleA, cycleB] = ids
    const parents = new Map([[childId, rootId], [nestedId, childId], [cycleA, cycleB], [cycleB, cycleA]])
    // The newest rollout belongs to the grandchild, so a one-pass admission loses it.
    for (const [index, id] of [nestedId, childId, cycleA, cycleB].entries()) {
      writeRollout(root, '2026/08/31', `rollout-2026-08-31T15-38-40-${id}.jsonl`, now - index * 1_000)
    }
    let reads = 0
    const factory = discoveryModule.createCodexSubagentDiscovery({
      fs: require('node:fs'), path: require('node:path'),
      validThreadId: (value: unknown) => typeof value === 'string' && VALID_THREAD_ID.test(value),
      readThread: async (id: string) => {
        reads += 1
        return { thread: { id, parentThreadId: parents.get(id), threadSource: 'subagent' } }
      }
    })
    // Not yet in this inventory is not a permanent negative metadata result.
    expect(await factory.codexDiscoverSubagentThreadRows({ root, rows: [], nowMs: now })).toEqual([])
    for (let scan = 0; scan < 2; scan += 1) {
      const found = await factory.codexDiscoverSubagentThreadRows({ root, rows: [{ id: rootId }], nowMs: now })
      expect(found.map(row => row.id)).toEqual([childId, nestedId])
      expect(reads).toBe(4)
    }
    expect(await factory.codexDiscoverSubagentThreadRows({ root, rows: [], nowMs: now })).toEqual([])
  })

  it('survives a cache reset during another candidate read without losing the verified graph', async () => {
    const root = sessionsRoot()
    const now = 1_788_180_000_000
    const [rootId, childId, nestedId] = ['a', 'b', 'c'].map(prefix => `${prefix}8345678-1234-4234-8234-123456789abc`)
    writeRollout(root, '2026/08/31', `rollout-2026-08-31T15-38-40-${childId}.jsonl`, now - 1_000)
    let machineDuringRead = false
    const factory = discoveryModule.createCodexSubagentDiscovery({
      fs: require('node:fs'), path: require('node:path'),
      validThreadId: (value: unknown) => typeof value === 'string' && VALID_THREAD_ID.test(value),
      readThread: async (id: string) => {
        if (id === nestedId) {
          machineDuringRead = factory.codexIsMachineRunThread(childId)
          factory.codexResetSubagentDiscovery()
        }
        return { thread: { id, parentThreadId: id === childId ? rootId : childId, threadSource: 'subagent' } }
      }
    })
    const input = { root, rows: [{ id: rootId }], nowMs: now }
    expect((await factory.codexDiscoverSubagentThreadRows(input)).map(row => row.id)).toEqual([childId])
    writeRollout(root, '2026/08/31', `rollout-2026-08-31T15-38-40-${nestedId}.jsonl`, now - 2_000)
    expect((await factory.codexDiscoverSubagentThreadRows(input)).map(row => row.id)).toEqual([childId, nestedId])
    expect(machineDuringRead).toBe(true)
  })

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

  it('excludes only the exact native internal review source', () => {
    expect(discoveryModule.isInternalReviewThreadSource('guardian_review')).toBe(true)
    expect(discoveryModule.codexThreadSourceKind('guardian_review')).toBe('guardian_review')
    for (const value of ['subagent', 'vscode', 'cli', 'exec', 'appServer',
      { subAgent: { other: 'guardian' } }, { subAgent: 'review' },
      { subAgent: { spawn: { parentThreadId: 'a4345678-1234-4234-8234-123456789abc', depth: 1 } } }]) {
      expect(discoveryModule.isInternalReviewThreadSource(value)).toBe(false)
      expect(discoveryModule.codexThreadSourceKind(value)).toBe('other')
    }
    for (const value of [undefined, null, {}, [], true, 'unknown', 'other', 'GUARDIAN_REVIEW',
      ' guardian_review', { subAgent: {} }, { subAgent: { spawn: {} } },
      { subAgent: { other: 'guardian', spawn: {} } }]) {
      expect(discoveryModule.isInternalReviewThreadSource(value)).toBe(false)
      expect(discoveryModule.codexThreadSourceKind(value)).toBe('unknown')
    }
  })

  it('keeps exact source memory through unknown observations and clears it on a known ordinary source or reset', () => {
    const factory = discovery()
    const threadId = 'b4345678-1234-4234-8234-123456789abc'
    expect(factory.codexObserveThreadRows([{ id: threadId, threadSource: 'guardian_review' },
      { id: threadId, threadSource: 'guardian_review' }, { id: 'invalid', threadSource: 'guardian_review' }])).toEqual([threadId])
    expect(factory.codexIsInternalReviewThread(threadId.toUpperCase())).toBe(true)
    for (const threadSource of [undefined, null, {}, { subAgent: {} }, 'future-source']) {
      expect(factory.codexObserveThreadRows([{ id: threadId, threadSource }])).toEqual([])
      expect(factory.codexIsInternalReviewThread(threadId)).toBe(true)
    }
    factory.codexObserveThreadRows([{ id: threadId }])
    expect(factory.codexIsInternalReviewThread(threadId)).toBe(true)
    expect(factory.codexObserveThreadSourceKind(threadId, 'unknown')).toBe(true)
    expect(factory.codexObserveThreadSourceKind(threadId, 'not-a-kind')).toBe(true)
    factory.codexObserveThreadRows([{ id: threadId, threadSource: 'vscode' }])
    expect(factory.codexIsInternalReviewThread(threadId)).toBe(false)
    expect(factory.codexObserveThreadSourceKind(threadId, 'guardian_review')).toBe(true)
    expect(factory.codexObserveThreadSourceKind(threadId, 'other')).toBe(false)
    factory.codexObserveThreadSourceKind(threadId, 'guardian_review')
    factory.codexObserveThreadRows([{ id: threadId, threadSource: { subAgent: { other: 'guardian' } } }])
    expect(factory.codexIsInternalReviewThread(threadId)).toBe(false)
    factory.codexObserveThreadSourceKind(threadId, 'guardian_review')
    factory.codexResetSubagentDiscovery()
    expect(factory.codexIsInternalReviewThread(threadId)).toBe(false)
  })

  it('remembers exact read sources independently of parent admission and retains discovery cache behavior', async () => {
    const root = sessionsRoot()
    const now = 1_788_180_000_000
    const parentId = 'a5345678-1234-4234-8234-123456789abc'
    const linkedId = 'b5345678-1234-4234-8234-123456789abc'
    const unlinkedId = 'c5345678-1234-4234-8234-123456789abc'
    const mismatchedId = 'd5345678-1234-4234-8234-123456789abc'
    const wrongId = 'e5345678-1234-4234-8234-123456789abc'
    for (const threadId of [linkedId, unlinkedId, mismatchedId]) {
      writeRollout(root, '2026/08/31', `rollout-2026-08-31T15-38-40-${threadId}.jsonl`, now - 60_000)
    }
    let reads = 0
    const factory = discoveryModule.createCodexSubagentDiscovery({
      fs: require('node:fs'), path: require('node:path'),
      validThreadId: (value: unknown) => typeof value === 'string' && VALID_THREAD_ID.test(value),
      readThread: async (threadId: string) => {
        reads += 1
        return { thread: { id: threadId === mismatchedId ? wrongId : threadId,
          parentThreadId: threadId === linkedId ? parentId : '', threadSource: 'guardian_review' } }
      }
    })
    const input = { root, rows: [{ id: parentId }], nowMs: now }
    expect((await factory.codexDiscoverSubagentThreadRows(input)).map((row) => row.id)).toEqual([linkedId])
    expect(factory.codexIsInternalReviewThread(linkedId)).toBe(true)
    expect(factory.codexIsInternalReviewThread(unlinkedId)).toBe(true)
    expect(factory.codexIsInternalReviewThread(mismatchedId)).toBe(false)
    expect(factory.codexIsInternalReviewThread(wrongId)).toBe(false)
    expect((await factory.codexDiscoverSubagentThreadRows(input)).map((row) => row.id)).toEqual([linkedId])
    expect(reads).toBe(3)
    factory.codexResetSubagentDiscovery()
    expect(factory.codexIsInternalReviewThread(linkedId)).toBe(false)
    await factory.codexDiscoverSubagentThreadRows(input)
    expect(reads).toBe(6)
    expect(factory.codexIsInternalReviewThread(linkedId)).toBe(true)
  })
})
