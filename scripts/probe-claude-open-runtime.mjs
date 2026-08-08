import { execFile, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { relative, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

const root = resolve(import.meta.dirname, '..')
const codeModulePath = resolve(root, 'dist', 'claude', 'code-sessions.cjs')
const openModulePath = resolve(root, 'dist', 'claude', 'open.cjs')

function finish(result, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = exitCode
}

function metadataFiles(directory) {
  const files = []
  const visit = (candidate, depth) => {
    if (depth > 3) return
    let entries = []
    try { entries = readdirSync(candidate, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const item = path.join(candidate, entry.name)
      if (entry.isDirectory()) visit(item, depth + 1)
      else if (/^local_[0-9a-f-]{36}\.json$/i.test(entry.name)) files.push(relative(directory, item))
    }
  }
  visit(directory, 0)
  return new Set(files)
}

if (!process.argv.includes('--confirm-app-navigation')) {
  finish({ status: 'unavailable', reason: 'explicit-navigation-confirmation-required' }, 2)
} else if (!existsSync(codeModulePath) || !existsSync(openModulePath)) {
  finish({ status: 'unavailable', reason: 'built-code-module-missing' }, 2)
} else {
  let appPid = 0
  try {
    appPid = Number(String(execFileSync('pgrep', ['-f', '/Claude.app/Contents/MacOS/Claude'], {
      encoding: 'utf8', timeout: 2000
    })).split('\n').find(Boolean)) || 0
  } catch { appPid = 0 }
  if (!appPid) {
    finish({ status: 'unavailable', reason: 'claude-app-not-running' }, 2)
  } else {
    const require_ = createRequire(import.meta.url)
    const code = require_(codeModulePath)
    const openModule = require_(openModulePath)
    const reader = code.createCodeSessionReader({ fs, path, os: { homedir }, platform: process.platform })
    const inventory = reader.readInventory({ now: Date.now() })
    const targets = inventory.sessions.filter((row) => !row.isArchived).slice(0, 2)
    if (targets.length < 2) {
      reader.close()
      finish({ status: 'unavailable', reason: 'fewer-than-two-active-code-histories' }, 2)
    } else {
      const before = metadataFiles(reader.codeRoot())
      const startedAt = performance.now()
      let listCalls = 0
      const dispatches = []
      const dispatchLatencies = []
      const opener = openModule.createOpener({
        platform: process.platform,
        execFileSync,
        execFile: (file, args, options, done) => {
          const dispatchStartedAt = performance.now()
          dispatches.push({ file, url: args[0] })
          execFile(file, args, options, (error) => {
            dispatchLatencies.push(performance.now() - dispatchStartedAt)
            done(error)
          })
        },
        windows: {
          list: async () => {
            listCalls += 1
            return {
              windows: [{ appId: 'com.anthropic.claude', appName: 'Claude', relationship: 'root', pid: appPid }],
              capability: { supported: true, permission: 'granted', canList: true }
            }
          }
        }
      })
      const selectionLatencies = []
      const opens = []
      let finalTarget = targets[0]
      for (let index = 0; index < 10; index += 1) {
        finalTarget = targets[index % targets.length]
        const selectionStartedAt = performance.now()
        opens.push(opener.openTask(finalTarget.sessionId, { platform: process.platform }))
        selectionLatencies.push(performance.now() - selectionStartedAt)
      }
      const results = await Promise.all(opens)
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 3000))
      const after = metadataFiles(reader.codeRoot())
      reader.close()
      const created = [...after].filter((file) => !before.has(file)).length
      const removed = [...before].filter((file) => !after.has(file)).length
      const orderedSelection = [...selectionLatencies].sort((left, right) => left - right)
      const selectionP95Ms = orderedSelection[Math.ceil(orderedSelection.length * 0.95) - 1]
      const orderedDispatch = [...dispatchLatencies].sort((left, right) => left - right)
      const dispatchP95Ms = orderedDispatch[Math.ceil(orderedDispatch.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY
      const finalUrl = `claude://claude.ai/epitaxy/${encodeURIComponent(finalTarget.sessionId)}`
      const accepted = results.at(-1)?.outcome === 'dispatched'
        && results.slice(0, -1).every((result) => result.outcome === 'unavailable')
        && dispatches.length === 1
        && dispatches[0].url === finalUrl
        && listCalls === 1
        && selectionP95Ms <= 10
        && dispatchP95Ms <= 150
        && created === 0
        && removed === 0
        && before.size === after.size
      finish({
        status: accepted ? 'ok' : 'unknown',
        appRunning: true,
        selectedExistingHistory: true,
        shortcutCount: opens.length,
        dispatchedDeepLinks: dispatches.length,
        finalTargetMatched: dispatches[0]?.url === finalUrl,
        presenceInventoryReads: listCalls,
        selectionP95Ms: Math.round(selectionP95Ms * 100) / 100,
        dispatchP95Ms: Math.round(dispatchP95Ms * 100) / 100,
        beforeCount: before.size,
        afterCount: after.size,
        createdRows: created,
        removedRows: removed,
        observationMs: Math.round(performance.now() - startedAt),
        accepted
      }, accepted ? 0 : 1)
    }
  }
}
