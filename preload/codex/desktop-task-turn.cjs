'use strict'

const METHOD = 'thread-follower-start-turn'
const TIMEOUT_MS = 45_000
const PRE_DISPATCH_ERRORS = new Set(['no-client-found', 'client-not-found', 'request-version-mismatch', 'no-handler-for-request'])

function createCodexDesktopTaskTurn(dependencies = {}) {
  if (typeof dependencies.getBridge !== 'function') throw new TypeError('desktop task turn requires getBridge')
  const crypto = dependencies.crypto || require('node:crypto')
  const startTimer = dependencies.setTimeout || dependencies.timers?.setTimeout || setTimeout
  const stopTimer = dependencies.clearTimeout || dependencies.timers?.clearTimeout || clearTimeout
  const pending = new Map()
  const threads = new Map()

  function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  }

  function identity(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 512
  }

  function failure(code, indeterminate = false) {
    const error = new Error(code)
    error.code = code
    error.indeterminate = indeterminate
    return error
  }

  function owner(threadId) {
    if (!identity(threadId)) return null
    let bridge
    try { bridge = dependencies.getBridge() } catch { return null }
    if (!bridge || bridge.closed || bridge.state !== 'connected' || !bridge.socket?.writable
      || bridge.socket.destroyed || typeof bridge.send !== 'function'
      || !identity(bridge.clientId) || bridge.clientId === 'initializing-client') return null
    const shadow = bridge.shadows?.get(threadId) || bridge.sideShadows?.get(threadId)
    if (!shadow || shadow.ownerDisconnectedAt || !identity(shadow.ownerClientId)
      || shadow.ownerClientId === bridge.clientId || shadow.ownerClientId === 'desktop-live') return null
    return { bridge, socket: bridge.socket, clientId: bridge.clientId, ownerClientId: shadow.ownerClientId }
  }

  function canStart(threadId) {
    return owner(threadId) !== null
  }

  function current(entry) {
    const available = owner(entry.threadId)
    return available && available.bridge === entry.bridge && available.socket === entry.socket
      && available.clientId === entry.clientId && available.ownerClientId === entry.ownerClientId
  }

  function finish(entry, error, result) {
    if (pending.get(entry.requestId) !== entry) return
    pending.delete(entry.requestId)
    stopTimer(entry.timer)
    if (error?.indeterminate) threads.set(entry.threadId, { indeterminate: true })
    else threads.delete(entry.threadId)
    if (error) entry.reject(error)
    else entry.resolve(result)
  }

  async function startTurn(threadId, options = {}) {
    const existing = threads.get(threadId)
    if (existing) throw failure(existing.indeterminate ? 'process-exited' : 'desktop-turn-rejected', existing.indeterminate === true)
    const available = owner(threadId)
    if (!available) throw failure('desktop-owner-unavailable')
    let request
    let requestId
    try {
      if (!record(options) || !Array.isArray(options.input) || options.input.length === 0
        || !options.input.every(record)) throw failure('desktop-send-failed')
      const mode = options.collaborationMode
      if (mode !== undefined && (!record(mode) || !['default', 'plan'].includes(mode.mode)
        || !record(mode.settings) || !identity(mode.settings.model))) throw failure('desktop-send-failed')
      request = JSON.parse(JSON.stringify({ threadId, input: options.input,
        ...(mode === undefined ? {} : { collaborationMode: mode }) }))
      request.input = request.input.map((item) => {
        if (item.type !== 'text') return item
        if (typeof item.text !== 'string'
          || item.text_elements !== undefined && !Array.isArray(item.text_elements)) throw failure('desktop-send-failed')
        return { ...item, text_elements: item.text_elements ?? [] }
      })
      requestId = crypto.randomUUID()
      if (!identity(requestId) || pending.has(requestId)) throw failure('desktop-send-failed')
    } catch { throw failure('desktop-send-failed') }
    return new Promise((resolve, reject) => {
      const entry = { ...available, threadId, requestId, resolve, reject, timer: null }
      pending.set(requestId, entry)
      threads.set(threadId, entry)
      try {
        entry.timer = startTimer(() => finish(entry, failure('timeout', true)), TIMEOUT_MS)
        entry.timer?.unref?.()
      } catch {
        finish(entry, failure('desktop-send-failed'))
        return
      }
      if (!current(entry)) {
        finish(entry, failure('desktop-owner-unavailable'))
        return
      }
      const message = { type: 'request', requestId, sourceClientId: entry.clientId,
        targetClientId: entry.ownerClientId, method: METHOD, version: 2, timeoutMs: TIMEOUT_MS,
        params: { conversationId: threadId, turnStart: { request, context: { inheritThreadSettings: true } } } }
      try {
        const sent = entry.bridge.send(message, (error) => {
          if (error) finish(entry, failure('process-exited', true))
        })
        if (sent !== true) finish(entry, failure('desktop-send-failed'))
      } catch { finish(entry, failure('process-exited', true)) }
    })
  }

  function handleMessage(message) {
    if (!record(message) || message.type !== 'response') return false
    const entry = pending.get(message.requestId)
    if (!entry) return false
    if (!current(entry)) {
      finish(entry, failure('process-exited', true))
      return true
    }
    if (message.method !== undefined && message.method !== METHOD
      || message.handledByClientId !== undefined && message.handledByClientId !== entry.ownerClientId
      || message.sourceClientId !== undefined && message.sourceClientId !== entry.ownerClientId
      || message.targetClientId !== undefined && message.targetClientId !== entry.clientId
      || message.hostId !== undefined || message.version !== undefined && message.version !== 2) return true
    if (message.resultType === 'error') {
      finish(entry, PRE_DISPATCH_ERRORS.has(message.error)
        ? failure('desktop-turn-rejected') : failure('process-exited', true))
      return true
    }
    if (message.resultType !== 'success' || message.method !== METHOD
      || message.handledByClientId !== entry.ownerClientId || !record(message.result)
      || message.result.method !== METHOD || !record(message.result.result)
      || !record(message.result.result.result) || !record(message.result.result.result.turn)
      || !identity(message.result.result.result.turn.id)) {
      finish(entry, failure('process-exited', true))
      return true
    }
    finish(entry, null, message.result.result.result)
    return true
  }

  function clear() {
    for (const entry of pending.values()) finish(entry, failure('process-exited', true))
  }

  function confirmStarted(threadId) {
    if (threads.get(threadId)?.indeterminate !== true) return false
    return threads.delete(threadId)
  }

  return { canStart, startTurn, handleMessage, clear, confirmStarted }
}

module.exports = { createCodexDesktopTaskTurn }
