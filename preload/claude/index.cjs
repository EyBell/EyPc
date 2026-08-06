'use strict'

/**
 * Claude companion bridge facade.
 *
 * This module composes the Claude provider and is the only surface the main
 * preload mounts. It is deliberately independent of the Codex bridge: a failure
 * here degrades Claude alone and can never disturb Codex inventory, quota or
 * the floating window.
 *
 * Write scope is exactly one thing — registering and unregistering the
 * companion's hook and status line entries in `~/.claude/settings.json`, plus
 * the two generated scripts and the queue/quota files inside EyPc's own data
 * directory. Nothing else in the user's Claude installation is ever modified.
 */

const CLAUDE_BRIDGE_REVISION = 'claude-companion-hooks-transcript-v1'

const { createTranscriptReader } = require('./transcript.cjs')
const { createEventQueue } = require('./events.cjs')
const { createEnvironmentProbe } = require('./environment.cjs')
const { createOpener } = require('./open.cjs')
const { createQuotaFallback } = require('./quota.cjs')
const {
  HOOK_SCRIPT_NAME,
  STATUSLINE_SCRIPT_NAME,
  QUOTA_FILE_NAME,
  hookScript,
  statuslineScript,
  settingsCommandLine,
  parseQuotaCache
} = require('./scripts.cjs')
const {
  EYPC_MARKER,
  withEypcHooks,
  withoutEypcHooks,
  withEypcStatusline,
  withoutEypcStatusline,
  chainedStatusLineCommand
} = require('./settings.cjs')

const EYPC_MARKER_TOKEN = EYPC_MARKER

/** Sessions older than this are not projected at all. */
const DEFAULT_INVENTORY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const MAX_SESSIONS = 400

function createClaudeBridge(dependencies) {
  const fs = dependencies.fs
  const path = dependencies.path
  const dataDirectory = dependencies.dataDirectory

  const environment = createEnvironmentProbe(dependencies)
  const transcripts = createTranscriptReader(dependencies)
  const queue = createEventQueue({ fs, path, directory: dataDirectory })
  const opener = createOpener(dependencies)
  const quotaFallback = createQuotaFallback(dependencies)

  const hookCommandPath = path.join(dataDirectory, HOOK_SCRIPT_NAME)
  const statuslineCommandPath = path.join(dataDirectory, STATUSLINE_SCRIPT_NAME)
  const quotaPath = path.join(dataDirectory, QUOTA_FILE_NAME)

  // Filesystem paths are what we write; shell-quoted command lines are what we
  // register. Registration and the install-state comparison must use the exact
  // same string, otherwise a correctly installed hook reads back as `outdated`
  // forever and the settings page keeps asking the user to register again.
  const hookCommandLine = settingsCommandLine(hookCommandPath, dependencies.platform)
  const statuslineCommandLine = settingsCommandLine(statuslineCommandPath, dependencies.platform)

  let eventWatchDispose = null

  // Newest CLI version seen in a transcript. Claude Code stamps every entry
  // with the version that wrote it, which avoids spawning the binary just to
  // ask what it is.
  let observedCliVersion = ''

  function inspect() {
    return environment.inspect({
      hookCommand: hookCommandLine,
      statuslineCommand: statuslineCommandLine,
      cliVersionHint: observedCliVersion
    })
  }

  function writeExecutable(filePath, contents) {
    fs.mkdirSync(dataDirectory, { recursive: true })
    fs.writeFileSync(filePath, contents, { mode: 0o755 })
    try { fs.chmodSync(filePath, 0o755) } catch { /* filesystem without exec bits */ }
  }

  /**
   * Replaces the settings file atomically, keeping a one-generation backup of
   * whatever was there before. The caller must already have proven the current
   * contents were understood — see `readableSettings()`.
   */
  function writeSettings(next, previousRaw) {
    const settingsPath = environment.settingsPath()
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    if (typeof previousRaw === 'string' && previousRaw) {
      try { fs.writeFileSync(`${settingsPath}.eypc-bak`, previousRaw) } catch { /* backup is best effort */ }
    }
    const serialized = `${JSON.stringify(next, null, 2)}\n`
    const temporary = `${settingsPath}.eypc-tmp`
    fs.writeFileSync(temporary, serialized)
    fs.renameSync(temporary, settingsPath)
  }

  /**
   * Returns the current settings only when they were fully understood. An
   * unparseable or unreadable file is a hard stop: writing over it would
   * destroy configuration the user still owns.
   */
  function readableSettings() {
    const result = environment.inspectSettingsFile()
    if (result.state === 'unparseable' || result.state === 'unreadable') {
      return { ok: false, message: result.reason || '无法安全读取 settings.json' }
    }
    return { ok: true, value: result.value, raw: result.raw }
  }

  /**
   * Registers the companion. This is the bridge's only write into the user's
   * Claude installation and the caller must have obtained an explicit
   * confirmation before invoking it.
   */
  function install(options) {
    const settings = options || {}
    const current = readableSettings()
    if (!current.ok) return { ok: false, message: current.message }
    try {
      queue.ensureQueueFile()
      writeExecutable(hookCommandPath, hookScript({ queuePath: queue.queuePath }))
      let next = withEypcHooks(current.value, { command: hookCommandLine })
      if (settings.statusline !== false) {
        // Only a status line that is not ours may be chained to. Matching on the
        // marker rather than on a file name is what stops a re-install from
        // wiring the wrapper into itself, which would recurse on every render.
        const chained = chainedStatusLineCommand(next) || (() => {
          const command = next.statusLine && typeof next.statusLine.command === 'string' ? next.statusLine.command : ''
          return command && !command.includes(EYPC_MARKER_TOKEN) ? command : ''
        })()
        writeExecutable(statuslineCommandPath, statuslineScript({ quotaPath, chainedCommand: chained }))
        next = withEypcStatusline(next, { command: statuslineCommandLine })
      }
      writeSettings(next, current.raw)
      return { ok: true, hooks: 'installed', statusline: settings.statusline === false ? 'missing' : 'installed' }
    } catch (error) {
      return { ok: false, message: error && error.message ? String(error.message) : '注册失败' }
    }
  }

  /**
   * Removes every entry the companion added to the user's settings and restores
   * any status line it replaced. The generated scripts and EyPc's own queue and
   * quota cache stay in EyPc's data directory; nothing outside that directory is
   * left behind.
   */
  function uninstall() {
    const current = readableSettings()
    if (!current.ok) return { ok: false, message: current.message }
    try {
      writeSettings(withoutEypcStatusline(withoutEypcHooks(current.value)), current.raw)
      return { ok: true }
    } catch (error) {
      return { ok: false, message: error && error.message ? String(error.message) : '注销失败' }
    }
  }

  function readQuota() {
    try {
      return parseQuotaCache(fs.readFileSync(quotaPath, 'utf8'))
    } catch {
      return null
    }
  }

  /**
   * Builds the current session inventory.
   *
   * Transcript evidence is the cold baseline; hook state layered on top is the
   * exact, current evidence. A session with neither is simply not reported.
   */
  /**
   * Optional fallback read. Separated from `readSnapshot` because it is
   * asynchronous and opt-in: the synchronous snapshot must never block on a
   * network call.
   */
  async function readQuotaFallback(options) {
    const settings = options || {}
    const cached = readQuota()
    return quotaFallback.read({
      enabled: settings.enabled === true,
      coldStart: settings.coldStart === true,
      now: settings.now,
      minStaleMs: settings.minStaleMs,
      primaryUpdatedAt: cached ? cached.updatedAt : 0,
      claudeHome: environment.claudeHome()
    })
  }

  function readSnapshot(options) {
    const settings = options || {}
    const now = Number.isFinite(settings.now) ? settings.now : Date.now()
    const windowMs = Number.isFinite(settings.windowMs) ? settings.windowMs : DEFAULT_INVENTORY_WINDOW_MS
    queue.rotateIfNeeded()
    queue.drain()
    const hookState = queue.state()
    // Cheap mtime gate before any tail read. Enumerating is cheap; opening and
    // reading up to 256 KB from every transcript a user has ever created is not,
    // and this runs synchronously on the renderer thread every task tick.
    const rows = environment.listTranscripts().filter((row) => {
      if (!Number.isFinite(row.mtimeMs) || row.mtimeMs <= 0) return true
      return now - row.mtimeMs <= windowMs
    })
    const sessions = []
    for (const row of rows) {
      const summary = transcripts.summarize(row.filePath, row.sessionId)
      if (!summary) continue
      // Transcript timestamps are authoritative for activity because they
      // describe the conversation itself; file mtime is only the fallback the
      // reader already applied when the tail carried no parseable timestamp.
      // Preferring mtime here would make a restored or copied transcript look
      // freshly active.
      const updatedAt = summary.lastEventAt || 0
      if (!updatedAt || now - updatedAt > windowMs) continue
      if (summary.cliVersion) observedCliVersion = summary.cliVersion
      const hook = hookState.get(row.sessionId) || null
      sessions.push({
        sessionId: row.sessionId,
        projectSlug: row.projectSlug,
        // The transcript is the only source for cwd; the hook deliberately does
        // not report it, because a text match there can pick up a tool argument.
        cwd: summary.cwd || '',
        gitBranch: summary.gitBranch || '',
        startedAt: summary.startedAt || 0,
        updatedAt: Math.max(updatedAt, hook && hook.hookEventAt ? hook.hookEventAt : 0),
        lastPromptAt: summary.lastPromptAt || 0,
        lastAssistantAt: summary.lastAssistantAt || 0,
        lastStopAt: hook && hook.hookEvent === 'stop' ? hook.hookEventAt : 0,
        model: summary.model || '',
        isSidechain: summary.isSidechain === true,
        parentSessionId: summary.parentSessionId || '',
        turns: summary.turns || 0,
        pendingToolUse: summary.pendingToolUse || 0,
        contextTokens: summary.contextTokens || 0,
        hookEvent: hook ? hook.hookEvent : null,
        hookEventAt: hook ? hook.hookEventAt : 0,
        pid: hook ? hook.pid : 0
      })
    }
    sessions.sort((left, right) => right.updatedAt - left.updatedAt)
    const limited = sessions.length > MAX_SESSIONS ? sessions.slice(0, MAX_SESSIONS) : sessions
    const quota = readQuota()
    return {
      version: 1,
      revision: CLAUDE_BRIDGE_REVISION,
      sessions: limited,
      truncated: sessions.length > limited.length,
      quota: quota ? { rateLimits: quota.rateLimits, updatedAt: quota.updatedAt } : null,
      readAt: now
    }
  }

  function openTask(sessionId, options) {
    const settings = options || {}
    return opener.openTask(String(sessionId || ''), {
      pid: settings.pid,
      cwd: settings.cwd,
      cliPath: environment.locateCli(),
      platform: dependencies.platform
    })
  }

  /**
   * Subscribes to hook-queue appends. One subscription at a time: the Controller
   * owns exactly one lane, and leaking watchers across provider toggles would
   * fan one event out into several redundant reads.
   */
  function watchEvents(listener, options) {
    if (eventWatchDispose) {
      eventWatchDispose()
      eventWatchDispose = null
    }
    if (typeof listener !== 'function') return () => {}
    const dispose = queue.watch(listener, options)
    eventWatchDispose = dispose
    return () => {
      if (eventWatchDispose === dispose) eventWatchDispose = null
      dispose()
    }
  }

  function close() {
    if (eventWatchDispose) {
      eventWatchDispose()
      eventWatchDispose = null
    }
    queue.reset()
    quotaFallback.reset()
  }

  return {
    revision: CLAUDE_BRIDGE_REVISION,
    hookCommandPath,
    statuslineCommandPath,
    hookCommandLine,
    statuslineCommandLine,
    quotaPath,
    queuePath: queue.queuePath,
    inspect,
    install,
    uninstall,
    readSnapshot,
    readQuota,
    readQuotaFallback,
    watchEvents,
    openTask,
    close
  }
}

module.exports = {
  CLAUDE_BRIDGE_REVISION,
  DEFAULT_INVENTORY_WINDOW_MS,
  MAX_SESSIONS,
  createClaudeBridge
}
