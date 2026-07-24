---
id: eypc-design-preference-index-tag-limit
status: verified
scope: project
fingerprint: design-preference-lookup-rejects-a-project-entry-when-its-stable-tag-list-exceeds-the-schema-limit__keep-stable-entry-tags-within-the-declared-bound-before-ui-skill-routing__eypc-codex-companion
first_seen: 2026-07-24
last_verified: 2026-07-24
review_after: 2027-01-24
evidence:
  - preference-lookup-receipt
  - project-index-review
  - raw-083-static-verification
tags:
  - design-preferences
  - preference-index
  - ui-gate
  - documentation
  - codex-companion
---

# Preference Index Tags Must Stay Within the Schema Limit

## Symptom

A Codex Companion UI change could not obtain a design-preference receipt even though the project authority was present and no candidate or stable-authority conflict existed.

## Wrong Assumption

A stable preference entry may accumulate unlimited descriptive tags because tags are only search metadata.

## Verified Root Cause

The design-preference schema limits an entry to 16 unique tags. The project interaction entry contained 18 tags, so the lookup rejected the entire index before UI Skill routing.

## Correct Detection Order

1. Run the project preference lookup for the actual surface and task profile before selecting a UI Skill.
2. If the lookup rejects the index, validate tag count, uniqueness and token shape for every project entry.
3. Preserve the existing authority and remove only redundant tags that duplicate an established stable behavior.
4. Re-run the same task-only lookup and require `ready-for-ui-skill` before UI implementation.

## Prevention Rule

Keep every project preference entry within its declared tag limit. Treat tags as a compact routing index, not a second requirements ledger; store detailed behavior in the linked Developer Soul or canonical task specification.

## Latest Applicable Implementation

[design-preferences.json](../design-preferences.json#L1) provides the project index, while [developer-soul.md](../developer-soul.md#L1) holds the complete Codex Companion behavior. The repaired RAW-083 preflight and static evidence are in [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1).

## Alternative Route

- Status: `verified`.
- Preconditions: a UI/interaction change needs a project preference receipt.
- Ordered steps: query the actual surface; validate a rejected entry against the schema; reduce only redundant stable tags; re-query with explicit task-only missing-category acknowledgements; continue only after the ready receipt.
- Verification: the repaired index produced a complete `ready-for-ui-skill` receipt with no candidates or conflicts.
- Applicability boundary: project preference-index maintenance only; it does not change user preferences or persist a cache candidate.
- Fallback: if a tag cannot be proven redundant, stop before UI code and request the authority owner's decision rather than deleting it.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-24 | Codex compact hit-zone revision | UI preference lookup rejected the project index | Added descriptive interaction tags beyond the entry limit | Removed only redundant tags already covered by the stable compact-counter behavior, then re-ran the receipt | verified |
