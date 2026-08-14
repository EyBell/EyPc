'use strict'

/**
 * Discovers a macOS system proxy the spawned Codex process should inherit.
 *
 * This is a validation boundary, not a convenience. It shells out to `scutil`
 * and `curl`, then parses a PAC script that some other program wrote, and the
 * result becomes `HTTP_PROXY` for a child process — so every step is written
 * to refuse rather than to guess:
 *
 * - only on macOS, and only when the user has set no proxy of their own;
 * - only a PAC URL on loopback with a valid port;
 * - only a PAC body that is exactly one `return "…"` and nothing else, under a
 *   byte cap, whose single directive names a loopback host and valid port;
 * - `curl` runs with `--noproxy '*' --proto '=http'` and hard timeouts, so
 *   fetching the PAC cannot itself be redirected through a proxy or scheme.
 *
 * Anything else yields `{}` — inherit nothing. A proxy this module cannot fully
 * account for is one the child must not be pointed at.
 *
 * Standing alone means these refusals can be exercised directly: a non-loopback
 * PAC URL, an oversized body, a PAC with a second statement, an out-of-range
 * port. Under the entry those cases needed the whole preload sandbox.
 */

const CODEX_PROXY_DISCOVERY_REVISION = 'codex-proxy-discovery-v1'
/** Caps both the probe's stdout buffer and the PAC body accepted for parsing. */
const CODEX_PROXY_OUTPUT_LIMIT = 16 * 1024

function createCodexProxyDiscovery(dependencies = {}) {
  const execFile = dependencies.execFile || require('node:child_process').execFile
  const host = dependencies.process || process
  const setTimer = dependencies.setTimeout || setTimeout
  const clearTimer = dependencies.clearTimeout || clearTimeout

  /** The user's own proxy settings always win; never override an explicit one. */
  function codexHasExplicitProxyEnvironment(env) {
    const proxyKeys = new Set(['http_proxy', 'https_proxy', 'all_proxy'])
    return Object.entries(env || {}).some(([key, value]) => proxyKeys.has(key.toLowerCase()) && typeof value === 'string' && value.trim())
  }

  function codexScutilValue(output, key) {
    const prefix = `${key} :`
    const line = String(output || '').split(/\r?\n/).find((candidate) => candidate.trim().startsWith(prefix))
    return line ? line.trim().slice(prefix.length).trim() : ''
  }

  /** A PAC URL is usable only if it points at this machine. */
  function codexLoopbackPacUrl(value) {
    const match = String(value || '').trim().match(/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})(\/\S*)?$/i)
    if (!match) return ''
    const port = Number(match[2])
    return port > 0 && port <= 65_535 ? match[0] : ''
  }

  /**
   * Accepts only a PAC that is a single unconditional `return "…"`. A PAC with
   * real logic cannot be reduced to one env var, and guessing which branch
   * applies would silently route traffic somewhere the script did not say.
   */
  function codexStaticPacProxy(value) {
    const source = String(value || '').replace(/^\uFEFF/, '').trim()
    if (!source || Buffer.byteLength(source, 'utf8') > CODEX_PROXY_OUTPUT_LIMIT) return ''
    const match = source.match(/^function\s+FindProxyForURL\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*[A-Za-z_$][\w$]*\s*\)\s*\{\s*return\s+(["'])([^"'\\\r\n]*)\1\s*;\s*\}\s*;?$/i)
    if (!match) return ''
    const firstDirective = match[2].split(';').map((item) => item.trim()).filter(Boolean)[0] || ''
    const proxy = firstDirective.match(/^PROXY\s+(127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})$/i)
    if (!proxy) return ''
    const port = Number(proxy[2])
    if (port <= 0 || port > 65_535) return ''
    return `http://${proxy[1].toLowerCase()}:${port}`
  }

  /** Probes never reject: an unreadable probe is an absent answer, not an error. */
  function readCodexProbe(command, args, timeoutMs) {
    return new Promise((resolve) => {
      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimer(guard)
        resolve(value)
      }
      const guard = setTimer(() => finish(''), timeoutMs + 250)
      try {
        execFile(command, args, {
          encoding: 'utf8',
          maxBuffer: CODEX_PROXY_OUTPUT_LIMIT,
          timeout: timeoutMs,
          windowsHide: true
        }, (error, stdout) => finish(error ? '' : String(stdout || '')))
      } catch {
        finish('')
      }
    })
  }

  async function resolveCodexProxyEnvironment() {
    const inherited = host.env || {}
    if (host.platform !== 'darwin' || codexHasExplicitProxyEnvironment(inherited)) return {}
    const systemProxy = await readCodexProbe('/usr/sbin/scutil', ['--proxy'], 1_000)
    if (codexScutilValue(systemProxy, 'ProxyAutoConfigEnable') !== '1') return {}
    const pacUrl = codexLoopbackPacUrl(codexScutilValue(systemProxy, 'ProxyAutoConfigURLString'))
    if (!pacUrl) return {}
    const pac = await readCodexProbe('/usr/bin/curl', [
      '--fail',
      '--silent',
      '--show-error',
      '--noproxy',
      '*',
      '--proto',
      '=http',
      '--connect-timeout',
      '1',
      '--max-time',
      '2',
      pacUrl
    ], 2_500)
    const proxy = codexStaticPacProxy(pac)
    if (!proxy) return {}
    return {
      HTTP_PROXY: proxy,
      HTTPS_PROXY: proxy,
      http_proxy: proxy,
      https_proxy: proxy
    }
  }

  return {
    revision: CODEX_PROXY_DISCOVERY_REVISION,
    codexHasExplicitProxyEnvironment,
    codexScutilValue,
    codexLoopbackPacUrl,
    codexStaticPacProxy,
    readCodexProbe,
    resolveCodexProxyEnvironment
  }
}

module.exports = {
  CODEX_PROXY_DISCOVERY_REVISION,
  CODEX_PROXY_OUTPUT_LIMIT,
  createCodexProxyDiscovery
}
