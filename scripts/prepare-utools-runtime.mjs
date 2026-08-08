import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { syncUtoolsPreloads } from './utools-preload-assets.mjs'

const root = resolve(import.meta.dirname, '..')
const pluginSource = resolve(root, 'public/plugin.json')
const publicPackageJson = resolve(root, 'public/package.json')
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

const runtimeRequire = createRequire(import.meta.url)
const obsoleteRuntimeDependencies = [
  'leveldown',
  'abstract-leveldown',
  'level-concat-iterator',
  'napi-macros',
  'node-gyp-build'
]

/**
 * Copies one production dependency and its complete runtime closure into the
 * standalone uTools plugin directory. pnpm keeps dependencies as siblings in
 * its virtual store, so copying only a package's own directory is insufficient
 * for modules such as `leveldown`.
 */
function copyRuntimeDependencyInto(pluginDir, packageName) {
  const copied = new Set()
  const visit = (name, lookupPaths) => {
    if (copied.has(name)) return
    const manifestPath = runtimeRequire.resolve(`${name}/package.json`, { paths: lookupPaths })
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const source = resolve(manifestPath, '..')
    const target = resolve(pluginDir, 'node_modules', ...name.split('/'))
    mkdirSync(resolve(target, '..'), { recursive: true })
    rmSync(target, { recursive: true, force: true })
    cpSync(source, target, { recursive: true, dereference: true })
    copied.add(name)
    for (const dependency of Object.keys(manifest.dependencies || {})) {
      visit(dependency, [source])
    }
  }
  visit(packageName, [root])
}

function copyRuntimeDependencies(pluginDir) {
  // A rejected prototype bundled `leveldown`, but macOS Hardened Runtime will
  // not load that differently signed addon inside uTools. Production uses the
  // host-signed copy and removes every generated prototype artifact by exact
  // package name before packaging.
  for (const packageName of obsoleteRuntimeDependencies) {
    rmSync(resolve(pluginDir, 'node_modules', ...packageName.split('/')), { recursive: true, force: true })
  }
  for (const packageName of ['koffi']) {
    copyRuntimeDependencyInto(pluginDir, packageName)
  }
}

writeFileSync(publicPackageJson, commonJsPackageScope)
syncUtoolsPreloads(root, 'public')
copyRuntimeDependencies(resolve(root, 'public'))

if (existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true })
  copyFileSync(pluginSource, distPlugin)
  writeFileSync(distPackageJson, commonJsPackageScope)
  syncUtoolsPreloads(root, 'dist')
  copyRuntimeDependencies(distDir)
  if (developmentMode) {
    writeFileSync(resolve(distDir, 'float.html'), developmentFloatEntry)
    writeFileSync(resolve(distDir, 'action.html'), developmentActionEntry)
  }
}

console.log('uTools runtime assets prepared')
