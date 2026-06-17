import type { AppState, AppTabId, FavoriteKind, FavoriteNode, KeybindingOverride, PortGroup } from './types'

const VALID_TABS = new Set<AppTabId>(['ports', 'favorites', 'settings'])
const VALID_FAVORITE_KINDS = new Set<FavoriteKind>(['file', 'folder', 'group'])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))] : []
}

function normalizeKeybindingOverrides(value: unknown): KeybindingOverride[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const source = record(item)
    const commandId = stringValue(source.commandId).trim()
    const shortcutId = stringValue(source.shortcutId).trim()
    if (!commandId || !shortcutId) return []
    return [{
      commandId,
      shortcutId,
      when: stringValue(source.when).trim() || undefined,
      source: source.source === 'removed' ? 'removed' : 'user',
      weight: typeof source.weight === 'number' && Number.isFinite(source.weight) ? source.weight : undefined,
      disabled: Boolean(source.disabled)
    }]
  })
}

function normalizeFavorite(value: unknown, now: number): FavoriteNode | null {
  const item = record(value)
  const id = stringValue(item.id).trim()
  const path = stringValue(item.path).trim()
  const kind = VALID_FAVORITE_KINDS.has(item.kind as FavoriteKind) ? (item.kind as FavoriteKind) : null
  if (!id || !kind || (kind !== 'group' && !path)) return null
  return {
    id,
    kind,
    path: kind === 'group' ? '' : path,
    name: stringValue(item.name).trim() || path.split(/[\\/]/).filter(Boolean).pop() || id,
    parentId: stringValue(item.parentId).trim() || null,
    tags: strings(item.tags),
    color: stringValue(item.color).trim() || '#6B7280',
    sortOrder: numberValue(item.sortOrder, 0),
    createdAt: numberValue(item.createdAt, now),
    updatedAt: numberValue(item.updatedAt, now)
  }
}

function normalizePortGroups(value: unknown): PortGroup[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const source = record(item)
    const id = stringValue(source.id).trim()
    const name = stringValue(source.name).trim()
    const entries = strings(source.entries)
    if (id.startsWith('default:')) return []
    if (!id || !name || !entries.length) return []
    return [{ id, name, color: stringValue(source.color).trim() || '#00A676', entries }]
  })
}

export function createInitialState(now = Date.now()): AppState {
  return {
    version: 1,
    activeTab: 'ports',
    portSearch: '',
    favoriteSearch: '',
    portSearchHistory: [],
    favoriteSearchHistory: [],
    portGroups: [],
    favorites: [],
    settings: {
      keybindingOverrides: [],
      preferSqlite: false
    },
    updatedAt: now
  }
}

export function normalizeAppState(value: unknown, now = Date.now()): AppState {
  const fallback = createInitialState(now)
  const source = record(value)
  const settings = record(source.settings)
  const activeTab = VALID_TABS.has(source.activeTab as AppTabId) ? (source.activeTab as AppTabId) : fallback.activeTab
  return {
    version: 1,
    activeTab,
    portSearch: stringValue(source.portSearch),
    favoriteSearch: stringValue(source.favoriteSearch),
    portSearchHistory: strings(source.portSearchHistory).slice(0, 30),
    favoriteSearchHistory: strings(source.favoriteSearchHistory).slice(0, 30),
    portGroups: normalizePortGroups(source.portGroups),
    favorites: (Array.isArray(source.favorites) ? source.favorites : []).map((item) => normalizeFavorite(item, now)).filter((item): item is FavoriteNode => Boolean(item)),
    settings: {
      keybindingOverrides: normalizeKeybindingOverrides(settings.keybindingOverrides),
      preferSqlite: settings.preferSqlite === true
    },
    updatedAt: numberValue(source.updatedAt, now)
  }
}
