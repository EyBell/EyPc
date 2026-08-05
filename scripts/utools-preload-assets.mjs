import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

export const UTOOLS_PRELOAD_ASSETS = Object.freeze([
  { id: 'main', canonical: 'preload/index.js', public: 'public/preload.js', dist: 'preload.js' },
  { id: 'float', canonical: 'preload/float.js', public: 'public/float-preload.js', dist: 'float-preload.js' },
  { id: 'action', canonical: 'preload/action.js', public: 'public/action-preload.js', dist: 'action-preload.js' }
])

/**
 * Preload module groups mirrored verbatim into public/ and dist/. Each group is
 * a self-contained subsystem the main preload loads through a guarded require,
 * so a group can be added without touching the sync, prepare or validate steps.
 */
export const UTOOLS_PRELOAD_MODULE_GROUPS = Object.freeze([
  {
    id: 'windows',
    directory: 'windows',
    files: ['index.cjs', 'native-command.cjs', 'session-cache.cjs', 'macos.cjs', 'macos-space.cjs', 'win32.cjs']
  },
  {
    id: 'claude',
    directory: 'claude',
    files: ['index.cjs', 'transcript.cjs', 'settings.cjs', 'events.cjs', 'scripts.cjs', 'environment.cjs', 'open.cjs', 'quota.cjs']
  }
])

export const UTOOLS_PRELOAD_MODULE_ASSETS = Object.freeze(
  UTOOLS_PRELOAD_MODULE_GROUPS.flatMap((group) => group.files.map((file) => ({
    group: group.id,
    canonical: `preload/${group.directory}/${file}`,
    public: `public/${group.directory}/${file}`,
    dist: `${group.directory}/${file}`
  })))
)

export function syncUtoolsPreloads(root, target) {
  if (target !== 'public' && target !== 'dist') throw new Error(`unsupported preload target: ${target}`)
  for (const asset of UTOOLS_PRELOAD_ASSETS) {
    const destination = target === 'public'
      ? resolve(root, asset.public)
      : resolve(root, 'dist', asset.dist)
    copyFileSync(resolve(root, asset.canonical), destination)
  }
  for (const asset of UTOOLS_PRELOAD_MODULE_ASSETS) {
    const destination = target === 'public'
      ? resolve(root, asset.public)
      : resolve(root, 'dist', asset.dist)
    const directory = resolve(destination, '..')
    mkdirSync(directory, { recursive: true })
    copyFileSync(resolve(root, asset.canonical), destination)
  }
}
