import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const preloadSource = resolve(root, 'preload/index.js')
const publicPreload = resolve(root, 'public/preload.js')
const distDir = resolve(root, 'dist')
const distPreload = resolve(distDir, 'preload.js')

copyFileSync(preloadSource, publicPreload)

if (existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true })
  copyFileSync(preloadSource, distPreload)
}

console.log('uTools runtime assets prepared')
