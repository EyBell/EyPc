'use strict'

/**
 * Redaction for Action Runner log output.
 *
 * A privacy boundary, not formatting: everything an action writes to stdout or
 * stderr passes through here before it can cross the bridge, be shown, or be
 * persisted. It strips terminal control sequences, replaces the user's home and
 * any declared private paths, and redacts authorization headers, tokens,
 * passwords, API keys and credentials embedded in URLs.
 *
 * Extracted so it can be exercised against hostile input directly, without
 * standing up a runner, a window or a database.
 */

const CODEX_LOG_REDACTION_REVISION = 'codex-log-redaction-v1'

function createCodexLogRedaction(dependencies = {}) {
  const os = dependencies.os || require('node:os')

  function sanitizeCodexActionLogText(text, privatePaths = []) {
    let value = String(text || '')
      .replace(/\u001B\[[0-?]*[ -/]*[@-~]|\u001B[@-_]/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    const paths = [...new Set([os.homedir(), ...privatePaths].filter(Boolean))].sort((left, right) => right.length - left.length)
    for (const privatePath of paths) value = value.split(privatePath).join('<private-path>')
    return value
      .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s'"`]+/gi, '$1<redacted>')
      .replace(/((?:token|password|passwd|secret|api[_-]?key)\s*[:=]\s*)[^\s'"`]+/gi, '$1<redacted>')
      .replace(/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, '$1<redacted>@')
      .slice(0, 32 * 1024)
  }

  return { revision: CODEX_LOG_REDACTION_REVISION, sanitizeCodexActionLogText }
}

module.exports = {
  CODEX_LOG_REDACTION_REVISION,
  createCodexLogRedaction
}
