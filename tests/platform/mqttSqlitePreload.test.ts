import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import vm from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'

const requireModule = createRequire(import.meta.url)

function loadPreload(dbPath: string, legacyArchive: unknown = null) {
  const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
  const dbStorage = new Map<string, unknown>()
  if (legacyArchive) dbStorage.set('eypc/mqtt/archive/v1', legacyArchive)
  const localStorage = new Map<string, string>()
  const sandbox = {
    window: {},
    console,
    process: {
      platform: process.platform,
      env: { EYPC_MQTT_DB_PATH: dbPath },
      cwd: process.cwd
    },
    require(name: string) {
      if (name === 'node:child_process') return { execFile() {} }
      if (name === 'node:fs') return requireModule('node:fs')
      if (name === 'node:path') return requireModule('node:path')
      if (name === 'node:os') return requireModule('node:os')
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
