import type { AppTabId, KeybindingOverride } from '../../domain/types'

export interface KeybindingContext {
  tab?: AppTabId
  confirmOpen?: boolean
  textInputFocused?: boolean
}

export interface KeybindingDefinition {
  actionId: string
  shortcutId: string
  defaultShortcutId: string
  when: string
  source: 'system' | 'user' | 'removed'
  weight: number
  disabled?: boolean
}

export const DEFAULT_KEYBINDINGS: KeybindingDefinition[] = [
  { actionId: 'tab.next', shortcutId: 'Tab', defaultShortcutId: 'Tab', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'tab.prev', shortcutId: 'Shift+Tab', defaultShortcutId: 'Shift+Tab', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'tab.select.ports', shortcutId: 'Ctrl+1', defaultShortcutId: 'Ctrl+1', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'tab.select.favorites', shortcutId: 'Ctrl+2', defaultShortcutId: 'Ctrl+2', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'tab.select.settings', shortcutId: 'Ctrl+3', defaultShortcutId: 'Ctrl+3', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'search.focus', shortcutId: 'Ctrl+F', defaultShortcutId: 'Ctrl+F', when: '!confirmOpen', source: 'system', weight: 100 },
  { actionId: 'settings.open', shortcutId: 'Ctrl+Alt+Shift+S', defaultShortcutId: 'Ctrl+Alt+Shift+S', when: '!confirmOpen', source: 'system', weight: 100 },
  { actionId: 'list.up', shortcutId: 'ArrowUp', defaultShortcutId: 'ArrowUp', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'list.up', shortcutId: 'Ctrl+K', defaultShortcutId: 'Ctrl+K', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'list.down', shortcutId: 'ArrowDown', defaultShortcutId: 'ArrowDown', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'list.down', shortcutId: 'Ctrl+J', defaultShortcutId: 'Ctrl+J', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'list.pageUp', shortcutId: 'Alt+U', defaultShortcutId: 'Alt+U', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'list.pageDown', shortcutId: 'Alt+E', defaultShortcutId: 'Alt+E', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'list.toggleSelection', shortcutId: 'Space', defaultShortcutId: 'Space', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'ports.kill.confirm', shortcutId: 'Enter', defaultShortcutId: 'Enter', when: "tab == 'ports' && !textInputFocused", source: 'system', weight: 120 },
  { actionId: 'ports.kill.force', shortcutId: 'Ctrl+Enter', defaultShortcutId: 'Ctrl+Enter', when: "tab == 'ports' && !textInputFocused", source: 'system', weight: 120 },
  { actionId: 'ports.scan', shortcutId: 'Ctrl+R', defaultShortcutId: 'Ctrl+R', when: "tab == 'ports'", source: 'system', weight: 100 },
  { actionId: 'favorites.open', shortcutId: 'Enter', defaultShortcutId: 'Enter', when: "tab == 'favorites' && !textInputFocused", source: 'system', weight: 120 },
  { actionId: 'favorites.reveal', shortcutId: 'Ctrl+Enter', defaultShortcutId: 'Ctrl+Enter', when: "tab == 'favorites' && !textInputFocused", source: 'system', weight: 120 }
]

function valueOf(identifier: string, context: KeybindingContext): unknown {
  return context[identifier as keyof KeybindingContext] ?? false
}

function evaluateAtom(atom: string, context: KeybindingContext): boolean {
  const trimmed = atom.trim()
  if (!trimmed) return true
  if (trimmed.startsWith('!')) return !evaluateAtom(trimmed.slice(1), context)
  const compare = trimmed.match(/^([A-Za-z_][\w.-]*)\s*(==|!=)\s*['"]([^'"]+)['"]$/)
  if (compare) {
    const current = valueOf(compare[1], context)
    return compare[2] === '==' ? current === compare[3] : current !== compare[3]
  }
  return Boolean(valueOf(trimmed, context))
}

function evaluateWhen(when: string, context: KeybindingContext): boolean {
  if (!when.trim()) return true
  return when.split('&&').every((atom) => evaluateAtom(atom, context))
}

export function buildEffectiveKeybindings(overrides: KeybindingOverride[] = []): KeybindingDefinition[] {
  const result = DEFAULT_KEYBINDINGS.map((item) => ({ ...item }))
  for (const override of overrides) {
    const defaults = DEFAULT_KEYBINDINGS.filter((item) => item.actionId === override.commandId)
    if (override.source === 'removed' || override.disabled) {
      for (const item of defaults) item.disabled = true
      result.push({
        actionId: override.commandId,
        shortcutId: override.shortcutId,
        defaultShortcutId: defaults[0]?.defaultShortcutId || override.shortcutId,
        when: override.when || defaults[0]?.when || '',
        source: 'removed',
        weight: override.weight || 300,
        disabled: true
      })
      continue
    }
    for (const item of defaults) item.disabled = true
    result.push({
      actionId: override.commandId,
      shortcutId: override.shortcutId,
      defaultShortcutId: defaults[0]?.defaultShortcutId || override.shortcutId,
      when: override.when || defaults[0]?.when || '',
      source: 'user',
      weight: override.weight || 300
    })
  }
  return result
}

export function resolveKeybinding(bindings: KeybindingDefinition[], shortcutId: string, context: KeybindingContext): KeybindingDefinition | null {
  if (context.textInputFocused && shortcutId !== 'Escape') return null
  const candidates = bindings
    .filter((item) => item.shortcutId === shortcutId && evaluateWhen(item.when, context))
    .sort((a, b) => b.weight - a.weight)
  const winner = candidates[0]
  return winner && !winner.disabled && winner.source !== 'removed' ? winner : null
}

export function explainKeybinding(bindings: KeybindingDefinition[], shortcutId: string, context: KeybindingContext) {
  const candidates = bindings.filter((item) => item.shortcutId === shortcutId && evaluateWhen(item.when, context)).sort((a, b) => b.weight - a.weight)
  const winner = resolveKeybinding(bindings, shortcutId, context)
  if (candidates[0]?.disabled || candidates[0]?.source === 'removed') {
    return { key: shortcutId, winner: null, level: 'blocked' as const, reason: '用户禁用了该快捷键', candidates }
  }
  return {
    key: shortcutId,
    winner: winner?.actionId ?? null,
    level: winner ? (winner.source === 'user' ? 'override' as const : 'ok' as const) : 'unmatched' as const,
    reason: winner ? (winner.source === 'user' ? '用户快捷键覆盖默认绑定' : '默认快捷键生效') : '未匹配快捷键',
    candidates
  }
}
