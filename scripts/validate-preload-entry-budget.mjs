import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Ratchets `preload/index.js` so the Codex entry can only shrink.
 *
 * RAW-169's sixteen extraction blocks moved 742 lines out of the entry, and
 * concurrent feature work put every one of them back plus 140 more -- the net
 * effect of "manual extraction, no gate" was zero. The same shape recurred
 * during the V7 merge, which pushed the entry up another 345 lines with nobody
 * noticing until a re-measurement. Extraction cannot outrun unguarded growth.
 *
 * The three numbers below are a strict ratchet, not a target. It fails in both
 * directions on purpose: growing past a budget requires editing this file, which
 * turns "the entry grew again" from an invisible drift into a visible decision;
 * dropping below one *also* fails, because a ceiling left above the floor is a
 * ratchet with no tension -- the next round of growth would be free up to the
 * stale number. Both messages name the exact value to write here, so the fix is
 * one edit either way.
 *
 * Deliberately not a proxy for quality: RAW-169's own accepted clause puts
 * responsibility boundaries above line counts, and module size is explicitly a
 * reference description rather than an acceptance criterion. This gate measures
 * only the one thing that regressed silently.
 */

const BUDGET = Object.freeze({
  // Total physical lines. Measured the same way `wc -l` counts them.
  lines: 13811,
  // Top-level `function` declarations whose name contains `odex` (case-sensitive
  // infix match, not a prefix: same-domain functions are commonly named by verb
  // first -- `activateCodexFloat`, `installCodexFloatIpc` -- and a prefix filter
  // silently undercounts them by more than half.
  codexFunctions: 271,
  // Module-level mutable state: top-level `let`/`var` plus top-level `const`
  // bindings holding a fresh `Map`/`Set`. These are the bindings a closure
  // rewrite has to either move or inject, so they measure coupling rather than
  // volume.
  mutableBindings: 147
})

const root = resolve(import.meta.dirname, '..')
const entryPath = resolve(root, 'preload/index.js')
const source = readFileSync(entryPath, 'utf8')

const measured = {
  lines: source.split('\n').length - (source.endsWith('\n') ? 1 : 0),
  codexFunctions: (source.match(/^(?:async )?function ([A-Za-z][A-Za-z0-9_]*)\s*\(/gm) || [])
    .filter((declaration) => declaration.includes('odex')).length,
  mutableBindings: (source.match(/^(?:let|var) [A-Za-z]/gm) || []).length
    + (source.match(/^const [A-Za-z][A-Za-z0-9_]* = new (?:Map|Set)\b/gm) || []).length
}

const labels = {
  lines: 'entry lines',
  codexFunctions: 'top-level codex functions',
  mutableBindings: 'module-level mutable bindings'
}

const errors = []
for (const key of Object.keys(BUDGET)) {
  if (measured[key] > BUDGET[key]) {
    errors.push(`${labels[key]}: ${measured[key]} exceeds the recorded budget ${BUDGET[key]}`
      + ` (+${measured[key] - BUDGET[key]}); extract before growing, or lower the budget deliberately`)
  } else if (measured[key] < BUDGET[key]) {
    errors.push(`${labels[key]}: ${measured[key]} is below the recorded budget ${BUDGET[key]}`
      + ` (-${BUDGET[key] - measured[key]}); lower the budget to ${measured[key]} so the ratchet keeps its tension`)
  }
}

process.stdout.write(`preload entry budget: ${measured.lines} lines, ${measured.codexFunctions} codex functions,`
  + ` ${measured.mutableBindings} mutable bindings\n`)

if (errors.length) {
  for (const error of errors) process.stderr.write(`error: ${error}\n`)
  process.stderr.write('preload entry budget validation failed\n')
  process.exit(1)
}

process.stdout.write('preload entry budget validation passed\n')
