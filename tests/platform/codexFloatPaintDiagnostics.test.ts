import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createCodexFloatPaintDiagnostics } = require('../../preload/codex/float-paint-diagnostics.cjs')

function image(width: number, height: number, value = 180, alpha = 255) {
  const bitmap = Buffer.alloc(48 * 48 * 4)
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    bitmap[offset] = value
    bitmap[offset + 1] = value
    bitmap[offset + 2] = value
    bitmap[offset + 3] = alpha
  }
  return {
    getSize: () => ({ width, height }),
    isEmpty: () => false,
    toBitmap: () => bitmap,
    resize: () => ({ getSize: () => ({ width: 48, height: 48 }), toBitmap: () => bitmap })
  }
}

function harness(nativeImage?: { createFromBuffer: (buffer: Buffer) => any }) {
  const events: any[] = []
  const display = { id: 17, bounds: { x: -1280, y: -100, width: 1280, height: 800 }, scaleFactor: 1.5 }
  const bounds = { x: -1260, y: -80, width: 360, height: 352 }
  const crop = vi.fn(() => image(540, 528))
  const desktopImage = { getSize: () => ({ width: 1920, height: 1200 }), crop }
  const captureDisplay = vi.fn(async () => [{ display, image: desktopImage }])
  const capturePage = vi.fn(async () => image(360, 352))
  const settings = { enabled: true, level: 'debug' }
  const diagnostics = createCodexFloatPaintDiagnostics({
    utools: { captureDisplay },
    process: { platform: 'win32', versions: { electron: 'test-version' } },
    requireElectron: () => ({ nativeImage }),
    runtimeDiagnostics: { record: (event: any) => events.push(event), snapshot: () => ({ settings }) }
  })
  const context = {
    sequence: 1, requestId: 2, windowGeneration: 3, expanded: true,
    window: { getBounds: () => bounds, getContentBounds: () => bounds, webContents: { capturePage } },
    display, observation: { expanded: true, panelVisible: true, windowGeneration: 3, geometrySequence: 1 },
    isCurrent: () => true
  }
  return { diagnostics, context, events, crop, capturePage, captureDisplay, display, desktopImage, settings }
}

afterEach(() => vi.useRealTimers())

describe('Windows float painted content diagnostics', () => {
  it('compares page pixels with the desktop window region using monitor-local physical pixels', async () => {
    const fixture = harness()
    const order: string[] = []
    fixture.captureDisplay.mockImplementation(async () => {
      order.push('desktop')
      return [{ display: fixture.display, image: fixture.desktopImage }]
    })
    fixture.capturePage.mockImplementation(async () => {
      order.push('page')
      return image(360, 352)
    })
    await fixture.diagnostics.observe(fixture.context)
    expect(order).toEqual(['desktop', 'page', 'desktop'])
    expect(fixture.captureDisplay).toHaveBeenCalledWith({ displayId: 17 })
    expect(fixture.crop).toHaveBeenCalledWith({ x: 30, y: 30, width: 540, height: 528 })
    expect(fixture.events[0]).toMatchObject({
      scope: 'float-paint', event: 'capture', outcome: 'observed',
      details: {
        sequence: 1, requestId: 2, windowGeneration: 3, noImageFiles: true,
        beforeComparison: { matchingRatio: 1, meanRgbDifference: 0 },
        page: { width: 360, height: 352, opaqueRatio: 1 }
      }
    })
    expect(fixture.events[0].details.page.fingerprint).toHaveLength(24)
    expect(JSON.stringify(fixture.events)).not.toContain('bytes')
    expect(JSON.stringify(fixture.events)).not.toContain('data:image')
  })

  it('distinguishes a stale desktop image from page pixels and a capture-induced repaint', async () => {
    const fixture = harness()
    fixture.crop.mockReturnValueOnce(image(540, 528, 0)).mockReturnValueOnce(image(540, 528))
    await fixture.diagnostics.observe(fixture.context)
    expect(fixture.events[0].details).toMatchObject({
      beforeComparison: { matchingRatio: 0, meanRgbDifference: 180 },
      afterComparison: { matchingRatio: 1, meanRgbDifference: 0 }
    })
  })

  it('records transparent page content without claiming the desktop matches', async () => {
    const fixture = harness()
    fixture.capturePage.mockResolvedValue(image(360, 352, 0, 0))
    await fixture.diagnostics.observe(fixture.context)
    expect(fixture.events[0].details).toMatchObject({
      page: { nonTransparentRatio: 0, alphaBounds: null },
      beforeComparison: { comparedPixels: 0, matchingRatio: null }
    })
  })

  it('records permission rejection and does not retain the original error message', async () => {
    const fixture = harness()
    fixture.capturePage.mockRejectedValue(Object.assign(new Error('private command and path'), { code: 'EPERM' }))
    await fixture.diagnostics.observe(fixture.context)
    expect(fixture.events[0]).toMatchObject({
      outcome: 'partial', details: { page: { outcome: 'failed', code: 'EPERM' }, beforeComparison: null }
    })
    expect(JSON.stringify(fixture.events)).not.toContain('private command and path')
  })

  it('reports unsupported host APIs instead of manufacturing screen evidence', async () => {
    const fixture = harness()
    const events: any[] = []
    const diagnostics = createCodexFloatPaintDiagnostics({
      utools: {}, process: { platform: 'win32' },
      runtimeDiagnostics: { record: (event: any) => events.push(event), snapshot: () => ({ settings: fixture.settings }) }
    })
    await diagnostics.observe({ ...fixture.context, window: { getBounds: () => fixture.context.window.getBounds() } })
    expect(events[0]).toMatchObject({
      outcome: 'partial', details: {
        pageCaptureAvailable: false, desktopCaptureAvailable: false,
        page: { code: 'unsupported' }, desktopBefore: { code: 'unsupported' }
      }
    })
  })

  it('does not capture when diagnostics are disabled or below debug level', async () => {
    const fixture = harness()
    fixture.settings.enabled = false
    await fixture.diagnostics.observe(fixture.context)
    fixture.settings.enabled = true
    fixture.settings.level = 'info'
    await fixture.diagnostics.observe(fixture.context)
    expect(fixture.captureDisplay).not.toHaveBeenCalled()
    expect(fixture.capturePage).not.toHaveBeenCalled()
  })

  it('keeps macOS outside the Windows pixel capture path', async () => {
    const fixture = harness()
    const diagnostics = createCodexFloatPaintDiagnostics({
      utools: { captureDisplay: fixture.captureDisplay },
      process: { platform: 'darwin' },
      runtimeDiagnostics: {
        snapshot: () => ({ settings: fixture.settings }),
        record: (event: any) => fixture.events.push(event)
      }
    })
    await diagnostics.observe(fixture.context)
    expect(fixture.events).toEqual([])
    expect(fixture.captureDisplay).not.toHaveBeenCalled()
    expect(fixture.capturePage).not.toHaveBeenCalled()
  })

  it('records why enabled diagnostics skip pixels without repeating the same gate', async () => {
    const fixture = harness()
    fixture.settings.level = 'info'
    await fixture.diagnostics.observe(fixture.context)
    await fixture.diagnostics.observe({ ...fixture.context, sequence: 2 })
    expect(fixture.events).toHaveLength(1)
    expect(fixture.events[0]).toMatchObject({
      scope: 'float-paint', event: 'capture-skipped', outcome: 'debug-required',
      details: { sequence: 1, windowGeneration: 3 }
    })
    expect(fixture.captureDisplay).not.toHaveBeenCalled()
  })

  it('keeps the newest geometry observation while the previous capture is still pending', async () => {
    const fixture = harness()
    let finish: ((value: any) => void) | undefined
    let currentSequence = 1
    fixture.captureDisplay.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const pending = fixture.diagnostics.observe({ ...fixture.context, isCurrent: () => currentSequence === 1 })
    await Promise.resolve()
    currentSequence = 2
    await fixture.diagnostics.observe({ ...fixture.context, sequence: 2, isCurrent: () => currentSequence === 2 })
    currentSequence = 3
    await fixture.diagnostics.observe({ ...fixture.context, sequence: 3, isCurrent: () => currentSequence === 3 })
    finish?.([{ display: fixture.display, image: fixture.desktopImage }])
    await pending
    const captures = fixture.events.filter((entry) => entry.event === 'capture')
    expect(captures.map((entry) => [entry.details.sequence, entry.outcome])).toEqual([[1, 'stale'], [3, 'observed']])
    expect(fixture.capturePage).toHaveBeenCalledTimes(1)
  })

  it('uses Electron bitmap conversion for the documented host NativeImage wrapper', async () => {
    const png = Buffer.from('synthetic-image')
    const createFromBuffer = vi.fn(() => image(360, 352))
    const fixture = harness({ createFromBuffer })
    fixture.capturePage.mockResolvedValue({
      getSize: () => ({ width: 360, height: 352 }),
      isEmpty: () => false,
      toPNG: () => png
    } as any)
    await fixture.diagnostics.observe(fixture.context)
    expect(createFromBuffer).toHaveBeenCalledWith(png)
    expect(fixture.events[0]).toMatchObject({
      outcome: 'observed', details: { page: { width: 360, height: 352 }, beforeComparison: { matchingRatio: 1 } }
    })
    expect(JSON.stringify(fixture.events)).not.toContain('synthetic-image')
  })

  it('stops after twelve observations per native window generation', async () => {
    const fixture = harness()
    for (let sequence = 0; sequence < 14; sequence += 1) {
      await fixture.diagnostics.observe({ ...fixture.context, sequence })
    }
    expect(fixture.capturePage).toHaveBeenCalledTimes(12)
    expect(fixture.events.filter((entry) => entry.event === 'capture-skipped')).toMatchObject([
      { outcome: 'budget-exhausted', details: { windowGeneration: 3, attempts: 12 } }
    ])
    await fixture.diagnostics.observe({ ...fixture.context, windowGeneration: 4 })
    expect(fixture.capturePage).toHaveBeenCalledTimes(13)
  })

  it('rejects a capture completed after the window or geometry changed', async () => {
    const fixture = harness()
    let finish: ((value: any) => void) | undefined
    let current = true
    fixture.captureDisplay.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const pending = fixture.diagnostics.observe({ ...fixture.context, isCurrent: () => current })
    await Promise.resolve()
    current = false
    finish?.([{ display: fixture.display, image: fixture.desktopImage }])
    await pending
    expect(fixture.events[0].outcome).toBe('stale')
    expect(fixture.capturePage).not.toHaveBeenCalled()
  })

  it('bounds a hung capture and stops retrying it in the same generation', async () => {
    vi.useFakeTimers()
    const fixture = harness()
    fixture.captureDisplay.mockImplementation(() => new Promise(() => {}))
    const pending = fixture.diagnostics.observe(fixture.context)
    await vi.advanceTimersByTimeAsync(1500)
    await pending
    expect(fixture.events[0]).toMatchObject({
      outcome: 'timeout', details: { desktopBefore: { outcome: 'failed', code: 'timeout' } }
    })
    await fixture.diagnostics.observe(fixture.context)
    expect(fixture.captureDisplay).toHaveBeenCalledTimes(1)
  })

  it('does not start queued work after a capture times out', async () => {
    vi.useFakeTimers()
    const fixture = harness()
    fixture.captureDisplay.mockImplementation(() => new Promise(() => {}))
    const pending = fixture.diagnostics.observe(fixture.context)
    await Promise.resolve()
    await fixture.diagnostics.observe({ ...fixture.context, sequence: 2 })
    await vi.advanceTimersByTimeAsync(1500)
    await pending
    expect(fixture.captureDisplay).toHaveBeenCalledTimes(1)
    expect(fixture.capturePage).not.toHaveBeenCalled()
    expect(fixture.events.some((entry) => entry.event === 'capture' && entry.outcome === 'timeout')).toBe(true)
  })

  it('does not compare a clipped display region against a complete page', async () => {
    const fixture = harness()
    fixture.context.window.getBounds = () => ({ x: -1300, y: -80, width: 360, height: 352 })
    fixture.context.window.getContentBounds = fixture.context.window.getBounds
    await fixture.diagnostics.observe(fixture.context)
    expect(fixture.events[0].details).toMatchObject({
      desktopBefore: { clipped: true }, beforeComparison: null
    })
  })

  it('preserves pixel summaries and client bounds through the real diagnostic file writer', async () => {
    const fixture = harness()
    await fixture.diagnostics.observe(fixture.context)
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eypc-paint-diagnostics-'))
    try {
      const { createRuntimeDiagnostics } = require('../../preload/diagnostics.cjs')
      const writer = createRuntimeDiagnostics({ fs, path, directory, settings: fixture.settings })
      writer.record(fixture.events[0])
      await writer.flush()
      const events = fs.readFileSync(writer.snapshot().activeFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
      const persisted = events.find((entry) => entry.scope === 'float-paint')
      expect(persisted.details).toMatchObject({
        clientBounds: fixture.context.window.getBounds(),
        page: { opaqueRatio: 1, fingerprint: fixture.events[0].details.page.fingerprint },
        beforeComparison: { matchingRatio: 1 }
      })
    } finally { fs.rmSync(directory, { recursive: true, force: true }) }
  })
})
