import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import * as pathModule from 'node:path'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { UTOOLS_PRELOAD_ASSETS, UTOOLS_PRELOAD_MODULE_ASSETS } from './utools-preload-assets.mjs'

const root = resolve(import.meta.dirname, '..')
const distDir = resolve(root, 'dist')
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

for (const file of ['index.html', 'float.html', 'action.html', 'plugin.json', 'package.json', 'preload.js', 'float-preload.js', 'action-preload.js', 'logo.svg']) {
  assert(existsSync(resolve(distDir, file)), `dist runtime file is missing: ${file}`)
}

const oversizedJavaScriptChunks = readdirSync(resolve(distDir, 'assets'))
  .filter((file) => file.endsWith('.js') && statSync(resolve(distDir, 'assets', file)).size > maxJavaScriptChunkBytes)
assert(oversizedJavaScriptChunks.length === 0, `JavaScript chunks must stay within 500 kB: ${oversizedJavaScriptChunks.join(', ')}`)

const preloadSources = Object.fromEntries(UTOOLS_PRELOAD_ASSETS.map((asset) => {
  const canonical = readFileSync(resolve(root, asset.canonical), 'utf8')
  const publicMirror = readFileSync(resolve(root, asset.public), 'utf8')
  const distMirror = readFileSync(resolve(distDir, asset.dist), 'utf8')
  assert(publicMirror === canonical, `${asset.public} must match ${asset.canonical}`)
  assert(distMirror === canonical, `dist/${asset.dist} must match ${asset.canonical}`)
  return [asset.id, distMirror]
}))

const preloadModuleSources = new Map()
for (const asset of UTOOLS_PRELOAD_MODULE_ASSETS) {
  const canonical = readFileSync(resolve(root, asset.canonical), 'utf8')
  const publicMirror = readFileSync(resolve(root, asset.public), 'utf8')
  const distMirror = readFileSync(resolve(distDir, asset.dist), 'utf8')
  assert(publicMirror === canonical, `${asset.public} must match ${asset.canonical}`)
  assert(distMirror === canonical, `dist/${asset.dist} must match ${asset.canonical}`)
  preloadModuleSources.set(asset.dist, canonical)
}

const canonicalMainPreload = preloadSources.main
const macosWindowModuleSource = preloadModuleSources.get('windows/macos.cjs') || ''
const win32WindowModuleSource = preloadModuleSources.get('windows/win32.cjs') || ''
for (const marker of ['MACOS_AX_WINDOW_LIST_SCRIPT', 'WINDOWS_ENUM_SCRIPT', 'CGWindowListCopyWindowInfo', 'SLSCopySpacesForWindows', 'EnumWindows']) {
  assert(!canonicalMainPreload.includes(marker), `main preload must not retain native window implementation: ${marker}`)
}
assert(macosWindowModuleSource.includes('MACOS_AX_WINDOW_LIST_SCRIPT'), 'macOS window module must own the AX/CG inventory script')
assert(macosWindowModuleSource.includes('function macosActivateWindowScript'), 'macOS window module must own exact activation')
assert(win32WindowModuleSource.includes('WINDOWS_ENUM_SCRIPT'), 'Win32 window module must own EnumWindows inventory')
assert(win32WindowModuleSource.includes('WINDOWS_TOPMOST_SCRIPT'), 'Win32 window module must own foreground/topmost behavior')

const distRequire = createRequire(resolve(distDir, 'preload.js'))
const windowModule = distRequire('./windows/index.cjs')
assert(typeof windowModule.createWindowSubsystem === 'function', 'window preload module must expose createWindowSubsystem')
const windowModuleProbe = windowModule.createWindowSubsystem({ execFile() { throw new Error('native window command must stay lazy during validation') } })
assert(typeof windowModuleProbe.probeInstance === 'function', 'window preload module must expose exact instance probing')
assert(typeof windowModuleProbe.prepareActivation === 'function', 'window preload module must expose Space-aware activation preparation')
assert(typeof windowModuleProbe.runNativeCommand === 'function', 'window preload module must own bounded native command execution')
for (const method of ['capabilities', 'list', 'activate', 'close', 'terminate', 'alwaysOnTop']) {
  assert(typeof windowModuleProbe[method] === 'function', `window preload module must expose stable ${method}`)
}
assert(typeof windowModuleProbe.openPermissionSettings === 'function', 'window preload module must expose permission settings routing')

const claudeModule = distRequire('./claude/index.cjs')
const claudeScriptsModule = distRequire('./claude/scripts.cjs')
assert(typeof claudeModule.createClaudeBridge === 'function', 'claude preload module must expose createClaudeBridge')
const claudeModuleProbe = claudeModule.createClaudeBridge({
  fs: { readdirSync: () => [], statSync() { throw new Error('claude module must stay lazy during validation') }, readFileSync() { throw new Error('lazy') } },
  path: pathModule,
  os: { homedir: () => '/tmp' },
  dataDirectory: '/tmp/eypc-claude-validation'
})
for (const method of ['inspect', 'readSnapshot', 'readQuotaFallback', 'readDesktopSnapshot', 'readPlanUsage', 'readDesktopUnread', 'watchDesktopSessions', 'watchEvents', 'install', 'uninstall', 'openTask', 'close']) {
  assert(typeof claudeModuleProbe[method] === 'function', `claude preload module must expose stable ${method}`)
}
assert(claudeModuleProbe.readSnapshot().sessions.length === 0, 'claude module must degrade to an empty inventory without a readable home')
assert(claudeModuleProbe.readDesktopSnapshot().sessions.length === 0, 'claude desktop reader must degrade to an empty inventory without a readable root')
assert(claudeModuleProbe.readPlanUsage() === null, 'claude plan-usage reader must degrade to null without a readable history file')
// `null` and `{ids: []}` are different claims: the second one would be spent as
// "the user has read everything", so an unreadable store must never produce it.
assert(claudeModuleProbe.readDesktopUnread() === null, 'claude unread reader must degrade to null, never to an empty set')
const claudeDesktopSource = preloadModuleSources.get('claude/desktop.cjs') || ''
// Deny-list every mutating fs call, not just the three that happened to be
// used. The previous three-literal check would have waved through
// `appendFileSync`, `mkdirSync`, `rmSync`, `truncateSync` or a write-mode
// `createWriteStream` (P5 review).
// Match call sites, not prose: the module's own comments legitimately discuss
// rename and archive rewrites, so a bare substring test would fail on its
// documentation instead of on its behaviour.
const claudeDesktopCode = claudeDesktopSource
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')
for (const forbidden of [
  'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'renameSync', 'rename',
  'unlinkSync', 'unlink', 'rmSync', 'rmdirSync', 'mkdirSync', 'mkdtempSync', 'copyFileSync',
  'truncateSync', 'ftruncateSync', 'chmodSync', 'chownSync', 'utimesSync', 'createWriteStream', 'writeSync'
]) {
  const callSite = new RegExp(`\\b${forbidden}\\s*\\(`)
  assert(!callSite.test(claudeDesktopCode), `claude desktop reader must stay strictly read-only (found ${forbidden})`)
}
assert(claudeDesktopSource.includes('systemPrompt'), 'claude desktop reader must document the metadata whitelist against content-bearing fields')
const claudeSettingsSource = preloadModuleSources.get('claude/settings.cjs') || ''
assert(claudeSettingsSource.includes('eypc-claude-companion'), 'claude settings module must carry the uninstall marker')
const claudeScriptsSource = preloadModuleSources.get('claude/scripts.cjs') || ''
assert(claudeScriptsSource.includes('exit 0'), 'generated claude scripts must fail open')
// EyPc's data directory lives under a path with a space on macOS, and Claude
// Code runs the registered entry through a shell.
assert(
  claudeScriptsModule.settingsCommandLine('/a b/hook.sh', 'darwin') === "'/a b/hook.sh'",
  'registered claude command must be shell quoted'
)
const claudeQuotaSource = preloadModuleSources.get('claude/quota.cjs') || ''
assert(claudeQuotaSource.includes('settings.enabled !== true'), 'claude quota fallback must stay opt-in')
assert(!claudeQuotaSource.includes('writeFileSync'), 'claude quota fallback must never persist a credential')

const indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf8')
assert(!/\b(?:src|href)="\/assets\//.test(indexHtml), 'dist index.html must use relative asset paths for uTools packages')
const floatHtml = readFileSync(resolve(distDir, 'float.html'), 'utf8')
assert(!/\b(?:src|href)="\/assets\//.test(floatHtml), 'dist float.html must use relative asset paths for uTools packages')
const actionHtml = readFileSync(resolve(distDir, 'action.html'), 'utf8')
assert(!/\b(?:src|href)="\/assets\//.test(actionHtml), 'dist action.html must use relative asset paths for uTools packages')

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
const actionRunnerFeature = pluginJson.features.find((feature) => feature.code === 'eypc-codex-action-runner')
assert(actionRunnerFeature?.mainHide === true, 'Action Runner feature must run with mainHide=true')
assert(actionRunnerFeature?.cmds?.includes('打开 Action 执行工作台'), 'Action Runner must expose the stable global-hotkey command label')

const preloadSource = preloadSources.main
const floatPreloadSource = preloadSources.float
const actionPreloadSource = preloadSources.action
const ipcListeners = new Map()
const sandbox = {
  window: {},
  globalThis: {},
  process: { platform: 'darwin', env: {}, cwd: () => '/tmp' },
  require(name) {
    if (name === './windows/index.cjs') return windowModule
    if (name === './claude/index.cjs') return claudeModule
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
assert(typeof sandbox.window.eypcPlatform.windows.probeInstance === 'function', 'preload must expose windows.probeInstance')
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
assert(typeof sandbox.window.eypcPlatform.claude.inspect === 'function', 'preload must expose claude.inspect')
assert(typeof sandbox.window.eypcPlatform.claude.readSnapshot === 'function', 'preload must expose claude.readSnapshot')
// The Controller feature-detects this one. Asserting it on the module alone
// is not enough: the facade omitted it, so the opt-in quota fallback was a
// dead switch in every packaged build while the module test stayed green.
assert(typeof sandbox.window.eypcPlatform.claude.readQuotaFallback === 'function', 'preload must expose claude.readQuotaFallback')
// ...and then the desktop lane was added without heeding the comment directly
// above it: module present, manifest updated, module-level assertion green,
// facade untouched, entire feature dead on the host (P5 review). Enumerating
// the module's own surface makes the next omission fail here instead of on a
// user's machine — a port may only be module-private by being listed below.
// Ports that are deliberately module-internal. Adding a name here is a claim
// that no Controller code path feature-detects it — check before you do.
// `readQuota` is the bridge's own cache reader, consumed internally and by
// tests/platform/claudeBridgeSafety.test.ts, never by the renderer.
const CLAUDE_MODULE_PRIVATE_PORTS = new Set(['revision', 'readQuota'])
for (const method of Object.keys(claudeModuleProbe)) {
  if (CLAUDE_MODULE_PRIVATE_PORTS.has(method)) continue
  if (typeof claudeModuleProbe[method] !== 'function') continue
  assert(
    typeof sandbox.window.eypcPlatform.claude[method] === 'function',
    `claude bridge port ${method} exists but never reached window.eypcPlatform.claude`
  )
}
assert(typeof sandbox.window.eypcPlatform.claude.readDesktopSnapshot === 'function', 'preload must expose claude.readDesktopSnapshot')
assert(Array.isArray(sandbox.window.eypcPlatform.claude.readDesktopSnapshot({}).sessions), 'claude.readDesktopSnapshot must always return a sessions array')
assert(typeof sandbox.window.eypcPlatform.claude.readPlanUsage === 'function', 'preload must expose claude.readPlanUsage')
assert(sandbox.window.eypcPlatform.claude.readPlanUsage() === null, 'claude.readPlanUsage must degrade to null without a readable history file')
assert(typeof sandbox.window.eypcPlatform.claude.watchDesktopSessions === 'function', 'preload must expose claude.watchDesktopSessions')
assert(typeof sandbox.window.eypcPlatform.claude.watchEvents === 'function', 'preload must expose claude.watchEvents')
assert(typeof sandbox.window.eypcPlatform.claude.watchEvents(() => {}) === 'function', 'claude.watchEvents must always return a disposer')
assert(typeof sandbox.window.eypcPlatform.claude.install === 'function', 'preload must expose claude.install')
assert(typeof sandbox.window.eypcPlatform.claude.uninstall === 'function', 'preload must expose claude.uninstall')
assert(typeof sandbox.window.eypcPlatform.claude.openTask === 'function', 'preload must expose claude.openTask')
assert(typeof sandbox.window.eypcPlatform.claude.diagnostics === 'function', 'preload must expose claude.diagnostics')
assert(sandbox.window.eypcPlatform.claude.diagnostics().loaded === true, 'claude bridge must load from the packaged module')
assert(typeof sandbox.window.eypcPlatform.float.sync === 'function', 'preload must expose float.sync')
assert(typeof sandbox.window.eypcPlatform.float.resetGeometry === 'function', 'preload must expose float.resetGeometry')
assert((await sandbox.window.eypcPlatform.files.copyPath('/tmp/demo')).outcome === 'failed', 'copyPath fallback must report a structured failure when host API is unavailable')
assert((await sandbox.window.eypcPlatform.files.copyPath('/tmp/demo')).errorCode === 'unsupported', 'copyPath fallback must identify unsupported hosts')
assert(await sandbox.window.eypcPlatform.files.pickFavorite() === null, 'pickFavorite fallback must return null when host API is unavailable')
assert(Array.isArray(await sandbox.window.eypcPlatform.files.pickFavorites()), 'pickFavorites fallback must return an array')
assert((await sandbox.window.eypcPlatform.files.listDirectory('/tmp')).ok === false, 'listDirectory fallback must report unavailable')

const degradedSandbox = {
  window: {},
  globalThis: {},
  process: sandbox.process,
  require(name) {
    if (name === './windows/index.cjs' || String(name).endsWith('/windows/index.cjs')) throw new Error('window module intentionally unavailable')
    return sandbox.require(name)
  }
}
degradedSandbox.globalThis = degradedSandbox
vm.runInNewContext(preloadSource, degradedSandbox, { filename: 'preload-without-windows.js' })
const nonWindowApiKeys = (value) => Object.keys(value).filter((key) => key !== 'windows').sort().join(',')
assert(nonWindowApiKeys(degradedSandbox.window.eypcPlatform) === nonWindowApiKeys(sandbox.window.eypcPlatform), 'window module failure must not change non-window platform API keys')
const degradedWindowCapability = await degradedSandbox.window.eypcPlatform.windows.capabilities()
assert(degradedWindowCapability.canList === false && degradedWindowCapability.canActivate === false, 'window module failure must degrade only window capability')

const degradedClaudeSandbox = {
  window: {},
  globalThis: {},
  process: sandbox.process,
  require(name) {
    if (name === './claude/index.cjs' || String(name).endsWith('/claude/index.cjs')) throw new Error('claude module intentionally unavailable')
    return sandbox.require(name)
  }
}
degradedClaudeSandbox.globalThis = degradedClaudeSandbox
vm.runInNewContext(preloadSource, degradedClaudeSandbox, { filename: 'preload-without-claude.js' })
const nonClaudeApiKeys = (value) => Object.keys(value).filter((key) => key !== 'claude').sort().join(',')
assert(nonClaudeApiKeys(degradedClaudeSandbox.window.eypcPlatform) === nonClaudeApiKeys(sandbox.window.eypcPlatform), 'claude module failure must not change non-claude platform API keys')
assert(degradedClaudeSandbox.window.eypcPlatform.claude.diagnostics().loaded === false, 'claude module failure must be reported as not loaded')
assert(degradedClaudeSandbox.window.eypcPlatform.claude.readSnapshot().sessions.length === 0, 'claude module failure must degrade to an empty inventory')
assert(typeof (await degradedClaudeSandbox.window.eypcPlatform.codex.readSnapshot) === 'function', 'claude module failure must leave the codex port intact')

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

const actionSandbox = {
  window: {},
  globalThis: {},
  require(name) {
    if (name === 'electron') return { ipcRenderer: { on() {} } }
    throw new Error(`unexpected action preload require: ${name}`)
  }
}
actionSandbox.globalThis = actionSandbox
vm.runInNewContext(actionPreloadSource, actionSandbox, { filename: 'action-preload.js' })
assert(typeof actionSandbox.window.eypcActionRunner?.onSnapshot === 'function', 'action preload must expose snapshot subscription')
assert(typeof actionSandbox.window.eypcActionRunner?.onLog === 'function', 'action preload must expose ordered log deltas')
assert(typeof actionSandbox.window.eypcActionRunner?.action === 'function', 'action preload must expose runtime actions')

console.log('uTools runtime validation passed')
