import { describe, expect, it } from 'vitest'
import { performance } from 'node:perf_hooks'
import { createRequire } from 'node:module'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ClaudeCodePhase } from '../../src/domain/claudeCode'

const require_ = createRequire(import.meta.url)
const bridgeModule = require_(resolve(process.cwd(), 'preload/claude/index.cjs'))
const appState = require_(resolve(process.cwd(), 'preload/claude/app-state.cjs'))

const LOCAL_ID = 'local_11111111-1111-4111-8111-111111111111'
const CLI_ID = '22222222-2222-4222-8222-222222222222'

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

describe('Claude real watcher to Host evidence', () => {
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
      claudeAppVersion: '9.9.9',
      dataDirectory
    })
    let releaseQuota!: (value: null) => void
    const blockedQuota = new Promise<null>((resolvePromise) => { releaseQuota = resolvePromise })
    const claude = { ...realBridge, readQuotaFallback: () => blockedQuota }
    void claude.readQuotaFallback()
    claude.readCodeSnapshot({ now: Date.now() })
    let latestState = claude.readCodeStateSnapshot({ now: Date.now() })
    let hostStateWakeups = 0
    const disposeHostState = claude.watchCodeState(() => {
      hostStateWakeups += 1
      latestState = claude.readCodeStateSnapshot({ now: Date.now() })
    })
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
      await waitFor(() => latestState.sessions
        .find((session: { sessionId: string; phase: ClaudeCodePhase }) => session.sessionId === LOCAL_ID)?.phase === expected)
      latencies.push(performance.now() - startedAt)
    }
    const ordered = [...latencies].sort((left, right) => left - right)
    const p95 = ordered[Math.ceil(ordered.length * 0.95) - 1]
    expect(p95).toBeLessThan(250)
    expect(hostStateWakeups).toBeGreaterThanOrEqual(100)
    releaseQuota(null)
    disposeHostState()
    realBridge.close()
  }, 20_000)
})
