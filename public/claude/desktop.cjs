'use strict'

/**
 * Claude Desktop (Cowork) session reader.
 *
 * Strictly read-only: this module never writes, renames or touches anything
 * under the desktop app's data directory. It discovers
 * `local-agent-mode-sessions/<org>/<user>/local_<uuid>.json` metadata files and
 * tails the sibling `local_<uuid>/audit.jsonl` event logs.
 *
 * Privacy reduction happens HERE, before anything crosses the bridge: metadata
 * survives only through an explicit whitelist (the raw file carries
 * `systemPrompt`, `initialMessage`, account identity and other content-bearing
 * fields), and audit lines are reduced to event class + timestamp + the scalar
 * permission/rate-limit fields. `message`, `tool_input` and result bodies are
 * parsed and immediately discarded. The classification table mirrors
 * `src/domain/claudeDesktop.ts` (`normalizeClaudeDesktopAuditLine`) — keep the
 * two in sync.
 */

const CLAUDE_DESKTOP_READER_REVISION = 'claude-desktop-readonly-v1'

/** Tail window per audit log; events older than this are the domain's problem. */
const DESKTOP_TAIL_BYTES = 64 * 1024
/**
 * Hard ceiling when widening the tail window to reach a line boundary. Audit
 * lines carry tool input and result bodies, so one line can exceed the default
 * window; without widening, such a file parsed to zero events.
 */
const DESKTOP_TAIL_MAX_BYTES = 1024 * 1024
/** Metadata beyond this size is treated as corrupt rather than parsed. */
const DESKTOP_METADATA_MAX_BYTES = 1024 * 1024
const DESKTOP_MAX_SESSIONS = 200
/** The app's own plan-usage history, a sibling of `local-agent-mode-sessions`. */
const PLAN_USAGE_FILE_NAME = 'plan-usage-history.json'
/** ~420 five-minute samples measure ~36KB; anything far larger is not this file. */
const PLAN_USAGE_MAX_BYTES = 4 * 1024 * 1024
const DEFAULT_DESKTOP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
/** Watcher debounce; metadata heartbeats arrive at minute granularity. */
const DESKTOP_WATCH_DEBOUNCE_MS = 500
const DESKTOP_MAX_WATCHED_DIRS = 8

const METADATA_PATTERN = /^local_[0-9a-f][0-9a-f-]*\.json$/i
/**
 * Shape a `sessionId` must have before it may be used as a path segment.
 *
 * The id is read out of the metadata file's *contents*, not its name, so it is
 * attacker-shaped data as far as this reader is concerned. Without this gate a
 * crafted `{"sessionId":"../../../x"}` made the reader stat and summarize files
 * outside the Claude data root and hand the results to the renderer (P5
 * review). Directory reads stay inside the root by construction; this keeps the
 * per-session audit path inside it too.
 */
const SESSION_ID_PATTERN = /^local_[0-9a-f][0-9a-f-]*$/i

/** Chromium Local Storage files worth scanning for the unread store. */
const UNREAD_STORE_FILE = /\.(log|ldb)$/i
const UNREAD_STORE_KEY = 'epitaxy-unread-v1'
/** Bytes to search after the key before giving up on this occurrence. */
const UNREAD_VALUE_WINDOW = 64 * 1024
/**
 * Matches this one store and nothing else. A generic "next JSON object" scan
 * would happily pick up whichever neighbouring record the framing landed on.
 */
const UNREAD_VALUE_PATTERN = /\{"state":\{"unreadIds":\[[^\]]*\]\},"version":\d+\}/
const UNREAD_STORE_MAX_BYTES = 64 * 1024 * 1024
const UNREAD_MAX_IDS = 500

function textOf(value) {
  return typeof value === 'string' ? value : ''
}

function numberOf(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function timestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 1e11 ? Math.round(value) : Math.round(value * 1000)
  }
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return 0
}

/**
 * Bridge-side twin of the domain's audit-line classifier. Returns only the
 * privacy-safe scalars; every other field of the parsed line is dropped on the
 * floor right here.
 */
function classifyAuditLine(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const at = timestampMs(parsed.timestamp)
  if (at <= 0) return null
  const type = textOf(parsed.type)
  const subtype = textOf(parsed.subtype)
  if (type === 'system') {
    if (subtype === 'init') return { event: 'init', at }
    if (subtype === 'status') return { event: 'status', at }
    if (subtype === 'permission_request') return { event: 'permission-request', at }
    if (subtype === 'permission_response') return { event: 'permission-response', at, granted: parsed.granted === true }
    return { event: 'activity', at }
  }
  if (type === 'command_lifecycle') {
    return { event: textOf(parsed.state) === 'completed' ? 'command-completed' : 'command-started', at }
  }
  if (type === 'result') return { event: 'result', at }
  if (type === 'rate_limit_event') {
    const info = parsed.rate_limit_info && typeof parsed.rate_limit_info === 'object' && !Array.isArray(parsed.rate_limit_info)
      ? parsed.rate_limit_info
      : {}
    const resetsAt = timestampMs(info.resetsAt)
    return {
      event: 'rate-limit',
      at,
      rateLimit: {
        resetsAt: resetsAt > 0 ? resetsAt : null,
        limited: textOf(info.status) !== '' && textOf(info.status) !== 'allowed',
        windowType: textOf(info.rateLimitType)
      }
    }
  }
  if (!type) return null
  return { event: 'activity', at }
}

function createDesktopReader(dependencies) {
  const fs = dependencies.fs
  const path = dependencies.path
  const os = dependencies.os
  const platform = dependencies.platform || process.platform

  function desktopRoot() {
    const override = typeof dependencies.claudeDesktopRoot === 'string' ? dependencies.claudeDesktopRoot.trim() : ''
    if (override) return override
    const home = os.homedir()
    if (platform === 'darwin') {
      return path.join(home, 'Library', 'Application Support', 'Claude', 'local-agent-mode-sessions')
    }
    if (platform === 'win32') {
      const environment = dependencies.env || process.env || {}
      const base = textOf(environment.LOCALAPPDATA) || path.join(home, 'AppData', 'Local')
      return path.join(base, 'Claude', 'local-agent-mode-sessions')
    }
    return path.join(home, '.config', 'Claude', 'local-agent-mode-sessions')
  }

  function listSubdirectories(directory) {
    try {
      return fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
    } catch {
      return []
    }
  }

  /** `<root>/<org>/<user>` directories; every level is best-effort. */
  function userDirectories() {
    const root = desktopRoot()
    const directories = []
    for (const org of listSubdirectories(root)) {
      const orgPath = path.join(root, org)
      for (const user of listSubdirectories(orgPath)) {
        directories.push(path.join(orgPath, user))
      }
    }
    return directories
  }

  function safeStat(filePath) {
    try {
      return fs.statSync(filePath)
    } catch {
      return null
    }
  }

  /**
   * Latest sample from the desktop app's own plan-usage history.
   *
   * Verified against a real installation (2026-08-06): the app appends
   * `{t, org, u:{fh, sd}}` roughly every five minutes and the last entry is what
   * its `Plan usage limits` panel displays. That makes it the one local source
   * whose freshness does not depend on Claude Code rendering a status line, and
   * it needs no credentials at all.
   *
   * Read-only and bounded, like every other desktop read: only the two numeric
   * percentages and the timestamp leave this function. `org` is deliberately
   * dropped — it is an account identifier and nothing downstream needs it.
   */
  function readPlanUsage() {
    const filePath = path.join(path.dirname(desktopRoot()), PLAN_USAGE_FILE_NAME)
    const stat = safeStat(filePath)
    if (!stat || !stat.isFile() || stat.size > PLAN_USAGE_MAX_BYTES) return null
    let parsed = null
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      return null
    }
    const samples = parsed && Array.isArray(parsed.samples) ? parsed.samples : null
    if (!samples || !samples.length) return null
    // Newest by timestamp rather than by position: the file is append-ordered in
    // practice, but a reading that silently walks backwards is the worse failure.
    let newest = null
    for (const sample of samples) {
      if (!sample || typeof sample !== 'object') continue
      const at = numberOf(sample.t)
      if (at <= 0) continue
      if (!newest || at > newest.at) newest = { at, usage: sample.u }
    }
    if (!newest) return null
    const usage = newest.usage && typeof newest.usage === 'object' ? newest.usage : {}
    const fiveHourUsedPercent = percentOf(usage.fh)
    const sevenDayUsedPercent = percentOf(usage.sd)
    if (fiveHourUsedPercent === null && sevenDayUsedPercent === null) return null
    return { at: newest.at, fiveHourUsedPercent, sevenDayUsedPercent }
  }

  /** Chromium Local Storage for the app's own web origin. */
  function localStorageRoot() {
    const override = textOf(dependencies.claudeDesktopStateRoot).trim()
    if (override) return override
    return path.join(path.dirname(desktopRoot()), 'Local Storage', 'leveldb')
  }

  /**
   * The desktop app's own unread set — the sessions still carrying a dot in its
   * sidebar.
   *
   * The app's session UI is claude.ai web content running inside the shell, and
   * it keeps that set in a Zustand store persisted to the origin's Local
   * Storage under `epitaxy-unread-v1`:
   *
   *   {"state":{"unreadIds":["local_<uuid>", …]},"version":0}
   *
   * Read as **bytes, never as a database**. Chromium holds an exclusive lock on
   * this LevelDB while the app runs, so opening it properly would fail exactly
   * when the reading is worth having; scanning the files needs no lock and
   * cannot disturb the app.
   *
   * That also sets the extraction rule. The same files hold plenty this plugin
   * has no business with (usage and cost figures, pane layout, recent uuids), so
   * this pulls out one key by name and lets nothing else past — the return value
   * is session ids and a timestamp, full stop.
   *
   * Returns `null` for "could not tell", which is **not** the same as "nothing
   * is unread". LevelDB eventually compacts the append-only `.log` into
   * snappy-compressed `.ldb` blocks where a byte scan finds nothing, so an empty
   * result must never be read as "the user has seen everything".
   */
  function readUnreadSet() {
    const directory = localStorageRoot()
    let entries = []
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && UNREAD_STORE_FILE.test(entry.name))
        .map((entry) => entry.name)
    } catch {
      return null
    }
    if (!entries.length) return null
    let best = null
    for (const name of entries) {
      const filePath = path.join(directory, name)
      const stat = safeStat(filePath)
      if (!stat || !stat.isFile() || stat.size > UNREAD_STORE_MAX_BYTES) continue
      let buffer = null
      try {
        buffer = fs.readFileSync(filePath)
      } catch {
        continue
      }
      const isLog = name.endsWith('.log')
      let offset = buffer.indexOf(UNREAD_STORE_KEY)
      while (offset >= 0) {
        const ids = parseUnreadValue(buffer, offset + UNREAD_STORE_KEY.length)
        // Newest write wins: the `.log` is the live journal and outranks every
        // compacted table, and inside one file a later offset is a later write.
        if (ids && (!best
          || (isLog && !best.isLog)
          || (isLog === best.isLog && (stat.mtimeMs > best.mtimeMs
            || (stat.mtimeMs === best.mtimeMs && offset > best.offset))))) {
          best = { ids, isLog, mtimeMs: stat.mtimeMs, offset }
        }
        offset = buffer.indexOf(UNREAD_STORE_KEY, offset + 1)
      }
    }
    if (!best) return null
    return { version: 1, ids: best.ids, readAt: Date.now() }
  }

  /**
   * Pulls the store's JSON out of the bytes that follow the key. LevelDB puts
   * its own framing between the two, so this searches a bounded window rather
   * than assuming a fixed offset, and it only ever matches this one store's
   * shape.
   */
  function parseUnreadValue(buffer, from) {
    const window = buffer.toString('latin1', from, from + UNREAD_VALUE_WINDOW)
    const match = window.match(UNREAD_VALUE_PATTERN)
    if (!match) return null
    let parsed = null
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return null
    }
    const raw = parsed && parsed.state && Array.isArray(parsed.state.unreadIds) ? parsed.state.unreadIds : null
    if (!raw) return null
    const ids = []
    for (const value of raw) {
      if (typeof value !== 'string') continue
      const id = value.trim()
      if (!SESSION_ID_PATTERN.test(id)) continue
      if (!ids.includes(id)) ids.push(id)
      if (ids.length >= UNREAD_MAX_IDS) break
    }
    return ids
  }

  function percentOf(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    return Math.min(100, Math.max(0, value))
  }

  /** Whitelist extraction; unknown and content-bearing fields never survive. */
  function readMetadataFile(filePath) {
    const stat = safeStat(filePath)
    if (!stat || !stat.isFile() || stat.size > DESKTOP_METADATA_MAX_BYTES) return null
    let parsed = null
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      return null
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const sessionId = textOf(parsed.sessionId).trim()
    if (!SESSION_ID_PATTERN.test(sessionId)) return null
    return {
      sessionId,
      title: textOf(parsed.title),
      cwd: textOf(parsed.cwd),
      userSelectedFolders: Array.isArray(parsed.userSelectedFolders)
        ? parsed.userSelectedFolders.filter((item) => typeof item === 'string' && item.length > 0)
        : [],
      createdAt: numberOf(parsed.createdAt),
      lastActivityAt: numberOf(parsed.lastActivityAt),
      model: textOf(parsed.model),
      isArchived: parsed.isArchived === true,
      scheduledTaskId: textOf(parsed.scheduledTaskId),
      cliSessionId: textOf(parsed.cliSessionId).trim(),
      metadataUpdatedAt: Math.round(stat.mtimeMs || 0)
    }
  }

  /**
   * Bounded tail summary of one audit log. A partial first line (mid-file tail
   * start) is skipped; a torn final line simply fails its JSON parse and is
   * ignored, which is the correct treatment for an append in progress.
   */
  function summarizeAuditTail(auditPath) {
    const summary = {
      auditBytes: 0,
      auditUpdatedAt: 0,
      lastEvent: null,
      lastEventAt: 0,
      lastResultAt: 0,
      lastPermissionRequestAt: 0,
      lastPermissionResponseAt: 0,
      // Set whenever the window held content we could not turn into an event.
      // The domain keeps a `result` non-terminal while this is true, because an
      // unparsed tail is exactly where newer work would be hiding.
      auditTailUnparsed: false,
      rateLimit: null
    }
    const stat = safeStat(auditPath)
    if (!stat || !stat.isFile()) return summary
    summary.auditBytes = stat.size
    summary.auditUpdatedAt = Math.round(stat.mtimeMs || 0)
    let handle = null
    try {
      handle = fs.openSync(auditPath, 'r')
      // Widen the window until it contains a line boundary. Real audit lines
      // embed tool input and results, so a single line larger than the default
      // window is ordinary — and with a fixed window that case yielded zero
      // parsable lines, blinding the reader to every `result` and permission
      // prompt in the file (P5 review).
      let window = DESKTOP_TAIL_BYTES
      let start = 0
      let bytesRead = 0
      let text = ''
      for (;;) {
        start = Math.max(0, stat.size - window)
        const length = stat.size - start
        const buffer = Buffer.alloc(length)
        bytesRead = fs.readSync(handle, buffer, 0, length, start)
        text = buffer.toString('utf8', 0, bytesRead)
        if (start === 0 || text.indexOf('\n') !== -1 || window >= DESKTOP_TAIL_MAX_BYTES) break
        window = Math.min(window * 4, DESKTOP_TAIL_MAX_BYTES)
      }
      if (start > 0 && text.indexOf('\n') === -1) {
        // Even the widened window is one unterminated fragment. Report the
        // blindness rather than silently claiming there were no events.
        summary.auditTailUnparsed = true
        return summary
      }
      const lines = text.split('\n')
      // Only skip the leading fragment when the window really started mid-line.
      const skipFirst = start > 0 && text.charCodeAt(0) !== 0x0a
      for (let index = skipFirst ? 1 : 0; index < lines.length; index += 1) {
        const line = lines[index].trim()
        if (!line) continue
        let parsed = null
        try {
          parsed = JSON.parse(line)
        } catch {
          // A torn final line is an append in progress, not corruption — but it
          // is still content newer than anything we parsed.
          summary.auditTailUnparsed = true
          continue
        }
        const event = classifyAuditLine(parsed)
        if (!event) continue
        if (event.at >= summary.lastEventAt) {
          summary.lastEvent = event.event
          summary.lastEventAt = event.at
          // Everything parsed after this point supersedes it.
          summary.auditTailUnparsed = false
        }
        if (event.event === 'result') summary.lastResultAt = Math.max(summary.lastResultAt, event.at)
        if (event.event === 'permission-request') {
          summary.lastPermissionRequestAt = Math.max(summary.lastPermissionRequestAt, event.at)
        }
        if (event.event === 'permission-response') {
          summary.lastPermissionResponseAt = Math.max(summary.lastPermissionResponseAt, event.at)
        }
        if (event.event === 'rate-limit' && event.rateLimit) summary.rateLimit = event.rateLimit
      }
    } catch {
      /* tail is best effort; the stat evidence above still stands */
      summary.auditTailUnparsed = true
    } finally {
      if (handle !== null) {
        try {
          fs.closeSync(handle)
        } catch {
          /* already closed */
        }
      }
    }
    return summary
  }

  function readSnapshot(options) {
    const settings = options || {}
    const now = Number.isFinite(settings.now) ? settings.now : Date.now()
    const windowMs = Number.isFinite(settings.windowMs) ? settings.windowMs : DEFAULT_DESKTOP_WINDOW_MS
    const sessions = []
    for (const userDirectory of userDirectories()) {
      let names = []
      try {
        names = fs.readdirSync(userDirectory)
      } catch {
        continue
      }
      for (const name of names) {
        if (!METADATA_PATTERN.test(name)) continue
        const metadata = readMetadataFile(path.join(userDirectory, name))
        if (!metadata) continue
        // Cheap freshness gate before any tail read, mirroring the transcript
        // reader: enumerating is cheap, tailing every historical session is not.
        const freshAt = Math.max(metadata.lastActivityAt || 0, metadata.metadataUpdatedAt || 0)
        if (freshAt > 0 && now - freshAt > windowMs) continue
        // Second, independent containment check: the id already passed
        // SESSION_ID_PATTERN, but a path that escapes the enumerated directory
        // must never be read regardless of how it got here.
        const auditPath = path.join(userDirectory, metadata.sessionId, 'audit.jsonl')
        if (!auditPath.startsWith(userDirectory + path.sep)) continue
        const audit = summarizeAuditTail(auditPath)
        sessions.push({ ...metadata, ...audit })
      }
    }
    sessions.sort((left, right) => (right.lastActivityAt || 0) - (left.lastActivityAt || 0))
    const limited = sessions.length > DESKTOP_MAX_SESSIONS ? sessions.slice(0, DESKTOP_MAX_SESSIONS) : sessions
    return {
      version: 1,
      revision: CLAUDE_DESKTOP_READER_REVISION,
      sessions: limited,
      truncated: sessions.length > limited.length,
      readAt: now
    }
  }

  let watchers = []
  let debounceTimer = null

  function disposeWatchers() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    for (const watcher of watchers) {
      try {
        watcher.close()
      } catch {
        /* teardown is best effort */
      }
    }
    watchers = []
  }

  /**
   * Watches the user-level directories: metadata heartbeats rewrite
   * `local_<uuid>.json` there at minute granularity while a session runs, which
   * is enough push for the lane; audit tails are read on the next snapshot.
   * One subscription at a time, same contract as the hook-queue watcher.
   *
   * The data root is also watched whenever it exists. A user who installs the
   * desktop app but has not started a session yet has no `org/user` directory,
   * so watching only those armed zero watchers — and because the disposer was
   * still truthy the Controller treated the lane as subscribed and never
   * retried, leaving push dead for the whole plugin session (P5 review). The
   * root watcher also picks up an `org/user` pair created after subscription.
   */
  function watchSessions(listener) {
    disposeWatchers()
    if (typeof listener !== 'function') return () => {}
    const fire = () => {
      debounceTimer = null
      try {
        listener()
      } catch {
        /* listener errors must not kill the watcher */
      }
    }
    const onChange = () => {
      if (debounceTimer) return
      debounceTimer = setTimeout(fire, DESKTOP_WATCH_DEBOUNCE_MS)
    }
    const targets = userDirectories().slice(0, DESKTOP_MAX_WATCHED_DIRS)
    // `recursive` is supported on macOS and Windows, which is where the desktop
    // app runs; elsewhere this degrades to a shallow root watch, still enough
    // to notice the first `org` directory appearing.
    const root = desktopRoot()
    if (root) targets.push(root)
    for (const directory of targets) {
      try {
        watchers.push(fs.watch(directory, onChange))
      } catch {
        /* directory may be unreadable or vanish; the snapshot path still works */
      }
    }
    if (!watchers.length) return null
    const armed = watchers.slice()
    return () => {
      if (watchers.length && watchers[0] === armed[0]) disposeWatchers()
    }
  }

  function close() {
    disposeWatchers()
  }

  return {
    revision: CLAUDE_DESKTOP_READER_REVISION,
    desktopRoot,
    readSnapshot,
    readPlanUsage,
    readUnreadSet,
    watchSessions,
    close
  }
}

module.exports = {
  CLAUDE_DESKTOP_READER_REVISION,
  DEFAULT_DESKTOP_WINDOW_MS,
  DESKTOP_MAX_SESSIONS,
  createDesktopReader
}
