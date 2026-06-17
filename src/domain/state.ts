import type { AppState, AppTabId, FavoriteKind, FavoriteNode, KeybindingOverride, PortGroup, PortGroupFolder, ShortcutProfileId, ShortcutProfileMap } from './types'
import { emptySearchHistories, normalizeSearchHistoryList } from './searchHistory'
import { normalizeShortcutId } from './shortcuts'

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

function normalizeSearchHistories(value: unknown, legacyPortHistory: string[], legacyFavoriteHistory: string[]): AppState['searchHistories'] {
  const source = record(value)
  const ports = record(source.ports)
  const favorites = record(source.favorites)
  const hasStructured = Array.isArray(ports.processes) || Array.isArray(ports.groups) || Array.isArray(favorites.files)
  if (!hasStructured) {
    return {
      ports: {
        processes: legacyPortHistory,
        groups: []
      },
      favorites: {
        files: legacyFavoriteHistory
      }
    }
  }
  return {
    ports: {
      processes: normalizeSearchHistoryList(ports.processes),
      groups: normalizeSearchHistoryList(ports.groups)
    },
    favorites: {
      files: normalizeSearchHistoryList(favorites.files)
    }
  }
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

function normalizePortGroupFolders(value: unknown): PortGroupFolder[] {
  if (!Array.isArray(value)) return []
  const folders: PortGroupFolder[] = []
  for (const item of value) {
    const source = record(item)
    const id = stringValue(source.id).trim()
    const name = stringValue(source.name).trim()
    if (!id || !name) continue
    folders.push({
      id,
      name,
      color: stringValue(source.color).trim() || '#00A676',
      sortOrder: numberValue(source.sortOrder, folders.length + 1)
    })
  }
  return folders
}

function normalizePortGroups(value: unknown, folders: PortGroupFolder[]): PortGroup[] {
  if (!Array.isArray(value)) return []
  const folderIds = new Set(folders.map((folder) => folder.id))
  const groups: PortGroup[] = []
  for (const item of value) {
    const source = record(item)
    const id = stringValue(source.id).trim()
    const name = stringValue(source.name).trim()
    const entries = strings(source.entries)
    if (id.startsWith('default:')) continue
    if (!id || !name || !entries.length) continue
    const folderId = stringValue(source.folderId).trim()
    groups.push({
      id,
      name,
      color: stringValue(source.color).trim() || '#00A676',
      entries,
      folderId: folderId && folderIds.has(folderId) ? folderId : null,
      sortOrder: numberValue(source.sortOrder, groups.length + 1)
    })
  }
  return groups
}

export function createInitialState(now = Date.now()): AppState {
  return {
    version: 1,
    activeTab: 'ports',
    portSearch: '',
    favoriteSearch: '',
    searchHistories: emptySearchHistories(),
    portSearchHistory: [],
    favoriteSearchHistory: [],
    portGroups: [],
    portGroupFolders: [],
    collapsedPortGroupFolderIds: [],
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
  const portGroupFolders = normalizePortGroupFolders(source.portGroupFolders)
  const validFolderIds = new Set(portGroupFolders.map((folder) => folder.id))
  const legacyPortSearchHistory = normalizeSearchHistoryList(source.portSearchHistory)
  const legacyFavoriteSearchHistory = normalizeSearchHistoryList(source.favoriteSearchHistory)
  const searchHistories = normalizeSearchHistories(source.searchHistories, legacyPortSearchHistory, legacyFavoriteSearchHistory)
  return {
    version: 1,
    activeTab,
    portSearch: stringValue(source.portSearch),
    favoriteSearch: stringValue(source.favoriteSearch),
    searchHistories,
    portSearchHistory: searchHistories.ports.processes,
    favoriteSearchHistory: searchHistories.favorites.files,
    portGroups: normalizePortGroups(source.portGroups, portGroupFolders),
    portGroupFolders,
    collapsedPortGroupFolderIds: strings(source.collapsedPortGroupFolderIds).filter((id) => validFolderIds.has(id)),
    favorites: (Array.isArray(source.favorites) ? source.favorites : []).map((item) => normalizeFavorite(item, now)).filter((item): item is FavoriteNode => Boolean(item)),
    settings: {
      keybindingOverrides: aggregateShortcutProfiles(shortcutProfiles),
      shortcutProfiles,
      preferSqlite: settings.preferSqlite === true
    },
    updatedAt: numberValue(source.updatedAt, now)
  }
}
