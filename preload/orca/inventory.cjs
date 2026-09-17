"use strict"
const { trace: freezeTrace } = require('../freeze-trace.cjs')

/**
 * Read-only Orca Agents inventory.
 *
 * Joins `worktree ps` agent rows with `terminal list` handles and tab titles
 * from `--include-visual-layouts`. Prompt, lastAssistantMessage, toolInput,
 * preview and absolute paths never enter the emitted session objects.
 */

const { harnessLabel } = require('../companion/harness-labels.cjs')
const { createNativeStateReader } = require('./native-state.cjs')
const ORCA_INVENTORY_REVISION = 'orca-agent-inventory-v1'
const BARE_AGENT_TITLE = /^(grok|claude|claude-code|codex|cursor|pi|omp|dsh|opencode|kimi)$/i
const TAB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HANDLE = /^term_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SESSIONS = 200
const SPINNER_PREFIX = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✳◑◐◒◓●\s]+/
const OSC_WORKING_PREFIX = /^(?:[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✳◑◐◒◓●]|[.] )/

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

function indexTabOrdinals(visualLayouts) {
  const ordinals = new Map()
  function takeTabs(tabs) {
    if (!Array.isArray(tabs)) return
    tabs.forEach((tab, index) => {
      if (!isTabLayoutNode(tab)) return
      const tabId = textOf(tab.tabId).toLowerCase()
      if (TAB_ID.test(tabId) && !ordinals.has(tabId)) ordinals.set(tabId, index)
    })
  }
  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (Array.isArray(node.tabs)) takeTabs(node.tabs)
    for (const [key, value] of Object.entries(node)) {
      if (LAYOUT_SKIP.has(key) || !value || typeof value !== 'object') continue
      walk(value)
    }
  }
  walk(visualLayouts)
  return ordinals
}

function oscIndicatesWorking(title) {
  const raw = textOf(title)
  return Boolean(raw) && OSC_WORKING_PREFIX.test(raw)
}

function leadTurnCompleted(agent) {
  if (!agent || typeof agent !== 'object') return false
  const state = textOf(agent.state).toLowerCase()
  // Agents still working/waiting/blocked is the live turn, including Claude
  // Stop leftover monitoring between tools. Folding that to done made the
  // card oscillate completed-read ↔ running.
  if (state === 'working' || state === 'waiting' || state === 'blocked') return false
  if (textOf(agent.workingMode).toLowerCase() === 'monitoring') return true
  if (timeOf(agent.turnCompletedAt) > 0) return true
  return agent.unread === true
}

function isLiveAgent(agent, terminal) {
  const state = textOf(agent && agent.state).toLowerCase()
  if (state === 'working' || state === 'waiting' || state === 'blocked') return true
  if (flagOf(agent && agent.interrupted)) return true
  return oscIndicatesWorking(terminal && terminal.title)
}

function hasConversation(agent, terminal) {
  if (isLiveAgent(agent, terminal)) return true
  if (textOf(agent && agent.prompt) || textOf(agent && agent.lastAssistantMessage) || textOf(agent && agent.toolName)) {
    return true
  }
  return !Object.prototype.hasOwnProperty.call(agent || {}, 'prompt')
    && !Object.prototype.hasOwnProperty.call(agent || {}, 'lastAssistantMessage')
    && !Object.prototype.hasOwnProperty.call(agent || {}, 'toolName')
}

function sessionState(agent, connected, terminalTitle) {
  if (flagOf(agent.interrupted)) return 'interrupted'
  if (connected === false) return 'interrupted'
  const state = textOf(agent.state).toLowerCase()
  if (state === 'waiting' || state === 'blocked') return 'working'
  // monitoring / turnCompletedAt only complete a turn after Agents leave
  // working/waiting/blocked. OSC ✳ may still lift a true done pane.
  if (leadTurnCompleted(agent)) return 'done'
  if (state === 'working') return 'working'
  if (oscIndicatesWorking(terminalTitle)) return 'working'
  return 'done'
}

function mergeSession(agent, terminal, worktree, tabTitles, tabOrdinals, nativePins) {
  const fromAgent = textOf(agent.paneKey).toLowerCase()
  const paneKey = paneKeyOf(fromAgent.split(':')[0], fromAgent.split(':')[1])
    || paneKeyOf(terminal.tabId, terminal.leafId)
  if (!paneKey) return null
  const agentType = agentTypeOf(agent.agentType || terminal.agentIdentity)
  if (!agentType) return null
  const handle = textOf(terminal.handle)
  const tabId = paneKey.slice(0, 36)
  const tabTitle = tabTitles instanceof Map ? (tabTitles.get(tabId) || '') : ''
  const tabOrdinal = tabOrdinals instanceof Map && tabOrdinals.has(tabId) ? tabOrdinals.get(tabId) : -1
  const connected = terminal.connected !== false
  const oscTitle = terminal.title
  const state = sessionState(agent, connected, oscTitle)
  const startedAt = timeOf(agent.stateStartedAt)
  const updatedAt = timeOf(agent.updatedAt)
  // Pane recency is this terminal's own clocks. worktree.lastActivityAt is a
  // group summary and would make every sibling look equally new.
  // lastOutputAt / mid-turn updatedAt tick while the model replies and would
  // keep re-sorting the card. Sort and display stay on the question epoch:
  // when Orca entered working. Done/interrupted send 0 so Kernel keeps the
  // previous question time.
  const lastQuestionAt = state === 'working' ? startedAt : 0
  const lastUpdatedAt = startedAt || updatedAt
  return {
    paneKey,
    tabId,
    leafId: paneKey.slice(37),
    handle: HANDLE.test(handle) ? handle : '',
    agentType,
    name: displayTitle(oscTitle, agentType, worktree.repo, tabTitle),
    projectName: textOf(worktree.repo).slice(0, 240),
    projectKey: textOf(worktree.worktreeId || worktree.repoId).slice(0, 256),
    worktreeId: textOf(worktree.worktreeId).slice(0, 256),
    connected,
    state,
    unread: agent.unread === true,
    nativeUnread: typeof agent.unread === 'boolean',
    unreadExplicit: typeof agent.unread === 'boolean',
    pinned: typeof terminal.isPinned === 'boolean'
      ? terminal.isPinned
      : nativePins instanceof Set && nativePins.has(tabId),
    lastUpdatedAt,
    lastQuestionAt,
    stateStartedAt: startedAt || updatedAt,
    createdAt: timeOf(worktree.sortOrder) || timeOf(worktree.lastActivityAt),
    worktreeDisplayName: textOf(worktree.displayName).slice(0, 120),
    tabOrdinal
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

function stripAttributionFields(session) {
  delete session.unreadExplicit
  delete session.tabOrdinal
}

function attributeWorktreeUnread(sessions, start, worktreeUnread) {
  const end = sessions.length
  let hasExplicit = false
  for (let index = start; index < end; index += 1) {
    if (sessions[index].unreadExplicit === true) hasExplicit = true
  }
  if (hasExplicit) {
    for (let index = start; index < end; index += 1) {
      const session = sessions[index]
      if (session.unreadExplicit !== true) session.unread = false
    }
    return
  }
  for (let index = start; index < end; index += 1) {
    sessions[index].unread = false
  }
  if (!worktreeUnread || start >= end) return
  const done = []
  for (let index = start; index < end; index += 1) {
    if (sessions[index].state !== 'working') done.push(index)
  }
  // Workspace unread is one bit. Guessing the rightmost/newest sibling marks
  // an already-read tab (KM-8765 vs 清工). Only attribute when a single done
  // pane can own that bit.
  if (done.length === 1) sessions[done[0]].unread = true
}

function finishUnread(sessions, unreadBridge) {
  if (unreadBridge && typeof unreadBridge.observe === 'function') unreadBridge.observe(sessions)
  for (const session of sessions) stripAttributionFields(session)
}

function collectSessions(worktrees, terminals, visualLayouts, nativePins, unreadBridge) {
  const { byPane } = indexTerminals(terminals)
  const tabTitles = indexTabTitles(visualLayouts)
  const tabOrdinals = indexTabOrdinals(visualLayouts)
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
      const terminal = byPane.get(paneKey)
      if (!terminal) continue
      if (!hasConversation(agent, terminal)) continue
      const session = mergeSession(agent, terminal, worktree, tabTitles, tabOrdinals, nativePins)
      if (!session) continue
      seen.add(session.paneKey)
      sessions.push(session)
      if (sessions.length >= MAX_SESSIONS) {
        attributeWorktreeUnread(sessions, start, flagOf(worktree.unread))
        finishUnread(sessions, unreadBridge)
        return { sessions, truncated: true }
      }
    }
    attributeWorktreeUnread(sessions, start, flagOf(worktree.unread))
  }
  for (const terminal of terminals) {
    const row = recordOf(terminal)
    const paneKey = paneKeyOf(row.tabId, row.leafId)
    if (!paneKey || seen.has(paneKey) || !agentTypeOf(row.agentIdentity)) continue
    const agent = {
      paneKey,
      agentType: row.agentIdentity,
      state: 'done',
      updatedAt: row.lastOutputAt
    }
    // Toolbar-only panes publish agentIdentity before any conversation exists.
    // Keep a live working frame; idle identity without a worktree.ps row stays out.
    if (!isLiveAgent(agent, row)) continue
    const session = mergeSession(agent, row, { repo: '', displayName: '', unread: false, isPinned: false }, tabTitles, tabOrdinals, nativePins)
    if (!session) continue
    seen.add(session.paneKey)
    sessions.push(session)
    if (sessions.length >= MAX_SESSIONS) {
      finishUnread(sessions, unreadBridge)
      return { sessions, truncated: true }
    }
  }
  finishUnread(sessions, unreadBridge)
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
    session.lastQuestionAt,
    session.stateStartedAt,
    session.projectName,
    session.worktreeId
  ])))
}

function createInventoryReader(dependencies = {}) {
  const cli = dependencies.cli
  if (!cli || typeof cli.json !== 'function') {
    throw new Error('orca inventory requires cli.json')
  }
  const nativeState = dependencies.nativeState
    || createNativeStateReader(dependencies)
  const unreadBridge = dependencies.unreadBridge

  async function readInventory() {
    const freezeSpan = freezeTrace.begin('orca.read-inventory')
    try {
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
    if (ps.ok !== true || list.ok !== true) {
      const failed = ps.ok !== true ? ps : list
      const code = textOf(failed.error && failed.error.code) || (ps.ok !== true ? 'ps-failed' : 'list-failed')
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
    const nativePins = nativeState && typeof nativeState.pinnedTabIds === 'function'
      ? nativeState.pinnedTabIds()
      : new Set()
    if (unreadBridge && typeof unreadBridge.ready === 'function') await unreadBridge.ready()
    const collected = collectSessions(worktrees, terminals, visualLayouts, nativePins, unreadBridge)
    return {
      revision: ORCA_INVENTORY_REVISION,
      available: true,
      reason: 'ready',
      sessions: collected.sessions,
      truncated: collected.truncated === true || ps.result.truncated === true,
      readAt
    }

    } finally { freezeTrace.end(freezeSpan) }
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
  indexTabOrdinals,
  oscIndicatesWorking,
  leadTurnCompleted,
  attributeWorktreeUnread,
  finishUnread,
  createInventoryReader
}
