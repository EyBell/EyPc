import { describe, expect, it } from 'vitest'
import { performance } from 'node:perf_hooks'
import { createRequire } from 'node:module'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createInitialState } from '../../src/domain/state'
import type { ClaudeCodePhase } from '../../src/domain/claudeCode'
import type { EypcPlatformApi } from '../../src/platform/eypcPlatform'
import { createCodexController } from '../../src/runtime/codexController'

const require_ = createRequire(import.meta.url)
const bridgeModule = require_(resolve(process.cwd(), 'preload/claude/index.cjs'))
const appState = require_(resolve(process.cwd(), 'preload/claude/app-state.cjs'))

const LOCAL_ID = 'local_11111111-1111-4111-8111-111111111111'
const CLI_ID = '22222222-2222-4222-8222-222222222222'
const SOURCE_FINGERPRINT = 'b'.repeat(64)

function logTime(index: number): string {
  const value = new Date(2026, 7, 7, 10, 0, index)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = performance.now() + timeoutMs
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error('state publish timeout')
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5))
  }
}

describe('Claude real watcher to Controller publish', () => {
  it('publishes 100 real fs watcher transitions under 250ms P95 while quota is blocked', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-claude-watcher-e2e-'))
    const claudeHome = join(root, '.claude')
    const appData = join(root, 'Claude')
    const codeRoot = join(appData, 'claude-code-sessions')
    const codeDirectory = join(codeRoot, 'org', 'user')
    const logs = join(root, 'logs')
    const dataDirectory = join(root, 'eypc-data')
    mkdirSync(claudeHome, { recursive: true })
    mkdirSync(codeDirectory, { recursive: true })
    mkdirSync(logs, { recursive: true })
    mkdirSync(dataDirectory, { recursive: true })
    const historicalAt = new Date(2026, 7, 7, 9, 0, 0).getTime()
    writeFileSync(join(codeDirectory, `${LOCAL_ID}.json`), JSON.stringify({
      sessionId: LOCAL_ID,
      cliSessionId: CLI_ID,
      title: 'Watcher integration',
      cwd: '/work/project',
      originCwd: '/work/project',
      createdAt: historicalAt - 60_000,
      lastActivityAt: historicalAt,
      lastFocusedAt: historicalAt,
      model: 'claude-opus-5',
      isArchived: false,
      completedTurns: 1
    }))
    const logPath = join(logs, 'main.log')
    writeFileSync(logPath, '')
    const realBridge = bridgeModule.createClaudeBridge({
      fs,
      path,
      os: { homedir: () => root, tmpdir },
      platform: 'darwin',
      env: { PATH: '' },
      claudeHome,
      claudeAppDataRoot: appData,
      claudeCodeRoot: codeRoot,
      claudeLogDirectory: logs,
      claudeAppVersion: [...appState.SUPPORTED_APP_VERSIONS][0],
      dataDirectory
    })
    let hostStateWakeups = 0
    const disposeHostState = realBridge.watchCodeState(() => { hostStateWakeups += 1 })
    let releaseQuota!: (value: null) => void
    const blockedQuota = new Promise<null>((resolvePromise) => { releaseQuota = resolvePromise })
    const claude = { ...realBridge, readQuotaFallback: () => blockedQuota }
    const state = createInitialState(1)
    state.activeTab = 'codex'
    state.codex.settings.floatEnabled = true
    state.codex.settings.providers = { codex: true, claude: true }
    let notifications = 0
    const platform = {
      codex: {
        readSnapshot: async (input: Record<string, boolean>) => input.includeThreads
          ? {
              ok: true as const,
              receivedAt: Date.now(),
              value: {
                version: 2 as const,
                receivedAt: Date.now(),
                threads: [],
                projects: [{ key: 'chats', name: 'Chats', kind: 'chats' as const, nativePinned: false }],
                sourceFingerprint: SOURCE_FINGERPRINT,
                completeness: 'verified' as const
              }
            }
          : {
              ok: true as const,
              receivedAt: Date.now(),
              value: { version: 2 as const, receivedAt: Date.now(), quota: null }
            },
        openThread: async () => ({ outcome: 'opened' as const }),
        close: () => undefined
      },
      claude
    } as unknown as EypcPlatformApi
    const controller = createCodexController({
      platform,
      getAppState: () => state,
      save: () => undefined,
      notify: () => { notifications += 1 },
      setMessage: () => undefined
    })
    controller.start()
    await waitFor(() => controller.view().claudeCodeSessionCount === 1)
    const latencies: number[] = []
    for (let index = 1; index <= 100; index += 1) {
      const at = logTime(index)
      const kind = index % 3
      const requestId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`
      const expected: ClaudeCodePhase = kind === 1 ? 'running' : kind === 2 ? 'waiting-input' : 'completed'
      const message = kind === 1
        ? `Sending message to session ${LOCAL_ID}`
        : kind === 2
          ? `Emitted tool permission request ${requestId} for AskUserQuestion in session ${LOCAL_ID}`
          : `[Result] Turn succeeded for session ${LOCAL_ID}`
      const startedAt = performance.now()
      appendFileSync(logPath, `${at} [info] ${message}\n`)
      await waitFor(() => controller.view().taskState.conversations.all
        .find((task) => task.actionAlias === LOCAL_ID)?.claudePhase === expected)
      latencies.push(performance.now() - startedAt)
    }
    const ordered = [...latencies].sort((left, right) => left - right)
    const p95 = ordered[Math.ceil(ordered.length * 0.95) - 1]
    expect(p95).toBeLessThan(250)
    expect(notifications).toBeGreaterThanOrEqual(100)
    // Filesystem callbacks may coalesce, but this first subscriber must keep
    // receiving wakeups after the Controller attaches its own subscriber.
    expect(hostStateWakeups).toBeGreaterThan(0)
    releaseQuota(null)
    controller.dispose()
    disposeHostState()
    realBridge.close()
  }, 20_000)
})
