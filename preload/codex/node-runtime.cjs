'use strict'

/**
 * Node runtime discovery for Codex Environment Actions.
 *
 * First extraction out of the main preload under RAW-169. The domain boundary
 * was measured rather than guessed: these eleven functions call nothing outside
 * themselves, and the discovery cache they share is referenced from nowhere
 * else in the entry, so the whole set moves without leaving a shared binding
 * behind. Everything they need from the host is a Node builtin.
 *
 * Function names are carried over verbatim so the move stays diff-comparable
 * against the original; renaming is a separate step with its own verification.
 */

const CODEX_NODE_RUNTIME_REVISION = 'codex-node-runtime-v1'

function createCodexNodeRuntime(dependencies = {}) {
  const fs = dependencies.fs || require('node:fs')
  const path = dependencies.path || require('node:path')
  const os = dependencies.os || require('node:os')
  const crypto = dependencies.crypto || require('node:crypto')
  // The host process is a dependency like any other. Reading the global here
  // would silently rebind the platform, arch, env and execPath these helpers
  // branch on — identical source, different environment, which a verbatim
  // diff of the move cannot catch.
  const host = dependencies.process || process

  // Owned outright: the entry referenced this cache only from the discovery
  // function below, so it belongs to this module rather than to module scope.
  let codexNodeRuntimeDiscoveryCache = { expiresAt: 0, candidates: [] }

  function codexActionUsableFile(candidate) {
    try {
      if (!path.isAbsolute(candidate) || !fs.statSync(candidate).isFile()) return ''
      return fs.realpathSync(candidate)
    } catch { return '' }
  }

  function codexActionProbeNodeVersion(candidate) {
    const command = codexActionUsableFile(candidate)
    if (!command) return ''
    try {
      const { execFileSync } = require('node:child_process')
      if (typeof execFileSync !== 'function') return ''
      const output = String(execFileSync(command, ['--version'], {
        encoding: 'utf8',
        timeout: 1_500,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      }) || '').trim()
      return /^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(output) ? output : ''
    } catch { return '' }
  }

  function codexActionSemverParts(version) {
    const match = String(version || '').match(/^v?(\d+)\.(\d+)\.(\d+)/)
    return match ? match.slice(1, 4).map(Number) : [0, 0, 0]
  }

  function codexActionCompareNodeCandidates(left, right) {
    const leftParts = codexActionSemverParts(left.version)
    const rightParts = codexActionSemverParts(right.version)
    for (let index = 0; index < 3; index += 1) {
      if (leftParts[index] !== rightParts[index]) return rightParts[index] - leftParts[index]
    }
    return left.id.localeCompare(right.id)
  }

  function codexActionNvmRoots() {
    if (host.platform !== 'darwin') return []
    const home = os.homedir()
    const xdg = typeof host.env.XDG_CONFIG_HOME === 'string' && path.isAbsolute(host.env.XDG_CONFIG_HOME)
      ? path.join(host.env.XDG_CONFIG_HOME, 'nvm')
      : ''
    const candidates = [
      typeof host.env.NVM_DIR === 'string' && path.isAbsolute(host.env.NVM_DIR) ? host.env.NVM_DIR : '',
      xdg,
      path.join(home, '.nvm')
    ]
    const roots = []
    const seen = new Set()
    for (const candidate of candidates) {
      if (!candidate) continue
      try {
        const real = fs.realpathSync(candidate)
        if (!fs.statSync(real).isDirectory() || seen.has(real)) continue
        seen.add(real)
        roots.push(real)
      } catch {}
    }
    return roots
  }

  function codexActionNodeRuntimeCandidates(force = false) {
    const now = Date.now()
    if (!force && codexNodeRuntimeDiscoveryCache.expiresAt > now) return codexNodeRuntimeDiscoveryCache.candidates
    const candidates = []
    const seenPaths = new Set()
    for (const root of codexActionNvmRoots()) {
      const versionRoot = path.join(root, 'versions', 'node')
      let entries = []
      try { entries = fs.readdirSync(versionRoot, { withFileTypes: true }) } catch {}
      for (const entry of entries) {
        if (!entry?.isDirectory?.() || !/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(entry.name)) continue
        const requestedPath = path.join(versionRoot, entry.name, 'bin', host.platform === 'win32' ? 'node.exe' : 'node')
        const nodePath = codexActionUsableFile(requestedPath)
        if (!nodePath || seenPaths.has(nodePath)) continue
        const version = codexActionProbeNodeVersion(nodePath)
        if (!version) continue
        if (candidates.some((candidate) => candidate.id === `nvm:${version}`)) continue
        seenPaths.add(nodePath)
        candidates.push({
          id: `nvm:${version}`,
          label: `Node ${version} · NVM`,
          version,
          source: 'nvm',
          nodePath,
          binDir: path.dirname(requestedPath),
          nvmRoot: root
        })
      }
    }
    candidates.sort(codexActionCompareNodeCandidates)
    const systemPaths = host.platform === 'darwin'
      ? [
          host.arch === 'arm64' ? '/opt/homebrew/bin/node' : '/usr/local/bin/node',
          host.arch === 'arm64' ? '/usr/local/bin/node' : '/opt/homebrew/bin/node',
          '/usr/bin/node',
          path.basename(host.execPath || '') === 'node' ? host.execPath : ''
        ]
      : host.platform === 'win32'
        ? [path.join(host.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe')]
        : ['/usr/local/bin/node', '/usr/bin/node', path.basename(host.execPath || '') === 'node' ? host.execPath : '']
    for (const requestedPath of systemPaths) {
      if (!requestedPath) continue
      const nodePath = codexActionUsableFile(requestedPath)
      if (!nodePath || seenPaths.has(nodePath)) continue
      const version = codexActionProbeNodeVersion(nodePath)
      if (!version) continue
      seenPaths.add(nodePath)
      const id = `system:${crypto.createHash('sha256').update(nodePath).digest('hex').slice(0, 12)}`
      candidates.push({ id, label: `Node ${version} · 系统`, version, source: 'system', nodePath, binDir: path.dirname(requestedPath), nvmRoot: '' })
    }
    codexNodeRuntimeDiscoveryCache = { expiresAt: now + 5_000, candidates }
    return candidates
  }

  function codexActionReadVersionToken(filePath, nvmrc = false) {
    let text = ''
    try {
      if (!fs.statSync(filePath).isFile()) return { present: true, token: '', invalid: true }
    } catch (error) {
      return error && typeof error === 'object' && error.code === 'ENOENT'
        ? { present: false, token: '' }
        : { present: true, token: '', invalid: true }
    }
    try { text = fs.readFileSync(filePath, 'utf8') } catch { return { present: true, token: '', invalid: true } }
    if (text.length > 4_096) return { present: true, token: '', invalid: true }
    const values = []
    for (const sourceLine of text.split(/\r?\n/)) {
      const line = (nvmrc ? sourceLine.replace(/#.*/, '') : sourceLine).trim()
      if (!line || nvmrc && /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line)) continue
      values.push(line)
    }
    const token = values.length === 1 ? values[0] : ''
    const invalid = !token || /\s|[\\`;$|&<>]/.test(token) || token.startsWith('/') || token.includes('..') || token.length > 80
    return { present: true, token: invalid ? '' : token, invalid }
  }

  function codexActionProjectNodeHint(projectRoot) {
    const nvmrc = codexActionReadVersionToken(path.join(projectRoot, '.nvmrc'), true)
    if (nvmrc.present) return { ...nvmrc, source: '.nvmrc' }
    const nodeVersion = codexActionReadVersionToken(path.join(projectRoot, '.node-version'), false)
    return nodeVersion.present ? { ...nodeVersion, source: '.node-version' } : { present: false, token: '', source: '' }
  }

  function codexActionReadNvmAlias(root, token) {
    const normalized = String(token || '').replace(/^v/, '')
    if (!normalized || !/^[A-Za-z0-9*._/-]+$/.test(normalized) || normalized.includes('..')) return ''
    const aliasRoot = path.join(root, 'alias')
    const aliasPath = path.resolve(aliasRoot, ...normalized.split('/'))
    const relative = path.relative(aliasRoot, aliasPath)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return ''
    const value = codexActionReadVersionToken(aliasPath, true)
    return value.present && !value.invalid ? value.token : ''
  }

  function codexActionResolveNodeToken(token, candidates, roots, depth = 0) {
    if (depth > 8) return null
    const normalized = String(token || '').trim().toLowerCase().replace(/^v(?=\d)/, '')
    const nvmCandidates = candidates.filter((candidate) => candidate.source === 'nvm')
    if (!normalized) return null
    if (normalized === 'node' || normalized === 'stable' || normalized === 'current') return nvmCandidates[0] || null
    if (normalized === 'lts/*') {
      for (const root of roots) {
        const value = codexActionReadNvmAlias(root, 'lts/*')
        if (value) return codexActionResolveNodeToken(value, candidates, roots, depth + 1)
      }
      return null
    }
    if (/^\d+(?:\.\d+){0,2}$/.test(normalized)) {
      const prefix = normalized.split('.')
      return nvmCandidates.find((candidate) => {
        const actual = candidate.version.replace(/^v/, '').split(/[.-]/).slice(0, prefix.length)
        return actual.join('.') === prefix.join('.')
      }) || null
    }
    for (const root of roots) {
      const alias = codexActionReadNvmAlias(root, normalized)
      if (!alias || alias.toLowerCase() === normalized) continue
      const candidate = codexActionResolveNodeToken(alias, candidates, roots, depth + 1)
      if (candidate) return candidate
    }
    return null
  }

  function codexActionPackageManagerEntry(runtime, name) {
    if (!runtime) return ''
    const prefix = path.resolve(runtime.binDir, '..')
    const direct = codexActionUsableFile(path.join(runtime.binDir, host.platform === 'win32' ? `${name}.cmd` : name))
    if (direct && /\.(?:c?js|mjs)$/i.test(direct)) return direct
    const byName = {
      npm: [path.join(prefix, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.join(prefix, 'node_modules', 'npm', 'bin', 'npm-cli.js')],
      pnpm: [path.join(prefix, 'lib', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'), path.join(prefix, 'lib', 'node_modules', 'pnpm', 'bin', 'pnpm.js')],
      yarn: [path.join(prefix, 'lib', 'node_modules', 'yarn', 'bin', 'yarn.js')]
    }
    if (runtime.source === 'system') {
      byName.pnpm.push('/opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs', '/usr/local/lib/node_modules/pnpm/bin/pnpm.cjs')
      byName.yarn.push('/opt/homebrew/lib/node_modules/yarn/bin/yarn.js', '/usr/local/lib/node_modules/yarn/bin/yarn.js')
    }
    return (byName[name] || []).map(codexActionUsableFile).find(Boolean) || ''
  }

  return {
    revision: CODEX_NODE_RUNTIME_REVISION,
    usableFile: codexActionUsableFile,
    probeNodeVersion: codexActionProbeNodeVersion,
    semverParts: codexActionSemverParts,
    compareNodeCandidates: codexActionCompareNodeCandidates,
    nvmRoots: codexActionNvmRoots,
    nodeRuntimeCandidates: codexActionNodeRuntimeCandidates,
    readVersionToken: codexActionReadVersionToken,
    projectNodeHint: codexActionProjectNodeHint,
    readNvmAlias: codexActionReadNvmAlias,
    resolveNodeToken: codexActionResolveNodeToken,
    packageManagerEntry: codexActionPackageManagerEntry
  }
}

module.exports = {
  CODEX_NODE_RUNTIME_REVISION,
  createCodexNodeRuntime
}
