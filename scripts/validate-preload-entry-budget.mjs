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
  // 2026-09-01 (e): +47 lines / +1 mutable binding for the CodexHost lane
  // wiring — loader, scan row/turn injection, official-only turn-read split,
  // membership guard and session reset. Rendezvous discovery, CLI transport,
  // normalization, TTL cache and the external-id/key sets all live in
  // preload/codex/codexhost-discovery.cjs.
  // 2026-09-01 (f): +5 lines — external conversations keep unread inside the
  // Host (absent from every bucket of the official unread atom), so sanitize
  // answers "unknown" for them instead of claiming read.
  // 2026-09-01 (g): +4 lines — consume the Host-exposed `hasUnreadTurn`
  // (codexhost add-external-thread-unread) for external rows, unknown when
  // the field is absent (older Hosts).
  // 2026-09-01 (h): +4 lines — the root-unread-evidence diagnostic also
  // carries localPin/persistedPinCount, the evidence half of pin-flash
  // forensics (the kernel half is the set-pin acceptance mark).
  // 2026-09-01 (i): RAW-190 CodexHost extra-process completion — Host CLI
  // completed is exact terminal, Host unread is not overwritten by the
  // official atom, and Desktop follow cannot revive a corroborated idle row.
  // 2026-09-01 (j): extra processes whose cwd is absent from official
  // inventory still member; unmatched Host rows fall through to Chats.
  // 2026-09-01 (k): RAW-191 extra-process questions/prompts map to 待输入;
  // Host waiting-flag honor lives in codexhost-discovery, entry shrinks.
  // 2026-09-01 (l): RAW-193 extra-process unread compares with Desktop follow;
  // compareHostDesktopUnread lives in discovery, entry shrinks.
  // 2026-09-01 (m): RAW-193 Codex APP 已读 — extra-process jump wiring
  // (`honorHostExternalOpenRead`); mark-read and confirmsRead live in
  // discovery plus the existing Desktop opened-read ack.
  // 2026-09-01 (n): RAW-194 Host extra-process rows stay live after reload;
  // hostExternal is stamped onto V7 branches in the evidence builder.
  // 2026-09-01 (o): withdrawn — the entry-level external unread guards
  // duplicated and short-circuited the discovery-owned Host↔Desktop unread
  // projection (`compareHostDesktopUnread` inside the observation chain,
  // RAW-193); Host unread authority lives in codexhost-discovery, not here.
  // 2026-09-01 (p): +7 lines — the two official-atom writers
  // (refreshPersistedUnread, applyFreshCompletionUnread) skip external ids:
  // the atom never lists Host conversations, so deriving their connector
  // unread from it stomped the merge-recorded Host value to read on every
  // desktop refresh — the reason Host unread never reached completed-unread.
  // 2026-09-01 (q): +22 lines — Host-authority suppression of native claude
  // rows: a session linked to a CodexHost thread (hook-stamped
  // CODEXHOST_THREAD_ID) is skipped and retired by the state push and kept
  // retired by metadata upserts while the Host roster carries the thread;
  // roster gone → the native row returns. Link capture lives in
  // claude/scripts.cjs + events.cjs + code-sessions.cjs.
  // 2026-09-01 (r): +2 lines — the public thread projection kept the Harness
  // identity of a Host extra process instead of dropping it, so a consumer can
  // tell a claude-code/grok Thread from a native Codex one without parsing the
  // compressed name prefix. Validation and shape live in
  // preload/codex/codexhost-discovery.cjs (`codexhostExternalIdentity`); the
  // entry keeps one guarded spread.
  // 2026-09-01 (s): -2 lines — the extra-process unread branch (including the
  // new "Host reported nothing, adopt a Desktop unread-true" fallback) moved
  // into codexhost-discovery (`codexhostExternalUnreadFields`); the entry keeps
  // one spread and nets back to the pre-(r) ceiling.
  // 2026-09-01 (t): +3 lines — a CodexHost lane that failed to load used to
  // contribute zero rows with no record anywhere, which reads identically to
  // "this machine has no extra processes"; the scan now says `unloaded` once
  // per pass. Refresh failures and cache-served passes are reported by
  // codexhost-discovery itself (`failed` / `cached`), not here.
  // 2026-09-01 (u): +3 lines — the scan now reports how many extra processes
  // reached the published Thread set alongside how many were discovered. A
  // lane that finds nine rows and publishes none looked identical to a healthy
  // one, which cost a full round of forensics; discovery-side outcomes cannot
  // answer this because only the entry knows what survived sanitize.
  // 2026-09-01 (v): +8 lines — extra processes reached the published Thread
  // set (9 of 9) yet none appeared in the task list, and nothing between the
  // Provider snapshot and the Kernel said where they stopped. The codex
  // evidence build now reports arrived/with-node/total-node counts. Remove
  // this once the drop is fixed and the boundary has a durable contract.
  // 2026-09-01 (w): +11 lines — official Desktop follow of extra-process ids
  // planted notLoaded shadows; Host running/completed rows then collapsed to
  // Kernel unknown. Stop following those ids, wrap private Desktop activity
  // through honorExternalProjection, and treat extra-process connector-active
  // as live so flags survive. Shape lives in codexhost-discovery.cjs.
  // 2026-09-02 (x): +1 line — the archive bridge learns which rows are
  // CodexHost extra processes so it archives them through the Host CLI. The
  // official app-server cannot see those ids; every archive of one died at
  // the thread/read preflight as protocol-error. Shape lives in
  // archive-bridge.cjs and codexhost-discovery.cjs.
  // 2026-09-02: +5 lines — a Desktop archive of an extra process forgets its
  // Host roster entry, the scan drains ids a complete Host list dropped as
  // removals, and rows the roster no longer holds are filtered right before
  // publish. Window/drain state lives in preload/codex/codexhost-discovery.cjs.
  // 2026-09-03: open readiness (launch-first task jumps) is two extracted
  // modules -- preload/companion/open-readiness.cjs and
  // preload/codex/desktop-launch.cjs -- and the entry only carries their
  // guarded loaders, the strategy table, the adapter `open` wraps, the Claude
  // process-probe dependency, the CodexHost environment field and the
  // codexhost path surface (setCodexhostPath / clearCodexhostPath).
  // 2026-09-03 (RAW-203/204): -7 -- the native connector unread applier moved
  // into desktop-shadow.cjs; the entry keeps the discovery storage injection
  // and the persisted jump-read lookups only.
  // 2026-09-03 (F-3): -4 -- one acknowledgement-covers-turn rule for parent and
  // Side receipts, two dead opened-read branches removed, forget wrapper inlined.
  // 2026-09-03 (F-3 round 3): -2 -- machine-run and opened-read unread resolution
  // moved into codexDesktopUnreadObservation; side evidence keeps raw membership.
  lines: 14282,
  // Top-level `function` declarations whose name contains `odex` (case-sensitive
  // infix match, not a prefix: same-domain functions are commonly named by verb
  // first -- `activateCodexFloat`, `installCodexFloatIpc` -- and a prefix filter
  // silently undercounts them by more than half.
  // 2026-09-03: +2 for setCodexhostPath / clearCodexhostPath (manual codexhost location).
  codexFunctions: 278,
  // Module-level mutable state: top-level `let`/`var` plus top-level `const`
  // bindings holding a fresh `Map`/`Set`. These are the bindings a closure
  // rewrite has to either move or inject, so they measure coupling rather than
  // volume.
  // 2026-09-03: +2 guarded module slots, codexDesktopLaunch and companionOpenReadiness.
  mutableBindings: 155
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
