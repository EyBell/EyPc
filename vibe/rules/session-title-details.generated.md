<!-- generated-from: code-note/adapters/session-title-details.md sha256:1beb235da53487b8763743d82d1926eb32980780553a6ddac9ea80210387473d -->
<!-- generated; edit the canonical source and republish -->

# Session Title Details

Conditional [title owner](global-core.generated.md) clauses. APIs belong to host adapters.

## Format

`yyMMdd[-PROJ][-WT]-扼要中文标题`

Examples: `260907-CN-规则精简修复`, `260907-CN-WT-导入映射修复`.

- Measure the Asia/Shanghai (GMT+8) session-start date; e.g. `TZ=Asia/Shanghai date +%y%m%d` at task start. Keep it across midnight/continuation; never guess or substitute today's date/unconverted UTC.
- About 6–12 Simplified Chinese characters; English proper nouns allowed. Half-width hyphens, no spaces; host English-title conventions cannot override this.

## Project Segment

- Use the declared abbreviation, else uppercase CamelCase/hyphen/underscore/space initials (one segment: first two letters). CodeNote → CN; smart-meter-hub → SMH; Feeder → FE.
- Prefer two letters/digits, at most four; reuse established forms, lengthen collisions. No registry.
- Optional after date when distinction helps; name the task target, never an inspected repo. Omit without one stable target. Fix at first rename; change only with the core goal.

## Worktree Segment

- At first naming/switch/resume, resolve this task's execution root from the lifecycle owner (central dependency unavailable: `process/worktree-tasks.md`) and `git worktree list --porcelain`; verify top-level path, Git directory and common directory. Cwd, branch/path names alone are insufficient.
- Add `-WT` after date/project for linked-worktree execution, including starts and resumes there. Worktree-focused topics use the functional task goal.
- Retain it across follow-ups and temporary main-checkout reads. Inspection or supervision of another task's worktree alone does not add it.
- A verified execution switch into/out of a worktree triggers a same-turn update even without topic drift. Drop only on verified return to main; repair missing/wrong segments. Hand-set titles remain protected; unavailable metadata/API means unverified, never guessed.

## Apply Gate

Run the [baseline gate](global-core.generated.md#apply-gate) before work. Discover current/deferred host tools. Rename automatic titles when capable; hand-set titles require a user change request. Resolve unknown provenance from supported metadata, never wording.

## Rename Boundary

Current task only unless another is named; once per turn. Core-goal/checkout changes qualify; follow-ups alone do not. No other-host API or log/cache edits.

## Verification Boundary

Separate request acceptance, exact canonical readback, visible title and refresh persistence. Promotion needs visible/persistence checks when available. Missing tools limit current availability, not historical evidence.

## Adapter Duty

Link to the owner; record `rename-supported`, `convention-only` or `unmeasured` in adapters. [Guard delivery](global-router.generated.md#guard-delivery) needs measured model-visible output; automatic-load acceptance needs a fresh-session canary.
