import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

const root = resolve(import.meta.dirname, '..')
const distDir = resolve(root, 'dist')

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

for (const file of ['index.html', 'plugin.json', 'preload.js', 'logo.svg']) {
  assert(existsSync(resolve(distDir, file)), `dist runtime file is missing: ${file}`)
}

const pluginJson = readJson('plugin.json')
assertRelativeFile(pluginJson, 'main')
assertRelativeFile(pluginJson, 'logo')
assertRelativeFile(pluginJson, 'preload')
assert(pluginJson.pluginSetting?.single === true, 'plugin.json pluginSetting.single must be true')
assert(Number.isInteger(pluginJson.pluginSetting?.height) && pluginJson.pluginSetting.height >= 480, 'plugin.json height must be >= 480')
assert(Array.isArray(pluginJson.features) && pluginJson.features.length >= 4, 'plugin.json features must include MVP entries')

const requiredCodes = ['eypc-main', 'eypc-ports', 'eypc-favorites', 'eypc-settings']
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
const sandbox = {
  window: {},
  globalThis: {},
  process: { platform: 'darwin' },
  require(name) {
    if (name === 'node:child_process') return { execFile() {} }
    if (name === 'node:path') return { basename: (value) => String(value).split('/').pop() }
    throw new Error(`unexpected require: ${name}`)
  }
}
sandbox.globalThis = sandbox
vm.runInNewContext(preloadSource, sandbox, { filename: 'preload.js' })
assert(sandbox.window.eypcPlatform, 'preload must expose window.eypcPlatform')
assert(typeof sandbox.window.eypcPlatform.ports.scan === 'function', 'preload must expose ports.scan')
assert(typeof sandbox.window.eypcPlatform.ports.kill === 'function', 'preload must expose ports.kill')

console.log('uTools runtime validation passed')
