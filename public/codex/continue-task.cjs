'use strict'

const CONTINUE_TEXT = '继续当前任务，从上次中断处接着执行。'
const GOAL_STATES = new Set(['active', 'paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete'])
const pausedGoal = (goal) => goal?.status === 'paused' || goal?.status === 'blocked'
const unsupported = (error) => error?.code === -32601
const uncertain = (error) => ['timeout', 'ETIMEDOUT', 'process-exited', 'connection-closed'].includes(error?.code)
const validId = (id) => typeof id === 'string' && id.length > 0
const result = (outcome, errorCode) => ({ outcome, ...(errorCode ? { errorCode } : {}) })
class ContinueTaskError extends Error {
  constructor(code) {
    super('继续任务前置检查失败')
    this.continueCode = code
  }
}
const fail = (code) => { throw new ContinueTaskError(code) }

function busy(value) {
  const status = typeof value?.status === 'object' ? value.status : value
  return ['active', 'inProgress', 'running'].includes(status?.type || status?.status)
    || (status?.activeFlags?.length > 0) || (value?.activeFlags?.length > 0)
}

// Identity fields stay private. Missing identity is never enough to confirm an ambiguous Goal write.
function sameGoal(left, right, requireIdentity = false) {
  if (!left || !right) return left === right && !requireIdentity
  let identified = false
  for (const key of ['id', 'goalId', 'threadId', 'createdAt']) {
    if (left[key] != null || right[key] != null) {
      if (left[key] !== right[key]) return false
      if (key !== 'threadId') identified = true
    }
  }
  return !requireIdentity || identified
}

function createCodexContinueTask(deps) {
  const inFlight = new Set()
  return async function continueTask(target, request = {}) {
    // Caller-supplied text and operation IDs are intentionally not propagated to RPC or public results.
    void request
    let lockedId
    let stage = 'preflight'
    try {
      if (!target || !validId(target.key) || !Number.isFinite(target.revisionAt) || target.revisionAt <= 0) {
        return result('failed', 'invalid-target')
      }
      const selected = { ...target }
      const resolved = await deps.resolveTarget(selected)
      if (!validId(resolved?.threadId) || !validId(resolved?.alias)) return result('failed', 'target-missing')
      const { threadId, alias } = resolved
      if (inFlight.has(threadId)) return result('failed', 'already-in-progress')
      inFlight.add(threadId)
      lockedId = threadId

      const checkTask = async () => {
        const task = await deps.currentTask(selected.key)
        if (!task || task.key !== selected.key || task.phase !== 'stopped'
          || task.capabilities?.continueTask !== true || task.revisionAt !== selected.revisionAt) fail('state-changed')
        if (busy(await deps.getKnown(threadId))) fail('state-changed')
      }
      const checkThread = (response) => {
        if (response?.thread?.id !== threadId) fail('identity-mismatch')
        if (busy(response.thread)) fail('state-changed')
      }
      const readTurn = async () => deps.sanitizeTurnPage(await deps.rpc('thread/turns/list', {
        threadId, limit: 1, sortDirection: 'desc', itemsView: 'notLoaded'
      }))
      let goalAvailable = true
      const readGoal = async () => {
        try {
          const response = await deps.rpc('thread/goal/get', { threadId })
          if (!response || !Object.hasOwn(response, 'goal')) fail('goal-response-invalid')
          const goal = response.goal
          if (goal !== null && (!goal || !GOAL_STATES.has(goal.status)
            || goal.threadId != null && goal.threadId !== threadId)) fail('goal-response-invalid')
          return goal && { ...goal }
        } catch (error) {
          if (!unsupported(error)) throw error
          goalAvailable = false
          return null
        }
      }
      const checkGoal = (goal) => {
        if (goal?.status === 'usageLimited' || goal?.status === 'budgetLimited') fail('goal-limited')
        if (goal?.status === 'active') fail('state-changed')
      }

      await checkTask()
      const threadResponse = await deps.rpc('thread/read', { threadId, includeTurns: false })
      checkThread(threadResponse)
      const before = await readTurn()
      const beforeTurn = before && { ...before }
      const goal = await readGoal()
      checkGoal(goal)
      if (!validId(beforeTurn?.id) || !(['interrupted', 'failed'].includes(beforeTurn.status)
        || pausedGoal(goal) && beforeTurn.status === 'completed')) fail('state-changed')
      await checkTask()

      stage = 'open'
      const opened = await deps.open({ ...selected, actionAlias: alias })
      if (!['opened', 'dispatched'].includes(opened?.outcome)) return result('failed', 'open-failed')
      stage = 'resume'
      checkThread(await deps.rpc('thread/resume', { threadId, excludeTurns: true }))

      const revalidate = async () => {
        await checkTask()
        const latest = await readTurn()
        if (!latest || latest.id !== beforeTurn.id || latest.status !== beforeTurn.status
          || latest.startedAt !== beforeTurn.startedAt) fail('state-changed')
        if (goalAvailable) {
          const latestGoal = await readGoal()
          checkGoal(latestGoal)
          if (!sameGoal(goal, latestGoal) || goal?.status !== latestGoal?.status) fail('state-changed')
        }
        // Reads may have yielded to fresh provider activity.
        await checkTask()
      }
      await revalidate()

      const markTurn = async (turn) => {
        try { await deps.markStarted(threadId, turn) } catch { /* Native receipt remains authoritative. */ }
        return result('executed')
      }
      const markGoal = async (activeGoal) => {
        try { await deps.markGoalActive(threadId, activeGoal) } catch { /* Do not retry a confirmed native write. */ }
        return result('executed')
      }
      const confirmTurn = async () => {
        try {
          const turn = await readTurn()
          if (validId(turn?.id) && turn.id !== beforeTurn.id && turn.status === 'inProgress'
            && Number(turn.startedAt) >= Number(beforeTurn.startedAt)) return await markTurn(turn)
        } catch { /* Ambiguous writes are never repeated. */ }
        return result('indeterminate', 'turn-start-unconfirmed')
      }
      const activeSameGoal = (candidate, requireIdentity = false) => candidate?.status === 'active'
        && sameGoal(goal, candidate, requireIdentity)
      const confirmGoal = async () => {
        try {
          const response = await deps.rpc('thread/goal/get', { threadId })
          if (activeSameGoal(response?.goal, true)) return await markGoal(response.goal)
        } catch { /* Only the same Goal can confirm this write. */ }
        return result('indeterminate', 'goal-set-unconfirmed')
      }

      if (pausedGoal(goal)) {
        stage = 'goal-set'
        let response
        let fallback = false
        try {
          response = await deps.rpc('thread/goal/set', { threadId, status: 'active', origin: 'user' })
        } catch (error) {
          if (uncertain(error)) return await confirmGoal()
          if (!unsupported(error)) return result('failed', 'goal-set-failed')
          fallback = true
          // Only explicit method absence authorizes a text fallback; recheck after the failed RPC.
          await revalidate()
        }
        if (!fallback) {
          if (activeSameGoal(response?.goal)) return await markGoal(response.goal)
          return await confirmGoal()
        }
      }
      stage = 'turn-start'
      try {
        const response = await deps.rpc('turn/start', {
          threadId, input: [{ type: 'text', text: CONTINUE_TEXT }]
        })
        const turn = response?.turn
        if (validId(turn?.id) && turn.id !== beforeTurn.id && turn.status === 'inProgress') return await markTurn(turn)
        return await confirmTurn()
      } catch (error) {
        if (uncertain(error)) return await confirmTurn()
        return result('failed', 'turn-start-failed')
      }
    } catch (error) {
      return result('failed', error instanceof ContinueTaskError ? error.continueCode : `${stage}-failed`)
    } finally {
      if (lockedId) inFlight.delete(lockedId)
    }
  }
}

module.exports = { createCodexContinueTask }
