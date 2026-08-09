export interface UtoolsPreloadAsset {
  readonly id: string
  readonly canonical: string
  readonly public: string
  readonly dist: string
}

export interface UtoolsPreloadModuleGroup {
  readonly id: string
  readonly directory: string
  readonly files: readonly string[]
}

export interface UtoolsPreloadModuleAsset {
  readonly group: string
  readonly canonical: string
  readonly public: string
  readonly dist: string
}

export const UTOOLS_PRELOAD_ASSETS: readonly UtoolsPreloadAsset[]
export const UTOOLS_PRELOAD_MODULE_GROUPS: readonly UtoolsPreloadModuleGroup[]
export const UTOOLS_PRELOAD_MODULE_ASSETS: readonly UtoolsPreloadModuleAsset[]
export function syncUtoolsPreloads(root: string, target: 'public' | 'dist'): void
