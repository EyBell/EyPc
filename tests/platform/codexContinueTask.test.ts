import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const { createCodexContinueTask } = require('../../preload/codex/continue-task.cjs')

const threadId = 'private-thread-root'
const beforeId = 'private-turn-before'
const prompt = '继续当前任务，从上次中断处接着执行。'
const timeout = () => Object.assign(new Error('private body private-thread-root'), { code: 'timeout' })
const unsupported = () => Object.assign(new Error('private body'), { code: -32601 })
function fixture(goalStatus?: string, turnStatus = 'interrupted') {
  const target = { key: 'public-key', actionAlias: 'public-alias', revisionAt: 10 }
  const state: any = {
    task: { ...target, phase: 'stopped', capabilities: { continueTask: true } },
    known: { status: 'idle', activeFlags: [] },
    thread: { id: threadId, status: { type: 'idle', activeFlags: [] } },
    turn: { id: beforeId, status: turnStatus, startedAt: 1 },
    goal: goalStatus ? { id: 'private-goal', status: goalStatus, createdAt: 1, objective: 'private body' } : null,
    opened: { outcome: 'opened' },
    hooks: {} as Record<string, Function>
  }
  const deps = {
    resolveTarget: vi.fn(async () => ({ threadId, alias: target.actionAlias })),
    currentTask: vi.fn(() => state.task), getKnown: vi.fn(() => state.known),
    open: vi.fn(async () => state.opened), markStarted: vi.fn(), markGoalActive: vi.fn(),
    sanitizeTurnPage: vi.fn((page: any) => page?.data?.[0] ?? null),
    rpc: vi.fn(async (method: string, params: any): Promise<any> => {
      if (state.hooks[method]) return state.hooks[method](params)
      switch (method) {
        case 'thread/read': return { thread: state.thread }
        case 'thread/turns/list': return { data: [{ ...state.turn }] }
        case 'thread/goal/get': return { goal: state.goal && { ...state.goal } }
        case 'thread/resume': return { thread: state.thread }
        case 'thread/goal/set': return { goal: { ...state.goal, status: 'active' } }
        case 'turn/start': return { turn: { id: 'private-turn-new', status: 'inProgress', startedAt: 2 } }
        default: throw new Error('Unexpected RPC')
      }
    })
  }
  const run = createCodexContinueTask(deps)
  const writes = () => deps.rpc.mock.calls.filter(([m]) => ['turn/start', 'thread/goal/set'].includes(m))
  return { state, deps, target, run, writes }
}

describe('隔离 Codex 继续任务执行器', () => {
  it.each(['interrupted', 'failed'])('继续普通 %s 轮次，仅发送固定指令', async (status) => {
    const f = fixture(undefined, status)
    expect(await f.run(f.target, { prompt: '覆盖指令' })).toMatchObject({ outcome: 'executed' })
    expect(f.deps.rpc.mock.calls).toEqual([
      ['thread/read', { threadId, includeTurns: false }],
      ['thread/turns/list', { threadId, limit: 1, sortDirection: 'desc', itemsView: 'notLoaded' }],
      ['thread/goal/get', { threadId }],
      ['thread/resume', { threadId, excludeTurns: true }],
      ['thread/turns/list', { threadId, limit: 1, sortDirection: 'desc', itemsView: 'notLoaded' }],
      ['thread/goal/get', { threadId }],
      ['turn/start', { threadId, input: [{ type: 'text', text: prompt }] }]
    ])
    expect(f.deps.open).toHaveBeenCalledWith(f.target)
    expect(f.deps.markStarted).toHaveBeenCalledOnce()
  })
  it.each(['paused', 'blocked'])('Goal %s 支持已完成轮次，原生写入一次且不发新轮次', async (status) => {
    const f = fixture(status, 'completed')
    expect(await f.run(f.target)).toMatchObject({ outcome: 'executed' })
    expect(f.writes()).toEqual([['thread/goal/set', { threadId, status: 'active', origin: 'user' }]])
    expect(f.deps.markGoalActive).toHaveBeenCalledWith(threadId, { ...f.state.goal, status: 'active' })
    expect(f.deps.markStarted).not.toHaveBeenCalled()
  })
  it.each(['usageLimited', 'budgetLimited', 'active'])('拒绝 Goal %s', async (status) => {
    const f = fixture(status)
    expect(await f.run(f.target)).toMatchObject({ outcome: 'failed' })
    expect(f.writes()).toEqual([])
    expect(f.deps.open).not.toHaveBeenCalled()
  })
  it.each(['running', 'waiting-input', 'waiting-approval'])('公开任务 %s 拒绝', async (phase) => {
    const f = fixture(); f.state.task.phase = phase
    expect(await f.run(f.target)).toMatchObject({ outcome: 'failed' })
    expect(f.deps.rpc).not.toHaveBeenCalled()
  })
  it.each(['revision', 'capability', 'missing', 'key'])('拒绝公开任务失效：%s', async (change) => {
    const f = fixture()
    if (change === 'revision') f.state.task.revisionAt++
    if (change === 'capability') f.state.task.capabilities.continueTask = false
    if (change === 'missing') f.state.task = null
    if (change === 'key') f.state.task.key = 'another'
    expect(await f.run(f.target)).toMatchObject({ outcome: 'failed' })
    expect(f.writes()).toEqual([])
  })
  it.each(['known-active', 'approval', 'input', 'native-active', 'turn-active', 'completed', 'identity'])('拒绝原生状态：%s', async (change) => {
    const f = fixture()
    if (change === 'known-active') f.state.known.status = 'active'
    if (change === 'approval') f.state.known.activeFlags = ['waitingOnApproval']
    if (change === 'input') f.state.thread.status.activeFlags = ['waitingOnUserInput']
    if (change === 'native-active') f.state.thread.status.type = 'active'
    if (change === 'turn-active') f.state.turn.status = 'inProgress'
    if (change === 'completed') f.state.turn.status = 'completed'
    if (change === 'identity') f.state.thread.id = 'private-other-thread'
    expect(await f.run(f.target)).toMatchObject({ outcome: 'failed' })
    expect(f.writes()).toEqual([])
  })
  it.each(['failed', 'throw'])('打开失败 %s 不恢复或写入', async (mode) => {
    const f = fixture(); f.state.opened = { outcome: 'failed', message: 'private body' }
    if (mode === 'throw') f.deps.open.mockRejectedValue(timeout())
    expect(await f.run(f.target)).toMatchObject({ outcome: 'failed' })
    expect(f.deps.rpc.mock.calls.some(([m]) => m === 'thread/resume')).toBe(false)
    expect(f.writes()).toEqual([])
  })
  it.each(['turn-id', 'turn-status', 'revision', 'approval', 'identity', 'budget'])('resume 后新活动 %s 拒绝', async (change) => {
    const f = fixture()
    f.state.hooks['thread/resume'] = () => {
      if (change === 'turn-id') f.state.turn.id = 'private-another-turn'
      if (change === 'turn-status') f.state.turn.status = 'inProgress'
      if (change === 'revision') f.state.task.revisionAt++
      if (change === 'approval') f.state.known.activeFlags = ['waitingOnApproval']
      if (change === 'identity') return { thread: { ...f.state.thread, id: 'private-other-thread' } }
      if (change === 'budget') f.state.goal = { status: 'budgetLimited' }
      return { thread: f.state.thread }
    }
    expect(await f.run(f.target)).toMatchObject({ outcome: 'failed' })
    expect(f.writes()).toEqual([])
  })
  it('goal/get 仅 method not found 可回落', async () => {
    const f = fixture(); f.state.hooks['thread/goal/get'] = () => { throw unsupported() }
    expect(await f.run(f.target)).toMatchObject({ outcome: 'executed' })
    expect(f.writes().map(([m]) => m)).toEqual(['turn/start'])
  })
  it.each(['timeout', 'denied', 'malformed'])('goal/get %s 不发送', async (mode) => {
    const f = fixture()
    f.state.hooks['thread/goal/get'] = () => {
      if (mode === 'malformed') return {}
      throw mode === 'timeout' ? timeout() : new Error('private body')
    }
    expect(await f.run(f.target)).toMatchObject({ outcome: 'failed' })
    expect(f.writes()).toEqual([])
  })
  it('goal/set 不支持可回落，包含已完成的暂停 Goal', async () => {
    const f = fixture('paused', 'completed'); f.state.hooks['thread/goal/set'] = () => { throw unsupported() }
    expect(await f.run(f.target)).toMatchObject({ outcome: 'executed' })
    expect(f.writes().map(([m]) => m)).toEqual(['thread/goal/set', 'turn/start'])
  })
  it('goal/set 明确失败不能盲回落', async () => {
    const f = fixture('blocked'); f.state.hooks['thread/goal/set'] = () => { throw new Error('private body') }
    expect(await f.run(f.target)).toMatchObject({ outcome: 'failed' })
    expect(f.writes().map(([m]) => m)).toEqual(['thread/goal/set'])
  })
  it.each(['timeout', 'empty', 'completed', 'same-id'])('turn/start %s 只复读一次，无新轮次则不确定', async (mode) => {
    const f = fixture()
    f.state.hooks['turn/start'] = () => {
      if (mode === 'timeout') throw timeout()
      if (mode === 'empty') return {}
      return { turn: { id: mode === 'same-id' ? beforeId : 'private-new', status: mode === 'completed' ? 'completed' : 'inProgress' } }
    }
    expect(await f.run(f.target)).toMatchObject({ outcome: 'indeterminate' })
    expect(f.writes()).toHaveLength(1)
    expect(f.deps.rpc.mock.calls.filter(([m]) => m === 'thread/turns/list')).toHaveLength(3)
    expect(f.deps.markStarted).not.toHaveBeenCalled()
  })
  it('turn/start 超时，定向复读新运行轮次确认成功', async () => {
    const f = fixture(); f.state.hooks['turn/start'] = () => {
      f.state.turn = { id: 'private-new', status: 'inProgress', startedAt: 2 }; throw timeout()
    }
    expect(await f.run(f.target)).toMatchObject({ outcome: 'executed' })
    expect(f.writes()).toHaveLength(1)
    expect(f.deps.markStarted).toHaveBeenCalledOnce()
  })
  it.each(['active', 'paused', 'different', 'invalid'])('Goal 超时或异常回执仅复读同 Goal：%s', async (mode) => {
    const f = fixture('paused')
    f.state.hooks['thread/goal/set'] = () => {
      if (mode === 'invalid') return { goal: { ...f.state.goal, status: 'paused' } }
      f.state.goal.status = mode === 'paused' ? 'paused' : 'active'
      if (mode === 'different') f.state.goal.id = 'private-other-goal'
      throw timeout()
    }
    expect(await f.run(f.target)).toMatchObject({ outcome: mode === 'active' ? 'executed' : 'indeterminate' })
    expect(f.writes().map(([m]) => m)).toEqual(['thread/goal/set'])
    expect(f.deps.rpc.mock.calls.filter(([m]) => m === 'thread/goal/get')).toHaveLength(3)
  })
  it('不向结果或记录传播原生身份、请求或异常正文', async () => {
    const f = fixture(); f.state.hooks['turn/start'] = () => { throw timeout() }
    const result = await f.run(f.target, { operationId: threadId, body: 'private body', prompt })
    const serialized = JSON.stringify(result)
    for (const secret of [threadId, beforeId, 'private body', prompt]) expect(serialized).not.toContain(secret)
    expect(Object.keys(result).every(k => ['outcome', 'errorCode', 'message', 'operationId'].includes(k))).toBe(true)
  })
  it('同执行器并发点击不能双启动', async () => {
    const f = fixture()
    const results = await Promise.all([f.run(f.target), f.run(f.target)])
    expect(results.filter(r => r.outcome === 'executed')).toHaveLength(1)
    expect(f.writes()).toHaveLength(1)
  })
  it.each(['undefined', 'null', 'wrong-identity'])('Goal 非法回执 %s 不能回落', async (mode) => {
    const f = fixture('paused')
    f.state.hooks['thread/goal/set'] = () => mode === 'undefined' ? undefined : mode === 'null' ? null
      : { goal: { ...f.state.goal, id: 'private-other-goal', status: 'active' } }
    expect(await f.run(f.target)).toMatchObject({ outcome: 'indeterminate' })
    expect(f.writes().map(([m]) => m)).toEqual(['thread/goal/set'])
    expect(f.deps.markGoalActive).not.toHaveBeenCalled()
  })
  it('原生方法缺失后出现新活动，禁止文字回落', async () => {
    const f = fixture('paused')
    f.state.hooks['thread/goal/set'] = () => {
      f.state.turn = { id: 'private-other-turn', status: 'inProgress', startedAt: 2 }
      throw unsupported()
    }
    expect(await f.run(f.target)).toMatchObject({ outcome: 'failed' })
    expect(f.writes().map(([m]) => m)).toEqual(['thread/goal/set'])
  })
  it.each(['turn/start', 'thread/goal/set'])('%s 超时后复读失败，不重发且返回不确定', async (method) => {
    const f = fixture(method === 'thread/goal/set' ? 'blocked' : undefined)
    f.state.hooks[method] = () => {
      f.state.hooks[method === 'turn/start' ? 'thread/turns/list' : 'thread/goal/get'] = () => { throw timeout() }
      throw timeout()
    }
    expect(await f.run(f.target)).toMatchObject({ outcome: 'indeterminate' })
    expect(f.writes()).toHaveLength(1)
  })
  it('缺少 Goal 身份的超时复读不能冒充确认', async () => {
    const f = fixture('paused'); f.state.goal = { status: 'paused' }
    f.state.hooks['thread/goal/set'] = () => { f.state.goal.status = 'active'; throw timeout() }
    expect(await f.run(f.target)).toMatchObject({ outcome: 'indeterminate' })
    expect(f.writes()).toHaveLength(1)
  })
  it('Goal 无 id 时可用同一 createdAt 确认超时', async () => {
    const f = fixture('paused'); delete f.state.goal.id
    f.state.hooks['thread/goal/set'] = () => { f.state.goal.status = 'active'; throw timeout() }
    expect(await f.run(f.target)).toMatchObject({ outcome: 'executed' })
    expect(f.writes()).toHaveLength(1)
  })
  it.each(['turn', 'goal'])('确认原生 %s 成功后本地标记失败，不重发', async (kind) => {
    const f = fixture(kind === 'goal' ? 'paused' : undefined)
    f.deps.markStarted.mockImplementation(() => { throw timeout() })
    f.deps.markGoalActive.mockImplementation(() => { throw timeout() })
    expect(await f.run(f.target)).toMatchObject({ outcome: 'executed' })
    expect(f.writes()).toHaveLength(1)
  })
  it.each(['read', 'resume'])('%s 失败不发送继续指令', async (stage) => {
    const f = fixture(); f.state.hooks[`thread/${stage}`] = () => { throw timeout() }
    expect(await f.run(f.target)).toMatchObject({ outcome: 'failed' })
    expect(f.writes()).toEqual([])
  })
  it('目标解析失败不读取其他会话', async () => {
    const f = fixture(); f.deps.resolveTarget.mockResolvedValue(null as any)
    expect(await f.run(f.target)).toMatchObject({ outcome: 'failed' })
    expect(f.deps.rpc).not.toHaveBeenCalled()
  })
  it('依赖抛出的自定义错误字段不进入公开结果', async () => {
    const f = fixture()
    f.deps.resolveTarget.mockRejectedValue({ code: threadId, continueCode: 'private body', message: prompt })
    expect(await f.run(f.target)).toEqual({ outcome: 'failed', errorCode: 'preflight-failed' })
  })
  it('只处理根目标，不遍历 target 上的子任务', async () => {
    const f = fixture(); f.state.opened = { outcome: 'dispatched' }
    expect(await f.run({ ...f.target, children: [{ key: 'child-private', revisionAt: 10 }] }))
      .toMatchObject({ outcome: 'executed' })
    expect(f.deps.resolveTarget).toHaveBeenCalledOnce()
    expect(f.deps.rpc.mock.calls.every(([, params]) => params.threadId === threadId)).toBe(true)
  })
})
