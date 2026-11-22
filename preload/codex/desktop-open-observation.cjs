'use strict'

const OBSERVATION_DELAYS_MS = [120, 300, 800, 1600]
const READ_WINDOW_MS = 4_000
const MAX_PENDING_READS = 16
const MAX_NATIVE_UNREAD_IDS = 100_000
const BENCHMARK_TRIAL_LIMIT = 20

const { codexDesktopStartupReadBinding, parseCodexDesktopUnreadState } = require('./desktop-unread-evidence.cjs')

function boundNativeUnreadIds(parsed, expectedBinding) {
  const binding = codexDesktopStartupReadBinding(parsed)
  if (!binding || binding.identityKey !== expectedBinding?.identityKey
    || binding.executionHostKey !== expectedBinding?.executionHostKey) return null
  const ids = parseCodexDesktopUnreadState(parsed, binding)
  if (ids.length > MAX_NATIVE_UNREAD_IDS
    || ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) return null
  return new Set(ids)
}

const MAC_CODEX_APP_SCRIPT = String.raw`
ObjC.import('AppKit')
const workspace = $.NSWorkspace.sharedWorkspace
const handler = workspace.URLForApplicationToOpenURL($.NSURL.URLWithString('codex://threads'))
if (!handler || ObjC.unwrap($.NSBundle.bundleWithURL(handler).bundleIdentifier) !== 'com.openai.codex') '{}'
else {
  const path = ObjC.unwrap(handler.path)
  const running = $.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.openai.codex')
  const matches = []
  for (let index = 0; index < Number(running.count || 0); index += 1) {
    const app = running.objectAtIndex(index)
    if (app.finishedLaunching && ObjC.unwrap(app.bundleURL.path) === path) matches.push(Number(app.processIdentifier))
  }
  const active = workspace.frontmostApplication
  const foreground = Boolean(active && ObjC.unwrap(active.bundleIdentifier) === 'com.openai.codex'
    && ObjC.unwrap(active.bundleURL.path) === path)
  JSON.stringify({ path, foreground, pid: matches.length === 1 ? matches[0] : 0 })
}
`

function readMacCodexApp(execFile) {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MAC_CODEX_APP_SCRIPT], {
      timeout: 800, maxBuffer: 8192
    }, (error, stdout) => {
      try {
        const app = !error && JSON.parse(String(stdout))
        if (typeof app?.path === 'string' && app.path.startsWith('/') && app.path.endsWith('.app')
          && !/[\u0000-\u001f]/.test(app.path) && typeof app.foreground === 'boolean'
          && Number.isSafeInteger(app.pid)) return resolve(app)
      } catch {}
      resolve(null)
    })
  })
}

function createCodexDesktopOpenObservation({
  record, fs, maximumStateBytes, execFile, platform, pairedBenchmark,
  readMacApp = platform === 'darwin' && execFile ? () => readMacCodexApp(execFile) : null,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout
}) {
  const reads = new Map()
  let foreground = null
  let benchmarkAttempt = 0
  let benchmarkApp = null
  let benchmarkPairStart = null

  function note(open, stage, outcome, evidence) {
    try {
      record({
        level: 'info', scope: 'task-action', event: `codex-open-${stage}`, outcome,
        provider: 'codex', taskRef: open.key, source: open.source, operationId: open.operationId,
        durationMs: Math.max(0, now() - open.startedAt),
        details: { route: open.route, ...(open.pair ? { pair: open.pair, arm: open.arm } : {}), ...(evidence ? { evidence } : {}) }
      })
    } catch {}
  }

  function finishRead(open, outcome, evidence) {
    if (reads.get(open.threadId) !== open) return
    if (open.readTimer) clearTimer(open.readTimer)
    reads.delete(open.threadId)
    if (!open.readSuperseded) {
      note(open, 'native-read', open.ambiguous && outcome === 'confirmed' ? 'ambiguous' : outcome, evidence)
    }
  }

  function scheduleRead(open, attempt = 0) {
    if (!open.readScope.readPersisted) {
      open.readTimer = setTimer(() => finishRead(open, open.readScope.current() ? 'unconfirmed' : 'superseded'),
        Math.max(0, open.startedAt + READ_WINDOW_MS - now()))
      open.readTimer?.unref?.()
      return
    }
    const delay = OBSERVATION_DELAYS_MS[attempt]
    if (delay === undefined || now() + delay > open.startedAt + READ_WINDOW_MS) {
      return finishRead(open, 'unconfirmed', open.lastReadResult)
    }
    open.readTimer = setTimer(async () => {
      if (reads.get(open.threadId) !== open) return
      if (!open.readScope.current()) return finishRead(open, 'superseded')
      const inTime = () => now() <= open.startedAt + READ_WINDOW_MS
      if (!inTime()) return finishRead(open, 'unconfirmed', 'window-expired')
      let result
      try { result = await open.readScope.readPersisted(() => reads.get(open.threadId) === open && inTime()) } catch { result = 'state-unavailable' }
      if (reads.get(open.threadId) !== open) return
      if (!open.readScope.current()) return finishRead(open, 'superseded')
      if (result === 'read') return finishRead(open, 'confirmed', 'desktop-persisted')
      open.lastReadResult = result
      scheduleRead(open, attempt + 1)
    }, delay)
    open.readTimer?.unref?.()
  }

  function scheduleForeground(open, attempt = 0) {
    const delay = OBSERVATION_DELAYS_MS[attempt]
    if (delay === undefined) {
      if (foreground === open) foreground = null
      return note(open, 'foreground', 'unconfirmed')
    }
    open.foregroundTimer = setTimer(async () => {
      if (foreground !== open) return
      let active = null
      try { active = await readMacApp() } catch {}
      if (foreground !== open) return
      const sameApplication = !open.app || open.app.path === active?.path && open.app.pid === active?.pid
      if (!active || !sameApplication || active.foreground) {
        foreground = null
        note(open, 'foreground', active?.foreground && sameApplication ? 'observed' : 'unavailable')
      } else scheduleForeground(open, attempt + 1)
    }, delay)
    open.foregroundTimer?.unref?.()
  }

  function begin(context) {
    const open = { ...context, startedAt: now(), dispatched: false, earlyRead: false, foregroundTimer: null }
    if (open.app) note(open, 'application', 'verified')
    note(open, 'dispatch', 'requested')
    const pending = reads.get(open.threadId)
    if (pending) pending.ambiguous = true
    else if (context.readScope && reads.size < MAX_PENDING_READS) reads.set(open.threadId, open)
    if (foreground?.foregroundTimer) clearTimer(foreground.foregroundTimer)
    foreground = null
    if (context.observeForeground && typeof readMacApp === 'function') {
      foreground = open
    }
    return (accepted) => {
      if (!accepted) {
        note(open, 'dispatch', 'failed')
        if (reads.get(open.threadId) === open) reads.delete(open.threadId)
        if (foreground === open) foreground = null
        return
      }
      open.dispatched = true
      note(open, 'dispatch', 'dispatched')
      note(open, 'target-visible', 'unconfirmed')
      if (reads.get(open.threadId) === open) {
        if (open.earlyRead && !open.readSuperseded && open.readScope.current()) {
          finishRead(open, 'confirmed', 'desktop-live')
        } else if (open.readScope.readPersisted && !open.readScope.current()) finishRead(open, 'superseded')
        else scheduleRead(open)
      }
      if (foreground === open) scheduleForeground(open)
    }
  }

  function nativeRead(threadId, binding) {
    const open = reads.get(threadId)
    if (!open || !open.readScope.acceptsLive(binding)) return true
    if (now() >= open.startedAt + READ_WINDOW_MS) {
      finishRead(open, 'unconfirmed', 'window-expired')
      return true
    }
    if (open.readSuperseded || !open.readScope.current()) {
      if (!open.readSuperseded) note(open, 'native-read', 'superseded')
      open.readSuperseded = true
      return false
    }
    if (!binding) return true
    if (open.dispatched) finishRead(open, 'confirmed', 'desktop-live')
    else open.earlyRead = true
    return true
  }

  function clear() {
    if (foreground?.foregroundTimer) clearTimer(foreground.foregroundTimer)
    foreground = null
    for (const open of reads.values()) if (open.readTimer) clearTimer(open.readTimer)
    reads.clear()
  }

  async function readBoundUnread(primary, binding) {
    if (!primary || !fs?.promises?.open) return null
    const file = await fs.promises.open(primary, 'r')
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size <= 0 || stat.size > maximumStateBytes) return null
      const buffer = Buffer.alloc(stat.size + 1)
      let offset = 0
      while (offset < buffer.length) {
        const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset)
        if (bytesRead === 0) break
        offset += bytesRead
      }
      if (offset !== stat.size) return null
      return boundNativeUnreadIds(JSON.parse(buffer.toString('utf8', 0, offset)), binding)
    } finally {
      await file.close()
    }
  }

  const prepareBenchmarkTrial = pairedBenchmark === true && platform === 'darwin' && execFile ? async (threadId) => {
    if (benchmarkAttempt >= BENCHMARK_TRIAL_LIMIT) return null
    const app = await readMacApp()
    if (benchmarkAttempt >= BENCHMARK_TRIAL_LIMIT) return null
    if (!app || app.pid <= 0 || benchmarkApp && (benchmarkApp.path !== app.path || benchmarkApp.pid !== app.pid)) {
      return { ready: false, errorCode: 'benchmark-application-unavailable', message: '同一 Codex 应用尚未确认运行，未发起本次对照' }
    }
    if (benchmarkPairStart && (benchmarkPairStart.threadId !== threadId || benchmarkPairStart.foreground !== app.foreground)) {
      return { ready: false, errorCode: 'benchmark-pair-mismatch', message: '本对照组需要同一目标和相同的 Codex 前台状态' }
    }
    const index = benchmarkAttempt
    const pair = Math.floor(index / 2) + 1
    const arm = index % 2 === (pair % 2) ? 'explicit' : 'default'
    return {
      ready: true, pair, arm, app,
      start() {
        if (benchmarkAttempt !== index) return false
        benchmarkApp = app
        benchmarkPairStart = benchmarkPairStart ? null : { threadId, foreground: app.foreground }
        benchmarkAttempt += 1
        return true
      },
      ...(arm === 'explicit' ? {
        open: (url) => new Promise((resolve, reject) => {
          execFile('/usr/bin/open', ['-a', app.path, url], { timeout: 2000, maxBuffer: 1024 },
            (error) => error ? reject(error) : resolve())
        })
      } : {})
    }
  } : null

  return { begin, nativeRead, readBoundUnread, prepareBenchmarkTrial, clear }
}

module.exports = { boundNativeUnreadIds, createCodexDesktopOpenObservation, readMacCodexApp }
