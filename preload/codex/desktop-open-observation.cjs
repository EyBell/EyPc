'use strict'

const OBSERVATION_DELAYS_MS = [120, 300, 800, 1600]
const READ_WINDOW_MS = 4_000
const MAX_PENDING_READS = 16
const MAX_NATIVE_UNREAD_IDS = 100_000
const BENCHMARK_TRIAL_LIMIT = 20
const BENCHMARK_OPEN_TIMEOUT_MS = 2_000
const BENCHMARK_ARM_WINDOW_MS = 60_000

const { codexDesktopPersistedReadBinding, parseCodexDesktopUnreadState, createCodexDesktopUnreadStorage } = require('./desktop-unread-evidence.cjs')

function boundNativeUnreadIds(parsed, expectedBinding) {
  try {
    const binding = codexDesktopPersistedReadBinding(parsed, expectedBinding, true)
    const ids = parseCodexDesktopUnreadState(parsed, binding)
    if (ids.length > MAX_NATIVE_UNREAD_IDS
      || ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) return null
    return new Set(ids)
  } catch {
    return null
  }
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
  record, fs, maximumStateBytes, execFile, sqliteBin, DatabaseSync, platform, pairedBenchmark,
  readMacApp = platform === 'darwin' && execFile ? () => readMacCodexApp(execFile) : null,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout
}) {
  const unreadStorage = createCodexDesktopUnreadStorage({ fs, execFile, sqliteBin, DatabaseSync, maximumStateBytes })
  const reads = new Map()
  let foreground = null
  let benchmarkAttempt = 0
  let benchmarkRun = 1
  let benchmarkApp = null
  let benchmarkPairStart = null
  let benchmarkArm = null
  let benchmarkResetRequired = false
  let benchmarkLastTrial = null
  const benchmarkTrials = new Map()
  const benchmarkSupported = platform === 'darwin' && typeof execFile === 'function' && typeof readMacApp === 'function'
  const benchmarkEnabled = () => benchmarkSupported
    && (typeof pairedBenchmark === 'function' ? pairedBenchmark() : pairedBenchmark === true)

  function note(open, stage, outcome, evidence) {
    try {
      record({
        level: 'info', scope: 'task-action', event: `codex-open-${stage}`, outcome,
        provider: 'codex', taskRef: open.key, source: open.source, operationId: open.operationId,
        durationMs: Math.max(0, now() - open.startedAt),
        details: { route: open.route, ...(open.pair ? { pair: open.pair, arm: open.arm, run: open.run } : {}), ...(evidence ? { evidence } : {}) }
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
        Math.max(0, open.readDeadlineAt - now()))
      open.readTimer?.unref?.()
      return
    }
    const delay = OBSERVATION_DELAYS_MS[attempt]
    if (delay === undefined || now() + delay > open.readDeadlineAt) {
      return finishRead(open, 'unconfirmed', open.lastReadResult)
    }
    open.readTimer = setTimer(async () => {
      if (reads.get(open.threadId) !== open) return
      if (!open.readScope.current()) return finishRead(open, 'superseded')
      const inTime = () => now() <= open.readDeadlineAt
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
        if (open.pair && active?.pid > 0 && !sameApplication && benchmarkTrials.has(open.operationId)) invalidateBenchmark()
        note(open, 'foreground', active?.foreground && sameApplication ? 'observed' : 'unavailable')
      } else scheduleForeground(open, attempt + 1)
    }, delay)
    open.foregroundTimer?.unref?.()
  }

  function begin(context) {
    const open = { ...context, startedAt: now(), dispatched: false, earlyRead: false, foregroundTimer: null }
    const trial = benchmarkTrials.get(open.operationId)
    const benchmarkTrial = trial && open.pair === trial.pair && open.arm === trial.arm ? trial : null
    closeBenchmarkObservation(open.startedAt)
    if (benchmarkTrial) {
      benchmarkTrial.open = {
        key: open.key, source: open.source, operationId: open.operationId, route: open.route, startedAt: open.startedAt
      }
      benchmarkLastTrial = benchmarkTrial
    }
    open.readDeadlineAt = open.startedAt + (context.dispatchTimeoutMs || 0) + READ_WINDOW_MS
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
    return (accepted, failure = 'failed') => {
      if (benchmarkTrial) benchmarkTrial.dispatchOutcome = accepted ? 'dispatched' : failure
      if (!accepted && failure !== 'unconfirmed') {
        note(open, 'dispatch', failure)
        if (reads.get(open.threadId) === open) reads.delete(open.threadId)
        if (foreground === open) foreground = null
        return
      }
      open.dispatched = true
      open.readDeadlineAt = Math.min(open.readDeadlineAt, now() + READ_WINDOW_MS)
      note(open, 'dispatch', accepted ? 'dispatched' : 'unconfirmed')
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
    if (now() >= open.readDeadlineAt) {
      const stillCurrent = open.readScope.current() === true
      finishRead(open, 'unconfirmed', 'window-expired')
      return stillCurrent ? true : 'reread'
    }
    if (open.readSuperseded || !open.readScope.current()) {
      if (!open.readSuperseded) note(open, 'native-read', 'superseded')
      open.readSuperseded = true
      return false
    }
    if (!binding) return 'reread'
    if (open.dispatched) finishRead(open, 'confirmed', 'desktop-live')
    else open.earlyRead = true
    return true
  }

  function clear() {
    if (foreground?.foregroundTimer) clearTimer(foreground.foregroundTimer)
    foreground = null
    for (const open of reads.values()) if (open.readTimer) clearTimer(open.readTimer)
    reads.clear()
    invalidateBenchmark()
  }

  async function readBoundUnread(primary, binding, isCurrent = () => true) {
    if (!isCurrent()) return null
    const native = unreadStorage.refresh(primary, isCurrent)
    if (native) {
      const parsed = await native
      return parsed && isCurrent() ? boundNativeUnreadIds(parsed, binding) : null
    }
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
      if (offset !== stat.size || !isCurrent()) return null
      return boundNativeUnreadIds(JSON.parse(buffer.toString('utf8', 0, offset)), binding)
    } finally {
      await file.close()
    }
  }

  function activeBenchmarkArm() {
    if (!benchmarkArm || now() >= benchmarkArm.expiresAt || !benchmarkEnabled()) {
      benchmarkArm = null
    }
    return benchmarkArm
  }

  function closeBenchmarkObservation(at) {
    if (!benchmarkLastTrial) return
    benchmarkLastTrial.observeUntil = at
    benchmarkLastTrial = null
  }

  function invalidateBenchmark() {
    benchmarkArm = null
    closeBenchmarkObservation(now())
    if (benchmarkAttempt > 0) benchmarkResetRequired = true
  }

  function benchmarkStatus() {
    const armed = activeBenchmarkArm()
    const routeTiming = (arm) => {
      const values = [...benchmarkTrials.values()]
        .filter(trial => trial.arm === arm && typeof trial.visibleMs === 'number')
        .map(trial => trial.visibleMs).sort((first, second) => first - second)
      const count = values.length
      return count ? {
        count,
        medianMs: (values[Math.floor((count - 1) / 2)] + values[Math.floor(count / 2)]) / 2,
        p90Ms: values[Math.ceil(count * 0.9) - 1]
      } : { count: 0 }
    }
    const defaultRoute = routeTiming('default')
    const explicitRoute = routeTiming('explicit')
    return {
      outcome: benchmarkEnabled() ? 'available' : 'unavailable',
      run: benchmarkRun,
      attempts: benchmarkAttempt,
      nextPair: benchmarkAttempt < BENCHMARK_TRIAL_LIMIT ? Math.floor(benchmarkAttempt / 2) + 1 : null,
      armed: Boolean(armed),
      resetRequired: benchmarkResetRequired,
      defaultRoute,
      explicitRoute,
      explicitEligible: defaultRoute.count === 10 && explicitRoute.count === 10
        && explicitRoute.medianMs < defaultRoute.medianMs && explicitRoute.p90Ms <= defaultRoute.p90Ms,
      trials: [...benchmarkTrials].map(([operationId, trial]) => ({
        operationId,
        pair: trial.pair,
        arm: trial.arm,
        dispatchAt: trial.open?.startedAt,
        dispatchOutcome: trial.dispatchOutcome || 'pending',
        visibility: trial.visibility || 'unconfirmed',
        ...(trial.visibleMs !== undefined ? { visibleMs: trial.visibleMs } : {})
      }))
    }
  }

  function controlBenchmark(input = {}) {
    if (!benchmarkEnabled()) return { outcome: 'unavailable', errorCode: 'benchmark-disabled' }
    if (input.action === 'status') return benchmarkStatus()
    if (input.action === 'reset') {
      benchmarkRun += 1
      benchmarkArm = null
      benchmarkAttempt = 0
      benchmarkApp = null
      benchmarkPairStart = null
      benchmarkResetRequired = false
      benchmarkLastTrial = null
      benchmarkTrials.clear()
      return benchmarkStatus()
    }
    if (input.action === 'arm') {
      if (benchmarkResetRequired || benchmarkAttempt >= BENCHMARK_TRIAL_LIMIT) {
        return { outcome: 'unavailable', errorCode: 'benchmark-reset-required' }
      }
      const startRef = typeof input.startRef === 'string' && /^[a-z0-9_-]{1,32}$/i.test(input.startRef) ? input.startRef : ''
      const targetKey = typeof input.targetKey === 'string' && /^[a-f0-9]{32}$/.test(input.targetKey) ? input.targetKey : ''
      if (!startRef || !targetKey || benchmarkPairStart
        && (benchmarkPairStart.startRef !== startRef || benchmarkPairStart.key !== targetKey)) {
        return { outcome: 'unavailable', errorCode: 'benchmark-pair-mismatch' }
      }
      benchmarkArm = { startRef, targetKey, expiresAt: now() + BENCHMARK_ARM_WINDOW_MS, operationId: '' }
      return benchmarkStatus()
    }
    if (input.action === 'observe') {
      const trial = benchmarkTrials.get(input.operationId)
      const visibility = input.visibility
      if (!trial?.open || trial.visibility || !['observed', 'wrong-target', 'timeout', 'unconfirmed'].includes(visibility)) {
        return { outcome: 'unavailable', errorCode: 'benchmark-observation-unavailable' }
      }
      const exact = visibility === 'observed'
      const observedAt = input.observedAt
      if (exact && (!Number.isSafeInteger(observedAt) || observedAt < trial.open.startedAt || observedAt > now()
        || (trial.observeUntil !== undefined && observedAt >= trial.observeUntil)
        || !['dispatched', 'unconfirmed'].includes(trial.dispatchOutcome))) {
        return { outcome: 'unavailable', errorCode: 'benchmark-observation-time-invalid' }
      }
      trial.visibility = visibility
      if (exact) trial.visibleMs = observedAt - trial.open.startedAt
      const open = trial.open
      record({
        level: 'info', scope: 'task-action', event: 'codex-open-target-visible', outcome: visibility,
        provider: 'codex', taskRef: open.key, source: open.source, operationId: open.operationId,
        ...(exact ? { durationMs: trial.visibleMs } : {}),
        details: { route: open.route, pair: trial.pair, arm: trial.arm, run: trial.run, evidence: 'independent-frame' }
      })
      return benchmarkStatus()
    }
    return { outcome: 'unavailable', errorCode: 'benchmark-command-invalid' }
  }

  function selectBenchmarkTarget(source, operationId) {
    if (source !== 'global-shortcut' || typeof operationId !== 'string' || !operationId) return undefined
    const armed = activeBenchmarkArm()
    if (!armed || (armed.operationId && armed.operationId !== operationId)) return undefined
    armed.operationId = operationId
    return benchmarkPairStart?.key
  }

  const prepareBenchmarkTrial = benchmarkSupported ? async (threadId, { operationId, key } = {}) => {
    const armed = activeBenchmarkArm()
    if (!armed?.operationId || armed.operationId !== operationId) return null
    if (armed.targetKey !== key) {
      benchmarkArm = null
      return { ready: false, errorCode: 'benchmark-pair-mismatch', message: '快捷键选中了其他任务，请重新准备本次对照' }
    }
    const index = benchmarkAttempt
    let app = null
    try { app = await readMacApp() } catch {}
    if (activeBenchmarkArm() !== armed || benchmarkAttempt !== index) {
      return { ready: false, errorCode: 'benchmark-superseded', message: '本次对照的准备条件已变化' }
    }
    const changedApp = app?.pid > 0 && benchmarkApp && (benchmarkApp.path !== app.path || benchmarkApp.pid !== app.pid)
    if (!app || app.pid <= 0 || changedApp) {
      benchmarkArm = null
      if (changedApp) invalidateBenchmark()
      return { ready: false, errorCode: 'benchmark-application-unavailable', message: '同一 Codex 应用尚未确认运行，未发起本次对照' }
    }
    if (benchmarkPairStart && (benchmarkPairStart.threadId !== threadId || benchmarkPairStart.foreground !== app.foreground)) {
      benchmarkArm = null
      return { ready: false, errorCode: 'benchmark-pair-mismatch', message: '本对照组需要同一目标和相同的 Codex 前台状态' }
    }
    const pair = Math.floor(index / 2) + 1
    const arm = index % 2 === (pair % 2) ? 'explicit' : 'default'
    return {
      ready: true, pair, arm, app, run: benchmarkRun, timeoutMs: BENCHMARK_OPEN_TIMEOUT_MS,
      start() {
        if (activeBenchmarkArm() !== armed || benchmarkAttempt !== index) return false
        benchmarkArm = null
        benchmarkApp = app
        benchmarkPairStart = benchmarkPairStart ? null : { key, threadId, startRef: armed.startRef, foreground: app.foreground }
        benchmarkAttempt += 1
        benchmarkTrials.set(operationId, { pair, arm, run: benchmarkRun })
        return true
      },
      ...(arm === 'explicit' ? {
        open: (url) => new Promise((resolve, reject) => {
          execFile('/usr/bin/open', ['-a', app.path, url], { timeout: BENCHMARK_OPEN_TIMEOUT_MS, maxBuffer: 1024 }, (error) => {
            if (!error) return resolve()
            if (error.killed && error.signal === 'SIGTERM') error.code = 'ETIMEDOUT'
            reject(error)
          })
        })
      } : {})
    }
  } : null

  return { begin, nativeRead, readBoundUnread, unreadStorage, controlBenchmark, selectBenchmarkTarget, prepareBenchmarkTrial, clear }
}

module.exports = { boundNativeUnreadIds, createCodexDesktopOpenObservation, readMacCodexApp }
