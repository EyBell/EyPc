import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import * as pathModule from 'node:path'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { UTOOLS_PRELOAD_ASSETS, UTOOLS_PRELOAD_MODULE_ASSETS, UTOOLS_PRELOAD_MODULE_GROUPS } from './utools-preload-assets.mjs'
import { buildUtoolsRuntimeIdentity, RUNTIME_IDENTITY_REVISION } from './utools-runtime-identity.mjs'

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

for (const file of ['index.html', 'float.html', 'action.html', 'plugin.json', 'package.json', 'preload.js', 'float-preload.js', 'action-preload.js', 'runtime-identity.cjs', 'logo.svg']) {
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

for (const group of UTOOLS_PRELOAD_MODULE_GROUPS) {
  const expected = [...group.files].sort()
  for (const [label, directory] of [
    ['canonical', resolve(root, 'preload', group.directory)],
    ['public', resolve(root, 'public', group.directory)],
    ['dist', resolve(distDir, group.directory)]
  ]) {
    const actual = readdirSync(directory).filter((file) => file.endsWith('.cjs') || file.endsWith('.json')).sort()
    assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}/${group.directory} must contain exactly the managed module set`)
  }
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
const expectedRuntimeIdentity = buildUtoolsRuntimeIdentity(root)
const actualRuntimeIdentity = distRequire('./runtime-identity.cjs')
assert(actualRuntimeIdentity.revision === RUNTIME_IDENTITY_REVISION, 'runtime identity revision must be current')
for (const field of [
  'hostAssetId',
  'rendererAssetId',
  'kernelRevision',
  'registryRevision',
  'topologyRevision',
  'taskPackageRevision',
  'commandRevision',
  'subscribeRevision',
  'ackRevision',
  'artifactState'
]) {
  assert(actualRuntimeIdentity[field] === expectedRuntimeIdentity[field], `runtime identity ${field} must match this artifact`)
}
assert(actualRuntimeIdentity.artifactState === 'artifact-ready', 'build output may report artifact-ready only')
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
const cursorModule = distRequire('./cursor/index.cjs')
const companionKernelModule = distRequire('./companion/task-kernel.cjs')
const diagnosticsModule = distRequire('./diagnostics.cjs')
assert(typeof companionKernelModule.createCompanionTaskKernel === 'function', 'companion Kernel module must expose its factory')
assert(typeof diagnosticsModule.createRuntimeDiagnostics === 'function', 'runtime diagnostics module must expose its factory')
assert(typeof claudeModule.createClaudeBridge === 'function', 'claude preload module must expose createClaudeBridge')
const claudeModuleProbe = claudeModule.createClaudeBridge({
  fs: { readdirSync: () => [], statSync() { throw new Error('claude module must stay lazy during validation') }, readFileSync() { throw new Error('lazy') } },
  path: pathModule,
  os: { homedir: () => '/tmp' },
  dataDirectory: '/tmp/eypc-claude-validation'
})
for (const method of ['inspect', 'readSnapshot', 'readQuotaFallback', 'readCodeSnapshot', 'readCodeStateSnapshot', 'readPlanUsage', 'readCodeUnread', 'readAppPresence', 'watchCodeSessions', 'watchCodeState', 'watchCodeUnread', 'watchEvents', 'install', 'uninstall', 'openTask', 'archiveCodeSession', 'close']) {
  assert(typeof claudeModuleProbe[method] === 'function', `claude preload module must expose stable ${method}`)
}
assert(claudeModuleProbe.readSnapshot().sessions.length === 0, 'claude module must degrade to an empty inventory without a readable home')
assert(claudeModuleProbe.readCodeSnapshot().sessions.length === 0, 'claude Code reader must degrade to an empty inventory without a readable root')
const emptyClaudeStateDelta = claudeModuleProbe.readCodeStateSnapshot()
assert(Array.isArray(emptyClaudeStateDelta.sessions) && Number.isInteger(emptyClaudeStateDelta.generation), 'claude state V2 delta must expose sessions and generation')
assert(emptyClaudeStateDelta.freshness && Number.isFinite(emptyClaudeStateDelta.freshness.readAt), 'claude state V2 delta must expose freshness')
assert(claudeModuleProbe.readPlanUsage() === null, 'claude plan-usage reader must degrade to null without a readable history file')
// `null` and `{ids: []}` are different claims: the second one would be spent as
// "the user has read everything", so an unreadable store must never produce it.
assert(await claudeModuleProbe.readCodeUnread() === null, 'claude unread reader must degrade to null, never to an empty set')
assert(typeof cursorModule.createCursorBridge === 'function', 'cursor preload module must expose createCursorBridge')
const cursorModuleProbe = cursorModule.createCursorBridge({
  fs: { existsSync: () => false },
  path: pathModule,
  os: { homedir: () => '/tmp' },
  platform: 'darwin',
  env: {},
  dataDirectory: '/tmp/eypc-cursor-validation'
})
for (const method of ['inspect', 'readInventory', 'readHookState', 'watchEvents', 'install', 'uninstall', 'openTask', 'diagnostics', 'close']) {
  assert(typeof cursorModuleProbe[method] === 'function', `cursor preload module must expose stable ${method}`)
}
assert(cursorModuleProbe.readInventory().sessions.length === 0, 'cursor inventory must degrade to empty without a state database')
const cursorOpen = await cursorModuleProbe.openTask('00000000-0000-0000-0000-000000000000')
assert(cursorOpen.outcome === 'unavailable' && cursorOpen.confirmsRead === false, 'cursor open must stay unavailable while jump is live-failed')
const claudeCodeSource = preloadModuleSources.get('claude/code-sessions.cjs') || ''
for (const marker of [
  'archiveSessionMetadata',
  'atomicReplace',
  "openSync(tempPath, 'wx'",
  'fsyncSync',
  'renameSync',
  'semanticWithoutArchive',
  "delete clone.isArchived",
  "{ ...original.parsed, isArchived: true }",
  'rollback-unconfirmed',
  'CODE_RECOVERY_POLL_MS'
]) {
  assert(claudeCodeSource.includes(marker), `claude controlled metadata transaction is missing: ${marker}`)
}
const claudeArchiveTransaction = claudeCodeSource.slice(
  claudeCodeSource.indexOf('function archiveSessionMetadata'),
  claudeCodeSource.indexOf('function stopWatching')
)
for (const forbidden of ['readdirSync', 'scanUserDirectories', 'leveldown', 'LevelDB', 'mkdirSync', 'rmSync', 'rmdirSync', 'copyFileSync', 'createWriteStream']) {
  assert(!claudeArchiveTransaction.includes(forbidden), `claude archive transaction must stay target-only (found ${forbidden})`)
}
const claudeUnreadSource = preloadModuleSources.get('claude/unread.cjs') || ''
for (const marker of ['mkdtempSync', 'chmodSync', 'cpSync', 'rmSync', "app.asar', 'node_modules', 'leveldown", 'createIfMissing: false']) {
  assert(claudeUnreadSource.includes(marker), `claude unread snapshot gate is missing: ${marker}`)
}
assert(!claudeUnreadSource.includes("require('leveldown')"), 'claude unread must not package a differently signed native addon')
assert(claudeUnreadSource.includes('keyText === UNREAD_LEVELDB_KEY'), 'claude unread must match the exact origin-scoped LevelDB key')
const claudeAppStateSource = preloadModuleSources.get('claude/app-state.cjs') || ''
for (const marker of ['SUPPORTED_APP_VERSIONS', 'parseAppStateLine', 'parseAppArchiveLine', 'LocalSessions\\.archive', 'permission-response', 'LOG_RECOVERY_POLL_MS']) {
  assert(claudeAppStateSource.includes(marker), `claude App state compatibility gate is missing: ${marker}`)
}
const claudeArchiveSource = preloadModuleSources.get('claude/archive.cjs') || ''
for (const marker of [
  'SUPPORTED_APP_VERSION',
  'readSessionState',
  'readCurrentSessionPhase',
  "['completed', 'stopped'].includes(current.phase)",
  'archiveSessionMetadata',
  'hasActiveSession',
  'EyPc 已归档并移除',
  'Claude 原生侧栏同步未确认',
  '当前不受支持'
]) {
  assert(claudeArchiveSource.includes(marker), `claude metadata archive gate is missing: ${marker}`)
}
for (const forbidden of ['AXPress', 'osascript', 'performClaudeArchiveAction', 'desktopEpitaxyUrl', 'LocalSessions.archive', 'execFile']) {
  assert(!claudeArchiveSource.includes(forbidden), `claude metadata archive adapter must not open or automate the App (found ${forbidden})`)
}
const companionTaskActionsSource = preloadModuleSources.get('companion/task-actions.cjs') || ''
for (const marker of ['companion-task-actions-v3', 'archiveInFlight', 'executeInFlight', 'executePlan', 'lastSyncFingerprint', 'shortcutArchive', 'CONFIRM_WINDOW_MS']) {
  assert(companionTaskActionsSource.includes(marker), `companion task dispatcher contract is missing: ${marker}`)
}
const companionTaskKernelSource = preloadModuleSources.get('companion/task-kernel.cjs') || ''
const companionProviderRegistrySource = preloadModuleSources.get('companion/provider-registry.cjs') || ''
const companionGeneratedContractSource = preloadModuleSources.get('companion/contracts-v7.cjs') || ''
const companionTaskContractSource = `${companionGeneratedContractSource}\n${companionProviderRegistrySource}\n${companionTaskKernelSource}`
for (const marker of [
  'companion-task-kernel-v7',
  'companion-task-snapshot-v7',
  'companion-provider-evidence-batch-v3',
  'companion-interaction-evidence-v1',
  'companion-task-command-v1',
  'companion-task-subscribe-v1',
  'companion-task-ack-v2',
  'sourceLaneGenerations',
  'preflightInFlight',
  'UNKNOWN_GRACE_MS',
  'planReady',
  'pausedKeys',
  'reduceActivityCandidatesV7',
  'nextVisibilityTransitionAt',
  'getLatest: () => currentPackage',
  'subscribe(afterRevision',
  'dispatchCommand',
  'acknowledge',
  'handleEnter'
]) {
  assert(companionTaskContractSource.includes(marker), `companion task kernel contract is missing: ${marker}`)
}
for (const marker of [
  'EXECUTE_PLAN_PROMPT_V1',
  "requestCodexRpc('collaborationMode/list'",
  "requestCodexRpc('thread/resume'",
  "requestCodexRpc('turn/start'",
  'task-package-ack',
  "stage === 'applied'",
  'requestCodexFloatRecreate'
]) {
  assert(canonicalMainPreload.includes(marker), `RAW-160 main preload contract is missing: ${marker}`)
}
const claudeAppState = claudeAppStateSource
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')
for (const forbidden of ['writeFileSync', 'appendFileSync', 'renameSync', 'unlinkSync', 'rmSync', 'mkdirSync', 'createWriteStream']) {
  assert(!new RegExp(`\\b${forbidden}\\s*\\(`).test(claudeAppState), `claude App state log reader must stay read-only (found ${forbidden})`)
}
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
for (const marker of ['createNodeHttpsFetch', 'FAILURE_RETRY_DELAYS_MS', 'FAILURE_COOLDOWN_MS', 'nextAllowedAt']) {
  assert(claudeQuotaSource.includes(marker), `claude automatic quota supplement gate is missing: ${marker}`)
}
assert(!claudeQuotaSource.includes('writeFileSync'), 'claude quota fallback must never persist a credential')

const indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf8')
assert(!/\b(?:src|href)="\/assets\//.test(indexHtml), 'dist index.html must use relative asset paths for uTools packages')
const floatHtml = readFileSync(resolve(distDir, 'float.html'), 'utf8')
assert(!/\b(?:src|href)="\/assets\//.test(floatHtml), 'dist float.html must use relative asset paths for uTools packages')
const actionHtml = readFileSync(resolve(distDir, 'action.html'), 'utf8')
assert(!/\b(?:src|href)="\/assets\//.test(actionHtml), 'dist action.html must use relative asset paths for uTools packages')
const rendererJavaScript = readdirSync(resolve(distDir, 'assets'))
  .filter((file) => file.endsWith('.js'))
  .map((file) => readFileSync(resolve(distDir, 'assets', file), 'utf8'))
  .join('\n')
assert(rendererJavaScript.includes(actualRuntimeIdentity.hostAssetId), 'Renderer bundles must embed the expected Host asset id')
assert(rendererJavaScript.includes(actualRuntimeIdentity.rendererAssetId), 'Renderer bundles must embed their Renderer asset id')
assert(rendererJavaScript.includes(actualRuntimeIdentity.kernelRevision), 'Renderer bundles must embed the Kernel revision')
assert(rendererJavaScript.includes(actualRuntimeIdentity.registryRevision), 'Renderer bundles must embed the Provider Registry revision')
assert(rendererJavaScript.includes(actualRuntimeIdentity.topologyRevision), 'Renderer bundles must embed the topology revision')
assert(rendererJavaScript.includes(actualRuntimeIdentity.taskPackageRevision), 'Renderer bundles must embed the task protocol revision')
assert(rendererJavaScript.includes(actualRuntimeIdentity.commandRevision), 'Renderer bundles must embed the command revision')
assert(rendererJavaScript.includes(actualRuntimeIdentity.subscribeRevision), 'Renderer bundles must embed the subscribe revision')
assert(rendererJavaScript.includes(actualRuntimeIdentity.ackRevision), 'Renderer bundles must embed the ACK revision')

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
const companionQuickFeature = pluginJson.features.find((feature) => feature.code === 'eypc-companion-quick')
assert(companionQuickFeature?.mainHide === true, 'Companion quick task view feature must run with mainHide=true')
assert(companionQuickFeature?.cmds?.includes('快速任务查看'), 'Companion quick task view must expose the stable global-hotkey command label')
const actionRunnerFeature = pluginJson.features.find((feature) => feature.code === 'eypc-codex-action-runner')
assert(actionRunnerFeature?.mainHide === true, 'Action Runner feature must run with mainHide=true')
assert(actionRunnerFeature?.cmds?.includes('打开 Action 执行工作台'), 'Action Runner must expose the stable global-hotkey command label')

const preloadSource = preloadSources.main
const floatPreloadSource = preloadSources.float
const actionPreloadSource = preloadSources.action
const ipcListeners = new Map()
const inertSetTimer = () => 1
const inertClearTimer = () => undefined
const sandbox = {
  window: {},
  globalThis: {},
  process: { platform: 'darwin', env: {}, cwd: () => '/tmp' },
  setTimeout: inertSetTimer,
  clearTimeout: inertClearTimer,
  setInterval: inertSetTimer,
  clearInterval: inertClearTimer,
  require(name) {
    if (name === './windows/index.cjs') return windowModule
    if (name === './claude/index.cjs') return claudeModule
    if (name === './cursor/index.cjs') return cursorModule
    if (name === './companion/task-kernel.cjs' || String(name).endsWith('/companion/task-kernel.cjs')) return companionKernelModule
    if (name === './runtime-identity.cjs') return actualRuntimeIdentity
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
const publicCompanionKernel = sandbox.window.eypcPlatform.companionKernel
assert(publicCompanionKernel?.revision === actualRuntimeIdentity.kernelRevision, 'preload companion Kernel revision must match the artifact')
assert(publicCompanionKernel?.registryRevision === actualRuntimeIdentity.registryRevision, 'preload companion Registry revision must match the artifact')
assert(publicCompanionKernel?.topologyRevision === actualRuntimeIdentity.topologyRevision, 'preload companion Topology revision must match the artifact')
assert(publicCompanionKernel?.packageRevision === actualRuntimeIdentity.taskPackageRevision, 'preload companion Snapshot revision must match the artifact')
assert(publicCompanionKernel?.commandRevision === actualRuntimeIdentity.commandRevision, 'preload companion Command revision must match the artifact')
assert(publicCompanionKernel?.subscribeRevision === actualRuntimeIdentity.subscribeRevision, 'preload companion Subscribe revision must match the artifact')
assert(publicCompanionKernel?.ackRevision === actualRuntimeIdentity.ackRevision, 'preload companion ACK revision must match the artifact')
assert(typeof publicCompanionKernel?.dispatchCommand === 'function', 'preload must expose companion dispatchCommand')
assert(typeof publicCompanionKernel?.subscribe === 'function', 'preload must expose companion subscribe')
assert(typeof publicCompanionKernel?.acknowledge === 'function', 'preload must expose companion acknowledge')
assert(typeof publicCompanionKernel?.dispatch === 'undefined', 'preload must not expose the retired legacy companion dispatch route')
const mainBeforeHandshakeKernel = await publicCompanionKernel.dispatchCommand({})
assert(mainBeforeHandshakeKernel.errorCode === 'reload-required', 'new Main Preload must keep unmounted Renderer V6 commands inert before identity handshake')
const mainBeforeHandshakeOpen = await sandbox.window.eypcPlatform.codex.openThread('legacy-alias')
assert(mainBeforeHandshakeOpen.errorCode === 'reload-required', 'new Main Preload must keep legacy Main task ports inert before identity handshake')
const mainIdentityHandshake = sandbox.window.eypcPlatform.runtimeIdentity.handshake({
  hostAssetId: actualRuntimeIdentity.hostAssetId,
  rendererAssetId: actualRuntimeIdentity.rendererAssetId,
  kernelRevision: actualRuntimeIdentity.kernelRevision,
  registryRevision: actualRuntimeIdentity.registryRevision,
  topologyRevision: actualRuntimeIdentity.topologyRevision,
  taskPackageRevision: actualRuntimeIdentity.taskPackageRevision,
  commandRevision: actualRuntimeIdentity.commandRevision,
  subscribeRevision: actualRuntimeIdentity.subscribeRevision,
  ackRevision: actualRuntimeIdentity.ackRevision
})
assert(mainIdentityHandshake.status === 'host-loaded', 'Main/Preload exact identity handshake must prove host-loaded')
assert(typeof sandbox.window.eypcPlatform.claude.inspect === 'function', 'preload must expose claude.inspect')
assert(typeof sandbox.window.eypcPlatform.claude.readSnapshot === 'function', 'preload must expose claude.readSnapshot')
// The Controller feature-detects this one. Asserting it on the module alone
// is not enough: the facade omitted it, so the opt-in quota fallback was a
// dead switch in every packaged build while the module test stayed green.
assert(typeof sandbox.window.eypcPlatform.claude.readQuotaFallback === 'function', 'preload must expose claude.readQuotaFallback')
assert(typeof sandbox.window.eypcPlatform.cursor.readInventory === 'function', 'preload must expose cursor.readInventory')
assert(typeof sandbox.window.eypcPlatform.cursor.openTask === 'function', 'preload must expose cursor.openTask')
assert(typeof sandbox.window.eypcPlatform.cursor.install === 'function', 'preload must expose cursor.install')
assert(typeof sandbox.window.eypcPlatform.cursor.uninstall === 'function', 'preload must expose cursor.uninstall')
assert(typeof sandbox.window.eypcPlatform.cursor.watchEvents === 'function', 'preload must expose cursor.watchEvents')
assert(typeof sandbox.window.eypcPlatform.cursor.readHookState === 'function', 'preload must expose cursor.readHookState')
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
assert(typeof sandbox.window.eypcPlatform.claude.readCodeSnapshot === 'function', 'preload must expose claude.readCodeSnapshot')
assert(Array.isArray((await sandbox.window.eypcPlatform.claude.readCodeSnapshot({})).sessions), 'claude.readCodeSnapshot must always return a sessions array')
assert(typeof sandbox.window.eypcPlatform.claude.readCodeStateSnapshot === 'function', 'preload must expose claude.readCodeStateSnapshot')
assert(Number.isInteger((await sandbox.window.eypcPlatform.claude.readCodeStateSnapshot({})).generation), 'claude.readCodeStateSnapshot must expose V2 generation')
assert(typeof sandbox.window.eypcPlatform.claude.readPlanUsage === 'function', 'preload must expose claude.readPlanUsage')
assert(sandbox.window.eypcPlatform.claude.readPlanUsage() === null, 'claude.readPlanUsage must degrade to null without a readable history file')
assert(typeof sandbox.window.eypcPlatform.claude.watchCodeSessions === 'function', 'preload must expose claude.watchCodeSessions')
assert(typeof sandbox.window.eypcPlatform.claude.watchCodeState === 'function', 'preload must expose claude.watchCodeState')
assert(typeof sandbox.window.eypcPlatform.claude.watchCodeUnread === 'function', 'preload must expose claude.watchCodeUnread')
assert(typeof sandbox.window.eypcPlatform.claude.watchEvents === 'function', 'preload must expose claude.watchEvents')
assert(typeof sandbox.window.eypcPlatform.claude.watchEvents(() => {}) === 'function', 'claude.watchEvents must always return a disposer')
assert(typeof sandbox.window.eypcPlatform.claude.install === 'function', 'preload must expose claude.install')
assert(typeof sandbox.window.eypcPlatform.claude.uninstall === 'function', 'preload must expose claude.uninstall')
assert(typeof sandbox.window.eypcPlatform.claude.openTask === 'function', 'preload must expose claude.openTask')
assert(typeof sandbox.window.eypcPlatform.claude.readAppPresence === 'function', 'preload must expose claude.readAppPresence')
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
  setTimeout: inertSetTimer,
  clearTimeout: inertClearTimer,
  setInterval: inertSetTimer,
  clearInterval: inertClearTimer,
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
  setTimeout: inertSetTimer,
  clearTimeout: inertClearTimer,
  setInterval: inertSetTimer,
  clearInterval: inertClearTimer,
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
  setTimeout: inertSetTimer,
  clearTimeout: inertClearTimer,
  setInterval: inertSetTimer,
  clearInterval: inertClearTimer,
  require(name) {
    if (name === 'electron') return { ipcRenderer: { on() {} } }
    if (name === './runtime-identity.cjs') return actualRuntimeIdentity
    throw new Error(`unexpected float require: ${name}`)
  }
}
floatSandbox.globalThis = floatSandbox
vm.runInNewContext(floatPreloadSource, floatSandbox, { filename: 'float-preload.js' })
assert(typeof floatSandbox.window.eypcFloat?.onSnapshot === 'function', 'float preload must expose snapshot subscription')
assert(typeof floatSandbox.window.eypcFloat?.action === 'function', 'float preload must expose actions')
assert(floatSandbox.window.eypcFloat.action('codex.task.open', {}) === false, 'Float task actions must fail closed before identity handshake')
const floatIdentityHandshake = floatSandbox.window.eypcFloat.runtimeIdentity.handshake({
  hostAssetId: actualRuntimeIdentity.hostAssetId,
  rendererAssetId: actualRuntimeIdentity.rendererAssetId,
  kernelRevision: actualRuntimeIdentity.kernelRevision,
  registryRevision: actualRuntimeIdentity.registryRevision,
  topologyRevision: actualRuntimeIdentity.topologyRevision,
  taskPackageRevision: actualRuntimeIdentity.taskPackageRevision,
  commandRevision: actualRuntimeIdentity.commandRevision,
  subscribeRevision: actualRuntimeIdentity.subscribeRevision,
  ackRevision: actualRuntimeIdentity.ackRevision
})
assert(floatIdentityHandshake.status === 'host-loaded', 'Float UI/Preload exact identity handshake must prove host-loaded')
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
