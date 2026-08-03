---
id: eypc-codex-action-command-prefix-allowlist-allows-extra-argv
status: verified
scope: project
fingerprint: codex-environment-action-prefix-regex-accepts-build-or-serve__tokenizer-forwards-unvalidated-tail__extra-argv-reaches-package-runner-under-shell-false
first_seen: 2026-08-03
last_verified: 2026-08-03
review_after: 2027-02-03
evidence:
  - controlled-review
  - regression-test
tags:
  - codex-environment-action
  - argv
  - allowlist
  - shell-false
  - spawn
---

# Action Command Prefix Allowlist Does Not Constrain the Full argv

## Symptom

An Environment Action beginning with an allowed prefix such as `pnpm run build` entered the catalog even when it carried extra tokens such as `--config`, another positional argument, a Git ref/force option, or shell-looking text. `shell:false` prevented shell expansion but did not prevent the extra argv from reaching pnpm/npm/vite/git.

## Wrong Assumption

Treating a command-string prefix match as equivalent to validating the complete process launch contract, and treating `shell:false` as an argv allowlist.

## Verified Root Cause

The former gate matched `build`/`serve` using a word-boundary regex without an end anchor, then tokenized the whole command and forwarded the remaining tokens to the launch planner. Shell metacharacter filtering covered only selected spellings and could not prove that the complete array belonged to a fixed product command.

## Prevention Rule

Tokenize once, validate the complete finite argv shape, derive risk from that structured result, and let the launch planner accept only the validated structure. Invalid commands must be omitted from the catalog, not displayed as runnable-but-later-rejected. The standalone TypeScript Domain and JavaScript preload validators must carry the same explicit matrix:

- `pnpm|npm|yarn|bun run build|serve`
- `vite build|serve`
- `git push`

No flag, separator, ref or additional positional token is implicit. If product requirements later need one, add an explicit typed shape and a regression before widening Host launch behavior.

## Correct Detection Order

1. Assert every accepted complete argv vector.
2. Split adversarial cases by boundary: shell-looking tokens, newline, `--`, flags, positional tails and Git ref/force.
3. Prove invalid definitions are absent from the catalog.
4. Prove the launch planner receives only the validated structure, with `shell:false` retained as a separate process boundary.
5. Run both Domain and Host behavior tests so the standalone preload mirror cannot drift.

## Evidence

- Current requirement and acceptance evidence: [raw-requirement.md](../../specs/260729/1435-codex-environment-actions/raw-requirement.md#L1) · [verify.md](../../specs/260729/1435-codex-environment-actions/verify.md#L1).
- Domain matrix: [codexEnvironment.ts](../../../src/domain/codexEnvironment.ts#L1) and [codexEnvironment.test.ts](../../../tests/unit/codexEnvironment.test.ts#L1).
- Host matrix and launch boundary: [preload/index.js](../../../preload/index.js#L1), [codexActionRuntime.test.ts](../../../tests/platform/codexActionRuntime.test.ts#L1) and [codexActionRunnerBridge.test.ts](../../../tests/platform/codexActionRunnerBridge.test.ts#L1).

## Alternative Route

- Status: `verified`.
- Preconditions: an Action product intentionally supports only a finite command set.
- Ordered steps: parse → exact-vector validate → typed risk → resolve absolute launch plan → spawn with `shell:false`.
- Verification: 2026-08-03 focused regression covers the valid matrix plus `$()`, `&`, pipe, newline, `--`, `--config`, extra positional and Git ref/force rejection.
- Applicability boundary: this rule governs EyPc Codex Environment Actions; it does not claim that arbitrary user-authored task runners should share the same finite set.

## Occurrence History

| Date | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- |
| 2026-08-03 | Acceptance review tested arguments after an allowed Build/Serve/Git Push prefix | Prefix regex plus partial metacharacter blacklist, followed by raw tail forwarding | Replaced the gate with complete structured argv validation in Domain and Host; launch planner now accepts only validated structures | verified by focused automated regression; real Actions intentionally not executed |
