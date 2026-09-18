'use strict'

/**
 * Global harness title abbreviations. CodexHost was the first consumer, not
 * the owner. Orca, Paseo and later hosts reuse this table; do not fork it.
 *
 * cc=Claude Code, cx=Codex, gr=Grok, ds=DeepSeek Harness, pi=Pi,
 * op=Oh My Pi/OMP, cs=Cursor, dv=Devin. Unknown ids keep their raw token.
 * Orca agentIdentity uses `claude`; CodexHost extra processes use `claude-code`.
 */

const HARNESS_LABELS = Object.freeze({
  'claude-code': 'cc',
  claude: 'cc',
  codex: 'cx',
  pi: 'pi',
  grok: 'gr',
  omp: 'op',
  dsh: 'ds',
  cursor: 'cs',
  devin: 'dv'
})

function harnessLabel(harnessId) {
  const id = typeof harnessId === 'string' ? harnessId.trim().toLowerCase() : ''
  if (!id) return ''
  return HARNESS_LABELS[id] || id
}

module.exports = {
  HARNESS_LABELS,
  harnessLabel
}
