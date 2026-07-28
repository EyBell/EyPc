import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const preloadSource = resolve(root, 'preload/index.js')
const floatPreloadSource = resolve(root, 'preload/float.js')
const pluginSource = resolve(root, 'public/plugin.json')
const publicPackageJson = resolve(root, 'public/package.json')
const publicPreload = resolve(root, 'public/preload.js')
const publicFloatPreload = resolve(root, 'public/float-preload.js')
const koffiSource = resolve(root, 'node_modules/koffi')
const distDir = resolve(root, 'dist')
const distPlugin = resolve(distDir, 'plugin.json')
const distPackageJson = resolve(distDir, 'package.json')
const distPreload = resolve(distDir, 'preload.js')
const distFloatPreload = resolve(distDir, 'float-preload.js')
const commonJsPackageScope = `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`
const developmentMode = process.argv.includes('--development')
const developmentFloatEntry = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>EyPc Codex Float Development</title></head>
  <body><script>location.replace('http://127.0.0.1:8092/float.html')</script></body>
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
copyFileSync(preloadSource, publicPreload)
copyFileSync(floatPreloadSource, publicFloatPreload)
copyKoffiInto(resolve(root, 'public'))

if (existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true })
  copyFileSync(pluginSource, distPlugin)
  writeFileSync(distPackageJson, commonJsPackageScope)
  copyFileSync(preloadSource, distPreload)
  copyFileSync(floatPreloadSource, distFloatPreload)
  copyKoffiInto(distDir)
  if (developmentMode) writeFileSync(resolve(distDir, 'float.html'), developmentFloatEntry)
}

console.log('uTools runtime assets prepared')
