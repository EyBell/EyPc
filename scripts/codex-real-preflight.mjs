import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import vm from 'node:vm'

const requireFromScript = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const preload = readFileSync(resolve(root, 'preload/index.js'), 'utf8')
const requestedDays = Number(process.argv[2] || 30)
const timeWindowDays = Number.isFinite(requestedDays)
  ? Math.max(1, Math.min(365, Math.round(requestedDays)))
  : 30

const sandbox = {
  window: {},
  globalThis: {},
  process,
  Buffer,
  URL,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  queueMicrotask,
  structuredClone,
  require(name) {
    if (name === 'electron') return { ipcRenderer: { on() {} } }
    return requireFromScript(name)
  }
}
sandbox.globalThis = sandbox
vm.runInNewContext(preload, sandbox, { filename: 'preload/index.js' })

const typescript = requireFromScript('typescript')
const domainModuleCache = new Map()

function loadDomainModule(filename) {
  const resolvedFilename = extname(filename) ? filename : `${filename}.ts`
  const cached = domainModuleCache.get(resolvedFilename)
  if (cached) return cached.exports

  const source = readFileSync(resolvedFilename, 'utf8')
  const domainModule = { exports: {} }
  domainModuleCache.set(resolvedFilename, domainModule)
  const script = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022
    },
    fileName: resolvedFilename
  }).outputText
  const requireFromDomain = createRequire(resolvedFilename)
  const localRequire = (specifier) => specifier.startsWith('.')
    ? loadDomainModule(resolve(dirname(resolvedFilename), specifier))
    : requireFromDomain(specifier)
  vm.runInNewContext(script, {
    module: domainModule,
    exports: domainModule.exports,
    require: localRequire,
    process,
    console,
    setTimeout,
    clearTimeout,
    structuredClone
  }, { filename: resolvedFilename })
  return domainModule.exports
}

const { CODEX_TASK_STATE_REVISION, projectConversations } = loadDomainModule(resolve(root, 'src/domain/codex.ts'))

const bridge = sandbox.window.eypcPlatform?.codex
if (!bridge?.readSnapshot) throw new Error('Codex preload bridge is unavailable')

async function readSettledActivity(expectedTerminalKeys) {
  if (typeof bridge.readActivitySnapshot !== 'function') return null
  const deadline = Date.now() + 2_500
  let latest = null
  do {
    latest = await bridge.readActivitySnapshot()
    const entries = latest?.ok && Array.isArray(latest.value?.entries) ? latest.value.entries : []
    const byKey = new Map(entries.map((entry) => [entry.key, entry]))
    const terminalAuthorityReady = expectedTerminalKeys.every((key) => {
      const entry = byKey.get(key)
      return entry?.statusAuthority === 'desktop-live'
        || entry?.statusAuthority === 'app-server-live'
        || entry?.statusAuthority === 'persisted-decision'
          && entry?.status === 'active'
          && entry?.activeFlags?.includes('waitingOnUserInput')
    })
    if (latest?.ok
      && latest.value?.desktopBridgeState !== 'connecting'
      && latest.value?.desktopBridgeState !== 'not-checked'
      && (latest.value?.desktopBridgeState !== 'connected' || terminalAuthorityReady)) return latest
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  } while (Date.now() < deadline)
  return latest
}

try {
  const result = await bridge.readSnapshot({ includeQuota: true, includeConfig: false, includeThreads: true })
  if (!result.ok) {
    console.log(JSON.stringify({
      ok: false,
      errorCode: result.error?.code || 'unknown',
      message: result.error?.message || 'Codex preflight failed'
    }, null, 2))
    process.exitCode = 1
  } else {
    const snapshot = result.value
    const boundary = Date.now() - timeWindowDays * 24 * 60 * 60 * 1000
    const expectedTerminalKeys = (snapshot.threads || [])
      .filter((thread) => thread.lastTurnStartedAt >= boundary && ['failed', 'interrupted'].includes(thread.lastTurnStatus))
      .map((thread) => thread.key)
    const activityResult = await readSettledActivity(expectedTerminalKeys)
    const activity = activityResult?.ok ? activityResult.value : null
    const activityByKey = new Map((activity?.entries || []).map((entry) => [entry.key, entry]))
    const mergedThreads = (snapshot.threads || [])
      .map((thread) => ({ ...thread, ...(activityByKey.get(thread.key) || {}) }))
    const inWindow = mergedThreads
      .filter((thread) => Number.isFinite(thread.lastTurnStartedAt) && thread.lastTurnStartedAt >= boundary)
      .sort((left, right) => right.lastTurnStartedAt - left.lastTurnStartedAt || left.key.localeCompare(right.key))
    const authoritativeActive = (thread) => thread.status === 'active'
      && (thread.statusAuthority === 'desktop-live'
        || thread.statusAuthority === 'app-server-live'
        || thread.statusAuthority === 'persisted-decision')
    const completed = inWindow.filter((thread) => !authoritativeActive(thread) && thread.lastTurnStatus === 'completed')
    const stopped = inWindow.filter((thread) => !authoritativeActive(thread)
      && ['failed', 'interrupted'].includes(thread.lastTurnStatus)
      && (thread.statusAuthority === 'desktop-live' && thread.status === 'idle' || activity?.desktopBridgeState === 'not-running'))
    const ongoing = inWindow.filter((thread) => !completed.includes(thread) && !stopped.includes(thread))
    const active = ongoing.filter(authoritativeActive)
    const unconfirmedOngoing = ongoing.filter((thread) => !authoritativeActive(thread))
    const connectorWaitingInput = inWindow.filter((thread) => thread.status === 'active'
      && thread.statusAuthority === 'connector'
      && thread.activeFlags?.includes('waitingOnUserInput'))
    const persistedWaitingInput = inWindow.filter((thread) => thread.status === 'active'
      && thread.statusAuthority === 'persisted-decision'
      && thread.activeFlags?.includes('waitingOnUserInput'))
    const liveWaitingInput = inWindow.filter((thread) => thread.status === 'active'
      && (thread.statusAuthority === 'desktop-live' || thread.statusAuthority === 'app-server-live')
      && thread.activeFlags?.includes('waitingOnUserInput'))
    const productProjection = projectConversations({
      threads: mergedThreads,
      projects: snapshot.projects || [],
      receipts: [],
      lastTaskScanAt: snapshot.receivedAt || Date.now(),
      now: Date.now(),
      timeWindowDays,
      sourceFingerprint: snapshot.sourceFingerprint,
      completeness: snapshot.completeness,
      rawSourceCount: snapshot.rawSourceCount,
      eligibleSourceCount: snapshot.eligibleSourceCount,
      excludedSourceCount: snapshot.excludedSourceCount,
      nonConversationCount: snapshot.nonConversationCount,
      desktopBridgeState: activity?.desktopBridgeState
    }).snapshot
    const productWaitingKeys = new Set(productProjection.inputRequired.map((thread) => thread.key))
    const provenWaitingReachesProduct = [...persistedWaitingInput, ...liveWaitingInput]
      .every((thread) => productWaitingKeys.has(thread.key))
    const plainConnectorWaitingStaysOut = connectorWaitingInput
      .filter((thread) => thread.planImplementationOnly !== true)
      .every((thread) => !productWaitingKeys.has(thread.key))
    const orderIsStrict = inWindow.every((thread, index) => index === 0 || inWindow[index - 1].lastTurnStartedAt >= thread.lastTurnStartedAt)
    const quotaWindows = [
      snapshot.quota?.short ? { name: '5 小时限额', remainingPercent: snapshot.quota.short.remainingPercent } : null,
      snapshot.quota?.weekly ? { name: '周限额', remainingPercent: snapshot.quota.weekly.remainingPercent } : null
    ].filter(Boolean)

    const ok = snapshot.version === 2
        && snapshot.completeness === 'verified'
        && orderIsStrict
        && bridge.taskStateRevision === CODEX_TASK_STATE_REVISION
        && provenWaitingReachesProduct
        && plainConnectorWaitingStaysOut
    console.log(JSON.stringify({
      ok,
      hostVersion: snapshot.version,
      taskStateRevision: bridge.taskStateRevision || 'unavailable',
      completeness: snapshot.completeness || 'unknown',
      desktopBridgeState: activity?.desktopBridgeState || 'unavailable',
      counts: {
        rawUnarchived: snapshot.rawSourceCount,
        registered: snapshot.eligibleSourceCount,
        removedOrUnregistered: snapshot.excludedSourceCount,
        zeroTurn: snapshot.nonConversationCount,
        inWindow: inWindow.length,
        completed: completed.length,
        stopped: stopped.length,
        ongoing: ongoing.length,
        active: active.length,
        unconfirmedOngoing: unconfirmedOngoing.length,
        connectorWaitingInput: connectorWaitingInput.length,
        persistedWaitingInput: persistedWaitingInput.length,
        liveWaitingInput: liveWaitingInput.length,
        productWaitingInput: productProjection.inputRequired.length,
        productActive: productProjection.ongoing.filter((task) => task.activityState === 'active' || task.activityState === 'waiting-approval').length
      },
      timeWindowDays,
      projectOrder: (snapshot.projects || []).map((project) => ({
        name: project.name,
        kind: project.kind,
        nativePinned: project.nativePinned,
        ...(Number.isFinite(project.nativePinnedOrder) ? { nativePinnedOrder: project.nativePinnedOrder } : {}),
        ...(Number.isFinite(project.nativeOrder) ? { nativeOrder: project.nativeOrder } : {})
      })),
      quotaWindows
    }, null, 2))
    if (!ok) process.exitCode = 1
  }
} finally {
  bridge.close?.()
}
