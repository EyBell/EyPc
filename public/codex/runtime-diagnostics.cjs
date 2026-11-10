'use strict'

function createCodexRuntimeDiagnostics(dependencies) {
  const { runtimeDiagnostics, startCodexServer, sendCodexRpc, process } = dependencies
  const errorNames = ['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError']
  const nativeCodes = ['ENOENT', 'EACCES', 'EPERM', 'EINVAL', 'ENOTDIR', 'ELOOP', 'ENOEXEC', 'OTHER']
  const sources = ['manual', 'configured', 'volta', 'npm-global', 'local', 'homebrew', 'nvm', 'path', 'unknown']
  const launchFailures = new WeakMap()
  const snapshotFailures = new WeakMap()

  function safeDiagnostic(value) {
    if (!value || typeof value !== 'object' || !['local-state', 'app-server', 'task-projection'].includes(value.stage)) return null
    const fields = ['local-projects', 'thread-project-assignments', 'project-order', 'pinned-project-ids',
      'selected-project', 'pinned-thread-ids', 'projectless-thread-ids']
    return {
      stage: value.stage,
      category: ['invalid-data', 'read-failed', 'request-failed', 'projection-failed'].includes(value.category)
        ? value.category : value.stage === 'local-state' ? 'read-failed' : value.stage === 'app-server' ? 'request-failed' : 'projection-failed',
      ...(fields.includes(value.field) ? { field: value.field } : {}),
      ...(['primary', 'backup'].includes(value.source) ? { source: value.source } : {})
    }
  }

  function diagnosticFor(error) {
    return error && typeof error === 'object'
      ? snapshotFailures.get(error) || safeDiagnostic(error.codexDiagnostic) || safeDiagnostic(error.diagnostic)
      : null
  }

  function captureFailure(error, context) {
    const failure = error && typeof error === 'object' ? error : new Error('Codex read failed')
    const diagnostic = safeDiagnostic({ ...context, ...diagnosticFor(failure) })
    if (diagnostic) snapshotFailures.set(failure, diagnostic)
    return failure
  }

  function captureLaunch(error, plan) {
    if (!error || typeof error !== 'object' || launchFailures.has(error)) return
    const diagnostic = plan?.launchDiagnostic || {}
    const counts = ['checked', 'missing', 'inaccessible', 'nonFile', 'nonExecutable', 'available', 'unusable',
      'relative', 'unverified', 'failed', 'native', 'javascript', 'shim', 'nodeMissing', 'entryMissing', 'inspectionFailed']
    launchFailures.set(error, {
      launch: {
        mode: ['manual', 'automatic'].includes(plan?.launchMode) ? plan.launchMode : 'unknown',
        source: sources.includes(plan?.source) ? plan.source : 'unknown',
        detected: plan?.detected === true, invalid: plan?.invalid === true,
        manualState: ['valid', 'invalid', 'not-configured'].includes(plan?.manualLaunchPathState) ? plan.manualLaunchPathState : 'unknown',
        kind: ['native', 'javascript', 'shim', 'path-lookup'].includes(diagnostic.kind) ? diagnostic.kind : 'unknown',
        resolution: ['direct', 'unresolved', 'bundled-native', 'javascript-node', 'node-missing', 'entry-missing', 'inspection-failed'].includes(diagnostic.resolution) ? diagnostic.resolution : 'unknown',
        nativeCode: nativeCodes.includes(diagnostic.nativeCode) ? diagnostic.nativeCode : '',
        searchState: Array.isArray(plan?.launchSearch) ? 'observed' : 'unavailable',
        desktop: {
          state: ['not-queried', 'unsupported', 'queried', 'failed', 'timeout', 'invalid-output'].includes(plan?.desktopSearch?.state) ? plan.desktopSearch.state : 'unknown',
          packages: Number.isSafeInteger(plan?.desktopSearch?.packages) && plan.desktopSearch.packages >= 0 ? Math.min(plan.desktopSearch.packages, 4) : 0,
          nativeCode: ['ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', 'OTHER'].includes(plan?.desktopSearch?.nativeCode) ? plan.desktopSearch.nativeCode : '',
          errorCategory: ['PermissionDenied', 'SecurityError', 'ResourceUnavailable', 'NotImplemented', 'ObjectNotFound', 'OperationStopped', 'NotSpecified', 'Other'].includes(plan?.desktopSearch?.errorCategory) ? plan.desktopSearch.errorCategory : '',
          hresult: Number.isInteger(plan?.desktopSearch?.hresult) && Math.abs(plan.desktopSearch.hresult) <= 0xffffffff ? plan.desktopSearch.hresult : null
        },
        candidates: (Array.isArray(plan?.launchCandidates) ? plan.launchCandidates : []).slice(0, 8).map((candidate) => ({
          source: sources.includes(candidate?.source) ? candidate.source : 'unknown',
          state: ['available', 'unusable'].includes(candidate?.state) ? candidate.state : 'unknown'
        }))
      },
      search: (Array.isArray(plan?.launchSearch) ? plan.launchSearch : []).slice(0, 9).map((entry) => ({
        source: sources.includes(entry?.source) ? entry.source : 'unknown',
        ...Object.fromEntries(counts.map((key) => [key, Number.isSafeInteger(entry?.[key]) && entry[key] >= 0 ? entry[key] : 0])),
        nativeCode: nativeCodes.includes(entry?.nativeCode) ? entry.nativeCode : ''
      }))
    })
  }

  function errorResult(error) {
    const diagnostic = diagnosticFor(error)
    const sourceCode = error && typeof error === 'object' ? String(error.code || '') : ''
    const code = sourceCode === 'ETIMEDOUT' || sourceCode === 'timeout'
      ? 'timeout'
      : ['not-authenticated', 'runtime-unavailable', 'process-exited', 'protocol-error'].includes(sourceCode)
        ? sourceCode : 'unavailable'
    const messages = {
      timeout: 'Codex App Server 响应超时',
      'not-authenticated': 'Codex 尚未登录或登录已失效',
      'runtime-unavailable': 'Codex CLI 不可用，请检查可执行文件位置或运行日志',
      'process-exited': 'Codex App Server 已退出',
      'protocol-error': 'Codex App Server 返回了不兼容的数据',
      unavailable: '未找到可用的 Codex CLI'
    }
    const message = diagnostic?.stage === 'local-state' ? 'Codex 本地状态读取或解析失败'
      : diagnostic?.stage === 'task-projection' ? 'Codex 任务投影失败'
        : diagnostic?.stage === 'app-server' && code === 'unavailable' ? 'Codex App Server 请求失败' : messages[code]
    return { ok: false, error: { code, message, ...(diagnostic ? { diagnostic } : {}) }, receivedAt: Date.now() }
  }

  function errorDetails(error) {
    return {
      failure: errorResult(error).error.code,
      errorName: errorNames.includes(error?.name) ? error.name : 'Error',
      nativeCode: nativeCodes.includes(error?.code) ? error.code : '',
      phase: ['startup', 'thread-list'].includes(error?.diagnosticPhase) ? error.diagnosticPhase : 'inventory',
      rpcCode: Number.isInteger(error?.rpcCode) ? error.rpcCode : null,
      ...(diagnosticFor(error) ? { diagnostic: diagnosticFor(error) } : {})
    }
  }

  function snapshotFailure(error) {
    const failure = captureFailure(error, { stage: 'task-projection', category: 'projection-failed' })
    runtimeDiagnostics.record({
      level: 'error', scope: 'task-recovery', event: 'codex-snapshot-read', outcome: 'failed',
      details: errorDetails(failure)
    })
    return errorResult(failure)
  }

  function preflightRead(result) {
    if (result?.ok && Array.isArray(result.value?.threads) && result.value.completeness === 'verified') {
      return { provider: 'codex', status: 'ready', value: result.value }
    }
    const diagnostic = diagnosticFor(result?.error)
      || safeDiagnostic({ stage: 'task-projection', category: 'invalid-data' })
    return { provider: 'codex', status: 'unavailable', errorCode: 'codex-task-preflight-failed', diagnostic }
  }

  function coldPreflight(input, error) {
    const providers = ['codex', 'claude', 'cursor', 'orca']
    const enabled = providers.filter((provider) => input.providers?.[provider] === true)
    const health = (provider) => ['ready', 'degraded', 'unavailable', 'disabled'].includes(input.providerHealth?.[provider]?.status)
      ? input.providerHealth[provider].status : 'unavailable'
    const diagnostic = error ? diagnosticFor(captureFailure(error, { stage: 'task-projection', category: 'projection-failed' })) : null
    const outcome = error || input.rows.some((row) => row.projection === 'failed')
      || !enabled.some((provider) => ['ready', 'degraded'].includes(health(provider))) ? 'failed'
      : enabled.every((provider) => health(provider) === 'ready'
        && input.rows.some((row) => row.provider === provider && row.projection === 'completed')) ? 'accepted' : 'degraded'
    runtimeDiagnostics.record({
      level: outcome === 'failed' ? 'error' : 'info', scope: 'task-recovery', event: 'cold-preflight-v7', outcome,
      durationMs: Math.max(0, Date.now() - input.startedAt), slowMs: 500, count: input.taskCount,
      details: {
        providers: Object.fromEntries(providers.map((provider) => [provider, enabled.includes(provider)])),
        sourceGenerations: input.sourceGenerations, sourceLaneGenerations: input.sourceLaneGenerations, taskCount: input.taskCount,
        ...(diagnostic ? { diagnostic } : {}),
        providerResults: Object.fromEntries(enabled.map((provider) => {
          const result = input.rows.find((row) => row.provider === provider)
          const projection = ['completed', 'failed'].includes(result?.projection) ? result.projection : 'not-run'
          const failure = safeDiagnostic(result?.diagnostic)
          return [provider, {
            health: health(provider), projection,
            empty: projection === 'completed' && health(provider) === 'ready'
              ? result.taskCount === 0 ? 'healthy-empty' : 'nonempty' : 'not-evaluated',
            ...(failure ? { diagnostic: failure } : {})
          }]
        }))
      }
    })
  }

  function inventoryFailure(error, reason, forceTasksOnly) {
    const details = errorDetails(error)
    const captured = error && typeof error === 'object' ? launchFailures.get(error) : null
    runtimeDiagnostics.record({
      level: 'error', scope: 'task-recovery', event: 'codex-inventory-membership',
      outcome: 'failed', code: 'provider-read-failed', cache: 'provider-direct',
      details: { reason, forceTasksOnly, ...details, launch: captured?.launch || null, search: captured?.search || [],
        modules: typeof dependencies.modules === 'function' ? dependencies.modules() : [] }
    })
  }

  function processEnd(reason, error, startupHint) {
    if (process.platform !== 'win32') return
    runtimeDiagnostics.record({
      level: 'info', scope: 'task-recovery', event: 'codex-process-end', outcome: 'exited',
      details: {
        ...errorDetails(error),
        nativeCode: nativeCodes.includes(reason?.code) ? reason.code : '',
        exitCode: Number.isInteger(reason?.exitCode) ? reason.exitCode : null,
        startupHint: startupHint === 'node-not-found' ? 'node-not-found' : ''
      }
    })
  }

  function startup(plan, outcome, error) {
    const attempt = {}
    captureLaunch(attempt, plan)
    const version = (value) => typeof value === 'string' && /^[\w.+-]{1,64}$/.test(value) ? value : ''
    runtimeDiagnostics.record({
      level: outcome === 'failed' ? 'error' : 'info', scope: 'task-recovery', event: 'codex-startup',
      outcome: ['spawn-requested', 'initialized', 'failed'].includes(outcome) ? outcome : 'unknown',
      details: { ...launchFailures.get(attempt), ...(error ? errorDetails(error) : {}), phase: 'startup',
        modules: typeof dependencies.modules === 'function' ? dependencies.modules() : [],
        host: { platform: ['win32', 'darwin', 'linux'].includes(process.platform) ? process.platform : 'unknown',
          node: version(process.versions?.node), electron: version(process.versions?.electron) } }
    })
  }

  async function request(method, params, timeoutMs) {
    let phase = 'startup'
    try {
      await startCodexServer()
      phase = 'thread-list'
      return await sendCodexRpc(method, params, timeoutMs)
    } catch (error) {
      const failure = captureFailure(error, { stage: 'app-server', category: 'request-failed' })
      if (method === 'thread/list') {
        try { failure.diagnosticPhase = phase } catch {}
      }
      throw failure
    }
  }

  return { errorResult, captureFailure, snapshotFailure, preflightRead, coldPreflight, captureLaunch, inventoryFailure, processEnd, startup, request }
}

module.exports = { createCodexRuntimeDiagnostics }
