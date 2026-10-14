'use strict'

/**
 * Reconstructs the fork/parent topology of a Codex thread inventory from a
 * flat row list: which threads are direct forks of another (or subagent runs
 * whose `parentThreadId` names their root thread), which chain up to a root,
 * and which are isolated because the claimed parent is missing,
 * self-referential, in a different session, or forms a cycle.
 *
 * Pure graph reconstruction over its `rows` argument — no host contact.
 * The factory also deduplicates anonymous topology diagnostics within one session. `record`, `validThreadId` and `nativeString` are injected
 * rather than imported: `codexRecord`/`validCodexThreadId` are shared by
 * dozens of call sites elsewhere in the entry, so a load failure must not
 * reach them.
 */

const CODEX_INVENTORY_THREAD_TOPOLOGY_REVISION = 'codex-inventory-thread-topology-v1'

/** Pure anonymous diagnostic projection; the entry owns publication and deduplication. */
function codexSideTopologyDiagnosticRecords(sourceCount, relations, depths, orphanCount, recoveredLiveByParent = new Map(), threadKey) {
  const byParent = new Map()
  for (const [threadId, parentThreadId] of relations) {
    const current = byParent.get(parentThreadId) || { sideCount: 0, nestedSideCount: 0 }
    current.sideCount += 1
    if ((depths.get(threadId) || 0) > 1) current.nestedSideCount += 1
    const recoveredLiveCount = recoveredLiveByParent.get(parentThreadId) || 0
    if (recoveredLiveCount > 0) current.recoveredLiveCount = recoveredLiveCount
    byParent.set(parentThreadId, current)
  }
  const recoveredLiveTotal = [...recoveredLiveByParent.values()].reduce((sum, count) => sum + count, 0)
  const aggregateDetails = {
    rootCount: Math.max(0, sourceCount - relations.size),
    sideCount: relations.size,
    orphanCount: Math.max(0, orphanCount),
    nestedSideCount: [...depths.entries()].filter(([threadId, depth]) => relations.has(threadId) && depth > 1).length,
    mergedParentCount: byParent.size,
    ...(recoveredLiveTotal > 0 ? { recoveredLiveCount: recoveredLiveTotal } : {})
  }
  const base = { level: 'info', scope: 'task-topology', event: 'side-topology-decision', provider: 'codex' }
  return [{ key: 'aggregate', signature: JSON.stringify(aggregateDetails), event: {
    ...base, outcome: relations.size ? 'merged' : orphanCount ? 'standalone' : 'root-only', details: aggregateDetails
  } }, ...[...byParent].map(([parentThreadId, details]) => ({
    key: `parent:${threadKey(parentThreadId)}`, signature: JSON.stringify(details), event: {
      ...base, outcome: 'merged-parent', taskRef: threadKey(parentThreadId),
      details: { rootCount: 1, orphanCount: 0, ...details }
    }
  }))]
}

function createCodexInventoryThreadTopology(dependencies = {}) {
  const record = dependencies.record
  const validThreadId = dependencies.validThreadId
  const nativeString = dependencies.nativeString
  if (typeof record !== 'function' || typeof validThreadId !== 'function' || typeof nativeString !== 'function') {
    throw new TypeError('codex inventory thread topology requires record, validThreadId and nativeString')
  }

  const diagnosticFingerprints = new Map()
  function codexRecordSideTopologyDecision(sourceCount, relations, depths, orphanCount, recoveredLiveByParent = new Map()) {
    if (typeof dependencies.threadKey !== 'function' || typeof dependencies.recordDiagnostic !== 'function') return
    const records = codexSideTopologyDiagnosticRecords(sourceCount, relations, depths, orphanCount, recoveredLiveByParent, dependencies.threadKey)
    for (const { key, signature, event } of records) {
      if (diagnosticFingerprints.get(key) !== signature) dependencies.recordDiagnostic(event)
    }
    diagnosticFingerprints.clear()
    for (const { key, signature } of records) diagnosticFingerprints.set(key, signature)
  }
  function codexResetSideTopologyDiagnostics() { diagnosticFingerprints.clear() }

  function codexInventoryThreadTopology(rows) {
    const rowById = new Map()
    for (const value of Array.isArray(rows) ? rows : []) {
      const row = record(value)
      if (validThreadId(row.id)) rowById.set(row.id, row)
    }
    const directParents = new Map()
    const isolated = new Set()
    for (const [threadId, row] of rowById) {
      const forkedFromId = validThreadId(row.forkedFromId) ? row.forkedFromId : ''
      if (row.forkedFromId) {
        const parent = forkedFromId ? rowById.get(forkedFromId) : null
        const sessionId = nativeString(row.sessionId)
        const parentSessionId = nativeString(parent?.sessionId)
        if (!forkedFromId
          || forkedFromId === threadId
          || !parent
          || !sessionId
          || !parentSessionId
          || sessionId !== parentSessionId) {
          isolated.add(threadId)
          continue
        }
        directParents.set(threadId, forkedFromId)
        continue
      }
      // Subagent runs carry no fork pointer; their parent claim is the
      // thread object's own `parentThreadId` (verified over `thread/read`:
      // at the RPC boundary a subagent's sessionId is its own id, so the
      // session field is deliberately not consulted here). Resolvable in
      // this inventory the claim links; unresolvable it is the same orphan
      // a missing fork parent already is. Rows without the field make no
      // claim and stay put.
      const parentThreadId = nativeString(row.parentThreadId)
      if (!validThreadId(parentThreadId) || parentThreadId === threadId) continue
      if (!rowById.has(parentThreadId)) {
        isolated.add(threadId)
        continue
      }
      directParents.set(threadId, parentThreadId)
    }
    const relations = new Map()
    const depths = new Map()
    for (const threadId of directParents.keys()) {
      const seen = new Set([threadId])
      let current = threadId
      let depth = 0
      let invalid = false
      while (directParents.has(current)) {
        const parentThreadId = directParents.get(current)
        depth += 1
        if (!validThreadId(parentThreadId) || seen.has(parentThreadId)) {
          invalid = true
          break
        }
        seen.add(parentThreadId)
        current = parentThreadId
      }
      if (invalid || current === threadId || !rowById.has(current)) {
        isolated.add(threadId)
        continue
      }
      relations.set(threadId, current)
      depths.set(threadId, depth)
    }
    return { rowById, relations, depths, isolated }
  }

  return {
    revision: CODEX_INVENTORY_THREAD_TOPOLOGY_REVISION,
    codexInventoryThreadTopology,
    codexRecordSideTopologyDecision,
    codexResetSideTopologyDiagnostics,
    codexSideTopologyDiagnosticRecords
  }
}

module.exports = {
  CODEX_INVENTORY_THREAD_TOPOLOGY_REVISION,
  createCodexInventoryThreadTopology,
  codexSideTopologyDiagnosticRecords
}
