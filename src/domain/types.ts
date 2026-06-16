export type AppTabId = 'ports' | 'favorites' | 'settings'

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
}

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
  shortcutId: string
  when?: string
  source?: 'user' | 'removed'
  weight?: number
  disabled?: boolean
}

export interface AppSettings {
  keybindingOverrides: KeybindingOverride[]
  preferSqlite: boolean
}

export interface AppState {
  version: 1
  activeTab: AppTabId
  portSearch: string
  favoriteSearch: string
  portSearchHistory: string[]
  favoriteSearchHistory: string[]
  portGroups: PortGroup[]
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
