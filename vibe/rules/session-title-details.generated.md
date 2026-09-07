<!-- generated-from: code-note/adapters/session-title-details.md sha256:d2d31a0937117bfe83dc4917f7959d8b3c520ec52be729fa543e1f7633ce23e5 -->
<!-- generated; edit the canonical source and republish -->

# Session Title Details

Conditional [title owner](global-core.generated.md) clauses for naming/audits. APIs belong to host adapters.

## Format

`yyMMdd[-PROJ][-WT]-扼要中文标题`

Examples: `260907-CN-规则精简修复`, `260907-CN-WT-导入映射修复`.

- Measure session-start date in Asia/Shanghai (GMT+8): `TZ=Asia/Shanghai date +%y%m%d` at first rename. Keep it across midnight; never invent it, use unconverted UTC or substitute today's date on continuation.
- Use about 6–12 Simplified Chinese characters, allowing English proper nouns. Join with half-width hyphens, no spaces. Host English-title conventions do not override this.

## Project Segment

- Prefer the declared abbreviation; otherwise uppercase CamelCase/hyphen/underscore/space initials, at most four letters/digits. One segment uses its first two letters: CodeNote → CN, smart-meter-hub → SMH, Feeder → FE.
- Prefer two characters; reuse established forms, lengthen collisions to three/four. No new registry.
- Place after the date when project distinction helps. Name the task's target, never a merely inspected repo. Omit if no single stable project; omission is valid.
- Fix at first rename; change only with a changed core goal.

## Worktree Segment

Put `-WT` after date/project on an authorized move into a worktree, never for inspection alone. Name worktree-focused tasks by their functional goal from the lifecycle owner. Drop `-WT` after returning to main only at the next warranted rename.

## Apply Gate

Run the [baseline gate](global-core.generated.md#apply-gate) before substantive work. Discover current-host tools, including deferred tools. Rename automatic titles without another approval when capable. Preserve hand-set titles unless the user requests change. Unknown provenance requires supported metadata, not guesses from wording.

## Rename Boundary

Rename only the current task unless another is named; at most once per turn. Core-goal drift/worktree moves qualify; follow-ups/verification do not. Never borrow another host API or edit logs/caches to simulate success.

## Verification Boundary

Separate request acceptance, exact canonical readback, visible title and refresh/re-entry persistence. Capability promotion requires the latter checks when surfaces exist. Missing tools limit current availability; they do not erase historical capability evidence.

## Adapter Duty

Entries link to the owner. Record `rename-supported`, `convention-only` or `unmeasured` in the host adapter. Only measured model-visible channels qualify for guard delivery; configuration requires a fresh-session canary before automatic-load acceptance.
