'use strict'

/**
 * Cursor user-level `~/.cursor/hooks.json` integration.
 *
 * Schema is official `version: 1` with a flat per-event command array, not
 * Claude's nested settings groups. Every operation is additive, idempotent and
 * reversible. Callers own reading and writing the file.
 */

const EYPC_MARKER = 'eypc-cursor-companion'

const EYPC_HOOK_EVENTS = Object.freeze([
  'sessionStart',
  'sessionEnd',
  'beforeSubmitPrompt',
  'preToolUse',
  'postToolUse',
  'postToolUseFailure',
  'subagentStart',
  'subagentStop',
  'stop',
  'afterAgentResponse',
  'afterAgentThought'
])

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function handlerCommand(handler) {
  if (!isPlainObject(handler)) return ''
  return typeof handler.command === 'string' ? handler.command : ''
}

function isEypcHandler(handler) {
  return handlerCommand(handler).includes(EYPC_MARKER)
}

/**
 * Cursor 3.17+ rejects the entire user hooks.json when any handler has
 * `loop_limit: 0` ("must be a positive integer or null"). That drops every
 * EyPc handler in the same file. Coerce non-positive / non-integer values
 * to 1 so a preserved user hook cannot fail-closed the whole config.
 */
function sanitizeHandler(handler) {
  if (!isPlainObject(handler)) return handler
  if (!Object.prototype.hasOwnProperty.call(handler, 'loop_limit')) return handler
  const limit = handler.loop_limit
  if (limit === null) return handler
  if (Number.isInteger(limit) && limit > 0) return handler
  const next = clone(handler)
  next.loop_limit = 1
  return next
}

function sanitizeHooks(settings) {
  if (!isPlainObject(settings) || !isPlainObject(settings.hooks)) return settings
  const hooks = settings.hooks
  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue
    hooks[event] = hooks[event].map(sanitizeHandler)
  }
  return settings
}

function eypcHandler(command, timeout) {
  return {
    command,
    timeout: Number.isFinite(timeout) ? timeout : 5
  }
}

/**
 * Adds EyPc command hooks for every subscribed Cursor event.
 *
 * User-owned handlers are kept. Our own handler is replaced rather than
 * duplicated so a path change converges. `failClosed` is never set.
 */
function withEypcHooks(settings, options) {
  const source = isPlainObject(settings) ? clone(settings) : {}
  const command = String((options && options.command) || '').trim()
  if (!command) throw new Error('hook command is required')
  if (!command.includes(EYPC_MARKER)) throw new Error('hook command must be identifiable by the eypc marker')
  const timeout = options && options.timeout
  source.version = 1
  const hooks = isPlainObject(source.hooks) ? source.hooks : {}
  for (const event of EYPC_HOOK_EVENTS) {
    const existing = Array.isArray(hooks[event]) ? hooks[event] : []
    const preserved = existing.filter((handler) => !isEypcHandler(handler))
    hooks[event] = [...preserved, eypcHandler(command, timeout)]
  }
  source.hooks = hooks
  return sanitizeHooks(source)
}

function withoutEypcHooks(settings) {
  const source = isPlainObject(settings) ? clone(settings) : {}
  if (!isPlainObject(source.hooks)) return source
  const hooks = source.hooks
  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue
    const preserved = hooks[event].filter((handler) => !isEypcHandler(handler))
    if (preserved.length) hooks[event] = preserved
    else delete hooks[event]
  }
  if (!Object.keys(hooks).length) delete source.hooks
  return sanitizeHooks(source)
}

function hookInstallState(settings, options) {
  const command = options && typeof options.command === 'string' ? options.command.trim() : ''
  const hooks = isPlainObject(settings) && isPlainObject(settings.hooks) ? settings.hooks : {}
  let installed = 0
  let matching = 0
  for (const event of EYPC_HOOK_EVENTS) {
    const handlers = Array.isArray(hooks[event]) ? hooks[event] : []
    const own = handlers.filter(isEypcHandler)
    if (!own.length) continue
    installed += 1
    if (!command) continue
    if (own.some((handler) => handlerCommand(handler) === command)) matching += 1
  }
  if (!installed) return 'missing'
  if (installed < EYPC_HOOK_EVENTS.length) return 'outdated'
  if (command && matching < EYPC_HOOK_EVENTS.length) return 'outdated'
  return 'installed'
}

module.exports = {
  EYPC_MARKER,
  EYPC_HOOK_EVENTS,
  withEypcHooks,
  withoutEypcHooks,
  hookInstallState
}
