import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

const root = resolve(import.meta.dirname, '..')
const moduleRoot = resolve(root, 'dist', 'claude')
const requiredModules = ['app-state.cjs', 'code-sessions.cjs', 'events.cjs', 'environment.cjs', 'scripts.cjs']

function finish(result, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = exitCode
}

function shellPath(command) {
  const value = typeof command === 'string' ? command.trim() : ''
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/'\\''/g, "'")
  }
  return value && !/\s/.test(value) ? value : ''
}

if (requiredModules.some((name) => !existsSync(join(moduleRoot, name)))) {
  finish({ status: 'unavailable', reason: 'built-claude-modules-missing' }, 2)
} else {
  const settingsPath = join(homedir(), '.claude', 'settings.json')
  let settings = null
  try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')) } catch { settings = null }
  const hookCommands = []
  for (const rows of Object.values(settings?.hooks || {})) {
    for (const row of Array.isArray(rows) ? rows : []) {
      for (const hook of Array.isArray(row?.hooks) ? row.hooks : []) {
        if (typeof hook?.command === 'string' && hook.command.includes('eypc-claude-companion-hook')) {
          hookCommands.push(hook.command)
        }
      }
    }
  }
  const uniqueHookCommands = [...new Set(hookCommands)]
  const hookPath = uniqueHookCommands.length === 1 ? shellPath(uniqueHookCommands[0]) : ''
  const statuslineCommand = typeof settings?.statusLine?.command === 'string'
    && settings.statusLine.command.includes('eypc-claude-companion-statusline')
    ? settings.statusLine.command
    : ''
  const statuslinePath = shellPath(statuslineCommand)
  if (!hookPath || !statuslinePath || dirname(hookPath) !== dirname(statuslinePath)) {
    finish({ status: 'unavailable', reason: 'registered-bridge-path-unresolved' }, 2)
  } else {
    const require_ = createRequire(import.meta.url)
    const code = require_(join(moduleRoot, 'code-sessions.cjs'))
    const appStateModule = require_(join(moduleRoot, 'app-state.cjs'))
    const events = require_(join(moduleRoot, 'events.cjs'))
    const environmentModule = require_(join(moduleRoot, 'environment.cjs'))
    const scripts = require_(join(moduleRoot, 'scripts.cjs'))
    const dataDirectory = dirname(hookPath)
    const dependencies = { fs, path, os: { homedir }, execFileSync, platform: process.platform }
    const environment = environmentModule.createEnvironmentProbe(dependencies).inspect({
      hookCommand: uniqueHookCommands[0],
      statuslineCommand
    })
    const queue = events.createEventQueue({ fs, path, directory: dataDirectory })
    const queueEntries = queue.drain()
    const reader = code.createCodeSessionReader(dependencies)
    const inventory = reader.readInventory({ now: Date.now() })
    const appStateReader = appStateModule.createAppStateReader(dependencies)
    const appSnapshot = appStateReader.read()
    const correlated = code.correlateCodeSessions(inventory.sessions, queue.state(), new Map(), appSnapshot).sessions
    const phaseCounts = Object.fromEntries(['running', 'waiting-approval', 'waiting-input', 'completed', 'stopped', 'unknown']
      .map((phase) => [phase, correlated.filter((row) => row.phase === phase).length]))
    const correlationCounts = Object.fromEntries(['direct-local', 'unique-cli', 'metadata-pulse', 'ambiguous', 'none']
      .map((correlation) => [correlation, correlated.filter((row) => row.statusCorrelation === correlation).length]))
    const stateSourceCounts = Object.fromEntries(['app-log', 'hook', 'metadata-history', 'none']
      .map((source) => [source, correlated.filter((row) => row.stateSource === source).length]))
    let quota = null
    try { quota = scripts.parseQuotaCache(readFileSync(join(dataDirectory, scripts.QUOTA_FILE_NAME), 'utf8')) } catch { quota = null }
    const quotaKeys = quota?.rateLimits && typeof quota.rateLimits === 'object' ? Object.keys(quota.rateLimits) : []
    reader.close()
    appStateReader.close()
    const accepted = environment.hooks === 'installed'
      && environment.statusline === 'installed'
      && appSnapshot.compatibility === 'compatible'
      && inventory.sessions.length > 0
    finish({
      status: accepted ? 'ok' : 'unknown',
      hooks: environment.hooks,
      statusline: environment.statusline,
      hookEntries: hookCommands.length,
      queueEntriesRead: queueEntries.length,
      codeSessionCount: inventory.sessions.length,
      completedTurnsRows: inventory.sessions.filter((row) => row.completedTurns > 0).length,
      phaseCounts,
      correlationCounts,
      stateSourceCounts,
      appStateCompatibility: appSnapshot.compatibility,
      appVersion: appSnapshot.appVersion,
      nativeUnread: 'separate-utools-host-probe',
      quotaWindowCount: quotaKeys.length,
      scopedQuotaWindowCount: quotaKeys.filter((key) => /^(five_hour|seven_day)[_-].+/.test(key)).length,
      accepted
    }, accepted ? 0 : 1)
  }
}
