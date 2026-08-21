import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const inventoryModule = require_(resolve(process.cwd(), 'preload/cursor/inventory.cjs'))
const bridgeModule = require_(resolve(process.cwd(), 'preload/cursor/index.cjs'))

const LOCAL = '86e0370a-21b3-434d-a1a3-0ce83edc5ddd'
const ARCHIVED = 'eaafef48-388a-403c-ab6b-8d51ad09acbd'
const CLOUD = '64047b1c-1111-2222-3333-444444444444'
const CHAT = 'f3ee44cd-aaaa-bbbb-cccc-dddddddddddd'
const EMPTY_NONE = 'aaaaaaaa-1111-2222-3333-444444444444'
const NONE_WITH_HEADERS = 'bbbbbbbb-1111-2222-3333-444444444444'
const FORK_RUNNING = 'cccccccc-1111-2222-3333-444444444444'
const FORK_NESTED_TASK = `task-dddddddd-1111-2222-3333-444444444444`
const FORK_FINISHED = 'eeeeeeee-1111-2222-3333-444444444444'
const FORK_ARCHIVED = 'ffffffff-1111-2222-3333-444444444444'

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
    CREATE TABLE cursorDiskKV (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `)
  const insertHeader = db.prepare(`
    INSERT INTO composerHeaders
    (composerId, workspaceId, isArchived, isSubagent, createdAt, lastUpdatedAt, value)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const insertData = db.prepare('INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)')
  insertHeader.run(LOCAL, 'ws-local', 0, 0, 1000, 2000, JSON.stringify({
    unifiedMode: 'agent',
    name: 'local agent',
    subtitle: 'subtitle',
    workspaceIdentifier: '79413102b893919eccbe60ee4c8fbcca',
    hasUnreadMessages: true,
    isDraft: false,
    hasPendingPlan: false,
    hasBlockingPendingActions: false
  }))
  insertHeader.run(ARCHIVED, 'ws-local', 1, 0, 1000, 2000, JSON.stringify({
    unifiedMode: 'agent',
    name: 'archived agent'
  }))
  insertHeader.run(CLOUD, 'ws-cloud', 0, 0, 1000, 2000, JSON.stringify({
    unifiedMode: 'agent',
    name: 'cloud agent',
    createdFromBackgroundAgent: true
  }))
  insertHeader.run(CHAT, 'ws-local', 0, 0, 1000, 2000, JSON.stringify({
    unifiedMode: 'chat',
    name: 'chat row'
  }))
  insertHeader.run(EMPTY_NONE, 'ws-local', 0, 0, 1000, 2000, JSON.stringify({
    unifiedMode: 'agent',
    name: 'empty shell'
  }))
  insertHeader.run(NONE_WITH_HEADERS, 'ws-local', 0, 0, 1000, 2000, JSON.stringify({
    unifiedMode: 'agent',
    name: 'none with headers'
  }))
  insertHeader.run(FORK_RUNNING, 'ws-local', 0, 1, 1500, 2500, JSON.stringify({
    unifiedMode: 'agent',
    name: 'running fork',
    unfinishedRunAt: 2400,
    subagentInfo: { parentComposerId: LOCAL, rootParentConversationId: LOCAL }
  }))
  insertHeader.run(FORK_NESTED_TASK, 'ws-local', 0, 1, 1500, 2500, JSON.stringify({
    unifiedMode: 'agent',
    name: 'nested task fork',
    subagentInfo: { parentComposerId: FORK_RUNNING, rootParentConversationId: LOCAL }
  }))
  insertHeader.run(FORK_FINISHED, 'ws-local', 0, 1, 1500, 2600, JSON.stringify({
    unifiedMode: 'agent',
    name: 'finished fork',
    subagentInfo: { parentComposerId: LOCAL, rootParentConversationId: LOCAL }
  }))
  insertHeader.run(FORK_ARCHIVED, 'ws-local', 1, 1, 1500, 2700, JSON.stringify({
    unifiedMode: 'agent',
    name: 'archived fork',
    unfinishedRunAt: 2650,
    subagentInfo: { parentComposerId: LOCAL, rootParentConversationId: LOCAL }
  }))
  insertData.run(`composerData:${LOCAL}`, JSON.stringify({
    status: 'completed',
    text: 'conversation body must never be selected',
    richText: 'also forbidden'
  }))
  insertData.run(`composerData:${EMPTY_NONE}`, JSON.stringify({
    status: 'none',
    fullConversationHeadersOnly: []
  }))
  insertData.run(`composerData:${NONE_WITH_HEADERS}`, JSON.stringify({
    status: 'none',
    fullConversationHeadersOnly: [{ bubbleId: 'header-only' }],
    text: 'conversation body must never be selected'
  }))
  db.close()
}

describe('cursor inventory reader', () => {
  it('returns only local agent headers and extracts disk status without conversation bodies', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-cursor-inventory-'))
    const dbPath = join(root, 'state.vscdb')
    writeFixture(dbPath)
    try {
      const reader = inventoryModule.createInventoryReader({
        fs: { existsSync: () => true },
        path: { join },
        os: { homedir: () => root },
        platform: 'darwin',
        env: {},
        stateDbPath: dbPath,
        DatabaseSync
      })
      const snapshot = reader.readInventory()
      expect(snapshot.available).toBe(true)
      expect(snapshot.sessions).toHaveLength(2)
      expect(snapshot.sessions.map((session: { composerId: string }) => session.composerId).sort()).toEqual([
        LOCAL,
        NONE_WITH_HEADERS
      ].sort())
      expect(snapshot.sessions.find((session: { composerId: string }) => session.composerId === LOCAL)).toMatchObject({
        composerId: LOCAL,
        diskStatus: 'completed',
        hasUnreadMessages: true,
        name: 'local agent'
      })
      expect(snapshot.sessions.find((session: { composerId: string }) => session.composerId === NONE_WITH_HEADERS)).toMatchObject({
        composerId: NONE_WITH_HEADERS,
        diskStatus: 'none',
        name: 'none with headers'
      })
      const parent = snapshot.sessions.find((session: { composerId: string }) => session.composerId === LOCAL)
      expect(parent.subagents).toEqual([
        { composerId: FORK_RUNNING, unfinishedRunAt: 2400 },
        { composerId: FORK_FINISHED, unfinishedRunAt: 0 },
        { composerId: FORK_NESTED_TASK, unfinishedRunAt: 0 }
      ])
      expect(JSON.stringify(parent.subagents)).not.toContain(FORK_ARCHIVED)
      expect(snapshot.sessions.some((session: { composerId: string }) => session.composerId === FORK_RUNNING)).toBe(false)
      expect(snapshot.sessions.some((session: { composerId: string }) => session.composerId === FORK_NESTED_TASK)).toBe(false)
      expect(JSON.stringify(snapshot.sessions)).not.toContain('conversation body')
      expect(JSON.stringify(snapshot.sessions)).not.toContain('richText')
      expect(JSON.stringify(snapshot.sessions)).not.toContain('header-only')

      const bridge = bridgeModule.createCursorBridge({
        fs: { existsSync: () => true },
        path: { join },
        os: { homedir: () => root },
        platform: 'darwin',
        env: {},
        stateDbPath: dbPath,
        DatabaseSync
      })
      const opened = await bridge.openTask(LOCAL)
      expect(opened.outcome).toBe('unavailable')
      expect(opened.confirmsRead).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('degrades when the database is missing', () => {
    const snapshot = inventoryModule.createInventoryReader({
      fs: { existsSync: () => false },
      path: { join },
      os: { homedir: () => '/tmp' },
      platform: 'darwin',
      env: {}
    }).readInventory()
    expect(snapshot.available).toBe(false)
    expect(snapshot.reason).toBe('not-installed')
    expect(snapshot.sessions).toEqual([])
  })

  it('reports sqlite-unavailable when neither CLI nor builtin sqlite can run', () => {
    const snapshot = inventoryModule.createInventoryReader({
      fs: { existsSync: (value: string) => String(value).endsWith('state.vscdb') },
      path: { join },
      os: { homedir: () => '/tmp' },
      platform: 'darwin',
      env: {},
      stateDbPath: join('/tmp', 'state.vscdb'),
      allowBuiltinSqlite: false
    }).readInventory()
    expect(snapshot.available).toBe(false)
    expect(snapshot.reason).toBe('sqlite-unavailable')
  })

  it('reads inventory through sqlite3 CLI JSON without conversation bodies', () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-cursor-sqlite-cli-'))
    const dbPath = join(root, 'state.vscdb')
    writeFixture(dbPath)
    try {
      const snapshot = inventoryModule.createInventoryReader({
        fs: {
          existsSync: (value: string) => value === dbPath || value === '/usr/bin/sqlite3'
        },
        path: { join },
        os: { homedir: () => root },
        platform: 'darwin',
        env: {},
        stateDbPath: dbPath,
        sqliteBin: '/usr/bin/sqlite3',
        allowBuiltinSqlite: false,
        execFileSync: (_bin: string, args: string[]) => {
          expect(args[0]).toBe('-readonly')
          expect(args[1]).toBe('-json')
          expect(String(args[2])).toContain('mode=ro')
          expect(String(args[3])).not.toContain("$.text")
          expect(String(args[3])).not.toContain('richText')
          expect(String(args[3])).toContain('json_array_length')
          return JSON.stringify([{
            composerId: LOCAL,
            workspaceId: 'ws-local',
            isArchived: 0,
            isSubagent: 0,
            createdAt: 1000,
            lastUpdatedAt: 2000,
            unifiedMode: 'agent',
            isBestOfNSubcomposer: 0,
            hasUnreadMessages: 1,
            isDraft: 0,
            hasPendingPlan: 0,
            hasBlockingPendingActions: 0,
            unfinishedRunAt: 0,
            subtitle: 'subtitle',
            workspaceIdentifier: '79413102b893919eccbe60ee4c8fbcca',
            name: 'local agent',
            createdFromBackgroundAgent: 0,
            cloudAgentProjectMembership: null,
            agentLocationType: 'local',
            diskStatus: 'completed'
          }])
        }
      }).readInventory()
      expect(snapshot.available).toBe(true)
      expect(snapshot.reason).toBe('ready')
      expect(snapshot.sessions).toHaveLength(1)
      expect(JSON.stringify(snapshot.sessions[0])).not.toContain('conversation body')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reads a fixture through the real sqlite3 CLI when present', () => {
    if (!existsSync('/usr/bin/sqlite3')) return
    const root = mkdtempSync(join(tmpdir(), 'eypc-cursor-sqlite-real-'))
    const dbPath = join(root, 'state.vscdb')
    writeFixture(dbPath)
    try {
      const snapshot = inventoryModule.createInventoryReader({
        fs: { existsSync },
        path: { join },
        os: { homedir: () => root },
        platform: 'darwin',
        env: {},
        stateDbPath: dbPath,
        sqliteBin: '/usr/bin/sqlite3',
        allowBuiltinSqlite: false,
        execFileSync
      }).readInventory()
      expect(snapshot.available).toBe(true)
      expect(snapshot.sessions).toHaveLength(2)
      expect(snapshot.sessions.map((session: { composerId: string }) => session.composerId).sort()).toEqual([
        LOCAL,
        NONE_WITH_HEADERS
      ].sort())
      expect(JSON.stringify(snapshot.sessions)).not.toContain('conversation body')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('notifies inventory watchers when the state database signature changes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-cursor-inventory-watch-'))
    const dbPath = join(root, 'state.vscdb')
    writeFixture(dbPath)
    let fileListener: (() => void) | undefined
    try {
      const reader = inventoryModule.createInventoryReader({
        fs: {
          existsSync: () => true,
          statSync: (value: string) => {
            try { return require('node:fs').statSync(value) } catch { throw new Error('missing') }
          },
          watch: () => ({ close() {}, on() {} })
        },
        watchFile: (_path: string, _opts: unknown, callback: () => void) => {
          fileListener = callback
        },
        unwatchFile: () => undefined,
        path: { join },
        os: { homedir: () => root },
        platform: 'darwin',
        env: {},
        stateDbPath: dbPath,
        DatabaseSync
      })
      let notified = 0
      const dispose = reader.watch(() => { notified += 1 })
      expect(typeof fileListener).toBe('function')
      require('node:fs').writeFileSync(`${dbPath}-wal`, 'x')
      fileListener?.()
      await new Promise((resolve) => setImmediate(resolve))
      expect(notified).toBe(1)
      fileListener?.()
      await new Promise((resolve) => setImmediate(resolve))
      expect(notified).toBe(1)
      dispose()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
