# EyPc AI Adapter (Claude Code)

Tool: tool-neutral (codex, claude, and any CodeNote-routed agent)

Repository-owned entry for Claude Code. **Mirror of [AGENTS.md](AGENTS.md#L1)** — that file is the canonical adapter body; keep this one synchronized with it and change both together. Neither restates the CodeNote master.

> A global SessionStart hook may also inject `AGENTS.md`. That is convenience, not discovery: it travels with the machine, not this repository. This file is what makes the repo self-sufficient for Claude Code; when both arrive, treat them as one authority, not two.

Read first:
- [vibe/rules/README.md](vibe/rules/README.md#L1)
- [vibe/rules/documentation.md](vibe/rules/documentation.md#L1)
- [vibe/specs/PROJECT_STATUS.md](vibe/specs/PROJECT_STATUS.md#L1)
- [vibe/knowledge/ARCHITECTURE.md](vibe/knowledge/ARCHITECTURE.md#L1)
- [../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/VibeAi.md](../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/VibeAi.md#L1)

Hard constraints:
- Start every actionable task, review, diagnosis, implementation, verification, or closeout with the global [task-skill-reminder](../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Skills/global/task-skill-reminder/SKILL.md#L1): emit one dedicated `Skill 提醒` block containing only materially applicable Skills and the selected verification level; update it only when the route changes.
- Keep project-specific rules in `vibe/rules/`; do not copy the CodeNote master into this repository.
- Preserve unrelated user changes and generated IDE files.
- High-risk actions require confirmation: process kill, file delete, DB writes outside local plugin storage, publish/deploy, credentials, or external service writes.
- Markdown code references must use relative links with line anchors where possible.
- Final replies must include verification status and memory/process-document status.

Orientation (not restated elsewhere):
- Verification commands are impact-selected candidates, not a fixed ladder. Build a provisional `VerificationImpactTrace` before verification commands enter an Agent-authored or Agent-expanded plan; use focused tests and only the affected semantic/build boundary. Run `pnpm run test`, `typecheck`, `build` or `verify` repository-wide only when the project/global testing owner records a matching escalation trigger. Approval or implementation of a suite first inserted by an Agent-authored plan is not such a trigger.
- Generated — regenerate, never hand-edit: `dist/`, `output/`, and generated outputs declared by [package scripts](package.json#L1).
- Deliberately absent: no `vibe/requirements/`, no `vibe/evals/`; [vibe/ai-db/](vibe/ai-db/README.md#L1) is a pointer only. Do not create these on assumption.
