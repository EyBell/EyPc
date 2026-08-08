'use strict'

/** Claude desktop application data paths. No filesystem access lives here. */

function textOf(value) {
  return typeof value === 'string' ? value : ''
}

function claudeAppDataRoot(dependencies) {
  const override = textOf(dependencies.claudeAppDataRoot).trim()
  if (override) return override
  const path = dependencies.path
  const home = dependencies.os.homedir()
  const platform = dependencies.platform || process.platform
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Claude')
  }
  if (platform === 'win32') {
    const environment = dependencies.env || process.env || {}
    const base = textOf(environment.LOCALAPPDATA) || path.join(home, 'AppData', 'Local')
    return path.join(base, 'Claude')
  }
  return path.join(home, '.config', 'Claude')
}

module.exports = { claudeAppDataRoot }
