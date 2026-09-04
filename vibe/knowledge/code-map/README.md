# EyPc 代码导读图

Baseline: 2026-09-04 · 相对当前 `main` 实现 · 状态：onboarding 层，不是第二份 PRD

本目录回答三件事，且**不改写产品合同**：

1. 原始需求现在落在哪个代码模块。
2. 核心运行时流程从哪一行进、从哪一行出。
3. 读代码时该打开哪份权威文档，而不是在历史 RAW 里猜当前行为。

## 先读哪一层

| 问题 | 去哪 | 不要当成 |
| --- | --- | --- |
| 功能现在应该怎样表现 | [PRODUCT_REQUIREMENTS.md](../../specs/PRODUCT_REQUIREMENTS.md#L1) | 代码导读 |
| 某条 RAW 还作不作数 | [requirements/README.md](../../specs/requirements/README.md#L1) | 实现地图 |
| 当前实现谁拥有哪一层 | [ARCHITECTURE.md](../ARCHITECTURE.md#L1) | 当前产品语义 |
| 需求 ↔ 模块 ↔ 行号 | [requirement-module-map.md](requirement-module-map.md#L1) | PRD |
| 目录怎么走 | [directory.md](directory.md#L1) | 任务账本 |
| 每个 `src/` 文件干什么 | [modules/src-map.md](modules/src-map.md#L1) | 逐行注释 |
| 每个 `preload/` 文件干什么 | [modules/preload-map.md](modules/preload-map.md#L1) | 逐行注释 |
| 核心流程逐步走读 | [flows/](flows/README.md#L1) | 验收记录 |

## 在编辑器里怎么跟代码走

- **CodeMarks 书签**：仓库 [`.codemark/codemark.json`](../../../.codemark/codemark.json#L1) 按十条核心流程分组（含 02a Kernel 函数走读），点击书签跳到实测行。侧栏分组名与 [flows/README.md](flows/README.md#L1) 编号一致。
- **Cursor Canvas**：会话旁打开 `eypc-code-map.canvas.tsx`（本机 `~/.cursor/projects/.../canvases/`）。里面是分层 DAG、证据链 / 打开链流程图，以及「导读覆盖了什么」条形图；不替代本目录的行锚链接。
- **行级注释范围**：Companion Kernel / Actions / open-handoff 的热点函数上方已有中文注释（说明不变量，不复述语句）。入口文件有模块头。`appRuntime.ts` 与 `preload/index.js` **不**逐行加注。

## 层模型（实现顺序，不是产品口号）

```text
uTools feature code（public/plugin.json）
  → App.vue applyPluginRoute
  → featureRouting.routePluginFeature（[L37](../../../src/runtime/feature/featureRouting.ts#L37)）
  → AppRuntime.dispatch（唯一用户可见突变）
  → Domain 纯函数
  → eypcPlatform / preload
  → 页面只渲染 RuntimeSlice
```

Companion 另有一条 Host 内核链，见 [flows/companion.md](flows/companion.md#L1)。

## 明确不做什么

- 不新建 `vibe/requirements/`。
- 不平行一份当前 PRD。
- 不把 `proposed` / `SA-*` 条款写成已实现行为。
- 不把构建通过写成宿主已加载。
