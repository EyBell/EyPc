'use strict'

/**
 * The manual "Codex CLI location" preference and the automatic candidate
 * search that runs when no manual path is set: platform-specific volta/nvm/
 * homebrew/PATH locations, deduplicated into a launch plan and a candidate
 * list the UI can render.
 *
 * `platformPath` is injected on the launch-plan.cjs precedent (it decides
 * absolute-path semantics, which differ by platform). `fs`/`os`/`process`
 * are injected on the node-runtime precedent. `utools` is injected on the
 * run-database precedent: reading `globalThis.utools` directly resolves to a
 * different object under the vm sandbox than under this module's own
 * require-time realm. `storageKey` is injected rather than duplicated
 * because the entry's own `writeCodexLaunchPathPreference` (paired write
 * path, not extracted — it shares no other logic with this read path) must
 * use the exact same key.
 */

const CODEX_LAUNCH_PATH_PREFERENCE_REVISION = 'codex-launch-path-preference-v1'
const CODEX_LAUNCH_SOURCE_LABELS = {
  manual: '手动指定的位置',
  configured: '环境变量指定位置',
  volta: 'Volta 默认位置',
  'npm-global': 'npm 全局目录',
  local: '用户目录默认位置',
  homebrew: 'Homebrew 默认位置',
  nvm: 'NVM 版本目录',
  path: '系统 PATH',
  unknown: '未识别位置'
}

function createCodexLaunchPathPreference(dependencies = {}) {
  const platformPath = dependencies.platformPath
  const launchPlan = dependencies.launchPlan
  const storageKey = dependencies.storageKey
  if (typeof platformPath !== 'function' || typeof launchPlan !== 'function' || typeof storageKey !== 'string' || !storageKey) {
    throw new TypeError('codex launch path preference requires platformPath, launchPlan and storageKey')
  }
  const fs = dependencies.fs || require('node:fs')
  const os = dependencies.os || require('node:os')
  const host = dependencies.process || process
  const utools = dependencies.utools || (typeof globalThis !== 'undefined' ? globalThis.utools : null)

  function normalizeCodexLaunchPathPreference(value) {
    const candidate = typeof value === 'string' ? value.trim() : ''
    if (!candidate || candidate.length > 4096 || candidate.includes('\u0000')) return ''
    const platform = platformPath()
    if (!platform.isAbsolute(candidate)) return ''
    return platform.normalize(candidate)
  }

  function readCodexLaunchPathPreference() {
    try {
      if (!utools || !utools.dbStorage) return ''
      const saved = utools.dbStorage.getItem(storageKey)
      const value = saved && typeof saved === 'object' ? saved.path : saved
      return normalizeCodexLaunchPathPreference(value)
    } catch {
      return ''
    }
  }

  function codexLaunchPathIsFile(pathValue) {
    try { return fs.statSync(pathValue).isFile() } catch { return false }
  }

  function codexLaunchCandidate(source, state) {
    return {
      source,
      label: CODEX_LAUNCH_SOURCE_LABELS[source] || CODEX_LAUNCH_SOURCE_LABELS.unknown,
      state
    }
  }

  function codexLaunchResult(plan, launchMode, manualLaunchPathState, launchCandidates) {
    return {
      ...plan,
      launchMode,
      manualLaunchPathState,
      launchCandidates: launchCandidates.slice(0, 8)
    }
  }

  function resolveCodexLaunchPlan() {
    const platform = platformPath()
    const candidates = []
    const launchSearch = []
    const inspectCandidate = (candidate, source) => {
      let counts = launchSearch.find((entry) => entry.source === source)
      if (!counts) {
        counts = { source, checked: 0, missing: 0, inaccessible: 0, nonFile: 0, nonExecutable: 0,
          available: 0, unusable: 0, relative: 0, unverified: 0, failed: 0,
          native: 0, javascript: 0, shim: 0, nodeMissing: 0, entryMissing: 0, inspectionFailed: 0, nativeCode: '' }
        launchSearch.push(counts)
      }
      counts.checked += 1
      if (!candidate || !platform.isAbsolute(candidate)) { counts.relative += 1; return counts }
      if (typeof fs.statSync !== 'function') { counts.unverified += 1; return counts }
      try {
        if (!fs.statSync(candidate).isFile()) counts.nonFile += 1
        else if (host.platform !== 'win32' && typeof fs.accessSync === 'function' && fs.constants?.X_OK != null) {
          try { fs.accessSync(candidate, fs.constants.X_OK) } catch (error) {
            if (['EACCES', 'EPERM'].includes(error?.code)) { counts.nonExecutable += 1; counts.nativeCode = error.code }
            else throw error
          }
        }
      } catch (error) {
        if (['ENOENT', 'ENOTDIR'].includes(error?.code)) counts.missing += 1
        else if (['EACCES', 'EPERM'].includes(error?.code)) counts.inaccessible += 1
        else counts.failed += 1
        counts.nativeCode = ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'EINVAL', 'ELOOP'].includes(error?.code) ? error.code : 'OTHER'
      }
      return counts
    }
    const recordPlan = (counts, plan) => {
      counts[plan.detected ? 'available' : 'unusable'] += 1
      if (!plan.detected) counts.nonExecutable += 1
      const diagnostic = plan.launchDiagnostic || {}
      if (['native', 'javascript', 'shim'].includes(diagnostic.kind)) counts[diagnostic.kind] += 1
      const reason = { 'node-missing': 'nodeMissing', 'entry-missing': 'entryMissing', 'inspection-failed': 'inspectionFailed' }[diagnostic.resolution]
      if (reason) counts[reason] += 1
    }
    const result = (plan, mode, manualState, found) => ({
      ...codexLaunchResult(plan, mode, manualState, found), launchSearch
    })
    const env = host.env || {}
    const manualPath = readCodexLaunchPathPreference()
    if (manualPath) {
      const counts = inspectCandidate(manualPath, 'manual')
      const exists = codexLaunchPathIsFile(manualPath)
      const plan = exists
        ? launchPlan(manualPath, 'manual', true)
        : { ...launchPlan(manualPath, 'manual', false), invalid: true }
      if (exists) recordPlan(counts, plan)
      else counts.unusable += 1
      return result(
        plan,
        'manual',
        plan.detected ? 'valid' : 'invalid',
        [codexLaunchCandidate('manual', plan.detected ? 'available' : 'unusable')]
      )
    }
    if (typeof env.CODEX_CLI_PATH === 'string' && env.CODEX_CLI_PATH.trim()) candidates.push({ path: env.CODEX_CLI_PATH.trim(), source: 'configured' })
    const home = os.homedir()
    if (host.platform === 'win32') {
      const appData = typeof env.APPDATA === 'string' ? env.APPDATA : platform.join(home, 'AppData', 'Roaming')
      const localAppData = typeof env.LOCALAPPDATA === 'string' ? env.LOCALAPPDATA : platform.join(home, 'AppData', 'Local')
      const voltaHomes = [...new Set([
        typeof env.VOLTA_HOME === 'string' && env.VOLTA_HOME.trim() ? env.VOLTA_HOME.trim() : '',
        platform.join(localAppData, 'Volta'),
        platform.join(home, '.volta')
      ].filter(Boolean))]
      candidates.push(
        { path: platform.join(appData, 'npm', 'codex.cmd'), source: 'npm-global' },
        ...voltaHomes.flatMap((voltaHome) => [
          { path: platform.join(voltaHome, 'bin', 'codex.exe'), source: 'volta' },
          { path: platform.join(voltaHome, 'bin', 'codex.cmd'), source: 'volta' }
        ]),
        ...(typeof env.NVM_SYMLINK === 'string' ? [{ path: platform.join(env.NVM_SYMLINK, 'codex.cmd'), source: 'nvm' }] : []),
        { path: platform.join(home, '.codex', 'bin', 'codex.exe'), source: 'local' },
        { path: platform.join(home, '.local', 'bin', 'codex.exe'), source: 'local' },
        { path: platform.join(localAppData, 'Programs', 'Codex', 'codex.exe'), source: 'local' }
      )
    } else {
      candidates.push(
        { path: platform.join(home, '.volta', 'bin', 'codex'), source: 'volta' },
        { path: platform.join(home, '.local', 'bin', 'codex'), source: 'local' },
        { path: '/opt/homebrew/bin/codex', source: 'homebrew' },
        { path: '/usr/local/bin/codex', source: 'homebrew' }
      )
      try {
        const nvmRoot = platform.join(home, '.nvm', 'versions', 'node')
        const versions = fs.readdirSync(nvmRoot, { withFileTypes: true })
          .filter((entry) => entry && typeof entry.isDirectory === 'function' && entry.isDirectory())
          .map((entry) => entry.name)
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        for (const version of versions) candidates.push({ path: platform.join(nvmRoot, version, 'bin', 'codex'), source: 'nvm' })
      } catch (error) {
        const counts = { source: 'nvm', checked: 0, failed: 1, nativeCode: 'OTHER' }
        if (['ENOENT', 'ENOTDIR'].includes(error?.code)) { counts.failed = 0; counts.missing = 1 }
        if (['EACCES', 'EPERM'].includes(error?.code)) { counts.failed = 0; counts.inaccessible = 1 }
        if (['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'EINVAL', 'ELOOP'].includes(error?.code)) counts.nativeCode = error.code
        launchSearch.push(counts)
      }
    }
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path')
    const pathValue = pathKey && typeof env[pathKey] === 'string' ? env[pathKey] : ''
    const executableNames = host.platform === 'win32' ? ['codex.exe', 'codex.cmd', 'codex.bat'] : ['codex']
    for (const directory of pathValue.split(platform.delimiter).filter(Boolean)) {
      for (const executable of executableNames) candidates.push({ path: platform.join(directory, executable), source: 'path' })
    }
    let detectedPlan = null
    let invalidPlan = null
    const launchCandidates = []
    const recordCandidate = (source, state) => {
      if (!launchCandidates.some((candidate) => candidate.source === source && candidate.state === state)) {
        launchCandidates.push(codexLaunchCandidate(source, state))
      }
    }
    for (const candidate of candidates) {
      const counts = inspectCandidate(candidate.path, candidate.source)
      if (!candidate.path || !platform.isAbsolute(candidate.path)) continue
      try {
        if (fs.existsSync(candidate.path)) {
          const plan = launchPlan(candidate.path, candidate.source, true)
          recordPlan(counts, plan)
          recordCandidate(candidate.source, plan.detected ? 'available' : 'unusable')
          if (plan.detected && !detectedPlan) detectedPlan = plan
          if (!invalidPlan) invalidPlan = plan
        }
      } catch (error) {
        counts.failed += 1
        counts.nativeCode = ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'EINVAL', 'ELOOP'].includes(error?.code) ? error.code : 'OTHER'
      }
    }
    return result(
      detectedPlan || invalidPlan || launchPlan('codex', 'unknown', false),
      'automatic',
      'not-configured',
      launchCandidates
    )
  }

  return {
    revision: CODEX_LAUNCH_PATH_PREFERENCE_REVISION,
    normalizeCodexLaunchPathPreference,
    readCodexLaunchPathPreference,
    codexLaunchPathIsFile,
    codexLaunchCandidate,
    codexLaunchResult,
    resolveCodexLaunchPlan
  }
}

module.exports = {
  CODEX_LAUNCH_PATH_PREFERENCE_REVISION,
  CODEX_LAUNCH_SOURCE_LABELS,
  createCodexLaunchPathPreference
}
