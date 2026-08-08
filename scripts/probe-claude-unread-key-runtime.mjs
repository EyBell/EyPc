import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const unreadModule = resolve(root, 'dist', 'claude', 'unread.cjs')
const utoolsExecutable = process.env.EYPC_UTOOLS_EXECUTABLE || '/Applications/uTools.app/Contents/MacOS/uTools'

function finish(result, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = exitCode
}

if (!existsSync(utoolsExecutable) || !existsSync(unreadModule)) {
  finish({ status: 'unavailable', reason: 'host-or-module-missing' }, 2)
} else {
  const childSource = String.raw`
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const unread = require(${JSON.stringify(unreadModule)})
const reader = unread.createUnreadReader({ fs, path, os, platform: 'darwin' })
const leveldown = unread.resolveLeveldown({ fs, path, os, platform: 'darwin' })
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'eypc-claude-unread-key-'))
fs.chmodSync(temporary, 0o700)
const snapshot = path.join(temporary, 'snapshot')
const matches = []
const close = (database) => new Promise((resolvePromise) => {
  try { database.close(() => resolvePromise()) } catch { resolvePromise() }
})
;(async () => {
  if (!leveldown) throw new Error('host-leveldown-unavailable')
  fs.cpSync(reader.sourceRoot(), snapshot, { recursive: true })
  const database = leveldown(snapshot)
  await new Promise((resolvePromise, rejectPromise) => database.open({ createIfMissing: false }, (error) => error ? rejectPromise(error) : resolvePromise()))
  const iterator = database.iterator({ keyAsBuffer: true, valueAsBuffer: true })
  await new Promise((resolvePromise, rejectPromise) => {
    const next = () => iterator.next((error, key) => {
      if (error) { rejectPromise(error); return }
      if (key === undefined) { iterator.end(() => resolvePromise()); return }
      const buffer = Buffer.isBuffer(key) ? key : Buffer.from(String(key || ''))
      const text = buffer.toString('utf8')
      if (text.endsWith(unread.UNREAD_STORE_KEY)) {
        matches.push({
          byteLength: buffer.length,
          escaped: text.replace(/[^\x20-\x7e]/g, (character) => '\\x' + character.charCodeAt(0).toString(16).padStart(2, '0')),
          hex: buffer.toString('hex')
        })
      }
      next()
    })
    next()
  })
  await close(database)
  console.log(JSON.stringify({ status: matches.length ? 'ok' : 'unknown', matchCount: matches.length, matches }))
})().catch((error) => {
  console.log(JSON.stringify({ status: 'unknown', reason: String(error && error.message || error || 'probe-failed') }))
  process.exitCode = 1
}).finally(() => {
  reader.close()
  try { fs.rmSync(temporary, { recursive: true, force: true }) } catch {}
})
`
  const child = spawnSync(utoolsExecutable, ['-e', childSource], {
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  const lines = String(child.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean)
  let result = null
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { result = JSON.parse(lines[index]); break } catch {}
  }
  finish(result || { status: 'unknown', reason: 'no-structured-result', exitCode: child.status }, result?.status === 'ok' ? 0 : 1)
}
