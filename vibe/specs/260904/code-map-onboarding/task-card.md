# Task Card

> Standard non-requirement：代码导读文档 + CodeMarks + 入口注释。不改产品语义。

Tool: cursor
Date: 2026-09-04
Task: 建立以用户代码实现为核心的需求↔模块导读，并用 CodeMarks 加载核心流程。

## Task Documentation Sync Group

- Group key: `dsg:eypc:260904-code-map-onboarding`
- Group owner: this `task-card.md`
- Git document prefixes: `vibe/knowledge/code-map/` · `vibe/rules/documentation.md` · `vibe/knowledge/technical-details.md` · `.codemark/` · 入口源文件头注释
- Durable document members: `vibe/knowledge/code-map/**` · `vibe/specs/260904/code-map-onboarding/task-card.md`
- Declared code/config dependencies: `.codemark/codemark.json` · `src/main.ts` · `src/float-main.ts` · `src/action-main.ts` · `src/runtime/feature/featureModules.ts` · `src/runtime/feature/featureRegistry.ts` · `src/runtime/feature/featureRouting.ts` · `src/runtime/action/actionRuntime.ts` · `preload/companion/task-kernel.cjs` · `preload/companion/task-actions.cjs` · `preload/companion/open-handoff.cjs`
- Linked current/canonical/rule/memory authorities: `vibe/specs/PRODUCT_REQUIREMENTS.md` · `vibe/specs/requirements/README.md` · `vibe/knowledge/ARCHITECTURE.md` · `vibe/rules/documentation.md`
- Excluded unrelated dirty documents: `vite.config.*` 与本地代理
- Lookup contract: 新任务，无复用 gate。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260904-code-map-onboarding",
  "group_owner": "vibe/specs/260904/code-map-onboarding/task-card.md",
  "documents": [
    "vibe/knowledge/code-map/README.md",
    "vibe/knowledge/code-map/directory.md",
    "vibe/knowledge/code-map/requirement-module-map.md",
    "vibe/knowledge/code-map/modules/src-map.md",
    "vibe/knowledge/code-map/modules/preload-map.md",
    "vibe/knowledge/code-map/flows/README.md",
    "vibe/knowledge/code-map/flows/boot.md",
    "vibe/knowledge/code-map/flows/action-dispatch.md",
    "vibe/knowledge/code-map/flows/companion.md",
    "vibe/knowledge/code-map/flows/companion-kernel.md",
    "vibe/knowledge/code-map/flows/ports.md",
    "vibe/knowledge/code-map/flows/mqtt.md",
    "vibe/knowledge/code-map/flows/favorites.md",
    "vibe/knowledge/code-map/flows/windows.md",
    "vibe/rules/documentation.md",
    "vibe/knowledge/technical-details.md",
    "vibe/specs/260904/code-map-onboarding/task-card.md"
  ],
  "dependencies": [
    ".codemark/codemark.json",
    "src/main.ts",
    "src/float-main.ts",
    "src/action-main.ts",
    "src/runtime/feature/featureModules.ts",
    "src/runtime/feature/featureRegistry.ts",
    "src/runtime/feature/featureRouting.ts",
    "src/runtime/action/actionRuntime.ts",
    "preload/companion/task-kernel.cjs",
    "preload/companion/task-actions.cjs",
    "preload/companion/open-handoff.cjs",
    "public/companion/task-kernel.cjs",
    "public/companion/task-actions.cjs",
    "public/companion/open-handoff.cjs"
  ],
  "validators": [],
  "git_scope_prefixes": [
    "vibe/knowledge",
    "vibe/specs/260904/code-map-onboarding",
    "vibe/rules"
  ]
}
```

## Goal And Scope

- Goal: 让后续改造能从需求登记走到实测代码行，并在编辑器书签里加载核心流程。
- In scope: `vibe/knowledge/code-map/`、CodeMarks 九组书签、入口文件中文模块头、Cursor Canvas 总览、documentation 层登记。
- Out of scope: 平行 PRD；给 `appRuntime.ts` / `preload/index.js` 逐行加注释；改运行时行为；跑全量测试或 uTools 重载。
- Success evidence: 导读目录可从 README 走到行锚；CodeMarks 路径均存在；入口文件有模块头；Kernel 函数走读覆盖证据链与打开收据。

## Decision

- Documentation level: `standard`
- Execution: `main-only`
- Automation lane: `not-applicable`
- Key decision and reason: 用导读 + 书签替代全库逐行注释，避免万行 diff 与 blame 污染。
- High-risk / DB boundary: 无
- Plan-mode preflight completed before first edit: `yes`（文档任务，impact-trace 为 docs/link）
- Plan artifact scope and documentation impact: `project-current`（documentation 层新增 code-map，不改 PRD）
- Verification map: 无 ProjectVerificationMap 行；动态 docs 核验
- Provisional `VerificationImpactTrace` completed before verification commands: `yes`
- Verification-command provenance: `impact-trace`
- Test additions/execution: 核验 CodeMarks 路径存在；不跑 `pnpm test`

## Prior Task Overlap

- Relationship: `reference-only`
- Prior authority: ARCHITECTURE Codex overview、requirements 六模块、source-anchors
- Document governance: 本目录链接既有 owner，不复制条款
- Traceability and decision: `new-task`

## Documentation Realization

- Task and mechanism design authority: this card
- Requirement evolution / canonical merge authority: 无条款变更
- Intermediate problem / verified alternative / verification authority: CodeMarks 路径扫描
- Semantic execution account and unavailable-information boundary: 未对 `appRuntime.ts` 逐 action 作目录（1 万行，按 register 块导读）

## Optimization And Template Propagation

- Optimization promotion: `not-applicable`
- Applied project/template impact: `none`

## VerificationImpactTrace

- Changed surface: onboarding docs + bookmarks + 7 个入口文件头 + Kernel/Actions/handoff 热点中文注释
- Direct consumers: 人读 / CodeMarks 扩展 / Cursor Canvas
- Commands: 路径存在性检查；`node --check` 三份 companion CJS；`documentation.md` 链接
- Not selected: repository-wide test/typecheck/build

## Verification Result

- CodeMarks：63 书签，路径均存在且行号不超过文件长度。
- `node --check`：`task-kernel.cjs` / `task-actions.cjs` / `open-handoff.cjs` 通过；`public/companion/` 三份镜像已与 canonical 对齐。
- 未跑仓库级 test / typecheck / build（无行为变更、无升级触发）。
