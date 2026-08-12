import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

const require_ = createRequire(import.meta.url)
const appState = require_(resolve(process.cwd(), 'preload/claude/app-state.cjs'))

const LOCAL_A = 'local_11111111-1111-4111-8111-111111111111'
const LOCAL_B = 'local_22222222-2222-4222-8222-222222222222'
const REQUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function line(time: string, message: string) {
  return `${time} [info] ${message}`
}

describe('Claude App version-gated state log', () => {
  it('admits the currently validated Claude App grammar without widening unknown versions', () => {
    expect(appState.SUPPORTED_APP_VERSIONS.has('1.28929.0')).toBe(true)
    expect(appState.SUPPORTED_APP_VERSIONS.has('1.28930.0')).toBe(false)
  })

  it('accepts only the fixed privacy-safe lifecycle grammar', () => {
    expect(appState.parseAppStateLine(line('2026-08-07 10:00:00', `Sending message to session ${LOCAL_A}`)))
      .toMatchObject({ kind: 'running', sessionId: LOCAL_A })
    expect(appState.parseAppStateLine(line('2026-08-07 10:00:01', `Emitted tool permission request ${REQUEST} for AskUserQuestion in session ${LOCAL_A}`)))
      .toMatchObject({ kind: 'waiting-input', requestId: REQUEST, sessionId: LOCAL_A })
    expect(appState.parseAppStateLine(line('2026-08-07 10:00:02', `[Stop hook] Query completed for session ${LOCAL_A}`)))
      .toMatchObject({ kind: 'completed', sessionId: LOCAL_A })
    expect(appState.parseAppStateLine(line('2026-08-07 10:00:03', `Sending message to session ${LOCAL_A} secret prompt`))).toBeNull()
    expect(appState.parseAppStateLine('private conversation text')).toBeNull()
    expect(appState.parseAppArchiveLine(line('2026-08-07 10:00:04', `LocalSessions.archive: sessionId=${LOCAL_A}`)))
      .toMatchObject({ sessionId: LOCAL_A, at: expect.any(Number) })
    expect(appState.parseAppArchiveLine(line('2026-08-07 10:00:04', `LocalSessions.archive: sessionId=${LOCAL_A} extra`))).toBeNull()
  })

  it('maps a permission response back to its exact local owner and deduplicates repeats', () => {
    const events = [
      appState.parseAppStateLine(line('2026-08-07 10:00:00', `Sending message to session ${LOCAL_A}`)),
      appState.parseAppStateLine(line('2026-08-07 10:00:01', `Emitted tool permission request ${REQUEST} for Bash in session ${LOCAL_A}`)),
      appState.parseAppStateLine(line('2026-08-07 10:00:02', `Received permission response for ${REQUEST}: once (tool: Bash)`))
    ].filter(Boolean)
    const result = appState.foldAppStateEvents(events)
    expect(result.state.get(LOCAL_A)).toMatchObject({ phase: 'running', waitingApprovalAt: expect.any(Number) })
    expect(result.state.has(LOCAL_B)).toBe(false)
    expect(result.requests.size).toBe(0)
  })

  it('fails closed on an unvalidated App version and emits no raw log text', () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-claude-app-state-'))
    const logs = join(root, 'logs')
    mkdirSync(logs, { recursive: true })
    writeFileSync(join(logs, 'main.log'), `${line('2026-08-07 10:00:00', `Sending message to session ${LOCAL_A}`)}\n`)
    const unsupported = appState.createAppStateReader({
      fs,
      path,
      os: { homedir: () => root },
      platform: 'darwin',
      claudeLogDirectory: logs,
      claudeAppVersion: '9.9.9'
    }).read()
    expect(unsupported).toMatchObject({ compatibility: 'unsupported', entries: [] })
    const supportedVersion = [...appState.SUPPORTED_APP_VERSIONS][0]
    const supported = appState.createAppStateReader({
      fs,
      path,
      os: { homedir: () => root },
      platform: 'darwin',
      claudeLogDirectory: logs,
      claudeAppVersion: supportedVersion
    }).read()
    expect(supported.entries).toHaveLength(1)
    expect(supported.entries[0]).toMatchObject({
      sessionId: LOCAL_A,
      phase: 'unknown',
      evidenceProvenance: 'cold-replay',
      source: 'app-log'
    })
    expect(JSON.stringify(supported)).not.toContain('prompt')
  })

  it('reads the App version once per Info.plist generation instead of for every state event', () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-claude-app-version-'))
    const logs = join(root, 'logs')
    const infoPath = join(root, 'Info.plist')
    mkdirSync(logs, { recursive: true })
    writeFileSync(join(logs, 'main.log'), '')
    writeFileSync(infoPath, 'v1')
    const execFileSync = vi.fn(() => [...appState.SUPPORTED_APP_VERSIONS][0])
    const reader = appState.createAppStateReader({
      fs,
      path,
      os: { homedir: () => root },
      platform: 'darwin',
      claudeLogDirectory: logs,
      claudeAppInfoPath: infoPath,
      execFileSync
    })
    reader.read()
    reader.read()
    expect(execFileSync).toHaveBeenCalledTimes(1)
    writeFileSync(infoPath, 'v2-generation')
    reader.read()
    expect(execFileSync).toHaveBeenCalledTimes(2)
  })

  it('keeps cold replay non-running while deduplicating a rotated copy', () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-claude-app-duplicate-'))
    const logs = join(root, 'logs')
    mkdirSync(logs, { recursive: true })
    const rows = [
      line('2026-08-07 10:00:00', `Sending message to session ${LOCAL_A}`),
      line('2026-08-07 10:00:00', `[Result] Turn succeeded for session ${LOCAL_A}`),
      line('2026-08-07 10:00:00', `Sending message to session ${LOCAL_A}`)
    ]
    writeFileSync(join(logs, 'main1.log'), `${rows.join('\n')}\n`)
    writeFileSync(join(logs, 'main.log'), `${rows.join('\n')}\n`)
    const reader = appState.createAppStateReader({
      fs,
      path,
      os: { homedir: () => root },
      platform: 'darwin',
      claudeLogDirectory: logs,
      claudeAppVersion: [...appState.SUPPORTED_APP_VERSIONS][0]
    })
    expect(reader.read().entries[0]).toMatchObject({ phase: 'unknown', evidenceProvenance: 'cold-replay' })
  })

  it('promotes only an append observed after initialization to live running', () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-claude-app-live-'))
    const logs = join(root, 'logs')
    mkdirSync(logs, { recursive: true })
    writeFileSync(join(logs, 'main.log'), '')
    const reader = appState.createAppStateReader({
      fs,
      path,
      os: { homedir: () => root },
      platform: 'darwin',
      claudeLogDirectory: logs,
      claudeAppVersion: [...appState.SUPPORTED_APP_VERSIONS][0]
    })

    expect(reader.read().entries).toEqual([])
    writeFileSync(join(logs, 'main.log'), `${line('2026-08-07 10:00:00', `Sending message to session ${LOCAL_A}`)}\n`)
    expect(reader.read().entries[0]).toMatchObject({ phase: 'running', evidenceProvenance: 'live-append' })
  })

  it('reads the first native log callback immediately and suppresses a semantic duplicate', () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-claude-app-native-watch-'))
    const logs = join(root, 'logs')
    mkdirSync(logs, { recursive: true })
    writeFileSync(join(logs, 'main.log'), '')
    let directoryChange: ((event: string, filename: string) => void) | null = null
    const controlledFs = new Proxy(fs, {
      get(target, key) {
        if (key === 'watch') return (_directory: string, _options: unknown, listener: (event: string, filename: string) => void) => {
          directoryChange = listener
          return { on: () => undefined, close: () => undefined }
        }
        return Reflect.get(target, key)
      }
    })
    const reader = appState.createAppStateReader({
      fs: controlledFs,
      path,
      os: { homedir: () => root },
      platform: 'darwin',
      claudeLogDirectory: logs,
      claudeAppVersion: '1.28929.0',
      watchFile: () => undefined,
      unwatchFile: () => undefined,
      setTimeout: () => { throw new Error('semantic wake must not use setTimeout') }
    })
    let notified = 0
    const dispose = reader.watch(() => { notified += 1 })
    const running = line('2026-08-07 10:00:00', `Sending message to session ${LOCAL_A}`)
    appendFileSync(join(logs, 'main.log'), `${running}\n`)
    ;(directoryChange as unknown as (event: string, filename: string) => void)('change', 'main.log')
    expect(reader.read().entries[0]).toMatchObject({ phase: 'running', evidenceProvenance: 'live-append' })
    expect(notified).toBe(1)

    appendFileSync(join(logs, 'main.log'), `${running}\n`)
    ;(directoryChange as unknown as (event: string, filename: string) => void)('change', 'main.log')
    expect(notified).toBe(1)
    dispose()
  })

  it('keeps an exact terminal authoritative during cold replay', () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-claude-app-terminal-'))
    const logs = join(root, 'logs')
    mkdirSync(logs, { recursive: true })
    writeFileSync(join(logs, 'main.log'), [
      line('2026-08-07 10:00:00', `Sending message to session ${LOCAL_A}`),
      line('2026-08-07 10:00:01', `[Result] Turn succeeded for session ${LOCAL_A}`)
    ].join('\n'))
    const reader = appState.createAppStateReader({
      fs,
      path,
      os: { homedir: () => root },
      platform: 'darwin',
      claudeLogDirectory: logs,
      claudeAppVersion: [...appState.SUPPORTED_APP_VERSIONS][0]
    })

    expect(reader.read().entries[0]).toMatchObject({ phase: 'completed', evidenceProvenance: 'exact-terminal' })
  })
})
