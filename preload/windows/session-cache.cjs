'use strict'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeSpaceBindings(bindings) {
  const seen = new Set()
  const result = []
  for (const binding of Array.isArray(bindings) ? bindings : []) {
    const displayUuid = normalizeText(binding && binding.displayUuid)
    const spaceId = normalizeText(binding && binding.spaceId)
    const source = normalizeText(binding && binding.source) || 'unknown'
    if (!displayUuid || !/^\d+$/.test(spaceId)) continue
    const key = `${displayUuid}\u0000${spaceId}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ displayUuid, spaceId, source })
  }
  return result
}

function createWindowSessionCache(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now
  const records = new Map()
  const currentByDisplay = new Map()
  let evidenceGeneration = 0

  function recordFor(instanceId) {
    return records.get(normalizeText(instanceId)) || null
  }

  function ensure(window) {
    const instanceId = normalizeText(window && window.instanceId)
    if (!instanceId) return null
    const existing = records.get(instanceId)
    if (existing) return existing
    const created = {
      instanceId,
      nativeRef: normalizeText(window && window.nativeRef),
      platform: normalizeText(window && window.platform),
      pid: Math.max(0, Math.trunc(Number(window && window.pid) || 0)),
      appId: normalizeText(window && (window.appId || window.appName)),
      rootInstanceId: normalizeText(window && (window.rootInstanceId || window.instanceId)),
      spaceBindings: [],
      liveness: 'temporarily-unobserved',
      lastObservedAt: 0,
      lastVerifiedAt: 0,
      evidenceGeneration: 0
    }
    records.set(instanceId, created)
    return created
  }

  function observe(window, evidence = 'native-window') {
    const record = ensure(window)
    if (!record) return null
    const checkedAt = now()
    evidenceGeneration += 1
    record.nativeRef = normalizeText(window.nativeRef) || record.nativeRef
    record.platform = normalizeText(window.platform) || record.platform
    record.pid = Math.max(0, Math.trunc(Number(window.pid) || record.pid))
    record.appId = normalizeText(window.appId || window.appName) || record.appId
    record.rootInstanceId = normalizeText(window.rootInstanceId || window.instanceId) || record.rootInstanceId
    record.liveness = 'verified-live'
    record.lastObservedAt = checkedAt
    record.lastVerifiedAt = checkedAt
    record.evidence = evidence
    record.evidenceGeneration = evidenceGeneration
    return { ...record, spaceBindings: record.spaceBindings.map((binding) => ({ ...binding })) }
  }

  function markUnobserved(window) {
    const record = ensure(window)
    if (!record || record.liveness === 'verified-gone') return record
    evidenceGeneration += 1
    record.liveness = 'temporarily-unobserved'
    record.evidenceGeneration = evidenceGeneration
    return record
  }

  function markIndeterminate(window, reason = 'native-query-failed') {
    const record = ensure(window)
    if (!record || record.liveness === 'verified-gone') return record
    evidenceGeneration += 1
    record.liveness = 'indeterminate'
    record.evidence = reason
    record.evidenceGeneration = evidenceGeneration
    return record
  }

  function markGone(window, reason) {
    const record = ensure(window)
    if (!record) return null
    evidenceGeneration += 1
    record.liveness = 'verified-gone'
    record.evidence = normalizeText(reason) || 'native-window-absent'
    record.lastVerifiedAt = now()
    record.spaceBindings = []
    record.evidenceGeneration = evidenceGeneration
    return record
  }

  function observeInventory(platform, windows) {
    const platformId = normalizeText(platform)
    const rows = (Array.isArray(windows) ? windows : []).filter((window) => normalizeText(window && window.platform) === platformId)
    const observedIds = new Set(rows.map((window) => normalizeText(window && window.instanceId)).filter(Boolean))
    for (const record of records.values()) {
      if (record.platform === platformId && !observedIds.has(record.instanceId)) markUnobserved(record)
    }
    for (const window of rows) observe(window, 'native-window')
  }

  function setSpaceBindings(instanceId, bindings) {
    const record = records.get(normalizeText(instanceId))
    if (!record) return []
    record.spaceBindings = normalizeSpaceBindings(bindings)
    return record.spaceBindings.map((binding) => ({ ...binding }))
  }

  function getSpaceBindings(instanceId) {
    return (recordFor(instanceId)?.spaceBindings || []).map((binding) => ({ ...binding }))
  }

  function clearSpaceBindings(instanceId) {
    const record = recordFor(instanceId)
    if (record) record.spaceBindings = []
  }

  function updateCurrentByDisplay(value) {
    const entries = value instanceof Map ? [...value.entries()] : Object.entries(value && typeof value === 'object' ? value : {})
    for (const [displayUuidValue, spaceIdValue] of entries) {
      const displayUuid = normalizeText(displayUuidValue)
      const spaceId = normalizeText(spaceIdValue)
      if (displayUuid && /^\d+$/.test(spaceId)) currentByDisplay.set(displayUuid, spaceId)
    }
  }

  function getCurrentByDisplay() {
    return Object.fromEntries(currentByDisplay)
  }

  function snapshot() {
    return [...records.values()].map((record) => ({
      ...record,
      spaceBindings: record.spaceBindings.map((binding) => ({ ...binding }))
    }))
  }

  return {
    observe,
    ensure,
    recordFor,
    markUnobserved,
    markIndeterminate,
    markGone,
    observeInventory,
    setSpaceBindings,
    getSpaceBindings,
    clearSpaceBindings,
    updateCurrentByDisplay,
    getCurrentByDisplay,
    snapshot
  }
}

module.exports = { createWindowSessionCache, normalizeSpaceBindings }
