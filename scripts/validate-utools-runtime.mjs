import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import * as pathModule from 'node:path'
import { resolve } from 'node:path'
import vm from 'node:vm'

const root = resolve(import.meta.dirname, '..')
const distDir = resolve(root, 'dist')
const canonicalPreload = readFileSync(resolve(root, 'preload/index.js'), 'utf8')
const publicPreload = readFileSync(resolve(root, 'public/preload.js'), 'utf8')

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

for (const file of ['index.html', 'plugin.json', 'package.json', 'preload.js', 'logo.svg']) {
  assert(existsSync(resolve(distDir, file)), `dist runtime file is missing: ${file}`)
}

assert(publicPreload === canonicalPreload, 'public preload.js must match preload/index.js')

const indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf8')
assert(!/\b(?:src|href)="\/assets\//.test(indexHtml), 'dist index.html must use relative asset paths for uTools packages')

const pluginJson = readJson('plugin.json')
const distPackageJson = readJson('package.json')
assert(distPackageJson.type === 'commonjs', 'dist package.json type must be commonjs')
assertRelativeFile(pluginJson, 'main')
assertRelativeFile(pluginJson, 'logo')
assertRelativeFile(pluginJson, 'preload')
assert(pluginJson.pluginSetting?.single === true, 'plugin.json pluginSetting.single must be true')
assert(Number.isInteger(pluginJson.pluginSetting?.height) && pluginJson.pluginSetting.height >= 480, 'plugin.json height must be >= 480')
assert(Array.isArray(pluginJson.features) && pluginJson.features.length >= 4, 'plugin.json features must include MVP entries')

const requiredCodes = ['eypc-main', 'eypc-ports', 'eypc-favorites', 'eypc-favorites-quick', 'eypc-settings']
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

const preloadSource = readFileSync(resolve(distDir, 'preload.js'), 'utf8')
assert(preloadSource === canonicalPreload, 'dist preload.js must match preload/index.js')
const sandbox = {
  window: {},
  globalThis: {},
  process: { platform: 'darwin' },
  require(name) {
    if (name === 'node:buffer') return { Buffer }
    if (name === 'node:child_process') return { execFile() {} }
    if (name === 'node:crypto') return crypto
    if (name === 'node:fs') return {
      statSync: () => ({ isFile: () => false }),
      promises: {
        readdir: async () => {
          throw new Error('directory unavailable')
        }
      }
    }
    if (name === 'node:path') return pathModule
    if (name === 'node:os') return { homedir: () => '/tmp' }
    throw new Error(`unexpected require: ${name}`)
  }
}
sandbox.globalThis = sandbox
vm.runInNewContext(preloadSource, sandbox, { filename: 'preload.js' })
assert(sandbox.window.eypcPlatform, 'preload must expose window.eypcPlatform')
assert(typeof sandbox.window.eypcPlatform.ports.scan === 'function', 'preload must expose ports.scan')
assert(typeof sandbox.window.eypcPlatform.ports.kill === 'function', 'preload must expose ports.kill')
assert(typeof sandbox.window.eypcPlatform.files.copyPath === 'function', 'preload must expose files.copyPath')
assert(typeof sandbox.window.eypcPlatform.files.copyItems === 'function', 'preload must expose files.copyItems')
assert(typeof sandbox.window.eypcPlatform.files.inspectPaths === 'function', 'preload must expose files.inspectPaths')
assert(typeof sandbox.window.eypcPlatform.files.capabilities === 'object', 'preload must expose files.capabilities')
assert(typeof sandbox.window.eypcPlatform.files.pickFavorite === 'function', 'preload must expose files.pickFavorite')
assert(typeof sandbox.window.eypcPlatform.files.pickFavorites === 'function', 'preload must expose files.pickFavorites')
assert(typeof sandbox.window.eypcPlatform.files.listDirectory === 'function', 'preload must expose files.listDirectory')
assert((await sandbox.window.eypcPlatform.files.copyPath('/tmp/demo')).outcome === 'failed', 'copyPath fallback must report a structured failure when host API is unavailable')
assert((await sandbox.window.eypcPlatform.files.copyPath('/tmp/demo')).errorCode === 'unsupported', 'copyPath fallback must identify unsupported hosts')
assert(await sandbox.window.eypcPlatform.files.pickFavorite() === null, 'pickFavorite fallback must return null when host API is unavailable')
assert(Array.isArray(await sandbox.window.eypcPlatform.files.pickFavorites()), 'pickFavorites fallback must return an array')
assert((await sandbox.window.eypcPlatform.files.listDirectory('/tmp')).ok === false, 'listDirectory fallback must report unavailable')

console.log('uTools runtime validation passed')
