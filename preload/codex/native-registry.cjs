'use strict'

/**
 * Validates the Codex desktop app's global-state registry and projects it into
 * the shape EyPc reads.
 *
 * This is a strict parser, not a lenient reader. The file belongs to another
 * application and EyPc both reads and rewrites it, so a shape this module does
 * not fully understand must be refused rather than partially accepted — a
 * partial read would be written back as a complete one, silently dropping
 * whatever it failed to model. Every malformed case therefore throws
 * `protocol-error`; there is no "best effort" path.
 *
 * The refusals are the substance: wrong container types, an id disagreeing with
 * its storage key, an empty or oversized root list, a root that does not
 * normalize, two projects resolving to the same key, a thread id that is not
 * one, and count caps on projects and assignments. Standing alone, each can be
 * exercised with a hostile document directly, which under the entry required
 * the whole preload sandbox.
 *
 * Pure: text in, structure out. The filesystem reads and the size cap stay with
 * the caller, so this module never decides *whether* to read — only whether
 * what was read is admissible.
 */

const CODEX_NATIVE_REGISTRY_REVISION = 'codex-native-registry-v1'
/** Caps on how much of another app's document we are willing to model. */
const CODEX_NATIVE_MAX_PROJECTS = 10_000
const CODEX_NATIVE_MAX_ASSIGNMENTS = 100_000
const CODEX_NATIVE_MAX_ROOTS_PER_PROJECT = 32
const CODEX_NATIVE_MAX_PROJECT_NAME = 160

function createCodexNativeRegistry(dependencies = {}) {
  const crypto = dependencies.crypto || require('node:crypto')
  const codexError = dependencies.codexError
  const codexRecord = dependencies.codexRecord
  const codexNativeString = dependencies.codexNativeString
  const validCodexThreadId = dependencies.validCodexThreadId
  const codexNormalizeNativeRoot = dependencies.codexNormalizeNativeRoot
  for (const [name, value] of Object.entries({ codexError, codexRecord, codexNativeString, validCodexThreadId, codexNormalizeNativeRoot })) {
    if (typeof value !== 'function') throw new TypeError(`codex native registry requires ${name}`)
  }

  const invalid = () => codexError('protocol-error', 'Codex native project state is invalid')

  function codexNativeStringList(value, maximum = CODEX_NATIVE_MAX_ASSIGNMENTS) {
    if (!Array.isArray(value) || value.length > maximum) throw invalid()
    const result = []
    for (const item of value) {
      const normalized = codexNativeString(item)
      if (!normalized) throw invalid()
      if (!result.includes(normalized)) result.push(normalized)
    }
    return result
  }

  /**
   * A project's identity is its root set, not its id: the desktop app may
   * reissue ids, but two projects over the same roots are the same project and
   * must not both exist.
   */
  function codexProjectKey(roots) {
    return crypto.createHash('sha256').update(`codex-project\0${[...roots].sort().join('\0')}`).digest('hex').slice(0, 32)
  }

  /** Key-sorted deep copy so the fingerprint tracks content, not key order. */
  function codexStableNativeProjection(value) {
    if (Array.isArray(value)) return value.map(codexStableNativeProjection)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, codexStableNativeProjection(value[key])]))
  }

  function parseCodexNativeRegistryText(text) {
    let parsed
    try { parsed = JSON.parse(text) } catch { throw invalid() }
    const source = codexRecord(parsed)
    const localProjectsSource = source['local-projects']
    const assignmentsSource = source['thread-project-assignments']
    if (!localProjectsSource || typeof localProjectsSource !== 'object' || Array.isArray(localProjectsSource)) throw invalid()
    if (!assignmentsSource || typeof assignmentsSource !== 'object' || Array.isArray(assignmentsSource)) throw invalid()
    const projectOrder = codexNativeStringList(source['project-order'])
    const pinnedProjectIds = codexNativeStringList(source['pinned-project-ids'])
    const selectedProjectSource = source['selected-project']
    const selectedProjectRecord = codexRecord(selectedProjectSource)
    const selectedProjectId = typeof selectedProjectSource === 'string'
      ? codexNativeString(selectedProjectSource)
      : selectedProjectSource && typeof selectedProjectSource === 'object' && selectedProjectRecord.type === 'local'
        ? codexNativeString(selectedProjectRecord.projectId)
        : ''
    // Present but unreadable is an error; absent is simply "nothing selected".
    if (selectedProjectSource !== undefined && selectedProjectSource !== null && !selectedProjectId) throw codexError('protocol-error', 'Codex selected project state is invalid')
    const pinnedThreadIds = codexNativeStringList(source['pinned-thread-ids']).filter(validCodexThreadId)
    const projectlessThreadIds = codexNativeStringList(source['projectless-thread-ids']).filter(validCodexThreadId)
    const projects = []
    const projectById = new Map()
    const projectKeySet = new Set()
    const localProjectEntries = Object.entries(localProjectsSource)
    if (localProjectEntries.length > CODEX_NATIVE_MAX_PROJECTS) throw invalid()
    for (let insertionOrder = 0; insertionOrder < localProjectEntries.length; insertionOrder += 1) {
      const [storageId, rawValue] = localProjectEntries[insertionOrder]
      const project = codexRecord(rawValue)
      const id = codexNativeString(project.id)
      const name = codexNativeString(project.name, CODEX_NATIVE_MAX_PROJECT_NAME)
      if (!id || id !== storageId || !name || !Array.isArray(project.rootPaths) || project.rootPaths.length < 1 || project.rootPaths.length > CODEX_NATIVE_MAX_ROOTS_PER_PROJECT) throw invalid()
      const roots = [...new Set(project.rootPaths.map(codexNormalizeNativeRoot))]
      if (roots.some((root) => !root) || roots.length < 1) throw invalid()
      const key = codexProjectKey(roots)
      if (projectKeySet.has(key)) throw codexError('protocol-error', 'Codex native project roots are ambiguous')
      projectKeySet.add(key)
      const normalized = { id, key, name, roots, insertionOrder }
      projects.push(normalized)
      projectById.set(id, normalized)
    }
    const assignments = new Map()
    const assignmentEntries = Object.entries(assignmentsSource)
    if (assignmentEntries.length > CODEX_NATIVE_MAX_ASSIGNMENTS) throw invalid()
    for (const [threadId, rawValue] of assignmentEntries) {
      if (!validCodexThreadId(threadId)) throw invalid()
      const assignment = codexRecord(rawValue)
      const projectId = codexNativeString(assignment.projectId)
      if (!projectId) throw invalid()
      assignments.set(threadId, projectId)
    }
    const nativeProjection = {
      projects: projects.map((project) => ({ id: project.id, name: project.name, roots: [...project.roots].sort() })),
      projectOrder,
      pinnedProjectIds,
      selectedProjectId,
      pinnedThreadIds,
      assignments: [...assignments.entries()].sort(([left], [right]) => left.localeCompare(right)),
      projectlessThreadIds: [...projectlessThreadIds].sort()
    }
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(codexStableNativeProjection(nativeProjection))).digest('hex')
    const orderById = new Map(projectOrder.map((id, index) => [id, index]))
    const pinnedOrderById = new Map(pinnedProjectIds.map((id, index) => [id, index]))
    for (const project of projects) {
      project.nativePinnedOrder = pinnedOrderById.get(project.id)
      // A project absent from the order list sorts after every listed one, in
      // the order the document itself stored it.
      project.nativeOrder = orderById.has(project.id) ? orderById.get(project.id) : projectOrder.length + project.insertionOrder
    }
    return {
      projects,
      projectById,
      assignments,
      projectlessThreadIds: new Set(projectlessThreadIds),
      pinnedThreadOrder: new Map(pinnedThreadIds.map((id, index) => [id, index])),
      selectedProjectId,
      fingerprint
    }
  }

  return {
    revision: CODEX_NATIVE_REGISTRY_REVISION,
    codexNativeStringList,
    codexProjectKey,
    codexStableNativeProjection,
    parseCodexNativeRegistryText
  }
}

module.exports = {
  CODEX_NATIVE_REGISTRY_REVISION,
  CODEX_NATIVE_MAX_PROJECTS,
  CODEX_NATIVE_MAX_ASSIGNMENTS,
  CODEX_NATIVE_MAX_ROOTS_PER_PROJECT,
  CODEX_NATIVE_MAX_PROJECT_NAME,
  createCodexNativeRegistry
}
