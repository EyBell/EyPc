import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import * as pathModule from 'node:path'
import { resolve } from 'node:path'
import vm from 'node:vm'

const root = resolve(import.meta.dirname, '..')
const distDir = resolve(root, 'dist')
const canonicalPreload = readFileSync(resolve(root, 'preload/index.js'), 'utf8')
const publicPreload = readFileSync(resolve(root, 'public/preload.js'), 'utf8')
const canonicalFloatPreload = readFileSync(resolve(root, 'preload/float.js'), 'utf8')
const publicFloatPreload = readFileSync(resolve(root, 'public/float-preload.js'), 'utf8')
const maxJavaScriptChunkBytes = 500_000

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readJson(file) {
  return JSON.parse(readFileSync(resolve(distDir, file), 'utf8'))
}

function assertRelativeFile(pluginJson, field) {
  const value = pluginJson[field]
  assert(typeof value === 'string' && value.length > 0, `plugin.json ${field} must be a non-empty string`)
  assert(!value.startsWith('/') && !value.includes('..'), `plugin.json ${field} must be a safe relative path`)
  assert(existsSync(resolve(distDir, value)), `plugin.json ${field} target is missing: ${value}`)
}

for (const file of ['index.html', 'float.html', 'plugin.json', 'package.json', 'preload.js', 'float-preload.js', 'logo.svg']) {
  assert(existsSync(resolve(distDir, file)), `dist runtime file is missing: ${file}`)
}

assert(publicPreload === canonicalPreload, 'public preload.js must match preload/index.js')
assert(publicFloatPreload === canonicalFloatPreload, 'public float-preload.js must match preload/float.js')
const oversizedJavaScriptChunks = readdirSync(resolve(distDir, 'assets'))
  .filter((file) => file.endsWith('.js') && statSync(resolve(distDir, 'assets', file)).size > maxJavaScriptChunkBytes)
assert(oversizedJavaScriptChunks.length === 0, 'JavaScript chunks must stay within 500 kB: ' + oversizedJavaScriptChunks.join(', '))

const indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf8')
assert(!/\b(?:src|href)="\/assets\//.test(indexHtml), 'dist index.html must use relative asset paths for uTools packages')
const floatHtml = readFileSync(resolve(distDir, 'float.html'), 'utf8')
assert(!/\b(?:src|href)="\/assets\//.test(floatHtml), 'dist float.html must use relative asset paths for uTools packages')

const pluginJson = readJson('plugin.json')
const distPackageJson = readJson('package.json')
assert(distPackageJson.type === 'commonjs', 'dist package.json type must be commonjs')
assertRelativeFile(pluginJson, 'main')
assertRelativeFile(pluginJson, 'logo')
assertRelativeFile(pluginJson, 'preload')
assert(pluginJson.pluginSetting?.single === true, 'plugin.json pluginSetting.single must be true')
assert(Number.isInteger(pluginJson.pluginSetting?.height) && pluginJson.pluginSetting.height >= 480, 'plugin.json height must be >= 480')
assert(Array.isArray(pluginJson.features) && pluginJson.features.length >= 4, 'plugin.json features must include MVP entries')

const requiredCodes = ['eypc-main', 'eypc-ports', 'eypc-favorites', 'eypc-favorites-quick', 'eypc-codex', 'eypc-codex-toggle', 'eypc-codex-activate', 'eypc-settings']
const codes = new Set()
for (const feature of pluginJson.features) {
  assert(typeof feature.code === 'string' && feature.code.trim(), 'feature.code must be non-empty')
  assert(!codes.has(feature.code), `duplicate feature.code: ${feature.code}`)
  codes.add(feature.code)
  assert(Array.isArray(feature.cmds) && feature.cmds.length > 0, `feature ${feature.code} cmds must be non-empty`)
}
for (const code of requiredCodes) {
  assert(codes.has(code), `missing feature code: ${code}`)
}
assert(codes.has('eypc-windows'), 'missing window jump feature code')
for (let slot = 1; slot <= 10; slot += 1) {
  const label = `EyPc 窗口槽 ${slot}`
  const feature = pluginJson.features.find((item) => item.code === `eypc-window-slot-${slot}`)
  assert(feature?.cmds?.includes(label), `missing stable window slot feature: ${label}`)
  assert(feature?.mainHide === true, `window slot ${slot} must run with mainHide=true`)
}
const codexToggleFeature = pluginJson.features.find((feature) => feature.code === 'eypc-codex-toggle')
assert(codexToggleFeature?.mainHide === true, 'Codex float toggle feature must run with mainHide=true')
assert(codexToggleFeature?.cmds?.includes('切换 Codex 悬浮球'), 'Codex float toggle feature must expose the stable hotkey command label')
const codexActivateFeature = pluginJson.features.find((feature) => feature.code === 'eypc-codex-activate')
assert(codexActivateFeature?.mainHide === true, 'Codex card activation feature must run with mainHide=true')
assert(codexActivateFeature?.cmds?.includes('直接展开 Codex 卡片'), 'Codex card activation feature must expose the stable global-hotkey command label')

const preloadSource = readFileSync(resolve(distDir, 'preload.js'), 'utf8')
assert(preloadSource === canonicalPreload, 'dist preload.js must match preload/index.js')
const floatPreloadSource = readFileSync(resolve(distDir, 'float-preload.js'), 'utf8')
assert(floatPreloadSource === canonicalFloatPreload, 'dist float-preload.js must match preload/float.js')
const ipcListeners = new Map()
const sandbox = {
  window: {},
  globalThis: {},
  process: { platform: 'darwin', env: {}, cwd: () => '/tmp' },
  require(name) {
    if (name === 'node:buffer') return { Buffer }
    if (name === 'node:child_process') return { execFile() {}, spawn() { throw new Error('spawn unavailable in validation') } }
    if (name === 'node:crypto') return crypto
    if (name === 'node:net') return { connect() { throw new Error('desktop socket unavailable in validation') } }
    if (name === 'node:fs') return {
      existsSync: () => false,
      readdirSync: () => [],
      statSync: () => ({ isFile: () => false }),
      promises: {
        readdir: async () => {
          throw new Error('directory unavailable')
        }
      }
    }
    if (name === 'node:path') return pathModule
    if (name === 'node:os') return { homedir: () => '/tmp' }
    if (name === 'electron') return { ipcRenderer: { on(channel, listener) { ipcListeners.set(channel, listener) } } }
    throw new Error(`unexpected require: ${name}`)
  }
}
sandbox.globalThis = sandbox
vm.runInNewContext(preloadSource, sandbox, { filename: 'preload.js' })
assert(sandbox.window.eypcPlatform, 'preload must expose window.eypcPlatform')
assert(typeof sandbox.window.eypcPlatform.ports.scan === 'function', 'preload must expose ports.scan')
assert(typeof sandbox.window.eypcPlatform.ports.kill === 'function', 'preload must expose ports.kill')
assert(typeof sandbox.window.eypcPlatform.windows.capabilities === 'function', 'preload must expose windows.capabilities')
assert(typeof sandbox.window.eypcPlatform.windows.list === 'function', 'preload must expose windows.list')
assert(typeof sandbox.window.eypcPlatform.windows.activate === 'function', 'preload must expose windows.activate')
assert(typeof sandbox.window.eypcPlatform.windows.alwaysOnTop === 'function', 'preload must expose windows.alwaysOnTop')
assert(typeof sandbox.window.eypcPlatform.files.copyPath === 'function', 'preload must expose files.copyPath')
assert(typeof sandbox.window.eypcPlatform.files.copyItems === 'function', 'preload must expose files.copyItems')
assert(typeof sandbox.window.eypcPlatform.files.inspectPaths === 'function', 'preload must expose files.inspectPaths')
assert(typeof sandbox.window.eypcPlatform.files.capabilities === 'object', 'preload must expose files.capabilities')
assert(typeof sandbox.window.eypcPlatform.files.pickFavorite === 'function', 'preload must expose files.pickFavorite')
assert(typeof sandbox.window.eypcPlatform.files.pickFavorites === 'function', 'preload must expose files.pickFavorites')
assert(typeof sandbox.window.eypcPlatform.files.listDirectory === 'function', 'preload must expose files.listDirectory')
assert(typeof sandbox.window.eypcPlatform.codex.readSnapshot === 'function', 'preload must expose codex.readSnapshot')
assert(typeof sandbox.window.eypcPlatform.codex.readActivitySnapshot === 'function', 'preload must expose codex.readActivitySnapshot')
assert(typeof sandbox.window.eypcPlatform.codex.inspectEnvironment === 'function', 'preload must expose codex.inspectEnvironment')
assert(typeof sandbox.window.eypcPlatform.codex.openThread === 'function', 'preload must expose codex.openThread')
assert(typeof sandbox.window.eypcPlatform.float.sync === 'function', 'preload must expose float.sync')
assert(typeof sandbox.window.eypcPlatform.float.resetGeometry === 'function', 'preload must expose float.resetGeometry')
assert((await sandbox.window.eypcPlatform.files.copyPath('/tmp/demo')).outcome === 'failed', 'copyPath fallback must report a structured failure when host API is unavailable')
assert((await sandbox.window.eypcPlatform.files.copyPath('/tmp/demo')).errorCode === 'unsupported', 'copyPath fallback must identify unsupported hosts')
assert(await sandbox.window.eypcPlatform.files.pickFavorite() === null, 'pickFavorite fallback must return null when host API is unavailable')
assert(Array.isArray(await sandbox.window.eypcPlatform.files.pickFavorites()), 'pickFavorites fallback must return an array')
assert((await sandbox.window.eypcPlatform.files.listDirectory('/tmp')).ok === false, 'listDirectory fallback must report unavailable')

const floatSandbox = {
  window: {},
  globalThis: {},
  require(name) {
    if (name === 'electron') return { ipcRenderer: { on() {} } }
    throw new Error(`unexpected float require: ${name}`)
  }
}
floatSandbox.globalThis = floatSandbox
vm.runInNewContext(floatPreloadSource, floatSandbox, { filename: 'float-preload.js' })
assert(typeof floatSandbox.window.eypcFloat?.onSnapshot === 'function', 'float preload must expose snapshot subscription')
assert(typeof floatSandbox.window.eypcFloat?.action === 'function', 'float preload must expose actions')
assert(typeof floatSandbox.window.eypcFloat?.resizeStart === 'function', 'float preload must expose resizeStart')
assert(typeof floatSandbox.window.eypcFloat?.resizeMove === 'function', 'float preload must expose resizeMove')
assert(typeof floatSandbox.window.eypcFloat?.resizeEnd === 'function', 'float preload must expose resizeEnd')
assert(typeof floatSandbox.window.eypcFloat?.resizeCancel === 'function', 'float preload must expose resizeCancel')

console.log('uTools runtime validation passed')
