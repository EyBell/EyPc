import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import vm from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'

const requireModule = createRequire(import.meta.url)

function loadPreload(dbPath: string, legacyArchive: unknown = null, legacySecrets: unknown = null) {
  const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
  const dbStorage = new Map<string, unknown>()
  if (legacyArchive) dbStorage.set('eypc/mqtt/archive/v1', legacyArchive)
  const localStorage = new Map<string, string>()
  if (legacySecrets) {
    localStorage.set('eypc/mqtt/secrets-local/v1', JSON.stringify(legacySecrets))
  }
  const sandbox = {
    window: {},
    console,
    process: {
      platform: process.platform,
      env: { EYPC_MQTT_DB_PATH: dbPath },
      cwd: process.cwd
    },
    require(name: string) {
      if (name === 'node:buffer') return requireModule('node:buffer')
      if (name === 'node:child_process') return { execFile() {} }
      if (name === 'node:net') return { connect() { throw new Error('unexpected Codex desktop connection') } }
      if (name === 'node:fs') return requireModule('node:fs')
      if (name === 'node:path') return requireModule('node:path')
      if (name === 'node:os') return requireModule('node:os')
      if (name === 'node:crypto') return requireModule('node:crypto')
      if (name === 'node:sqlite') return requireModule('node:sqlite')
      throw new Error(`unexpected require: ${name}`)
    },
    utools: {
      dbStorage: {
        getItem: (key: string) => dbStorage.get(key) ?? null,
        setItem: (key: string, value: unknown) => { dbStorage.set(key, value) }
      },
      getPath: () => join(dbPath, '..')
    },
    localStorage: {
      getItem: (key: string) => localStorage.get(key) ?? null,
      setItem: (key: string, value: string) => { localStorage.set(key, value) }
    }
  } as unknown as Record<string, unknown>
  sandbox.globalThis = sandbox
  vm.runInNewContext(preload, sandbox, { filename: 'preload.js' })
  return sandbox as {
    window: {
      eypcPlatform: {
        storage: {
          getMqttArchive(): unknown
          setMqttArchive(archive: unknown): boolean
          mutateMqttArchive(input: unknown): boolean
          getMqttStorageStatus(): { mode: string; sqliteAvailable: boolean; dbPath?: string }
          getMqttSecrets(): Record<string, string>
          setMqttSecrets(secrets: Record<string, string>): boolean
        }
      }
    }
  }
}

describe('MQTT preload SQLite storage', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips MQTT archive through SQLite and keeps secrets outside the archive', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eypc-mqtt-sqlite-'))
    tempDirs.push(dir)
    const dbPath = join(dir, 'mqtt.sqlite')
    const sandbox = loadPreload(dbPath)
    const storage = sandbox.window.eypcPlatform.storage

    expect(storage.getMqttStorageStatus()).toMatchObject({
      mode: 'sqlite',
      sqliteAvailable: true,
      dbPath
    })
    expect(storage.setMqttArchive({
      version: 1,
      connectionSnapshots: [{ id: 'dev', name: 'Dev', url: 'ws://localhost:8083/mqtt', clientId: 'client-a', username: 'user-a', publishTopic: 'out', qos: 1, retain: false, syncRecords: true, createdAt: 1, updatedAt: 2 }],
      sessions: [{ id: 's1', connectionId: 'dev', title: 'Session', startedAt: 1, messages: [{ id: 'm1', connectionId: 'dev', sessionId: 's1', direction: 'outgoing', topic: 'out', payload: 'hello', qos: 1, retain: false, timestamp: 2 }] }],
      publishTemplates: [{ id: 'tpl1', connectionId: 'dev', title: 'Alias', topic: 'out', payload: 'hello', qos: 1, retain: false, createdAt: 1, updatedAt: 2 }],
      publishDraftHistory: [{ id: 'hist1', connectionId: 'dev', title: 'Draft', topic: 'out', payload: 'draft', qos: 0, retain: false, source: 'manual', createdAt: 3, updatedAt: 4 }]
    })).toBe(true)
    expect(storage.setMqttSecrets({ dev: 'local-secret' })).toBe(true)

    expect(JSON.stringify(storage.getMqttArchive())).toContain('hello')
    expect(JSON.stringify(storage.getMqttArchive())).toContain('draft')
    expect(JSON.stringify(storage.getMqttArchive())).not.toContain('local-secret')
    expect(storage.getMqttArchive()).toMatchObject({
      publishDraftHistory: [{ id: 'hist1', topic: 'out', payload: 'draft' }]
    })
    expect(storage.getMqttSecrets()).toEqual({ dev: 'local-secret' })

    expect(storage.mutateMqttArchive({
      revision: 'mqtt-archive-mutation-v1',
      kind: 'append-message',
      connectionSnapshot: { id: 'dev', name: 'Dev', url: 'ws://localhost:8083/mqtt', clientId: 'client-a', username: 'user-a', publishTopic: 'out', publishTopics: ['out'], qos: 1, retain: false, syncRecords: true, createdAt: 1, updatedAt: 2 },
      session: { id: 's1', connectionId: 'dev', title: 'Session', startedAt: 1, messages: [] },
      message: { id: 'm2', connectionId: 'dev', sessionId: 's1', direction: 'incoming', topic: 'in', payload: 'incremental', qos: 0, retain: false, timestamp: 3 }
    })).toBe(true)
    expect(storage.getMqttArchive()).toMatchObject({
      sessions: [{ id: 's1', messages: [
        { id: 'm1', payload: 'hello' },
        { id: 'm2', payload: 'incremental' }
      ] }]
    })
  })

  it('uses keyed incremental SQLite mutations instead of table-wide archive rewrites', () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    for (const table of ['connection_snapshots', 'sessions', 'messages', 'publish_templates', 'publish_draft_history']) {
      expect(preload).not.toContain(`db.prepare('DELETE FROM ${table}')`)
    }
    expect(preload).toContain("revision !== 'mqtt-archive-mutation-v1'")
    expect(preload).not.toContain('writeLegacyMqttArchive(archive)\n      return ok')
  })

  it('persists MQTT secrets in the local user data directory across preload reloads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eypc-mqtt-sqlite-'))
    tempDirs.push(dir)
    const dbPath = join(dir, 'mqtt.sqlite')

    const firstStorage = loadPreload(dbPath).window.eypcPlatform.storage
    expect(firstStorage.setMqttSecrets({ dev: 'local-secret' })).toBe(true)
    const rawFile = readFileSync(join(dir, 'mqtt-secrets-local.json'), 'utf8')
    expect(rawFile).not.toContain('local-secret')
    expect(JSON.parse(rawFile)).toMatchObject({
      version: 2,
      encoding: 'base64'
    })

    const reloadedStorage = loadPreload(dbPath).window.eypcPlatform.storage
    expect(reloadedStorage.getMqttSecrets()).toEqual({ dev: 'local-secret' })
    expect(JSON.stringify(reloadedStorage.getMqttArchive())).not.toContain('local-secret')
  })

  it('encrypts persisted MQTT secrets on disk while keeping them readable locally', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eypc-mqtt-sqlite-'))
    tempDirs.push(dir)
    const dbPath = join(dir, 'mqtt.sqlite')

    const firstStorage = loadPreload(dbPath).window.eypcPlatform.storage
    expect(firstStorage.setMqttSecrets({ dev: 'local-secret' })).toBe(true)
    const rawFile = readFileSync(join(dir, 'mqtt-secrets-local.json'), 'utf8')
    expect(rawFile).not.toContain('local-secret')
    expect(JSON.parse(rawFile)).toMatchObject({
      version: 2,
      encoding: 'base64'
    })

    const reloadedStorage = loadPreload(dbPath).window.eypcPlatform.storage
    expect(reloadedStorage.getMqttSecrets()).toEqual({ dev: 'local-secret' })
  })

  it('migrates legacy plaintext MQTT secret files into encrypted storage', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eypc-mqtt-sqlite-'))
    tempDirs.push(dir)
    const dbPath = join(dir, 'mqtt.sqlite')
    writeFileSync(join(dir, 'mqtt-secrets-local.json'), JSON.stringify({
      version: 1,
      secrets: { dev: 'legacy-secret' }
    }))

    const storage = loadPreload(dbPath).window.eypcPlatform.storage
    expect(storage.getMqttSecrets()).toEqual({ dev: 'legacy-secret' })
    const rawFile = readFileSync(join(dir, 'mqtt-secrets-local.json'), 'utf8')
    expect(rawFile).not.toContain('legacy-secret')
    expect(JSON.parse(rawFile)).toMatchObject({
      version: 2,
      encoding: 'base64'
    })
  })

  it('does not resurrect legacy localStorage secrets when the local secret file exists but is invalid', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eypc-mqtt-sqlite-'))
    tempDirs.push(dir)
    const dbPath = join(dir, 'mqtt.sqlite')
    writeFileSync(join(dir, 'mqtt-secrets-local.json'), '')

    const storage = loadPreload(dbPath, null, { version: 1, secrets: { dev: 'stale-secret' } }).window.eypcPlatform.storage
    expect(storage.getMqttSecrets()).toEqual({})
  })

  it('migrates legacy dbStorage archive into SQLite without deleting the legacy value', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eypc-mqtt-sqlite-'))
    tempDirs.push(dir)
    const dbPath = join(dir, 'mqtt.sqlite')
    const legacyArchive = {
      version: 1,
      sessions: [{ id: 'legacy-session', connectionId: 'dev', title: 'Legacy', startedAt: 1, messages: [] }],
      publishTemplates: []
    }
    const sandbox = loadPreload(dbPath, legacyArchive)

    expect(sandbox.window.eypcPlatform.storage.getMqttArchive()).toMatchObject({
      sessions: [{ id: 'legacy-session', title: 'Legacy' }]
    })
    expect(sandbox.window.eypcPlatform.storage.getMqttStorageStatus()).toMatchObject({
      mode: 'sqlite',
      sqliteAvailable: true
    })
  })
})
