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
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'eypc-claude-quota-key-'))
fs.chmodSync(temporary, 0o700)
const snapshot = path.join(temporary, 'snapshot')
const matches = []
const quotaQueries = []
const decoded = (value) => {
  if (!Buffer.isBuffer(value) || value.length < 2) return ''
  if (value[0] === 1) return value.subarray(1).toString('utf8')
  if (value[0] === 0) return value.subarray(1).toString('utf16le')
  return value.toString('utf8')
}
const redact = (value) => String(value || '')
  .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/ig, '<id>')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, '<email>')
  .slice(0, 500)
const collectQuotaQueries = (parsed) => {
  const queries = parsed && parsed.clientState && Array.isArray(parsed.clientState.queries)
    ? parsed.clientState.queries
    : []
  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index]
    const queryKey = JSON.stringify(query && query.queryKey || null)
    if (!/(usage|limit|quota|rate.?limit)/i.test(queryKey)) continue
    const data = query && query.state && query.state.data
    quotaQueries.push({
      index,
      queryKey: redact(queryKey),
      dataKeys: data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data).slice(0, 80) : [],
      dataUpdatedAt: Number(query && query.state && query.state.dataUpdatedAt) || 0
    })
  }
}
;(async () => {
  if (!leveldown) throw new Error('host-leveldown-unavailable')
  fs.cpSync(reader.sourceRoot(), snapshot, { recursive: true })
  const database = leveldown(snapshot)
  await new Promise((resolvePromise, rejectPromise) => database.open({ createIfMissing: false }, (error) => error ? rejectPromise(error) : resolvePromise()))
  const iterator = database.iterator({ keyAsBuffer: true, valueAsBuffer: true })
  await new Promise((resolvePromise, rejectPromise) => {
    const next = () => iterator.next((error, key, value) => {
      if (error) { rejectPromise(error); return }
      if (key === undefined) { iterator.end(() => resolvePromise()); return }
      const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(String(key || ''))
      const keyText = keyBuffer.toString('utf8')
      const valueText = decoded(value)
      const reactQueryCache = keyText.endsWith('\x01react-query-cache-ls')
      if (reactQueryCache) {
        try { collectQuotaQueries(JSON.parse(valueText)) } catch {}
      }
      if (/fable/i.test(keyText) || reactQueryCache) {
        let json = false
        try { JSON.parse(valueText); json = true } catch {}
        matches.push({
          key: keyText
            .replace(/local_[0-9a-f-]{36}/ig, 'local_<redacted>')
            .replace(/[^\x20-\x7e]/g, (character) => '\\x' + character.charCodeAt(0).toString(16).padStart(2, '0')),
          keyBytes: keyBuffer.length,
          valueBytes: Buffer.isBuffer(value) ? value.length : 0,
          json
        })
      }
      next()
    })
    next()
  })
  await new Promise((resolvePromise) => database.close(() => resolvePromise()))
  console.log(JSON.stringify({
    status: matches.length ? 'ok' : 'unknown',
    matchCount: matches.length,
    matches: matches.slice(0, 20),
    quotaQueries
  }))
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
