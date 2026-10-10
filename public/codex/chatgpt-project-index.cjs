'use strict'

/**
 * Read-only ChatGPT Projects affiliation.
 *
 * Workspace ownership stays in `local-projects` / `thread-project-assignments`.
 * Projects are a different map: sidebar `g-p-` rows in the desktop atom, plus
 * `local_thread_catalog` rows whose host is `chatgpt` and whose `project_id`
 * is one of those rows. This module never writes global state. A missing
 * catalog or a turn the app-server cannot answer becomes an empty admission,
 * not a failed inventory scan.
 *
 * The native registry parser stays strict because it is written back. These
 * projects have no local roots, so they must not enter that document.
 */

const CHATGPT_PROJECT_INDEX_REVISION = 'chatgpt-project-index-v1'
const CHATGPT_PROJECT_INDEX_MAX_AGE_MS = 48 * 60 * 60 * 1000
const CHATGPT_PROJECT_INDEX_LIMIT = 8
const CHATGPT_PROJECT_ID = /^g-p-[A-Za-z0-9-]{8,120}$/
const CHATGPT_PROJECT_NAME_MAX = 160

function createChatgptProjectIndex(dependencies = {}) {
  const crypto = dependencies.crypto
  const fs = dependencies.fs
  const path = dependencies.path
  const os = dependencies.os
  const process = dependencies.process
  const validThreadId = dependencies.validThreadId
  const readTurns = typeof dependencies.readTurns === 'function' ? dependencies.readTurns : null
  const recordDiagnostic = typeof dependencies.record === 'function' ? dependencies.record : () => {}
  const queryCatalog = typeof dependencies.queryCatalog === 'function' ? dependencies.queryCatalog : null
  const readStateText = typeof dependencies.readStateText === 'function' ? dependencies.readStateText : null
  if (!crypto || typeof validThreadId !== 'function') {
    throw new TypeError('chatgpt project index requires crypto and validThreadId')
  }

  let lastProbeLine = ''

  function projectKey(projectId) {
    return crypto.createHash('sha256').update(`chatgpt-project\0${projectId}`).digest('hex').slice(0, 32)
  }

  function projectName(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= CHATGPT_PROJECT_NAME_MAX && !/[\u0000-\u001f]/.test(value)
      ? value
      : ''
  }

  function epochMs(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value > 10_000_000_000_000) return value / 1_000_000
      if (value > 10_000_000_000) return value
      if (value > 1_000_000_000) return value * 1000
    }
    if (typeof value === 'string' && value) {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return 0
  }

  function parseSidebarProjects(source) {
    const projects = []
    const seen = new Set()
    const visit = (value) => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) {
        for (const item of value) visit(item)
        return
      }
      const id = typeof value.id === 'string' ? value.id : ''
      if (CHATGPT_PROJECT_ID.test(id) && projectName(value.name) && !seen.has(id)) {
        seen.add(id)
        projects.push({
          id,
          key: projectKey(id),
          name: projectName(value.name),
          kind: 'chatgpt',
          updatedAt: epochMs(value.updatedAt)
        })
      }
      if (Array.isArray(value.projects)) visit(value.projects)
      for (const nested of Object.values(value)) {
        if (nested && typeof nested === 'object' && nested !== value.projects) visit(nested)
      }
    }
    visit(source)
    return projects
  }

  function parseCatalogBindings(rows) {
    const bindings = []
    if (!Array.isArray(rows)) return bindings
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const threadId = typeof row.threadId === 'string' ? row.threadId : ''
      const projectId = typeof row.projectId === 'string' ? row.projectId : ''
      if (row.hostKind !== 'chatgpt' || !validThreadId(threadId) || !CHATGPT_PROJECT_ID.test(projectId)) continue
      bindings.push({ threadId, projectId, recencyMs: epochMs(row.recencyMs) })
    }
    return bindings
  }

  function sidebarFromState(parsed) {
    const atoms = parsed && parsed['electron-persisted-atom-state']
    const source = typeof atoms === 'string' ? JSON.parse(atoms) : atoms
    if (!source || typeof source !== 'object') return []
    const projects = []
    for (const [key, value] of Object.entries(source)) {
      if (!String(key).startsWith('chatgpt-sidebar-state-v1')) continue
      const sidebar = typeof value === 'string' ? JSON.parse(value) : value
      projects.push(...parseSidebarProjects(sidebar))
    }
    return projects
  }

  function defaultStateText() {
    if (readStateText) return readStateText()
    if (!fs || !path || !os) return ''
    const codexHome = typeof process?.env?.CODEX_HOME === 'string' && process.env.CODEX_HOME.trim()
      ? path.resolve(process.env.CODEX_HOME)
      : path.join(os.homedir(), '.codex')
    return fs.readFileSync(path.join(codexHome, '.codex-global-state.json'), 'utf8')
  }

  function defaultCatalogRows() {
    if (queryCatalog) return queryCatalog()
    if (!fs || !path || !os) return []
    let DatabaseSync
    try { ({ DatabaseSync } = require('node:sqlite')) } catch { return [] }
    const codexHome = typeof process?.env?.CODEX_HOME === 'string' && process.env.CODEX_HOME.trim()
      ? path.resolve(process.env.CODEX_HOME)
      : path.join(os.homedir(), '.codex')
    const databasePath = path.join(codexHome, 'sqlite', 'codex-dev.db')
    if (!fs.existsSync(databasePath)) return []
    const database = new DatabaseSync(databasePath, { readOnly: true })
    try {
      return database.prepare(`
        SELECT c.thread_id AS threadId, c.project_id AS projectId,
               c.source_recency_at AS recencyAt, c.source_updated_at AS updatedAt
        FROM local_thread_catalog c
        JOIN local_thread_catalog_hosts h ON h.host_id = c.host_id
        WHERE h.host_kind = 'chatgpt' AND c.project_id LIKE 'g-p-%'
      `).all().map((row) => ({
        threadId: row.threadId,
        projectId: row.projectId,
        hostKind: 'chatgpt',
        recencyMs: Math.max(epochMs(row.recencyAt), epochMs(row.updatedAt))
      }))
    } finally {
      database.close()
    }
  }

  function readIndex() {
    const empty = { projects: [], bindings: [], catalog: 'unavailable' }
    try {
      const text = defaultStateText()
      if (!text) return empty
      const projects = sidebarFromState(JSON.parse(text))
      let catalog = 'unavailable'
      let bindings = []
      try {
        bindings = parseCatalogBindings(defaultCatalogRows())
        catalog = 'read'
      } catch {
        catalog = 'unavailable'
      }
      const byId = new Map(projects.map((project) => [project.id, project]))
      return { projects, bindings: bindings.filter((binding) => byId.has(binding.projectId)), byId, catalog }
    } catch {
      return empty
    }
  }

  function projectForThread(threadId) {
    if (!validThreadId(threadId)) return null
    const index = readIndex()
    const binding = index.bindings.find((item) => item.threadId === threadId)
    return binding ? index.byId.get(binding.projectId) || null : null
  }

  function sanitizeTurn(page) {
    const data = page && Array.isArray(page.data) ? page.data : null
    const turn = data && data[0] && typeof data[0] === 'object' ? data[0] : null
    if (!turn) return null
    const status = ['completed', 'interrupted', 'failed', 'inProgress'].includes(turn.status) ? turn.status : ''
    if (!status) return null
    const startedAt = epochMs(turn.startedAt)
    const completedAt = status === 'completed' ? epochMs(turn.completedAt) : 0
    if (!startedAt && !completedAt) return null
    const id = typeof turn.id === 'string' && turn.id.length > 0 && turn.id.length <= 200 ? turn.id : ''
    return {
      status,
      ...(id ? { id } : {}),
      ...(startedAt ? { startedAt } : {}),
      ...(completedAt ? { completedAt } : {})
    }
  }

  function noteProbe(probe) {
    const line = `${probe.catalog}:${probe.projects}:${probe.recentBound}:${probe.admitted}:${probe.skippedWithoutTurn}`
    if (line === lastProbeLine) return
    lastProbeLine = line
    recordDiagnostic({
      level: 'info',
      scope: 'task-probe',
      event: 'chatgpt-project-index',
      outcome: probe.catalog,
      provider: 'codex',
      count: probe.admitted,
      details: {
        projects: probe.projects,
        recentBound: probe.recentBound,
        admitted: probe.admitted,
        skippedWithoutTurn: probe.skippedWithoutTurn
      }
    })
  }

  async function admitIntoScan(input = {}) {
    const assignments = input.assignments instanceof Map ? input.assignments : null
    const publicRows = Array.isArray(input.publicRows) ? input.publicRows : null
    const turns = input.turns && input.turns.latest instanceof Map ? input.turns : null
    if (!assignments || !publicRows || !turns) return []
    const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now()
    const index = readIndex()
    const recent = index.bindings
      .filter((binding) => binding.recencyMs > 0 && nowMs - binding.recencyMs <= CHATGPT_PROJECT_INDEX_MAX_AGE_MS)
      .filter((binding) => !assignments.has(binding.threadId))
      .sort((left, right) => right.recencyMs - left.recencyMs)
      .slice(0, CHATGPT_PROJECT_INDEX_LIMIT)
    const admitted = []
    let skippedWithoutTurn = 0
    for (const binding of recent) {
      const project = index.byId.get(binding.projectId)
      if (!project || !readTurns) {
        skippedWithoutTurn += 1
        continue
      }
      let turn = null
      try { turn = sanitizeTurn(await readTurns(binding.threadId)) } catch { turn = null }
      if (!turn) {
        skippedWithoutTurn += 1
        continue
      }
      const thread = {
        id: binding.threadId,
        cwd: '',
        status: { type: turn.status === 'inProgress' ? 'active' : 'idle' },
        source: 'chatgpt',
        chatgptProject: true,
        recencyAt: turn.startedAt || turn.completedAt || binding.recencyMs
      }
      if (!publicRows.some((row) => row && row.id === binding.threadId)) publicRows.push(thread)
      assignments.set(binding.threadId, { project, reason: 'chatgpt-project' })
      turns.latest.set(binding.threadId, turn)
      admitted.push(binding.threadId)
    }
    noteProbe({
      catalog: index.catalog,
      projects: index.projects.length,
      recentBound: recent.length,
      admitted: admitted.length,
      skippedWithoutTurn
    })
    return admitted
  }

  function appendProjectCards(projects, alias) {
    if (!Array.isArray(projects) || typeof alias !== 'function') return projects
    const index = readIndex()
    const occupied = new Set(projects.map((project) => project && project.key).filter(Boolean))
    let order = projects.reduce((max, project) => Math.max(max, Number(project && project.nativeOrder) || 0), 0)
    for (const project of index.projects) {
      if (occupied.has(project.key)) continue
      order += 1
      occupied.add(project.key)
      projects.push({
        key: project.key,
        actionAlias: alias({ id: project.id, key: project.key, name: project.name, roots: [], kind: 'chatgpt' }),
        name: project.name,
        kind: 'project',
        nativePinned: false,
        nativeOrder: order
      })
    }
    return projects
  }

  return {
    revision: CHATGPT_PROJECT_INDEX_REVISION,
    parseSidebarProjects,
    parseCatalogBindings,
    projectKey,
    projectForThread,
    admitIntoScan,
    appendProjectCards
  }
}

module.exports = {
  CHATGPT_PROJECT_INDEX_REVISION,
  CHATGPT_PROJECT_INDEX_MAX_AGE_MS,
  CHATGPT_PROJECT_INDEX_LIMIT,
  createChatgptProjectIndex
}
