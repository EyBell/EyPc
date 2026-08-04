'use strict'

const { createNativeWindowCommandRunner } = require('./native-command.cjs')
const { createWindowSessionCache } = require('./session-cache.cjs')
const { createMacosSpaceBridge } = require('./macos-space.cjs')
const { createMacosWindowPlatform } = require('./macos.cjs')
const { createWin32WindowPlatform } = require('./win32.cjs')

const WINDOW_BRIDGE_REVISION = 'wj22-native-instance-space-cache'
const WINDOW_OPERATION_TRACE_STAGES = new Set(['bridge', 'space', 'target', 'process', 'restore', 'foreground', 'raise', 'verify', 'topmost'])
const WINDOW_OPERATION_TRACE_OUTCOMES = new Set(['ok', 'skipped', 'not-found', 'ambiguous', 'failed', 'denied', 'unsupported', 'unavailable'])
const WINDOW_OPERATION_TRACE_DETAILS = new Set([
  'instance-match', 'instance-mismatch', 'identity-unavailable', 'focus-state-mismatch', 'error',
  'root-family-match', 'ax-cg-id-match', 'ax-focused-root-window', 'session-cache',
  'direct-space-binding', 'reverse-space-binding', 'space-switch-confirmed'
])
const WINDOW_ACTIVATION_REASON_CODES = new Set([
  'space-unbound', 'space-unbound-multiwindow', 'space-ambiguous', 'space-switch-timeout',
  'instance-mismatch', 'member-mismatch', 'identity-unavailable'
])

function uniqueWindowTexts(values) {
  return [...new Set((Array.isArray(values) ? values : []).flatMap((value) => typeof value === 'string' && value.trim() ? [value.trim()] : []))]
}

function parseWindowJson(output, platform) {
  let parsed
  try { parsed = JSON.parse(String(output || '').trim() || '[]') } catch { return { windows: [], permissionDenied: false, identityCorroborationMissing: false, screenRecordingLikelyMissing: false } }
  const envelope = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.windows)
    ? parsed
    : { windows: Array.isArray(parsed) ? parsed : [parsed], screenRecordingLikelyMissing: false }
  const rows = Array.isArray(envelope.windows) ? envelope.windows : []
  const observations = rows.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const nativeRef = String(item.nativeRef || '').trim()
    const instanceId = String(item.instanceId || '').trim()
    const pid = Math.trunc(Number(item.pid))
    const appId = String(item.appId || item.appName || '').trim()
    const appName = String(item.appName || appId || '').trim()
    const title = String(item.title || '').trim()
    if (!nativeRef || !instanceId || !Number.isInteger(pid) || pid <= 0 || !appId) return []
    const rootInstanceId = String(item.rootInstanceId || '').trim() || instanceId
    const rootNativeRef = String(item.rootNativeRef || '').trim() || nativeRef
    const relationship = item.relationship === 'child' ? 'child' : 'root'
    const relationEvidence = String(item.relationEvidence || '')
    const expectedChildEvidence = platform === 'win32' ? 'win32-root-owner' : 'macos-ax-top-level'
    if (relationship === 'child' && (rootInstanceId === instanceId || rootNativeRef === nativeRef || relationEvidence !== expectedChildEvidence)) return []
    if (relationship === 'root' && (rootInstanceId !== instanceId || rootNativeRef !== nativeRef || relationEvidence !== 'root-self')) return []
    return [{
      id: instanceId,
      instanceId,
      nativeRef,
      pid,
      appId,
      appName,
      title: title || appName,
      minimized: item.minimized === true,
      focused: item.focused === true,
      rootInstanceId,
      rootNativeRef,
      rootPid: Math.trunc(Number(item.rootPid || pid)),
      relationship,
      relationEvidence,
      userVisible: item.userVisible !== false,
      canActivate: item.canActivate !== false,
      canClose: item.canClose === true,
      memberInstanceIds: uniqueWindowTexts(item.memberInstanceIds),
      memberNativeRefs: uniqueWindowTexts(item.memberNativeRefs),
      searchTitles: uniqueWindowTexts(item.searchTitles),
      platform
    }]
  })
  return {
    windows: observations,
    permissionDenied: envelope.permissionDenied === true,
    identityCorroborationMissing: envelope.identityCorroborationMissing === true,
    screenRecordingLikelyMissing: envelope.screenRecordingLikelyMissing === true
  }
}

function createWindowProtocol(hostPlatform) {
  function capability(permission = 'unknown', reason = '', extras = {}) {
    if (hostPlatform === 'win32') {
      return { platform: 'win32', bridgeRevision: WINDOW_BRIDGE_REVISION, supported: true, permission: 'granted', canList: true, canActivate: true, canClose: true, canAlwaysOnTop: true, ...(reason ? { reason } : {}), ...extras }
    }
    if (hostPlatform === 'darwin') {
      return { platform: 'darwin', bridgeRevision: WINDOW_BRIDGE_REVISION, supported: true, permission, canList: permission !== 'required', canActivate: permission !== 'required', canClose: permission !== 'required', canAlwaysOnTop: false, ...(reason ? { reason } : {}), ...extras }
    }
    return { platform: 'unsupported', bridgeRevision: WINDOW_BRIDGE_REVISION, supported: false, permission: 'unsupported', canList: false, canActivate: false, canClose: false, canAlwaysOnTop: false, reason: reason || '当前系统不支持窗口跳转', ...extras }
  }

  function debugTraceRequested(options) {
    return Boolean(options && typeof options === 'object' && options.debugTrace === true)
  }

  function optionalTrace(debugTrace, steps) {
    return debugTrace ? { trace: { steps } } : {}
  }

  function parseOperationTrace(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.trace)) return undefined
    const steps = []
    for (const step of value.trace.slice(0, 16)) {
      const stage = step && typeof step === 'object' ? String(step.stage || '') : ''
      const outcome = step && typeof step === 'object' ? String(step.outcome || '') : ''
      const detail = step && typeof step === 'object' ? String(step.detail || '') : ''
      if (!WINDOW_OPERATION_TRACE_STAGES.has(stage) || !WINDOW_OPERATION_TRACE_OUTCOMES.has(outcome)) continue
      steps.push(WINDOW_OPERATION_TRACE_DETAILS.has(detail) ? { stage, outcome, detail } : { stage, outcome })
    }
    return steps.length ? { steps } : undefined
  }

  function parseActivationResult(output, fallback = 'failed') {
    try {
      const value = JSON.parse(String(output || '').trim() || '{}')
      const outcome = String(value && value.outcome || '')
      if (['activated', 'not-found', 'ambiguous', 'focus-denied', 'permission-required', 'unsupported', 'failed'].includes(outcome)) {
        const trace = parseOperationTrace(value)
        const reasonCode = String(value && value.reasonCode || '')
        const instanceId = String(value && value.instanceId || '').trim()
        const memberInstanceId = String(value && value.memberInstanceId || '').trim()
        return { outcome, ...(instanceId ? { instanceId } : {}), ...(memberInstanceId ? { memberInstanceId } : {}), ...(WINDOW_ACTIVATION_REASON_CODES.has(reasonCode) ? { reasonCode } : {}), ...(trace ? { trace } : {}) }
      }
    } catch {}
    return { outcome: fallback }
  }

  function parseLifecycleResult(output, fallback = 'failed') {
    try {
      const value = JSON.parse(String(output || '').trim() || '{}')
      const outcome = String(value && value.outcome || '')
      if (['closed', 'terminated', 'close-denied', 'not-found', 'ambiguous', 'permission-required', 'unsupported', 'failed'].includes(outcome)) {
        return { outcome, ...(typeof value.message === 'string' && value.message ? { message: value.message } : {}) }
      }
    } catch {}
    return { outcome: fallback }
  }

  function mergeActivationTrace(result, prefixTrace) {
    const prefix = prefixTrace && Array.isArray(prefixTrace.steps) ? prefixTrace.steps : []
    const suffix = result && result.trace && Array.isArray(result.trace.steps) ? result.trace.steps : []
    if (!prefix.length && !suffix.length) return result
    return { ...result, trace: { steps: [...prefix, ...suffix].slice(0, 16) } }
  }

  return {
    capability,
    debugTraceRequested,
    optionalTrace,
    parseWindowJson,
    parseActivationResult,
    parseLifecycleResult,
    mergeActivationTrace
  }
}

function createWindowSubsystem(options = {}) {
  const hostPlatform = options.platform || process.platform
  const processApi = options.process && typeof options.process === 'object' ? options.process : process
  const globalApi = options.globalThis && typeof options.globalThis === 'object' ? options.globalThis : globalThis
  const nativeRun = createNativeWindowCommandRunner({
    execFile: options.execFile,
    timeoutMs: options.timeoutMs,
    outputLimit: options.outputLimit
  })
  const cache = createWindowSessionCache({ now: options.now })
  const protocol = createWindowProtocol(hostPlatform)

  function runNativeCommand(command, args, debugTrace = false, extraEnvironment = null) {
    const environment = {
      ...(debugTrace ? { EYPC_WINDOW_DEBUG_TRACE: '1' } : {}),
      ...(extraEnvironment && typeof extraEnvironment === 'object' ? extraEnvironment : {})
    }
    return nativeRun(command, args, { environment })
  }

  const macosSpace = createMacosSpaceBridge({ run: nativeRun, cache })
  const macos = createMacosWindowPlatform({ cache, spaceBridge: macosSpace, run: runNativeCommand, process: processApi, globalThis: globalApi, protocol })
  const win32 = createWin32WindowPlatform({ run: runNativeCommand, cache, process: processApi, protocol })
  const platform = hostPlatform === 'darwin' ? macos : hostPlatform === 'win32' ? win32 : null

  function platformFor(window) {
    return window && window.platform === 'win32' ? win32 : macos
  }

  function observeInventory(windows) {
    macos.observeInventory(windows)
    win32.observeInventory(windows)
  }

  async function capabilities() {
    return platform ? platform.capabilities() : protocol.capability('unsupported')
  }

  async function list() {
    if (platform) return platform.list()
    return { capability: protocol.capability('unsupported'), windows: [], completeness: 'partial', message: '当前系统不支持窗口跳转' }
  }

  async function probeInstance(window) {
    const instanceId = String(window && window.instanceId || '')
    if (!platform || !window || window.platform !== hostPlatform) {
      return { status: 'indeterminate', instanceId, liveness: 'indeterminate', reason: 'unsupported' }
    }
    return platform.probeInstance(window)
  }

  async function activate(request, activationOptions = {}) {
    const source = request && request.root && typeof request.root === 'object' ? request.root : request
    if (!platform || !source || source.platform !== hostPlatform) {
      const debugTrace = protocol.debugTraceRequested(activationOptions)
      return { outcome: 'not-found', message: '窗口引用已失效或不属于当前系统', ...protocol.optionalTrace(debugTrace, [{ stage: 'target', outcome: 'not-found' }]) }
    }
    return platform.activate(request, activationOptions)
  }

  async function alwaysOnTop(window, activationOptions = {}) {
    if (!platform || !window || window.platform !== hostPlatform) {
      const debugTrace = protocol.debugTraceRequested(activationOptions)
      return { outcome: 'not-found', message: '窗口引用已失效或不属于当前系统', ...protocol.optionalTrace(debugTrace, [{ stage: 'target', outcome: 'not-found' }]) }
    }
    return platform.alwaysOnTop(window, activationOptions)
  }

  async function close(window) {
    return platform && window && window.platform === hostPlatform
      ? platform.close(window)
      : { outcome: 'not-found', message: '窗口引用已失效或不属于当前系统' }
  }

  async function terminate(window) {
    return platform && window && window.platform === hostPlatform
      ? platform.terminate(window)
      : { outcome: 'not-found', message: '进程引用已失效或不属于当前系统' }
  }

  async function openPermissionSettings() {
    return platform ? platform.openPermissionSettings() : false
  }

  function prepareActivation(window, debugTrace = false) {
    return platformFor(window).prepareActivation ? platformFor(window).prepareActivation(window, debugTrace) : Promise.resolve({ outcome: 'ready' })
  }

  function markActivation(window) {
    platformFor(window).markActivation(window)
  }

  function invalidateSpace(window) {
    if (window && window.instanceId) cache.clearSpaceBindings(window.instanceId)
  }

  return {
    capabilities,
    list,
    probeInstance,
    activate,
    close,
    terminate,
    alwaysOnTop,
    openPermissionSettings,
    observeInventory,
    prepareActivation,
    markActivation,
    invalidateSpace,
    runNativeCommand,
    debugSnapshot: () => cache.snapshot()
  }
}

module.exports = { WINDOW_BRIDGE_REVISION, createWindowSubsystem }
