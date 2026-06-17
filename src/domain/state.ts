import type { AppState, AppTabId, FavoriteKind, FavoriteNode, KeybindingOverride, PortGroup, ShortcutProfileId, ShortcutProfileMap } from './types'

const VALID_TABS = new Set<AppTabId>(['ports', 'favorites', 'settings'])
const VALID_FAVORITE_KINDS = new Set<FavoriteKind>(['file', 'folder', 'group'])
const SHORTCUT_PROFILE_IDS: ShortcutProfileId[] = ['global', 'ports', 'favorites', 'settings']

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

function normalizeShortcutId(value: string): string {
  const aliases: Record<string, string> = {
    ctrl: 'Ctrl',
    control: 'Ctrl',
    cmd: 'Ctrl',
    command: 'Ctrl',
    meta: 'Ctrl',
    alt: 'Alt',
    option: 'Alt',
    shift: 'Shift',
    enter: 'Enter',
    return: 'Enter',
    escape: 'Escape',
    esc: 'Escape',
    space: 'Space',
    spacebar: 'Space',
    tab: 'Tab',
    arrowup: 'ArrowUp',
    up: 'ArrowUp',
    arrowdown: 'ArrowDown',
    down: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    left: 'ArrowLeft',
    arrowright: 'ArrowRight',
    right: 'ArrowRight',
    delete: 'Delete',
    del: 'Delete',
    backspace: 'Backspace'
  }
  const raw = String(value || '').trim()
  if (!raw) return ''
  const separator = raw.includes('+') ? '+' : '-'
  const parts = raw.split(separator).map((part) => part.trim()).filter(Boolean)
  const modifiers = new Set<string>()
  let key = ''
  for (const part of parts) {
    const lower = part.toLowerCase()
    const normalized = aliases[lower] || (part.length === 1 ? part.toUpperCase() : part)
    if (['Ctrl', 'Alt', 'Shift'].includes(normalized)) modifiers.add(normalized)
    else key = normalized
  }
  return [...['Ctrl', 'Alt', 'Shift'].filter((modifier) => modifiers.has(modifier)), key].filter(Boolean).join('+')
}

function normalizeKeybindingOverrides(value: unknown): KeybindingOverride[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const source = record(item)
    const commandId = stringValue(source.commandId).trim()
    const shortcutIds = strings(source.shortcutIds).map(normalizeShortcutId).filter(Boolean)
    const legacyShortcutId = normalizeShortcutId(stringValue(source.shortcutId).trim())
    const effectiveShortcutIds = shortcutIds.length ? shortcutIds : legacyShortcutId ? [legacyShortcutId] : []
    if (!commandId || !effectiveShortcutIds.length) return []
    const enabled = source.enabled === false || source.disabled === true || source.source === 'removed' ? false : true
    return [{
      commandId,
      shortcutId: effectiveShortcutIds[0],
      shortcutIds: effectiveShortcutIds,
      enabled,
      when: stringValue(source.when).trim() || undefined,
      source: source.source === 'removed' || !enabled ? 'removed' : 'user',
      weight: typeof source.weight === 'number' && Number.isFinite(source.weight) ? source.weight : undefined,
      disabled: !enabled
    }]
  })
}

function inferShortcutProfileId(commandId: string): ShortcutProfileId {
  if (commandId.startsWith('ports.')) return 'ports'
  if (commandId.startsWith('favorites.')) return 'favorites'
  if (commandId.startsWith('settings.')) return 'settings'
  return 'global'
}

function emptyShortcutProfiles(now: number): ShortcutProfileMap {
  return {
    global: { keybindingOverrides: [], updatedAt: now },
    ports: { keybindingOverrides: [], updatedAt: now },
    favorites: { keybindingOverrides: [], updatedAt: now },
    settings: { keybindingOverrides: [], updatedAt: now }
  }
}

function aggregateShortcutProfiles(profiles: ShortcutProfileMap): KeybindingOverride[] {
  return SHORTCUT_PROFILE_IDS.flatMap((profileId) => profiles[profileId].keybindingOverrides)
}

function distributeLegacyKeybindings(overrides: KeybindingOverride[], now: number): ShortcutProfileMap {
  const profiles = emptyShortcutProfiles(now)
  for (const override of overrides) {
    const profileId = inferShortcutProfileId(override.commandId)
    profiles[profileId].keybindingOverrides.push(override)
  }
  return profiles
}

function normalizeShortcutProfiles(value: unknown, legacyOverrides: KeybindingOverride[], now: number): ShortcutProfileMap {
  const source = record(value)
  const hasProfileData = SHORTCUT_PROFILE_IDS.some((profileId) => Array.isArray(record(source[profileId]).keybindingOverrides))
  const profiles = hasProfileData ? emptyShortcutProfiles(now) : distributeLegacyKeybindings(legacyOverrides, now)
  if (!hasProfileData) return profiles
  for (const profileId of SHORTCUT_PROFILE_IDS) {
    const profile = record(source[profileId])
    profiles[profileId] = {
      keybindingOverrides: normalizeKeybindingOverrides(profile.keybindingOverrides),
      updatedAt: numberValue(profile.updatedAt, now)
    }
  }
  return profiles
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
      shortcutProfiles: emptyShortcutProfiles(now),
      preferSqlite: false
    },
    updatedAt: now
  }
}

export function normalizeAppState(value: unknown, now = Date.now()): AppState {
  const fallback = createInitialState(now)
  const source = record(value)
  const settings = record(source.settings)
  const legacyKeybindingOverrides = normalizeKeybindingOverrides(settings.keybindingOverrides)
  const shortcutProfiles = normalizeShortcutProfiles(settings.shortcutProfiles, legacyKeybindingOverrides, now)
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
      keybindingOverrides: aggregateShortcutProfiles(shortcutProfiles),
      shortcutProfiles,
      preferSqlite: settings.preferSqlite === true
    },
    updatedAt: numberValue(source.updatedAt, now)
  }
}
