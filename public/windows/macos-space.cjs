'use strict'

function parseMacWindow(window) {
  const nativeRef = String(window && window.nativeRef || '').trim()
  const parts = /^(\d{1,12}):0:(\d{1,12})$/.exec(nativeRef)
  if (!parts) return null
  const pid = Number(parts[1])
  const cgWindowNumber = Number(parts[2])
  const instanceId = String(window && window.instanceId || `darwin:${pid}:${cgWindowNumber}`).trim()
  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(cgWindowNumber) || cgWindowNumber <= 0 || !instanceId) return null
  return { pid, cgWindowNumber, instanceId, appId: String(window && (window.appId || window.appName) || '').slice(0, 512) }
}

const RESOLVE_SPACE_SCRIPT = String.raw`
ObjC.import('Foundation')
ObjC.import('CoreGraphics')
ObjC.import('AppKit')
function attempt(callback, fallback) { try { return callback() } catch (error) { return fallback } }
function env(name) { const value = $.NSProcessInfo.processInfo.environment.objectForKey(name); return value ? String(ObjC.unwrap(value) || '') : '' }
function normalized(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase() }
function numberList(value) {
  const rows = attempt(() => ObjC.deepUnwrap(value), [])
  return Array.isArray(rows) ? rows.map((item) => Math.trunc(Number(item || 0))).filter((item) => item > 0) : []
}
function execute() {
  ObjC.bindFunction('calloc', ['void *', ['unsigned long', 'unsigned long']])
  ObjC.bindFunction('free', ['void', ['void *']])
  ObjC.bindFunction('SLSMainConnectionID', ['int', []])
  ObjC.bindFunction('SLSCopyManagedDisplaySpaces', ['id', ['int']])
  ObjC.bindFunction('SLSCopySpacesForWindows', ['id', ['int', 'int', 'id']])
  ObjC.bindFunction('SLSCopyWindowsWithOptionsAndTags', ['id', ['int', 'uint32_t', 'id', 'uint32_t', 'void *', 'void *']])
  ObjC.bindFunction('SLSManagedDisplaySetCurrentSpace', ['void', ['int', 'id', 'uint64_t']])
  const pid = Math.trunc(Number(env('EYPC_WINDOW_TARGET_PID')))
  const cgWindowNumber = Math.trunc(Number(env('EYPC_WINDOW_TARGET_CG_ID')))
  const expectedApp = normalized(env('EYPC_WINDOW_TARGET_APP_ID'))
  const shouldSwitch = env('EYPC_WINDOW_SPACE_SWITCH') === '1'
  const running = attempt(() => $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid), null)
  const runningBundle = normalized(attempt(() => running && running.bundleIdentifier && ObjC.unwrap(running.bundleIdentifier), ''))
  const runningName = normalized(attempt(() => running && running.localizedName && ObjC.unwrap(running.localizedName), ''))
  const appMatches = Boolean(running && (!expectedApp || expectedApp === runningBundle || expectedApp === runningName))
  let cgQuerySucceeded = false
  let rawWindows = []
  try {
    const value = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll, $.kCGNullWindowID)))
    if (Array.isArray(value)) { rawWindows = value; cgQuerySucceeded = true }
  } catch (error) {}
  const windows = rawWindows
  const ownerWindows = windows.filter((item) => item && typeof item === 'object'
    && Math.trunc(Number(item.kCGWindowLayer || 0)) === 0
    && Math.trunc(Number(item.kCGWindowOwnerPID || 0)) === pid)
  const exact = ownerWindows.filter((item) => Math.trunc(Number(item.kCGWindowNumber || 0)) === cgWindowNumber)
  if (!running) return { detail: 'owner-exited', appMatches: false, exactWindow: false, ownerWindowCount: 0, bindingCount: 0, managedSpaceCount: 0 }
  if (!appMatches) return { detail: 'owner-mismatch', appMatches: false, exactWindow: exact.length === 1, ownerWindowCount: ownerWindows.length, bindingCount: 0, managedSpaceCount: 0 }
  const cid = $.SLSMainConnectionID()
  function managedSnapshot() {
    try {
      const rows = ObjC.deepUnwrap($.SLSCopyManagedDisplaySpaces(cid))
      return { ok: Array.isArray(rows), rows: Array.isArray(rows) ? rows : [] }
    } catch (error) { return { ok: false, rows: [] } }
  }
  const initialManaged = managedSnapshot()
  const entries = []
  const currentByDisplay = {}
  for (const display of initialManaged.rows) {
    if (!display || typeof display !== 'object') continue
    const displayUuid = String(display['Display Identifier'] || '').trim()
    const currentSpaceId = Math.trunc(Number(display['Current Space'] && display['Current Space'].id64 || 0))
    if (!displayUuid) continue
    if (currentSpaceId > 0) currentByDisplay[displayUuid] = String(currentSpaceId)
    for (const space of Array.isArray(display.Spaces) ? display.Spaces : []) {
      const spaceId = Math.trunc(Number(space && space.id64 || 0))
      if (spaceId > 0) entries.push({ displayUuid, spaceId, currentSpaceId })
    }
  }
  const windowIds = $.NSArray.arrayWithObject($.NSNumber.numberWithUnsignedInt(cgWindowNumber))
  const directIds = []
  let directQuerySucceeded = false
  for (const mask of [0x7, 0x7fffffff]) {
    let rawSpaces = null
    try { rawSpaces = $.SLSCopySpacesForWindows(cid, mask, windowIds); if (rawSpaces) directQuerySucceeded = true } catch (error) {}
    for (const spaceId of numberList(rawSpaces)) {
      if (directIds.indexOf(spaceId) < 0) directIds.push(spaceId)
    }
  }
  const direct = entries.filter((entry) => directIds.indexOf(entry.spaceId) >= 0)
  const reverse = []
  let reverseQuerySucceeded = entries.length > 0
  const setTags = $.calloc(1, 8)
  const clearTags = $.calloc(1, 8)
  try {
    for (const entry of entries) {
      const spaces = $.NSArray.arrayWithObject($.NSNumber.numberWithUnsignedLongLong(entry.spaceId))
      let rawIds = null
      try { rawIds = $.SLSCopyWindowsWithOptionsAndTags(cid, 0, spaces, 0x7, setTags, clearTags) } catch (error) {}
      if (!rawIds) reverseQuerySucceeded = false
      const ids = numberList(rawIds)
      if (ids.indexOf(cgWindowNumber) >= 0) reverse.push(entry)
    }
  } finally { $.free(setTags); $.free(clearTags) }
  const bindings = []
  const seen = {}
  for (const entry of direct.concat(reverse)) {
    const key = entry.displayUuid + ':' + String(entry.spaceId)
    if (seen[key]) continue
    seen[key] = true
    bindings.push(entry)
  }
  const source = direct.length && reverse.length ? 'direct+reverse' : direct.length ? 'direct' : reverse.length ? 'reverse' : 'none'
  const authoritativeAbsence = cgQuerySucceeded && initialManaged.ok && directQuerySucceeded && reverseQuerySucceeded
  const base = {
    detail: bindings.length ? 'remote' : 'empty-spaces',
    appMatches: true,
    exactWindow: exact.length === 1,
    ownerWindowCount: ownerWindows.length,
    bindingCount: bindings.length,
    bindings: bindings.slice(0, 16).map((binding) => ({ displayUuid: binding.displayUuid, spaceId: String(binding.spaceId), source })),
    bindingSource: source,
    managedSpaceCount: entries.length,
    directBindingCount: direct.length,
    reverseBindingCount: reverse.length,
    authoritativeAbsence,
    currentByDisplay,
    confirmed: false,
    switched: false
  }
  if (!bindings.length) return base
  const current = bindings.filter((binding) => binding.currentSpaceId === binding.spaceId)
  if (current.length) return Object.assign(base, { detail: 'current', sameSpace: true, confirmed: true })
  if (bindings.length !== 1) return Object.assign(base, { detail: 'ambiguous-spaces', sameSpace: false })
  if (!shouldSwitch) return Object.assign(base, { detail: 'remote', sameSpace: false })
  const binding = bindings[0]
  $.SLSManagedDisplaySetCurrentSpace(cid, $.NSString.stringWithString(binding.displayUuid), binding.spaceId)
  const deadline = Date.now() + 2000
  while (Date.now() <= deadline) {
    const confirmed = managedSnapshot().rows.some((item) => String(item && item['Display Identifier'] || '') === binding.displayUuid
      && Math.trunc(Number(item && item['Current Space'] && item['Current Space'].id64 || 0)) === binding.spaceId)
    if (confirmed) return Object.assign(base, { detail: 'switch-confirmed', sameSpace: false, switched: true, confirmed: true })
    $.NSThread.sleepForTimeInterval(0.05)
  }
  return Object.assign(base, { detail: 'switch-timeout', sameSpace: false })
}
let payload
try { payload = execute() } catch (error) { payload = { detail: 'error', bindingCount: 0, managedSpaceCount: 0, nativeQueryFailed: true } }
JSON.stringify(payload)
`

const CACHED_SPACE_SCRIPT = String.raw`
ObjC.import('Foundation')
function attempt(callback, fallback) { try { return callback() } catch (error) { return fallback } }
function env(name) { const value = $.NSProcessInfo.processInfo.environment.objectForKey(name); return value ? String(ObjC.unwrap(value) || '') : '' }
function execute() {
  ObjC.bindFunction('SLSMainConnectionID', ['int', []])
  ObjC.bindFunction('SLSCopyManagedDisplaySpaces', ['id', ['int']])
  ObjC.bindFunction('SLSManagedDisplaySetCurrentSpace', ['void', ['int', 'id', 'uint64_t']])
  const wanted = JSON.parse(env('EYPC_WINDOW_SPACE_BINDINGS') || '[]')
  const shouldSwitch = env('EYPC_WINDOW_SPACE_SWITCH') === '1'
  const cid = $.SLSMainConnectionID()
  function managedRows() {
    const rows = attempt(() => ObjC.deepUnwrap($.SLSCopyManagedDisplaySpaces(cid)), [])
    return Array.isArray(rows) ? rows : []
  }
  function snapshot() {
    const entries = []
    const currentByDisplay = {}
    for (const display of managedRows()) {
      if (!display || typeof display !== 'object') continue
      const displayUuid = String(display['Display Identifier'] || '').trim()
      const currentSpaceId = String(Math.trunc(Number(display['Current Space'] && display['Current Space'].id64 || 0)))
      if (!displayUuid) continue
      currentByDisplay[displayUuid] = currentSpaceId
      for (const space of Array.isArray(display.Spaces) ? display.Spaces : []) {
        const spaceId = String(Math.trunc(Number(space && space.id64 || 0)))
        if (/^[1-9]\d*$/.test(spaceId)) entries.push({ displayUuid, spaceId })
      }
    }
    return { entries, currentByDisplay }
  }
  let managed = snapshot()
  const valid = wanted.filter((binding) => managed.entries.some((entry) => entry.displayUuid === String(binding.displayUuid || '') && entry.spaceId === String(binding.spaceId || '')))
  if (!valid.length) return { detail: 'cache-stale', confirmed: false, bindingCount: 0, currentByDisplay: managed.currentByDisplay }
  const current = valid.filter((binding) => managed.currentByDisplay[String(binding.displayUuid)] === String(binding.spaceId))
  if (current.length) return { detail: 'current', confirmed: true, switched: false, bindingCount: valid.length, bindings: valid, currentByDisplay: managed.currentByDisplay }
  if (valid.length !== 1) return { detail: 'ambiguous-spaces', confirmed: false, switched: false, bindingCount: valid.length, bindings: valid, currentByDisplay: managed.currentByDisplay }
  if (!shouldSwitch) return { detail: 'remote', confirmed: false, switched: false, bindingCount: 1, bindings: valid, currentByDisplay: managed.currentByDisplay }
  const binding = valid[0]
  $.SLSManagedDisplaySetCurrentSpace(cid, $.NSString.stringWithString(String(binding.displayUuid)), Number(binding.spaceId))
  const deadline = Date.now() + 2000
  while (Date.now() <= deadline) {
    managed = snapshot()
    if (managed.currentByDisplay[String(binding.displayUuid)] === String(binding.spaceId)) {
      return { detail: 'switch-confirmed', confirmed: true, switched: true, bindingCount: 1, bindings: valid, currentByDisplay: managed.currentByDisplay }
    }
    $.NSThread.sleepForTimeInterval(0.05)
  }
  return { detail: 'switch-timeout', confirmed: false, switched: false, bindingCount: 1, bindings: valid, currentByDisplay: managed.currentByDisplay }
}
let payload
try { payload = execute() } catch (error) { payload = { detail: 'error', confirmed: false, bindingCount: 0, nativeQueryFailed: true } }
JSON.stringify(payload)
`

function parseJsonResult(result) {
  if (!result || result.ok !== true) return { detail: 'error', bindingCount: 0, nativeQueryFailed: true }
  try {
    const parsed = JSON.parse(String(result.stdout || '').trim() || '{}')
    return parsed && typeof parsed === 'object' ? parsed : { detail: 'error', bindingCount: 0, nativeQueryFailed: true }
  } catch {
    return { detail: 'error', bindingCount: 0, nativeQueryFailed: true }
  }
}

function createMacosSpaceBridge(options = {}) {
  const run = options.run
  const cache = options.cache
  if (typeof run !== 'function' || !cache) throw new TypeError('run and cache are required')

  async function execute(script, environment) {
    return parseJsonResult(await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], { environment }))
  }

  async function resolve(window, shouldSwitch) {
    const parsed = parseMacWindow(window)
    if (!parsed) return { detail: 'bad-ref', bindingCount: 0, nativeQueryFailed: true }
    const result = await execute(RESOLVE_SPACE_SCRIPT, {
      EYPC_WINDOW_TARGET_PID: String(parsed.pid),
      EYPC_WINDOW_TARGET_CG_ID: String(parsed.cgWindowNumber),
      EYPC_WINDOW_TARGET_APP_ID: parsed.appId,
      EYPC_WINDOW_SPACE_SWITCH: shouldSwitch ? '1' : '0'
    })
    cache.updateCurrentByDisplay(result.currentByDisplay)
    if (Array.isArray(result.bindings) && result.bindings.length) cache.setSpaceBindings(parsed.instanceId, result.bindings)
    return { ...result, instanceId: parsed.instanceId, cacheHit: false }
  }

  async function useCached(window, shouldSwitch) {
    const parsed = parseMacWindow(window)
    if (!parsed) return null
    const bindings = cache.getSpaceBindings(parsed.instanceId)
    if (!bindings.length) return null
    const result = await execute(CACHED_SPACE_SCRIPT, {
      EYPC_WINDOW_SPACE_BINDINGS: JSON.stringify(bindings),
      EYPC_WINDOW_SPACE_SWITCH: shouldSwitch ? '1' : '0'
    })
    cache.updateCurrentByDisplay(result.currentByDisplay)
    if (result.detail === 'cache-stale' || result.nativeQueryFailed) {
      cache.clearSpaceBindings(parsed.instanceId)
      return null
    }
    return { ...result, instanceId: parsed.instanceId, bindingSource: 'session-cache', cacheHit: true }
  }

  async function prepare(window, options = {}) {
    const shouldSwitch = options.switch !== false
    if (options.forceRefresh !== true) {
      const cached = await useCached(window, shouldSwitch)
      if (cached) return cached
    }
    return resolve(window, shouldSwitch)
  }

  return { prepare, resolve, useCached, parseMacWindow }
}

module.exports = { createMacosSpaceBridge, parseMacWindow }
