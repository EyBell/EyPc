import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const require_ = createRequire(import.meta.url)
const { statuslineScript, parseQuotaCache } = require_(resolve(process.cwd(), 'preload/claude/scripts.cjs'))

/**
 * These run the generated script through a real `/bin/sh`.
 *
 * The extraction is shell + awk, so a unit test against JavaScript would prove
 * nothing about it; the bug this file exists to prevent was invisible to every
 * other layer and only showed up when the script actually ran.
 */
let directory = ''
let quotaPath = ''
let scriptPath = ''

/** A payload shaped like the documented status line stdin. */
function payload(rateLimits: string): string {
  return `{"session_id":"s1","cwd":"/w","rate_limits":${rateLimits},`
    + '"model":{"id":"claude-opus-5","display_name":"Opus 5"},"version":"2.1.220"}'
}

const GOOD = '{"five_hour":{"used_percentage":34,"resets_at":1746540000},'
  + '"seven_day":{"used_percentage":12,"resets_at":1746799200}}'

function run(input: string): void {
  execFileSync('/bin/sh', [scriptPath], { input })
}

beforeEach(() => {
  // uTools data directories contain a space on macOS; the fixture must too.
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eypc statusline '))
  quotaPath = path.join(directory, 'quota.json')
  scriptPath = path.join(directory, 'statusline.sh')
  fs.writeFileSync(scriptPath, statuslineScript({ quotaPath }))
  fs.chmodSync(scriptPath, 0o755)
})

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

describe('claude statusline quota bridge', () => {
  it('caches both windows from a documented payload', () => {
    run(payload(GOOD))
    const parsed = parseQuotaCache(fs.readFileSync(quotaPath, 'utf8'))
    expect(parsed.rateLimits).toEqual({
      five_hour: { used_percentage: 34, resets_at: 1746540000 },
      seven_day: { used_percentage: 12, resets_at: 1746799200 }
    })
    expect(parsed.updatedAt).toBeGreaterThan(0)
  })

  it('leaves a good reading alone when rate_limits is null', () => {
    // Claude Code documents that rate limits are absent until the first API
    // response of a session, so this is the ordinary state after every /clear —
    // not an edge case. The extraction used to search for the next brace
    // anywhere in the payload, capture the "model" object and write *that* over
    // the cached reading, so the quota display went blank on a regular cycle.
    run(payload(GOOD))
    const good = fs.readFileSync(quotaPath, 'utf8')
    run(payload('null'))
    expect(fs.readFileSync(quotaPath, 'utf8')).toBe(good)
  })

  it('leaves a good reading alone when the key is absent entirely', () => {
    run(payload(GOOD))
    const good = fs.readFileSync(quotaPath, 'utf8')
    execFileSync('/bin/sh', [scriptPath], {
      input: '{"session_id":"s1","model":{"id":"claude-opus-5"}}'
    })
    expect(fs.readFileSync(quotaPath, 'utf8')).toBe(good)
  })

  it('tolerates whitespace around the key and still captures both windows', () => {
    run(`{"rate_limits" :  ${GOOD},"model":{"id":"opus"}}`)
    expect(parseQuotaCache(fs.readFileSync(quotaPath, 'utf8')).rateLimits).toMatchObject({
      five_hour: { used_percentage: 34 }
    })
  })

  it('writes nothing at all when stdin is empty', () => {
    run('')
    expect(fs.existsSync(quotaPath)).toBe(false)
  })
})
