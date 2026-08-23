'use strict'

const { registry, PROVIDERS } = require('./provider-registry.cjs')

const COMPANION_TASK_TOPOLOGY_REVISION = 'companion-task-topology-v1'
const RELATION_TYPES = new Set(['fork', 'side-thread', 'subagent'])
const LIVE_PHASES = new Set(['waiting-approval', 'waiting-input', 'running', 'goal'])
const ATTENTION_PHASES = new Set(['waiting-approval', 'waiting-input'])
const TERMINAL_PHASES = new Set(['completed', 'stopped'])

function integer(value) {
  const result = Math.trunc(Number(value))
  return Number.isFinite(result) && result > 0 ? result : 0
}

function normalizeNode(value) {
  if (!value || typeof value !== 'object') return null
  const key = typeof value.key === 'string' ? value.key : ''
  const provider = PROVIDERS.includes(value.provider) ? value.provider : ''
  const family = typeof value.family === 'string' ? value.family.slice(0, 256) : ''
  if (!key || key.length > 256 || !provider || !family) return null
  return {
    ...value,
    key,
    provider,
    family,
    phase: typeof value.phase === 'string' ? value.phase : 'unknown',
    causalKey: typeof value.causalKey === 'string' ? value.causalKey.slice(0, 256) : '',
    unreadKnown: value.unreadKnown === true,
    unread: value.unreadKnown === true && value.unread === true,
    standaloneEligible: value.standaloneEligible !== false,
    error: value.error === true
  }
}

function normalizeRelation(value) {
  if (!value || typeof value !== 'object') return null
  const childKey = typeof value.childKey === 'string' ? value.childKey : ''
  const parentKey = typeof value.parentKey === 'string' ? value.parentKey : ''
  const provider = PROVIDERS.includes(value.provider) ? value.provider : ''
  const family = typeof value.family === 'string' ? value.family.slice(0, 256) : ''
  const relation = RELATION_TYPES.has(value.relation) ? value.relation : ''
  const authority = typeof value.authority === 'string' ? value.authority.slice(0, 80) : ''
  const generation = integer(value.generation)
  if (!childKey || !parentKey || !provider || !family || !relation || !authority || !generation) return null
  return {
    childKey,
    parentKey,
    provider,
    family,
    relation,
    authority,
    exact: value.exact === true,
    generation
  }
}

function cyclePathMembers(parentByChild) {
  const invalid = new Set()
  const valid = new Set()
  for (const start of parentByChild.keys()) {
    if (invalid.has(start) || valid.has(start)) continue
    const path = []
    const indexByKey = new Map()
    let cursor = start
    let entersInvalidPath = false
    while (cursor && parentByChild.has(cursor)) {
      if (invalid.has(cursor)) {
        entersInvalidPath = true
        break
      }
      if (valid.has(cursor)) break
      if (indexByKey.has(cursor)) {
        entersInvalidPath = true
        break
      }
      indexByKey.set(cursor, path.length)
      path.push(cursor)
      cursor = parentByChild.get(cursor) || ''
    }
    const destinationInvalid = invalid.has(cursor)
    if (entersInvalidPath || destinationInvalid) {
      // A descendant whose parent path enters a cyclic component is not a
      // valid standalone branch of that component. Isolate the complete path,
      // matching the existing Codex inventory fail-closed contract.
      for (const key of path) invalid.add(key)
      continue
    }
    for (const key of path) valid.add(key)
  }
  return invalid
}

function rootFor(key, parentByChild) {
  let cursor = key
  const visited = new Set()
  while (parentByChild.has(cursor) && !visited.has(cursor)) {
    visited.add(cursor)
    cursor = parentByChild.get(cursor)
  }
  return cursor
}

function aggregatePhase(members) {
  if (members.some((node) => node.phase === 'waiting-approval')) return 'waiting-approval'
  if (members.some((node) => node.phase === 'waiting-input')) return 'waiting-input'
  if (members.some((node) => node.phase === 'running' || node.phase === 'goal')) return 'running'
  if (members.length && members.every((node) => node.phase === 'completed')) return 'completed'
  if (members.some((node) => node.phase === 'stopped')
    && members.every((node) => TERMINAL_PHASES.has(node.phase))) return 'stopped'
  return 'unknown'
}

function aggregateUnread(members) {
  if (members.some((node) => node.unreadKnown && node.unread)) return { known: true, value: true }
  if (members.length && members.every((node) => node.unreadKnown && !node.unread)) return { known: true, value: false }
  return { known: false, value: false }
}

function aggregateRoot(root, members) {
  const phase = aggregatePhase(members)
  const unread = aggregateUnread(members)
  const liveCount = members.filter((node) => LIVE_PHASES.has(node.phase)).length
  const attentionCount = members.filter((node) => ATTENTION_PHASES.has(node.phase)).length
  const errorCount = members.filter((node) => node.error === true).length
  const capabilities = root.capabilities && typeof root.capabilities === 'object'
    ? { ...root.capabilities }
    : {}
  if (liveCount > 0) capabilities.archive = false
  return {
    ...root,
    phase,
    unreadKnown: unread.known,
    unread: unread.value,
    revisionAt: Math.max(...members.map((node) => integer(node.revisionAt)), integer(root.revisionAt)),
    observationGeneration: Math.max(...members.map((node) => integer(node.observationGeneration)), integer(root.observationGeneration)),
    statusEnteredAt: Math.max(...members.filter((node) => node.phase === phase).map((node) => integer(node.statusEnteredAt)), 0),
    turnStartedAt: Math.max(...members.map((node) => integer(node.turnStartedAt)), 0),
    terminalAt: LIVE_PHASES.has(phase) ? 0 : Math.max(...members.map((node) => integer(node.terminalAt)), 0),
    capabilities,
    topology: {
      mode: members.length > 1 ? 'aggregate' : 'independent',
      memberCount: members.length,
      liveCount,
      attentionCount,
      errorCount
    }
  }
}

function buildCompanionTaskTopology(input = {}) {
  const nodes = new Map()
  for (const value of Array.isArray(input.nodes) ? input.nodes : []) {
    const node = normalizeNode(value)
    if (node && !nodes.has(node.key)) nodes.set(node.key, node)
  }
  const generationFloor = input.generationFloor && typeof input.generationFloor === 'object'
    ? input.generationFloor
    : {}
  const candidates = []
  const rejected = []
  for (const value of Array.isArray(input.relations) ? input.relations : []) {
    const relation = normalizeRelation(value)
    if (!relation) {
      rejected.push({ reason: 'invalid-shape' })
      continue
    }
    const child = nodes.get(relation.childKey)
    const parent = nodes.get(relation.parentKey)
    const floor = integer(generationFloor[relation.provider])
    let reason = ''
    if (!relation.exact) reason = 'inexact'
    else if (relation.generation < floor) reason = 'old-generation'
    else if (!child || !parent) reason = 'missing-node'
    else if (relation.childKey === relation.parentKey) reason = 'self'
    else if (child.provider !== relation.provider || parent.provider !== relation.provider) reason = 'cross-provider'
    else if (child.family !== relation.family || parent.family !== relation.family) reason = 'cross-family'
    if (reason) {
      rejected.push({ relation, reason })
      continue
    }
    candidates.push(relation)
  }
  candidates.sort((left, right) => right.generation - left.generation
    || left.childKey.localeCompare(right.childKey)
    || left.parentKey.localeCompare(right.parentKey))
  const parentByChild = new Map()
  const selectedByChild = new Map()
  const conflictedChildren = new Set()
  const candidatesByChild = new Map()
  for (const relation of candidates) {
    const group = candidatesByChild.get(relation.childKey) || []
    group.push(relation)
    candidatesByChild.set(relation.childKey, group)
  }
  for (const [childKey, relations] of candidatesByChild) {
    const highestGeneration = Math.max(...relations.map((relation) => relation.generation))
    const newest = relations.filter((relation) => relation.generation === highestGeneration)
    const parents = new Set(newest.map((relation) => relation.parentKey))
    if (parents.size !== 1) {
      conflictedChildren.add(childKey)
      for (const relation of relations) rejected.push({ relation, reason: 'ambiguous-parent' })
      continue
    }
    const selected = [...newest].sort((left, right) => left.parentKey.localeCompare(right.parentKey)
      || left.relation.localeCompare(right.relation)
      || left.authority.localeCompare(right.authority))[0]
    selectedByChild.set(childKey, selected)
    parentByChild.set(childKey, selected.parentKey)
    for (const relation of relations) {
      if (relation !== selected) rejected.push({ relation, reason: 'superseded-relation' })
    }
  }
  const cyclePaths = cyclePathMembers(parentByChild)
  if (cyclePaths.size) {
    for (const childKey of cyclePaths) {
      const parentKey = parentByChild.get(childKey)
      const relation = selectedByChild.get(childKey)
      parentByChild.delete(childKey)
      rejected.push({ relation: relation || { childKey, parentKey }, reason: 'cycle-path' })
    }
  }
  const acceptedRelations = [...selectedByChild.values()]
    .filter((relation) => relation && parentByChild.get(relation.childKey) === relation.parentKey)
  const membersByRoot = new Map()
  const rejectedChildKeys = new Set(rejected
    .map((entry) => entry.relation?.childKey)
    .filter((key) => typeof key === 'string' && key))
  const quarantinedKeys = []
  for (const node of nodes.values()) {
    const hasRejectedParent = rejectedChildKeys.has(node.key) || conflictedChildren.has(node.key)
    if (!parentByChild.has(node.key) && hasRejectedParent && node.standaloneEligible === false) {
      quarantinedKeys.push(node.key)
      continue
    }
    const rootKey = rootFor(node.key, parentByChild)
    const members = membersByRoot.get(rootKey) || []
    members.push(node)
    membersByRoot.set(rootKey, members)
  }
  const roots = []
  const rootByKey = {}
  for (const [rootKey, members] of membersByRoot) {
    const root = nodes.get(rootKey)
    if (!root) continue
    members.sort((left, right) => left.key.localeCompare(right.key))
    roots.push(aggregateRoot(root, members))
    for (const member of members) rootByKey[member.key] = rootKey
  }
  roots.sort((left, right) => (Number(right.lastQuestionAt) || 0) - (Number(left.lastQuestionAt) || 0)
    || (Number(right.createdAt) || 0) - (Number(left.createdAt) || 0)
    || left.key.localeCompare(right.key))
  const providerGenerations = Object.fromEntries(PROVIDERS.map((provider) => [provider, Math.max(
    integer(generationFloor[provider]),
    ...acceptedRelations.filter((relation) => relation.provider === provider).map((relation) => relation.generation),
    0
  )]))
  const fingerprint = JSON.stringify({
    roots: roots.map((root) => root.key).sort(),
    relations: acceptedRelations.map((relation) => [
      relation.childKey,
      relation.parentKey,
      relation.relation
    ]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  })
  return {
    revision: COMPANION_TASK_TOPOLOGY_REVISION,
    registryRevision: registry.revision,
    roots,
    rootByKey,
    acceptedRelations,
    rejected,
    quarantinedKeys,
    providerGenerations,
    fingerprint
  }
}

module.exports = {
  COMPANION_TASK_TOPOLOGY_REVISION,
  LIVE_PHASES,
  ATTENTION_PHASES,
  buildCompanionTaskTopology,
  normalizeNode,
  normalizeRelation
}
