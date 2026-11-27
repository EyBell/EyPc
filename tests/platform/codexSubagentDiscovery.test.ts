import { mkdirSync, mkdtempSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

type SpawnPair = [string, string]
type SpawnObservation = { childId: string; parentId: string; status: string; previousStatus?: string; reason?: string; readGeneration: number }
type SpawnReceipt = {
  outcome: string
  readGeneration: number
  databaseGeneration: number
  remaining: number
  coverage: { requestedCount: number; coveredCount: number; complete: boolean }
  edges: SpawnObservation[]
  retainedEdges: SpawnObservation[]
}

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
    codexReadSpawnEdges(directory: string, pairs: SpawnPair[], options: {
      targeted?: boolean; priorityPairs?: SpawnPair[]; isCurrent?: () => boolean
    }): Promise<SpawnReceipt>
    codexResetSubagentDiscovery(options?: { preserveIdentities: boolean }): void
  }
}

const VALID_THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function discovery(dependencies: Record<string, unknown> = {}) {
  return discoveryModule.createCodexSubagentDiscovery({
    fs: require('node:fs'),
    path: require('node:path'),
    validThreadId: (value: unknown) => typeof value === 'string' && VALID_THREAD_ID.test(value),
    ...dependencies
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

describe('native spawn edge coverage', () => {
  function edgeId(index: number) {
    return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
  }

  function fixture(count: number, dependencies: Record<string, unknown> = {}) {
    const directory = sessionsRoot()
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
    const database = new DatabaseSync(join(directory, 'state_5.sqlite'))
    database.exec(`CREATE TABLE threads(id TEXT PRIMARY KEY, thread_source TEXT, archived INTEGER);
      CREATE TABLE thread_spawn_edges(child_thread_id TEXT, parent_thread_id TEXT, status TEXT, PRIMARY KEY(child_thread_id, parent_thread_id));`)
    const parent = edgeId(0)
    const insertThread = database.prepare('INSERT INTO threads VALUES (?, ?, 0)')
    const insertEdge = database.prepare("INSERT INTO thread_spawn_edges VALUES (?, ?, 'open')")
    const statements: string[] = []
    const instance = discovery({
      fs: { ...require('node:fs'), existsSync: () => false },
      DatabaseSync: class extends DatabaseSync {
        override prepare(sql: string) {
          statements.push(sql)
          return super.prepare(sql)
        }
      },
      ...dependencies
    })
    const pairs: SpawnPair[] = []
    database.exec('BEGIN')
    insertThread.run(parent, 'user')
    for (let index = 1; index <= count; index++) {
      const child = edgeId(index)
      insertThread.run(child, 'subagent')
      insertEdge.run(child, parent)
      instance.codexObserveThreadSourceKind(child, 'machine')
      pairs.push([child, parent])
    }
    database.exec('COMMIT')
    return { directory, database, instance, pairs, statements }
  }

  it('queries only the explicit 513th pair and rotates the background without rereading the prefix', async () => {
    const { directory, database, instance, pairs, statements } = fixture(513)
    try {
      const last = pairs[512]
      database.prepare("UPDATE thread_spawn_edges SET status='closed' WHERE child_thread_id=?").run(last[0])
      const first = await instance.codexReadSpawnEdges(directory, pairs, { targeted: false })
      expect(statements).toHaveLength(4)
      statements.length = 0
      const target = await instance.codexReadSpawnEdges(directory, [last, last], { targeted: true })
      expect(statements).toHaveLength(1)
      expect(statements[0]).toContain(last[0])
      expect(statements[0]).not.toContain(pairs[0][0])
      expect(target.edges.map(edge => [edge.childId, edge.status])).toEqual([[last[0], 'closed']])
      expect(target.coverage).toEqual({ requestedCount: 1, coveredCount: 1, complete: true })
      expect(target.remaining).toBe(0)
      expect(target.retainedEdges).toEqual([])
      const tail = await instance.codexReadSpawnEdges(directory, [...pairs].reverse(), {})
      expect(first.coverage).toEqual({ requestedCount: 513, coveredCount: 512, complete: false })
      expect(first.remaining).toBe(1)
      expect(tail.remaining).toBe(0)
      expect(tail.edges.map(edge => edge.childId)).toEqual([last[0]])
      expect(tail.retainedEdges).toHaveLength(512)
      expect(tail.retainedEdges.every(edge => edge.readGeneration === first.readGeneration)).toBe(true)
      expect(tail.databaseGeneration).toBe(first.databaseGeneration)
      expect(tail.readGeneration).toBeGreaterThan(target.readGeneration)
      expect((await instance.codexReadSpawnEdges(directory, pairs, {})).edges).toHaveLength(512)
      expect((await instance.codexReadSpawnEdges(directory, pairs, { targeted: true })).coverage)
        .toEqual({ requestedCount: 513, coveredCount: 513, complete: true })
    } finally { database.close() }
  })

  it('does not skip unread pairs when the host removes accepted candidates between pages', async () => {
    const { directory, database, instance, pairs } = fixture(1030)
    try {
      const outstanding = new Map(pairs.map(pair => [pair[0], pair]))
      for (const expectedRemaining of [518, 6, 0]) {
        const result = await instance.codexReadSpawnEdges(directory, [...outstanding.values()].reverse(), { targeted: false })
        expect(result.remaining).toBe(expectedRemaining)
        for (const edge of result.edges) expect(outstanding.delete(edge.childId)).toBe(true)
      }
      expect(outstanding.size).toBe(0)
    } finally { database.close() }
  })

  it('finishes old and newly inserted candidates even when the insertions precede the previous page', async () => {
    const { directory, database, instance, pairs } = fixture(1028)
    try {
      const outstanding = new Map(pairs.slice(513).map(pair => [pair[0], pair]))
      for (const expected of [3, 4, 0]) {
        const result = await instance.codexReadSpawnEdges(directory, [...outstanding.values()], { targeted: false })
        expect(result.remaining).toBe(expected)
        for (const edge of result.edges) expect(outstanding.delete(edge.childId)).toBe(true)
        if (expected === 3) for (const pair of pairs.slice(0, 513)) outstanding.set(pair[0], pair)
      }
      expect(outstanding.size).toBe(0)
    } finally { database.close() }
  })

  it('reaches a close after a full page of covered but unrecognized statuses', async () => {
    const { directory, database, instance, pairs } = fixture(513)
    try {
      database.prepare("UPDATE thread_spawn_edges SET status=CASE WHEN child_thread_id=? THEN 'closed' ELSE 'unspecified' END").run(pairs[512][0])
      const first = await instance.codexReadSpawnEdges(directory, pairs, { targeted: false })
      expect(first.edges.every(edge => edge.status === 'unknown')).toBe(true)
      expect(first.coverage.coveredCount).toBe(512)
      expect(first.remaining).toBe(1)
      const next = await instance.codexReadSpawnEdges(directory, pairs, { targeted: false })
      expect(next.edges).toMatchObject([{ childId: pairs[512][0], status: 'closed' }])
      expect(next.remaining).toBe(0)
    } finally { database.close() }
  })

  it('separates a missing edge, a failed query, an archived endpoint and a different direct parent', async () => {
    const { directory, database, instance, pairs } = fixture(2)
    const [child, parent] = pairs[0]
    const other = pairs[1][0]
    const read = () => instance.codexReadSpawnEdges(directory, pairs, { priorityPairs: [pairs[0]] })
    try {
      const first = await read()
      database.exec('ALTER TABLE thread_spawn_edges RENAME TO offline_edges')
      const failed = await read()
      expect(failed.outcome).toBe('unavailable')
      expect(failed.edges).toEqual([])
      expect(failed.coverage.coveredCount).toBe(0)
      expect(failed.retainedEdges).toEqual([])
      expect(failed.databaseGeneration).toBe(first.databaseGeneration)
      database.exec('ALTER TABLE offline_edges RENAME TO thread_spawn_edges')
      database.prepare("UPDATE thread_spawn_edges SET status='closed' WHERE child_thread_id=?").run(child)
      expect((await read()).edges[0]).not.toHaveProperty('previousStatus')
      database.prepare("UPDATE thread_spawn_edges SET status='open' WHERE child_thread_id=?").run(child)
      expect((await read()).edges[0]).toMatchObject({ status: 'open', previousStatus: 'closed' })
      database.prepare("UPDATE thread_spawn_edges SET status='closed' WHERE child_thread_id=?").run(child)
      expect((await read()).edges[0]).toMatchObject({ status: 'closed', previousStatus: 'open' })
      database.prepare("INSERT INTO thread_spawn_edges VALUES (?, ?, 'open')").run(child, other)
      expect((await read()).edges[0]).toMatchObject({ status: 'unknown', reason: 'conflicting-parents' })
      database.prepare('DELETE FROM thread_spawn_edges WHERE child_thread_id=? AND parent_thread_id=?').run(child, other)
      database.prepare('UPDATE thread_spawn_edges SET parent_thread_id=? WHERE child_thread_id=?').run(other, child)
      expect((await read()).edges[0]).toMatchObject({ childId: child, parentId: parent, status: 'absent', reason: 'parent-changed' })
      const outside = await instance.codexReadSpawnEdges(directory, pairs, { priorityPairs: [[child, other]] })
      expect(outside.coverage).toEqual({ requestedCount: 1, coveredCount: 0, complete: false })
      expect(outside.retainedEdges).toEqual([])
      database.prepare('UPDATE thread_spawn_edges SET parent_thread_id=? WHERE child_thread_id=?').run(parent, child)
      database.prepare('UPDATE threads SET archived=1 WHERE id=?').run(parent)
      expect((await read()).edges[0]).toMatchObject({ status: 'absent', reason: 'parent-archived' })
      database.prepare('UPDATE threads SET archived=0 WHERE id=?').run(parent)
      database.prepare('DELETE FROM thread_spawn_edges WHERE child_thread_id=?').run(child)
      expect((await read()).edges[0]).toMatchObject({ status: 'absent', reason: 'edge-missing' })
      expect((await read()).coverage.coveredCount).toBe(1)
      const empty = await instance.codexReadSpawnEdges(directory, pairs, { priorityPairs: [] })
      expect(empty.outcome).toBe('no-candidates')
      expect(empty.edges).toEqual([])
    } finally { database.close() }
  })

  it('rejects missing or duplicate result rows as an incomplete SQLite read', async () => {
    let output: object[] = []
    const { directory, database, instance, pairs } = fixture(2, {
      sqliteBin: '/synthetic/sqlite3',
      execFile(_bin: string, _args: string[], _options: unknown, callback: (error: null, output: string) => void) {
        callback(null, JSON.stringify(output))
      }
    })
    try {
      const rows = pairs.map(([childId, parentId]) => ({ child_thread_id: childId, parent_thread_id: parentId, status: 'open', reason: null }))
      for (const partial of [[], [rows[1]], [rows[0], rows[0]]]) {
        output = partial
        const result = await instance.codexReadSpawnEdges(directory, pairs, { targeted: true })
        expect(result).toMatchObject({ outcome: 'unavailable', edges: [], retainedEdges: [], coverage: { coveredCount: 0 } })
      }
    } finally { database.close() }
  })

  function delayedFixture(count = 2) {
    let hold = false
    let release: (() => void) | undefined
    let nativeDatabase: import('node:sqlite').DatabaseSync
    const setup = fixture(count, {
      sqliteBin: '/synthetic/sqlite3',
      execFile(_bin: string, args: string[], _options: unknown, callback: (error: null, output: string) => void) {
        const output = JSON.stringify(nativeDatabase.prepare(args[3]).all())
        if (hold) {
          hold = false
          release = () => callback(null, output)
        } else callback(null, output)
      }
    })
    nativeDatabase = setup.database
    return { ...setup, hold: () => { hold = true }, release: () => {
      expect(release).toBeTypeOf('function')
      release!()
      release = undefined
    } }
  }

  it('lets a targeted close supersede an in-flight open and leaves other children current', async () => {
    const { directory, database, instance, pairs, hold, release } = delayedFixture()
    try {
      hold()
      const background = instance.codexReadSpawnEdges(directory, pairs, {})
      database.prepare("UPDATE thread_spawn_edges SET status='closed' WHERE child_thread_id=?").run(pairs[0][0])
      const target = await instance.codexReadSpawnEdges(directory, pairs, { priorityPairs: [pairs[0]] })
      release()
      const older = await background
      expect(target.edges[0].status).toBe('closed')
      expect(older.edges.map(edge => edge.childId)).toEqual([pairs[1][0]])
      expect(older.retainedEdges).toEqual([])
      hold()
      const pendingTarget = instance.codexReadSpawnEdges(directory, pairs, { priorityPairs: [pairs[0]] })
      const laterBackground = await instance.codexReadSpawnEdges(directory, pairs, {})
      expect(laterBackground.edges.map(edge => edge.childId)).toEqual([pairs[1][0]])
      release()
      expect((await pendingTarget).edges[0].status).toBe('closed')
    } finally { database.close() }
  })

  it('reports background page progress when a targeted read supplies every selected pair', async () => {
    const { directory, database, instance, pairs, hold, release } = delayedFixture(513)
    try {
      hold()
      const background = instance.codexReadSpawnEdges(directory, pairs, { targeted: false })
      const target = await instance.codexReadSpawnEdges(directory, pairs.slice(0, 512), { targeted: true })
      expect(target.coverage.complete).toBe(true)
      release()
      const page = await background
      expect(page).toMatchObject({ outcome: 'read', edges: [], remaining: 1, coverage: { coveredCount: 0 } })
      const next = await instance.codexReadSpawnEdges(directory, pairs.slice(512), { targeted: false })
      expect(next.edges.map(edge => edge.childId)).toEqual([pairs[512][0]])
      expect(next.remaining).toBe(0)
    } finally { database.close() }
  })

  it('discards an old database, a reset generation and an obsolete host scope', async () => {
    const { directory, database, instance, pairs, hold, release } = delayedFixture()
    try {
      const read = (isCurrent?: () => boolean) =>
        instance.codexReadSpawnEdges(directory, pairs, { priorityPairs: [pairs[0]], isCurrent })
      const first = await read()
      hold()
      const oldFile = read()
      writeFileSync(join(directory, 'state_6.sqlite'), '')
      release()
      expect(await oldFile).toMatchObject({ outcome: 'superseded', edges: [], retainedEdges: [] })
      rmSync(join(directory, 'state_6.sqlite'))
      const rebound = await read()
      expect(rebound.databaseGeneration).toBeGreaterThan(first.databaseGeneration)
      hold()
      const oldEpoch = read()
      instance.codexResetSubagentDiscovery({ preserveIdentities: true })
      release()
      expect(await oldEpoch).toMatchObject({ outcome: 'superseded', edges: [], retainedEdges: [] })
      hold()
      let current = true
      const oldScope = read(() => current)
      current = false
      release()
      expect(await oldScope).toMatchObject({ outcome: 'superseded', edges: [], retainedEdges: [] })
    } finally { database.close() }
  })

  it('does not carry a previous status across a database replaced at the same path', async () => {
    const first = fixture(1)
    const replacement = fixture(1)
    try {
      const read = () => first.instance.codexReadSpawnEdges(first.directory, first.pairs, { targeted: true })
      const initial = await read()
      replacement.database.exec("UPDATE thread_spawn_edges SET status='closed'")
      renameSync(join(replacement.directory, 'state_5.sqlite'), join(first.directory, 'state_5.sqlite'))
      const next = await read()
      expect(next.databaseGeneration).toBeGreaterThan(initial.databaseGeneration)
      expect(next.edges[0].status).toBe('closed')
      expect(next.edges[0]).not.toHaveProperty('previousStatus')
      expect(next.retainedEdges).toEqual([])
    } finally { first.database.close(); replacement.database.close() }
  })
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
