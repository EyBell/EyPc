# Window Jump Workbench — Tasks and Execution Journal

## Work Items

| ID | Work | Status |
| --- | --- | --- |
| WJ-01 | Create controlled task authority and preflight | completed |
| WJ-02 | Add state/domain/platform contracts | completed |
| WJ-03 | Add native adapters, manifest, routes, runtime and keyboard ownership | completed |
| WJ-04 | Add the accessible dense window page and styles | completed |
| WJ-05 | Synchronize documentation and conduct permitted static review | completed |
| WJ-06 | Session cache, manual Tab load, silent mainHide slots, layout refactor | completed |

## Execution Journal

- 2026-07-24 15:27 CST — Classified this as controlled: it crosses persisted product state, preload-native capability, manifest routing, keyboard behavior, and a new UI surface. Preserved the pre-existing dirty worktree; no external or destructive operation was authorized.
- 2026-07-24 15:27 CST — UI preference lookup passed for task-only full-ui work with global stable authorities and no conflicts. Selected a narrowly applicable accessibility/keyboard primitive reference; implementation stays Vue-native.
- 2026-07-24 — Added normalized `WindowTarget`/`WindowSlot` persistence and transient `LiveWindow` contracts, then extended the platform adapter with a safe stale-preload fallback. No live window row is saved during enumeration.
- 2026-07-24 — Added the fixed Windows User32/PowerShell and macOS System Events adapters, ten stable manifest features, enabled-route protection, candidate-safe Runtime resolution, official shortcut-setting redirects, and layered keyboard ownership. The adapters contain no simulated input, shell-interpolated title, privilege grant, title write, or foreground-protection bypass.
- 2026-07-24 — RAW-087 removed the transient host-binding readback shared with Codex because its private synchronous IPC blocked uTools entry loading. Window slots retain assignment and official setting redirects, but no longer display current bindings.
- 2026-07-24 — Added the `WindowsPage` workbench, responsive styles, and source-level coverage for contracts, routing, keyboard ownership, stale bridge fallback, ambiguity, focus denial, macOS permission guarding, and alias/slot stability. Automated and host validation remains intentionally unrun.
- 2026-07-24 — Synchronized product requirement, architecture, project status, controlled specification, plan, verification, and handoff. `git diff --check`, canonical/public preload and runtime-validator syntax parsing, preload byte comparison, manifest JSON/slot-count inspection, and the Markdown code-link audit are the only executed validation; no test/build/runtime/native call was made.
- 2026-07-24 — Corrected the reported `WindowsPage` Vue emit-name mismatch from `cancel-draft` to the declared `cancelDraft`; `pnpm run typecheck` passed. Test, build, uTools-host, browser, and native-window validation remain unrun.
- 2026-07-26 — Added session live-window cache and manual Tab load; rewrote slot activation as cache-first with one miss rescan; marked slots `mainHide` and restored the previous Tab so successful global jumps skip the plugin transit window; kept slot-bound non-favorites in the list; refactored the page into toolbar/slot-strip/status/list. Source tests and docs updated; no test/build/host run (`未校验，待用户验收`).