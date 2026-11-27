'use strict'

const { resolveSqliteBin, querySqliteCli } = require('../sqlite-readonly.cjs')
const SPAWN_EDGE_BATCH_SIZE = 128
const SPAWN_EDGE_MAX_PAIRS = 512
const INVENTORY_INDEX_LIMIT = 8192
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

function codexInventorySideCoverage(index, rootIds, resolved, retained, now = Date.now()) {
  if (!index?.complete) return null
  const missing = new Map()
  for (const [id, row] of index.rows) {
    if (row.archived || row.kind === 'guardian_review') continue
    const parent = row.attachedParent || row.spawnParent
    const recent = Math.max(row.updatedMs || row.updatedSecond * 1_000, row.recency || 0)
      >= now - CODEX_SUBAGENT_DISCOVERY_MAX_AGE_MS
    if (!parent || !row.attachedParent && row.spawnStatus === 'closed' && !recent && !retained.has(id)) continue
    const seen = new Set([id])
    let root = parent
    while (root && !rootIds.has(root) && !seen.has(root)) {
      seen.add(root)
      const ancestor = index.rows.get(root)
      root = !ancestor?.archived && (ancestor?.attachedParent || ancestor?.spawnParent || retained.get(root))
    }
    if (rootIds.has(root) && resolved.get(id) !== root) missing.set(id, root)
  }
  return missing
}

function spawnEdgePairs(values) {
  const pairs = new Map()
  for (const pair of values || []) {
    if (!Array.isArray(pair) || pair.length !== 2) continue
    const [childId, parentId] = pair
    if (typeof childId === 'string' && typeof parentId === 'string' && childId !== parentId
      && NATIVE_THREAD_ID.test(childId) && NATIVE_THREAD_ID.test(parentId)) {
      pairs.set(`${childId}\0${parentId}`, [childId, parentId])
    }
  }
  return pairs
}

function backgroundSpawnPage(database, eligible, requested) {
  const coverage = database.backgroundCoverage
  for (const key of coverage.keys()) {
    if (!eligible.has(key)) coverage.delete(key)
  }
  for (const key of eligible) {
    if (!coverage.has(key)) coverage.set(key, false)
  }
  const selected = []
  let remaining = 0
  for (const [key, covered] of coverage) {
    if (covered) continue
    remaining += 1
    if (selected.length < SPAWN_EDGE_MAX_PAIRS && !database.pending.get(requested.get(key)[0])?.targeted) {
      selected.push(key)
    }
  }
  if (!remaining) coverage.clear()
  return { selected, remaining }
}

async function readSpawnEdgeBatch(query, pairs, requireCoverage) {
  const values = pairs.map(([childId, parentId]) => `('${childId}','${parentId}')`).join(',')
  const rows = await query(`WITH wanted(child_id, parent_id) AS (VALUES ${values})
    SELECT wanted.child_id AS child_thread_id, wanted.parent_id AS parent_thread_id, edge.status,
      CASE WHEN child.id IS NULL THEN 'child-missing'
        WHEN child.archived = 1 THEN 'child-archived'
        WHEN child.thread_source IN ('guardian_review', 'user', 'cli', 'exec', 'vscode', 'appServer') THEN 'source-changed'
        WHEN child.thread_source IS NOT 'subagent' THEN 'unverified'
        WHEN parent.id IS NULL THEN 'parent-missing'
        WHEN parent.archived = 1 THEN 'parent-archived'
        WHEN parent.thread_source = 'guardian_review' THEN 'parent-excluded'
        WHEN child.archived IS NOT 0 OR parent.archived IS NOT 0 THEN 'unverified'
        WHEN EXISTS (SELECT 1 FROM thread_spawn_edges AS other WHERE other.child_thread_id = wanted.child_id
          AND other.parent_thread_id <> wanted.parent_id)
          THEN CASE WHEN edge.child_thread_id IS NULL THEN 'parent-changed' ELSE 'conflicting-parents' END
        WHEN edge.child_thread_id IS NULL THEN 'edge-missing' END AS reason
    FROM wanted LEFT JOIN threads AS child ON child.id = wanted.child_id
    LEFT JOIN threads AS parent ON parent.id = wanted.parent_id
    LEFT JOIN thread_spawn_edges AS edge ON edge.child_thread_id = wanted.child_id AND edge.parent_thread_id = wanted.parent_id`)
  const byPair = new Map(rows.map(row => [`${row.child_thread_id}\0${row.parent_thread_id}`, row]))
  if (requireCoverage && (rows.length !== pairs.length || pairs.some(([childId, parentId]) => !byPair.has(`${childId}\0${parentId}`)))) {
    throw new Error('incomplete spawn edge query')
  }
  return pairs.map(([childId, parentId]) => {
    const row = byPair.get(`${childId}\0${parentId}`)
    const reason = row ? row.reason : 'edge-missing'
    let status = 'unknown'
    if (reason && reason !== 'unverified' && reason !== 'conflicting-parents') status = 'absent'
    else if (!reason && (row.status === 'open' || row.status === 'closed')) status = row.status
    return { childId, parentId, status, ...(reason ? { reason } : {}) }
  })
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
  let spawnEdgeDatabase = null
  let spawnEdgeDatabaseGeneration = 0
  let spawnEdgeReadGeneration = 0

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
    if (spawnEdgeDatabase && ['human', 'guardian_review'].includes(identity)) {
      spawnEdgeDatabase.evidence.delete(id)
      spawnEdgeDatabase.pending.delete(id)
    }
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

  function codexInventoryDirectories(roots, indexedRows) {
    if (!roots?.length) return null
    try {
      const stamps = []
      const rolloutPaths = indexedRows ? new Map() : null
      const rolloutIds = indexedRows ? new Set() : null
      if (rolloutPaths && roots.length !== 2) return null
      const pending = roots.map((root, index) => ({ directory: root, depth: index === 0 ? 3 : 0, archived: index }))
      for (const { directory, depth, archived } of pending) {
        const stat = fs.lstatSync(directory)
        if (!stat.isDirectory() || stamps.length >= 1_024) return null
        stamps.push([directory, stat.dev, stat.ino, stat.mtimeMs])
        if (depth === 0 && !rolloutPaths) continue
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            if (depth > 0) pending.push({ directory: path.join(directory, entry.name), depth: depth - 1, archived })
            else if (rolloutPaths) return null
            continue
          }
          if (!rolloutPaths) continue
          if (entry.isSymbolicLink()) return null
          if (!entry.name.startsWith('rollout-')) continue
          const name = entry.name.replace(/\.zst$/, '')
          const threadId = codexRolloutFilenameThreadId(name)
          if (!entry.isFile() || !threadId || indexedRows.get(threadId)?.archived !== archived
            || rolloutPaths.size >= INVENTORY_INDEX_LIMIT) return null
          rolloutPaths.set(path.join(directory, name), threadId)
          rolloutIds.add(threadId)
        }
      }
      for (const threadId of rolloutIds || []) {
        const rolloutPath = indexedRows.get(threadId).rolloutPath
        if (typeof rolloutPath !== 'string' || rolloutPaths.get(rolloutPath.replace(/\.zst$/, '')) !== threadId) return null
      }
      return { stamps: stamps.sort((left, right) => left[0].localeCompare(right[0])), rolloutPaths }
    } catch {
      return null
    }
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
    const heldIds = new Set(nativeThreadIds(input.knownSideIds || []).filter(id =>
      !archived.has(id) && !knownIds.has(id) && codexGetThreadSourceIdentity(id) !== 'guardian_review'))
    for (const [threadId, entry] of verifiedRows) {
      if (!entry?.nativeParent || entry.detached || !entry.row || archived.has(threadId) || knownIds.has(threadId)) continue
      if (codexThreadSourceKind(entry.row.threadSource) !== 'machine' || !NATIVE_THREAD_ID.test(threadId)) continue
      heldIds.add(threadId)
    }
    let native = { outcome: 'skipped' }
    if (input.directory && knownIds.size && (recent.length || heldIds.size)) {
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
            candidates.push({ threadId, mtimeMs: entry?.mtimeMs || 0 })
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
    spawnEdgeDatabase = null
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

  function nativeStateFile(directory) {
    const name = fs.readdirSync(directory)
      .filter((entry) => /^state_[1-9]\d*\.sqlite$/.test(entry))
      .sort((left, right) => Number.parseInt(right.slice(6), 10) - Number.parseInt(left.slice(6), 10))[0]
    return name ? path.join(directory, name) : ''
  }

  async function readNativeState(directory, operation, maxBuffer) {
    let database
    let driver = ''
    try {
      const databaseFile = nativeStateFile(directory)
      if (!databaseFile) return { outcome: 'database-missing', value: null }
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
      return { outcome: 'read', driver, value: await operation(query, databaseFile) }
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

  async function codexReadInventoryIndex(directory, isCurrent, { rosterWitness = false } = {}) {
    const generation = scopeGeneration
    const { value } = await readNativeState(directory, async (query, file) => {
      const before = fs.statSync(file)
      const rows = await query(`SELECT t.id, t.archived, t.thread_source AS kind, t.model_provider AS provider,
        t.project_id AS project, t.preview <> '' AS visible, t.updated_at AS updatedSecond,
        t.updated_at_ms AS updatedMs, t.recency_at_ms AS recency,
        ${rosterWitness ? 't.rollout_path AS rolloutPath,' : ''}
        t.attached_thread_parent_id AS attachedParent, e.parent_thread_id AS spawnParent, e.status AS spawnStatus,
        r.revision AS readRevision, r.first_unread_turn IS NOT NULL AS unread, t.is_pinned AS pinned
        FROM threads AS t LEFT JOIN thread_spawn_edges AS e ON e.child_thread_id = t.id
        LEFT JOIN thread_read_receipts AS r ON r.thread_id = t.id
        ${rosterWitness ? "WHERE EXISTS (SELECT 1 FROM backfill_state WHERE id = 1 AND status = 'complete')" : ''}
        ORDER BY t.id LIMIT ${INVENTORY_INDEX_LIMIT + 1}`)
      const after = fs.statSync(file)
      if (before.dev !== after.dev || before.ino !== after.ino) return null
      return { identity: `${file}\0${after.dev}\0${after.ino}`, rows }
    }, 4 * 1024 * 1024)
    if (!value || generation !== scopeGeneration || isCurrent?.() === false) return null
    const rows = new Map()
    for (const row of value.rows.slice(0, INVENTORY_INDEX_LIMIT)) {
      if (!NATIVE_THREAD_ID.test(row.id) || ![0, 1].includes(row.archived) || rows.has(row.id)) return null
      rows.set(row.id, row)
    }
    return { identity: value.identity, rows, complete: value.rows.length <= INVENTORY_INDEX_LIMIT }
  }

  function spawnDatabaseIdentity(file) {
    if (typeof fs.statSync !== 'function') return null
    const { dev, ino } = fs.statSync(file, { bigint: true })
    if ((typeof dev !== 'bigint' && !Number.isSafeInteger(dev)) || (typeof ino !== 'bigint' && !Number.isSafeInteger(ino)) || ino <= 0) return null
    return `${dev}:${ino}`
  }

  async function codexReadSpawnEdges(directory, pairs, options) {
    const readGeneration = ++spawnEdgeReadGeneration
    const scope = scopeGeneration
    const current = () => scope === scopeGeneration && options?.isCurrent?.() !== false
    const roster = spawnEdgePairs(pairs)
    const targeted = options?.targeted === true || options?.priorityPairs !== undefined
    const requested = options?.priorityPairs !== undefined ? spawnEdgePairs(options.priorityPairs) : roster
    const eligible = new Set([...requested.keys()].filter(key => roster.has(key)
      && codexGetThreadSourceIdentity(requested.get(key)[0]) === 'machine'))
    let database
    let selected = []
    let remaining = eligible.size
    let readSucceeded = false
    function receipt(outcome, driver, edges = [], allowRetained = false) {
      const result = { outcome, ...(driver ? { driver } : {}), edges }
      if (!options) return { ...result, edges: edges.map(({ childId, parentId, status }) => ({ childId, parentId, status })) }
      const retainedEdges = []
      if (allowRetained && database?.identity) {
        const fresh = new Set(edges.map(edge => `${edge.childId}\0${edge.parentId}`))
        for (const key of eligible) {
          const [childId, parentId] = requested.get(key)
          const prior = database.evidence.get(childId)
          if (!fresh.has(key) && prior?.parentId === parentId && prior.readGeneration < readGeneration
            && !database.pending.has(childId)
            && codexGetThreadSourceIdentity(childId) === 'machine') retainedEdges.push({ ...prior })
        }
      }
      return { ...result, readGeneration, databaseGeneration: database?.generation || 0, remaining, retainedEdges,
        coverage: { requestedCount: requested.size, coveredCount: edges.length,
          complete: requested.size > 0 && edges.length === requested.size } }
    }
    if (!current()) return receipt('superseded')
    if (!eligible.size) {
      if (!targeted && spawnEdgeDatabase?.directory === directory && !spawnEdgeDatabase.backgroundRead) {
        spawnEdgeDatabase.backgroundCoverage.clear()
      }
      return receipt('no-candidates')
    }
    try {
      const { outcome, driver, value } = await readNativeState(directory, async (query, file) => {
        const identity = spawnDatabaseIdentity(file)
        if (options && !identity) throw new Error('unverified spawn edge database')
        if (spawnEdgeDatabase?.file !== file || spawnEdgeDatabase.identity !== identity) {
          spawnEdgeDatabase = { file, identity, directory, generation: ++spawnEdgeDatabaseGeneration,
            backgroundRead: null, backgroundCoverage: new Map(), pending: new Map(), evidence: new Map() }
        }
        database = spawnEdgeDatabase
        if (targeted) {
          selected = [...eligible]
        } else {
          if (database.backgroundRead) return 'busy'
          const page = backgroundSpawnPage(database, eligible, requested)
          selected = page.selected
          remaining = page.remaining
          if (selected.length) database.backgroundRead = { readGeneration, keys: new Set(selected) }
        }
        if (!selected.length) return remaining ? 'busy' : 'no-candidates'
        for (const key of selected) database.pending.set(requested.get(key)[0], { readGeneration, targeted })
        const rows = []
        for (let offset = 0; offset < selected.length; offset += SPAWN_EDGE_BATCH_SIZE) {
          if (!current() || database !== spawnEdgeDatabase) return null
          const batch = selected.slice(offset, offset + SPAWN_EDGE_BATCH_SIZE).map(key => requested.get(key))
            .filter(([childId]) => database.pending.get(childId)?.readGeneration === readGeneration)
          if (batch.length) rows.push(...await readSpawnEdgeBatch(query, batch, Boolean(options)))
        }
        return rows
      }, 128 * 1024)
      if (!current() || (database && database !== spawnEdgeDatabase)) return receipt('superseded', driver)
      if (!database) {
        if (readGeneration === spawnEdgeReadGeneration && spawnEdgeDatabase?.directory === directory) spawnEdgeDatabase = null
        return receipt(outcome, driver)
      }
      let sameDatabase = false
      try { sameDatabase = nativeStateFile(directory) === database.file && spawnDatabaseIdentity(database.file) === database.identity } catch {}
      if (!sameDatabase) {
        spawnEdgeDatabase = null
        return receipt('superseded', driver)
      }
      if (outcome !== 'read') return receipt(outcome, driver)
      if (typeof value === 'string') return receipt(value, driver)
      if (!value) return receipt('superseded', driver)
      readSucceeded = true
      const edges = []
      for (const row of value) {
        if (database.pending.get(row.childId)?.readGeneration !== readGeneration || codexGetThreadSourceIdentity(row.childId) !== 'machine') continue
        const edge = { ...row, readGeneration }
        const prior = database.evidence.get(row.childId)
        if (prior?.parentId === row.parentId && (prior.status !== row.status || prior.reason !== row.reason)) {
          edge.previousStatus = prior.status
        }
        database.evidence.delete(row.childId)
        if (database.identity && row.status !== 'unknown') database.evidence.set(row.childId, { ...edge })
        const key = `${row.childId}\0${row.parentId}`
        if (database.backgroundRead?.keys.delete(key)) database.backgroundCoverage.set(key, true)
        edges.push(edge)
      }
      const advanced = targeted ? edges.length : selected.length - database.backgroundRead.keys.size
      remaining -= advanced
      if (!targeted && !remaining) database.backgroundCoverage.clear()
      while (database.evidence.size > INVENTORY_INDEX_LIMIT) database.evidence.delete(database.evidence.keys().next().value)
      return receipt(advanced ? 'read' : 'superseded', driver, edges, !targeted && edges.length > 0)
    } finally {
      if (database?.backgroundRead?.readGeneration === readGeneration) database.backgroundRead = null
      for (const key of selected) {
        const [childId] = requested.get(key)
        if (database.pending.get(childId)?.readGeneration !== readGeneration) continue
        if (!readSucceeded) database.evidence.delete(childId)
        database.pending.delete(childId)
      }
    }
  }

  return {
    revision: CODEX_SUBAGENT_DISCOVERY_REVISION,
    codexRolloutFilenameThreadId,
    codexRecentRolloutThreadCandidates,
    codexInventoryDirectories,
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
    codexReadInventoryIndex,
    codexInventorySideCoverage,
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
