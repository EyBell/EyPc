'use strict'

/**
 * Environment Action authorization: what the renderer is allowed to run, and
 * whether this particular run was confirmed.
 *
 * Two mechanisms, one boundary. The renderer never supplies a command — it
 * supplies an id, and the host looks the command up in a vault it built itself
 * from the environment files it read. A confirm token then binds one execution
 * to a specific (target, environment, action, environment-file, command) tuple
 * for a bounded window, so a confirmation cannot be replayed against a
 * different action or against the same action after its command changed on
 * disk.
 *
 * Extracted for the same reason as command-validation.cjs: the value is the
 * boundary, not the line count. Standing alone, replay, expiry, cross-action
 * substitution and post-confirmation file edits can be exercised directly
 * without standing up the whole preload sandbox.
 *
 * `crypto` is injected on the node-runtime precedent — reading a global
 * resolves to a different object under a sandbox with identical source.
 */

const CODEX_ACTION_AUTHORIZATION_REVISION = 'codex-action-authorization-v1'
const CODEX_ENV_ACTION_CONFIRM_TTL_MS = 30_000

function createCodexActionAuthorization(dependencies = {}) {
  const crypto = dependencies.crypto || require('node:crypto')
  const now = dependencies.now || (() => Date.now())
  const confirmTtlMs = Number.isFinite(dependencies.confirmTtlMs)
    ? dependencies.confirmTtlMs
    : CODEX_ENV_ACTION_CONFIRM_TTL_MS

  const commandVault = new Map()
  const confirmTokens = new Map()

  // The host's own record of what each environment file declared. Rebuilt on
  // every listing, so a stale id cannot outlive the file that declared it.
  function rememberCodexEnvironmentCommands(vaultKey, environments) {
    const key = String(vaultKey || '')
    if (!key) return
    const map = new Map()
    for (const environment of environments) {
      const actionMap = new Map()
      for (const action of environment._hostActions || []) actionMap.set(action.id, action)
      map.set(environment.id, actionMap)
    }
    commandVault.set(key, map)
  }

  function findCodexEnvironmentCommand(targetId, environmentId, actionId) {
    return commandVault.get(targetId)?.get(environmentId)?.get(actionId)
  }

  function issueCodexEnvironmentConfirmToken(targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint) {
    const token = `cet_${crypto.randomBytes(12).toString('base64url')}`
    confirmTokens.set(token, {
      targetId,
      environmentId,
      actionId,
      environmentFileFingerprint,
      commandFingerprint,
      expiresAt: now() + confirmTtlMs
    })
    return token
  }

  // Single-use by construction: the entry is deleted before it is judged, so a
  // rejected token is spent too and cannot be retried against other tuples.
  function consumeCodexEnvironmentConfirmToken(token, targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint) {
    const entry = confirmTokens.get(token)
    confirmTokens.delete(token)
    if (!entry || entry.expiresAt <= now()) return false
    return (
      entry.targetId === targetId &&
      entry.environmentId === environmentId &&
      entry.actionId === actionId &&
      entry.environmentFileFingerprint === environmentFileFingerprint &&
      entry.commandFingerprint === commandFingerprint
    )
  }

  // Host shutdown: nothing survives the process that authorized it.
  function clearCodexActionAuthorization() {
    commandVault.clear()
    confirmTokens.clear()
  }

  return {
    revision: CODEX_ACTION_AUTHORIZATION_REVISION,
    confirmTtlMs,
    rememberCodexEnvironmentCommands,
    findCodexEnvironmentCommand,
    issueCodexEnvironmentConfirmToken,
    consumeCodexEnvironmentConfirmToken,
    clearCodexActionAuthorization
  }
}

module.exports = {
  CODEX_ACTION_AUTHORIZATION_REVISION,
  CODEX_ENV_ACTION_CONFIRM_TTL_MS,
  createCodexActionAuthorization
}
