'use strict'

/**
 * Allowlist for Codex Environment Action commands.
 *
 * This is the security boundary between a string a user typed into a project's
 * Environment configuration and a process the host will spawn. Nothing here
 * reaches the filesystem, the network or the host: the tokenizer refuses
 * anything with an unterminated quote or a newline, and the validator returns a
 * shape only for the exact command forms on the list. Everything else is
 * `null`, which the caller treats as "do not launch".
 *
 * It has no dependencies at all — no module bindings, no globals, not even a
 * Node builtin — which is why it was the second block extracted under RAW-169
 * and why it can be exercised directly.
 */

const CODEX_COMMAND_VALIDATION_REVISION = 'codex-command-validation-v1'

function tokenizeCodexEnvironmentActionCommandHost(command) {
  if (typeof command !== 'string' || !command.trim() || /[\r\n]/.test(command)) return null
  const result = []
  let current = ''
  let quote = null
  let escaped = false
  for (const ch of command) {
    if (escaped) {
      current += ch
      escaped = false
      continue
    }
    if (quote) {
      if (ch === '\\' && quote === '"') { escaped = true; continue }
      if (ch === quote) { quote = null; continue }
      current += ch
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '\\') { escaped = true; continue }
    if (/\s/.test(ch)) {
      if (current) { result.push(current); current = '' }
      continue
    }
    current += ch
  }
  if (quote || escaped) return null
  if (current) result.push(current)
  return result
}

function validateCodexEnvironmentActionCommandHost(command) {
  const argv = tokenizeCodexEnvironmentActionCommandHost(command)
  if (!argv) return null
  if (argv.length === 3 && ['pnpm', 'npm', 'yarn', 'bun'].includes(argv[0]) && argv[1] === 'run' && ['build', 'serve'].includes(argv[2])) {
    return {
      family: 'package-script',
      executable: argv[0],
      task: argv[2],
      argv: [argv[0], 'run', argv[2]],
      risk: argv[2] === 'serve' ? 'long-running' : 'normal'
    }
  }
  if (argv.length === 2 && argv[0] === 'vite' && ['build', 'serve'].includes(argv[1])) {
    return {
      family: 'vite',
      executable: 'vite',
      task: argv[1],
      argv: ['vite', argv[1]],
      risk: argv[1] === 'serve' ? 'long-running' : 'normal'
    }
  }
  if (argv.length === 2 && argv[0] === 'git' && argv[1] === 'push') {
    return { family: 'git-push', executable: 'git', task: 'push', argv: ['git', 'push'], risk: 'external-write' }
  }
  return null
}

module.exports = {
  CODEX_COMMAND_VALIDATION_REVISION,
  tokenizeCodexEnvironmentActionCommandHost,
  validateCodexEnvironmentActionCommandHost
}
