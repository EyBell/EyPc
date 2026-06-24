import { normalizeAppState } from '../domain/state'
import { normalizeMqttArchiveState } from '../domain/mqtt'
import type { AppState, FavoriteNode, KillRequest, KillResult, MqttArchiveState, MqttStorageStatus, PortProcess } from '../domain/types'

export type PickedFavoriteKind = Exclude<FavoriteNode['kind'], 'group'>
export type PickedFavorite = Pick<FavoriteNode, 'path' | 'name' | 'parentId' | 'tags' | 'color'> & { kind: PickedFavoriteKind }
export type MqttSecretMap = Record<string, string>
const STORAGE_KEY = 'eypc/state/v1'
const MQTT_ARCHIVE_STORAGE_KEY = 'eypc/mqtt/archive/v1'
const MQTT_SECRETS_LOCAL_STORAGE_KEY = 'eypc/mqtt/secrets-local/v1'

export interface FavoriteDirectoryEntry {
  kind: Exclude<FavoriteNode['kind'], 'group'>
  name: string
  path: string
  size?: number
  modifiedAt?: number
}

export interface FavoriteDirectoryListResult {
  ok: boolean
  entries: FavoriteDirectoryEntry[]
  error?: string
}

export interface EypcPlatformApi {
  storage: {
    getState(): AppState
    setState(state: AppState): boolean
    getMqttArchive(): MqttArchiveState
    setMqttArchive(archive: MqttArchiveState): boolean
    getMqttStorageStatus(): MqttStorageStatus
    getMqttSecrets(): MqttSecretMap
    setMqttSecrets(secrets: MqttSecretMap): boolean
  }
  ports: {
    scan(): Promise<PortProcess[]>
    kill(request: KillRequest): Promise<KillResult>
  }
  files: {
    open(path: string): Promise<boolean>
    reveal(path: string): Promise<boolean>
    copyPath(path: string): Promise<boolean>
    pickFavorite?(): Promise<PickedFavorite | null>
    pickFavorites?(kind: PickedFavoriteKind): Promise<PickedFavorite[]>
    listDirectory(path: string): Promise<FavoriteDirectoryListResult>
  }
  clipboard: {
    copyText(text: string): Promise<boolean>
  }
  app: {
    hide(): Promise<boolean> | boolean
  }
  getEnterPayload(): { code?: string } | null
  clearEnterPayload(): void
  onEnterPayload?(listener: (payload: { code?: string } | null) => void): () => void
}

declare global {
  interface Window {
    eypcPlatform?: EypcPlatformApi
  }
}

const memory = {
  state: normalizeAppState(null),
  mqttSecrets: {} as MqttSecretMap,
  enterPayload: null as { code?: string } | null
}

function normalizeMqttSecrets(value: unknown): MqttSecretMap {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const candidate = source.version === 1 && source.secrets && typeof source.secrets === 'object'
    ? source.secrets as Record<string, unknown>
    : source
  return Object.fromEntries(
    Object.entries(candidate)
      .map(([key, secret]) => [key.trim(), secret] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0]) && typeof entry[1] === 'string' && entry[1].length > 0)
  )
}

function readFallbackState(): AppState {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return normalizeAppState(JSON.parse(raw))
    } catch {}
  }
  return memory.state
}

function readFallbackMqttArchive(): MqttArchiveState {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(MQTT_ARCHIVE_STORAGE_KEY)
      if (raw) return normalizeMqttArchiveState(JSON.parse(raw))
    } catch {}
  }
  return normalizeMqttArchiveState(null)
}

function readFallbackMqttSecrets(): MqttSecretMap {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(MQTT_SECRETS_LOCAL_STORAGE_KEY)
      if (raw) return normalizeMqttSecrets(JSON.parse(raw))
    } catch {}
  }
  return { ...memory.mqttSecrets }
}

function writeFallbackState(state: AppState): boolean {
  const normalized = normalizeAppState(state)
  memory.state = normalized
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
      return true
    } catch {}
  }
  return true
}

function writeFallbackMqttArchive(archive: MqttArchiveState): boolean {
  const normalized = normalizeMqttArchiveState(archive)
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(MQTT_ARCHIVE_STORAGE_KEY, JSON.stringify(normalized))
      return true
    } catch {}
  }
  return true
}

function fallbackMqttStorageStatus(): MqttStorageStatus {
  return {
    mode: 'browser-localStorage',
    sqliteAvailable: false,
    migratedLegacyArchive: false
  }
}

function writeFallbackMqttSecrets(secrets: MqttSecretMap): boolean {
  const normalized = normalizeMqttSecrets(secrets)
  memory.mqttSecrets = normalized
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(MQTT_SECRETS_LOCAL_STORAGE_KEY, JSON.stringify({ version: 1, secrets: normalized }))
      return true
    } catch {}
  }
  return true
}

async function scanViaDevApi(): Promise<PortProcess[]> {
  if (typeof fetch !== 'function') return []
  try {
    const response = await fetch('/__eypc__/ports/scan')
    if (!response.ok) return []
    const payload = await response.json() as { ports?: unknown }
    return Array.isArray(payload.ports) ? payload.ports.filter((item): item is PortProcess => {
      const source = item as Partial<PortProcess>
      return typeof source.id === 'string' && typeof source.pid === 'number' && typeof source.port === 'number' && typeof source.command === 'string'
    }) : []
  } catch {
    return []
  }
}

async function killViaDevApi(request: KillRequest): Promise<KillResult> {
  if (typeof fetch !== 'function') return { ok: false, ...request, error: 'dev kill api unavailable' }
  try {
    const response = await fetch('/__eypc__/ports/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    const payload = await response.json() as Partial<KillResult>
    return {
      ok: Boolean(response.ok && payload.ok),
      pid: Number(payload.pid ?? request.pid),
      port: Number(payload.port ?? request.port),
      force: Boolean(payload.force ?? request.force),
      error: typeof payload.error === 'string' ? payload.error : response.ok ? undefined : 'dev kill api failed'
    }
  } catch (error) {
    return { ok: false, ...request, error: error instanceof Error ? error.message : 'dev kill api failed' }
  }
}

type BrowserPickedFile = Pick<File, 'name'> & {
  path?: string
  webkitRelativePath?: string
}

function pathTail(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}

function normalizeBrowserPickedFile(file: BrowserPickedFile, kind: PickedFavoriteKind): PickedFavorite | null {
  const relativePath = typeof file.webkitRelativePath === 'string' ? file.webkitRelativePath.trim() : ''
  const explicitPath = typeof file.path === 'string' ? file.path.trim() : ''
  const folderRoot = relativePath.split(/[\\/]/).filter(Boolean)[0] || ''
  const path = kind === 'folder'
    ? folderRoot || explicitPath.replace(/[\\/][^\\/]*$/, '') || file.name
    : explicitPath || relativePath || file.name
  const normalizedPath = String(path || '').trim()
  if (!normalizedPath) return null
  const name = kind === 'folder' ? folderRoot || pathTail(normalizedPath) : file.name || pathTail(normalizedPath)
  return {
    kind,
    path: normalizedPath,
    name,
    parentId: null,
    tags: [],
    color: kind === 'folder' ? '#2F80ED' : '#F2994A'
  }
}

function normalizeBrowserPickedFiles(files: ArrayLike<BrowserPickedFile>, kind: PickedFavoriteKind): PickedFavorite[] {
  const seen = new Set<string>()
  return Array.from(files)
    .map((file) => normalizeBrowserPickedFile(file, kind))
    .filter((item): item is PickedFavorite => {
      if (!item) return false
      const key = `${item.kind}:${item.path}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

async function pickFavoritesViaBrowserInput(kind: PickedFavoriteKind): Promise<PickedFavorite[]> {
  if (typeof document === 'undefined' || !document.body) return []
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.style.display = 'none'
    if (kind === 'folder') {
      input.setAttribute('webkitdirectory', '')
      input.setAttribute('directory', '')
    }

    const cleanup = () => {
      input.remove()
    }
    const finish = () => {
      const picked = input.files ? normalizeBrowserPickedFiles(input.files, kind) : []
      cleanup()
      resolve(picked)
    }
    const cancel = () => {
      cleanup()
      resolve([])
    }

    input.addEventListener('change', finish, { once: true })
    input.addEventListener('cancel', cancel, { once: true })
    document.body.appendChild(input)

    try {
      input.click()
    } catch {
      cancel()
    }
  })
}

export function getPlatform(): EypcPlatformApi {
  if (typeof window !== 'undefined' && window.eypcPlatform) {
    const hostFiles = window.eypcPlatform.files
    const hostClipboard = window.eypcPlatform.clipboard
    const hostStorage = window.eypcPlatform.storage
    return {
      ...window.eypcPlatform,
      storage: {
        getState: hostStorage.getState || readFallbackState,
        setState: hostStorage.setState || writeFallbackState,
        getMqttArchive: hostStorage.getMqttArchive || readFallbackMqttArchive,
        setMqttArchive: hostStorage.setMqttArchive || writeFallbackMqttArchive,
        getMqttStorageStatus: hostStorage.getMqttStorageStatus || fallbackMqttStorageStatus,
        getMqttSecrets: hostStorage.getMqttSecrets || readFallbackMqttSecrets,
        setMqttSecrets: hostStorage.setMqttSecrets || writeFallbackMqttSecrets
      },
      files: {
        open: hostFiles.open || (async () => false),
        reveal: hostFiles.reveal || (async () => false),
        copyPath: hostFiles.copyPath || (async () => false),
        pickFavorite: hostFiles.pickFavorite,
        pickFavorites: hostFiles.pickFavorites || (async () => {
          const picked = await hostFiles.pickFavorite?.()
          return picked ? [picked] : []
        }),
        listDirectory: hostFiles.listDirectory || (async () => ({ ok: false, entries: [], error: 'directory listing unavailable' }))
      },
      clipboard: {
        copyText: hostClipboard?.copyText || hostFiles.copyPath || (async () => false)
      },
      app: window.eypcPlatform.app || { hide: async () => false }
    }
  }
  return {
    storage: {
      getState: readFallbackState,
      setState: writeFallbackState,
      getMqttArchive: readFallbackMqttArchive,
      setMqttArchive: writeFallbackMqttArchive,
      getMqttStorageStatus: fallbackMqttStorageStatus,
      getMqttSecrets: readFallbackMqttSecrets,
      setMqttSecrets: writeFallbackMqttSecrets
    },
    ports: {
      scan: scanViaDevApi,
      kill: killViaDevApi
    },
    files: {
      open: async () => false,
      reveal: async () => false,
      copyPath: async (path) => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(path)
          return true
        }
        return false
      },
      pickFavorites: pickFavoritesViaBrowserInput,
      listDirectory: async () => ({ ok: false, entries: [], error: 'directory listing unavailable' })
    },
    clipboard: {
      copyText: async (text) => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(text)
          return true
        }
        return false
      }
    },
    app: {
      hide: async () => false
    },
    getEnterPayload: () => memory.enterPayload,
    clearEnterPayload: () => {
      memory.enterPayload = null
    }
  }
}
