import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { execFile, execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const archiveModule = require_(resolve(process.cwd(), 'preload/cursor/archive.cjs'))
const bridgeModule = require_(resolve(process.cwd(), 'preload/cursor/index.cjs'))

const SETTLED = '86e0370a-21b3-434d-a1a3-0ce83edc5ddd'
const RUNNING = 'aaaaaaaa-1111-2222-3333-444444444444'
const PENDING_PLAN = 'bbbbbbbb-1111-2222-3333-444444444444'
const PARENT_WITH_LIVE_FORK = 'cccccccc-1111-2222-3333-444444444444'
const LIVE_FORK = 'dddddddd-1111-2222-3333-444444444444'
const ALREADY_ARCHIVED = 'eeeeeeee-1111-2222-3333-444444444444'
const NEIGHBOR = 'ffffffff-1111-2222-3333-444444444444'

function writeFixture(path: string) {
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE composerHeaders (
      composerId TEXT PRIMARY KEY,
      workspaceId TEXT,
      isArchived INTEGER,
      isSubagent INTEGER,
      createdAt INTEGER,
      lastUpdatedAt INTEGER,
      value TEXT
    );
  `)
  const insert = db.prepare(`
    INSERT INTO composerHeaders
    (composerId, workspaceId, isArchived, isSubagent, createdAt, lastUpdatedAt, value)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  insert.run(SETTLED, 'ws', 0, 0, 1000, 2000, JSON.stringify({
    unifiedMode: 'agent', name: 'settled', isArchived: false
  }))
  insert.run(RUNNING, 'ws', 0, 0, 1000, 2000, JSON.stringify({
    unifiedMode: 'agent', name: 'running', unfinishedRunAt: 9000
  }))
  insert.run(PENDING_PLAN, 'ws', 0, 0, 1000, 2000, JSON.stringify({
    unifiedMode: 'agent', name: 'pending plan', hasPendingPlan: true
  }))
  insert.run(PARENT_WITH_LIVE_FORK, 'ws', 0, 0, 1000, 2000, JSON.stringify({
    unifiedMode: 'agent', name: 'parent with live fork'
  }))
  insert.run(LIVE_FORK, 'ws', 0, 1, 1500, 2500, JSON.stringify({
    unifiedMode: 'agent',
    name: 'live fork',
    unfinishedRunAt: 2400,
    subagentInfo: { parentComposerId: PARENT_WITH_LIVE_FORK, rootParentConversationId: PARENT_WITH_LIVE_FORK }
  }))
  insert.run(ALREADY_ARCHIVED, 'ws', 1, 0, 1000, 2000, JSON.stringify({
    unifiedMode: 'agent', name: 'already archived', isArchived: true
  }))
  insert.run(NEIGHBOR, 'ws', 0, 0, 1000, 2000, JSON.stringify({
    unifiedMode: 'agent', name: 'neighbor', isArchived: false
  }))
  db.close()
}

function readRow(path: string, composerId: string) {
  const db = new DatabaseSync(path)
  try {
    return db.prepare(
      "SELECT isArchived, json_extract(value, '$.isArchived') AS jsonArchived FROM composerHeaders WHERE composerId = ?"
    ).get(composerId) as { isArchived: number; jsonArchived: unknown }
  } finally {
    db.close()
  }
}

function archiver(dbPath: string, overrides: Record<string, unknown> = {}) {
  return archiveModule.createArchiver({
    fs: { existsSync },
    path: { join },
    os: { homedir: () => '/tmp' },
    platform: 'darwin',
    env: {},
    stateDbPath: dbPath,
    DatabaseSync,
    ...overrides
  })
}

describe('cursor archive adapter', () => {
  it('archives a settled row by flipping the same isArchived pair the App writes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-cursor-archive-'))
    const dbPath = join(root, 'state.vscdb')
    writeFixture(dbPath)
    try {
      const result = await archiver(dbPath).archiveTask(SETTLED)
      expect(result.outcome).toBe('archived')
      expect(readRow(dbPath, SETTLED)).toMatchObject({ isArchived: 1, jsonArchived: 1 })
      // Only the target row moves; neighbors stay untouched.
      expect(readRow(dbPath, NEIGHBOR)).toMatchObject({ isArchived: 0, jsonArchived: 0 })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('re-verifies live evidence at write time and refuses running/waiting/live-fork rows', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-cursor-archive-'))
    const dbPath = join(root, 'state.vscdb')
    writeFixture(dbPath)
    try {
      const adapter = archiver(dbPath)
      for (const target of [RUNNING, PENDING_PLAN, PARENT_WITH_LIVE_FORK]) {
        const result = await adapter.archiveTask(target)
        expect(result.outcome).toBe('failed')
        expect(result.message).toContain('仍在进行中')
        expect(readRow(dbPath, target).isArchived).toBe(0)
      }
      expect(await adapter.archiveTask(LIVE_FORK)).toMatchObject({ outcome: 'failed' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reports alreadyArchived idempotently and fails cleanly on unknown or invalid ids', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-cursor-archive-'))
    const dbPath = join(root, 'state.vscdb')
    writeFixture(dbPath)
    try {
      const adapter = archiver(dbPath)
      expect(await adapter.archiveTask(ALREADY_ARCHIVED)).toMatchObject({ outcome: 'archived', alreadyArchived: true })
      expect(await adapter.archiveTask('11111111-2222-3333-4444-555555555555')).toMatchObject({ outcome: 'failed' })
      expect(await adapter.archiveTask('not-a-uuid')).toMatchObject({ outcome: 'failed' })
      expect(await adapter.archiveTask(`${SETTLED}' OR 1=1 --`)).toMatchObject({ outcome: 'failed' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails closed when the database file is missing', async () => {
    const adapter = archiver('/nonexistent/state.vscdb')
    expect(await adapter.archiveTask(SETTLED)).toMatchObject({ outcome: 'failed' })
  })

  it('archives through the sqlite CLI lane when DatabaseSync is unavailable', async () => {
    const bin = ['/usr/bin/sqlite3', '/opt/homebrew/bin/sqlite3', '/usr/local/bin/sqlite3'].find((candidate) => existsSync(candidate))
    if (!bin) return
    for (const runner of [{ execFileSync }, { execFile }]) {
      const root = mkdtempSync(join(tmpdir(), 'eypc-cursor-archive-cli-'))
      const dbPath = join(root, 'state.vscdb')
      writeFixture(dbPath)
      try {
        const adapter = archiver(dbPath, { DatabaseSync: undefined, ...runner, allowBuiltinSqlite: false })
        expect((await adapter.archiveTask(SETTLED)).outcome).toBe('archived')
        expect(readRow(dbPath, SETTLED)).toMatchObject({ isArchived: 1, jsonArchived: 1 })
        expect(await adapter.archiveTask(RUNNING)).toMatchObject({ outcome: 'failed' })
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })

  it('serializes overlapping archive requests so a second gate sees the first write', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-cursor-archive-serial-'))
    const dbPath = join(root, 'state.vscdb')
    writeFixture(dbPath)
    try {
      const adapter = archiver(dbPath)
      const [first, second] = await Promise.all([adapter.archiveTask(SETTLED), adapter.archiveTask(SETTLED)])
      expect(first).toMatchObject({ outcome: 'archived' })
      expect(second).toMatchObject({ outcome: 'archived', alreadyArchived: true })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('exposes archiveTask on the bridge as a promise with the v5 revision', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-cursor-archive-bridge-'))
    const dbPath = join(root, 'state.vscdb')
    writeFixture(dbPath)
    try {
      const bridge = bridgeModule.createCursorBridge({
        fs: { existsSync },
        path: { join, dirname: (value: string) => value.replace(/\/[^/]+$/, ''), basename: (value: string) => value.split('/').pop() || '' },
        os: { homedir: () => '/tmp' },
        platform: 'darwin',
        env: {},
        stateDbPath: dbPath,
        DatabaseSync
      })
      expect(bridge.revision).toBe('cursor-agent-companion-v5')
      await expect(bridge.archiveTask(SETTLED)).resolves.toMatchObject({ outcome: 'archived' })
      expect(readRow(dbPath, SETTLED)).toMatchObject({ isArchived: 1 })
      bridge.close()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
