'use strict'

/**
 * Resolves which Node runtime an Environment Action's `vite`/`npm`/`pnpm`/
 * `yarn` command should launch with, and projects the decision into a
 * UI-safe shape: manual selection first, then a project-declared version
 * hint (`.nvmrc`/`package.json engines`), then the nvm default alias,
 * falling back to any nvm or system candidate.
 *
 * All six collaborators are injected as function references rather than
 * reimplemented: `nodeRuntimeCandidates`/`nvmRoots`/`projectNodeHint`/
 * `resolveNodeToken`/`readNvmAlias` are already the entry's delegate stubs
 * for `node-runtime.cjs`, and `runtimePreference` reads
 * `codexActionRunnerPreference`, a binding this module must never take on.
 * Composing already-extracted functions here, not reimplementing them, is
 * the same "hot primitives don't migrate" discipline used throughout.
 */

const CODEX_ACTION_RUNTIME_PROJECTION_REVISION = 'codex-action-runtime-projection-v1'

function createCodexActionRuntimeProjection(dependencies = {}) {
  const nodeRuntimeCandidates = dependencies.nodeRuntimeCandidates
  const nvmRoots = dependencies.nvmRoots
  const runtimePreference = dependencies.runtimePreference
  const projectNodeHint = dependencies.projectNodeHint
  const resolveNodeToken = dependencies.resolveNodeToken
  const readNvmAlias = dependencies.readNvmAlias
  if (typeof nodeRuntimeCandidates !== 'function' || typeof nvmRoots !== 'function' || typeof runtimePreference !== 'function'
    || typeof projectNodeHint !== 'function' || typeof resolveNodeToken !== 'function' || typeof readNvmAlias !== 'function') {
    throw new TypeError('codex action runtime projection requires nodeRuntimeCandidates, nvmRoots, runtimePreference, projectNodeHint, resolveNodeToken and readNvmAlias')
  }

  function codexActionRuntimeProjection(projectKey, projectRoot, force = false) {
    const candidates = nodeRuntimeCandidates(force)
    const roots = nvmRoots()
    const preference = runtimePreference(projectKey)
    const publicCandidates = candidates.map((candidate) => ({ id: candidate.id, label: candidate.label, version: candidate.version, source: candidate.source }))
    let resolved = null
    let state = 'ready'
    let message = ''
    let hintSource = ''
    if (preference.mode === 'manual') {
      resolved = candidates.find((candidate) => candidate.id === preference.candidateId) || null
      if (!resolved) {
        state = 'unavailable'
        message = '手动选择的 Node 已不可用，请重新选择'
      }
    } else {
      const hint = projectNodeHint(projectRoot)
      if (hint.present) {
        hintSource = hint.source
        resolved = hint.invalid ? null : resolveNodeToken(hint.token, candidates, roots)
        if (!resolved) {
          state = 'invalid-project-version'
          message = `${hint.source} 指定的 Node 未安装或格式无效`
        }
      } else {
        for (const root of roots) {
          const defaultAlias = readNvmAlias(root, 'default')
          if (!defaultAlias) continue
          resolved = resolveNodeToken(defaultAlias, candidates, roots)
          if (resolved) break
        }
        resolved ||= candidates.find((candidate) => candidate.source === 'nvm') || candidates.find((candidate) => candidate.source === 'system') || null
        if (!resolved) {
          state = 'unavailable'
          message = '未检测到可用的 NVM 或系统 Node'
        }
      }
    }
    return {
      preference,
      resolved,
      public: {
        mode: preference.mode,
        state,
        selectedCandidateId: preference.candidateId || undefined,
        resolvedCandidateId: resolved?.id,
        label: resolved?.label,
        version: resolved?.version,
        source: resolved?.source,
        hintSource: hintSource || undefined,
        candidates: publicCandidates,
        message: message || undefined
      }
    }
  }

  return {
    revision: CODEX_ACTION_RUNTIME_PROJECTION_REVISION,
    codexActionRuntimeProjection
  }
}

module.exports = {
  CODEX_ACTION_RUNTIME_PROJECTION_REVISION,
  createCodexActionRuntimeProjection
}
