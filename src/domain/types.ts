export type AppTabId = 'ports' | 'favorites' | 'settings'

export interface FeatureConfig {
  id: AppTabId
  enabled: boolean
  sortOrder: number
}

export interface PortProcess {
  id: string
  pid: number
  port: number
  command: string
  address: string
  protocol: 'tcp'
  state: 'LISTEN'
  user?: string
}

export interface PortGroup {
  id: string
  name: string
  color: string
  entries: string[]
  folderId: string | null
  sortOrder: number
}

export interface PortGroupFolder {
  id: string
  name: string
  color: string
  sortOrder: number
}

export type PortGroupTarget =
  | { kind: 'group'; id: string }
  | { kind: 'folder'; id: string }

export type FavoriteKind = 'file' | 'folder' | 'group'

export interface FavoriteNode {
  id: string
  kind: FavoriteKind
  path: string
  name: string
  parentId: string | null
  tags: string[]
  color: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface FavoriteTreeNode {
  node: FavoriteNode
  depth: number
  children: FavoriteTreeNode[]
}

export interface KeybindingOverride {
  commandId: string
  shortcutId?: string
  shortcutIds?: string[]
  enabled?: boolean
  when?: string
  source?: 'user' | 'removed'
  weight?: number
  disabled?: boolean
}

export type ShortcutProfileId = 'global' | 'ports' | 'favorites' | 'settings'

export interface ShortcutProfileState {
  keybindingOverrides: KeybindingOverride[]
  updatedAt: number
}

export type ShortcutProfileMap = Record<ShortcutProfileId, ShortcutProfileState>

export interface AppSettings {
  keybindingOverrides: KeybindingOverride[]
  shortcutProfiles: ShortcutProfileMap
  featureConfigs: FeatureConfig[]
  preferSqlite: boolean
}

export interface AppState {
  version: 1
  activeTab: AppTabId
  portSearch: string
  favoriteSearch: string
  searchHistories: {
    ports: {
      processes: string[]
      groups: string[]
    }
    favorites: {
      files: string[]
    }
  }
  portSearchHistory: string[]
  favoriteSearchHistory: string[]
  portGroups: PortGroup[]
  portGroupFolders: PortGroupFolder[]
  collapsedPortGroupFolderIds: string[]
  favorites: FavoriteNode[]
  settings: AppSettings
  updatedAt: number
}

export interface KillRequest {
  pid: number
  port: number
  force: boolean
}

export interface KillResult {
  ok: boolean
  pid: number
  port: number
  force: boolean
  error?: string
}
