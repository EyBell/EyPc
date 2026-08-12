import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

const require_ = createRequire(import.meta.url)
const unread = require_(resolve(process.cwd(), 'preload/claude/unread.cjs'))

const LOCAL_A = 'local_7badfe6b-950e-488b-a70c-cc6756e96763'
const LOCAL_B = 'local_8badfe6b-950e-488b-a70c-cc6756e96764'

function chromiumValue(value: unknown, encoding: 'utf8' | 'utf16le' = 'utf8') {
  const payload = Buffer.from(JSON.stringify(value), encoding)
  return Buffer.concat([Buffer.from([encoding === 'utf8' ? 1 : 0]), payload])
}

function fakeLeveldown(value: Buffer | null, probes: string[]) {
  return (databasePath: string) => {
    probes.push(databasePath)
    let emitted = false
    return {
      open: (_options: unknown, done: (error?: Error | null) => void) => done(null),
      close: (done: () => void) => done(),
      iterator: () => ({
        next: (done: (error?: Error | null, key?: Buffer, row?: Buffer) => void) => {
          if (emitted || !value) { done(null); return }
          emitted = true
          done(null, Buffer.from(unread.UNREAD_LEVELDB_KEY), value)
        },
        end: (done: () => void) => done()
      })
    }
  }
}

function fakeLeveldownRows(rows: Array<[string, Buffer]>) {
  return () => {
    let index = 0
    return {
      open: (_options: unknown, done: (error?: Error | null) => void) => done(null),
      close: (done: () => void) => done(),
      iterator: () => ({
        next: (done: (error?: Error | null, key?: Buffer, row?: Buffer) => void) => {
          const entry = rows[index++]
          if (!entry) { done(null); return }
          done(null, Buffer.from(entry[0]), entry[1])
        },
        end: (done: () => void) => done()
      })
    }
  }
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eypc-unread-test-'))
  const source = join(root, 'source-leveldb')
  const scratch = join(root, 'scratch')
  mkdirSync(source, { recursive: true })
  mkdirSync(scratch, { recursive: true })
  writeFileSync(join(source, 'CURRENT'), 'MANIFEST-000001\n')
  return { root, source, scratch }
}

describe('Chromium unread value decoding', () => {
  it('decodes both Chromium string encodings and keeps only canonical local ids', () => {
    const raw = { state: { unreadIds: [LOCAL_A, 'bad', LOCAL_A, LOCAL_B] } }
    expect(unread.normalizeUnreadValue(chromiumValue(raw, 'utf8'))).toEqual([LOCAL_A, LOCAL_B])
    expect(unread.normalizeUnreadValue(chromiumValue(raw, 'utf16le'))).toEqual([LOCAL_A, LOCAL_B])
  })

  it('fails closed on a foreign value shape or storage prefix', () => {
    expect(unread.normalizeUnreadValue(chromiumValue({ unreadIds: [LOCAL_A] }))).toBeNull()
    expect(unread.decodeChromiumValue(Buffer.from([9, 1, 2]))).toBeNull()
  })
})

describe('private LevelDB snapshot reader', () => {
  function watchedReader() {
    const home = fixture()
    let directoryChange: (() => void) | null = null
    const recovery = new Map<string, { interval: number; listener: () => void }>()
    const watchedFs = new Proxy(fs, {
      get(target, key) {
        if (key === 'watch') return (_directory: string, _options: unknown, listener: () => void) => {
          directoryChange = listener
          return { close: () => undefined }
        }
        return Reflect.get(target, key)
      }
    })
    const reader = unread.createUnreadReader({
      fs: watchedFs,
      path,
      os: { tmpdir: () => home.scratch },
      claudeLocalStorageRoot: home.source,
      leveldown: fakeLeveldown(chromiumValue({ state: { unreadIds: [LOCAL_A] } }), []),
      watchFile: (filePath: string, options: { interval?: number }, listener: () => void) => {
        recovery.set(filePath, { interval: Number(options?.interval) || 0, listener })
      },
      unwatchFile: (filePath: string) => { recovery.delete(filePath) },
      setTimeout: () => { throw new Error('unread semantic wake must not use setTimeout') },
      setInterval: () => { throw new Error('native unread recovery must not use setInterval') }
    })
    return {
      home,
      reader,
      invokeDirectory: () => directoryChange?.(),
      recoveryFor: (filePath: string) => recovery.get(filePath)
    }
  }

  it('notifies the first unread fingerprint change synchronously and collapses duplicate callbacks', () => {
    const context = watchedReader()
    let notified = 0
    const dispose = context.reader.watch(() => { notified += 1 })
    writeFileSync(join(context.home.source, 'CURRENT'), 'MANIFEST-000002-with-a-different-size\n')
    context.invokeDirectory()
    expect(notified).toBe(1)
    context.invokeDirectory()
    expect(notified).toBe(1)
    dispose()
  })

  it('recovers a dropped unread directory callback through the native one-second StatWatcher', () => {
    const context = watchedReader()
    let notified = 0
    const dispose = context.reader.watch(() => { notified += 1 })
    const currentPath = join(context.home.source, 'CURRENT')
    const recovery = context.recoveryFor(currentPath)
    expect(recovery?.interval).toBe(1_000)

    writeFileSync(currentPath, 'MANIFEST-000003-with-another-size-change\n')
    recovery?.listener()
    expect(notified).toBe(1)
    recovery?.listener()
    expect(notified).toBe(1)
    dispose()
  })

  it('opens only a mode-0700 copy and removes it after a successful read', async () => {
    const home = fixture()
    const opened: string[] = []
    let temporaryMode = 0
    const leveldown = (databasePath: string) => {
      temporaryMode = statSync(dirname(databasePath)).mode & 0o777
      return fakeLeveldown(chromiumValue({ state: { unreadIds: [LOCAL_A] } }), opened)(databasePath)
    }
    const reader = unread.createUnreadReader({
      fs,
      path,
      os: { tmpdir: () => home.scratch },
      claudeLocalStorageRoot: home.source,
      leveldown
    })
    const result = await reader.read()
    expect(result).toMatchObject({ version: 2, ids: [LOCAL_A], revision: unread.UNREAD_READER_REVISION, generation: 1 })
    expect(result?.sourceFingerprint).toMatch(/^[a-f0-9]{32}$/)
    expect(opened).toHaveLength(1)
    expect(opened[0]).not.toBe(home.source)
    expect(temporaryMode).toBe(0o700)
    expect(existsSync(dirname(opened[0]))).toBe(false)
  })

  it('bounds retries, closes each opened database and cleans every failed copy', async () => {
    const home = fixture()
    const opened: string[] = []
    let closes = 0
    const reader = unread.createUnreadReader({
      fs,
      path,
      os: { tmpdir: () => home.scratch },
      claudeLocalStorageRoot: home.source,
      leveldown: (databasePath: string) => {
        opened.push(databasePath)
        return {
          open: (_options: unknown, done: (error?: Error | null) => void) => done(null),
          close: (done: () => void) => { closes += 1; done() },
          iterator: () => ({
            next: (done: (error?: Error | null) => void) => done(null),
            end: (done: () => void) => done()
          })
        }
      }
    })
    expect(await reader.read()).toBeNull()
    expect(opened).toHaveLength(unread.UNREAD_MAX_ATTEMPTS)
    expect(closes).toBe(unread.UNREAD_MAX_ATTEMPTS)
    expect(opened.every((databasePath) => !existsSync(dirname(databasePath)))).toBe(true)
  })

  it('discards a copy whose source changed mid-snapshot and retries from a stable generation', async () => {
    const home = fixture()
    let copies = 0
    const guardedFs = {
      ...fs,
      cpSync: (source: string, target: string, options: { recursive: boolean }) => {
        fs.cpSync(source, target, options)
        copies += 1
        if (copies === 1) writeFileSync(join(home.source, 'CURRENT'), 'MANIFEST-000002-with-a-different-size\n')
      }
    }
    const reader = unread.createUnreadReader({
      fs: guardedFs,
      path,
      os: { tmpdir: () => home.scratch },
      claudeLocalStorageRoot: home.source,
      leveldown: fakeLeveldown(chromiumValue({ state: { unreadIds: [LOCAL_A] } }), [])
    })
    expect(await reader.read()).toMatchObject({ version: 2, ids: [LOCAL_A], generation: 1 })
    expect(copies).toBe(2)
  })

  it('shares one in-flight snapshot across Host and Renderer readers', async () => {
    const home = fixture()
    let openCalls = 0
    let finishOpen: (error?: Error | null) => void = () => undefined
    const reader = unread.createUnreadReader({
      fs,
      path,
      os: { tmpdir: () => home.scratch },
      claudeLocalStorageRoot: home.source,
      leveldown: () => {
        let emitted = false
        return {
          open: (_options: unknown, done: (error?: Error | null) => void) => {
            openCalls += 1
            finishOpen = done
          },
          close: (done: () => void) => done(),
          iterator: () => ({
            next: (done: (error?: Error | null, key?: Buffer, row?: Buffer) => void) => {
              if (emitted) { done(null); return }
              emitted = true
              done(null, Buffer.from(unread.UNREAD_LEVELDB_KEY), chromiumValue({ state: { unreadIds: [LOCAL_A] } }))
            },
            end: (done: () => void) => done()
          })
        }
      }
    })

    const hostRead = reader.read()
    const rendererRead = reader.read()
    expect(rendererRead).toBe(hostRead)
    expect(openCalls).toBe(1)
    finishOpen(null)
    await expect(Promise.all([hostRead, rendererRead])).resolves.toEqual([
      expect.objectContaining({ ids: [LOCAL_A], generation: 1 }),
      expect.objectContaining({ ids: [LOCAL_A], generation: 1 })
    ])
    expect(openCalls).toBe(1)
  })

  it('ignores a suffix lure and reads only the exact Claude origin key', async () => {
    const home = fixture()
    const lure = chromiumValue({ state: { unreadIds: [LOCAL_B] } })
    const exact = chromiumValue({ state: { unreadIds: [LOCAL_A] } })
    const reader = unread.createUnreadReader({
      fs,
      path,
      os: { tmpdir: () => home.scratch },
      claudeLocalStorageRoot: home.source,
      leveldown: fakeLeveldownRows([
        [`_https://not-claude.invalid\u0000${unread.UNREAD_STORE_KEY}`, lure],
        [unread.UNREAD_LEVELDB_KEY, exact]
      ])
    })
    expect(await reader.read()).toMatchObject({ ids: [LOCAL_A] })
  })

  it('resolves only the host-owned signed module path and fails closed if absent', () => {
    const requests: string[] = []
    const hostModule = () => ({})
    expect(unread.resolveLeveldown({
      path,
      platform: 'darwin',
      resourcesPath: '/Applications/uTools.app/Contents/Resources',
      requireModule: (request: string) => { requests.push(request); return hostModule }
    })).toBe(hostModule)
    expect(requests).toEqual(['/Applications/uTools.app/Contents/Resources/app.asar/node_modules/leveldown'])
    expect(unread.resolveLeveldown({
      path,
      platform: 'darwin',
      resourcesPath: '/missing',
      requireModule: () => { throw new Error('absent') }
    })).toBeNull()
  })

  it('contains no packaged native-addon import fallback', () => {
    const source = readFileSync(resolve(process.cwd(), 'preload/claude/unread.cjs'), 'utf8')
    expect(source).not.toContain("require('leveldown')")
  })
})
