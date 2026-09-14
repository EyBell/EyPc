'use strict'

/**
 * Read-only Orca Agents inventory.
 *
 * Joins `worktree ps` agent rows with `terminal list` handles and tab titles
 * from `--include-visual-layouts`. Prompt, lastAssistantMessage, toolInput,
 * preview and absolute paths never enter the emitted session objects.
 */

const { harnessLabel } = require('../companion/harness-labels.cjs')
const ORCA_INVENTORY_REVISION = 'orca-agent-inventory-v1'
const BARE_AGENT_TITLE = /^(grok|claude|claude-code|codex|cursor|pi|omp|dsh|opencode|kimi)$/i
const TAB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HANDLE = /^term_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SESSIONS = 200
const SPINNER_PREFIX = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏\s]+/
const OSC_WORKING_PREFIX = /^(?:[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✳]|[.] )/

function textOf(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function timeOf(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0
}

function flagOf(value) {
  return value === true
}

function recordOf(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function paneKeyOf(tabId, leafId) {
  const tab = textOf(tabId).toLowerCase()
  const leaf = textOf(leafId).toLowerCase()
  if (!TAB_ID.test(tab) || !TAB_ID.test(leaf)) return ''
  return `${tab}:${leaf}`
}

function agentTypeOf(value) {
  const type = textOf(value).toLowerCase()
  return /^[a-z][a-z0-9-]{0,39}$/.test(type) ? type : ''
}

function titleOf(value) {
  const raw = textOf(value).replace(SPINNER_PREFIX, '').replace(/\s+/g, ' ').trim()
  return raw.slice(0, 240)
}

function stripAgentDecoration(title, agentType) {
  const abbrev = harnessLabel(agentType)
  let next = titleOf(title)
  if (!next) return ''
  if (abbrev) {
    const prefix = new RegExp(`^${abbrev}\\s*[·•.]\\s*`, 'i')
    next = next.replace(prefix, '').trim()
  }
  const suffix = new RegExp(`\\s+[-–—]\\s+(${agentType}|${abbrev || 'x'})$`, 'i')
  next = next.replace(suffix, '').trim()
  if (!next || BARE_AGENT_TITLE.test(next)) return ''
  return next
}

function displayTitle(terminalTitle, agentType, repoName, tabTitle) {
  const abbrev = harnessLabel(agentType) || 'orca'
  const topic = stripAgentDecoration(tabTitle, agentType)
    || stripAgentDecoration(terminalTitle, agentType)
  if (topic) return `${abbrev} · ${topic}`.slice(0, 240)
  const repo = textOf(repoName)
  return repo ? `${abbrev} · ${repo}` : abbrev
}

const LAYOUT_SKIP = new Set(['preview', 'path', 'worktreePath', 'cwd', 'contents', 'buffer', 'prompt'])

function isTabLayoutNode(node) {
  return Boolean(node && typeof node === 'object' && !Array.isArray(node)
    && TAB_ID.test(textOf(node.tabId))
    && Object.prototype.hasOwnProperty.call(node, 'activeLeafId')
    && !Object.prototype.hasOwnProperty.call(node, 'handle')
    && !Object.prototype.hasOwnProperty.call(node, 'leafId'))
}

function indexTabTitles(visualLayouts) {
  const byTab = new Map()
  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (isTabLayoutNode(node)) {
      const title = titleOf(node.title)
      if (title) byTab.set(textOf(node.tabId).toLowerCase(), title)
    }
    for (const [key, value] of Object.entries(node)) {
      if (LAYOUT_SKIP.has(key) || !value || typeof value !== 'object') continue
      walk(value)
    }
  }
  walk(visualLayouts)
  return byTab
}

function oscIndicatesWorking(title) {
  const raw = textOf(title)
  return Boolean(raw) && OSC_WORKING_PREFIX.test(raw)
}

function sessionState(agent, connected, terminalTitle) {
  if (flagOf(agent.interrupted)) return 'interrupted'
  if (connected === false) return 'interrupted'
  const state = textOf(agent.state).toLowerCase()
  if (state === 'working' || state === 'waiting' || state === 'blocked') return 'working'
  if (oscIndicatesWorking(terminalTitle)) return 'working'
  return 'done'
}

function mergeSession(agent, terminal, worktree, tabTitles) {
  const fromAgent = textOf(agent.paneKey).toLowerCase()
  const paneKey = paneKeyOf(fromAgent.split(':')[0], fromAgent.split(':')[1])
    || paneKeyOf(terminal.tabId, terminal.leafId)
  if (!paneKey) return null
  const agentType = agentTypeOf(agent.agentType || terminal.agentIdentity)
  if (!agentType) return null
  const handle = textOf(terminal.handle)
  const tabId = paneKey.slice(0, 36)
  const tabTitle = tabTitles instanceof Map ? (tabTitles.get(tabId) || '') : ''
  const connected = terminal.connected !== false
  const oscTitle = terminal.title
  const state = sessionState(agent, connected, oscTitle)
  const startedAt = timeOf(agent.stateStartedAt)
  const outputAt = timeOf(terminal.lastOutputAt)
  const updatedAt = timeOf(agent.updatedAt)
  const lastUpdatedAt = Math.max(updatedAt, outputAt, startedAt, timeOf(worktree.lastActivityAt))
  const liveFromTitle = state === 'working' && textOf(agent.state).toLowerCase() !== 'working'
  return {
    paneKey,
    tabId,
    leafId: paneKey.slice(37),
    handle: HANDLE.test(handle) ? handle : '',
    agentType,
    name: displayTitle(oscTitle, agentType, worktree.repo, tabTitle),
    projectName: textOf(worktree.repo).slice(0, 240),
    projectKey: textOf(worktree.worktreeId || worktree.repoId).slice(0, 256),
    connected,
    state,
    unread: false,
    pinned: flagOf(worktree.isPinned),
    lastUpdatedAt,
    stateStartedAt: liveFromTitle ? (outputAt || lastUpdatedAt) : startedAt,
    createdAt: timeOf(worktree.sortOrder) || timeOf(worktree.lastActivityAt),
    worktreeDisplayName: textOf(worktree.displayName).slice(0, 120)
  }
}

function indexTerminals(terminals) {
  const byPane = new Map()
  const byTab = new Map()
  for (const row of terminals) {
    const terminal = recordOf(row)
    const paneKey = paneKeyOf(terminal.tabId, terminal.leafId)
    if (!paneKey) continue
    byPane.set(paneKey, terminal)
    const tabId = textOf(terminal.tabId).toLowerCase()
    if (!byTab.has(tabId)) byTab.set(tabId, [])
    byTab.get(tabId).push(terminal)
  }
  return { byPane, byTab }
}

function attributeWorktreeUnread(sessions, start, worktreeUnread) {
  const end = sessions.length
  for (let index = start; index < end; index += 1) sessions[index].unread = false
  if (!worktreeUnread || start >= end) return
  let best = -1
  let bestAt = -1
  let bestKey = ''
  for (let index = start; index < end; index += 1) {
    const session = sessions[index]
    if (session.state === 'working') continue
    const at = timeOf(session.lastUpdatedAt)
    const key = textOf(session.paneKey)
    if (at > bestAt || (at === bestAt && key > bestKey)) {
      bestAt = at
      bestKey = key
      best = index
    }
  }
  if (best >= 0) sessions[best].unread = true
}

function collectSessions(worktrees, terminals, visualLayouts) {
  const { byPane } = indexTerminals(terminals)
  const tabTitles = indexTabTitles(visualLayouts)
  const seen = new Set()
  const sessions = []
  for (const row of worktrees) {
    const worktree = recordOf(row)
    if (flagOf(worktree.isArchived)) continue
    const start = sessions.length
    for (const agentRow of Array.isArray(worktree.agents) ? worktree.agents : []) {
      const agent = recordOf(agentRow)
      const paneKey = textOf(agent.paneKey).toLowerCase()
      if (!paneKey || seen.has(paneKey)) continue
      const terminal = byPane.get(paneKey) || {}
      const session = mergeSession(agent, terminal, worktree, tabTitles)
      if (!session) continue
      seen.add(session.paneKey)
      sessions.push(session)
      if (sessions.length >= MAX_SESSIONS) {
        attributeWorktreeUnread(sessions, start, flagOf(worktree.unread))
        return { sessions, truncated: true }
      }
    }
    attributeWorktreeUnread(sessions, start, flagOf(worktree.unread))
  }
  for (const terminal of terminals) {
    const row = recordOf(terminal)
    const paneKey = paneKeyOf(row.tabId, row.leafId)
    if (!paneKey || seen.has(paneKey) || !agentTypeOf(row.agentIdentity)) continue
    const session = mergeSession({
      paneKey,
      agentType: row.agentIdentity,
      state: 'done',
      updatedAt: row.lastOutputAt
    }, row, { repo: '', displayName: '', unread: false, isPinned: false }, tabTitles)
    if (!session) continue
    seen.add(session.paneKey)
    sessions.push(session)
    if (sessions.length >= MAX_SESSIONS) return { sessions, truncated: true }
  }
  return { sessions, truncated: false }
}

function fingerprintOf(sessions) {
  return JSON.stringify(sessions.map((session) => ([
    session.paneKey,
    session.handle,
    session.agentType,
    session.name,
    session.state,
    session.unread,
    session.pinned,
    session.connected,
    session.lastUpdatedAt,
    session.stateStartedAt,
    session.projectName
  ])))
}

function createInventoryReader(dependencies = {}) {
  const cli = dependencies.cli
  if (!cli || typeof cli.json !== 'function') {
    throw new Error('orca inventory requires cli.json')
  }

  async function readInventory() {
    const readAt = Date.now()
    if (cli.available === false) {
      return {
        revision: ORCA_INVENTORY_REVISION,
        available: false,
        reason: 'missing-cli',
        sessions: [],
        truncated: false,
        readAt
      }
    }
    const [ps, listWithLayouts] = await Promise.all([
      cli.json(['worktree', 'ps']),
      cli.json(['terminal', 'list', '--include-visual-layouts'])
    ])
    const list = listWithLayouts.ok === true
      ? listWithLayouts
      : await cli.json(['terminal', 'list'])
    if (ps.ok !== true) {
      const code = textOf(ps.error && ps.error.code) || 'ps-failed'
      return {
        revision: ORCA_INVENTORY_REVISION,
        available: false,
        reason: code === 'missing-cli' ? 'missing-cli' : (code === 'timeout' ? 'timeout' : 'app-unavailable'),
        sessions: [],
        truncated: false,
        readAt
      }
    }
    const worktrees = Array.isArray(ps.result && ps.result.worktrees) ? ps.result.worktrees : []
    const terminals = list.ok === true && Array.isArray(list.result && list.result.terminals)
      ? list.result.terminals
      : []
    const visualLayouts = list.ok === true && Array.isArray(list.result && list.result.visualLayouts)
      ? list.result.visualLayouts
      : []
    const collected = collectSessions(worktrees, terminals, visualLayouts)
    return {
      revision: ORCA_INVENTORY_REVISION,
      available: true,
      reason: 'ready',
      sessions: collected.sessions,
      truncated: collected.truncated === true || ps.result.truncated === true,
      readAt
    }
  }

  return {
    revision: ORCA_INVENTORY_REVISION,
    readInventory,
    fingerprintOf
  }
}

module.exports = {
  ORCA_INVENTORY_REVISION,
  paneKeyOf,
  collectSessions,
  fingerprintOf,
  displayTitle,
  indexTabTitles,
  oscIndicatesWorking,
  attributeWorktreeUnread,
  createInventoryReader
}
