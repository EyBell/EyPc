'use strict'

const MACOS_AX_WINDOW_LIST_SCRIPT = String.raw`
ObjC.import('Foundation')
ObjC.import('AppKit')
ObjC.import('ApplicationServices')
ObjC.import('CoreGraphics')
let exactAxApiAvailable = false
try {
  ObjC.bindFunction('AXUIElementCreateApplication', ['id', ['int']])
  ObjC.bindFunction('AXUIElementCopyAttributeValue', ['int', ['id', 'id', 'id *']])
  ObjC.bindFunction('_AXUIElementGetWindow', ['int', ['id', 'uint32_t *']])
  exactAxApiAvailable = true
} catch (error) {}
function attempt(callback, fallback) {
  try { return callback() } catch (error) { return fallback }
}
function asText(value) { return String(value || '').trim() }
const selfPid = $.NSProcessInfo.processInfo.processIdentifier
const excludedPid = __EYPC_HOST_PID__
const excludedParentPid = __EYPC_PARENT_PID__
const runningApps = attempt(() => $.NSWorkspace.sharedWorkspace.runningApplications, null)
const cgRaw = attempt(() => ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll, $.kCGNullWindowID))), [])
const cgRows = Array.isArray(cgRaw) ? cgRaw : []
const cgSurfaceKeys = {}
for (const item of cgRows) {
  if (!item || typeof item !== 'object') continue
  const layer = Math.trunc(Number(item.kCGWindowLayer || 0))
  const pid = Math.trunc(Number(item.kCGWindowOwnerPID || 0))
  const windowNumber = Math.trunc(Number(item.kCGWindowNumber || 0))
  const alpha = Number(item.kCGWindowAlpha)
  const bounds = item.kCGWindowBounds && typeof item.kCGWindowBounds === 'object' ? item.kCGWindowBounds : {}
  const width = Number(bounds.Width || bounds.width || 0)
  const height = Number(bounds.Height || bounds.height || 0)
  if (layer !== 0 || pid <= 0 || windowNumber <= 0 || (Number.isFinite(alpha) && alpha <= 0) || width <= 1 || height <= 1) continue
  cgSurfaceKeys[String(pid) + ':' + String(windowNumber)] = true
}
const rows = []
const seen = {}
let permissionDenied = false
let admittedAxCandidates = 0
function copyAxAttributeResult(element, name) {
  if (!exactAxApiAvailable || !element) return { error: -1, value: null }
  try {
    const output = Ref()
    const error = Number($.AXUIElementCopyAttributeValue(element, $.NSString.stringWithString(name), output))
    if (error === -25211 || error === -25204) permissionDenied = true
    return { error, value: error === 0 ? output[0] : null }
  } catch (error) { return { error: -1, value: null } }
}
function copyAxAttribute(element, name) {
  return copyAxAttributeResult(element, name).value
}
function exactCgWindowNumber(element) {
  if (!exactAxApiAvailable || !element) return 0
  try {
    const output = Ref()
    if (Number($._AXUIElementGetWindow(element, output)) !== 0) return 0
    return Math.trunc(Number(output[0] || 0))
  } catch (error) { return 0 }
}
function axText(element, name) {
  const value = copyAxAttribute(element, name)
  return asText(attempt(() => value ? ObjC.unwrap(value) : '', ''))
}
function isAdmittedWindowRole(role, subrole) {
  if (role === 'AXSheet' || role === 'AXDialog') return true
  if (role !== 'AXWindow') return false
  return subrole === 'AXStandardWindow'
    || subrole === 'AXDialog'
    || subrole === 'AXSystemDialog'
    || subrole === 'AXFloatingWindow'
}
const appCount = runningApps ? Math.max(0, Math.trunc(Number(runningApps.count || 0))) : 0
for (let p = 0; p < appCount; p += 1) {
  const running = attempt(() => runningApps.objectAtIndex(p), null)
  const pid = Math.trunc(Number(attempt(() => running.processIdentifier, 0)))
  if (!Number.isInteger(pid) || pid <= 0 || pid === selfPid || pid === excludedPid || pid === excludedParentPid) continue
  if (!running || attempt(() => running.terminated === true, false) || Number(attempt(() => running.activationPolicy, -1)) !== 0) continue
  const appName = asText(attempt(() => running.localizedName ? ObjC.unwrap(running.localizedName) : '', ''))
  if (!appName) continue
  const appId = asText(attempt(() => running.bundleIdentifier ? ObjC.unwrap(running.bundleIdentifier) : appName, appName)) || appName
  const appElement = attempt(() => $.AXUIElementCreateApplication(pid), null)
  const windowsResult = copyAxAttributeResult(appElement, 'AXWindows')
  const windows = windowsResult.value
  const focusedWindow = copyAxAttribute(appElement, 'AXFocusedWindow')
  const focusedWindowNumber = exactCgWindowNumber(focusedWindow)
  const count = windows ? Math.max(0, Math.trunc(Number(windows.count || 0))) : 0
  for (let index = 0; index < count; index += 1) {
    const win = attempt(() => windows.objectAtIndex(index), null)
    const windowNumber = exactCgWindowNumber(win)
    if (!win || windowNumber <= 0) continue
    const role = axText(win, 'AXRole')
    const subrole = axText(win, 'AXSubrole')
    if (!isAdmittedWindowRole(role, subrole)) continue
    admittedAxCandidates += 1
    if (!cgSurfaceKeys[String(pid) + ':' + String(windowNumber)]) continue
    const title = axText(win, 'AXTitle')
    const minimizedValue = copyAxAttribute(win, 'AXMinimized')
    const minimized = attempt(() => minimizedValue ? Boolean(ObjC.unwrap(minimizedValue)) : false, false)
    const containingWindow = copyAxAttribute(win, 'AXWindow')
    const topLevelElement = copyAxAttribute(win, 'AXTopLevelUIElement')
    const parentElement = copyAxAttribute(win, 'AXParent')
    const topLevelWindowNumber = exactCgWindowNumber(topLevelElement)
    const containingWindowNumber = exactCgWindowNumber(containingWindow)
    const parentWindowNumber = exactCgWindowNumber(parentElement)
    const relatedWindowNumbers = [parentWindowNumber, topLevelWindowNumber, containingWindowNumber]
    const rootWindowNumber = relatedWindowNumbers.find((candidate) => candidate > 0 && candidate !== windowNumber) || windowNumber
    if (!cgSurfaceKeys[String(pid) + ':' + String(rootWindowNumber)]) continue
    const nativeRef = String(pid) + ':0:' + String(windowNumber)
    const key = String(pid) + ':' + String(windowNumber)
    if (seen[key]) continue
    seen[key] = true
    rows.push({
      instanceId: 'darwin:' + String(pid) + ':' + String(windowNumber),
      nativeRef,
      pid,
      rootInstanceId: 'darwin:' + String(pid) + ':' + String(rootWindowNumber),
      rootNativeRef: String(pid) + ':0:' + String(rootWindowNumber),
      rootPid: pid,
      appId,
      appName,
      title: title || appName,
      minimized: minimized === true,
      focused: focusedWindowNumber === windowNumber,
      relationship: rootWindowNumber === windowNumber ? 'root' : 'child',
      relationEvidence: rootWindowNumber === windowNumber ? 'root-self' : 'macos-ax-top-level',
      userVisible: true,
      canActivate: true,
      canClose: Boolean(copyAxAttribute(win, 'AXCloseButton'))
    })
  }
}
JSON.stringify({
  windows: rows,
  permissionDenied,
  identityCorroborationMissing: admittedAxCandidates > 0 && rows.length === 0,
  screenRecordingLikelyMissing: admittedAxCandidates > 0 && rows.length === 0
})
`

function macosActivateWindowScript(pid, cgWindowNumber, memberCgWindowNumber = 0) {
  return String.raw`
ObjC.import('Foundation')
ObjC.import('CoreGraphics')
ObjC.import('ApplicationServices')
ObjC.import('AppKit')
const processId = ${pid}
const cgWindowNumber = ${cgWindowNumber}
const memberCgWindowNumber = ${memberCgWindowNumber}
const instanceId = 'darwin:' + String(processId) + ':' + String(cgWindowNumber)
const memberInstanceId = memberCgWindowNumber > 0 ? 'darwin:' + String(processId) + ':' + String(memberCgWindowNumber) : ''
let exactAxApiAvailable = false
try {
  ObjC.bindFunction('AXUIElementCreateApplication', ['id', ['int']])
  ObjC.bindFunction('AXUIElementCopyAttributeValue', ['int', ['id', 'id', 'id *']])
  ObjC.bindFunction('AXUIElementSetAttributeValue', ['int', ['id', 'id', 'id']])
  ObjC.bindFunction('AXUIElementPerformAction', ['int', ['id', 'id']])
  ObjC.bindFunction('_AXUIElementGetWindow', ['int', ['id', 'uint32_t *']])
  exactAxApiAvailable = true
} catch (error) {}
function environmentValue(name) {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey(name)
  return value ? String(ObjC.unwrap(value) || '') : ''
}
const debugTrace = environmentValue('EYPC_WINDOW_DEBUG_TRACE') === '1'
const trace = []
let activationReasonCode = ''
function addTrace(stage, outcome, detail) {
  if (!debugTrace || trace.length >= 16) return
  trace.push(detail ? { stage, outcome, detail } : { stage, outcome })
}
function emit(outcome) {
  const payload = { outcome }
  if (activationReasonCode) payload.reasonCode = activationReasonCode
  if (outcome === 'activated') payload.instanceId = instanceId
  if (outcome === 'activated' && memberInstanceId) payload.memberInstanceId = memberInstanceId
  if (debugTrace) payload.trace = trace
  return JSON.stringify(payload)
}
const expectedApp = normalizeAppIdentity(environmentValue('EYPC_WINDOW_TARGET_APP_ID'))
const expectedInstanceId = environmentValue('EYPC_WINDOW_INSTANCE_ID')
const expectedMemberInstanceId = environmentValue('EYPC_WINDOW_MEMBER_INSTANCE_ID')
function axAttributeName(name) {
  return $.NSString.stringWithString(name)
}
function copyAxAttribute(element, name) {
  if (!exactAxApiAvailable || !element) return { error: -1, value: null }
  try {
    const output = Ref()
    const error = Number($.AXUIElementCopyAttributeValue(element, axAttributeName(name), output))
    return { error, value: error === 0 ? output[0] : null }
  } catch (error) {
    return { error: -1, value: null }
  }
}
function setAxAttribute(element, name, value) {
  if (!exactAxApiAvailable || !element) return false
  try { return Number($.AXUIElementSetAttributeValue(element, axAttributeName(name), value)) === 0 } catch (error) { return false }
}
function performAxAction(element, name) {
  if (!exactAxApiAvailable || !element) return false
  try { return Number($.AXUIElementPerformAction(element, axAttributeName(name))) === 0 } catch (error) { return false }
}
function exactCgWindowNumber(element) {
  if (!exactAxApiAvailable || !element) return 0
  try {
    const output = Ref()
    if (Number($._AXUIElementGetWindow(element, output)) !== 0) return 0
    return Math.trunc(Number(output[0] || 0))
  } catch (error) {
    return 0
  }
}
function rootCgWindowNumber(element) {
  if (!element) return 0
  const containing = copyAxAttribute(element, 'AXWindow')
  const topLevel = copyAxAttribute(element, 'AXTopLevelUIElement')
  const parent = copyAxAttribute(element, 'AXParent')
  const own = exactCgWindowNumber(element)
  const related = [
    parent.error === 0 && parent.value ? exactCgWindowNumber(parent.value) : 0,
    topLevel.error === 0 && topLevel.value ? exactCgWindowNumber(topLevel.value) : 0,
    containing.error === 0 && containing.value ? exactCgWindowNumber(containing.value) : 0
  ]
  return related.find((candidate) => candidate > 0 && candidate !== own) || own
}
function axText(element, name) {
  const copied = copyAxAttribute(element, name)
  if (copied.error !== 0 || !copied.value) return ''
  try { return String(ObjC.unwrap(copied.value) || '').trim() } catch (error) { return '' }
}
function isAdmittedAxWindow(element) {
  const role = axText(element, 'AXRole')
  const subrole = axText(element, 'AXSubrole')
  if (role === 'AXSheet' || role === 'AXDialog') return true
  return role === 'AXWindow' && (subrole === 'AXStandardWindow' || subrole === 'AXDialog' || subrole === 'AXSystemDialog' || subrole === 'AXFloatingWindow')
}
function resolveRootAxTarget() {
  if (!exactAxApiAvailable || cgWindowNumber <= 0) return { outcome: 'unavailable' }
  let app = null
  try { app = $.AXUIElementCreateApplication(processId) } catch (error) {}
  if (!app) return { outcome: 'unavailable' }
  const copied = copyAxAttribute(app, 'AXWindows')
  if (copied.error !== 0 || !copied.value) return { outcome: 'unavailable' }
  const family = []
  let exactRoot = null
  const count = Math.max(0, Math.trunc(Number(copied.value.count || 0)))
  for (let index = 0; index < count; index += 1) {
    let candidate = null
    try { candidate = copied.value.objectAtIndex(index) } catch (error) {}
    if (!candidate || !isAdmittedAxWindow(candidate) || rootCgWindowNumber(candidate) !== cgWindowNumber) continue
    family.push(candidate)
    if (exactCgWindowNumber(candidate) === cgWindowNumber) exactRoot = candidate
  }
  if (!family.length) return { outcome: 'not-found' }
  if (memberCgWindowNumber > 0) {
    const exactMember = family.find((candidate) => exactCgWindowNumber(candidate) === memberCgWindowNumber) || null
    return exactMember ? { outcome: 'matched', app, target: exactMember } : { outcome: 'not-found' }
  }
  const focused = copyAxAttribute(app, 'AXFocusedWindow')
  const focusedTarget = focused.error === 0 && focused.value && rootCgWindowNumber(focused.value) === cgWindowNumber
    ? focused.value
    : null
  return { outcome: 'matched', app, target: focusedTarget || exactRoot || family[0] }
}
function rootAxFocused(app) {
  const focused = copyAxAttribute(app, 'AXFocusedWindow')
  if (focused.error !== 0 || !focused.value || rootCgWindowNumber(focused.value) !== cgWindowNumber) return false
  return memberCgWindowNumber <= 0 || exactCgWindowNumber(focused.value) === memberCgWindowNumber
}
function validateExactCgTarget(targetWindowNumber) {
  if (targetWindowNumber <= 0) return { outcome: 'unavailable' }
  try {
    const raw = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll, $.kCGNullWindowID)))
    const cgList = Array.isArray(raw) ? raw : []
    const matches = cgList.filter((item) => {
      if (!item || typeof item !== 'object') return false
      if (Math.trunc(Number(item.kCGWindowLayer || 0)) !== 0) return false
      if (Math.trunc(Number(item.kCGWindowOwnerPID || 0)) !== processId) return false
      if (Math.trunc(Number(item.kCGWindowNumber || 0)) !== targetWindowNumber) return false
      const alpha = Number(item.kCGWindowAlpha)
      if (Number.isFinite(alpha) && alpha <= 0) return false
      const bounds = item.kCGWindowBounds && typeof item.kCGWindowBounds === 'object' ? item.kCGWindowBounds : {}
      const width = Number(bounds.Width || bounds.width || 0)
      const height = Number(bounds.Height || bounds.height || 0)
      return width > 1 && height > 1
    })
    if (matches.length !== 1) return { outcome: matches.length > 1 ? 'ambiguous' : 'not-found' }
    return { outcome: 'matched' }
  } catch (error) {
    return { outcome: 'unavailable' }
  }
}
function activateRootAxTarget(resolved) {
  addTrace('process', 'ok')
  addTrace('target', 'ok', 'ax-cg-id-match')
  const target = resolved.target
  const app = resolved.app
  const running = (() => {
    try { return $.NSRunningApplication.runningApplicationWithProcessIdentifier(processId) } catch (error) { return null }
  })()
  if (!running || Boolean(running.terminated)) {
    addTrace('process', 'not-found')
    return 'not-found'
  }
  const runningBundle = normalizeAppIdentity((() => {
    try { return running.bundleIdentifier ? ObjC.unwrap(running.bundleIdentifier) : '' } catch (error) { return '' }
  })())
  const runningName = normalizeAppIdentity((() => {
    try { return running.localizedName ? ObjC.unwrap(running.localizedName) : '' } catch (error) { return '' }
  })())
  if (expectedApp && expectedApp !== runningBundle && expectedApp !== runningName) {
    activationReasonCode = 'instance-mismatch'
    addTrace('target', 'not-found', 'instance-mismatch')
    return 'not-found'
  }
  if (expectedInstanceId && expectedInstanceId !== instanceId) {
    activationReasonCode = 'instance-mismatch'
    addTrace('target', 'not-found', 'instance-mismatch')
    return 'not-found'
  }
  if (memberCgWindowNumber > 0 && expectedMemberInstanceId && expectedMemberInstanceId !== memberInstanceId) {
    activationReasonCode = 'member-mismatch'
    addTrace('target', 'not-found', 'instance-mismatch')
    return 'not-found'
  }
  const minimized = copyAxAttribute(target, 'AXMinimized')
  if (minimized.error === 0 && Boolean(ObjC.unwrap(minimized.value))) {
    if (!setAxAttribute(target, 'AXMinimized', $.NSNumber.numberWithBool(false))) {
      addTrace('restore', 'failed')
      return 'failed'
    }
    addTrace('restore', 'ok')
  } else {
    addTrace('restore', minimized.error === 0 ? 'skipped' : 'unavailable')
  }
  let raised = performAxAction(target, 'AXRaise')
  setAxAttribute(target, 'AXMain', $.NSNumber.numberWithBool(true))
  let foreground = false
  try { foreground = Boolean(running.activateWithOptions($.NSApplicationActivateIgnoringOtherApps)) } catch (error) {}
  $.NSThread.sleepForTimeInterval(0.05)
  for (let retry = 0; retry < 4; retry += 1) {
    // Prefer the current member, but verify the containing root so internal surfaces may change.
    setAxAttribute(app, 'AXFocusedWindow', target)
    setAxAttribute(app, 'AXMainWindow', target)
    setAxAttribute(target, 'AXMain', $.NSNumber.numberWithBool(true))
    setAxAttribute(target, 'AXFocused', $.NSNumber.numberWithBool(true))
    raised = performAxAction(target, 'AXRaise') || raised
    try { foreground = Boolean(running.activateWithOptions($.NSApplicationActivateIgnoringOtherApps)) || foreground } catch (error) {}
    $.NSThread.sleepForTimeInterval(0.06)
    if (rootAxFocused(app)) {
      addTrace('foreground', foreground ? 'ok' : 'unavailable')
      addTrace('raise', raised ? 'ok' : 'unavailable')
      addTrace('verify', 'ok', 'ax-focused-root-window')
      return 'activated'
    }
  }
  addTrace('foreground', foreground ? 'ok' : 'unavailable')
  addTrace('raise', raised ? 'ok' : 'failed')
  addTrace('verify', 'failed', 'focus-state-mismatch')
  return 'failed'
}
function normalizeAppIdentity(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}
function activate() {
  if (cgWindowNumber <= 0 || (expectedInstanceId && expectedInstanceId !== instanceId)) {
    activationReasonCode = cgWindowNumber <= 0 ? 'identity-unavailable' : 'instance-mismatch'
    addTrace('target', 'unavailable', cgWindowNumber <= 0 ? 'identity-unavailable' : 'instance-mismatch')
    return cgWindowNumber <= 0 ? 'failed' : 'not-found'
  }
  const cgIdentity = validateExactCgTarget(cgWindowNumber)
  if (cgIdentity.outcome === 'ambiguous') {
    addTrace('target', 'ambiguous')
    return 'ambiguous'
  }
  if (cgIdentity.outcome === 'not-found') {
    addTrace('target', 'not-found')
    return 'not-found'
  }
  if (cgIdentity.outcome !== 'matched') {
    activationReasonCode = 'identity-unavailable'
    addTrace('target', 'unavailable', 'identity-unavailable')
    return 'failed'
  }
  if (memberCgWindowNumber > 0) {
    const memberIdentity = validateExactCgTarget(memberCgWindowNumber)
    if (memberIdentity.outcome !== 'matched') {
      activationReasonCode = memberIdentity.outcome === 'not-found' ? 'member-mismatch' : 'identity-unavailable'
      addTrace('target', memberIdentity.outcome === 'not-found' ? 'not-found' : 'unavailable', 'ax-cg-id-match')
      return memberIdentity.outcome === 'not-found' ? 'not-found' : 'failed'
    }
  }
  addTrace('target', 'ok', 'instance-match')
  const exact = resolveRootAxTarget()
  if (exact.outcome === 'matched') return activateRootAxTarget(exact)
  if (exact.outcome === 'ambiguous') {
    addTrace('target', 'ambiguous', 'ax-cg-id-match')
    return 'ambiguous'
  }
  activationReasonCode = exact.outcome === 'not-found' ? 'instance-mismatch' : 'identity-unavailable'
  addTrace('target', exact.outcome === 'not-found' ? 'not-found' : 'unavailable', 'ax-cg-id-match')
  return exact.outcome === 'not-found' ? 'not-found' : 'failed'
}
emit(activate())
`
}

function macosCloseWindowScript(pid, cgWindowNumber, rootCgWindowNumber = cgWindowNumber) {
  return String.raw`
ObjC.import('Foundation')
ObjC.import('ApplicationServices')
ObjC.import('AppKit')
const processId = ${pid}
const cgWindowNumber = ${cgWindowNumber}
const rootCgWindowNumber = ${rootCgWindowNumber}
let available = false
try {
  ObjC.bindFunction('AXUIElementCreateApplication', ['id', ['int']])
  ObjC.bindFunction('AXUIElementCopyAttributeValue', ['int', ['id', 'id', 'id *']])
  ObjC.bindFunction('AXUIElementPerformAction', ['int', ['id', 'id']])
  ObjC.bindFunction('_AXUIElementGetWindow', ['int', ['id', 'uint32_t *']])
  available = true
} catch (error) {}
function environmentValue(name) {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey(name)
  return value ? String(ObjC.unwrap(value) || '') : ''
}
function normalizeAppIdentity(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}
function copyAttribute(element, name) {
  if (!available || !element) return null
  try {
    const output = Ref()
    if (Number($.AXUIElementCopyAttributeValue(element, $.NSString.stringWithString(name), output)) !== 0) return null
    return output[0]
  } catch (error) { return null }
}
function windowNumber(element) {
  if (!available || !element) return 0
  try {
    const output = Ref()
    if (Number($._AXUIElementGetWindow(element, output)) !== 0) return 0
    return Math.trunc(Number(output[0] || 0))
  } catch (error) { return 0 }
}
function rootWindowNumber(element) {
  if (!element) return 0
  const topLevel = copyAttribute(element, 'AXTopLevelUIElement')
  const containing = copyAttribute(element, 'AXWindow')
  const parent = copyAttribute(element, 'AXParent')
  const own = windowNumber(element)
  return [windowNumber(parent), windowNumber(topLevel), windowNumber(containing)].find((candidate) => candidate > 0 && candidate !== own) || own
}
function axText(element, name) {
  const value = copyAttribute(element, name)
  try { return value ? String(ObjC.unwrap(value) || '').trim() : '' } catch (error) { return '' }
}
function isAdmittedAxWindow(element) {
  const role = axText(element, 'AXRole')
  const subrole = axText(element, 'AXSubrole')
  if (role === 'AXSheet' || role === 'AXDialog') return true
  return role === 'AXWindow' && (subrole === 'AXStandardWindow' || subrole === 'AXDialog' || subrole === 'AXSystemDialog' || subrole === 'AXFloatingWindow')
}
const app = available && cgWindowNumber > 0 ? $.AXUIElementCreateApplication(processId) : null
const expectedApp = normalizeAppIdentity(environmentValue('EYPC_WINDOW_TARGET_APP_ID'))
const running = (() => {
  try { return $.NSRunningApplication.runningApplicationWithProcessIdentifier(processId) } catch (error) { return null }
})()
const runningBundle = normalizeAppIdentity((() => {
  try { return running && running.bundleIdentifier ? ObjC.unwrap(running.bundleIdentifier) : '' } catch (error) { return '' }
})())
const runningName = normalizeAppIdentity((() => {
  try { return running && running.localizedName ? ObjC.unwrap(running.localizedName) : '' } catch (error) { return '' }
})())
const appMatches = Boolean(running && !running.terminated && (!expectedApp || expectedApp === runningBundle || expectedApp === runningName))
const windows = copyAttribute(app, 'AXWindows')
const matches = []
const count = windows ? Math.max(0, Math.trunc(Number(windows.count || 0))) : 0
for (let index = 0; index < count; index += 1) {
  const candidate = windows.objectAtIndex(index)
  if (isAdmittedAxWindow(candidate) && windowNumber(candidate) === cgWindowNumber && rootWindowNumber(candidate) === rootCgWindowNumber) matches.push(candidate)
}
if (!appMatches) {
  JSON.stringify({ outcome: 'not-found', message: 'instance-mismatch' })
} else if (!available || !app || !windows) {
  JSON.stringify({ outcome: 'failed', message: 'identity-unavailable' })
} else if (matches.length !== 1) {
  JSON.stringify({ outcome: matches.length > 1 ? 'ambiguous' : 'not-found' })
} else {
  const target = matches[0]
  let closed = false
  const closeButton = copyAttribute(target, 'AXCloseButton')
  try {
    if (closeButton) closed = Number($.AXUIElementPerformAction(closeButton, $.NSString.stringWithString('AXPress'))) === 0
  } catch (error) {}
  if (!closed) {
    try { closed = Number($.AXUIElementPerformAction(target, $.NSString.stringWithString('AXClose'))) === 0 } catch (error) {}
  }
  if (closed) {
    JSON.stringify({ outcome: 'closed' })
  } else {
    JSON.stringify({ outcome: 'close-denied' })
  }
}
`
}

function createMacosWindowPlatform(options = {}) {
  const cache = options.cache
  const spaceBridge = options.spaceBridge
  const run = options.run
  const processApi = options.process && typeof options.process === 'object' ? options.process : process
  const globalApi = options.globalThis && typeof options.globalThis === 'object' ? options.globalThis : globalThis
  const protocol = options.protocol
  if (!cache || !spaceBridge || typeof run !== 'function' || !protocol) throw new TypeError('cache, spaceBridge, run and protocol are required')

  function isPermissionError(value) {
    return /not authorized|not permitted|accessibility|assistive access|automation|screen recording|-1743/i.test(String(value || ''))
  }

  function observeInventory(windows) {
    cache.observeInventory('darwin', windows)
  }

  function markActivation(window) {
    if (window && window.platform === 'darwin') cache.observe(window, 'native-window')
  }

  async function capabilities() {
    return protocol.capability()
  }

  async function list() {
    const script = MACOS_AX_WINDOW_LIST_SCRIPT
      .replace('__EYPC_HOST_PID__', String(processApi.pid || 0))
      .replace('__EYPC_PARENT_PID__', String(processApi.ppid || 0))
    const result = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script])
    if (!result.ok) {
      const detail = `${result.error}\n${result.stderr}`
      if (isPermissionError(detail)) {
        return {
          capability: protocol.capability('required', '需要辅助功能权限以读取可操作的用户窗口'),
          windows: [],
          completeness: 'partial',
          message: '需要在系统设置中允许 EyPc 使用辅助功能'
        }
      }
      return { capability: protocol.capability('unknown', '无法读取 macOS 用户窗口'), windows: [], completeness: 'partial', message: '无法读取 macOS 用户窗口；未显示任何未验证表面' }
    }
    const parsed = protocol.parseWindowJson(result.stdout, 'darwin')
    if (parsed.permissionDenied) {
      return {
        capability: protocol.capability('required', '需要辅助功能权限以读取可操作的用户窗口'),
        windows: [],
        completeness: 'partial',
        message: '需要在系统设置中允许 EyPc 使用辅助功能'
      }
    }
    if (parsed.identityCorroborationMissing) {
      return {
        capability: protocol.capability('required', '需要屏幕录制权限来佐证 AX 窗口的 CG 身份'),
        windows: [],
        completeness: 'partial',
        message: 'AX 窗口存在，但 CG 身份不可验证；EyPc 已省略全部未验证表面'
      }
    }
    observeInventory(parsed.windows)
    return {
      capability: protocol.capability('granted', '当前为 AX 准入且由 CG 身份佐证的当前可观察窗口'),
      windows: parsed.windows,
      completeness: 'partial',
      message: '当前清单不证明其他 Space 中的窗口已关闭；EyPc 已保留会话缓存'
    }
  }

  async function probeInstance(window) {
    const parsed = spaceBridge.parseMacWindow(window)
    const instanceId = parsed ? parsed.instanceId : String(window && window.instanceId || '')
    if (!parsed) {
      cache.markIndeterminate(window, 'identity-unavailable')
      return { status: 'indeterminate', instanceId, liveness: 'indeterminate', reason: 'identity-unavailable' }
    }
    cache.ensure(window)
    const result = await spaceBridge.resolve(window, false)
    if (result.detail === 'owner-exited') {
      cache.markGone(window, 'owner-exited')
      return { status: 'gone', instanceId, liveness: 'verified-gone', reason: 'owner-exited' }
    }
    if (result.detail === 'owner-mismatch' || result.appMatches === false) {
      cache.markGone(window, 'owner-mismatch')
      return { status: 'gone', instanceId, liveness: 'verified-gone', reason: 'owner-mismatch' }
    }
    if (result.exactWindow === true || Number(result.bindingCount) > 0) {
      cache.observe(window, result.exactWindow === true ? 'native-window' : 'space-binding')
      return {
        status: 'live',
        instanceId,
        liveness: 'verified-live',
        evidence: result.exactWindow === true ? 'native-window' : 'space-binding'
      }
    }
    if (result.nativeQueryFailed || result.authoritativeAbsence !== true) {
      cache.markIndeterminate(window, 'native-query-failed')
      return { status: 'indeterminate', instanceId, liveness: 'indeterminate', reason: 'native-query-failed' }
    }
    cache.markGone(window, 'native-window-absent')
    return { status: 'gone', instanceId, liveness: 'verified-gone', reason: 'native-window-absent' }
  }

  async function prepareActivation(window, debugTrace = false) {
    cache.ensure(window)
    const result = await spaceBridge.prepare(window, { switch: true })
    const trace = debugTrace
      ? {
          steps: [{
            stage: 'space',
            outcome: result.confirmed === true ? 'ok' : result.detail === 'ambiguous-spaces' ? 'ambiguous' : result.nativeQueryFailed ? 'unavailable' : 'failed',
            ...(result.cacheHit ? { detail: 'session-cache' } : result.detail === 'switch-confirmed' ? { detail: 'space-switch-confirmed' } : Number(result.directBindingCount) > 0 ? { detail: 'direct-space-binding' } : Number(result.reverseBindingCount) > 0 ? { detail: 'reverse-space-binding' } : {})
          }]
        }
      : undefined
    if (result.detail === 'owner-exited' || result.detail === 'owner-mismatch') {
      cache.markGone(window, result.detail)
      return { outcome: 'not-found', reasonCode: 'instance-mismatch', message: '窗口原生实例已失效，需要重新确认', ...(trace ? { trace } : {}) }
    }
    if (result.exactWindow !== true && Number(result.bindingCount) === 0 && result.authoritativeAbsence === true) {
      cache.markGone(window, 'native-window-absent')
      return { outcome: 'not-found', reasonCode: 'instance-mismatch', message: '已确认窗口原生实例不存在，需要重新确认', ...(trace ? { trace } : {}) }
    }
    if (result.detail === 'ambiguous-spaces') {
      return { outcome: 'ambiguous', reasonCode: 'space-ambiguous', message: '目标窗口同时映射到多个远端桌面，未执行不确定切换', ...(trace ? { trace } : {}) }
    }
    if (result.detail === 'switch-timeout') {
      return { outcome: 'failed', reasonCode: 'space-switch-timeout', message: '目标桌面切换未在时限内得到确认', ...(trace ? { trace } : {}) }
    }
    if (result.confirmed !== true) {
      const reasonCode = Number(result.ownerWindowCount) > 1 ? 'space-unbound-multiwindow' : 'space-unbound'
      return { outcome: 'not-found', reasonCode, message: '无法唯一确认目标窗口所在桌面，未前置同应用其他窗口', ...(trace ? { trace } : {}) }
    }
    cache.observe(window, result.exactWindow === true ? 'native-window' : 'space-binding')
    return { outcome: 'ready', cacheHit: result.cacheHit === true, ...(trace ? { trace } : {}) }
  }

  async function activate(request, activationOptions = {}) {
    const debugTrace = protocol.debugTraceRequested(activationOptions)
    const payload = request && typeof request === 'object' ? request : {}
    const mode = payload.mode === 'member-exact' ? 'member-exact' : 'root-current'
    const source = payload.root && typeof payload.root === 'object' ? payload.root : payload
    const member = mode === 'member-exact' && payload.member && typeof payload.member === 'object' ? payload.member : null
    const nativeRef = String(source.nativeRef || '').trim()
    const parts = /^(\d{1,12}):(\d{1,6}):(\d{1,12})$/.exec(nativeRef)
    if (!parts) return { outcome: 'not-found', message: 'macOS 窗口引用已失效', ...protocol.optionalTrace(debugTrace, [{ stage: 'target', outcome: 'not-found' }]) }
    const appId = String(source.appId || source.appName || '').replace(/\u0000/g, '').slice(0, 512)
    const pid = Number(parts[1])
    const ordinal = Number(parts[2])
    const cgWindowNumber = Number(parts[3])
    const actualInstanceId = `darwin:${pid}:${cgWindowNumber}`
    const sourceInstanceId = String(source.instanceId || '').trim()
    const expectedInstanceId = sourceInstanceId.includes(':legacy:') ? '' : sourceInstanceId
    const memberParts = mode === 'member-exact' ? /^(\d{1,12}):(\d{1,6}):(\d{1,12})$/.exec(String(member && member.nativeRef || '').trim()) : null
    const memberCgWindowNumber = memberParts ? Number(memberParts[3]) : 0
    const memberInstanceId = String(member && member.instanceId || '').trim()
    if (ordinal !== 0 || !Number.isInteger(cgWindowNumber) || cgWindowNumber <= 0) {
      return { outcome: 'failed', reasonCode: 'identity-unavailable', message: '无法建立稳定的 macOS 窗口实例身份', ...protocol.optionalTrace(debugTrace, [{ stage: 'target', outcome: 'unavailable', detail: 'identity-unavailable' }]) }
    }
    if (expectedInstanceId && expectedInstanceId !== actualInstanceId) {
      return { outcome: 'not-found', reasonCode: 'instance-mismatch', message: '窗口实例与保存目标不一致，需要重新确认', ...protocol.optionalTrace(debugTrace, [{ stage: 'target', outcome: 'not-found', detail: 'instance-mismatch' }]) }
    }
    if (mode === 'member-exact' && (!memberParts || Number(memberParts[1]) !== pid || Number(memberParts[2]) !== 0 || memberCgWindowNumber <= 0)) {
      return { outcome: 'not-found', reasonCode: 'member-mismatch', message: '指定子窗口实例与主窗口关系已失效', ...protocol.optionalTrace(debugTrace, [{ stage: 'target', outcome: 'not-found', detail: 'instance-mismatch' }]) }
    }
    let spacePreparation = await prepareActivation(source, debugTrace)
    if (spacePreparation.outcome !== 'ready') return spacePreparation

    async function executeExact(preparation) {
      const result = await run(
        '/usr/bin/osascript',
        ['-l', 'JavaScript', '-e', macosActivateWindowScript(pid, cgWindowNumber, memberCgWindowNumber)],
        debugTrace,
        {
          EYPC_WINDOW_TARGET_APP_ID: appId,
          EYPC_WINDOW_INSTANCE_ID: expectedInstanceId || actualInstanceId,
          ...(mode === 'member-exact' && memberInstanceId ? { EYPC_WINDOW_MEMBER_INSTANCE_ID: memberInstanceId } : {})
        }
      )
      if (!result.ok) {
        const detail = `${result.error}\n${result.stderr}`
        const failure = isPermissionError(detail)
          ? { outcome: 'permission-required', message: '需要在系统设置中允许 EyPc 使用辅助功能', ...protocol.optionalTrace(debugTrace, [{ stage: 'bridge', outcome: 'denied' }]) }
          : { outcome: 'failed', message: 'macOS 无法激活该根窗口', ...protocol.optionalTrace(debugTrace, [{ stage: 'bridge', outcome: 'failed' }]) }
        return protocol.mergeActivationTrace(failure, preparation.trace)
      }
      return protocol.mergeActivationTrace(protocol.parseActivationResult(result.stdout), preparation.trace)
    }

    let activation = await executeExact(spacePreparation)
    if (activation.outcome === 'not-found' && spacePreparation.cacheHit === true) {
      const firstTrace = activation.trace
      cache.clearSpaceBindings(source.instanceId)
      spacePreparation = await prepareActivation(source, debugTrace)
      if (spacePreparation.outcome !== 'ready') return protocol.mergeActivationTrace(spacePreparation, firstTrace)
      activation = protocol.mergeActivationTrace(await executeExact(spacePreparation), firstTrace)
    }
    if (activation.outcome === 'activated') markActivation(source)
    else cache.clearSpaceBindings(source.instanceId)
    return activation
  }

  async function alwaysOnTop(_window, activationOptions = {}) {
    const debugTrace = protocol.debugTraceRequested(activationOptions)
    return { outcome: 'unsupported', message: 'macOS 只能展开并前置第三方窗口，不能将其保持在最上层', ...protocol.optionalTrace(debugTrace, [{ stage: 'topmost', outcome: 'unsupported' }]) }
  }

  async function close(window) {
    const source = window && typeof window === 'object' ? window : {}
    const nativeRef = String(source.nativeRef || '').trim()
    const parts = /^(\d{1,12}):(\d{1,6}):(\d{1,12})$/.exec(nativeRef)
    if (!parts) return { outcome: 'not-found', message: 'macOS 窗口引用已失效' }
    const pid = Number(parts[1])
    const ordinal = Number(parts[2])
    const cgWindowNumber = Number(parts[3])
    const actualInstanceId = `darwin:${pid}:${cgWindowNumber}`
    const sourceInstanceId = String(source.instanceId || '').trim()
    const expectedInstanceId = sourceInstanceId.includes(':legacy:') ? '' : sourceInstanceId
    const rootParts = /^(\d{1,12}):(\d{1,6}):(\d{1,12})$/.exec(String(source.rootNativeRef || nativeRef).trim())
    const rootCgWindowNumber = rootParts && Number(rootParts[1]) === pid && Number(rootParts[2]) === 0 ? Number(rootParts[3]) : cgWindowNumber
    if (ordinal !== 0 || cgWindowNumber <= 0) return { outcome: 'failed', message: '无法建立稳定的 macOS 窗口实例身份' }
    if (expectedInstanceId && expectedInstanceId !== actualInstanceId) return { outcome: 'not-found', message: '窗口实例与保存目标不一致' }
    const appId = String(source.appId || source.appName || '').replace(/\u0000/g, '').slice(0, 512)
    const result = await run(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', macosCloseWindowScript(pid, cgWindowNumber, rootCgWindowNumber)],
      false,
      { EYPC_WINDOW_TARGET_APP_ID: appId }
    )
    if (!result.ok) {
      const detail = `${result.error}\n${result.stderr}`
      return isPermissionError(detail)
        ? { outcome: 'permission-required', message: '需要在系统设置中允许 EyPc 使用辅助功能' }
        : { outcome: 'failed', message: 'macOS 无法关闭该窗口' }
    }
    return protocol.parseLifecycleResult(result.stdout)
  }

  async function terminate(window) {
    const pid = Math.trunc(Number(window && window.pid))
    if (!Number.isInteger(pid) || pid <= 0) return { outcome: 'not-found', message: '进程引用已失效或不属于当前系统' }
    try {
      processApi.kill(pid, 'SIGKILL')
      return { outcome: 'terminated' }
    } catch (error) {
      const code = error && typeof error === 'object' ? error.code : ''
      if (code === 'ESRCH') return { outcome: 'not-found', message: '进程已不存在' }
      return { outcome: 'failed', message: 'macOS 无法强制终止该进程' }
    }
  }

  async function openPermissionSettings() {
    try {
      if (globalApi.utools && typeof globalApi.utools.shellOpenExternal === 'function') {
        globalApi.utools.shellOpenExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
        globalApi.utools.shellOpenExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
        return true
      }
    } catch {}
    return false
  }

  return { capabilities, list, observeInventory, markActivation, probeInstance, prepareActivation, activate, alwaysOnTop, close, terminate, openPermissionSettings }
}

module.exports = { createMacosWindowPlatform }
