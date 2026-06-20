import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createShortcutHintTiming,
  MOUSE_TOOLTIP_DELAY_MS,
  SHORTCUT_HINT_DELAY_MS
} from '../../src/runtime/shortcutHintTiming'

function keyEvent(key: string, init: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}) {
  return {
    key,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false
  }
}

describe('shortcut hint timing', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps mouse tooltip timing separate from keyboard shortcut hints', () => {
    expect(MOUSE_TOOLTIP_DELAY_MS).toBe(100)
    expect(MOUSE_TOOLTIP_DELAY_MS).not.toBe(SHORTCUT_HINT_DELAY_MS)
  })

  it('shows shortcut hints only after holding the standalone c- key delay', () => {
    vi.useFakeTimers()
    let visible = false
    const timing = createShortcutHintTiming({
      show: () => { visible = true },
      hide: () => { visible = false }
    })

    timing.keydown(keyEvent('Control', { ctrlKey: true }))
    expect(visible).toBe(false)

    vi.advanceTimersByTime(SHORTCUT_HINT_DELAY_MS - 1)
    expect(visible).toBe(false)

    vi.advanceTimersByTime(1)
    expect(visible).toBe(true)

    timing.keyup(keyEvent('Control'))
    expect(visible).toBe(false)
  })

  it('cancels the pending hint when c- becomes a combined shortcut', () => {
    vi.useFakeTimers()
    let visible = false
    const timing = createShortcutHintTiming({
      show: () => { visible = true },
      hide: () => { visible = false }
    })

    timing.keydown(keyEvent('Control', { ctrlKey: true }))
    timing.keydown(keyEvent('f', { ctrlKey: true }))
    vi.advanceTimersByTime(SHORTCUT_HINT_DELAY_MS)
    expect(visible).toBe(false)

    timing.keyup(keyEvent('f', { ctrlKey: true }))
    timing.keyup(keyEvent('Control'))
    expect(visible).toBe(false)
  })

  it('hides an already visible hint when another key is pressed with c-', () => {
    vi.useFakeTimers()
    let visible = false
    const timing = createShortcutHintTiming({
      show: () => { visible = true },
      hide: () => { visible = false }
    })

    timing.keydown(keyEvent('Meta', { metaKey: true }))
    vi.advanceTimersByTime(SHORTCUT_HINT_DELAY_MS)
    expect(visible).toBe(true)

    timing.keydown(keyEvent('1', { metaKey: true }))
    expect(visible).toBe(false)
  })
})
