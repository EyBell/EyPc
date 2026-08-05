'use strict'

/**
 * Claude Code settings integration.
 *
 * Registering the companion means adding hook handlers — and optionally a
 * status line wrapper — to `~/.claude/settings.json`. That file belongs to the
 * user, so every operation here is:
 *
 *  - idempotent: installing twice produces the same file;
 *  - additive: unrelated hooks, matchers and settings are preserved verbatim;
 *  - reversible: uninstall removes exactly what install added and restores any
 *    status line command that was replaced.
 *
 * Everything in this module is pure — callers own reading and writing the file.
 */

const EYPC_MARKER = 'eypc-claude-companion'
const EYPC_SETTINGS_KEY = '_eypcClaudeCompanion'

/** Hook events the companion subscribes to. */
const EYPC_HOOK_EVENTS = Object.freeze([
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Notification',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'SessionEnd'
])

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function isEypcHandler(handler) {
  if (!isPlainObject(handler)) return false
  const command = typeof handler.command === 'string' ? handler.command : ''
  return command.includes(EYPC_MARKER)
}

function isEypcGroup(group) {
  if (!isPlainObject(group)) return false
  const handlers = Array.isArray(group.hooks) ? group.hooks : []
  return handlers.length > 0 && handlers.every(isEypcHandler)
}

function eypcGroup(command, timeout) {
  return {
    hooks: [{
      type: 'command',
      command,
      timeout: Number.isFinite(timeout) ? timeout : 5
    }]
  }
}

/**
 * Adds the companion's hook handlers to a settings object.
 *
 * Existing groups for the same event are kept untouched; the companion's own
 * group is replaced rather than duplicated, so a re-install after a path change
 * converges instead of accumulating.
 */
function withEypcHooks(settings, options) {
  const source = isPlainObject(settings) ? clone(settings) : {}
  const command = String((options && options.command) || '').trim()
  if (!command) throw new Error('hook command is required')
  if (!command.includes(EYPC_MARKER)) throw new Error('hook command must be identifiable by the eypc marker')
  const timeout = options && options.timeout
  const hooks = isPlainObject(source.hooks) ? source.hooks : {}
  for (const event of EYPC_HOOK_EVENTS) {
    const existing = Array.isArray(hooks[event]) ? hooks[event] : []
    const preserved = existing.filter((group) => !isEypcGroup(group))
    hooks[event] = [...preserved, eypcGroup(command, timeout)]
  }
  source.hooks = hooks
  return source
}

/** Removes every handler the companion installed, leaving the rest intact. */
function withoutEypcHooks(settings) {
  const source = isPlainObject(settings) ? clone(settings) : {}
  if (!isPlainObject(source.hooks)) return source
  const hooks = source.hooks
  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue
    const preserved = hooks[event].filter((group) => !isEypcGroup(group))
    if (preserved.length) hooks[event] = preserved
    else delete hooks[event]
  }
  if (!Object.keys(hooks).length) delete source.hooks
  return source
}

function hookInstallState(settings, options) {
  const command = options && typeof options.command === 'string' ? options.command.trim() : ''
  const hooks = isPlainObject(settings) && isPlainObject(settings.hooks) ? settings.hooks : {}
  let installed = 0
  let matching = 0
  for (const event of EYPC_HOOK_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? hooks[event] : []
    const own = groups.filter(isEypcGroup)
    if (!own.length) continue
    installed += 1
    if (!command) continue
    const commands = own.flatMap((group) => group.hooks.map((handler) => handler.command))
    if (commands.includes(command)) matching += 1
  }
  if (!installed) return 'missing'
  if (installed < EYPC_HOOK_EVENTS.length) return 'outdated'
  if (command && matching < EYPC_HOOK_EVENTS.length) return 'outdated'
  return 'installed'
}

/**
 * Installs the companion status line.
 *
 * A status line the user already configured is not discarded: it is recorded in
 * the companion's own settings block and the wrapper script is expected to run
 * it and pass its output through, so the user's status line keeps rendering
 * exactly as before.
 */
function withEypcStatusline(settings, options) {
  const source = isPlainObject(settings) ? clone(settings) : {}
  const command = String((options && options.command) || '').trim()
  if (!command) throw new Error('statusline command is required')
  if (!command.includes(EYPC_MARKER)) throw new Error('statusline command must be identifiable by the eypc marker')
  const current = isPlainObject(source.statusLine) ? source.statusLine : null
  const currentCommand = current && typeof current.command === 'string' ? current.command : ''
  const marker = isPlainObject(source[EYPC_SETTINGS_KEY]) ? clone(source[EYPC_SETTINGS_KEY]) : {}
  if (currentCommand && !currentCommand.includes(EYPC_MARKER)) {
    // First install over a user-owned status line: remember it so the wrapper
    // can chain to it and uninstall can put it back.
    marker.chainedStatusLine = clone(current)
  }
  marker.version = 1
  source[EYPC_SETTINGS_KEY] = marker
  source.statusLine = { ...(current || {}), type: 'command', command }
  return source
}

function withoutEypcStatusline(settings) {
  const source = isPlainObject(settings) ? clone(settings) : {}
  const marker = isPlainObject(source[EYPC_SETTINGS_KEY]) ? source[EYPC_SETTINGS_KEY] : null
  const current = isPlainObject(source.statusLine) ? source.statusLine : null
  const currentCommand = current && typeof current.command === 'string' ? current.command : ''
  if (currentCommand.includes(EYPC_MARKER)) {
    if (marker && isPlainObject(marker.chainedStatusLine)) source.statusLine = clone(marker.chainedStatusLine)
    else delete source.statusLine
  }
  if (marker) {
    const rest = { ...marker }
    delete rest.chainedStatusLine
    delete rest.version
    if (Object.keys(rest).length) source[EYPC_SETTINGS_KEY] = rest
    else delete source[EYPC_SETTINGS_KEY]
  }
  return source
}

function statuslineInstallState(settings, options) {
  const command = options && typeof options.command === 'string' ? options.command.trim() : ''
  const current = isPlainObject(settings) && isPlainObject(settings.statusLine) ? settings.statusLine : null
  const currentCommand = current && typeof current.command === 'string' ? current.command : ''
  if (!currentCommand.includes(EYPC_MARKER)) return 'missing'
  if (command && currentCommand !== command) return 'outdated'
  return 'installed'
}

/** The status line the wrapper should chain to, if any. */
function chainedStatusLineCommand(settings) {
  const marker = isPlainObject(settings) && isPlainObject(settings[EYPC_SETTINGS_KEY])
    ? settings[EYPC_SETTINGS_KEY]
    : null
  const chained = marker && isPlainObject(marker.chainedStatusLine) ? marker.chainedStatusLine : null
  return chained && typeof chained.command === 'string' ? chained.command : ''
}

module.exports = {
  EYPC_MARKER,
  EYPC_SETTINGS_KEY,
  EYPC_HOOK_EVENTS,
  withEypcHooks,
  withoutEypcHooks,
  hookInstallState,
  withEypcStatusline,
  withoutEypcStatusline,
  statuslineInstallState,
  chainedStatusLineCommand
}
