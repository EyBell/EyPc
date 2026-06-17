# EyPc Project Rules

Tool: codex

## Read Order

1. [AGENTS.md](../../AGENTS.md#L1)
2. [documentation.md](documentation.md#L1)
3. [developer-soul.md](../knowledge/developer-soul.md#L1)
4. [PROJECT_STATUS.md](../specs/PROJECT_STATUS.md#L1)
5. [ARCHITECTURE.md](../knowledge/ARCHITECTURE.md#L1)

## Project Rules

- EyPc is a uTools plugin, not a standalone Electron app.
- Use Vue 3 + TypeScript + Vite for the UI and runtime.
- Keep domain logic pure and testable under `src/domain/`.
- Put uTools, Node.js, shell, process, and file-system calls behind `src/platform/` or `preload/`.
- All user-visible mutations go through Runtime Action dispatch.
- Medium or larger interaction/UI/configuration work must apply the project [developer-soul.md](../knowledge/developer-soul.md#L1) before changing behavior.
- Do not delete real files from disk in the favorites feature; removing a favorite only removes plugin metadata.
- Process termination is high risk: normal kill requires confirmation; force kill is allowed only for explicit selected PID + verified port match.
