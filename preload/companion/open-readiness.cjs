'use strict'

/**
 * Companion open readiness: the provider-neutral step that runs before any
 * provider opener. It asks the provider's strategy whether the target app is
 * running, launches it when it is closed, waits (bounded) until the app is
 * present, optionally lets the app settle, and only then lets the original
 * opener dispatch its deep link.
 *
 * Strategies are plain data injected by the entry --
 * `{ label, probe(), launch(), settle?() }` -- so this module never branches
 * on a provider id. `probe` answers `running | closed | unknown`; `launch`
 * answers `{ ok: true, launcher }` or `{ ok: false, code, message?, launcher }`;
 * `settle` answers a boolean that is polled until true or a soft deadline.
 *
 * `unknown` never launches anything: a guess must not start an application.
 * A launch that reports `unsupported` passes straight through so the caller
 * keeps today's behavior (the OS URL handler may still cold-start the app).
 * `now`, timers and `record` are injected on the node-runtime precedent so
 * tests can drive the polling with fake clocks.
 */

const COMPANION_OPEN_READINESS_REVISION = 'companion-open-readiness-v1'
const READINESS_POLL_MS = 500
const LAUNCH_WAIT_MS = 25_000
const SETTLE_WAIT_MS = 8_000
const DEFAULT_SETTLE_DELAY_MS = 1_500
const OPEN_COMMAND_TIMEOUT_MS = 10_000

function boundedInteger(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : fallback
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createCompanionOpenReadiness(dependencies = {}) {
  const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now
  const setTimer = typeof dependencies.setTimeout === 'function' ? dependencies.setTimeout : setTimeout
  const record = typeof dependencies.record === 'function' ? dependencies.record : () => {}
  const readSettings = typeof dependencies.readSettings === 'function' ? dependencies.readSettings : () => ({})
  const strategies = dependencies.strategies && typeof dependencies.strategies === 'object' ? dependencies.strategies : {}
  const pollMs = boundedInteger(dependencies.pollMs, READINESS_POLL_MS)
  const waitMs = boundedInteger(dependencies.waitMs, LAUNCH_WAIT_MS)
  const settleMs = boundedInteger(dependencies.settleMs, SETTLE_WAIT_MS)
  /** provider -> in-flight launch promise; concurrent opens of one provider join it. */
  const inFlight = new Map()

  function sleep(ms) {
    return new Promise((resolve) => setTimer(resolve, ms))
  }

  function note(level, outcome, provider, request, details) {
    try {
      record({
        level,
        scope: 'task-action',
        event: 'open-readiness',
        outcome,
        provider,
        details: {
          ...(details || {}),
          ...(request && typeof request.source === 'string' ? { source: request.source.slice(0, 80) } : {}),
          ...(request && typeof request.operationId === 'string' ? { operationId: request.operationId.slice(0, 160) } : {})
        }
      })
    } catch {}
  }

  function strategyFor(provider) {
    const strategy = strategies[provider]
    if (!strategy || typeof strategy.probe !== 'function' || typeof strategy.launch !== 'function') return null
    return strategy
  }

  async function probe(strategy) {
    try {
      const value = await strategy.probe()
      return value === 'running' || value === 'closed' ? value : 'unknown'
    } catch {
      return 'unknown'
    }
  }

  function ready(probeState, launcher = 'none') {
    return { outcome: 'ready', probe: probeState, launcher, waitedMs: 0 }
  }

  async function launchAndWait(provider, strategy, request) {
    const label = typeof strategy.label === 'string' && strategy.label ? strategy.label : provider
    const startedAt = now()
    let launched = null
    try {
      launched = await strategy.launch()
    } catch {
      launched = { ok: false, code: 'launch-failed' }
    }
    const launcher = launched && typeof launched.launcher === 'string' && launched.launcher ? launched.launcher : 'unknown'
    if (!launched || launched.ok !== true) {
      const code = launched && typeof launched.code === 'string' && launched.code ? launched.code.slice(0, 80) : 'launch-failed'
      if (code === 'unsupported') {
        note('debug', 'skipped', provider, request, { probe: 'closed', launcher: 'unsupported' })
        return ready('closed', 'unsupported')
      }
      note('warn', 'launch-failed', provider, request, { probe: 'closed', launcher, errorCode: code })
      return {
        outcome: code === 'codexhost-cli-missing' ? 'unavailable' : 'failed',
        probe: 'closed',
        launcher,
        waitedMs: Math.max(0, now() - startedAt),
        errorCode: code,
        message: launched && typeof launched.message === 'string' && launched.message
          ? launched.message.slice(0, 240)
          : `无法启动 ${label}，未跳转`
      }
    }
    note('info', 'launch-started', provider, request, { probe: 'closed', launcher })
    const deadline = startedAt + waitMs
    while (true) {
      if (await probe(strategy) === 'running') break
      if (now() >= deadline) {
        const waitedMs = Math.max(0, now() - startedAt)
        note('warn', 'launch-timeout', provider, request, { probe: 'closed', launcher, waitedMs })
        return {
          outcome: 'failed',
          probe: 'closed',
          launcher,
          waitedMs,
          errorCode: 'launch-timeout',
          message: `已尝试启动 ${label}，${Math.max(1, Math.round(waitMs / 1000))} 秒内未确认其运行，未跳转`
        }
      }
      await sleep(pollMs)
    }
    if (typeof strategy.settle === 'function') {
      const settleDeadline = now() + settleMs
      while (true) {
        let settled = false
        try { settled = (await strategy.settle()) === true } catch { settled = false }
        if (settled) break
        if (now() >= settleDeadline) {
          note('debug', 'settle-timeout', provider, request, { probe: 'running', launcher })
          break
        }
        await sleep(pollMs)
      }
    }
    const waitedMs = Math.max(0, now() - startedAt)
    note('info', 'launched', provider, request, { probe: 'closed', launcher, waitedMs })
    return { outcome: 'launched', probe: 'closed', launcher, waitedMs }
  }

  /**
   * Readiness verdict for one provider. `ready` means the opener may dispatch
   * now; `launched` means it may dispatch after this step started the app;
   * `failed` / `unavailable` mean the opener must not run.
   */
  async function ensure(provider, request = {}) {
    let settings = null
    try { settings = readSettings() } catch { settings = null }
    if (settings && settings.openLaunchesTarget === false) return ready('skipped')
    const strategy = strategyFor(provider)
    if (!strategy) return ready('skipped')
    const state = await probe(strategy)
    if (state === 'running') return ready('running')
    if (state === 'unknown') {
      note('debug', 'probe-unknown', provider, request, { probe: 'unknown', launcher: 'none' })
      return ready('unknown')
    }
    const pending = inFlight.get(provider)
    if (pending) return pending
    const task = launchAndWait(provider, strategy, request).finally(() => {
      if (inFlight.get(provider) === task) inFlight.delete(provider)
    })
    inFlight.set(provider, task)
    return task
  }

  function launchField(readiness) {
    return { outcome: readiness.outcome, launcher: readiness.launcher, waitedMs: readiness.waitedMs }
  }

  /** Wraps a provider opener so readiness always runs first. */
  function wrapOpen(provider, open) {
    if (typeof open !== 'function') throw new TypeError('open readiness requires an opener function')
    return async (target, request) => {
      const readiness = await ensure(provider, request || {})
      if (readiness.outcome === 'failed' || readiness.outcome === 'unavailable') {
        return {
          outcome: readiness.outcome,
          errorCode: readiness.errorCode,
          message: readiness.message,
          confirmsRead: false,
          launch: launchField({ ...readiness, outcome: 'ready' })
        }
      }
      const result = await open(target, request)
      if (readiness.outcome !== 'launched') return result
      const source = result && typeof result === 'object' ? result : { outcome: 'failed', confirmsRead: false }
      const label = typeof strategies[provider]?.label === 'string' && strategies[provider].label ? strategies[provider].label : provider
      return {
        ...source,
        launch: launchField(readiness),
        message: typeof source.message === 'string' && source.message
          ? `已启动 ${label}，${source.message}`
          : `已启动 ${label}`
      }
    }
  }

  function inspect() {
    return {
      revision: COMPANION_OPEN_READINESS_REVISION,
      providers: Object.keys(strategies).filter((provider) => strategyFor(provider) !== null),
      inFlight: [...inFlight.keys()]
    }
  }

  return { revision: COMPANION_OPEN_READINESS_REVISION, ensure, wrapOpen, inspect }
}

/**
 * Strategy for an ordinary desktop app: presence by exact process name,
 * launch by bundle id (falling back to the app name), settle by a root window
 * of the app when the window inventory is readable, otherwise by a short
 * delay after the process was first seen.
 */
function createDesktopAppStrategy(options = {}) {
  const label = typeof options.label === 'string' ? options.label : ''
  const executables = Array.isArray(options.executables)
    ? options.executables.filter((name) => typeof name === 'string' && name)
    : []
  const bundleId = typeof options.bundleId === 'string' ? options.bundleId : ''
  const appName = typeof options.appName === 'string' && options.appName ? options.appName : label
  const prefix = typeof options.windowAppIdPrefix === 'string' ? options.windowAppIdPrefix.toLowerCase() : ''
  const probeExactProcess = options.probeExactProcess
  const execFile = options.execFile
  const run = options.run
  const host = options.process || process
  const windowsList = options.windowsList
  const now = typeof options.now === 'function' ? options.now : Date.now
  const settleDelayMs = boundedInteger(options.settleDelayMs, DEFAULT_SETTLE_DELAY_MS)
  /** Clock reading of the first `running` sighting; null while closed. */
  let firstSeenAt = null

  async function probe() {
    if (host.platform === 'darwin' || host.platform === 'linux') {
      if (typeof probeExactProcess !== 'function') return 'unknown'
      for (const executable of executables) {
        if (await probeExactProcess('/usr/bin/pgrep', ['-x', executable])) {
          if (firstSeenAt === null) firstSeenAt = now()
          return 'running'
        }
      }
      firstSeenAt = null
      return 'closed'
    }
    if (host.platform === 'win32') {
      if (typeof run !== 'function' || executables.length === 0) return 'unknown'
      const systemRoot = host.env && typeof host.env.SystemRoot === 'string' ? host.env.SystemRoot : 'C:\\Windows'
      const result = await run(`${systemRoot}\\System32\\tasklist.exe`, ['/NH', '/FO', 'CSV'])
      if (!result || (!result.ok && !result.stdout)) return 'unknown'
      const pattern = new RegExp(`"(?:${executables.map(escapeRegExp).join('|')})\\.exe"`, 'i')
      if (pattern.test(String(result.stdout || ''))) {
        if (firstSeenAt === null) firstSeenAt = now()
        return 'running'
      }
      firstSeenAt = null
      return 'closed'
    }
    return 'unknown'
  }

  function openApp(args) {
    return new Promise((resolve) => {
      try {
        execFile('open', args, { timeout: OPEN_COMMAND_TIMEOUT_MS }, (error) => resolve(!error))
      } catch {
        resolve(false)
      }
    })
  }

  async function launch() {
    if (host.platform !== 'darwin' || typeof execFile !== 'function') {
      return { ok: false, code: 'unsupported', launcher: 'unsupported' }
    }
    if (bundleId && await openApp(['-b', bundleId])) return { ok: true, launcher: 'open-b' }
    if (appName && await openApp(['-a', appName])) return { ok: true, launcher: 'open-a' }
    return { ok: false, code: 'launch-failed', launcher: 'open-b', message: `无法启动 ${label || appName}，未跳转` }
  }

  async function settle() {
    if (typeof windowsList === 'function' && prefix) {
      try {
        const listed = await windowsList()
        const rows = Array.isArray(listed) ? listed : listed && Array.isArray(listed.windows) ? listed.windows : []
        const capability = listed && !Array.isArray(listed) && listed.capability && typeof listed.capability === 'object'
          ? listed.capability
          : null
        const readable = !capability
          || (capability.supported !== false && capability.canList !== false && capability.permission !== 'required')
        if (readable) {
          return rows.some((row) => row && typeof row === 'object'
            && String(row.appId || '').toLowerCase().startsWith(prefix)
            && row.relationship !== 'child')
        }
      } catch {}
    }
    return firstSeenAt !== null && now() - firstSeenAt >= settleDelayMs
  }

  return { label, probe, launch, settle }
}

module.exports = {
  COMPANION_OPEN_READINESS_REVISION,
  READINESS_POLL_MS,
  LAUNCH_WAIT_MS,
  SETTLE_WAIT_MS,
  createCompanionOpenReadiness,
  createDesktopAppStrategy
}
