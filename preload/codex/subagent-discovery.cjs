'use strict'

const { resolveSqliteBin, querySqliteCli } = require('../sqlite-readonly.cjs')
const SPAWN_EDGE_BATCH_SIZE = 128
const SPAWN_EDGE_MAX_PAIRS = 512
const NATIVE_THREAD_ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i

/**
 * Discovers Codex subagent threads from recent session rollout files.
 *
 * `thread/list` omits subagent runs entirely (verified against app-server
 * 0.150.1: a live subagent writing its rollout is absent from every page), so
 * a subagent working for a listed thread is invisible to the inventory scan —
 * the parent then presents its own last terminal state while Codex natively
 * shows the group running. Recent rollout files provide candidates, and
 * persisted spawn edges recover linked candidates beyond the fallback limit.
 * The basename alone asserts nothing — a candidate becomes a row only through
 * the injected `thread/read` whose `parentThreadId` names a thread already in
 * the scan's inventory, and the verified row then flows through the ordinary
 * pipeline (topology, side relations, targeted latest-Turn reads) so no
 * consumer gains a second phase judgment. Exact guardian_review rows retain
 * their source identity here so the entry can exclude internal reviews from
 * user-task membership across inventory and live transports.
 *
 * `fs`/`path` are injected on the native-state-paths precedent; `readThread`
 * and `record` keep RPC transport and diagnostics with the entry.
 */

const CODEX_SUBAGENT_DISCOVERY_REVISION = 'codex-subagent-discovery-v3'
/** Bounded like side-relation hints: older activity is not worth a targeted read. */
const CODEX_SUBAGENT_DISCOVERY_MAX_AGE_MS = 48 * 60 * 60 * 1000
/** Caps per-scan `thread/read` verification work for unknown candidates. */
const CODEX_SUBAGENT_DISCOVERY_LIMIT = 24
/** Keeps the verification cache from outliving its candidate window. */
const CODEX_SUBAGENT_DISCOVERY_CACHE_LIMIT = 200
const CODEX_THREAD_SOURCE_IDENTITY_CACHE_LIMIT = 2000
const CODEX_THREAD_SOURCE_RECOVERY_CONCURRENCY = 4
const CODEX_THREAD_SOURCE_RECOVERY_ATTEMPT_LIMIT = 3
/** `rollout-<date>T<time>-<threadId>[_<segment>].jsonl`; the first uuid is the thread id. */
const ROLLOUT_BASENAME_PATTERN = /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_[0-9a-f][0-9a-f-]*)?\.jsonl$/i

function record(value) {
  return value && typeof value === 'object' ? value : {}
}

/**
 * Whether a thread's `threadSource` marks a machine sub-run (subagent or
 * guardian review). Such runs have no user-facing unread concept — the user
 * never opens them, so the desktop unread set keeps them "unread" forever and
 * an aggregation that counted that would pin every parent completed-unread.
 * RPC shapes observed on 0.150.1: the string `subagent`, the legacy rollout
 * string `guardian_review`, and the object form `{ subAgent: {...} }`.
 */
function isSubAgentThreadSource(value) {
  if (typeof value === 'string') return /^(subagent|guardian_review)$/i.test(value)
  return Boolean(value && typeof value === 'object' && value.subAgent !== undefined)
}

function isInternalReviewThreadSource(value) {
  return value === 'guardian_review'
}

/** Only native finite source shapes may supersede a verified source identity. */
function codexThreadSourceKind(value) {
  if (isInternalReviewThreadSource(value)) return 'guardian_review'
  if (isSubAgentThreadSource(value)) return 'machine'
  if (['user', 'cli', 'exec', 'vscode', 'appServer'].includes(value)) return 'human'
  return 'unknown'
}

function createCodexSubagentDiscovery(dependencies = {}) {
  const fs = dependencies.fs
  const path = dependencies.path
  const validThreadId = dependencies.validThreadId
  const readThread = typeof dependencies.readThread === 'function' ? dependencies.readThread : null
  const recordDiagnostic = typeof dependencies.record === 'function' ? dependencies.record : () => {}
  if (!fs || !path || typeof validThreadId !== 'function') {
    throw new TypeError('codex subagent discovery requires fs, path and validThreadId')
  }

  /** Cache verified metadata separately from admission to the current root set. */
  let verifiedRows = new Map()
  const threadSourceIdentities = new Map()
  const unretainedIdentityIds = new Set()
  const recoveryAttempts = new Map()
  const unretainedRecoveryIds = new Set()
  const recoveryRequests = new Map()
  const recoveryQueue = new Map()
  let activeRecoveryCount = 0
  let retainedThreadIds = new Set()
  let scopeGeneration = 0
  let attachedSideSample = null
  let attachedSideReadSequence = 0

  function pruneThreadSourceIdentities() {
    while (unretainedIdentityIds.size > CODEX_THREAD_SOURCE_IDENTITY_CACHE_LIMIT) {
      const threadId = unretainedIdentityIds.values().next().value
      unretainedIdentityIds.delete(threadId)
      threadSourceIdentities.delete(threadId)
    }
  }

  function pruneThreadSourceRecoveryAttempts() {
    while (unretainedRecoveryIds.size > CODEX_THREAD_SOURCE_IDENTITY_CACHE_LIMIT) {
      const threadId = unretainedRecoveryIds.values().next().value
      unretainedRecoveryIds.delete(threadId)
      recoveryAttempts.delete(threadId)
    }
  }

  function codexRetainThreadIds(threadIds) {
    if (!Array.isArray(threadIds) && !(threadIds instanceof Set)) return null
    retainedThreadIds = new Set([...threadIds]
      .filter((threadId) => typeof threadId === 'string' && validThreadId(threadId))
      .map((threadId) => threadId.toLowerCase()))
    for (const threadId of threadSourceIdentities.keys()) {
      if (retainedThreadIds.has(threadId)) unretainedIdentityIds.delete(threadId)
      else unretainedIdentityIds.add(threadId)
    }
    for (const threadId of recoveryAttempts.keys()) {
      if (retainedThreadIds.has(threadId)) unretainedRecoveryIds.delete(threadId)
      else unretainedRecoveryIds.add(threadId)
    }
    pruneThreadSourceIdentities()
    pruneThreadSourceRecoveryAttempts()
    return {
      retainedCount: retainedThreadIds.size,
      identityCount: threadSourceIdentities.size,
      unretainedCount: unretainedIdentityIds.size
    }
  }

  function codexGetThreadSourceIdentity(threadId) {
    if (typeof threadId !== 'string' || !validThreadId(threadId)) return 'unknown'
    return threadSourceIdentities.get(threadId.toLowerCase()) || 'unknown'
  }

  function codexObserveThreadSourceIdentity(threadId, identity) {
    if (typeof threadId !== 'string' || !validThreadId(threadId)) return 'unknown'
    const id = threadId.toLowerCase()
    if (['machine', 'human', 'guardian_review'].includes(identity)) threadSourceIdentities.set(id, identity)
    if (threadSourceIdentities.has(id) && !retainedThreadIds.has(id)) {
      unretainedIdentityIds.delete(id)
      unretainedIdentityIds.add(id)
    }
    pruneThreadSourceIdentities()
    return codexGetThreadSourceIdentity(id)
  }

  function codexIsInternalReviewThread(threadId) {
    return codexGetThreadSourceIdentity(threadId) === 'guardian_review'
  }

  function codexObserveThreadSourceKind(threadId, kind) {
    return codexObserveThreadSourceIdentity(threadId, kind) === 'guardian_review'
  }

  function codexObserveThreadRows(rows) {
    const internalIds = new Set()
    for (const value of Array.isArray(rows) ? rows : []) {
      const row = record(value)
      if (typeof row.id !== 'string' || !validThreadId(row.id)) continue
      const kind = codexThreadSourceKind(row.threadSource)
      if (codexObserveThreadSourceKind(row.id, kind)) internalIds.add(row.id.toLowerCase())
      else internalIds.delete(row.id.toLowerCase())
    }
    return [...internalIds]
  }

  function finishThreadSourceRecovery(request, identity) {
    if (recoveryRequests.get(request.threadId) === request) recoveryRequests.delete(request.threadId)
    request.resolve(identity)
  }

  async function readThreadSourceIdentity(request) {
    try {
      const response = await readThread(request.threadId)
      if (request.generation !== scopeGeneration) return
      const thread = record(record(response).thread)
      if (codexGetThreadSourceIdentity(request.threadId) === 'unknown'
        && typeof thread.id === 'string' && thread.id.toLowerCase() === request.threadId) {
        codexObserveThreadRows([thread])
      }
    } catch {} finally {
      activeRecoveryCount -= 1
      finishThreadSourceRecovery(request, request.generation === scopeGeneration
        ? codexGetThreadSourceIdentity(request.threadId) : 'unknown')
      queueMicrotask(drainThreadSourceRecoveryQueue)
    }
  }

  function drainThreadSourceRecoveryQueue() {
    while (activeRecoveryCount < CODEX_THREAD_SOURCE_RECOVERY_CONCURRENCY && recoveryQueue.size) {
      const request = recoveryQueue.values().next().value
      recoveryQueue.delete(request.threadId)
      if (request.generation !== scopeGeneration) {
        finishThreadSourceRecovery(request, 'unknown')
        continue
      }
      const identity = codexGetThreadSourceIdentity(request.threadId)
      const attempts = recoveryAttempts.get(request.threadId) || 0
      if (identity !== 'unknown' || attempts >= CODEX_THREAD_SOURCE_RECOVERY_ATTEMPT_LIMIT) {
        finishThreadSourceRecovery(request, identity)
        continue
      }
      recoveryAttempts.set(request.threadId, attempts + 1)
      if (!retainedThreadIds.has(request.threadId)) {
        unretainedRecoveryIds.delete(request.threadId)
        unretainedRecoveryIds.add(request.threadId)
      }
      pruneThreadSourceRecoveryAttempts()
      activeRecoveryCount += 1
      void readThreadSourceIdentity(request)
    }
  }

  function codexRecoverThreadSourceIdentity(threadId) {
    if (typeof threadId !== 'string' || !validThreadId(threadId)) return Promise.resolve('unknown')
    const id = threadId.toLowerCase()
    const pending = recoveryRequests.get(id)
    if (pending) return pending.promise
    const identity = codexGetThreadSourceIdentity(id)
    if (identity !== 'unknown' || !readThread
      || (recoveryAttempts.get(id) || 0) >= CODEX_THREAD_SOURCE_RECOVERY_ATTEMPT_LIMIT
      || (!retainedThreadIds.has(id) && recoveryQueue.size >= CODEX_THREAD_SOURCE_IDENTITY_CACHE_LIMIT)) {
      return Promise.resolve(identity)
    }
    let resolveRecovery
    const promise = new Promise((resolve) => { resolveRecovery = resolve })
    const request = { threadId: id, generation: scopeGeneration, promise, resolve: resolveRecovery }
    recoveryRequests.set(id, request)
    recoveryQueue.set(id, request)
    drainThreadSourceRecoveryQueue()
    return promise
  }

  function numericNameDescending(entries) {
    return entries
      .filter((name) => /^\d+$/.test(name))
      .sort((left, right) => Number(right) - Number(left))
  }

  function listDirectory(target) {
    try { return fs.readdirSync(target) } catch { return [] }
  }

  /** Newest day directories under `<root>/<yyyy>/<mm>/<dd>`, newest first. */
  function recentDayDirectories(root, maxDays) {
    const days = []
    for (const year of numericNameDescending(listDirectory(root))) {
      for (const month of numericNameDescending(listDirectory(path.join(root, year)))) {
        for (const day of numericNameDescending(listDirectory(path.join(root, year, month)))) {
          days.push(path.join(root, year, month, day))
          if (days.length >= maxDays) return days
        }
      }
    }
    return days
  }

  function codexRolloutFilenameThreadId(name) {
    const match = typeof name === 'string' ? ROLLOUT_BASENAME_PATTERN.exec(name) : null
    const threadId = match ? match[1].toLowerCase() : ''
    return validThreadId(threadId) ? threadId : ''
  }

  function recentRolloutCandidates(input) {
    const root = typeof input.root === 'string' ? input.root : ''
    const knownIds = input.knownIds instanceof Set ? input.knownIds : new Set()
    const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now()
    const maxAgeMs = Number.isFinite(input.maxAgeMs) && input.maxAgeMs > 0
      ? input.maxAgeMs
      : CODEX_SUBAGENT_DISCOVERY_MAX_AGE_MS
    if (!root) return []
    // The age window can span at most one more local calendar day than it has whole days.
    const dayCount = Math.min(31, Math.ceil(maxAgeMs / (24 * 60 * 60 * 1000)) + 1)
    const newestByThreadId = new Map()
    for (const dayDirectory of recentDayDirectories(root, dayCount)) {
      for (const name of listDirectory(dayDirectory)) {
        const threadId = codexRolloutFilenameThreadId(name)
        if (!threadId || knownIds.has(threadId)) continue
        let mtimeMs = 0
        try { mtimeMs = fs.statSync(path.join(dayDirectory, name)).mtimeMs } catch { continue }
        if (!(mtimeMs > 0) || nowMs - mtimeMs > maxAgeMs) continue
        const previous = newestByThreadId.get(threadId)
        if (!previous || mtimeMs > previous.mtimeMs) newestByThreadId.set(threadId, { threadId, mtimeMs })
      }
    }
    return [...newestByThreadId.values()]
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
  }

  function codexRecentRolloutThreadCandidates(input = {}) {
    const limit = Number.isInteger(input.limit) && input.limit > 0
      ? input.limit
      : CODEX_SUBAGENT_DISCOVERY_LIMIT
    return recentRolloutCandidates(input).slice(0, limit)
  }

  function nativeThreadIds(threadIds) {
    const ids = []
    const seen = new Set()
    for (const threadId of threadIds) {
      if (!NATIVE_THREAD_ID.test(threadId) || seen.has(threadId)) continue
      seen.add(threadId)
      ids.push(threadId)
    }
    return ids
  }

  async function readNativeSpawnParents(directory, threadIds, isCurrent) {
    const ids = nativeThreadIds(threadIds)
    if (!ids.length) return { outcome: 'read', parents: new Map(), retired: new Set() }
    const { outcome, value } = await readNativeState(directory, async query => {
      const parents = new Map()
      const retired = new Set()
      for (let offset = 0; offset < ids.length; offset += SPAWN_EDGE_BATCH_SIZE) {
        if (!isCurrent()) throw new Error('codex spawn lookup superseded')
        const batch = ids.slice(offset, offset + SPAWN_EDGE_BATCH_SIZE)
        for (const id of batch) parents.set(id, null)
        const values = batch.map(id => `('${id}')`).join(',')
        const rows = await query(`SELECT child.id, edge.parent_thread_id AS parent,
            child.archived AS childArchived, parent.archived AS parentArchived
          FROM (VALUES ${values}) AS wanted
          JOIN threads AS child ON child.id = wanted.column1
          LEFT JOIN thread_spawn_edges AS edge ON edge.child_thread_id = child.id
          LEFT JOIN threads AS parent ON parent.id = edge.parent_thread_id
          WHERE child.thread_source = 'subagent'`)
        for (const { id, parent, childArchived, parentArchived } of rows) {
          if (!parents.has(id) || retired.has(id)) continue
          if (childArchived === 1 || parentArchived === 1) {
            retired.add(id)
            parents.set(id, null)
            continue
          }
          if (parentArchived === null || !NATIVE_THREAD_ID.test(parent) || id === parent) continue
          const previous = parents.get(id)
          parents.set(id, previous == null || previous === parent ? parent : '')
        }
      }
      return { parents, retired }
    }, 64 * 1024)
    return outcome === 'read' && value ? { outcome, ...value } : { outcome: 'unavailable' }
  }

  function rootedSpawnCandidates(parents, knownIds) {
    const reachable = new Set(knownIds)
    const children = new Map()
    for (const [child, parent] of parents) {
      if (!parent) continue
      if (!children.has(parent)) children.set(parent, [])
      children.get(parent).push(child)
    }
    for (const parent of reachable) {
      for (const child of children.get(parent) || []) reachable.add(child)
    }
    return reachable
  }

  /**
   * Verified subagent rows for one scan. The rollout walk keeps its existing
   * relation-less probe budget. Native metadata covers that probe and members
   * already held from a spawn edge: lookup failure keeps the verified parent,
   * while a complete miss, archive, or confirmed reparent removes or rereads
   * it. Source and the returned row still come from scoped `thread/read`.
   */
  async function codexDiscoverSubagentThreadRows(input = {}) {
    const generation = scopeGeneration
    const isCurrent = () => generation === scopeGeneration && input.isCurrent?.() !== false
    if (!isCurrent()) return []
    const rows = Array.isArray(input.rows) ? input.rows : []
    codexObserveThreadRows(rows)
    if (!readThread) return []
    const archived = input.archivedThreadIds instanceof Set ? input.archivedThreadIds : new Set()
    const knownIds = new Set(rows.map(row => record(row).id).filter(id => validThreadId(id) && !archived.has(id)))
    for (const threadId of archived) {
      const entry = verifiedRows.get(threadId)
      if (entry?.row) verifiedRows.set(threadId, { mtimeMs: entry.mtimeMs, row: null, detached: true })
    }
    const recent = recentRolloutCandidates({
      root: input.root,
      knownIds: new Set([...knownIds, ...archived]),
      nowMs: input.nowMs
    })
    const candidates = recent.slice(0, CODEX_SUBAGENT_DISCOVERY_LIMIT)
    const included = new Set(candidates.map(candidate => candidate.threadId))
    const heldIds = []
    for (const [threadId, entry] of verifiedRows) {
      if (!entry?.nativeParent || entry.detached || !entry.row || archived.has(threadId) || knownIds.has(threadId)) continue
      if (codexThreadSourceKind(entry.row.threadSource) !== 'machine' || !NATIVE_THREAD_ID.test(threadId)) continue
      heldIds.push(threadId)
    }
    let native = { outcome: 'skipped' }
    if (input.directory && knownIds.size && (recent.length || heldIds.length)) {
      native = await readNativeSpawnParents(input.directory, [...recent.map(candidate => candidate.threadId), ...heldIds], isCurrent)
      if (!isCurrent()) return []
    }
    const nativeFacts = threadId => {
      if (native.outcome !== 'read' || !native.parents.has(threadId)) return { state: 'unknown' }
      if (native.retired.has(threadId)) return { state: 'archived' }
      const parent = native.parents.get(threadId)
      return parent ? { state: 'parent', parent } : { state: 'absent' }
    }
    const detachVerified = (threadId, mtimeMs) => {
      const previous = verifiedRows.get(threadId)
      verifiedRows.set(threadId, { mtimeMs: mtimeMs || previous?.mtimeMs || 0, row: null, detached: true })
    }
    if (native.outcome === 'read') {
      const linked = new Map([...native.parents].filter(([, parent]) => parent))
      const reachable = rootedSpawnCandidates(linked, knownIds)
      for (const candidate of recent.slice(CODEX_SUBAGENT_DISCOVERY_LIMIT)) {
        if (!reachable.has(candidate.threadId) || included.has(candidate.threadId)) continue
        candidates.push(candidate)
        included.add(candidate.threadId)
      }
      for (const threadId of heldIds) {
        const entry = verifiedRows.get(threadId)
        const parent = native.parents.get(threadId)
        if (parent && reachable.has(threadId)) {
          if (!included.has(threadId)) {
            candidates.push({ threadId, mtimeMs: entry.mtimeMs })
            included.add(threadId)
          }
          continue
        }
        detachVerified(threadId, entry?.mtimeMs)
      }
    } else if (native.outcome === 'unavailable') {
      const freshMtime = new Map(recent.map(candidate => [candidate.threadId, candidate.mtimeMs]))
      for (const threadId of heldIds) {
        if (included.has(threadId)) continue
        const entry = verifiedRows.get(threadId)
        if (!entry?.row) continue
        candidates.push({ threadId, mtimeMs: freshMtime.get(threadId) || entry.mtimeMs })
        included.add(threadId)
      }
    }
    const discovered = []
    const verified = new Array(candidates.length)
    const seenThisScan = new Set(included)
    let nextCandidate = 0
    let readCount = 0
    await Promise.all(Array.from({ length: Math.min(candidates.length, CODEX_THREAD_SOURCE_RECOVERY_CONCURRENCY) }, async () => {
      while (isCurrent() && nextCandidate < candidates.length) {
        const index = nextCandidate++
        const { threadId, mtimeMs } = candidates[index]
        const facts = nativeFacts(threadId)
        const cached = verifiedRows.get(threadId)
        if (facts.state === 'archived') {
          detachVerified(threadId, mtimeMs)
          continue
        }
        const sameNativeParent = facts.state !== 'parent'
          || cached?.row?.parentThreadId === facts.parent && codexThreadSourceKind(cached.row.threadSource) === 'machine'
        if (cached?.detached && facts.state !== 'parent') {
          verified[index] = null
          continue
        }
        if (facts.state === 'absent' && cached?.nativeParent && cached.row
          && codexThreadSourceKind(cached.row.threadSource) === 'machine') {
          detachVerified(threadId, mtimeMs)
          verified[index] = null
          continue
        }
        if (cached?.mtimeMs === mtimeMs && sameNativeParent && !cached.detached) {
          if (facts.state === 'parent' && cached.row && cached.nativeParent !== facts.parent) {
            verifiedRows.set(threadId, { ...cached, nativeParent: facts.parent })
          }
          verified[index] = cached.row
          continue
        }
        try {
          readCount += 1
          const thread = record(record(await readThread(threadId, isCurrent)).thread)
          if (!isCurrent()) return
          if (thread.id !== threadId) throw new Error('codex member metadata unavailable')
          codexObserveThreadRows([thread])
          const matchesNative = facts.state !== 'parent'
            || thread.parentThreadId === facts.parent && codexThreadSourceKind(thread.threadSource) === 'machine'
          if (!matchesNative) {
            if (cached?.row) detachVerified(threadId, cached.mtimeMs)
            continue
          }
          const validParent = validThreadId(thread.parentThreadId) && thread.parentThreadId !== thread.id
          const row = validParent ? thread : null
          const rememberedParent = facts.state === 'parent'
            ? facts.parent
            : cached?.nativeParent && cached.nativeParent === row?.parentThreadId ? cached.nativeParent : undefined
          verifiedRows.set(threadId, { mtimeMs, row, ...(row && rememberedParent ? { nativeParent: rememberedParent } : {}) })
          verified[index] = row
        } catch {
          if (!isCurrent()) return
          if (facts.state === 'parent' && cached?.row?.parentThreadId !== facts.parent) {
            detachVerified(threadId, cached?.mtimeMs)
            continue
          }
          if (cached?.row && !cached.detached) verified[index] = cached.row
        }
      }
    }))
    if (!isCurrent()) return []
    const pending = new Map(verified.filter(Boolean).map(thread => [thread.id, thread]))
    let advanced = true
    while (advanced) {
      advanced = false
      for (const [threadId, thread] of pending) {
        if (!knownIds.has(thread.parentThreadId)) continue
        knownIds.add(threadId)
        discovered.push(thread)
        pending.delete(threadId)
        advanced = true
      }
    }
    if (verifiedRows.size > CODEX_SUBAGENT_DISCOVERY_CACHE_LIMIT) {
      for (const threadId of [...verifiedRows.keys()]) {
        if (!seenThisScan.has(threadId)) verifiedRows.delete(threadId)
      }
    }
    if (readCount || discovered.length) {
      recordDiagnostic({
        level: 'debug',
        scope: 'task-recovery',
        event: 'subagent-discovery',
        outcome: discovered.length ? 'discovered' : 'none-linkable',
        cache: 'provider-direct',
        count: discovered.length,
        details: { candidateCount: candidates.length, nativeCandidateCount: Math.max(0, candidates.length - CODEX_SUBAGENT_DISCOVERY_LIMIT), readCount }
      })
    }
    return discovered
  }

  function codexResetSubagentDiscovery(options = {}) {
    scopeGeneration += 1
    verifiedRows = new Map()
    attachedSideSample = null
    if (options.preserveIdentities !== true) {
      threadSourceIdentities.clear()
      unretainedIdentityIds.clear()
      retainedThreadIds.clear()
    }
    recoveryAttempts.clear()
    unretainedRecoveryIds.clear()
    for (const request of recoveryRequests.values()) request.resolve('unknown')
    recoveryRequests.clear()
    recoveryQueue.clear()
  }

  function codexIsMachineRunThread(threadId) {
    const identity = codexGetThreadSourceIdentity(threadId)
    return identity === 'machine' || identity === 'guardian_review'
  }

  async function readNativeState(directory, operation, maxBuffer) {
    let database
    let driver = ''
    try {
      const databaseName = fs.readdirSync(directory)
        .filter((name) => /^state_[1-9]\d*\.sqlite$/.test(name))
        .sort((left, right) => Number.parseInt(right.slice(6), 10) - Number.parseInt(left.slice(6), 10))[0]
      if (!databaseName) return { outcome: 'database-missing', value: null }
      const databaseFile = path.join(directory, databaseName)
      const bin = resolveSqliteBin(fs, dependencies.sqliteBin)
      const query = bin
        ? (sql) => querySqliteCli({ execFile: dependencies.execFile || require('node:child_process').execFile },
          bin, databaseFile, sql, { timeout: 1_500, maxBuffer })
        : (sql) => {
            const DatabaseSync = dependencies.DatabaseSync || require('node:sqlite').DatabaseSync
            database ||= new DatabaseSync(databaseFile, { readOnly: true })
            return database.prepare(sql).all()
          }
      driver = bin ? 'cli' : 'builtin'
      return { outcome: 'read', driver, value: await operation(query) }
    } catch {
      return { outcome: 'unavailable', driver, value: null }
    } finally {
      try { database?.close() } catch {}
    }
  }

  async function codexReadAttachedSides(directory, isCurrent) {
    const generation = scopeGeneration
    const readSequence = ++attachedSideReadSequence
    const requestedAt = Date.now()
    const { value } = await readNativeState(directory, async query => {
      try {
        const rows = await query(`SELECT threads.id, attached_thread_parent_id AS parent, archived,
          receipt.last_published_turn AS turnId, receipt.first_unread_turn IS NOT NULL AS unread
          FROM threads LEFT JOIN thread_read_receipts AS receipt ON receipt.thread_id = threads.id
          WHERE threads.thread_source = 'user' AND attached_thread_parent_id IS NOT NULL ORDER BY threads.id`)
        return { rows, readsAvailable: true }
      } catch {
        const rows = await query(`SELECT id, attached_thread_parent_id AS parent, archived
          FROM threads WHERE thread_source = 'user' AND attached_thread_parent_id IS NOT NULL ORDER BY id`)
        return { rows, readsAvailable: false }
      }
    }, 1024 * 1024)
    if (generation !== scopeGeneration || isCurrent?.() === false) return null
    const previous = attachedSideSample?.directory === directory ? attachedSideSample : null
    if (!value || previous?.readSequence > readSequence) {
      return previous ? { ...previous, verified: false, changed: false, changedReadIds: [] } : null
    }
    const parents = new Map()
    const retired = new Set()
    for (const { id, parent, archived } of value.rows) {
      if (!NATIVE_THREAD_ID.test(id) || !NATIVE_THREAD_ID.test(parent) || id === parent) continue
      if (archived === 1) retired.add(id)
      else if (archived === 0) parents.set(id, parent)
    }
    const changed = parents.size !== (previous?.parents.size || 0)
      || [...parents].some(([id, parent]) => previous?.parents.get(id) !== parent)
      || retired.size !== (previous?.retired.size || 0)
      || [...retired].some(id => !previous?.retired.has(id))
    const receipts = new Map()
    for (const { id, turnId, unread } of value.rows) {
      if (!parents.has(id)) continue
      if (typeof turnId === 'string' && turnId && turnId.length <= 200 && (unread === 0 || unread === 1)) {
        const priorReceipt = previous?.parents.get(id) === parents.get(id) && previous.receipts.get(id)
        receipts.set(id, priorReceipt?.turnId === turnId && priorReceipt.unread === (unread === 1)
          ? priorReceipt : { turnId, unread: unread === 1, requestedAt })
      } else if (!value.readsAvailable && previous?.parents.get(id) === parents.get(id) && previous.receipts.has(id)) {
        receipts.set(id, previous.receipts.get(id))
      }
    }
    const changedReadIds = [...new Set([...receipts.keys(), ...(previous?.receipts.keys() || [])])].filter(id => {
      const before = previous?.receipts.get(id)
      const after = receipts.get(id)
      return before?.turnId !== after?.turnId || before?.unread !== after?.unread
    })
    attachedSideSample = { directory, readSequence, parents, retired, receipts,
      topologyRevision: changed ? readSequence : previous?.topologyRevision || 0 }
    return { ...attachedSideSample, verified: true, changed, changedReadIds }
  }

  function codexCurrentAttachedSides(directory) {
    return attachedSideSample?.directory === directory ? attachedSideSample : null
  }

  async function codexReadRecentInventoryTargets(directory, after, limit, isCurrent) {
    const generation = scopeGeneration
    const start = Math.max(0, Math.floor(after / 1_000))
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return null
    const { value } = await readNativeState(directory, query => query(`SELECT id
      FROM threads
      WHERE archived = 0 AND updated_at >= ${start}
      ORDER BY updated_at DESC, id LIMIT ${limit + 1}`), 32 * 1024)
    if (!Array.isArray(value) || generation !== scopeGeneration || isCurrent?.() === false) return null
    return { ids: value.slice(0, limit).map(row => row.id).filter(id => NATIVE_THREAD_ID.test(id)), truncated: value.length > limit }
  }

  async function codexReadSpawnEdges(directory, pairs) {
    const candidates = Array.from(pairs || []).filter(([childId, parentId]) =>
      NATIVE_THREAD_ID.test(childId) && NATIVE_THREAD_ID.test(parentId)
      && codexGetThreadSourceIdentity(childId) === 'machine').slice(0, SPAWN_EDGE_MAX_PAIRS)
    if (!candidates.length) return { outcome: 'no-candidates', edges: [] }
    const { outcome, driver, value } = await readNativeState(directory, async query => {
      const edges = []
      for (let offset = 0; offset < candidates.length; offset += SPAWN_EDGE_BATCH_SIZE) {
        const batch = candidates.slice(offset, offset + SPAWN_EDGE_BATCH_SIZE)
        const values = batch.map(([childId, parentId]) => `('${childId}','${parentId}')`).join(',')
        const rows = await query(`SELECT edge.child_thread_id, edge.parent_thread_id, edge.status
          FROM (VALUES ${values}) AS wanted
          JOIN thread_spawn_edges AS edge ON edge.child_thread_id = wanted.column1 AND edge.parent_thread_id = wanted.column2`)
        const statusByEdge = new Map(rows.map((row) => [`${row.child_thread_id}:${row.parent_thread_id}`, row.status]))
        for (const [childId, parentId] of batch) {
          const status = statusByEdge.get(`${childId}:${parentId}`)
          edges.push({ childId, parentId, status: status === undefined ? 'absent'
            : status === 'closed' || status === 'open' ? status : 'unknown' })
        }
      }
      return edges
    }, 64 * 1024)
    return { outcome, driver, edges: value || [] }
  }

  return {
    revision: CODEX_SUBAGENT_DISCOVERY_REVISION,
    codexRolloutFilenameThreadId,
    codexRecentRolloutThreadCandidates,
    codexDiscoverSubagentThreadRows,
    codexResetSubagentDiscovery,
    codexObserveThreadRows,
    codexObserveThreadSourceKind,
    codexObserveThreadSourceIdentity,
    codexGetThreadSourceIdentity,
    codexRecoverThreadSourceIdentity,
    codexRetainThreadIds,
    codexIsInternalReviewThread,
    codexIsMachineRunThread,
    codexReadAttachedSides,
    codexCurrentAttachedSides,
    codexReadRecentInventoryTargets,
    codexReadSpawnEdges,
    isSubAgentThreadSource
  }
}

module.exports = {
  CODEX_SUBAGENT_DISCOVERY_REVISION,
  CODEX_SUBAGENT_DISCOVERY_MAX_AGE_MS,
  CODEX_SUBAGENT_DISCOVERY_LIMIT,
  CODEX_THREAD_SOURCE_IDENTITY_CACHE_LIMIT,
  isSubAgentThreadSource,
  isInternalReviewThreadSource,
  codexThreadSourceKind,
  createCodexSubagentDiscovery
}
