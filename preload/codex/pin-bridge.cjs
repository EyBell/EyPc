'use strict'

const { join } = require('node:path')

/**
 * Codex pin lane: the Desktop sidebar "Pinned" section is an app-server
 * thread section with a fixed id (`thread_sections` seed row). A thread is
 * pinned exactly when `thread.section.id` equals it; the legacy
 * `pinned-thread-ids` mirror in `.codex-global-state.json` under-reports
 * (archived pins drop out) and is only a fallback for an app-server whose
 * `thread/list` rows carry no `section` field at all.
 *
 * A scoped observer publishes ordered evidence through the Host Kernel.
 * The outbound transaction uses the same publisher for native read-back.
 */

const CODEX_PIN_BRIDGE_REVISION = 'codex-pin-bridge-v1'
const CODEX_PINNED_SECTION_ID = '01984de2-8f74-7c91-a3b2-5c5e937cf318'
const CODEX_PIN_VERIFY_TIMEOUT_MS = 8_000
const CODEX_PIN_WAKE_DELAY_MS = 1_200
const CODEX_PIN_STATE_FILE = /^state_\d+\.sqlite(?:-wal)?$/
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
  if (section === null) return false
  const id = typeof section === 'string' ? section : record(section).id
  return typeof id === 'string' && id ? id.toLowerCase() === CODEX_PINNED_SECTION_ID : null
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
  const captureNativeTarget = dependencies.captureNativeTarget
  /** actionAlias -> { threadId, key, expiresAt }; the entry's alias table. */
  const threadActions = dependencies.threadActions || null
  const onCodexHostPinVerified = dependencies.onCodexHostPinVerified
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
        await requestCodexRpc('thread/section/move', params, undefined, input.isCurrent)
        if (input.isCurrent?.() === false) return { ok: false, code: 'stale-target' }
        return { ok: true, method: 'thread/section/move' }
      } catch (error) {
        if (!methodNotFound(error)) throw error
      }
      if (input.isCurrent?.() === false) return { ok: false, code: 'stale-target' }
      await requestCodexRpc('thread/metadata/update', { threadId: input.threadId, isPinned: input.pinned }, undefined, input.isCurrent)
      return { ok: true, method: 'thread/metadata/update' }
    },
    async verify(input) {
      const response = record(await requestCodexRpc(
        'thread/read',
        { threadId: input.threadId, includeTurns: false },
        CODEX_PIN_VERIFY_TIMEOUT_MS,
        input.isCurrent,
        { observeMembership: false }
      ))
      const thread = record(response.thread)
      return typeof thread.id === 'string' && thread.id.toLowerCase() === input.threadId
        ? codexThreadSectionPinned(thread) : null
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
   * confirm the section. Each thread's requests run in order through read-back.
   */
  async function setCodexThreadPin(input = {}) {
    const threadId = typeof input.threadId === 'string' ? input.threadId.toLowerCase() : ''
    const pinned = input.pinned === true
    if (!threadId) return { outcome: 'failed', errorCode: 'invalid-target', message: '任务身份无效' }
    const lane = input.codexhostExternal === true ? codexhostLane : appServerLane
    const queueKey = `${lane.id}:${threadId}`
    const previous = inFlight.get(queueKey) || Promise.resolve()
    const run = previous.then(async () => {
      const startedAt = now()
      if (input.isCurrent?.() === false) return { outcome: 'failed', errorCode: 'stale-target', message: '任务身份已失效' }
      note('pin-intent', 'started', input)
      try {
        const written = await lane.write({ threadId, pinned, isCurrent: input.isCurrent })
        if (!written || written.ok !== true) {
          const errorCode = written && typeof written.code === 'string' ? written.code : `${lane.id}-write-failed`
          note('pin-provider-write', 'failed', input, { code: errorCode, durationMs: now() - startedAt })
          return { outcome: 'failed', errorCode, message: (written && written.message) || lane.failureMessage }
        }
        const method = written.method
        note('pin-provider-write', 'completed', input, { method })
        let verified = null
        try {
          verified = await lane.verify({ threadId, isCurrent: input.isCurrent })
        } catch (error) {
          note('pin-server-verify', 'failed', input, { code: 'verify-read-failed', durationMs: now() - startedAt })
          return { outcome: 'indeterminate', method, providerPin: null, errorCode: 'verify-read-failed', message: '置顶已提交，但未能回读确认' }
        }
        if (verified === null || input.isCurrent?.() === false) {
          note('pin-server-verify', 'indeterminate', input, { method, durationMs: now() - startedAt })
          return { outcome: 'indeterminate', method, providerPin: null, errorCode: 'section-unavailable', message: '置顶已提交，但该版本未回报分区' }
        }
        input.onVerified?.(verified)
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
      }
    }).finally(() => {
      if (inFlight.get(queueKey) === run) inFlight.delete(queueKey)
    })
    inFlight.set(queueKey, run)
    return run
  }

  /**
   * Adapter entry: resolves the Companion action alias to a thread, picks the
   * lane and submits the provider's verified result.
   */
  async function setCompanionPin(actionAlias, request = {}) {
    const entry = typeof actionAlias === 'string' && threadActions ? threadActions.get(actionAlias) : null
    const threadId = entry && typeof entry.threadId === 'string' ? entry.threadId : ''
    if (!threadId || (Number.isFinite(entry.expiresAt) && entry.expiresAt <= now())) {
      return { outcome: 'failed', errorCode: 'expired-alias', message: '任务动作已过期，请刷新后重试' }
    }
    const external = entry.codexhostExternal === true || codexhostDiscovery?.isExternalThreadId?.(threadId) === true
    const nativeTarget = external ? null : captureNativeTarget?.(threadId)
    if (!external && !nativeTarget) {
      return { outcome: 'failed', errorCode: 'stale-target', message: '任务身份已失效' }
    }
    const result = await setCodexThreadPin({
      threadId,
      pinned: request.pinned === true,
      codexhostExternal: external,
      taskRef: typeof request.taskRef === 'string' ? request.taskRef : entry.key,
      source: request.source,
      isCurrent: nativeTarget?.isCurrent,
      onVerified: nativeTarget?.commit
    })
    if (result.outcome !== 'completed' && typeof result.providerPin !== 'boolean') nativeTarget?.refresh()
    if (result.outcome === 'completed' && external) {
      try { onCodexHostPinVerified?.(threadId, result.providerPin === true) } catch {}
    }
    return result
  }

  return {
    revision: CODEX_PIN_BRIDGE_REVISION,
    setCompanionPin
  }
}

function createCodexNativePinObserver({
  getScope, isScopeCurrent, getCoverage, isCurrentMember, threadKey, readSection, confirmSection, readMirror, commit, report = () => {},
  schedule = setTimeout, cancel = clearTimeout, now = Date.now
}) {
  let generation = 0
  let source = null
  let inFlight = false
  let pending = null
  let timer = null

  function current(state) {
    return Boolean(state && source === state && isScopeCurrent(state.scope))
  }

  function bind() {
    if (source && current(source)) return source
    const scope = getScope()
    const previous = source
    source = scope ? { scope, generation: ++generation, revision: 0, fence: 0, authority: '' } : null
    if (previous && source) submit(source, { kind: 'reset' })
    return source
  }

  function submit(state, evidence, revision = ++state.revision) {
    if (!current(state)) return null
    return commit({ ...evidence, epoch: state.scope.providerEpoch, generation: state.generation, revision })
  }

  function arm(delay = 100) {
    if (timer !== null || inFlight || !pending) return
    timer = schedule(() => {
      timer = null
      void read()
    }, delay)
    timer?.unref?.()
  }

  function request(reason, { fence = true } = {}) {
    const state = bind()
    if (!state) return false
    if (fence) state.fence += 1
    pending = { state, reason, retry: true }
    arm()
    return true
  }

  async function read() {
    const work = pending
    pending = null
    if (!work || !current(work.state)) return
    const { state, reason } = work
    const startedAt = now()
    const revision = ++state.revision
    const fence = state.fence
    const coverage = getCoverage()
    const stillCurrent = () => current(state) && state.fence === fence
    inFlight = true
    try {
      let ids
      const deadline = startedAt + CODEX_PIN_VERIFY_TIMEOUT_MS
      if (state.authority === 'legacy-mirror') {
        ids = await readMirror()
        if (!Array.isArray(ids)) throw new Error('invalid-pin-mirror')
      } else {
        const rows = await readSection(stillCurrent, deadline)
        if (!Array.isArray(rows) || !rows.every((row) => codexThreadSectionPinned(row) === true)) {
          throw new Error('invalid-pinned-section')
        }
        if (!rows.length && state.authority !== 'app-server'
          && !await confirmSection(stillCurrent, deadline)) throw new Error('unverified-pinned-section')
        if (!stillCurrent()) return
        state.authority = 'app-server'
        ids = rows.map((row) => row.id)
      }
      if (!stillCurrent()) return
      const result = submit(state, {
        kind: 'complete', authority: state.authority, coverage,
        orderedKeys: [...new Set(ids.map(threadKey))]
      }, revision)
      report({ outcome: 'verified', reason, count: ids.length, generation: state.generation, revision, durationMs: now() - startedAt,
        packageRevision: result?.packageRevision })
    } catch {
      if (!stillCurrent()) return
      submit(state, { kind: 'verifying', coverage }, revision)
      report({ outcome: 'verifying', reason, generation: state.generation, revision, durationMs: now() - startedAt })
      if (work.retry && !pending) pending = { ...work, retry: false }
    } finally {
      inFlight = false
      arm(pending?.retry === false ? 500 : 100)
    }
  }

  function observeProtocol(rows) {
    const state = bind()
    if (!state || !rows.length) return
    const authority = rows.some((row) => codexThreadSectionPinned(row) !== null) ? 'app-server'
      : rows.every((row) => !Object.hasOwn(record(row), 'section')) ? 'legacy-mirror' : ''
    if (!authority || state.authority === 'app-server' || authority === state.authority) return
    state.authority = authority
    request('section-capability')
  }

  function captureTarget(threadId) {
    const state = bind()
    const key = threadKey(threadId)
    const member = getCoverage().get(key)
    if (!state || !member) return null
    const coverage = new Map([[key, member]])
    const isCurrent = () => current(state) && isCurrentMember(key, member)
    return {
      isCurrent,
      commit(pinned) {
        if (!isCurrent()) return
        state.authority = 'app-server'
        state.fence += 1
        submit(state, { kind: 'target', authority: state.authority, coverage, pinned })
        request('write-verified', { fence: false })
      },
      refresh() {
        if (!isCurrent()) return
        submit(state, { kind: 'verifying', coverage })
        request('write-unconfirmed')
      }
    }
  }

  function reset() {
    pending = null
    if (timer !== null) cancel(timer)
    timer = null
    if (!source) return
    source = null
    const next = bind()
    if (next) submit(next, { kind: 'reset' })
  }

  return { request, observeProtocol, captureTarget, reset }
}

async function confirmCodexPinnedSection(request, isCurrent, deadlineAt) {
  const seen = new Set()
  let cursor = null
  for (let pageIndex = 0; pageIndex < 5 && isCurrent(); pageIndex += 1) {
    const timeout = deadlineAt - Date.now()
    if (timeout <= 0) return false
    const page = record(await request('threadSection/list', { limit: 100, cursor }, timeout, isCurrent))
    if (!isCurrent() || !Array.isArray(page.data)) return false
    if (page.data.some((section) => record(section).id === CODEX_PINNED_SECTION_ID)) return true
    cursor = page.nextCursor
    if (typeof cursor !== 'string' || !cursor.trim() || seen.has(cursor)) return false
    seen.add(cursor)
  }
  return false
}

function createCodexPinStateWatcher({ watch, readDirectory, onChange, schedule = setTimeout, cancel = clearTimeout }) {
  const activeDirectories = new Map()
  const watchers = new Map()
  let timer = null

  function wake() {
    if (timer !== null) return
    timer = schedule(() => {
      timer = null
      onChange()
    }, CODEX_PIN_WAKE_DELAY_MS)
    timer?.unref?.()
  }

  function close(target) {
    const watcher = watchers.get(target)
    watchers.delete(target)
    try { watcher?.close() } catch {}
  }

  function listen(target, receive) {
    if (watchers.has(target)) return
    try {
      const watcher = watch(target, { persistent: false }, (event, filename) => {
        if (watchers.get(target) === watcher) receive(event, filename)
      })
      watchers.set(target, watcher)
      watcher.on?.('error', () => {
        if (watchers.get(target) === watcher) close(target)
      })
    } catch {}
  }

  function refreshFiles(directory) {
    const previous = activeDirectories.get(directory)
    if (!previous) return
    let files
    try {
      files = new Set(readDirectory(directory).filter(name => CODEX_PIN_STATE_FILE.test(name)).map(name => join(directory, name)))
    } catch { return }
    for (const file of previous) if (!files.has(file)) close(file)
    activeDirectories.set(directory, files)
    for (const file of files) {
      listen(file, (event) => {
        if (event === 'rename') {
          close(file)
          refreshFiles(directory)
        }
        wake()
      })
    }
  }

  function update(directories) {
    const targets = new Set(directories.filter(Boolean))
    for (const [directory, files] of activeDirectories) {
      if (targets.has(directory)) continue
      close(directory)
      for (const file of files) close(file)
      activeDirectories.delete(directory)
    }
    for (const directory of targets) {
      const files = activeDirectories.get(directory)
      const needsDiscovery = !files || !watchers.has(directory) || [...files].some(file => !watchers.has(file))
      if (!files) activeDirectories.set(directory, new Set())
      listen(directory, (event, filename) => {
        const name = filename ? String(filename) : ''
        if (name && !CODEX_PIN_STATE_FILE.test(name)) return
        const file = name ? join(directory, name) : ''
        if (file && event === 'rename') close(file)
        if (!file || !watchers.has(file)) refreshFiles(directory)
        wake()
      })
      if (needsDiscovery) refreshFiles(directory)
    }
    if (!watchers.size && timer !== null) {
      cancel(timer)
      timer = null
    }
  }

  return { update }
}

module.exports = {
  CODEX_PIN_BRIDGE_REVISION,
  CODEX_PINNED_SECTION_ID,
  codexThreadSectionPinned,
  createCodexPinBridge,
  createCodexNativePinObserver,
  confirmCodexPinnedSection,
  createCodexPinStateWatcher
}

function codexhostPinFields(row) {
  const thread = record(row)
  return typeof thread.codexhostPinned === 'boolean'
    ? { nativePinned: thread.codexhostPinned, nativePinLane: 'codexhost' }
    : { nativePinned: false, nativePinLane: '' }
}

module.exports.codexhostPinFields = codexhostPinFields

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
