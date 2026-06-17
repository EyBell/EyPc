import { normalizeAppState } from '../domain/state'
import type { AppState, FavoriteNode, KillRequest, KillResult, PortProcess } from '../domain/types'

export type PickedFavorite = Pick<FavoriteNode, 'kind' | 'path' | 'name' | 'parentId' | 'tags' | 'color'>

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

export function getPlatform(): EypcPlatformApi {
  if (typeof window !== 'undefined' && window.eypcPlatform) return window.eypcPlatform
  return {
    storage: {
      getState: () => memory.state,
      setState: (state) => {
        memory.state = normalizeAppState(state)
        return true
      }
    },
    ports: {
      scan: async () => [],
      kill: async (request) => ({ ok: false, ...request, error: 'uTools preload unavailable' })
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
