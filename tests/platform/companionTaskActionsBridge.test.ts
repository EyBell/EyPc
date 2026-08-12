import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const require_ = createRequire(import.meta.url)
const { createCompanionTaskActions } = require_(resolve(process.cwd(), 'preload/companion/task-actions.cjs'))

function target(provider: 'codex' | 'claude', key: string, revisionAt = 100) {
  return {
    provider,
    key,
    actionAlias: `${provider}-alias-${key}`,
    revisionAt,
    phase: 'completed',
    canArchive: true,
    ...(provider === 'codex'
      ? {
          archiveRequest: {
            expectedUpdatedAt: revisionAt,
            expectedRevisionAt: revisionAt,
            expectedLastTurnStartedAt: revisionAt - 1,
            expectedSourceFingerprint: 'a'.repeat(64),
            evidence: 'completed'
          }
        }
      : {})
  }
}

function planTarget(key = 'plan-one', planLifecycleRevision = 200) {
  return {
    ...target('codex', key, 150),
    phase: 'stopped',
    canArchive: false,
    planReady: true,
    planLifecycleRevision,
    paused: false,
    canPause: true,
    canResume: false,
    canExecutePlan: true
  }
}

function syncReady(actions: ReturnType<typeof createCompanionTaskActions>, targets: unknown[], focusedKey = '') {
  actions.sync({
    enabled: true,
    ready: true,
    providers: { codex: true, claude: true },
    targets,
    focusedKey,
    attentionKeys: targets.map((value) => (value as { key: string }).key)
  })
}

describe('companion task action dispatcher', () => {
  it('opens the Host current target by exact key when a card carries an older alias and revision', async () => {
    const open = vi.fn(async () => ({ outcome: 'opened' }))
    const actions = createCompanionTaskActions({ adapters: { codex: { open } } })
    const current = {
      ...target('codex', 'same-key', 200),
      actionAlias: 'host-current-alias',
      phase: 'waiting-input',
      canArchive: false
    }
    syncReady(actions, [current])

    await expect(actions.open({
      key: 'same-key',
      source: 'card-click',
      target: {
        ...current,
        actionAlias: 'renderer-expired-alias',
        revisionAt: 100,
        phase: 'stopped'
      }
    })).resolves.toMatchObject({ outcome: 'opened', key: 'same-key' })

    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'same-key',
        actionAlias: 'host-current-alias',
        revisionAt: 200,
        phase: 'waiting-input'
      }),
      expect.objectContaining({ source: 'card-click' })
    )
  })

  it('joins duplicate archive requests for one task without merging distinct tasks', async () => {
    let resolveFirst!: (value: unknown) => void
    const archive = vi.fn((value: { key: string }) => value.key === 'one'
      ? new Promise((resolvePromise) => { resolveFirst = resolvePromise })
      : Promise.resolve({ outcome: 'archived' }))
    const actions = createCompanionTaskActions({
      adapters: {
        codex: { inspect: vi.fn(), open: vi.fn(), archive, close: vi.fn() },
        claude: { inspect: vi.fn(), open: vi.fn(), archive: vi.fn(), close: vi.fn() }
      }
    })
    syncReady(actions, [target('codex', 'one'), target('codex', 'two')])

    const first = actions.archive({ key: 'one', revisionAt: 100, phase: 'completed', source: 'card' })
    const joined = actions.archive({ key: 'one', revisionAt: 100, phase: 'completed', source: 'batch' })
    const distinct = actions.archive({ key: 'two', revisionAt: 100, phase: 'completed', source: 'batch' })
    await Promise.resolve()
    expect(archive).toHaveBeenCalledTimes(2)
    await expect(distinct).resolves.toMatchObject({ outcome: 'archived', key: 'two' })
    resolveFirst({ outcome: 'archived' })
    await expect(first).resolves.toMatchObject({ outcome: 'archived', key: 'one' })
    await expect(joined).resolves.toMatchObject({ outcome: 'archived', key: 'one' })
    expect(archive).toHaveBeenCalledTimes(2)
  })

  it('keeps Codex and Claude archive lanes independent', async () => {
    let resolveClaude!: (value: unknown) => void
    const codexArchive = vi.fn(async () => ({ outcome: 'archived' }))
    const claudeArchive = vi.fn(() => new Promise((resolvePromise) => { resolveClaude = resolvePromise }))
    const actions = createCompanionTaskActions({
      adapters: {
        codex: { inspect: vi.fn(), open: vi.fn(), archive: codexArchive, close: vi.fn() },
        claude: { inspect: vi.fn(), open: vi.fn(), archive: claudeArchive, close: vi.fn() }
      }
    })
    syncReady(actions, [target('claude', 'claude:one'), target('codex', 'codex-one')])

    const slow = actions.archive({ key: 'claude:one', revisionAt: 100, phase: 'completed', source: 'card' })
    await expect(actions.archive({ key: 'codex-one', revisionAt: 100, phase: 'completed', source: 'card' }))
      .resolves.toMatchObject({ outcome: 'archived', provider: 'codex' })
    expect(claudeArchive).toHaveBeenCalledTimes(1)
    resolveClaude({ outcome: 'archived' })
    await expect(slow).resolves.toMatchObject({ outcome: 'archived', provider: 'claude' })
  })

  it('fails closed for unknown providers, stale revisions and unsupported actions', async () => {
    const actions = createCompanionTaskActions({ adapters: {} })
    syncReady(actions, [
      target('codex', 'known'),
      { ...target('codex', 'unknown'), provider: 'future' }
    ])
    await expect(actions.archive({ key: 'unknown', revisionAt: 100, phase: 'completed', source: 'card' }))
      .resolves.toMatchObject({ outcome: 'failed', errorCode: 'state-changed' })
    await expect(actions.archive({ key: 'known', revisionAt: 101, phase: 'completed', source: 'card' }))
      .resolves.toMatchObject({ outcome: 'failed', errorCode: 'unsupported' })
    await expect(actions.archive({
      key: 'known',
      revisionAt: 101,
      phase: 'completed',
      source: 'card',
      target: target('codex', 'known', 101)
    })).resolves.toMatchObject({ outcome: 'failed', errorCode: 'state-changed' })
    await expect(actions.archive({ key: 'known', revisionAt: 100, phase: 'completed', source: 'card' }))
      .resolves.toMatchObject({ outcome: 'failed', errorCode: 'unsupported' })
  })

  it('keeps shortcut confirmation across revision churn but cancels it on semantic identity changes', async () => {
    let now = 1_000
    const notify = vi.fn()
    const archive = vi.fn(async () => ({ outcome: 'archived', message: 'done' }))
    const actions = createCompanionTaskActions({
      now: () => now,
      notify,
      adapters: {
        codex: { inspect: vi.fn(), open: vi.fn(), archive, close: vi.fn() },
        claude: { inspect: vi.fn(), open: vi.fn(), archive: vi.fn(), close: vi.fn() }
      }
    })
    syncReady(actions, [target('codex', 'one')], 'one')
    expect(actions.shortcutArchive()).toBe(true)
    expect(archive).not.toHaveBeenCalled()

    // A cold Renderer's incomplete snapshot must not erase process state.
    expect(actions.sync({ enabled: true, ready: false, providers: { codex: true, claude: true }, targets: [] })).toBe(false)
    // Benign state refreshes may move the revision while the same task, alias
    // and terminal phase remain selected. The second press archives the latest
    // target instead of executing a stale first-press closure.
    syncReady(actions, [{
      ...target('codex', 'one', 101),
      actionAlias: 'refreshed-alias',
      archiveRequest: target('codex', 'one', 100).archiveRequest
    }], 'one')
    expect(actions.shortcutArchive()).toBe(true)
    await Promise.resolve()
    expect(archive).toHaveBeenCalledTimes(1)
    expect(archive).toHaveBeenLastCalledWith(expect.objectContaining({ revisionAt: 101, actionAlias: 'refreshed-alias' }), expect.anything())

    syncReady(actions, [target('codex', 'one', 102)], 'one')
    now += 1
    expect(actions.shortcutArchive()).toBe(true)
    syncReady(actions, [{ ...target('codex', 'one', 103), phase: 'stopped' }], 'one')
    expect(actions.shortcutArchive()).toBe(true)
    expect(archive).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('5 秒'))
  })

  it('records exact archive identity, confirmation lifecycle and provider outcome without result messages', async () => {
    let now = 2_000
    const records: Array<Record<string, unknown>> = []
    const archive = vi.fn(async () => ({ outcome: 'failed', errorCode: 'source-changed', message: 'private provider detail' }))
    const actions = createCompanionTaskActions({
      now: () => now,
      record: (entry: Record<string, unknown>) => records.push(entry),
      notify: vi.fn(),
      adapters: {
        codex: {
          inspect: vi.fn(),
          open: vi.fn(),
          archive,
          close: vi.fn()
        }
      }
    })
    syncReady(actions, [target('codex', 'exact-task')], 'exact-task')
    actions.shortcutArchive()
    now += 1
    actions.shortcutArchive()
    await vi.waitFor(() => {
      expect(records.some((entry) => entry.event === 'archive-result')).toBe(true)
    })

    expect(records).toContainEqual(expect.objectContaining({
      scope: 'task-action',
      event: 'archive-confirmation-created',
      outcome: 'created',
      provider: 'codex',
      taskRef: 'exact-task'
    }))
    const confirmationRecords = records.filter((entry) => entry.event === 'archive-confirmation-confirmed')
    expect(confirmationRecords).toHaveLength(1)
    expect(confirmationRecords[0]?.operationId).toBe(
      records.find((entry) => entry.event === 'archive-confirmation-created')?.operationId
    )
    expect(records.filter((entry) => entry.event === 'archive-intent' && entry.outcome === 'started')).toHaveLength(1)
    expect(archive).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'exact-task' }),
      expect.objectContaining({ intentRecorded: true, confirmationRecorded: true })
    )
    const archiveRecord = records.find((entry) => entry.event === 'archive-result')
    expect(archiveRecord).toMatchObject({
      scope: 'task-action',
      event: 'archive-result',
      outcome: 'failed',
      code: 'source-changed',
      provider: 'codex',
      taskRef: 'exact-task',
      details: { source: 'archive-shortcut', phase: 'completed', revisionAt: 100 }
    })
    expect(JSON.stringify(records)).not.toContain('private provider detail')
  })

  it('infers one confirmation for direct dispatches that bypass a confirmation UI', async () => {
    const records: Array<Record<string, unknown>> = []
    const archive = vi.fn(async () => ({ outcome: 'archived' }))
    const actions = createCompanionTaskActions({
      record: (entry: Record<string, unknown>) => records.push(entry),
      adapters: { codex: { inspect: vi.fn(), open: vi.fn(), archive, close: vi.fn() } }
    })
    syncReady(actions, [target('codex', 'direct')], 'direct')

    await actions.archive({
      key: 'direct',
      revisionAt: 100,
      phase: 'completed',
      source: 'archive-button',
      operationId: 'archive-direct-1'
    })

    expect(records.filter((entry) => entry.event === 'archive-confirmation-confirmed')).toHaveLength(1)
    expect(records.find((entry) => entry.event === 'archive-confirmation-confirmed')).toMatchObject({
      operationId: 'archive-direct-1',
      details: expect.objectContaining({ owner: 'task-actions', inferredFromDispatch: true })
    })
    expect(archive).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ intentRecorded: true, confirmationRecorded: true })
    )
  })

  it('executes a Plan only after the second stable click and joins an in-flight execution', async () => {
    let resolveExecution!: (value: unknown) => void
    const executePlan = vi.fn(() => new Promise((resolvePromise) => { resolveExecution = resolvePromise }))
    const actions = createCompanionTaskActions({ adapters: { codex: { executePlan } } })
    syncReady(actions, [planTarget()], 'plan-one')

    await expect(actions.executePlan({ key: 'plan-one', planLifecycleRevision: 200, source: 'execute-plan-button' }))
      .resolves.toMatchObject({ outcome: 'confirmation-required' })
    expect(executePlan).not.toHaveBeenCalled()

    const started = actions.executePlan({ key: 'plan-one', planLifecycleRevision: 200, source: 'execute-plan-button' })
    const joined = actions.executePlan({ key: 'plan-one', planLifecycleRevision: 200, source: 'execute-plan-button' })
    await Promise.resolve()
    expect(executePlan).toHaveBeenCalledTimes(1)
    resolveExecution({ outcome: 'executed' })
    await expect(started).resolves.toMatchObject({ outcome: 'executed', key: 'plan-one' })
    await expect(joined).resolves.toMatchObject({ outcome: 'executed', key: 'plan-one' })
  })

  it('cancels Plan confirmation when alias, phase or lifecycle revision changes', async () => {
    const executePlan = vi.fn(async () => ({ outcome: 'executed' }))
    const actions = createCompanionTaskActions({ adapters: { codex: { executePlan } } })
    syncReady(actions, [planTarget()], 'plan-one')
    await actions.executePlan({ key: 'plan-one', planLifecycleRevision: 200 })

    syncReady(actions, [{ ...planTarget(), actionAlias: 'new-private-alias' }], 'plan-one')
    await expect(actions.executePlan({ key: 'plan-one', planLifecycleRevision: 200 }))
      .resolves.toMatchObject({ outcome: 'confirmation-required' })
    expect(executePlan).not.toHaveBeenCalled()

    syncReady(actions, [planTarget('plan-one', 201)], 'plan-one')
    await expect(actions.executePlan({ key: 'plan-one', planLifecycleRevision: 201 }))
      .resolves.toMatchObject({ outcome: 'confirmation-required' })
    expect(executePlan).not.toHaveBeenCalled()
  })
})
