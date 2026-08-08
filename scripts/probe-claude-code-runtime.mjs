import { createRequire } from 'node:module'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

const root = resolve(import.meta.dirname, '..')
const codeModulePath = resolve(root, 'dist', 'claude', 'code-sessions.cjs')
const eventModulePath = resolve(root, 'dist', 'claude', 'events.cjs')
const attempts = 30
const hookAttempts = 100

function finish(result, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = exitCode
}

function percentile95(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return Math.round(sorted[index] * 100) / 100
}

if (!existsSync(codeModulePath) || !existsSync(eventModulePath)) {
  finish({ status: 'unavailable', reason: 'built-claude-modules-missing' }, 2)
} else {
  const require_ = createRequire(import.meta.url)
  const code = require_(codeModulePath)
  const events = require_(eventModulePath)
  const reader = code.createCodeSessionReader({ fs, path, os: { homedir }, platform: process.platform })
  if (!existsSync(reader.codeRoot())) {
    finish({ status: 'unavailable', reason: 'claude-code-root-missing' }, 2)
  } else {
    const inventoryTimings = []
    let latest = null
    for (let index = 0; index < attempts; index += 1) {
      const startedAt = performance.now()
      latest = reader.readInventory({ now: Date.now() })
      inventoryTimings.push(performance.now() - startedAt)
    }
    const allowedFields = new Set([
      'sessionId', 'cliSessionId', 'title', 'cwd', 'originCwd', 'createdAt',
      'lastActivityAt', 'lastFocusedAt', 'model', 'isArchived', 'completedTurns', 'metadataUpdatedAt', 'projectKey'
    ])
    const rows = latest?.sessions || []
    const invalidIds = rows.filter((row) => !code.LOCAL_SESSION_PATTERN.test(row.sessionId)
      || !code.CLI_SESSION_PATTERN.test(row.cliSessionId)).length
    const extraFieldRows = rows.filter((row) => Object.keys(row).some((key) => !allowedFields.has(key))).length
    const blankTitleRows = rows.filter((row) => !String(row.title || '').trim()).length
    const archivedRows = rows.filter((row) => row.isArchived === true).length

    const temporary = mkdtempSync(join(tmpdir(), 'eypc-claude-hook-probe-'))
    mkdirSync(temporary, { recursive: true })
    const queue = events.createEventQueue({ fs, path, directory: temporary })
    queue.ensureQueueFile()
    const hookTimings = []
    const measureHook = (index) => new Promise((resolvePromise) => {
      const startedAt = performance.now()
      let settled = false
      const dispose = queue.watch(() => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        hookTimings.push(performance.now() - startedAt)
        dispose()
        resolvePromise(true)
      }, { coalesceMs: 50, recoveryPollMs: 1000 })
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        dispose()
        resolvePromise(false)
      }, 1500)
      setTimeout(() => {
        appendFileSync(queue.queuePath, `${JSON.stringify({
          s: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          e: 'UserPromptSubmit',
          t: Date.now()
        })}\n`)
      }, 10)
    })
    try {
      for (let index = 0; index < hookAttempts; index += 1) await measureHook(index)
    } finally {
      queue.stopWatching()
      reader.close()
      rmSync(temporary, { recursive: true, force: true })
    }

    const inventoryP95Ms = percentile95(inventoryTimings)
    // This is a watcher wake-up measurement only. End-to-end publication is
    // measured in the Controller test from event callback through notify().
    const watcherWakeP95Ms = percentile95(hookTimings)
    const accepted = invalidIds === 0
      && extraFieldRows === 0
      && hookTimings.length === hookAttempts
      && inventoryP95Ms <= 250
      && watcherWakeP95Ms <= 250
    finish({
      status: accepted ? 'ok' : 'unknown',
      inventoryReads: attempts,
      codeSessionCount: rows.length,
      blankTitleRows,
      archivedRows,
      invalidIds,
      extraFieldRows,
      inventoryP95Ms,
      watcherWakeEvents: hookTimings.length,
      watcherWakeP95Ms,
      watcherWakeGateMs: 250,
      endToEndPublicationMeasuredHere: false,
      accepted
    }, accepted ? 0 : 1)
  }
}
