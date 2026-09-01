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
  // 2026-08-25 RAW-181: +124 lines / +3 codex functions / +4 mutable bindings
  // for the persisted side-relation recovery hints (storage wiring, restore
  // and the C2 inventory live candidate). Shape logic lives in
  // preload/codex/side-relation-hints.cjs; the entry keeps only wiring.
  // 2026-08-29 RAW-189: Plan lifecycle normalization/merge moved into the
  // bounded rollout-evidence owner while adding structural execution clear.
  // 2026-08-31: +46 lines / +1 mutable binding for rollout-file subagent
  // discovery wiring (`thread/list` omits subagent runs). Candidate walk,
  // thread/read verification and the mtime cache all live in
  // preload/codex/subagent-discovery.cjs; the entry keeps loader, one scan
  // injection and the session-state reset hook.
  // 2026-09-01: +8 lines for the machine-run unread guards at the two unread
  // evidence sites (a subagent/guardian child is never user-read; its desktop
  // unread entry must not pin the parent completed-unread). The predicate and
  // discovered-run memory live in subagent-discovery.cjs.
  // 2026-09-01 (b): +28 lines / +2 codex functions / +1 mutable binding for
  // the desktop-unread read-outcome transition diagnostic — the completed-
  // unread badge oscillated 1↔5↔25 and the silent per-scan catch around
  // readCodexDesktopUnreadIds left no timeline to correlate against.
  // 2026-09-01 (c): +27 lines / +1 codex function / +1 mutable binding for the
  // per-key root-unread evidence transition diagnostic in
  // companionCodexEvidenceV7 — the oscillation proved to be two evidence
  // builders publishing different root unread for the same tasks, and only
  // the payload difference at this point can name both sides.
  // 2026-09-01 (d): +6 lines — the tug-of-war's unread side was
  // codexDesktopAggregateUnread bubbling machine children's permanent desktop
  // unread entries into parents; the wrapper now filters them before
  // delegating to the aggregation module.
  lines: 14009,
  // Top-level `function` declarations whose name contains `odex` (case-sensitive
  // infix match, not a prefix: same-domain functions are commonly named by verb
  // first -- `activateCodexFloat`, `installCodexFloatIpc` -- and a prefix filter
  // silently undercounts them by more than half.
  codexFunctions: 276,
  // Module-level mutable state: top-level `let`/`var` plus top-level `const`
  // bindings holding a fresh `Map`/`Set`. These are the bindings a closure
  // rewrite has to either move or inject, so they measure coupling rather than
  // volume.
  mutableBindings: 152
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
