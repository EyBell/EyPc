# ey-pc project rules

<!-- codenote-project-router:v1 -->

design-preference-gate: accepted

## Project gates and routes

开发收尾走[构建主本](documentation.md#build-and-core-version-sync-required)。本地运行能力见[项目适配器](project-runtime.md#L1)。

For code, UI, data, build, deployment or runtime work, read the relevant [local context](local-context.md) and its linked owner before acting. It retains this project's SQL, environment, browser identity, preview and real-acceptance constraints. Commands do not grant permission to start services or mutate data. Simple questions need no process preflight.

- durable documentation or recovery: [documentation.md](documentation.md).
- EyPc 当前任务数、角标、分组或图钉核对：[F1 脚本与展示验收](project-runtime.md#companion-task-count-acceptance)。
- DB/SQL; read before authoring or running queries: [vibe/ai-db/README.md](../ai-db/README.md).
- continuation or current acceptance: [vibe/specs/PROJECT_STATUS.md](../specs/PROJECT_STATUS.md).
- existing business behavior changes: follow the shared [BusinessChangeReview](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/engineering/rules.md#business-change-protection), using this project's [requirement registry and coverage](../specs/requirements/README.md#L1) and affected original sources; local evidence stays with the task.

Keep this index and local-context.md project-owned. Global rules live only in CodeNote and are loaded from there; generated host entries are updated from CodeNote, and this project keeps no copy of global procedures.
