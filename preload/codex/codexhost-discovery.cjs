'use strict'

/**
 * Discovers conversations managed by a running CodexHost (codex-host shim)
 * and shapes them as inventory rows for the ordinary Codex scan pipeline.
 *
 * CodexHost hosts external Harness sessions (claude-code / pi / grok / omp /
 * dsh / cursor) and presents them as Desktop threads, but the official
 * `codex app-server` a fresh process spawns knows nothing about them — they
 * are invisible to `thread/list` and unreadable via `thread/read`. The one
 * stable contract surface is the codexhost delegation CLI (`thread list`),
 * which needs the Host Runtime rendezvous (`CODEXHOST_RUNTIME_ENDPOINT` /
 * `CODEXHOST_RUNTIME_TOKEN`).
 *
 * Rendezvous discovery is deliberately provisional: the live endpoint/token
 * pair is injected only into the Host Runtime's harness child processes, so
 * this module finds the runtime process (`node …/host-runtime/dist/main.js …
 * app-server`), then reads one child's environment. The launcher's own env
 * carries a stale endpoint from a previous runtime and must not be used. A
 * proper descriptor published by codexhost should replace this; until then
 * every step fails open — no runtime, no children, no CLI, bad JSON all mean
 * "no external threads this scan", never a broken scan.
 *
 * The token stays inside this process and is passed only to the codexhost
 * CLI child's environment. It is never logged, never persisted and never
 * included in diagnostics; records carry counts and ports only.
 */

const CODEXHOST_DISCOVERY_REVISION = 'codexhost-discovery-v1'
/** How long one thread-list snapshot serves scans before a refresh. */
const CODEXHOST_LIST_TTL_MS = 12_000
/** Running extra processes can complete between inventory scans; keep that
 * snapshot hot without treating elapsed time as a terminal. */
const CODEXHOST_RUNNING_LIST_TTL_MS = 1_000
/** How long a resolved rendezvous is trusted before re-reading process env. */
const CODEXHOST_RENDEZVOUS_TTL_MS = 60_000
/** Per-`thread list` invocation timeout; the CLI answers a local runtime. */
const CODEXHOST_CLI_TIMEOUT_MS = 8_000
const CODEXHOST_MAX_ROOTS = 12
const CODEXHOST_MAX_THREADS = 200
const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RUNTIME_COMMAND_PATTERN = /(^|\s)\S*\/bin\/node\s+\S*\/host-runtime\/dist\/main\.js\s/
/** Compressed 2–3 letter harness prefixes for row titles (user-decided):
 * cc=Claude Code, cx=Codex, gr=Grok, ds=DeepSeek Harness, pi=Pi,
 * op=Oh My Pi/OMP, cs=Cursor. Unknown harnesses keep their raw id. */
const HARNESS_LABELS = Object.freeze({
  'claude-code': 'cc',
  codex: 'cx',
  pi: 'pi',
  grok: 'gr',
  omp: 'op',
  dsh: 'ds',
  cursor: 'cs'
})

function record(value) {
  return value && typeof value === 'object' ? value : {}
}

function codexhostHarnessLabel(harnessId) {
  return HARNESS_LABELS[harnessId] || (typeof harnessId === 'string' && harnessId ? harnessId : 'Harness')
}

/** Open charset: a Harness the Host adds later must cross without a change. */
const HARNESS_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/

/**
 * Identity fields a scan row hands to the public thread projection. A Host
 * extra process rides the Codex lane by transport only; the Harness that
 * actually runs it is the row's identity. While this was dropped at the
 * bridge, every consumer saw a claude-code/grok Thread as a native Codex one
 * and the compressed name prefix was the sole surviving trace.
 */
function codexhostExternalIdentity(row) {
  const thread = record(row)
  if (thread.codexhostExternal !== true) return {}
  const harnessId = typeof thread.codexhostHarnessId === 'string' ? thread.codexhostHarnessId : ''
  return HARNESS_ID_PATTERN.test(harnessId) ? { codexhostHarnessId: harnessId } : {}
}

/**
 * Unread fields for one Host extra process. The Host CLI value is exact when
 * present. When the Host reports nothing — an older Host, or a record written
 * before external unread was persisted — a Desktop unread-*true* is still real
 * evidence and is adopted. Desktop *silence* is not a read receipt for these
 * ids: the official unread atom simply does not list Host conversations, so a
 * completed Turn stays unread rather than being claimed read.
 */
function codexhostExternalUnreadFields(hostUnread, desktopUnread, lastTurnCompleted) {
  if (typeof hostUnread === 'boolean') {
    return { hasUnreadTurn: hostUnread, unreadAuthority: 'desktop-persisted' }
  }
  if (desktopUnread === true || lastTurnCompleted === true) {
    return { hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' }
  }
  return { hasUnreadTurn: false, unreadAuthority: 'unavailable' }
}

const HOST_STATUSES = new Set(['creating', 'running', 'completed', 'failed', 'interrupted'])

function normalizeHostStatus(value) {
  if (HOST_STATUSES.has(value)) return value
  if (value === 'active') return 'running'
  return 'completed'
}

function hostThreadIsLive(thread) {
  return thread.status === 'running' || thread.status === 'creating'
    || thread.awaitingInput === true || thread.awaitingApproval === true
}

function projectHostConnector(thread) {
  if (thread.awaitingInput || thread.awaitingApproval) {
    return {
      type: 'active',
      activeFlags: [
        ...(thread.awaitingInput ? ['waitingOnUserInput'] : []),
        ...(thread.awaitingApproval ? ['waitingOnApproval'] : [])
      ]
    }
  }
  if (thread.status === 'running' || thread.status === 'creating') {
    return { type: 'active', activeFlags: [] }
  }
  return { type: 'idle' }
}

function projectHostTurn(thread, at) {
  if (hostThreadIsLive(thread)) return { status: 'inProgress', startedAt: at }
  if (thread.status === 'failed') return { status: 'failed', startedAt: at, completedAt: at }
  if (thread.status === 'interrupted') return { status: 'interrupted', startedAt: at, completedAt: at }
  return { status: 'completed', startedAt: at, completedAt: at }
}

function desktopAppRead(input = {}) {
  const live = input.connected === true || input.liveUnread?.ownerClientId === 'eypc-open'
    ? input.liveUnread
    : null
  const shadow = input.shadow && typeof input.shadow === 'object' ? input.shadow : null
  if (live?.ownerClientId === 'eypc-open' && live.hasUnreadTurn === false) return true
  const exact = shadow?.unreadEvidence === 'event'
    ? shadow
    : live?.unreadEvidence === 'event' ? live : null
  if (exact && exact.hasUnreadTurn === false) return true
  return false
}

/**
 * Extra-process unread: Host `hasUnreadTurn` is real when present and is not
 * compared against Desktop unread-true. Codex APP 已读 is an unread *event*
 * false or an EyPc jump into Codex — not a Desktop snapshot false, which is
 * the missing official unread atom. Native Codex already uses Desktop unread.
 */
function compareHostDesktopUnread(known, input = {}) {
  if (desktopAppRead(input)) {
    return { hasUnreadTurn: false, unreadAuthority: 'desktop-live' }
  }
  if (known?.connectorUnreadAuthority === 'desktop-persisted') {
    return {
      hasUnreadTurn: known.connectorHasUnreadTurn === true,
      unreadAuthority: 'desktop-persisted'
    }
  }
  return { hasUnreadTurn: false, unreadAuthority: 'unavailable' }
}

function createCodexhostDiscovery(dependencies = {}) {
  const execFile = dependencies.execFile
  const recordDiagnostic = typeof dependencies.record === 'function' ? dependencies.record : () => {}
  const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now
  if (typeof execFile !== 'function') {
    throw new TypeError('codexhost discovery requires execFile')
  }

  /** { endpoint, token, cliPath, resolvedAt } or null. */
  let rendezvous = null
  /** threadId -> { threadId, harnessId, status, cwd, title, firstSeenAt, statusChangedAt } */
  let externalThreads = new Map()
  let externalKeys = new Set()
  let listRefreshedAt = 0
  let refreshInFlight = null
  let lastDiagnosticLine = ''

  function run(command, args, options = {}) {
    return new Promise((resolve) => {
      try {
        execFile(command, args, {
          timeout: options.timeout || CODEXHOST_CLI_TIMEOUT_MS,
          maxBuffer: 4 * 1024 * 1024,
          env: options.env,
          encoding: 'utf8'
        }, (error, stdout) => resolve(error ? null : String(stdout || '')))
      } catch {
        resolve(null)
      }
    })
  }

  function environmentValue(psLine, name) {
    const match = new RegExp(`(?:^|\\s)${name}=(\\S+)`).exec(psLine)
    return match ? match[1] : ''
  }

  /**
   * Finds the Host Runtime process, then reads the live rendezvous from one
   * of its harness children. Children are the only processes holding the
   * CURRENT endpoint/token pair; the launcher env is a stale predecessor.
   */
  async function resolveRendezvous() {
    if (rendezvous && now() - rendezvous.resolvedAt <= CODEXHOST_RENDEZVOUS_TTL_MS) return rendezvous
    rendezvous = null
    const processTable = await run('ps', ['-axww', '-o', 'pid=,command='], { timeout: 4000 })
    if (!processTable) return null
    const runtimeLine = processTable.split('\n').find((line) => RUNTIME_COMMAND_PATTERN.test(line)
      && line.includes('app-server')
      && !line.includes('codexhost launch'))
    const runtimePid = runtimeLine ? Number.parseInt(runtimeLine.trim().split(/\s+/)[0], 10) : 0
    if (!Number.isInteger(runtimePid) || runtimePid <= 0) return null
    const childList = await run('pgrep', ['-P', String(runtimePid)], { timeout: 4000 })
    const childPids = (childList || '').split('\n').map((value) => Number.parseInt(value.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0)
      .slice(0, 24)
    for (const pid of childPids) {
      const psLine = await run('ps', ['eww', '-p', String(pid)], { timeout: 4000 })
      if (!psLine) continue
      const endpoint = environmentValue(psLine, 'CODEXHOST_RUNTIME_ENDPOINT')
      const token = environmentValue(psLine, 'CODEXHOST_RUNTIME_TOKEN')
      const cliPath = environmentValue(psLine, 'CODEXHOST_CLI_PATH')
      if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(endpoint) || !/^[0-9a-f]{32,128}$/i.test(token)) continue
      if (!cliPath || !cliPath.startsWith('/')) continue
      rendezvous = { endpoint, token, cliPath, resolvedAt: now() }
      return rendezvous
    }
    return null
  }

  function normalizeThread(value) {
    const thread = record(value)
    const threadId = typeof thread.threadId === 'string' ? thread.threadId.toLowerCase() : ''
    const harnessId = typeof thread.harnessId === 'string' ? thread.harnessId.slice(0, 40) : ''
    if (!THREAD_ID_PATTERN.test(threadId) || !harnessId) return null
    // Native codex threads are already in the official inventory; hosting them
    // twice would duplicate every task the plugin already tracks.
    if (harnessId === 'codex') return null
    return {
      threadId,
      harnessId,
      status: normalizeHostStatus(thread.status),
      cwd: typeof thread.cwd === 'string' ? thread.cwd : '',
      title: typeof thread.title === 'string' ? thread.title.trim().slice(0, 200) : '',
      // Host-owned unread (codexhost >= add-external-thread-unread); older
      // Hosts omit the field and the consumer stays on "unknown".
      hasUnreadTurn: typeof thread.hasUnreadTurn === 'boolean' ? thread.hasUnreadTurn : null,
      // Desktop question/prompt (Claude AskUserQuestion, Pi user_question, …)
      // is Host attention=input. Tool/permission approvals stay attention=approval.
      awaitingInput: thread.attention === 'input',
      awaitingApproval: thread.attention === 'approval'
    }
  }

  async function refreshExternalThreads(roots, threadKey) {
    const resolved = await resolveRendezvous()
    if (!resolved) {
      if (externalThreads.size) {
        externalThreads = new Map()
        externalKeys = new Set()
      }
      noteDiagnostic('unavailable', 0, 0)
      return false
    }
    const uniqueRoots = [...new Set((Array.isArray(roots) ? roots : [])
      .filter((root) => typeof root === 'string' && root.startsWith('/')))].slice(0, CODEXHOST_MAX_ROOTS)
    const nextThreads = new Map()
    let listFailures = 0
    const listEnv = {
      PATH: '/usr/bin:/bin:/usr/local/bin',
      HOME: process.env.HOME || '',
      CODEXHOST_RUNTIME_ENDPOINT: resolved.endpoint,
      CODEXHOST_RUNTIME_TOKEN: resolved.token
    }
    const parseList = (stdout) => {
      if (!stdout) return { ok: false, stale: false, threads: [] }
      let parsed
      try { parsed = JSON.parse(stdout) } catch { return { ok: false, stale: false, threads: [] } }
      if (record(parsed).error) {
        return { ok: false, stale: true, threads: [] }
      }
      return {
        ok: true,
        stale: false,
        threads: Array.isArray(record(parsed).threads) ? parsed.threads : [],
        nextCursor: typeof parsed.nextCursor === 'string' && parsed.nextCursor ? parsed.nextCursor : ''
      }
    }
    async function listPages(baseArgs) {
      const collected = []
      let cursor = ''
      for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
        const args = cursor ? [...baseArgs, '--cursor', cursor] : baseArgs
        const page = parseList(await run(resolved.cliPath, args, { env: listEnv }))
        if (!page.ok) return { pages: collected, failed: true, stale: page.stale }
        collected.push(page)
        cursor = page.nextCursor
        if (!cursor || collected.reduce((count, item) => count + item.threads.length, 0) >= CODEXHOST_MAX_THREADS) break
      }
      return { pages: collected, failed: false, stale: false }
    }
    // Official inventory cwds miss extra processes whose folder has no native
    // Codex thread. One --all list is the contract; older Hosts reject the
    // flag and we fall back to per-root scans without dropping rendezvous.
    const allList = await listPages([
      'thread', 'list', '--limit', '50', '--sort', 'recency-desc', '--all', 'true'
    ])
    const pages = []
    if (allList.pages.length) pages.push(...allList.pages)
    else {
      for (const root of uniqueRoots) {
        const listed = await listPages([
          'thread', 'list', '--limit', '50', '--sort', 'recency-desc', '--cwd', root
        ])
        if (listed.failed) {
          listFailures += 1
          if (listed.stale) rendezvous = null
          continue
        }
        pages.push(...listed.pages)
      }
    }
    // A CLI that fails on every list (broken install, transient runtime
    // hiccup) yields zero pages while the Host itself may be healthy. Wiping
    // the roster here made all external tasks vanish until the next good
    // scan; keep the previous roster and report the degraded pass instead.
    if (!pages.length && (allList.failed || listFailures)) {
      noteDiagnostic('partial', externalThreads.size, uniqueRoots.length)
      return true
    }
    for (const page of pages) {
      for (const value of page.threads) {
        const thread = normalizeThread(value)
        if (!thread || nextThreads.has(thread.threadId)) continue
        const previous = externalThreads.get(thread.threadId)
        nextThreads.set(thread.threadId, {
          ...thread,
          firstSeenAt: previous?.firstSeenAt || now(),
          statusChangedAt: previous
            && previous.status === thread.status
            && previous.awaitingInput === thread.awaitingInput
            && previous.awaitingApproval === thread.awaitingApproval
            ? previous.statusChangedAt
            : now()
        })
        if (nextThreads.size >= CODEXHOST_MAX_THREADS) break
      }
    }
    externalThreads = nextThreads
    externalKeys = new Set(typeof threadKey === 'function'
      ? [...nextThreads.keys()].map((threadId) => threadKey(threadId))
      : [])
    noteDiagnostic(listFailures ? 'partial' : 'ok', nextThreads.size, uniqueRoots.length)
    return true
  }

  /**
   * Names a refresh failure without leaking a command line, a path or the
   * rendezvous secret. The dedupe line is cleared so the next healthy pass is
   * reported too, instead of being swallowed as "same as last time".
   */
  function noteFailure(error) {
    lastDiagnosticLine = ''
    recordDiagnostic({
      level: 'error',
      scope: 'task-recovery',
      event: 'codexhost-discovery',
      outcome: 'failed',
      provider: 'codex',
      count: externalThreads.size,
      details: { error: String(error && error.name ? error.name : 'Error').slice(0, 40) }
    })
  }

  function noteDiagnostic(outcome, threadCount, rootCount) {
    const line = `${outcome}:${threadCount}:${rootCount}`
    if (line === lastDiagnosticLine) return
    lastDiagnosticLine = line
    recordDiagnostic({
      level: outcome === 'ok' ? 'info' : 'debug',
      scope: 'task-recovery',
      event: 'codexhost-discovery',
      outcome,
      provider: 'codex',
      count: threadCount,
      details: { rootCount }
    })
  }

  /**
   * External threads as scan-shaped inventory rows plus synthetic latest-Turn
   * entries. The official turn-status RPC cannot answer for these ids, so the
   * caller must exclude them from targeted reads and merge `turns` instead.
   */
  async function codexhostRowsForScan(input = {}) {
    const hasLive = [...externalThreads.values()].some(hostThreadIsLive)
    const ttl = hasLive ? CODEXHOST_RUNNING_LIST_TTL_MS : CODEXHOST_LIST_TTL_MS
    if (now() - listRefreshedAt > ttl) {
      if (!refreshInFlight) {
        refreshInFlight = refreshExternalThreads(input.roots, input.threadKey)
          .then((ok) => { if (ok) listRefreshedAt = now() })
          // A throw before the first noteDiagnostic used to leave the lane
          // completely silent, which reads exactly like "no extra processes".
          .catch((error) => noteFailure(error))
          .finally(() => { refreshInFlight = null })
      }
      // First scan waits so the lane appears without an extra cycle. A live
      // extra process also waits: serving a stale running snapshot after the
      // Host already reported completed is the user-visible stuck-in-progress
      // failure. Idle snapshots may refresh behind the scan.
      if (!externalThreads.size || hasLive) await refreshInFlight
    }
    const rows = []
    const turns = new Map()
    for (const thread of externalThreads.values()) {
      const label = codexhostHarnessLabel(thread.harnessId)
      rows.push({
        id: thread.threadId,
        sessionId: thread.threadId,
        name: thread.title ? `${label} · ${thread.title}` : `${label} · 未命名会话`,
        status: projectHostConnector(thread),
        cwd: thread.cwd,
        createdAt: thread.firstSeenAt,
        updatedAt: thread.statusChangedAt,
        recencyAt: thread.statusChangedAt,
        codexhostExternal: true,
        codexhostHarnessId: thread.harnessId,
        ...(typeof thread.hasUnreadTurn === 'boolean' ? { codexhostHasUnreadTurn: thread.hasUnreadTurn } : {})
      })
      turns.set(thread.threadId, projectHostTurn(thread, thread.statusChangedAt))
    }
    noteDiagnostic('cached', rows.length, 0)
    return { rows, turns }
  }

  function isExternalThreadId(threadId) {
    return externalThreads.has(typeof threadId === 'string' ? threadId.toLowerCase() : '')
  }

  function isExternalThreadKey(key) {
    return externalKeys.has(key)
  }

  function honorExternalOpenRead(threadId, result, markRead) {
    if (!result || (result.outcome !== 'dispatched' && result.outcome !== 'opened')) return result
    if (isExternalThreadId(threadId) !== true) return result
    if (typeof markRead === 'function') markRead(threadId)
    return { ...result, confirmsRead: true }
  }

  function honorExternalProjection(threadId, known, activity) {
    if (!activity || !known || isExternalThreadId(threadId) !== true) return activity
    let next = activity
    const confirmed = known.lastTurnEvidence === 'turn-completed'
      || known.lastTurnEvidence === 'targeted-after-exit'
      || known.lastTurnEvidence === 'snapshot-corroborated'
    const hostTerminal = known.lastTurnStatus === 'completed'
      || known.lastTurnStatus === 'interrupted'
      || known.lastTurnStatus === 'failed'
    if (hostTerminal && confirmed
      && next.status === 'active'
      && !(Array.isArray(next.activeFlags) && next.activeFlags.length)) {
      next = {
        ...next,
        status: known.connectorStatus === 'idle' || known.connectorStatus === 'notLoaded'
          ? known.connectorStatus
          : 'idle',
        activeFlags: []
      }
    }
    const connectorWaiting = (Array.isArray(known.connectorActiveFlags) ? known.connectorActiveFlags : [])
      .filter((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
    if (!connectorWaiting.length || next.status !== 'active') return next
    const liveFlags = Array.isArray(next.activeFlags) ? next.activeFlags : []
    if (liveFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')) return next
    return {
      ...next,
      activeFlags: [...connectorWaiting, ...liveFlags.filter((flag) => !connectorWaiting.includes(flag))],
      ...(Number(known.connectorWaitingSince) > 0 ? { waitingSince: known.connectorWaitingSince } : {})
    }
  }

  function codexhostResetDiscovery() {
    rendezvous = null
    externalThreads = new Map()
    externalKeys = new Set()
    listRefreshedAt = 0
    lastDiagnosticLine = ''
  }

  return {
    revision: CODEXHOST_DISCOVERY_REVISION,
    codexhostExternalIdentity,
    codexhostExternalUnreadFields,
    codexhostRowsForScan,
    isExternalThreadId,
    isExternalThreadKey,
    honorExternalProjection,
    honorExternalOpenRead,
    compareHostDesktopUnread,
    codexhostResetDiscovery
  }
}

module.exports = {
  CODEXHOST_DISCOVERY_REVISION,
  CODEXHOST_LIST_TTL_MS,
  CODEXHOST_RUNNING_LIST_TTL_MS,
  CODEXHOST_RENDEZVOUS_TTL_MS,
  codexhostHarnessLabel,
  codexhostExternalIdentity,
  codexhostExternalUnreadFields,
  normalizeHostStatus,
  projectHostConnector,
  projectHostTurn,
  compareHostDesktopUnread,
  createCodexhostDiscovery
}
