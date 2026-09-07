<!-- generated-from: code-note/process/task-outcome-and-evidence-stop.md sha256:f003c8e56d6746c0cf9e2aaaa9c9497cab74461e40c18c5b7679a01f07c01335 -->
<!-- generated; edit the canonical source and republish -->

# Task Outcome And Evidence Stop Contract


This file is the sole normative owner of the task outcome and evidence stop contract. `process/communication-io.md` keeps the §4.1 heading and a link-only pointer for anchor compatibility; hubs, routers, templates and project adapters route here and must not restate the algorithm.

Choose one `request_mode` from the current user request before acting:

| Request signal | Mode | Default boundary |
| --- | --- | --- |
| answer, explain, review, diagnose, plan, audit or status | `inspect-report` | Inspect, verify and report; do not implement changes or alter external state. |
| explicit change, build, fix or implementation request, including an intent-authorizable action whose target and impact are already clear | `implement-validate` | Complete only the current-task action and proportionate validation; apply Git recoverability and category-specific gates below. |
| Agent-added dangerous action, irrecoverable/unknown content, changed target or impact, or material scope expansion | `confirm-first` | Stop before that action and obtain a target-specific authorization. |
| payment/approval, credential/permission mutation, or DB/SQL mutation | `confirm-first` | Apply the permanent hard gate: separate action-time confirmation, while DB/SQL mutation remains documentation-only. |

After each material result, classify one `evidence_state` and take only its matching next action:

| Evidence state | Stop decision | Required next action |
| --- | --- | --- |
| `sufficient` | `stop-and-answer` | Stop retrieval and answer or complete the already-authorized action. |
| `missing-discoverable` | `smallest-next-retrieval` | Retrieve the smallest source or run the smallest experiment that can supply the missing fact. |
| `missing-user-choice` | `minimal-question` | Ask only the smallest material question that changes scope, behavior, permission or acceptance. |
| `unavailable` | `report-gap-no-guess` | Report the evidence boundary, narrow the conclusion and do not guess or claim completion. |

- Request mode is determined by requested outcome, not by available permissions or tools. Safe reads and focused validation do not authorize implementation under `inspect-report`; `implement-validate` does not authorize a gated action.
- Empty, partial, stale or suspiciously narrow output is not proof of absence. After an unusable result, try at most two meaningfully different in-scope fallbacks when they can change the answer; repeated equivalent calls, wording-only retrieval and scope expansion are not fallbacks.
- Stop immediately when evidence is sufficient. If a fact is locally discoverable, do not ask the user to locate it. If no permitted source can resolve it, use `unavailable` rather than inventing a fact, a success state or a blocker.
- Personality and response style may change tone or detail, but never change `request_mode`, evidence authority, stopping behavior or approval boundaries.
