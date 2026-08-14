'use strict'

/**
 * Resolves how to actually invoke a Codex CLI candidate.
 *
 * A path on disk is not yet a command. The same `codex` may be a native
 * binary, a `.cmd`/`.bat` shim wrapping a JS entry, or a JS entry needing a
 * node runtime — and the vendored platform binary, when present, beats all of
 * them because it needs no runtime at all. This module turns a candidate path
 * into the `{command, argsPrefix}` pair the spawn actually uses, plus the
 * `key` that identifies the resolution so callers can tell two candidates
 * apart when their paths differ but their resolution does not.
 *
 * Peer to node-runtime.cjs: that one finds a node, this one decides whether a
 * node is even needed.
 *
 * `process` and `fs` are injected on the node-runtime precedent — reading the
 * globals resolves to different objects under a sandbox with identical source,
 * and every branch here turns on `platform` or `arch`.
 */

const CODEX_LAUNCH_PLAN_REVISION = 'codex-launch-plan-v1'

function createCodexLaunchPlan(dependencies = {}) {
  const fs = dependencies.fs || require('node:fs')
  const path = dependencies.path || require('node:path')
  const host = dependencies.process || process

  /** Windows path semantics on Windows, POSIX everywhere else. */
  function codexPlatformPath() {
    return host.platform === 'win32' ? path.win32 : path
  }

  function existsSafe(candidate) {
    try { return fs.existsSync(candidate) } catch { return false }
  }

  /**
   * The vendored platform binary shipped inside the npm package. Preferred
   * whenever it exists: it removes the node runtime from the launch entirely.
   */
  function codexBundledBinary(jsEntry) {
    const platformPath = codexPlatformPath()
    const target = host.platform === 'win32'
      ? host.arch === 'arm64' ? ['codex-win32-arm64', 'aarch64-pc-windows-msvc', 'codex.exe'] : ['codex-win32-x64', 'x86_64-pc-windows-msvc', 'codex.exe']
      : host.platform === 'darwin'
        ? host.arch === 'x64' ? ['codex-darwin-x64', 'x86_64-apple-darwin', 'codex'] : ['codex-darwin-arm64', 'aarch64-apple-darwin', 'codex']
        : null
    if (!target || !jsEntry) return ''
    const packageRoot = platformPath.dirname(platformPath.dirname(jsEntry))
    const packageName = target[0]
    const vendorTail = ['vendor', target[1], 'bin', target[2]]
    const candidates = [
      platformPath.join(packageRoot, 'node_modules', '@openai', packageName, ...vendorTail),
      platformPath.join(platformPath.dirname(packageRoot), packageName, ...vendorTail),
      platformPath.join(packageRoot, ...vendorTail)
    ]
    return candidates.find(existsSafe) || ''
  }

  /** The JS entry behind a candidate, whether it is one already or a shim. */
  function codexJavascriptEntry(candidate, resolved) {
    const platformPath = codexPlatformPath()
    if (/\.[cm]?js$/i.test(resolved || '')) return resolved
    if (!/\.(?:cmd|bat)$/i.test(candidate || '')) return ''
    const npmEntry = platformPath.join(platformPath.dirname(candidate), 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
    return existsSafe(npmEntry) ? npmEntry : ''
  }

  /** A node capable of running that JS entry, nearest sibling first. */
  function codexNodeRuntime(candidate) {
    const platformPath = codexPlatformPath()
    const env = host.env || {}
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path')
    const pathValue = pathKey && typeof env[pathKey] === 'string' ? env[pathKey] : ''
    const candidates = [platformPath.join(platformPath.dirname(candidate), host.platform === 'win32' ? 'node.exe' : 'node')]
    if (host.platform === 'win32') {
      if (typeof env.NVM_SYMLINK === 'string') candidates.push(platformPath.join(env.NVM_SYMLINK, 'node.exe'))
      if (typeof env.VOLTA_HOME === 'string') candidates.push(platformPath.join(env.VOLTA_HOME, 'bin', 'node.exe'))
      if (typeof env.ProgramFiles === 'string') candidates.push(platformPath.join(env.ProgramFiles, 'nodejs', 'node.exe'))
    }
    for (const directory of pathValue.split(platformPath.delimiter).filter(Boolean)) {
      candidates.push(platformPath.join(directory, host.platform === 'win32' ? 'node.exe' : 'node'))
    }
    return candidates.find(existsSafe) || ''
  }

  /**
   * `invalid: true` means "this is a JS entry or shim we recognized but cannot
   * run" — distinct from an unresolved relative name, which is handed to the
   * OS path lookup unchanged and may still work.
   */
  function codexLaunchPlan(candidate, source = 'unknown', detected = false) {
    const platformPath = codexPlatformPath()
    const command = candidate || 'codex'
    const argsPrefix = []
    if (platformPath.isAbsolute(command)) {
      try {
        const resolved = fs.realpathSync(command)
        const jsEntry = codexJavascriptEntry(command, resolved)
        const bundledBinary = codexBundledBinary(jsEntry)
        if (bundledBinary) {
          return { command: bundledBinary, argsPrefix: [], key: bundledBinary, source, detected: true }
        }
        const nodeRuntime = codexNodeRuntime(command)
        if (jsEntry && nodeRuntime) {
          // NUL separates the two paths because it is the one byte neither can
          // contain, so the key cannot collide across different pairs.
          return { command: nodeRuntime, argsPrefix: [jsEntry], key: `${nodeRuntime}\u0000${jsEntry}`, source, detected: true }
        }
        if (jsEntry || /\.(?:cmd|bat)$/i.test(command)) {
          return { command, argsPrefix: [], key: command, source, detected: false, invalid: true }
        }
      } catch {}
    }
    return { command, argsPrefix, key: command, source, detected }
  }

  return {
    revision: CODEX_LAUNCH_PLAN_REVISION,
    codexPlatformPath,
    codexBundledBinary,
    codexJavascriptEntry,
    codexNodeRuntime,
    codexLaunchPlan
  }
}

module.exports = {
  CODEX_LAUNCH_PLAN_REVISION,
  createCodexLaunchPlan
}
