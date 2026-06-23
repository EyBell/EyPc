import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const preloadSource = resolve(root, 'preload/index.js')
const pluginSource = resolve(root, 'public/plugin.json')
const publicPackageJson = resolve(root, 'public/package.json')
const publicPreload = resolve(root, 'public/preload.js')
const distDir = resolve(root, 'dist')
const distPlugin = resolve(distDir, 'plugin.json')
const distPackageJson = resolve(distDir, 'package.json')
const distPreload = resolve(distDir, 'preload.js')
const commonJsPackageScope = `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`

writeFileSync(publicPackageJson, commonJsPackageScope)
copyFileSync(preloadSource, publicPreload)

if (existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true })
  copyFileSync(pluginSource, distPlugin)
  writeFileSync(distPackageJson, commonJsPackageScope)
  copyFileSync(preloadSource, distPreload)
}

console.log('uTools runtime assets prepared')
