# ey-pc project rules

<!-- codenote-project-router:v1 -->

design-preference-gate: accepted

## Project gates and routes

For code, UI, data, build, deployment or runtime work, read the relevant [local context](local-context.md) and its linked owner before acting. It retains this project's SQL, environment, browser identity, preview and real-acceptance constraints. Commands do not grant permission to start services or mutate data. Simple questions need no process preflight.

- durable documentation or recovery: [documentation.md](documentation.md).
- DB/SQL; read before authoring or running queries: [vibe/ai-db/README.md](../ai-db/README.md).
- continuation or current acceptance: [vibe/specs/PROJECT_STATUS.md](../specs/PROJECT_STATUS.md).

Keep this index and local-context.md project-owned. Global rules live only in CodeNote and are loaded from there; generated host entries are updated from CodeNote, and this project keeps no copy of global procedures.
