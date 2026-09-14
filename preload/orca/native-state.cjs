'use strict'

/**
 * Read Orca tab pins from the native session store. Conversation bodies,
 * titles and prompts are never copied out. Used when the running CLI omits
 * terminal.isPinned.
 *
 * Agent Session History (`aiVault.listSessions`) is not a pin or unread
 * source: live rows have title/updatedAt/messageCount only. Sidebar agent
 * dots are working/done/interrupted only. Completed-unread lives on the
 * tab bar (`unreadAgentCompletionPanes`), which 1.4.202 does not export.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ORCA_NATIVE_STATE_REVISION = 'orca-native-state-v1'
const TAB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function textOf(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function userDataPath(env, homeDir) {
  const override = textOf(env && env.ORCA_USER_DATA_PATH)
  if (override) return override
  const home = textOf(homeDir) || os.homedir()
  if (!home) return ''
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'orca')
  if (process.platform === 'win32') {
    const appData = textOf(env && env.APPDATA)
    return appData ? path.join(appData, 'orca') : ''
  }
  return path.join(textOf(env && env.XDG_CONFIG_HOME) || path.join(home, '.config'), 'orca')
}

function profileDataFile(root, io) {
  if (!root) return ''
  let profileId = 'local-default'
  try {
    const index = JSON.parse(io.readFileSync(path.join(root, 'orca-profile-index.json'), 'utf8'))
    const id = textOf(index && index.activeProfileId)
    if (id) profileId = id
  } catch {
    /* default profile */
  }
  return path.join(root, 'profiles', profileId, 'orca-data.json')
}

function collectPinnedTabIds(session) {
  const ids = new Set()
  if (!session || typeof session !== 'object') return ids
  for (const table of [session.tabsByWorktree, session.unifiedTabs]) {
    if (!table || typeof table !== 'object' || Array.isArray(table)) continue
    for (const rows of Object.values(table)) {
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        if (!row || typeof row !== 'object' || row.isPinned !== true) continue
        const id = textOf(row.id).toLowerCase()
        if (TAB_ID.test(id)) ids.add(id)
      }
    }
  }
  return ids
}

function createNativeStateReader(dependencies = {}) {
  const io = dependencies.fs && typeof dependencies.fs.readFileSync === 'function' ? dependencies.fs : fs
  const env = dependencies.env && typeof dependencies.env === 'object' ? dependencies.env : process.env
  const homeDir = typeof dependencies.homedir === 'string' ? dependencies.homedir : os.homedir()
  const file = profileDataFile(userDataPath(env, homeDir), io)
  let cachedMtime = -1
  let cached = new Set()

  function pinnedTabIds() {
    if (!file) return cached
    let stat
    try {
      stat = io.statSync(file)
    } catch {
      cachedMtime = -1
      cached = new Set()
      return cached
    }
    const mtime = Number(stat.mtimeMs) || 0
    if (mtime === cachedMtime) return cached
    try {
      const parsed = JSON.parse(io.readFileSync(file, 'utf8'))
      cached = collectPinnedTabIds(parsed && parsed.workspaceSession)
      cachedMtime = mtime
    } catch {
      cachedMtime = -1
      cached = new Set()
    }
    return cached
  }

  return {
    revision: ORCA_NATIVE_STATE_REVISION,
    file,
    pinnedTabIds
  }
}

module.exports = {
  ORCA_NATIVE_STATE_REVISION,
  collectPinnedTabIds,
  createNativeStateReader,
  profileDataFile,
  userDataPath
}
