import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

const bridge = sandbox.window.eypcPlatform?.codex
if (!bridge?.readSnapshot) throw new Error('Codex preload bridge is unavailable')

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
    const inWindow = (snapshot.threads || [])
      .filter((thread) => Number.isFinite(thread.lastTurnStartedAt) && thread.lastTurnStartedAt >= boundary)
      .sort((left, right) => right.lastTurnStartedAt - left.lastTurnStartedAt || left.key.localeCompare(right.key))
    const completed = inWindow.filter((thread) => thread.status !== 'active' && thread.lastTurnStatus === 'completed')
    const ongoing = inWindow.filter((thread) => !completed.includes(thread))
    const orderIsStrict = inWindow.every((thread, index) => index === 0 || inWindow[index - 1].lastTurnStartedAt >= thread.lastTurnStartedAt)
    const quotaWindows = [
      snapshot.quota?.short ? { name: '5 小时限额', remainingPercent: snapshot.quota.short.remainingPercent } : null,
      snapshot.quota?.weekly ? { name: '周限额', remainingPercent: snapshot.quota.weekly.remainingPercent } : null
    ].filter(Boolean)

    console.log(JSON.stringify({
      ok: snapshot.version === 2 && snapshot.completeness === 'verified' && orderIsStrict,
      hostVersion: snapshot.version,
      completeness: snapshot.completeness || 'unknown',
      counts: {
        rawUnarchived: snapshot.rawSourceCount,
        registered: snapshot.eligibleSourceCount,
        removedOrUnregistered: snapshot.excludedSourceCount,
        zeroTurn: snapshot.nonConversationCount,
        inWindow: inWindow.length,
        completed: completed.length,
        ongoing: ongoing.length
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
  }
} finally {
  bridge.close?.()
}
