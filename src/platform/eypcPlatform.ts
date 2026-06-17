import { normalizeAppState } from '../domain/state'
import type { AppState, FavoriteNode, KillRequest, KillResult, PortProcess } from '../domain/types'

export type PickedFavorite = Pick<FavoriteNode, 'kind' | 'path' | 'name' | 'parentId' | 'tags' | 'color'>
const STORAGE_KEY = 'eypc/state/v1'

export interface EypcPlatformApi {
  storage: {
    getState(): AppState
    setState(state: AppState): boolean
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
  }
  getEnterPayload(): { code?: string } | null
  clearEnterPayload(): void
}

declare global {
  interface Window {
    eypcPlatform?: EypcPlatformApi
  }
}

const memory = {
  state: normalizeAppState(null),
  enterPayload: null as { code?: string } | null
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

export function getPlatform(): EypcPlatformApi {
  if (typeof window !== 'undefined' && window.eypcPlatform) return window.eypcPlatform
  return {
    storage: {
      getState: readFallbackState,
      setState: writeFallbackState
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
      }
    },
    getEnterPayload: () => memory.enterPayload,
    clearEnterPayload: () => {
      memory.enterPayload = null
    }
  }
}
