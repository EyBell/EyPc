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

const { desktopReadEvidence, persistedConnectorUnread } = require('./desktop-unread-evidence.cjs')

const CODEXHOST_DISCOVERY_REVISION = 'codexhost-discovery-v1'
/** How long one thread-list snapshot serves scans before a refresh. */
const CODEXHOST_LIST_TTL_MS = 12_000
/** Running extra processes can complete between inventory scans; keep that
 * snapshot hot without treating elapsed time as a terminal. */
const CODEXHOST_RUNNING_LIST_TTL_MS = 1_000
/** Coalesces a burst of Host record writes into one list refresh. */
const CODEXHOST_STORE_DEBOUNCE_MS = 300
/** How long a resolved rendezvous is trusted before re-reading process env. */
const CODEXHOST_RENDEZVOUS_TTL_MS = 60_000
/** Per-`thread list` invocation timeout; the CLI answers a local runtime. */
const CODEXHOST_CLI_TIMEOUT_MS = 8_000
const CODEXHOST_MAX_ROOTS = 12
const CODEXHOST_MAX_THREADS = 200
/**
 * Per-thread memory that outlives the roster: `statusChangedAt` continuity
 * and the EyPc jump-read. Kept in plugin storage so a rendezvous hiccup, a
 * session reset or a plugin reload cannot turn every completed extra process
 * back into a "刚刚 · 未读" row. Ids, statuses and timestamps only — never a
 * title, cwd, token or endpoint.
 */
const CODEXHOST_THREAD_MEMORY_STORAGE_KEY = 'eypc/codex/codexhost-thread-memory/v1'
const CODEXHOST_THREAD_MEMORY_LIMIT = 300
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
function codexhostExternalUnreadFields(hostUnread, desktopUnread, lastTurnCompleted, openedRead = false) {
  // An EyPc jump is a read — the same rule for a card click and a shortcut.
  // The local acknowledgement outranks a Host that has not yet seen the
  // Desktop read, until a newer Host completion supersedes it.
  if (openedRead === true) return { hasUnreadTurn: false, unreadAuthority: 'desktop-live' }
  if (typeof hostUnread === 'boolean') {
    return { hasUnreadTurn: hostUnread, unreadAuthority: 'desktop-persisted' }
  }
  if (desktopUnread === true || lastTurnCompleted === true) {
    return { hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' }
  }
  return { hasUnreadTurn: false, unreadAuthority: 'unavailable' }
}

/**
 * After an archive forgets an id, a Host list page can still carry it for a
 * while (page cache, in-flight scan). Within this window only a list that no
 * longer names the id releases it; a later list naming it again is an unarchive.
 */
const CODEXHOST_FORGET_SUPPRESS_MS = 30_000
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

/**
 * Extra-process unread: Host `hasUnreadTurn` is real when present and is not
 * compared against Desktop unread-true. Codex APP 已读 is an unread *event*
 * false or an EyPc jump into Codex — not a Desktop snapshot false, which is
 * the missing official unread atom. Native Codex already uses Desktop unread.
 */
function compareHostDesktopUnread(known, input = {}) {
  // An EyPc jump remembered across reloads reads exactly like a live read
  // event: the row was opened, and only a newer Host completion supersedes it.
  // Only `read` is honoured here: a Desktop unread-true never outranks the Host.
  if (input.openedRead === true || desktopReadEvidence(input) === 'read') {
    return { hasUnreadTurn: false, unreadAuthority: 'desktop-live' }
  }
  return persistedConnectorUnread(known)
}

function createCodexhostDiscovery(dependencies = {}) {
  const execFile = dependencies.execFile
  const recordDiagnostic = typeof dependencies.record === 'function' ? dependencies.record : () => {}
  const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now
  /** Lets the launch lane remember the CLI location while a Host is still around to tell us. */
  const onCliPathObserved = typeof dependencies.onCliPathObserved === 'function' ? dependencies.onCliPathObserved : null
  /** Injected, never read off `globalThis`: the entry runs inside VM sandboxes. */
  const storage = typeof dependencies.storage === 'function' ? dependencies.storage : () => undefined
  /**
   * Inbound Host state watcher. The Host persists per-thread records (status,
   * `pinned`) under `<data dir>/mapping-store/threads/*.json`; a change there
   * invalidates the list TTL and asks the entry to rescan, so a Desktop-side
   * pin of an extra process reaches the plugin without waiting a TTL.
   */
  const fs = dependencies.fs || null
  const pathModule = dependencies.path || null
  const onRosterChanged = typeof dependencies.onRosterChanged === 'function' ? dependencies.onRosterChanged : null
  const setTimer = typeof dependencies.setTimeout === 'function' ? dependencies.setTimeout : (fn, ms) => setTimeout(fn, ms)
  const clearTimer = typeof dependencies.clearTimeout === 'function' ? dependencies.clearTimeout : (id) => clearTimeout(id)
  if (typeof execFile !== 'function') {
    throw new TypeError('codexhost discovery requires execFile')
  }

  /** { endpoint, token, cliPath, resolvedAt } or null. */
  let rendezvous = null
  let storeWatcher = null
  let storeWatchTimer = null
  /** threadId -> { threadId, harnessId, status, cwd, title, firstSeenAt, statusChangedAt } */
  let externalThreads = new Map()
  let externalKeys = new Set()
  let listRefreshedAt = 0
  let refreshInFlight = null
  let lastDiagnosticLine = ''
  /** threadId -> forgottenAt for rows an archive removed; see CODEXHOST_FORGET_SUPPRESS_MS. */
  let forgottenThreadIds = new Map()
  /** Ids a complete Host list no longer carries; the next scan drains them as removals. */
  let removedThreadIds = new Set()
  /** The scan's thread-key function, kept so a forget can rebuild externalKeys. */
  let threadKeyFn = null
  /**
   * threadId -> { status, awaitingInput, awaitingApproval, firstSeenAt,
   * statusChangedAt, hostUnread, readAt, readStatusChangedAt }. Survives a
   * roster loss, `codexhostResetDiscovery` and (through storage) a reload.
   */
  let threadMemory = loadThreadMemory()

  function memoryInteger(value) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
  }

  function sanitizeMemoryEntry(value) {
    const entry = record(value)
    const statusChangedAt = memoryInteger(entry.statusChangedAt)
    if (!HOST_STATUSES.has(entry.status) || !statusChangedAt) return null
    return {
      status: entry.status,
      awaitingInput: entry.awaitingInput === true,
      awaitingApproval: entry.awaitingApproval === true,
      firstSeenAt: memoryInteger(entry.firstSeenAt) || statusChangedAt,
      statusChangedAt,
      hostUnread: typeof entry.hostUnread === 'boolean' ? entry.hostUnread : null,
      readAt: memoryInteger(entry.readAt),
      readStatusChangedAt: memoryInteger(entry.readStatusChangedAt),
      // Host-owned Desktop pin (codexhost `thread list` `pinned`); `null` when
      // the Host predates the field so the consumer keeps "no pin lane".
      pinned: typeof entry.pinned === 'boolean' ? entry.pinned : null
    }
  }

  function loadThreadMemory() {
    const memory = new Map()
    let stored
    try { stored = storage()?.getItem?.(CODEXHOST_THREAD_MEMORY_STORAGE_KEY) } catch { stored = null }
    const threads = record(record(stored).threads)
    for (const [threadId, value] of Object.entries(threads)) {
      const id = typeof threadId === 'string' ? threadId.toLowerCase() : ''
      const entry = THREAD_ID_PATTERN.test(id) ? sanitizeMemoryEntry(value) : null
      if (entry) memory.set(id, entry)
    }
    return memory
  }

  function persistThreadMemory() {
    if (threadMemory.size > CODEXHOST_THREAD_MEMORY_LIMIT) {
      const kept = [...threadMemory.entries()]
        .sort((left, right) => right[1].statusChangedAt - left[1].statusChangedAt)
        .slice(0, CODEXHOST_THREAD_MEMORY_LIMIT)
      threadMemory = new Map(kept)
    }
    const threads = {}
    for (const [threadId, entry] of threadMemory) threads[threadId] = entry
    try { storage()?.setItem?.(CODEXHOST_THREAD_MEMORY_STORAGE_KEY, { version: 1, threads }) } catch {}
  }

  /** The live roster row when seated, else what memory last saw of the id. */
  function rememberedThread(threadId) {
    return externalThreads.get(threadId) || threadMemory.get(threadId) || null
  }

  function sameHostStatus(left, right) {
    return Boolean(left) && Boolean(right)
      && left.status === right.status
      && left.awaitingInput === right.awaitingInput
      && left.awaitingApproval === right.awaitingApproval
  }

  /**
   * Seats one listed thread and settles its memory. `statusChangedAt` moves
   * only on a real Host status/attention change; a Host unread edge false →
   * true after the jump is a newer completion the remembered read no longer
   * covers, even when the status string never visibly left `completed`.
   */
  function seatThread(thread) {
    const previous = rememberedThread(thread.threadId)
    const at = now()
    const statusChangedAt = sameHostStatus(previous, thread) ? previous.statusChangedAt : at
    const remembered = threadMemory.get(thread.threadId)
    const supersededRead = remembered
      && remembered.readAt > 0
      && remembered.hostUnread === false
      && thread.hasUnreadTurn === true
    const entry = {
      status: thread.status,
      awaitingInput: thread.awaitingInput,
      awaitingApproval: thread.awaitingApproval,
      firstSeenAt: previous?.firstSeenAt || at,
      statusChangedAt,
      hostUnread: typeof thread.hasUnreadTurn === 'boolean' ? thread.hasUnreadTurn : remembered?.hostUnread ?? null,
      readAt: supersededRead ? 0 : remembered?.readAt || 0,
      readStatusChangedAt: supersededRead ? 0 : remembered?.readStatusChangedAt || 0,
      pinned: typeof thread.pinned === 'boolean' ? thread.pinned : remembered?.pinned ?? null
    }
    const changed = !remembered || Object.keys(entry).some((key) => remembered[key] !== entry[key])
    threadMemory.set(thread.threadId, entry)
    return { seated: { ...thread, firstSeenAt: entry.firstSeenAt, statusChangedAt }, changed }
  }

  /** Records the EyPc jump against the Host status it was made under. */
  function rememberExternalOpenRead(threadId) {
    const id = typeof threadId === 'string' ? threadId.toLowerCase() : ''
    const current = rememberedThread(id)
    if (!current) return false
    const remembered = threadMemory.get(id)
    threadMemory.set(id, {
      status: current.status,
      awaitingInput: current.awaitingInput === true,
      awaitingApproval: current.awaitingApproval === true,
      firstSeenAt: current.firstSeenAt,
      statusChangedAt: current.statusChangedAt,
      hostUnread: typeof current.hasUnreadTurn === 'boolean'
        ? current.hasUnreadTurn
        : remembered?.hostUnread ?? null,
      readAt: now(),
      readStatusChangedAt: current.statusChangedAt
    })
    persistThreadMemory()
    return true
  }

  /**
   * Whether an EyPc jump still covers the row's current Host status. True
   * reads exactly like a Desktop read event; a later status change or a Host
   * unread edge after the jump has already cleared the memory.
   */
  function isExternalOpenedRead(threadId) {
    const id = typeof threadId === 'string' ? threadId.toLowerCase() : ''
    const remembered = threadMemory.get(id)
    if (!remembered || !remembered.readAt || !remembered.readStatusChangedAt) return false
    const current = externalThreads.get(id) || remembered
    return remembered.readStatusChangedAt === current.statusChangedAt
  }

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
      if (onCliPathObserved) { try { onCliPathObserved(cliPath) } catch {} }
      ensureStoreWatcher(environmentValue(psLine, 'CODEXHOST_DATA_DIR'))
      return rendezvous
    }
    return null
  }

  function storeThreadsDirectory(dataDirectory) {
    if (!pathModule) return ''
    const base = dataDirectory && dataDirectory.startsWith('/')
      ? dataDirectory
      : typeof dependencies.homeDirectory === 'string' && dependencies.homeDirectory
        ? pathModule.join(dependencies.homeDirectory, '.codexhost')
        : ''
    return base ? pathModule.join(base, 'mapping-store', 'threads') : ''
  }

  /** Drops the list TTL and asks for a rescan; exported so a caller may force it too. */
  function codexhostInvalidateList() {
    listRefreshedAt = 0
    if (onRosterChanged) { try { onRosterChanged() } catch {} }
  }

  function ensureStoreWatcher(dataDirectory) {
    if (storeWatcher || !fs || typeof fs.watch !== 'function') return
    const directory = storeThreadsDirectory(dataDirectory)
    if (!directory) return
    try {
      const watcher = fs.watch(directory, { persistent: false }, (_event, filename) => {
        if (filename && !/\.json$/i.test(String(filename))) return
        if (storeWatchTimer) clearTimer(storeWatchTimer)
        storeWatchTimer = setTimer(() => {
          storeWatchTimer = null
          codexhostInvalidateList()
        }, CODEXHOST_STORE_DEBOUNCE_MS)
      })
      watcher.unref?.()
      watcher.on?.('error', () => closeStoreWatcher())
      storeWatcher = watcher
    } catch {
      // Missing store (Host never persisted) or unsupported fs: the TTL poll
      // remains the fallback and the next rendezvous retries the watch.
      storeWatcher = null
    }
  }

  function closeStoreWatcher() {
    if (storeWatchTimer) { clearTimer(storeWatchTimer); storeWatchTimer = null }
    try { storeWatcher?.close() } catch {}
    storeWatcher = null
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
      awaitingApproval: thread.attention === 'approval',
      // Host-persisted Desktop pin (codexhost >= thread-list-pinned); older
      // Hosts omit it and the row reports "no pin lane" rather than unpinned.
      pinned: typeof thread.pinned === 'boolean' ? thread.pinned : null
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
      // Every list failed. The usual cause is a Host that changed generation:
      // the cached rendezvous still names the previous runtime's endpoint, and
      // holding it for the rest of its TTL makes every scan in that window fail
      // identically. Only a CLI error *envelope* used to invalidate it, which a
      // dead endpoint never produces — it just yields no output at all.
      rendezvous = null
      noteDiagnostic('partial', externalThreads.size, uniqueRoots.length)
      return true
    }
    const listedIds = new Set()
    let memoryChanged = false
    for (const page of pages) {
      for (const value of page.threads) {
        const thread = normalizeThread(value)
        if (!thread || nextThreads.has(thread.threadId)) continue
        listedIds.add(thread.threadId)
        const forgottenAt = forgottenThreadIds.get(thread.threadId)
        if (forgottenAt !== undefined) {
          // A Desktop/CLI archive already removed this row. A list page that
          // still names it inside the window is the Host lagging that archive,
          // not the row coming back; seating it again resurrects an archived task.
          if (now() - forgottenAt < CODEXHOST_FORGET_SUPPRESS_MS) continue
          forgottenThreadIds.delete(thread.threadId)
        }
        const seat = seatThread(thread)
        memoryChanged = memoryChanged || seat.changed
        nextThreads.set(thread.threadId, seat.seated)
        if (nextThreads.size >= CODEXHOST_MAX_THREADS) break
      }
    }
    if (memoryChanged) persistThreadMemory()
    // A complete list that lost an id is the Host saying the row is gone
    // (archived from the Desktop or by another agent, or deleted). Report it
    // once so the scan can retire the task instead of waiting for the next
    // full membership publish; a degraded pass proves nothing and reports nothing.
    if (listFailures === 0) {
      for (const threadId of externalThreads.keys()) if (!nextThreads.has(threadId)) removedThreadIds.add(threadId)
      for (const threadId of forgottenThreadIds.keys()) if (!listedIds.has(threadId)) forgottenThreadIds.delete(threadId)
    }
    for (const threadId of removedThreadIds) if (nextThreads.has(threadId)) removedThreadIds.delete(threadId)
    externalThreads = nextThreads
    if (typeof threadKey === 'function') threadKeyFn = threadKey
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
        ...(typeof thread.hasUnreadTurn === 'boolean' ? { codexhostHasUnreadTurn: thread.hasUnreadTurn } : {}),
        ...(typeof thread.pinned === 'boolean' ? { codexhostPinned: thread.pinned } : {})
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

  /**
   * An EyPc jump into an extra process is a read. Codex read state is owned
   * by the Provider (this preload): the acknowledgement map plus the memory
   * above answer every later observation, so the receipt itself is returned
   * unchanged — `confirmsRead` stays a Kernel-side hint that Codex never uses
   * (`PROVIDER_TRAITS.codex.readAcknowledgements === false`).
   */
  function honorExternalOpenRead(threadId, result, markRead) {
    if (!result || (result.outcome !== 'dispatched' && result.outcome !== 'opened')) return result
    if (isExternalThreadId(threadId) !== true) return result
    if (typeof markRead === 'function') markRead(threadId)
    rememberExternalOpenRead(threadId)
    return result
  }

  function hostConnectorActivity(known) {
    const flags = (Array.isArray(known.connectorActiveFlags) ? known.connectorActiveFlags : [])
      .filter((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
    const live = known.connectorStatus === 'active' || flags.length > 0
    return {
      status: live ? 'active' : 'idle',
      activeFlags: flags,
      ...(Number(known.connectorWaitingSince) > 0 ? { waitingSince: known.connectorWaitingSince } : {}),
      ...(known.connectorPlanImplementationOnly === true ? { planImplementationOnly: true } : {})
    }
  }

  function honorExternalProjection(threadId, known, activity) {
    if (!known || isExternalThreadId(threadId) !== true) return activity
    // Official App Server follow cannot load extra-process ids. A missing or
    // notLoaded Desktop shadow is silence, not Host state — keep the connector
    // so completed/idle/running rows stay visible after reload. Host running
    // also wins a Desktop idle, which is the same unloaded follow.
    const hostActivity = hostConnectorActivity(known)
    if (!activity || activity.status === 'notLoaded'
      || (hostActivity.status === 'active' && activity.status !== 'active')) {
      return hostActivity
    }
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
        status: hostActivity.status,
        activeFlags: []
      }
    }
    const connectorWaiting = hostActivity.activeFlags
    if (!connectorWaiting.length || next.status !== 'active') return next
    const liveFlags = Array.isArray(next.activeFlags) ? next.activeFlags : []
    if (liveFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')) return next
    return {
      ...next,
      activeFlags: [...connectorWaiting, ...liveFlags.filter((flag) => !connectorWaiting.includes(flag))],
      ...(Number(known.connectorWaitingSince) > 0 ? { waitingSince: known.connectorWaitingSince } : {})
    }
  }

  /**
   * A Host extra-process thread has no App Server Goal: `thread/goal/get`
   * cannot answer its id and the scan never queues it. Without this answer a
   * missing Goal cache entry reads as `unknown/verifying`, whose goal-verifying
   * candidate outranks the Host running/completed evidence in the Kernel and
   * parks every extra-process row in `unknown` — invisible, never active,
   * never completed-unread. Returns null for native ids.
   */
  function externalGoalEvidence(threadId) {
    return isExternalThreadId(threadId)
      ? { goalStatus: 'none', goalFreshness: 'fresh', goalEvidenceSequence: 0, goalUpdatedAt: 0 }
      : null
  }

  /**
   * Runs one delegation CLI command and returns its JSON envelope whatever
   * the exit code. The roster refresh can afford to treat any failure as "no
   * rows this scan"; an archive cannot — the caller must retain the task on
   * THREAD_BUSY / THREAD_NOT_FOUND instead of guessing, and the CLI writes
   * that envelope to stderr with exit 1. No output at all means the cached
   * rendezvous names a dead Host generation, so it is dropped here too.
   */
  function runEnvelope(command, args, options = {}) {
    return new Promise((resolve) => {
      try {
        execFile(command, args, {
          timeout: options.timeout || CODEXHOST_CLI_TIMEOUT_MS,
          maxBuffer: 4 * 1024 * 1024,
          env: options.env,
          encoding: 'utf8'
        }, (error, stdout, stderr) => {
          const out = String(stdout || '').trim()
          const err = String(stderr || '').trim()
          if (out) return resolve(out)
          if (err) return resolve(err)
          resolve(error ? null : '')
        })
      } catch {
        resolve(null)
      }
    })
  }

  function cliEnv(resolved) {
    return {
      PATH: '/usr/bin:/bin:/usr/local/bin',
      HOME: process.env.HOME || '',
      CODEXHOST_RUNTIME_ENDPOINT: resolved.endpoint,
      CODEXHOST_RUNTIME_TOKEN: resolved.token
    }
  }

  async function codexhostCommand(verb, args) {
    const resolved = await resolveRendezvous()
    if (!resolved) {
      noteCommand(verb, 'RUNTIME_UNREACHABLE')
      return { ok: false, code: 'RUNTIME_UNREACHABLE', message: 'codexhost rendezvous unavailable' }
    }
    const output = await runEnvelope(resolved.cliPath, args, { env: cliEnv(resolved) })
    if (output === null) {
      rendezvous = null
      noteCommand(verb, 'RUNTIME_UNREACHABLE')
      return { ok: false, code: 'RUNTIME_UNREACHABLE', message: 'codexhost CLI produced no output' }
    }
    let parsed
    try { parsed = JSON.parse(output) } catch {
      noteCommand(verb, 'PROTOCOL_ERROR')
      return { ok: false, code: 'PROTOCOL_ERROR', message: 'codexhost CLI output is not JSON' }
    }
    if (record(parsed).error) {
      const failure = record(parsed.error)
      const code = typeof failure.code === 'string' && failure.code ? failure.code : 'INTERNAL_ERROR'
      if (code === 'RUNTIME_UNREACHABLE') rendezvous = null
      noteCommand(verb, code)
      return { ok: false, code, message: typeof failure.message === 'string' ? failure.message.slice(0, 200) : '' }
    }
    noteCommand(verb, 'ok')
    return { ok: true, value: parsed }
  }

  /** Counts and codes only: never an id, a title or the rendezvous. */
  function noteCommand(verb, code) {
    recordDiagnostic({
      level: code === 'ok' ? 'debug' : 'error',
      scope: 'task-recovery',
      event: 'codexhost-command',
      outcome: code === 'ok' ? 'ok' : 'failed',
      provider: 'codex',
      count: externalThreads.size,
      details: { verb, code }
    })
  }

  /** Host `thread read` for an archive preflight: status and latest Turn only. */
  async function codexhostReadThread(threadId) {
    const result = await codexhostCommand('read', ['thread', 'read', String(threadId)])
    if (!result.ok) return result
    const snapshot = record(result.value)
    const turn = record(snapshot.turn)
    return {
      ok: true,
      status: normalizeHostStatus(snapshot.status),
      turnStatus: typeof turn.status === 'string' ? turn.status : ''
    }
  }

  /**
   * Host `thread archive|unarchive`. The Host persists the state and sends
   * Desktop the same `thread/archived` a sidebar archive does, so EyPc has no
   * Desktop leg of its own here.
   */
  async function codexhostArchiveThread(threadId, archived = true) {
    const verb = archived === false ? 'unarchive' : 'archive'
    const result = await codexhostCommand(verb, ['thread', verb, String(threadId)])
    if (!result.ok) return result
    const value = record(result.value)
    return {
      ok: true,
      threadId: typeof value.threadId === 'string' ? value.threadId : String(threadId),
      archived: value.archived === true
    }
  }

  /**
   * Archive verdict from the Host lists, in the official lane's shape: the
   * live list must no longer carry the id and the archived list must. Both
   * lists are scoped to the row's cwd when known and sorted by update time,
   * so the row just archived sorts first instead of behind years of native
   * archive history.
   */
  async function codexhostArchiveState(threadId) {
    const id = String(threadId || '').toLowerCase()
    const cwd = externalThreads.get(id)?.cwd || ''
    const scope = cwd ? ['--cwd', cwd] : ['--all', 'true']
    const base = ['thread', 'list', '--limit', '100', '--sort', 'updated-desc', ...scope]
    const [live, archived] = await Promise.all([
      codexhostCommand('list', base),
      codexhostCommand('list', [...base, '--archived', 'true'])
    ])
    const failed = !live.ok ? live : !archived.ok ? archived : null
    if (failed) return { ok: false, code: failed.code, message: failed.message }
    const has = (page) => (Array.isArray(record(page.value).threads) ? page.value.threads : [])
      .some((thread) => typeof record(thread).threadId === 'string' && thread.threadId.toLowerCase() === id)
    return { ok: true, unarchivedPresent: has(live), archivedPresent: has(archived) }
  }

  /**
   * Host `thread pin|unpin` (codexhost >= thread-pin). The Host moves the
   * extra process into / out of the Desktop Pinned section and persists
   * `pinned`; Desktop learns it on its next `thread/list`, so the verdict
   * below is the Host list, never a Desktop receipt.
   */
  async function codexhostPinThread(threadId, pinned = true) {
    const verb = pinned === false ? 'unpin' : 'pin'
    const result = await codexhostCommand(verb, ['thread', verb, String(threadId)])
    if (!result.ok) return result
    const value = record(result.value)
    const id = String(threadId || '').toLowerCase()
    const current = externalThreads.get(id)
    if (current && typeof value.pinned === 'boolean') {
      // Keep the roster and its memory ahead of the next Host list refresh so
      // the pin does not flash back on an intermediate scan.
      const seated = seatThread({ ...current, pinned: value.pinned })
      externalThreads.set(id, seated.seated)
      if (seated.changed) persistThreadMemory()
    }
    return {
      ok: true,
      threadId: typeof value.threadId === 'string' ? value.threadId : String(threadId),
      pinned: value.pinned === true
    }
  }

  /** Pin verdict from the Host live list: `pinned` of the row, `null` when the Host omits it. */
  async function codexhostPinState(threadId) {
    const id = String(threadId || '').toLowerCase()
    const cwd = externalThreads.get(id)?.cwd || ''
    const scope = cwd ? ['--cwd', cwd] : ['--all', 'true']
    const page = await codexhostCommand('list', ['thread', 'list', '--limit', '100', '--sort', 'updated-desc', ...scope])
    if (!page.ok) return { ok: false, code: page.code, message: page.message }
    const row = (Array.isArray(record(page.value).threads) ? page.value.threads : [])
      .map(record)
      .find((thread) => typeof thread.threadId === 'string' && thread.threadId.toLowerCase() === id)
    if (!row) return { ok: false, code: 'THREAD_NOT_FOUND', message: 'Host live list no longer carries the thread' }
    return { ok: true, pinned: typeof row.pinned === 'boolean' ? row.pinned : null }
  }

  /** Drops a just-archived row so the next scan does not wait a TTL for it. */
  function codexhostForgetThread(threadId) {
    const id = String(threadId || '').toLowerCase()
    if (threadMemory.delete(id)) persistThreadMemory()
    if (!externalThreads.delete(id)) return false
    forgottenThreadIds.set(id, now())
    removedThreadIds.delete(id)
    externalKeys = new Set(typeof threadKeyFn === 'function'
      ? [...externalThreads.keys()].map((known) => threadKeyFn(known))
      : [])
    listRefreshedAt = 0
    return true
  }

  /** Ids a complete Host list dropped since the last drain; each id is reported once. */
  function codexhostTakeRemovedThreadIds() {
    const ids = [...removedThreadIds]
    removedThreadIds = new Set()
    return ids
  }

  /**
   * Drops the runtime roster. Thread memory is persisted truth, not a cache:
   * it stays unless a test asks for `forgetMemory`, so the next roster seats
   * every remembered id with its original `statusChangedAt` and jump-read.
   */
  function codexhostResetDiscovery(options = {}) {
    closeStoreWatcher()
    rendezvous = null
    externalThreads = new Map()
    externalKeys = new Set()
    forgottenThreadIds = new Map()
    removedThreadIds = new Set()
    listRefreshedAt = 0
    lastDiagnosticLine = ''
    if (options.forgetMemory === true) {
      threadMemory = new Map()
      persistThreadMemory()
    }
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
    isExternalOpenedRead,
    externalGoalEvidence,
    compareHostDesktopUnread,
    codexhostReadThread,
    codexhostArchiveThread,
    codexhostArchiveState,
    codexhostPinThread,
    codexhostPinState,
    codexhostForgetThread,
    codexhostTakeRemovedThreadIds,
    codexhostInvalidateList,
    codexhostResetDiscovery
  }
}

module.exports = {
  CODEXHOST_DISCOVERY_REVISION,
  CODEXHOST_FORGET_SUPPRESS_MS,
  CODEXHOST_THREAD_MEMORY_STORAGE_KEY,
  CODEXHOST_THREAD_MEMORY_LIMIT,
  CODEXHOST_LIST_TTL_MS,
  CODEXHOST_RUNNING_LIST_TTL_MS,
  CODEXHOST_STORE_DEBOUNCE_MS,
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
