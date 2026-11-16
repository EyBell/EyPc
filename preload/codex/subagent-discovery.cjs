'use strict'

/**
 * Discovers Codex subagent threads from recent session rollout files.
 *
 * `thread/list` omits subagent runs entirely (verified against app-server
 * 0.150.1: a live subagent writing its rollout is absent from every page), so
 * a subagent working for a listed thread is invisible to the inventory scan —
 * the parent then presents its own last terminal state while Codex natively
 * shows the group running. The rollout files are the one discovery surface
 * that always exists locally: candidates come from walking only the newest
 * session day directories and taking each file's thread id from its basename.
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

const CODEX_SUBAGENT_DISCOVERY_REVISION = 'codex-subagent-discovery-v2'
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
  if (['cli', 'exec', 'vscode', 'appServer'].includes(value)) return 'human'
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

  function codexRecentRolloutThreadCandidates(input = {}) {
    const root = typeof input.root === 'string' ? input.root : ''
    const knownIds = input.knownIds instanceof Set ? input.knownIds : new Set()
    const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now()
    const maxAgeMs = Number.isFinite(input.maxAgeMs) && input.maxAgeMs > 0
      ? input.maxAgeMs
      : CODEX_SUBAGENT_DISCOVERY_MAX_AGE_MS
    const limit = Number.isInteger(input.limit) && input.limit > 0
      ? input.limit
      : CODEX_SUBAGENT_DISCOVERY_LIMIT
    if (!root) return []
    // The age window can span at most one more local calendar day than it has whole days.
    const dayCount = Math.min(31, Math.ceil(maxAgeMs / (24 * 60 * 60 * 1000)) + 1)
    const newestByThreadId = new Map()
    for (const dayDirectory of recentDayDirectories(root, dayCount)) {
      for (const name of listDirectory(dayDirectory)) {
        const match = ROLLOUT_BASENAME_PATTERN.exec(name)
        const threadId = match ? match[1].toLowerCase() : ''
        if (!threadId || !validThreadId(threadId) || knownIds.has(threadId)) continue
        let mtimeMs = 0
        try { mtimeMs = fs.statSync(path.join(dayDirectory, name)).mtimeMs } catch { continue }
        if (!(mtimeMs > 0) || nowMs - mtimeMs > maxAgeMs) continue
        const previous = newestByThreadId.get(threadId)
        if (!previous || mtimeMs > previous.mtimeMs) newestByThreadId.set(threadId, { threadId, mtimeMs })
      }
    }
    return [...newestByThreadId.values()]
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(0, limit)
  }

  /**
   * Verified subagent rows for one scan: candidates from the rollout walk,
   * membership from the injected `thread/read`'s `parentThreadId`, freshness
   * from the mtime-keyed cache. Returns rows shaped exactly like the
   * `thread/list` rows the caller already holds.
   */
  async function codexDiscoverSubagentThreadRows(input = {}) {
    const rows = Array.isArray(input.rows) ? input.rows : []
    codexObserveThreadRows(rows)
    if (!readThread) return []
    const generation = scopeGeneration
    const knownIds = new Set(rows.map((row) => record(row).id).filter((id) => validThreadId(id)))
    const candidates = codexRecentRolloutThreadCandidates({
      root: input.root,
      knownIds,
      nowMs: input.nowMs
    })
    const discovered = []
    const pending = new Map()
    const seenThisScan = new Set()
    let readCount = 0
    for (const candidate of candidates) {
      seenThisScan.add(candidate.threadId)
      const cached = verifiedRows.get(candidate.threadId)
      if (cached && cached.mtimeMs === candidate.mtimeMs) {
        if (cached.row) pending.set(candidate.threadId, cached.row)
        continue
      }
      try {
        readCount += 1
        const thread = record(record(await readThread(candidate.threadId)).thread)
        if (generation !== scopeGeneration) return []
        if (thread.id === candidate.threadId) codexObserveThreadRows([thread])
        const parentThreadId = typeof thread.parentThreadId === 'string' ? thread.parentThreadId : ''
        const validParent = thread.id === candidate.threadId
          && validThreadId(parentThreadId)
          && parentThreadId !== thread.id
        verifiedRows.set(candidate.threadId, {
          mtimeMs: candidate.mtimeMs, row: validParent ? thread : null
        })
        if (validParent) pending.set(candidate.threadId, thread)
      } catch {
        if (generation !== scopeGeneration) return []
      }
    }
    // Rollouts are newest-first: a grandchild commonly precedes its parent.
    // Resolve the bounded verified set to a fixed point without more RPCs.
    // Unknown parents remain cached metadata, so later root admission can
    // reconnect them; rootless cycles and unrelated families never advance.
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
        details: { candidateCount: candidates.length, readCount }
      })
    }
    return discovered
  }

  function codexResetSubagentDiscovery(options = {}) {
    scopeGeneration += 1
    verifiedRows = new Map()
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

  return {
    revision: CODEX_SUBAGENT_DISCOVERY_REVISION,
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
