'use strict'

function createCodexRuntimeDiagnostics(dependencies) {
  const { runtimeDiagnostics, startCodexServer, sendCodexRpc, process } = dependencies
  const errorNames = ['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError']
  const nativeCodes = ['ENOENT', 'EACCES', 'EPERM', 'EINVAL', 'ENOTDIR', 'ELOOP', 'ENOEXEC', 'OTHER']
  const sources = ['manual', 'configured', 'volta', 'npm-global', 'local', 'homebrew', 'nvm', 'path', 'unknown']
  const launchFailures = new WeakMap()

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
    const sourceCode = error && typeof error === 'object' ? String(error.code || '') : ''
    const code = sourceCode === 'ETIMEDOUT' || sourceCode === 'timeout'
      ? 'timeout'
      : ['not-authenticated', 'runtime-unavailable', 'process-exited', 'protocol-error'].includes(sourceCode)
        ? sourceCode : 'unavailable'
    const messages = {
      timeout: 'Codex App Server 响应超时',
      'not-authenticated': 'Codex 尚未登录或登录已失效',
      'runtime-unavailable': 'Codex CLI 启动失败，请检查本机 Node/Codex 安装',
      'process-exited': 'Codex App Server 已退出',
      'protocol-error': 'Codex App Server 返回了不兼容的数据',
      unavailable: '未找到可用的 Codex CLI'
    }
    return { ok: false, error: { code, message: messages[code] }, receivedAt: Date.now() }
  }

  function errorDetails(error) {
    return {
      failure: errorResult(error).error.code,
      errorName: errorNames.includes(error?.name) ? error.name : 'Error',
      nativeCode: nativeCodes.includes(error?.code) ? error.code : '',
      phase: ['startup', 'thread-list'].includes(error?.diagnosticPhase) ? error.diagnosticPhase : 'inventory',
      rpcCode: Number.isInteger(error?.rpcCode) ? error.rpcCode : null
    }
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

  async function request(method, params, timeoutMs) {
    let phase = 'startup'
    try {
      await startCodexServer()
      phase = 'thread-list'
      return await sendCodexRpc(method, params, timeoutMs)
    } catch (error) {
      if (method === 'thread/list' && error && typeof error === 'object') {
        try { error.diagnosticPhase = phase } catch {}
      }
      throw error
    }
  }

  return { errorResult, captureLaunch, inventoryFailure, processEnd, request }
}

module.exports = { createCodexRuntimeDiagnostics }
