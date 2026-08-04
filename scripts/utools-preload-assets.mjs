import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

export const UTOOLS_PRELOAD_ASSETS = Object.freeze([
  { id: 'main', canonical: 'preload/index.js', public: 'public/preload.js', dist: 'preload.js' },
  { id: 'float', canonical: 'preload/float.js', public: 'public/float-preload.js', dist: 'float-preload.js' },
  { id: 'action', canonical: 'preload/action.js', public: 'public/action-preload.js', dist: 'action-preload.js' }
])

export const UTOOLS_PRELOAD_MODULE_ASSETS = Object.freeze([
  'index.cjs',
  'native-command.cjs',
  'session-cache.cjs',
  'macos.cjs',
  'macos-space.cjs',
  'win32.cjs'
].map((file) => ({
  canonical: `preload/windows/${file}`,
  public: `public/windows/${file}`,
  dist: `windows/${file}`
})))

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
