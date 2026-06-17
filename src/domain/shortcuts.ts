export interface ShortcutEventLike {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift'] as const
const MODIFIER_ALIASES: Record<string, string> = {
  c: 'Ctrl',
  ctrl: 'Ctrl',
  ctl: 'Ctrl',
  control: 'Ctrl',
  cmd: 'Ctrl',
  command: 'Ctrl',
  meta: 'Ctrl',
  a: 'Alt',
  alt: 'Alt',
  option: 'Alt',
  opt: 'Alt',
  s: 'Shift',
  shift: 'Shift'
}

const KEY_ALIASES: Record<string, string> = {
  cr: 'Enter',
  enter: 'Enter',
  return: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  space: 'Space',
  spacebar: 'Space',
  sp: 'Space',
  tab: 'Tab',
  arrowup: 'ArrowUp',
  up: 'ArrowUp',
  '↑': 'ArrowUp',
  arrowdown: 'ArrowDown',
  down: 'ArrowDown',
  '↓': 'ArrowDown',
  arrowleft: 'ArrowLeft',
  left: 'ArrowLeft',
  '←': 'ArrowLeft',
  arrowright: 'ArrowRight',
  right: 'ArrowRight',
  '→': 'ArrowRight',
  pageup: 'PageUp',
  pgup: 'PageUp',
  pagedown: 'PageDown',
  pgdn: 'PageDown',
  delete: 'Delete',
  del: 'Delete',
  backspace: 'Backspace',
  bs: 'Backspace'
}

const DISPLAY_KEYS: Record<string, string> = {
  Enter: 'cr',
  Escape: 'esc',
  Space: 'space',
  Tab: 'tab',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  PageUp: 'pgup',
  PageDown: 'pgdn',
  Delete: 'del',
  Backspace: 'backspace'
}

function normalizeKeyToken(value: string): string {
  const lower = value.toLowerCase()
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower]
  if (/^f\d{1,2}$/i.test(value)) return value.toUpperCase()
  return value.length === 1 ? value.toUpperCase() : value
}

export function normalizeShortcutId(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw === '*') return '*'
  const separator = raw.includes('+') ? '+' : '-'
  const parts = raw.split(separator).map((part) => part.trim()).filter(Boolean)
  const modifiers = new Set<string>()
  let key = ''
  for (const [index, part] of parts.entries()) {
    const lower = part.toLowerCase()
    const modifier = MODIFIER_ALIASES[lower]
    if (modifier && index < parts.length - 1) modifiers.add(modifier)
    else key = normalizeKeyToken(part)
  }
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].filter(Boolean).join('+')
}

export function shortcutFromEvent(event: ShortcutEventLike): string {
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  const keyMap: Record<string, string> = {
    ' ': 'Space',
    Enter: 'Enter',
    Escape: 'Escape',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    Tab: 'Tab',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Delete: 'Delete',
    Backspace: 'Backspace'
  }
  const key = keyMap[event.key] || (event.key.length === 1 ? event.key.toUpperCase() : event.key)
  return normalizeShortcutId([...parts, key].join('+'))
}

export function formatShortcutLabel(value: string): string {
  const normalized = normalizeShortcutId(value)
  if (!normalized) return ''
  if (normalized === '*') return '*'
  return normalized.split('+').map((part) => {
    if (part === 'Ctrl') return 'c'
    if (part === 'Alt') return 'a'
    if (part === 'Shift') return 's'
    return DISPLAY_KEYS[part] || part.toLowerCase()
  }).join('-')
}

export function formatShortcutList(values: string[]): string {
  return [...new Set(values.map(formatShortcutLabel).filter(Boolean))].join(' / ')
}
