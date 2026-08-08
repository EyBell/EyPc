import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import * as crypto from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import * as fs from 'node:fs'
import * as https from 'node:https'
import * as path from 'node:path'

const root = resolve(import.meta.dirname, '..')
const quotaModulePath = resolve(root, 'dist', 'claude', 'quota.cjs')

function finish(result, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = exitCode
}

if (!existsSync(quotaModulePath)) {
  finish({ status: 'unavailable', reason: 'built-quota-module-missing' }, 2)
} else {
  const require_ = createRequire(import.meta.url)
  const quota = require_(quotaModulePath)
  const fallback = quota.createQuotaFallback({
    fs,
    path,
    https,
    crypto,
    execFileSync,
    os: { homedir },
    platform: process.platform
  })
  const now = Date.now()
  const result = await fallback.read({
    enabled: true,
    coldStart: false,
    supplement: true,
    now,
    primaryUpdatedAt: now,
    claudeHome: path.join(homedir(), '.claude')
  })
  const windows = result?.rateLimits && typeof result.rateLimits === 'object'
    ? Object.entries(result.rateLimits).map(([key, value]) => ({
        key,
        usedPercentage: Number(value?.used_percentage),
        resetAt: Number(value?.resets_at) || null,
        displayName: typeof value?.display_name === 'string' ? value.display_name : '',
        upstreamType: typeof value?.upstream_type === 'string' ? value.upstream_type : ''
      }))
    : []
  const accepted = windows.some((window) => window.key === 'five_hour')
    && windows.some((window) => window.key === 'seven_day')
    && windows.some((window) => /^(five_hour|seven_day)[_-].+/.test(window.key))
    && windows.every((window) => Number.isFinite(window.usedPercentage))
  finish({
    status: accepted ? 'ok' : 'unknown',
    transport: 'node-https',
    credentialAuthority: 'claude-app-encrypted-cache',
    windowCount: windows.length,
    scopedWindowCount: windows.filter((window) => /^(five_hour|seven_day)[_-].+/.test(window.key)).length,
    windows,
    failure: fallback.diagnostics().lastFailure,
    accepted
  }, accepted ? 0 : 1)
}
