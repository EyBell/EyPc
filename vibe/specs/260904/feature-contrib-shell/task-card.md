# Task Card

> Standard non-requirement：六工具贡献型壳层。动作仍留在 AppRuntime。产品语义零变更。

Tool: cursor
Date: 2026-09-04
Task: 每个 Tab 自带 definition / commands / routes / bindPage / shouldSubscribe，Shell 只组装。

## Task Documentation Sync Group

- Group key: `dsg:eypc:260904-feature-contrib-shell`
- Group owner: this `task-card.md`
- Git document prefixes: `vibe/specs/260904/feature-contrib-shell/` · `vibe/knowledge/` · `vibe/specs/PROJECT_STATUS.md` · `vibe/specs/PRODUCT_REQUIREMENTS.md`
- Durable document members: `vibe/specs/260904/feature-contrib-shell/task-card.md` · `vibe/knowledge/ARCHITECTURE.md` · `vibe/knowledge/technical-details.md` · `vibe/knowledge/code-map/**` · `vibe/specs/PROJECT_STATUS.md` · `vibe/specs/PRODUCT_REQUIREMENTS.md`
- Declared code/config dependencies: `src/runtime/feature/` · `src/App.vue` · `src/components/TabShell.vue` · `src/domain/types.ts` · `src/runtime/keybinding/keybindingRuntime.ts`
- Linked current/canonical/rule/memory authorities: `vibe/specs/PRODUCT_REQUIREMENTS.md` · `vibe/knowledge/ARCHITECTURE.md` · `vibe/rules/documentation.md`
- Excluded unrelated dirty documents: `vite.config.*` 与本地代理
- Lookup contract: 新任务，无复用 gate。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260904-feature-contrib-shell",
  "group_owner": "vibe/specs/260904/feature-contrib-shell/task-card.md",
  "documents": [
    "vibe/specs/260904/feature-contrib-shell/task-card.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/code-map/README.md",
    "vibe/knowledge/code-map/directory.md",
    "vibe/knowledge/code-map/modules/feature-module.md",
    "vibe/knowledge/code-map/modules/src-map.md",
    "vibe/knowledge/code-map/requirement-module-map.md",
    "vibe/knowledge/code-map/flows/boot.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md"
  ],
  "dependencies": [
    "src/runtime/feature/featureModule.ts",
    "src/runtime/feature/featureModules.ts",
    "src/runtime/feature/featureRegistry.ts",
    "src/runtime/feature/featureRouting.ts",
    "src/App.vue",
    "src/components/TabShell.vue",
    "src/domain/types.ts",
    "src/runtime/keybinding/keybindingRuntime.ts"
  ],
  "validators": [],
  "git_scope_prefixes": [
    "vibe/knowledge",
    "vibe/specs/260904/feature-contrib-shell",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md"
  ]
}
```

## Goal And Scope

- Goal: 把加第 7 个工具的壳层税从 TabShell 具名 slot、`keybindingRuntime` 巨表、`featureRouting` switch 收到模块目录；快捷键、feature code、默认开关/排序、页面事件行为逐字保持。
- In scope: FeatureModuleV7 贡献型 ABI；六包 `commands` / `routes` / `pageBind` / `module`；catalog 拼接；路由遍历；App/TabShell 动态挂页；`shouldSubscribe` 进模块；`AppTabId` 从 `FEATURE_MODULE_IDS` 派生；架构与 code-map 导读。
- Out of scope: 拆 `createAppRuntime` 的 `actions.register`；拆 AppState；开放 `KeybindingLayerId`；改 `keyboardEvent.ts`；QuickFavorites / Float / Action 升格 FeatureModule；改写 `public/plugin.json` cmds 文案；运行时 `registerFeature` / 独立 npm 包；用户帮助 md；PRD。
- Success evidence: 聚焦测试绿；`vue-tsc --noEmit` 绿；`plugin.json` 除 `eypc-main` 外每个 `features[].code` 被某模块 `routes` 认领。

## Decision

- Documentation level: `standard`
- Execution: `main-only`
- Automation lane: `not-applicable`

## Explicit non-goals

- RAW-179#3 字面「QuickFavorites / Action / Float 也走 FeatureModule」本刀明确 **未实施 / 非本刀**。
- 登记驱动 ≠ 热插拔。动作实现仍在 AppRuntime。
- 加第 7 个 Tab 本轮仍不能只丢一个文件夹：还要动 AppState 字段与 Runtime 动作。

## VerificationImpactTrace

- 变更面：FeatureModule ABI、六包拆分、命令拼接、路由遍历、App/TabShell 挂页、id 派生、聚焦测试与架构导读
- 直接消费者：主窗启动、uTools `onPluginEnter`、快捷键 catalog、设置命令表、帮助 id 覆盖
- 选中命令：`tests/runtime/featureModule.test.ts`、`tests/integration/featureRouting.test.ts`、`tests/integration/appPluginEnter.test.ts`、`tests/runtime/keybinding.test.ts`、`tests/unit/featureHelpCoverage.test.ts`、`pnpm exec vue-tsc --noEmit`
- 交付收口：`pnpm run build` + `validate-requirements --write-current-truth`
- 不选：仓库级 `pnpm test`、MQTT 套件、`pnpm run serve` / 真 uTools
