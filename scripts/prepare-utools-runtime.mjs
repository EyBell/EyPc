import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { syncUtoolsPreloads } from './utools-preload-assets.mjs'

const root = resolve(import.meta.dirname, '..')
const pluginSource = resolve(root, 'public/plugin.json')
const publicPackageJson = resolve(root, 'public/package.json')
const koffiSource = resolve(root, 'node_modules/koffi')
const distDir = resolve(root, 'dist')
const distPlugin = resolve(distDir, 'plugin.json')
const distPackageJson = resolve(distDir, 'package.json')
const commonJsPackageScope = `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`
const developmentMode = process.argv.includes('--development')
const developmentFloatEntry = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>EyPc Codex Float Development</title></head>
  <body><script>location.replace('http://127.0.0.1:8092/float.html')</script></body>
</html>
`
const developmentActionEntry = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>EyPc Action Runner Development</title></head>
  <body><script>location.replace('http://127.0.0.1:8092/action.html')</script></body>
</html>
`

function copyKoffiInto(pluginDir) {
  if (!existsSync(koffiSource)) return
  const target = resolve(pluginDir, 'node_modules/koffi')
  mkdirSync(resolve(pluginDir, 'node_modules'), { recursive: true })
  // Replace any prior symlink/tree so pnpm's linked node_modules/koffi is never cpSync'd onto itself.
  rmSync(target, { recursive: true, force: true })
  cpSync(koffiSource, target, { recursive: true, dereference: true })
}

writeFileSync(publicPackageJson, commonJsPackageScope)
syncUtoolsPreloads(root, 'public')
copyKoffiInto(resolve(root, 'public'))

if (existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true })
  copyFileSync(pluginSource, distPlugin)
  writeFileSync(distPackageJson, commonJsPackageScope)
  syncUtoolsPreloads(root, 'dist')
  copyKoffiInto(distDir)
  if (developmentMode) {
    writeFileSync(resolve(distDir, 'float.html'), developmentFloatEntry)
    writeFileSync(resolve(distDir, 'action.html'), developmentActionEntry)
  }
}

console.log('uTools runtime assets prepared')
