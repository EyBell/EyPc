import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const unreadModule = resolve(root, 'dist', 'claude', 'unread.cjs')
const utoolsExecutable = process.env.EYPC_UTOOLS_EXECUTABLE || '/Applications/uTools.app/Contents/MacOS/uTools'
const attempts = 30

function finish(result, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = exitCode
}

function classifyHostFailure(stderr) {
  const text = String(stderr || '')
  if (text.includes('SyntaxError')) return 'syntax-error'
  if (text.includes('Cannot find module')) return 'module-not-found'
  if (text.includes('ERR_DLOPEN_FAILED')) return 'native-addon-load-failed'
  if (text.includes('ReferenceError')) return 'reference-error'
  if (text.includes('TypeError')) return 'type-error'
  return 'unknown-host-error'
}

if (!existsSync(utoolsExecutable)) {
  finish({ status: 'unavailable', reason: 'utools-host-missing' }, 2)
} else if (!existsSync(unreadModule)) {
  finish({ status: 'unavailable', reason: 'built-unread-module-missing' }, 2)
} else {
  const childSource = String.raw`
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const unread = require(${JSON.stringify(unreadModule)})
const prefix = 'eypc-claude-unread-'
const tempNames = () => {
  try { return new Set(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(prefix))) }
  catch { return new Set() }
}
const before = tempNames()
const reader = unread.createUnreadReader({ fs, path, os, platform: 'darwin' })
;(async () => {
  const timings = []
  const counts = []
  let successfulReads = 0
  for (let index = 0; index < ${attempts}; index += 1) {
    const startedAt = performance.now()
    const result = await reader.read()
    timings.push(performance.now() - startedAt)
    if (result) {
      successfulReads += 1
      counts.push(result.ids.length)
    }
  }
  reader.close()
  const after = tempNames()
  const leaks = [...after].filter((name) => !before.has(name)).length
  timings.sort((left, right) => left - right)
  const p95Index = Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1)
  console.log(JSON.stringify({
    status: successfulReads === ${attempts} && leaks === 0 ? 'ok' : 'unknown',
    attempts: ${attempts},
    successfulReads,
    unreadCountMin: counts.length ? Math.min(...counts) : null,
    unreadCountMax: counts.length ? Math.max(...counts) : null,
    p95Ms: Math.round(timings[p95Index] * 100) / 100,
    leakedTempDirectories: leaks
  }))
})().catch((error) => {
  const category = error && typeof error.name === 'string' ? error.name : 'Error'
  console.log(JSON.stringify({ status: 'unknown', reason: 'reader-exception', category }))
  process.exitCode = 1
})
`
  const child = spawnSync(utoolsExecutable, ['-e', childSource], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  const lines = String(child.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean)
  let result = null
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { result = JSON.parse(lines[index]); break } catch { /* host noise is not evidence */ }
  }
  if (!result || child.error) {
    finish({
      status: 'unknown',
      reason: child.error?.code === 'ETIMEDOUT' ? 'host-timeout' : 'host-process-failed',
      category: classifyHostFailure(child.stderr),
      exitCode: child.status,
      signal: child.signal || ''
    }, 1)
  } else if (child.status !== 0) {
    finish({ ...result, accepted: false }, 1)
  } else {
    const accepted = result.status === 'ok'
      && result.successfulReads === attempts
      && result.leakedTempDirectories === 0
      && Number.isFinite(result.p95Ms)
      && result.p95Ms <= 250
    finish({ ...result, latencyGateMs: 250, accepted }, accepted ? 0 : 1)
  }
}
