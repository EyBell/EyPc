import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []

function probe(directory: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [
    resolve(process.cwd(), 'scripts/probe-eypc-diagnostics-runtime.mjs'),
    `--dir=${directory}`,
    ...args
  ], { encoding: 'utf8' })
  return { status: result.status, value: JSON.parse(result.stdout) as Record<string, any> }
}

describe('runtime diagnostics read-only probe', () => {
  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
  })

  it('queries v2/v3 events by exact operation identity and reports workflow aggregates', () => {
    const directory = mkdtempSync(join(tmpdir(), 'eypc-runtime-probe-'))
    temporaryDirectories.push(directory)
    const events = [
      {
        v: 2,
        at: 100,
        level: 'info',
        sessionId: 'session-old',
        scope: 'runtime-action',
        event: 'dispatch',
        outcome: 'handled'
      },
      {
        v: 3,
        at: 200,
        level: 'info',
        sessionId: 'session-new',
        operationId: 'archive-operation-1',
        traceId: 'trace-1',
        provider: 'codex',
        taskRef: 'thread-exact-1',
        source: 'archive-button',
        scope: 'archive-transaction',
        event: 'archive-provider-write',
        outcome: 'completed',
        beforePhase: 'completed',
        afterPhase: 'completed'
      },
      {
        v: 3,
        at: 210,
        level: 'debug',
        sessionId: 'session-new',
        operationId: 'open-operation-1',
        provider: 'codex',
        taskRef: 'thread-exact-1',
        source: 'global-shortcut',
        scope: 'companion-navigation',
        event: 'same-state-no-op',
        outcome: 'ignored'
      },
      {
        v: 3,
        at: 220,
        level: 'error',
        sessionId: 'session-new',
        operationId: 'archive-operation-1',
        traceId: 'trace-1',
        provider: 'codex',
        taskRef: 'thread-exact-1',
        source: 'archive-button',
        scope: 'archive-transaction',
        event: 'archive-local-retained',
        outcome: 'indeterminate',
        code: 'archive-native-ack-timeout'
      }
    ]
    writeFileSync(join(directory, 'runtime-1-1.jsonl'), `${events.map((event) => JSON.stringify(event)).join('\n')}\n`)

    const result = probe(
      directory,
      '--operation=archive-operation-1',
      '--trace=trace-1',
      '--provider=codex',
      '--taskRef=thread-exact-1',
      '--tail=10'
    )

    expect(result.status).toBe(0)
    expect(result.value).toMatchObject({
      status: 'ok',
      revision: ['v2', 'v3'],
      eventCount: 4,
      matchingEventCount: 2,
      appliedFilters: {
        operation: 'archive-operation-1',
        trace: 'trace-1',
        provider: 'codex',
        taskRef: 'thread-exact-1'
      }
    })
    expect(result.value.recentEvents.map((event: Record<string, unknown>) => event.event)).toEqual([
      'archive-provider-write',
      'archive-local-retained'
    ])
    expect(result.value.aggregates).toMatchObject({
      noOps: { count: 1 },
      shortcuts: { count: 1, bySource: { 'global-shortcut': 1 } },
      navigation: { count: 1, bySource: { 'global-shortcut': 1 } },
      archiveStages: { count: 2 },
      errors: { count: 1, byCode: { 'archive-native-ack-timeout': 1 } }
    })
  })
})
