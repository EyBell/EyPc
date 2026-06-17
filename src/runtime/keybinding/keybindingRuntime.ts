import type { AppTabId, KeybindingOverride } from '../../domain/types'

export interface KeybindingContext {
  tab?: AppTabId
  confirmOpen?: boolean
  textInputFocused?: boolean
  activeInputRole?: 'port-search' | 'port-group-search' | 'favorite-search' | 'settings' | 'port-group-editor' | 'other'
  portPane?: 'groups' | 'results'
  portDrawerOpen?: boolean
  portDrawerActive?: boolean
  portDetailOpen?: boolean
  portDetailActive?: boolean
  portSelectionMode?: boolean
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

const DRAWER_SELECT_KEYBINDINGS: KeybindingDefinition[] = Array.from({ length: 9 }, (_, index) => {
  const number = index + 1
  return {
    actionId: `ports.drawer.select.${number}`,
    shortcutId: `Ctrl+${number}`,
    defaultShortcutId: `Ctrl+${number}`,
    when: "tab == 'ports' && portDrawerActive",
    source: 'system',
    weight: 300
  }
})

const DRAWER_DIRECT_ACTION_KEYBINDINGS: KeybindingDefinition[] = Array.from({ length: 9 }, (_, index) => {
  const number = index + 1
  return {
    actionId: `ports.drawer.action.${number}`,
    shortcutId: `Ctrl+Alt+${number}`,
    defaultShortcutId: `Ctrl+Alt+${number}`,
    when: "tab == 'ports' && !portDrawerActive && !textInputFocused",
    source: 'system',
    weight: 130
  }
})

export const DEFAULT_KEYBINDINGS: KeybindingDefinition[] = [
  { actionId: 'tab.next', shortcutId: 'Tab', defaultShortcutId: 'Tab', when: "tab != 'ports' && !textInputFocused", source: 'system', weight: 100 },
  { actionId: 'tab.prev', shortcutId: 'Shift+Tab', defaultShortcutId: 'Shift+Tab', when: "tab != 'ports' && !textInputFocused", source: 'system', weight: 100 },
  { actionId: 'tab.select.ports', shortcutId: 'Ctrl+1', defaultShortcutId: 'Ctrl+1', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'tab.select.favorites', shortcutId: 'Ctrl+2', defaultShortcutId: 'Ctrl+2', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'tab.select.settings', shortcutId: 'Ctrl+3', defaultShortcutId: 'Ctrl+3', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'search.focus', shortcutId: 'Ctrl+F', defaultShortcutId: 'Ctrl+F', when: '!confirmOpen', source: 'system', weight: 100 },
  { actionId: 'settings.open', shortcutId: 'Ctrl+Alt+Shift+S', defaultShortcutId: 'Ctrl+Alt+Shift+S', when: '!confirmOpen', source: 'system', weight: 100 },
  { actionId: 'list.up', shortcutId: 'ArrowUp', defaultShortcutId: 'ArrowUp', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'list.up', shortcutId: 'ArrowUp', defaultShortcutId: 'ArrowUp', when: "activeInputRole == 'port-search'", source: 'system', weight: 100 },
  { actionId: 'list.up', shortcutId: 'ArrowUp', defaultShortcutId: 'ArrowUp', when: "activeInputRole == 'port-group-search'", source: 'system', weight: 100 },
  { actionId: 'list.up', shortcutId: 'Ctrl+K', defaultShortcutId: 'Ctrl+K', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'list.up', shortcutId: 'Ctrl+K', defaultShortcutId: 'Ctrl+K', when: "activeInputRole == 'port-search'", source: 'system', weight: 100 },
  { actionId: 'list.up', shortcutId: 'Ctrl+K', defaultShortcutId: 'Ctrl+K', when: "activeInputRole == 'port-group-search'", source: 'system', weight: 100 },
  { actionId: 'list.down', shortcutId: 'ArrowDown', defaultShortcutId: 'ArrowDown', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'list.down', shortcutId: 'ArrowDown', defaultShortcutId: 'ArrowDown', when: "activeInputRole == 'port-search'", source: 'system', weight: 100 },
  { actionId: 'list.down', shortcutId: 'ArrowDown', defaultShortcutId: 'ArrowDown', when: "activeInputRole == 'port-group-search'", source: 'system', weight: 100 },
  { actionId: 'list.down', shortcutId: 'Ctrl+J', defaultShortcutId: 'Ctrl+J', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'list.down', shortcutId: 'Ctrl+J', defaultShortcutId: 'Ctrl+J', when: "activeInputRole == 'port-search'", source: 'system', weight: 100 },
  { actionId: 'list.down', shortcutId: 'Ctrl+J', defaultShortcutId: 'Ctrl+J', when: "activeInputRole == 'port-group-search'", source: 'system', weight: 100 },
  { actionId: 'list.pageUp', shortcutId: 'Alt+U', defaultShortcutId: 'Alt+U', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'list.pageDown', shortcutId: 'Alt+E', defaultShortcutId: 'Alt+E', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'list.toggleSelection', shortcutId: 'Space', defaultShortcutId: 'Space', when: '!textInputFocused', source: 'system', weight: 100 },
  { actionId: 'list.toggleSelection', shortcutId: 'Space', defaultShortcutId: 'Space', when: "activeInputRole == 'port-search'", source: 'system', weight: 100 },
  { actionId: 'ports.kill.confirm', shortcutId: 'Enter', defaultShortcutId: 'Enter', when: "tab == 'ports' && portPane != 'groups' && !textInputFocused", source: 'system', weight: 120 },
  { actionId: 'ports.kill.confirm', shortcutId: 'Enter', defaultShortcutId: 'Enter', when: "tab == 'ports' && portPane != 'groups' && activeInputRole == 'port-search'", source: 'system', weight: 120 },
  { actionId: 'ports.kill.force', shortcutId: 'Ctrl+Enter', defaultShortcutId: 'Ctrl+Enter', when: "tab == 'ports' && portPane != 'groups' && !textInputFocused", source: 'system', weight: 120 },
  { actionId: 'ports.kill.force', shortcutId: 'Ctrl+Enter', defaultShortcutId: 'Ctrl+Enter', when: "tab == 'ports' && portPane != 'groups' && activeInputRole == 'port-search'", source: 'system', weight: 120 },
  { actionId: 'ports.scan', shortcutId: 'Ctrl+R', defaultShortcutId: 'Ctrl+R', when: "tab == 'ports'", source: 'system', weight: 100 },
  { actionId: 'ports.pane.toggleNext', shortcutId: 'Tab', defaultShortcutId: 'Tab', when: "tab == 'ports' && !textInputFocused", source: 'system', weight: 130 },
  { actionId: 'ports.pane.togglePrev', shortcutId: 'Shift+Tab', defaultShortcutId: 'Shift+Tab', when: "tab == 'ports' && !textInputFocused", source: 'system', weight: 130 },
  { actionId: 'ports.pane.groups', shortcutId: 'Alt+ArrowLeft', defaultShortcutId: 'Alt+ArrowLeft', when: "tab == 'ports' && !textInputFocused", source: 'system', weight: 110 },
  { actionId: 'ports.pane.results', shortcutId: 'Alt+ArrowRight', defaultShortcutId: 'Alt+ArrowRight', when: "tab == 'ports' && !textInputFocused", source: 'system', weight: 110 },
  { actionId: 'ports.group.apply', shortcutId: 'Enter', defaultShortcutId: 'Enter', when: "tab == 'ports' && portPane == 'groups' && !textInputFocused", source: 'system', weight: 130 },
  { actionId: 'ports.group.apply', shortcutId: 'Enter', defaultShortcutId: 'Enter', when: "tab == 'ports' && portPane == 'groups' && activeInputRole == 'port-group-search'", source: 'system', weight: 130 },
  { actionId: 'ports.group.kill.confirm', shortcutId: 'Shift+Enter', defaultShortcutId: 'Shift+Enter', when: "tab == 'ports' && portPane == 'groups' && !textInputFocused", source: 'system', weight: 130 },
  { actionId: 'ports.group.kill.force', shortcutId: 'Ctrl+Shift+Enter', defaultShortcutId: 'Ctrl+Shift+Enter', when: "tab == 'ports' && portPane == 'groups' && !textInputFocused", source: 'system', weight: 130 },
  { actionId: 'ports.group.rename', shortcutId: 'F2', defaultShortcutId: 'F2', when: "tab == 'ports' && portPane == 'groups' && !textInputFocused", source: 'system', weight: 130 },
  { actionId: 'ports.group.edit', shortcutId: 'Ctrl+E', defaultShortcutId: 'Ctrl+E', when: "tab == 'ports' && portPane == 'groups' && !textInputFocused", source: 'system', weight: 130 },
  { actionId: 'ports.group.delete', shortcutId: 'Delete', defaultShortcutId: 'Delete', when: "tab == 'ports' && portPane == 'groups' && !textInputFocused", source: 'system', weight: 130 },
  { actionId: 'ports.group.createFromSelection', shortcutId: 'Ctrl+G', defaultShortcutId: 'Ctrl+G', when: "tab == 'ports' && !textInputFocused", source: 'system', weight: 120 },
  { actionId: 'ports.drawer.open', shortcutId: 'Ctrl+ArrowRight', defaultShortcutId: 'Ctrl+ArrowRight', when: "tab == 'ports' && !confirmOpen && !portDrawerActive && !textInputFocused", source: 'system', weight: 130 },
  { actionId: 'ports.drawer.open', shortcutId: 'Ctrl+ArrowRight', defaultShortcutId: 'Ctrl+ArrowRight', when: "tab == 'ports' && !confirmOpen && !portDrawerActive && activeInputRole == 'port-search'", source: 'system', weight: 130 },
  { actionId: 'ports.drawer.close', shortcutId: 'ArrowLeft', defaultShortcutId: 'ArrowLeft', when: "tab == 'ports' && portDrawerActive", source: 'system', weight: 300 },
  { actionId: 'ports.drawer.close', shortcutId: 'Ctrl+ArrowLeft', defaultShortcutId: 'Ctrl+ArrowLeft', when: "tab == 'ports' && portDrawerActive", source: 'system', weight: 300 },
  { actionId: 'ports.drawer.close', shortcutId: 'Escape', defaultShortcutId: 'Escape', when: "tab == 'ports' && portDrawerActive", source: 'system', weight: 300 },
  { actionId: 'ports.detail.open', shortcutId: 'Ctrl+ArrowLeft', defaultShortcutId: 'Ctrl+ArrowLeft', when: "tab == 'ports' && portPane != 'groups' && !confirmOpen && !portDrawerActive && !portDetailActive && !textInputFocused", source: 'system', weight: 130 },
  { actionId: 'ports.detail.open', shortcutId: 'Ctrl+ArrowLeft', defaultShortcutId: 'Ctrl+ArrowLeft', when: "tab == 'ports' && portPane != 'groups' && !confirmOpen && !portDrawerActive && !portDetailActive && activeInputRole == 'port-search'", source: 'system', weight: 130 },
  { actionId: 'ports.detail.close', shortcutId: 'ArrowRight', defaultShortcutId: 'ArrowRight', when: "tab == 'ports' && portDetailActive", source: 'system', weight: 300 },
  { actionId: 'ports.detail.close', shortcutId: 'Escape', defaultShortcutId: 'Escape', when: "tab == 'ports' && portDetailActive", source: 'system', weight: 300 },
  { actionId: 'ports.drawer.next', shortcutId: 'ArrowDown', defaultShortcutId: 'ArrowDown', when: "tab == 'ports' && portDrawerActive", source: 'system', weight: 300 },
  { actionId: 'ports.drawer.next', shortcutId: 'Ctrl+J', defaultShortcutId: 'Ctrl+J', when: "tab == 'ports' && portDrawerActive", source: 'system', weight: 300 },
  { actionId: 'ports.drawer.prev', shortcutId: 'ArrowUp', defaultShortcutId: 'ArrowUp', when: "tab == 'ports' && portDrawerActive", source: 'system', weight: 300 },
  { actionId: 'ports.drawer.prev', shortcutId: 'Ctrl+K', defaultShortcutId: 'Ctrl+K', when: "tab == 'ports' && portDrawerActive", source: 'system', weight: 300 },
  { actionId: 'ports.drawer.select', shortcutId: 'Enter', defaultShortcutId: 'Enter', when: "tab == 'ports' && portDrawerActive", source: 'system', weight: 300 },
  { actionId: 'favorites.open', shortcutId: 'Enter', defaultShortcutId: 'Enter', when: "tab == 'favorites' && !textInputFocused", source: 'system', weight: 120 },
  { actionId: 'favorites.reveal', shortcutId: 'Ctrl+Enter', defaultShortcutId: 'Ctrl+Enter', when: "tab == 'favorites' && !textInputFocused", source: 'system', weight: 120 },
  ...DRAWER_SELECT_KEYBINDINGS,
  ...DRAWER_DIRECT_ACTION_KEYBINDINGS
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
  return when.split('||').some((part) => part.split('&&').every((atom) => evaluateAtom(atom, context)))
}

function shouldBlockTextInputShortcut(shortcutId: string, context: KeybindingContext): boolean {
  if (!context.textInputFocused || shortcutId === 'Escape') return false
  if (context.activeInputRole === 'port-search') {
    return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'Space', 'Enter', 'Ctrl+Enter', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight'].includes(shortcutId)
  }
  if (context.activeInputRole === 'port-group-search') {
    return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'Enter'].includes(shortcutId)
  }
  return true
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
  if (shouldBlockTextInputShortcut(shortcutId, context)) return null
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
