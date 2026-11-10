'use strict'

const { createHash } = require('node:crypto')

function createCodexFloatPaintDiagnostics(dependencies = {}) {
  const { runtimeDiagnostics, utools, process, requireElectron } = dependencies
  const pendingGenerations = new Set()
  const pendingSources = new Map()
  const skippedReasons = new Set()
  let generation = null
  let attempts = 0
  let timedOut = false
  let nativeImage = null
  try { nativeImage = requireElectron?.()?.nativeImage || null } catch {}

  function captureError(code) {
    const error = new Error(code)
    error.code = code
    return error
  }

  function errorCode(error) {
    return [
      'unsupported', 'timeout', 'stale', 'image-empty', 'image-invalid', 'bitmap-unavailable',
      'display-missing', 'crop-unavailable', 'outside-display', 'ENOENT', 'EACCES', 'EPERM'
    ].includes(error?.code) ? error.code : 'capture-failed'
  }

  function rectangle(value) {
    if (!value || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key]))
      || value.width <= 0 || value.height <= 0) return null
    return { x: value.x, y: value.y, width: value.width, height: value.height }
  }

  async function bounded(operation) {
    let timer
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise((resolve, reject) => {
          timer = setTimeout(() => reject(captureError('timeout')), 1500)
          timer?.unref?.()
        })
      ])
    } finally { clearTimeout(timer) }
  }

  function pixels(image) {
    const size = image?.getSize?.()
    if (!size || !Number.isInteger(size.width) || !Number.isInteger(size.height)
      || size.width <= 0 || size.height <= 0 || size.width > 4096 || size.height > 4096) {
      throw captureError('image-invalid')
    }
    if (image.isEmpty?.()) throw captureError('image-empty')
    let local = image
    if (typeof local.resize !== 'function' || typeof local.toBitmap !== 'function') {
      if (!nativeImage || typeof image.toPNG !== 'function') throw captureError('bitmap-unavailable')
      local = nativeImage.createFromBuffer(image.toPNG())
    }
    const sampled = local.resize({ width: 48, height: 48, quality: 'good' })
    const sampledSize = sampled.getSize()
    const bytes = sampled.toBitmap({ scaleFactor: 1 })
    if (sampledSize.width !== 48 || sampledSize.height !== 48 || !bytes || bytes.length !== 48 * 48 * 4) {
      throw captureError('image-invalid')
    }
    let nonTransparent = 0
    let opaque = 0
    let minX = 48
    let minY = 48
    let maxX = -1
    let maxY = -1
    for (let row = 0; row < 48; row += 1) {
      for (let column = 0; column < 48; column += 1) {
        const alpha = bytes[(row * 48 + column) * 4 + 3]
        if (alpha >= 240) opaque += 1
        if (alpha > 8) {
          nonTransparent += 1
          minX = Math.min(minX, column)
          maxX = Math.max(maxX, column)
          minY = Math.min(minY, row)
          maxY = Math.max(maxY, row)
        }
      }
    }
    return {
      bytes,
      summary: {
        width: size.width, height: size.height, sampledWidth: 48, sampledHeight: 48,
        nonTransparentRatio: nonTransparent / (48 * 48), opaqueRatio: opaque / (48 * 48),
        alphaBounds: maxX < 0 ? null : {
          x: minX * size.width / 48, y: minY * size.height / 48,
          width: (maxX - minX + 1) * size.width / 48, height: (maxY - minY + 1) * size.height / 48
        },
        fingerprint: createHash('sha256').update(bytes).digest('hex').slice(0, 24)
      }
    }
  }

  function compare(page, desktop) {
    if (!page?.bytes || !desktop?.bytes) return null
    let count = 0
    let matched = 0
    let difference = 0
    for (let offset = 0; offset < page.bytes.length; offset += 4) {
      if (page.bytes[offset + 3] < 240) continue
      const distance = (
        Math.abs(page.bytes[offset] - desktop.bytes[offset])
        + Math.abs(page.bytes[offset + 1] - desktop.bytes[offset + 1])
        + Math.abs(page.bytes[offset + 2] - desktop.bytes[offset + 2])
      ) / 3
      count += 1
      difference += distance
      if (distance <= 24) matched += 1
    }
    return {
      comparedPixels: count,
      matchingRatio: count ? matched / count : null,
      meanRgbDifference: count ? difference / count : null
    }
  }

  function cropDisplay(captures, context) {
    const capture = Array.isArray(captures)
      ? captures.find((item) => String(item?.display?.id) === String(context.display.id)) : null
    if (!capture) throw captureError('display-missing')
    const display = rectangle(capture.display?.bounds)
    const size = capture.image?.getSize?.()
    const bounds = context.contentBounds || context.bounds
    if (!display || !size || !Number.isFinite(size.width) || !Number.isFinite(size.height)
      || size.width <= 0 || size.height <= 0) throw captureError('image-invalid')
    const left = Math.max(0, Math.floor((bounds.x - display.x) * size.width / display.width))
    const top = Math.max(0, Math.floor((bounds.y - display.y) * size.height / display.height))
    const right = Math.min(size.width, Math.ceil((bounds.x + bounds.width - display.x) * size.width / display.width))
    const bottom = Math.min(size.height, Math.ceil((bounds.y + bounds.height - display.y) * size.height / display.height))
    if (right <= left || bottom <= top) throw captureError('outside-display')
    if (typeof capture.image?.crop !== 'function') throw captureError('crop-unavailable')
    const clipped = bounds.x < display.x || bounds.y < display.y
      || bounds.x + bounds.width > display.x + display.width || bounds.y + bounds.height > display.y + display.height
    return {
      ...pixels(capture.image.crop({ x: left, y: top, width: right - left, height: bottom - top })),
      clipped,
      displayScaleX: size.width / display.width,
      displayScaleY: size.height / display.height
    }
  }

  async function observe(source) {
    const settings = runtimeDiagnostics?.snapshot?.()?.settings
    if (process?.platform !== 'win32' || settings?.enabled !== true) return
    if (source.windowGeneration !== generation) {
      generation = source.windowGeneration
      attempts = 0
      timedOut = false
      skippedReasons.clear()
    }
    function skip(outcome) {
      if (skippedReasons.has(outcome)) return
      skippedReasons.add(outcome)
      runtimeDiagnostics.record({
        level: 'info', scope: 'float-paint', event: 'capture-skipped', outcome,
        details: {
          sequence: source.sequence, requestId: source.requestId, windowGeneration: generation,
          expanded: source.expanded, attempts
        }
      })
    }
    if (settings.level !== 'debug') { skip('debug-required'); return }
    if (attempts >= 12) { skip('budget-exhausted'); return }
    if (timedOut) { skip('timeout-backoff'); return }
    if (!source.isCurrent()) { skip('stale'); return }
    if (pendingGenerations.has(generation)) {
      pendingSources.set(generation, source)
      skip('capture-in-progress')
      return
    }
    attempts += 1
    const currentGeneration = generation
    pendingGenerations.add(currentGeneration)
    const startedAt = Date.now()
    const context = {
      sequence: source.sequence, requestId: source.requestId, windowGeneration: currentGeneration,
      expanded: source.expanded, bounds: null,
      contentBounds: null, display: source.display, observation: source.observation
    }
    try { context.bounds = rectangle(source.window.getBounds()) } catch {}
    try { context.contentBounds = rectangle(source.window.getContentBounds?.()) } catch {}
    const desktopCaptureAvailable = typeof utools?.captureDisplay === 'function'
    let pageOwner = null
    let pageCaptureAvailable = false
    try {
      pageOwner = typeof source.window.webContents?.capturePage === 'function'
        ? source.window.webContents : source.window
      pageCaptureAvailable = typeof pageOwner.capturePage === 'function'
    } catch {}
    const details = {
      sequence: context.sequence, requestId: context.requestId, windowGeneration: context.windowGeneration,
      expanded: context.expanded, bounds: context.bounds, clientBounds: context.contentBounds,
      displayId: String(source.display?.id || ''), scaleFactor: source.display?.scaleFactor ?? null,
      observation: context.observation || null,
      desktopCaptureAvailable, pageCaptureAvailable,
      electronVersion: typeof process.versions?.electron === 'string' ? process.versions.electron.slice(0, 64) : '',
      chromeVersion: typeof process.versions?.chrome === 'string' ? process.versions.chrome.slice(0, 64) : '',
      desktopBefore: null, page: null, desktopAfter: null, beforeComparison: null, afterComparison: null,
      captureOrder: 'desktop-before,page,desktop-after',
      noImageFiles: true
    }
    let desktopBefore = null
    let page = null
    let desktopAfter = null
    async function take(kind, operation) {
      if (!source.isCurrent()) throw captureError('stale')
      try {
        const result = await bounded(operation)
        if (!source.isCurrent()) throw captureError('stale')
        return result
      } catch (error) {
        if (errorCode(error) === 'stale') throw error
        details[kind] = { outcome: 'failed', code: errorCode(error) }
        if (errorCode(error) === 'timeout') {
          if (generation === currentGeneration) timedOut = true
          throw error
        }
        return null
      }
    }
    async function desktop() {
      if (!desktopCaptureAvailable) throw captureError('unsupported')
      const captures = await utools.captureDisplay({ displayId: source.display.id })
      if (!source.isCurrent()) throw captureError('stale')
      return cropDisplay(captures, context)
    }
    try {
      if (!context.bounds) throw captureError('image-invalid')
      desktopBefore = await take('desktopBefore', desktop)
      if (desktopBefore) details.desktopBefore = {
        ...desktopBefore.summary, clipped: desktopBefore.clipped,
        displayScaleX: desktopBefore.displayScaleX, displayScaleY: desktopBefore.displayScaleY
      }
      page = await take('page', async () => {
        if (!pageCaptureAvailable) throw captureError('unsupported')
        const captured = await pageOwner.capturePage()
        if (!source.isCurrent()) throw captureError('stale')
        return pixels(captured)
      })
      if (page) details.page = page.summary
      desktopAfter = await take('desktopAfter', desktop)
      if (desktopAfter) details.desktopAfter = {
        ...desktopAfter.summary, clipped: desktopAfter.clipped,
        displayScaleX: desktopAfter.displayScaleX, displayScaleY: desktopAfter.displayScaleY
      }
      if (desktopBefore && !desktopBefore.clipped) details.beforeComparison = compare(page, desktopBefore)
      if (desktopAfter && !desktopAfter.clipped) details.afterComparison = compare(page, desktopAfter)
      if (!source.isCurrent()) throw captureError('stale')
      runtimeDiagnostics.record({
        level: 'info', scope: 'float-paint', event: 'capture',
        outcome: page && desktopBefore && desktopAfter ? 'observed' : 'partial',
        durationMs: Date.now() - startedAt, details
      })
    } catch (error) {
      runtimeDiagnostics.record({
        level: errorCode(error) === 'stale' ? 'debug' : 'info',
        scope: 'float-paint', event: 'capture', outcome: errorCode(error),
        durationMs: Date.now() - startedAt, details
      })
    } finally {
      pendingGenerations.delete(currentGeneration)
      const pending = pendingSources.get(currentGeneration)
      pendingSources.delete(currentGeneration)
      if (pending && generation === currentGeneration) await observe(pending)
    }
  }

  return { observe }
}

module.exports = { createCodexFloatPaintDiagnostics }
