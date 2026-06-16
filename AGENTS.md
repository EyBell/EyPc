# EyPc AI Adapter

Tool: codex

Read first:
- [vibe/rules/README.md](vibe/rules/README.md#L1)
- [vibe/rules/documentation.md](vibe/rules/documentation.md#L1)
- [vibe/specs/PROJECT_STATUS.md](vibe/specs/PROJECT_STATUS.md#L1)
- [vibe/knowledge/ARCHITECTURE.md](vibe/knowledge/ARCHITECTURE.md#L1)
- [../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/VibeAi.md](../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/VibeAi.md#L1)

Hard constraints:
- Keep project-specific rules in `vibe/rules/`; do not copy the CodeNote master into this repository.
- Preserve unrelated user changes and generated IDE files.
- High-risk actions require confirmation: process kill, file delete, DB writes outside local plugin storage, publish/deploy, credentials, or external service writes.
- Markdown code references must use relative links with line anchors where possible.
- Final replies must include verification status and memory/process-document status.
