'use strict'

/**
 * Parses a Codex Environment definition (`.codex/environments/*.toml`) into
 * the shape the host acts on: a name, an optional setup script, and a list of
 * actions.
 *
 * Not a general TOML parser — it accepts exactly the subset Environment files
 * use (`[setup]`, `[[actions]]`, quoted string values) and returns `null` for
 * anything else, including multi-line strings (`"""`/`'''`), a missing or
 * non-`1` `version`, or a malformed action entry. A file this narrow cannot
 * fully account for is one the host does not act on.
 *
 * It has no dependencies at all — no module bindings, no globals, not even a
 * Node builtin — so it is required directly rather than constructed, on the
 * same precedent as command-validation.cjs.
 */

const CODEX_ENVIRONMENT_TOML_REVISION = 'codex-environment-toml-v1'

function codexEnvUnquoteTomlString(raw) {
  const value = String(raw || '').trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return value
}

function parseCodexEnvironmentTomlText(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  if (text.includes('"""') || text.includes("'''")) return null
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  let section = 'root'
  let version = 0
  let versionPresent = false
  let name = ''
  let setupScript = ''
  const actions = []
  let currentAction = null
  let parseError = false

  const stripTomlComment = (rawLine) => {
    let inSingle = false
    let inDouble = false
    let escaped = false
    for (let i = 0; i < rawLine.length; i += 1) {
      const ch = rawLine[i]
      if (escaped) {
        escaped = false
        continue
      }
      if (inDouble && ch === '\\') {
        escaped = true
        continue
      }
      if (!inDouble && ch === '\'') {
        inSingle = !inSingle
        continue
      }
      if (!inSingle && ch === '"') {
        inDouble = !inDouble
        continue
      }
      if (ch === '#' && !inSingle && !inDouble) return rawLine.slice(0, i)
    }
    return rawLine
  }
  const flushAction = () => {
    if (!currentAction) return
    if (currentAction.name && currentAction.command) actions.push({ ...currentAction })
    else parseError = true
    currentAction = null
  }
  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim()
    if (!line) continue
    if (line === '[setup]') { flushAction(); section = 'setup'; continue }
    if (line === '[[actions]]') {
      flushAction()
      section = 'action'
      currentAction = { name: '', icon: 'run', command: '' }
      continue
    }
    if (line.startsWith('[')) { flushAction(); section = 'root'; continue }
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const rawValue = line.slice(eq + 1).trim()
    const value = codexEnvUnquoteTomlString(rawValue)
    if (section === 'root') {
      if (key === 'version') {
        versionPresent = true
        if (rawValue !== '1') parseError = true
        version = rawValue === '1' ? 1 : NaN
      }
      else if (key === 'name') name = value.slice(0, 120)
    } else if (section === 'setup') {
      if (key === 'script') setupScript = value.slice(0, 4_000)
    } else if (section === 'action' && currentAction) {
      if (key === 'name') currentAction.name = value.slice(0, 80)
      else if (key === 'icon') currentAction.icon = value.slice(0, 40) || 'run'
      else if (key === 'command') currentAction.command = value.slice(0, 4_000)
    }
  }
  flushAction()
  if (!name && !actions.length && !setupScript) return null
  if (parseError) return null
  if (!versionPresent || version !== 1) return null
  return { version: 1, name: name || 'Environment', setupScript, actions }
}

module.exports = {
  CODEX_ENVIRONMENT_TOML_REVISION,
  codexEnvUnquoteTomlString,
  parseCodexEnvironmentTomlText
}
