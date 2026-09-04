'use strict'

/**
 * Codex pin lane: the Desktop sidebar "Pinned" section is an app-server
 * thread section with a fixed id (`thread_sections` seed row). A thread is
 * pinned exactly when `thread.section.id` equals it; the legacy
 * `pinned-thread-ids` mirror in `.codex-global-state.json` under-reports
 * (archived pins drop out) and is only a fallback for an app-server whose
 * `thread/list` rows carry no `section` field at all.
 *
 * Reading is pure. The outbound transaction (`createCodexPinBridge`) is
 * injected with the entry's RPC and diagnostics on the archive-bridge
 * precedent so this module never reaches for a global.
 */

const CODEX_PIN_BRIDGE_REVISION = 'codex-pin-bridge-v1'
const CODEX_PINNED_SECTION_ID = '01984de2-8f74-7c91-a3b2-5c5e937cf318'
const CODEX_PIN_VERIFY_TIMEOUT_MS = 8_000
const JSON_RPC_METHOD_NOT_FOUND = -32601

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/**
 * `true` / `false` when the row states its section; `null` when the row has
 * no `section` key (an older app-server), so the caller may fall back to the
 * global-state mirror instead of reading "absent" as "unpinned".
 */
function codexThreadSectionPinned(row) {
  const thread = record(row)
  if (!Object.prototype.hasOwnProperty.call(thread, 'section')) return null
  const section = thread.section
  if (section === null || section === undefined) return false
  const id = typeof section === 'string' ? section : record(section).id
  return typeof id === 'string' && id.toLowerCase() === CODEX_PINNED_SECTION_ID
}

function rpcErrorCode(error) {
  const source = record(error)
  const nested = record(source.error)
  const code = Number.isInteger(source.rpcCode) ? source.rpcCode
    : Number.isInteger(nested.code) ? nested.code
      : Number.isInteger(source.code) ? source.code : null
  return code
}

function methodNotFound(error) {
  if (rpcErrorCode(error) === JSON_RPC_METHOD_NOT_FOUND) return true
  const message = typeof record(error).message === 'string' ? record(error).message : String(error || '')
  return /method not found|unknown method|unsupported method/i.test(message)
}

function createCodexPinBridge(dependencies = {}) {
  const requestCodexRpc = dependencies.requestCodexRpc
  const recordDiagnostic = typeof dependencies.record === 'function' ? dependencies.record : () => {}
  const codexhostDiscovery = dependencies.codexhostDiscovery || null
  const now = typeof dependencies.now === 'function' ? dependencies.now : () => Date.now()
  /** actionAlias -> { threadId, key, expiresAt }; the entry's alias table. */
  const threadActions = dependencies.threadActions || null
  /** Called with (threadId, pinned, lane) after a verified write so cached rows stay ahead of the next scan. */
  const onProviderPinVerified = typeof dependencies.onProviderPinVerified === 'function' ? dependencies.onProviderPinVerified : null
  if (typeof requestCodexRpc !== 'function') {
    throw new TypeError('codex pin bridge requires requestCodexRpc')
  }
  const inFlight = new Map()

  function note(event, outcome, input, extra = {}) {
    try {
      recordDiagnostic({
        level: outcome === 'failed' ? 'warn' : 'info',
        scope: 'pin-transaction',
        event,
        outcome,
        provider: 'codex',
        ...(input.taskRef ? { taskRef: input.taskRef } : {}),
        ...(input.source ? { source: input.source } : {}),
        lane: input.codexhostExternal === true ? 'codexhost' : 'app-server',
        pinned: input.pinned === true,
        ...extra
      })
    } catch {}
  }

  /**
   * Two lanes, one transaction. A lane answers `write(input)` with the method
   * it used (or throws / returns `{ ok: false }`) and `verify(input)` with the
   * provider's current pin state (`null` = the provider could not say).
   */
  const appServerLane = {
    id: 'app-server',
    async write(input) {
      const params = {
        threadId: input.threadId,
        sectionId: input.pinned ? CODEX_PINNED_SECTION_ID : null,
        beforeThreadId: null
      }
      try {
        await requestCodexRpc('thread/section/move', params)
        return { ok: true, method: 'thread/section/move' }
      } catch (error) {
        if (!methodNotFound(error)) throw error
      }
      await requestCodexRpc('thread/metadata/update', { threadId: input.threadId, isPinned: input.pinned })
      return { ok: true, method: 'thread/metadata/update' }
    },
    async verify(input) {
      const response = record(await requestCodexRpc(
        'thread/read',
        { threadId: input.threadId, includeTurns: false },
        CODEX_PIN_VERIFY_TIMEOUT_MS
      ))
      return codexThreadSectionPinned(record(response.thread))
    },
    failureMessage: 'Codex 置顶写入失败'
  }

  const codexhostLane = {
    id: 'codexhost',
    async write(input) {
      if (!codexhostDiscovery || typeof codexhostDiscovery.codexhostPinThread !== 'function') {
        return { ok: false, code: 'unsupported', message: 'CodexHost 置顶通道不可用' }
      }
      const written = await codexhostDiscovery.codexhostPinThread(input.threadId, input.pinned)
      return written && written.ok === true
        ? { ok: true, method: 'codexhost thread pin' }
        : { ok: false, code: written && typeof written.code === 'string' ? written.code : 'codexhost-write-failed', message: written && written.message }
    },
    async verify(input) {
      if (!codexhostDiscovery || typeof codexhostDiscovery.codexhostPinState !== 'function') return null
      const state = await codexhostDiscovery.codexhostPinState(input.threadId)
      return state && state.ok && typeof state.pinned === 'boolean' ? state.pinned : null
    },
    failureMessage: 'CodexHost 置顶写入失败'
  }

  /**
   * Pin or unpin one Codex thread at the provider. Result shape:
   * `{ outcome: 'completed' | 'failed' | 'indeterminate', providerPin, method?, errorCode?, message? }`.
   * `indeterminate` means the write was accepted but the read-back could not
   * confirm the section — the caller keeps its local pin and says so. One
   * transaction per thread at a time: a pin racing an unpin of the same thread
   * joins the first instead of interleaving two verify windows.
   */
  async function setCodexThreadPin(input = {}) {
    const threadId = typeof input.threadId === 'string' ? input.threadId.toLowerCase() : ''
    const pinned = input.pinned === true
    if (!threadId) return { outcome: 'failed', errorCode: 'invalid-target', message: '任务身份无效' }
    const lane = input.codexhostExternal === true ? codexhostLane : appServerLane
    if (inFlight.has(threadId)) return inFlight.get(threadId)
    const startedAt = now()
    const run = (async () => {
      note('pin-intent', 'started', input)
      try {
        const written = await lane.write({ threadId, pinned })
        if (!written || written.ok !== true) {
          const errorCode = written && typeof written.code === 'string' ? written.code : `${lane.id}-write-failed`
          note('pin-provider-write', 'failed', input, { code: errorCode, durationMs: now() - startedAt })
          return { outcome: 'failed', errorCode, message: (written && written.message) || lane.failureMessage }
        }
        const method = written.method
        note('pin-provider-write', 'completed', input, { method })
        let verified = null
        try {
          verified = await lane.verify({ threadId })
        } catch (error) {
          note('pin-server-verify', 'failed', input, { code: 'verify-read-failed', durationMs: now() - startedAt })
          return { outcome: 'indeterminate', method, providerPin: null, errorCode: 'verify-read-failed', message: '置顶已提交，但未能回读确认' }
        }
        if (verified === null) {
          note('pin-server-verify', 'indeterminate', input, { method, durationMs: now() - startedAt })
          return { outcome: 'indeterminate', method, providerPin: null, errorCode: 'section-unavailable', message: '置顶已提交，但该版本未回报分区' }
        }
        if (verified !== pinned) {
          note('pin-server-verify', 'failed', input, { method, code: 'section-mismatch', durationMs: now() - startedAt })
          return { outcome: 'failed', method, providerPin: verified, errorCode: 'section-mismatch', message: '置顶写入后回读不一致' }
        }
        note('pin-server-verify', 'verified', input, { method, durationMs: now() - startedAt })
        return { outcome: 'completed', method, providerPin: verified }
      } catch (error) {
        const code = rpcErrorCode(error)
        const message = error && typeof error.message === 'string' ? error.message.slice(0, 200) : lane.failureMessage
        note('pin-provider-write', 'failed', input, {
          code: code === null ? 'rpc-failed' : `rpc-${code}`,
          durationMs: now() - startedAt
        })
        return { outcome: 'failed', errorCode: code === null ? 'rpc-failed' : `rpc-${code}`, message }
      } finally {
        inFlight.delete(threadId)
      }
    })()
    inFlight.set(threadId, run)
    return run
  }

  /**
   * Adapter entry: resolves the Companion action alias to a thread, picks the
   * lane (Host CLI for extra processes, app-server otherwise), writes, and
   * hands a verified value to the entry's cache so the next draft rebuild
   * does not flash the old pin before the scan catches up.
   */
  async function setCompanionPin(actionAlias, request = {}) {
    const entry = typeof actionAlias === 'string' && threadActions ? threadActions.get(actionAlias) : null
    const threadId = entry && typeof entry.threadId === 'string' ? entry.threadId : ''
    if (!threadId || (Number.isFinite(entry.expiresAt) && entry.expiresAt <= now())) {
      return { outcome: 'failed', errorCode: 'expired-alias', message: '任务动作已过期，请刷新后重试' }
    }
    const external = codexhostDiscovery?.isExternalThreadId?.(threadId) === true
    const result = await setCodexThreadPin({
      threadId,
      pinned: request.pinned === true,
      codexhostExternal: external,
      taskRef: typeof request.taskRef === 'string' ? request.taskRef : entry.key,
      source: request.source
    })
    if (result.outcome === 'completed' && onProviderPinVerified) {
      try { onProviderPinVerified(threadId, result.providerPin === true, external ? 'codexhost' : 'app-server') } catch {}
    }
    return result
  }

  return {
    revision: CODEX_PIN_BRIDGE_REVISION,
    setCodexThreadPin,
    setCompanionPin
  }
}

module.exports = {
  CODEX_PIN_BRIDGE_REVISION,
  CODEX_PINNED_SECTION_ID,
  codexThreadSectionPinned,
  createCodexPinBridge
}

/**
 * Native pin fields for one sanitized Codex inventory row. Authority order:
 * CodexHost `pinned` for extra-process rows, the app-server `section` for
 * native rows, then the global-state mirror only when the row carries no
 * `section` key. `nativePinLane` is `''` when no source can speak for the
 * row, which the evidence lane reports as `providerPin: null`.
 */
function codexThreadNativePinFields(row, mirrorOrder) {
  const thread = record(row)
  const mirror = mirrorOrder instanceof Map ? mirrorOrder : new Map()
  if (thread.codexhostExternal === true) {
    return typeof thread.codexhostPinned === 'boolean'
      ? { nativePinned: thread.codexhostPinned, nativePinLane: 'codexhost' }
      : { nativePinned: false, nativePinLane: '' }
  }
  const sectionPinned = codexThreadSectionPinned(thread)
  const id = typeof thread.id === 'string' ? thread.id : ''
  if (sectionPinned !== null) {
    return {
      nativePinned: sectionPinned,
      nativePinLane: 'app-server',
      ...(sectionPinned && mirror.has(id) ? { nativePinnedOrder: mirror.get(id) } : {})
    }
  }
  const mirrored = mirror.has(id)
  return {
    nativePinned: mirrored,
    nativePinLane: 'mirror',
    ...(mirrored ? { nativePinnedOrder: mirror.get(id) } : {})
  }
}

module.exports.codexThreadNativePinFields = codexThreadNativePinFields

/**
 * Provider pin evidence triple shared by every producer. `pinned` must be a
 * boolean to claim a lane; anything else reports `providerPin: null` with an
 * empty authority, which the Kernel reads as "no pin lane", never "unpinned".
 * `order` wins over `fallbackOrder` only when it is an integer.
 */
function providerPinFields(input = {}) {
  const source = record(input)
  const hasLane = typeof source.pinned === 'boolean'
  return {
    providerPin: hasLane ? source.pinned : null,
    providerPinOrder: Number.isInteger(source.order) ? source.order : source.fallbackOrder,
    providerPinAuthority: hasLane && typeof source.authority === 'string' ? source.authority : ''
  }
}

module.exports.providerPinFields = providerPinFields
