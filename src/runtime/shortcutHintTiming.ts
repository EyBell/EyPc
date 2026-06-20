export const SHORTCUT_HINT_DELAY_MS = 230
export const MOUSE_TOOLTIP_DELAY_MS = 100

export interface ShortcutHintEventLike {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

export interface ShortcutHintTimingOptions {
  show: () => void
  hide: () => void
  delayMs?: number
}

function isCommandModifierKey(key: string) {
  return key === 'Control' || key === 'Meta'
}

function isStandaloneCommandKeydown(event: ShortcutHintEventLike) {
  if (event.key === 'Control') return !event.metaKey && !event.shiftKey && !event.altKey
  if (event.key === 'Meta') return !event.ctrlKey && !event.shiftKey && !event.altKey
  return false
}

function hasCommandModifier(event: ShortcutHintEventLike) {
  return Boolean(event.ctrlKey || event.metaKey || isCommandModifierKey(event.key))
}

export function createShortcutHintTiming(options: ShortcutHintTimingOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let visible = false
  let blockedUntilRelease = false
  const delayMs = options.delayMs ?? SHORTCUT_HINT_DELAY_MS

  function clearTimer() {
    if (!timer) return
    clearTimeout(timer)
    timer = null
  }

  function hide() {
    clearTimer()
    if (!visible) return
    visible = false
    options.hide()
  }

  function schedule() {
    if (timer || visible) return
    timer = setTimeout(() => {
      timer = null
      if (blockedUntilRelease) return
      visible = true
      options.show()
    }, delayMs)
  }

  return {
    keydown(event: ShortcutHintEventLike) {
      if (isStandaloneCommandKeydown(event)) {
        if (!blockedUntilRelease) schedule()
        return
      }
      if (!hasCommandModifier(event)) return
      blockedUntilRelease = true
      hide()
    },
    keyup(event: ShortcutHintEventLike) {
      if (isCommandModifierKey(event.key) || (!event.ctrlKey && !event.metaKey)) {
        blockedUntilRelease = false
        hide()
      }
    },
    clear() {
      blockedUntilRelease = false
      hide()
    },
    dispose() {
      blockedUntilRelease = false
      hide()
      clearTimer()
    }
  }
}
