import type { AppState, AppTabId, FavoriteKind, FavoriteNode, FeatureConfig, KeybindingOverride, PortGroup, PortGroupFolder, ShortcutProfileId, ShortcutProfileMap } from './types'
import { normalizeMqttState } from './mqtt'
import { emptySearchHistories, normalizeSearchHistoryList } from './searchHistory'
import { normalizeShortcutId } from './shortcuts'
import { normalizeToolPreviewPrefs } from './toolPreview'
import { normalizeFavoriteGraph } from './favorites'
import { createDefaultCodexState, normalizeCodexState } from './codex'
import { createWindowSlots, normalizeWindowText, type WindowPlatform, type WindowSlot, type WindowTarget } from './windows'

const VALID_TABS = new Set<AppTabId>(['ports', 'mqtt', 'favorites', 'windows', 'codex', 'settings'])
const TAB_IDS: AppTabId[] = ['ports', 'mqtt', 'favorites', 'windows', 'codex', 'settings']
const DEFAULT_FEATURE_SORT_ORDER: Record<AppTabId, number> = {
  ports: 1,
  favorites: 2,
  mqtt: 3,
  windows: 4,
  codex: 5,
  settings: 6
}
const VALID_FAVORITE_KINDS = new Set<FavoriteKind>(['file', 'folder', 'group'])
const SHORTCUT_PROFILE_IDS: ShortcutProfileId[] = ['global', 'ports', 'mqtt', 'favorites', 'windows', 'codex', 'settings']

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
  if (commandId.startsWith('mqtt.')) return 'mqtt'
  if (commandId.startsWith('favorites.')) return 'favorites'
  if (commandId.startsWith('windows.')) return 'windows'
  if (commandId.startsWith('codex.')) return 'codex'
  if (commandId.startsWith('settings.')) return 'settings'
  return 'global'
}

function emptyShortcutProfiles(now: number): ShortcutProfileMap {
  return {
    global: { keybindingOverrides: [], updatedAt: now },
    ports: { keybindingOverrides: [], updatedAt: now },
    mqtt: { keybindingOverrides: [], updatedAt: now },
    favorites: { keybindingOverrides: [], updatedAt: now },
    windows: { keybindingOverrides: [], updatedAt: now },
    codex: { keybindingOverrides: [], updatedAt: now },
    settings: { keybindingOverrides: [], updatedAt: now }
  }
}

function windowPlatform(value: unknown): WindowPlatform | null {
  return value === 'darwin' || value === 'win32' ? value : null
}

function normalizeWindowTargets(value: unknown, now: number): WindowTarget[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const targets: WindowTarget[] = []
  for (const item of value) {
    const source = record(item)
    const id = stringValue(source.id).trim()
    const platform = windowPlatform(source.platform)
    const appId = stringValue(source.appId).trim()
    const appName = stringValue(source.appName).trim()
    const titleLocator = stringValue(source.titleLocator).trim()
    if (!id || ids.has(id) || !platform || !(appId || appName) || !titleLocator) continue
    ids.add(id)
    targets.push({
      id,
      alias: stringValue(source.alias).trim() || titleLocator,
      platform,
      appId: appId || appName,
      appName: appName || appId,
      titleLocator,
      titleHistory: strings(source.titleHistory)
        .filter((title) => normalizeWindowText(title) !== normalizeWindowText(titleLocator))
        .filter((title, index, all) => all.findIndex((candidate) => normalizeWindowText(candidate) === normalizeWindowText(title)) === index)
        .slice(0, 4),
      lastNativeRef: stringValue(source.lastNativeRef).trim() || null,
      favorite: source.favorite !== false,
      pinned: source.pinned === true,
      createdAt: numberValue(source.createdAt, now),
      updatedAt: numberValue(source.updatedAt, now)
    })
  }
  return targets
}

function normalizeWindowSlots(value: unknown, targetsById: Map<string, WindowTarget>): WindowSlot[] {
  const bySlot = new Map<number, WindowSlot>()
  if (Array.isArray(value)) {
    for (const item of value) {
      const source = record(item)
      const slot = Math.floor(numberValue(source.slot, 0))
      if (slot < 1 || slot > 10 || bySlot.has(slot)) continue
      const rawTargets = record(source.targetIdByPlatform)
      const targetIdByPlatform: WindowSlot['targetIdByPlatform'] = {}
      for (const platform of ['darwin', 'win32'] as const) {
        const targetId = stringValue(rawTargets[platform]).trim()
        if (targetId && targetsById.get(targetId)?.platform === platform) targetIdByPlatform[platform] = targetId
      }
      bySlot.set(slot, { slot, targetIdByPlatform })
    }
  }
  return createWindowSlots().map((fallback) => bySlot.get(fallback.slot) || fallback)
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

function defaultFeatureConfig(id: AppTabId, sortOrder: number): FeatureConfig {
  return {
    id,
    enabled: id === 'favorites' || id === 'windows' ? false : true,
    sortOrder
  }
}

function normalizeFeatureConfigs(value: unknown): FeatureConfig[] {
  const byId = new Map<AppTabId, FeatureConfig>()
  const usedOrders = new Set<number>()
  if (Array.isArray(value)) {
    for (const item of value) {
      const source = record(item)
      const id = source.id as AppTabId
      if (!VALID_TABS.has(id) || byId.has(id)) continue
      const requestedOrder = numberValue(source.sortOrder, byId.size + 1)
      const sortOrder = requestedOrder > 0 && !usedOrders.has(requestedOrder) ? requestedOrder : byId.size + 1
      usedOrders.add(sortOrder)
      byId.set(id, {
        id,
        enabled: id === 'settings' ? true : source.enabled !== false,
        sortOrder
      })
    }
  }
  for (const id of TAB_IDS) {
    if (byId.has(id)) continue
    let sortOrder = DEFAULT_FEATURE_SORT_ORDER[id]
    while (usedOrders.has(sortOrder)) sortOrder += 1
    usedOrders.add(sortOrder)
    byId.set(id, defaultFeatureConfig(id, sortOrder))
  }
  return [...byId.values()]
    .map((config) => ({ ...config, enabled: config.id === 'settings' ? true : config.enabled }))
    .sort((a, b) => a.sortOrder - b.sortOrder || TAB_IDS.indexOf(a.id) - TAB_IDS.indexOf(b.id))
    .map((config, index) => ({ ...config, sortOrder: index + 1 }))
}

function normalizeFavorite(value: unknown, now: number): FavoriteNode | null {
  const item = record(value)
  const id = stringValue(item.id).trim()
  const path = stringValue(item.path).trim()
  const kind = VALID_FAVORITE_KINDS.has(item.kind as FavoriteKind) ? (item.kind as FavoriteKind) : null
  if (!id || !kind || (kind !== 'group' && !path)) return null
  const usageCount = numberValue(item.usageCount, 0)
  const lastUsedAt = numberValue(item.lastUsedAt, 0)
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
    updatedAt: numberValue(item.updatedAt, now),
    ...(usageCount > 0 ? { usageCount } : {}),
    ...(lastUsedAt > 0 ? { lastUsedAt } : {})
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
    windowSearch: '',
    searchHistories: emptySearchHistories(),
    portSearchHistory: [],
    favoriteSearchHistory: [],
    portGroups: [],
    portGroupFolders: [],
    collapsedPortGroupFolderIds: [],
    collapsedFavoriteGroupIds: [],
    favorites: [],
    windowTargets: [],
    windowSlots: createWindowSlots(),
    mqtt: normalizeMqttState(null, now),
    codex: createDefaultCodexState(),
    settings: {
      keybindingOverrides: [],
      shortcutProfiles: emptyShortcutProfiles(now),
      featureConfigs: normalizeFeatureConfigs(null),
      toolPreviewPrefs: normalizeToolPreviewPrefs(null),
      preferSqlite: false
    },
    settingsTabId: 'shortcuts',
    settingsMaintenanceSectionId: 'features',
    updatedAt: now
  }
}

export function normalizeAppState(value: unknown, now = Date.now()): AppState {
  const fallback = createInitialState(now)
  const source = record(value)
  const settings = record(source.settings)
  const legacyMqttLayoutPrefs = record(record(source.mqtt).layoutPrefs)
  const legacyKeybindingOverrides = normalizeKeybindingOverrides(settings.keybindingOverrides)
  const shortcutProfiles = normalizeShortcutProfiles(settings.shortcutProfiles, legacyKeybindingOverrides, now)
  const portGroupFolders = normalizePortGroupFolders(source.portGroupFolders)
  const validFolderIds = new Set(portGroupFolders.map((folder) => folder.id))
  const legacyPortSearchHistory = normalizeSearchHistoryList(source.portSearchHistory)
  const legacyFavoriteSearchHistory = normalizeSearchHistoryList(source.favoriteSearchHistory)
  const searchHistories = normalizeSearchHistories(source.searchHistories, legacyPortSearchHistory, legacyFavoriteSearchHistory)
  const featureConfigs = normalizeFeatureConfigs(settings.featureConfigs)
  const visibleTabIds = new Set(featureConfigs.filter((config) => config.enabled).map((config) => config.id))
  const activeTab = VALID_TABS.has(source.activeTab as AppTabId) && visibleTabIds.has(source.activeTab as AppTabId) ? (source.activeTab as AppTabId) : fallback.activeTab
  const favorites = normalizeFavoriteGraph((Array.isArray(source.favorites) ? source.favorites : []).map((item) => normalizeFavorite(item, now)).filter((item): item is FavoriteNode => Boolean(item)))
  const favoriteIds = new Set(favorites.map((item) => item.id))
  const windowTargets = normalizeWindowTargets(source.windowTargets, now)
  const windowTargetsById = new Map(windowTargets.map((item) => [item.id, item] as const))
  return {
    version: 1,
    activeTab: visibleTabIds.has(activeTab) ? activeTab : 'settings',
    portSearch: stringValue(source.portSearch),
    favoriteSearch: stringValue(source.favoriteSearch),
    windowSearch: stringValue(source.windowSearch),
    searchHistories,
    portSearchHistory: searchHistories.ports.processes,
    favoriteSearchHistory: searchHistories.favorites.files,
    portGroups: normalizePortGroups(source.portGroups, portGroupFolders),
    portGroupFolders,
    collapsedPortGroupFolderIds: strings(source.collapsedPortGroupFolderIds).filter((id) => validFolderIds.has(id)),
    collapsedFavoriteGroupIds: strings(source.collapsedFavoriteGroupIds).filter((id) => favoriteIds.has(id)),
    favorites,
    windowTargets,
    windowSlots: normalizeWindowSlots(source.windowSlots, windowTargetsById),
    mqtt: normalizeMqttState(source.mqtt, now),
    codex: normalizeCodexState(source.codex),
    settings: {
      keybindingOverrides: aggregateShortcutProfiles(shortcutProfiles),
      shortcutProfiles,
      featureConfigs,
      toolPreviewPrefs: normalizeToolPreviewPrefs(settings.toolPreviewPrefs ?? legacyMqttLayoutPrefs),
      preferSqlite: settings.preferSqlite === true
    },
    settingsTabId: source.settingsTabId === 'maintenance' ? 'maintenance' : 'shortcuts',
    settingsMaintenanceSectionId: (['features', 'tools', 'layers', 'storage', 'commands', 'resolution', 'reservations'] as const).includes(source.settingsMaintenanceSectionId as any) ? (source.settingsMaintenanceSectionId as AppState['settingsMaintenanceSectionId']) : 'features',
    updatedAt: numberValue(source.updatedAt, now)
  }
}
