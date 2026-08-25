'use strict'

/**
 * Resolves paths rooted at `$CODEX_HOME` (or `~/.codex` when unset) and
 * validates that a rollout file a thread claims to own actually lives
 * inside them.
 *
 * `codexNativeStatePaths` locates the native global-state file and its
 * backup; `codexInventoryMembershipRoots` locates the two session
 * directories under it. `codexPathInside` is a plain containment check on
 * two resolved paths -- no filesystem contact of its own -- and
 * `codexThreadRolloutCandidate` uses it to reject a thread's claimed
 * rollout path if it has been symlinked outside the sessions root, then
 * confirms the target is a non-empty regular file before handing back a
 * stat the caller can read the tail of.
 *
 * `process`, `path`, `os` and `fs` are injected rather than reached for:
 * read from the global, `process` resolves to a different object inside a
 * vm sandbox than the one the entry sees.
 */

const CODEX_NATIVE_STATE_PATHS_REVISION = 'codex-native-state-paths-v1'

function createCodexNativeStatePaths(dependencies = {}) {
  const process = dependencies.process
  const path = dependencies.path
  const os = dependencies.os
  const fs = dependencies.fs
  if (!process || !path || !os || !fs) {
    throw new TypeError('codex native state paths requires process, path, os and fs')
  }

  function codexNativeStatePaths() {
    const codexHome = typeof process.env.CODEX_HOME === 'string' && process.env.CODEX_HOME.trim()
      ? path.resolve(process.env.CODEX_HOME)
      : path.join(os.homedir(), '.codex')
    const primary = path.join(codexHome, '.codex-global-state.json')
    return { codexHome, primary, backup: `${primary}.bak` }
  }

  function codexInventoryMembershipRoots() {
    const { codexHome } = codexNativeStatePaths()
    return [
      path.join(codexHome, 'sessions'),
      path.join(codexHome, 'archived_sessions')
    ]
  }

  function codexPathInside(root, candidate) {
    const relative = path.relative(root, candidate)
    return relative === '' || Boolean(relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  }

  function codexThreadRolloutCandidate(thread) {
    if (!thread || typeof thread.path !== 'string') return null
    const { codexHome } = codexNativeStatePaths()
    try {
      const sessionsRoot = fs.realpathSync(path.join(codexHome, 'sessions'))
      const candidate = fs.realpathSync(thread.path)
      if (!codexPathInside(sessionsRoot, candidate)) return null
      const stat = fs.statSync(candidate)
      if (!stat?.isFile?.() || !Number.isFinite(stat.size) || stat.size <= 0) return null
      return { candidate, stat }
    } catch {
      return null
    }
  }

  return {
    revision: CODEX_NATIVE_STATE_PATHS_REVISION,
    codexNativeStatePaths,
    codexInventoryMembershipRoots,
    codexPathInside,
    codexThreadRolloutCandidate
  }
}

module.exports = {
  CODEX_NATIVE_STATE_PATHS_REVISION,
  createCodexNativeStatePaths
}
