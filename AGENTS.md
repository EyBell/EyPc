# EyPc AI Adapter

Tool: tool-neutral (codex, claude, and any CodeNote-routed agent)

**Canonical adapter body.** Codex / cross-tool entry; [CLAUDE.md](CLAUDE.md#L1) mirrors this file for Claude Code, which does not read `AGENTS.md` natively. Change both together. Neither restates the CodeNote master.

> A global SessionStart hook may additionally inject this file into Claude Code (see `~/.claude/settings.json`). That is redundancy, not discovery — it travels with the machine, not the repository. When both arrive, treat them as one authority rather than two.

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

## Cursor Cloud specific instructions

Standard commands live in [README.md](README.md#L12) and [package.json](package.json#L7) `scripts`; this section only records the non-obvious cloud caveats. The update script already runs `pnpm install` on startup.

- Node version: the full test suite only passes on Node `v24.14.0`. `tests/platform/codexActionRuntime.test.ts` symlinks the running Node binary and asserts its version is exactly `v24.14.0`, so Node 22 fails those two cases. The VM's default `node` on `PATH` is the platform binary `/exec-daemon/node` (v22.x), which the shell wrapper force-prepends; Node 24.14.0 is installed via `nvm` and made the login-shell default through a `~/.bashrc` `PATH` prepend, with `corepack` `pnpm@10.32.0` activated for it. New tmux/login terminals therefore get `node -v` → `v24.14.0` and a working `pnpm`. If a fresh pod ever reports v22, run `nvm install 24.14.0` then `corepack enable pnpm`.
- Test timeout: `tests/runtime/action.test.ts` cases are heavy (several seconds each) and brush against Vitest's default 5000 ms `testTimeout` on this VM, causing flaky timeout failures. Run the suite with a larger timeout, e.g. `npx vitest run --test-timeout=30000` (full suite ≈ 4 min, 1216 tests). Plain `pnpm test` may show spurious timeouts here.
- Running the app without uTools: `pnpm run serve` starts Vite at http://127.0.0.1:8092/. The uTools desktop host does not exist on Linux, so in the browser `getPlatform()` uses a dev fallback whose Ports scan/kill hit the Vite middleware `/__eypc__/ports/{scan,kill}` (`src/platform/devPortServer.ts`) backed by `lsof`. That makes the Ports page fully functional in a plain browser; host-only features (window jump, file favorites open/reveal, Codex/Claude companions, `koffi` FFI) report "unsupported" in the browser preview, which is expected.
- The `esbuild` and `koffi` postinstall build scripts are intentionally not approved (non-interactive install); this is benign — Vite/Vitest use esbuild's prebuilt platform package and `koffi` is only exercised inside the packaged uTools desktop runtime.
