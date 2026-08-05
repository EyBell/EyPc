'use strict'

/**
 * Claude Code environment probe.
 *
 * Everything here is read-only against the user's machine. The one write path
 * in the whole Claude bridge — hook and status line registration — lives in
 * index.cjs and is gated on an explicit user confirmation; this module only
 * reports what is currently true.
 */

const { hookInstallState, statuslineInstallState } = require('./settings.cjs')

const CLI_BINARY_NAMES = ['claude']

function candidateBinaryPaths(dependencies) {
  const path = dependencies.path
  const os = dependencies.os
  const home = os.homedir()
  const platform = dependencies.platform || process.platform
  const suffix = platform === 'win32' ? '.cmd' : ''
  const roots = [
    path.join(home, '.claude', 'local'),
    path.join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    path.join(home, '.bun', 'bin'),
    path.join(home, '.volta', 'bin')
  ]
  const candidates = []
  for (const root of roots) {
    for (const name of CLI_BINARY_NAMES) candidates.push(path.join(root, `${name}${suffix}`))
  }
  return candidates
}

/**
 * PATH entries are checked before the well-known roots, because a CLI installed
 * through nvm, volta, bun or a global npm prefix lives somewhere only PATH
 * knows about.
 */
function pathBinaryCandidates(dependencies) {
  const path = dependencies.path
  const platform = dependencies.platform || process.platform
  const environment = dependencies.env || process.env || {}
  const raw = typeof environment.PATH === 'string' ? environment.PATH : ''
  if (!raw) return []
  const separator = platform === 'win32' ? ';' : ':'
  const suffix = platform === 'win32' ? '.cmd' : ''
  const candidates = []
  for (const entry of raw.split(separator)) {
    const directory = entry.trim()
    if (!directory) continue
    for (const name of CLI_BINARY_NAMES) candidates.push(path.join(directory, `${name}${suffix}`))
  }
  return candidates
}

function locateCli(dependencies) {
  const fs = dependencies.fs
  const manual = typeof dependencies.manualPath === 'string' ? dependencies.manualPath.trim() : ''
  if (manual) {
    try { if (fs.statSync(manual).isFile()) return manual } catch { /* fall through to discovery */ }
  }
  const seen = new Set()
  for (const candidate of [...pathBinaryCandidates(dependencies), ...candidateBinaryPaths(dependencies)]) {
    if (seen.has(candidate)) continue
    seen.add(candidate)
    try { if (fs.statSync(candidate).isFile()) return candidate } catch { /* keep looking */ }
  }
  return ''
}

function readJsonFile(fs, filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return null }
}

/**
 * Reads a settings file while distinguishing "there is nothing there" from
 * "there is something there that we could not understand". Collapsing those two
 * cases into an empty object would let a write replace a settings file the user
 * still owns — a hand-edited trailing comma would silently wipe it.
 */
function readSettingsFile(fs, filePath) {
  let raw
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    // ENOENT is the only benign case; anything else is a real read failure.
    if (error && error.code === 'ENOENT') return { state: 'absent', value: {} }
    return { state: 'unreadable', value: {}, reason: 'settings.json 无法读取' }
  }
  if (!String(raw).trim()) return { state: 'absent', value: {} }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { state: 'unparseable', value: {}, reason: 'settings.json 不是合法 JSON，已放弃写入以免覆盖你的配置' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { state: 'unparseable', value: {}, reason: 'settings.json 顶层不是对象，已放弃写入以免覆盖你的配置' }
  }
  return { state: 'present', value: parsed, raw }
}

/**
 * Authentication probe.
 *
 * On Linux the OAuth material sits in `~/.claude/.credentials.json`; on macOS
 * Claude Code keeps it in the login keychain and only a marker remains on disk.
 * The probe therefore checks for *presence*, never content — no token value is
 * read, logged, cached or returned.
 */
function probeAuthentication(dependencies, claudeHome) {
  const fs = dependencies.fs
  const path = dependencies.path
  const credentials = path.join(claudeHome, '.credentials.json')
  try {
    if (fs.statSync(credentials).isFile()) return true
  } catch { /* not on this platform */ }
  // macOS keychain-backed installs still maintain these session artifacts.
  for (const marker of ['projects', 'sessions', 'statsig', 'history.jsonl']) {
    try {
      fs.statSync(path.join(claudeHome, marker))
      return true
    } catch { /* keep checking */ }
  }
  return false
}

function readCliVersion(dependencies, claudeHome) {
  const fs = dependencies.fs
  const path = dependencies.path
  // The transcript carries the exact CLI version that wrote it, which avoids
  // spawning the binary just to ask.
  const versionFile = readJsonFile(fs, path.join(claudeHome, 'version.json'))
  if (versionFile && typeof versionFile.version === 'string') return versionFile.version
  return ''
}

function createEnvironmentProbe(dependencies) {
  const fs = dependencies.fs
  const path = dependencies.path
  const os = dependencies.os

  function claudeHome() {
    const override = typeof dependencies.claudeHome === 'string' ? dependencies.claudeHome.trim() : ''
    return override || path.join(os.homedir(), '.claude')
  }

  function settingsPath() {
    return path.join(claudeHome(), 'settings.json')
  }

  function readSettings() {
    return readSettingsFile(fs, settingsPath()).value
  }

  /** Full read result, used by the write paths that must fail closed. */
  function inspectSettingsFile() {
    return readSettingsFile(fs, settingsPath())
  }

  function inspect(options) {
    const settings = options || {}
    const home = claudeHome()
    const versionHint = typeof settings.cliVersionHint === 'string' ? settings.cliVersionHint : ''
    const cliPath = locateCli(dependencies)
    let homeReady = false
    try { homeReady = fs.statSync(path.join(home, 'projects')).isDirectory() } catch { homeReady = false }
    const userSettings = readSettings()
    return {
      version: 1,
      installed: Boolean(cliPath),
      homeReady,
      authenticated: probeAuthentication(dependencies, home),
      cliVersion: readCliVersion(dependencies, home) || versionHint,
      hooks: hookInstallState(userSettings, { command: settings.hookCommand || '' }),
      statusline: statuslineInstallState(userSettings, { command: settings.statuslineCommand || '' }),
      checkedAt: Date.now()
    }
  }

  /** Enumerates transcript files without reading them. */
  function listTranscripts() {
    const projects = path.join(claudeHome(), 'projects')
    const rows = []
    let slugs = []
    try { slugs = fs.readdirSync(projects) } catch { return rows }
    for (const slug of slugs) {
      const directory = path.join(projects, slug)
      let files = []
      try {
        if (!fs.statSync(directory).isDirectory()) continue
        files = fs.readdirSync(directory)
      } catch { continue }
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue
        const filePath = path.join(directory, file)
        let mtimeMs = 0
        try { mtimeMs = Number(fs.statSync(filePath).mtimeMs) || 0 } catch { mtimeMs = 0 }
        rows.push({
          projectSlug: slug,
          sessionId: file.slice(0, -'.jsonl'.length),
          filePath,
          mtimeMs
        })
      }
    }
    return rows
  }

  return { claudeHome, settingsPath, readSettings, inspectSettingsFile, inspect, listTranscripts, locateCli: () => locateCli(dependencies) }
}

module.exports = {
  CLI_BINARY_NAMES,
  readSettingsFile,
  candidateBinaryPaths,
  pathBinaryCandidates,
  locateCli,
  probeAuthentication,
  createEnvironmentProbe
}
