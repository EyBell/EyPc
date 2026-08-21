---
id: eypc-new-companion-source-must-register-with-navigation-authority
status: verified
scope: project
fingerprint: companion-cycle-shortcut__new-source-click-only-integration__navigation-authority-blind
first_seen: 2026-08-21
last_verified: 2026-08-21
review_after: 2026-11-21
evidence:
  - preload/companion/navigation.cjs
  - preload/companion/task-kernel.cjs
  - preload/companion/task-actions.cjs
  - preload/index.js
  - src/runtime/codexController.ts
  - tests/platform/companionTaskKernel.test.ts
  - tests/runtime/codexController.test.ts
tags:
  - companion-provider
  - navigation
  - global-shortcut
  - provider-onboarding
---

# 新增 Companion 来源必须注册进导航权威,点击可开不等于快捷键可达

## 症状

任务卡点击打开一切正常,但「上一个/下一个任务」全局快捷键要么反复停在同一张卡,要么落到一个桌面端未运行的任务上报 `unavailable`(日志见 `cycle_*` 事件 `cycleCount: 1`、`outcome: "unavailable"`)。新来源(Cursor)的任务永远不会被快捷键选中。

## 错误假设

认为「打开链路走通 = 该来源已完整接入」。实际打开有两条独立通路:点击走 Controller 内的直连分支(`openCursorTask` 直接 deeplink),快捷键走 preload 导航权威(`companion-navigation`)的 `cycleKeys` 游标。直连分支的存在掩盖了导航侧从未注册的事实——恰是 RAW-152 修复所针对的同类缺口在新来源上的复发。

## 已验证根因

导航权威的候选集由三处 provider 特定注册共同决定,新来源一处都没进:① `preload/companion/navigation.cjs` 的 `PROVIDERS` 硬编码 `['codex','claude']`,`normalizeTarget` 直接丢弃未注册 provider 的目标;② kernel `views.cycleKeys` 只由已注册 adapter 的 canonical 任务构成,Cursor 卡片是 Controller 层折叠进视图的,从不进入 kernel;③ `open` 派发只有 `openClaude`/`openCodex` 分支。于是快捷键候选集退化成极小集合(如仅剩一张 Claude 卡),该卡对应桌面端未运行时整个快捷键表现为"坏了"。

## 检测顺序

1. 快捷键异常时先查导航诊断与 `cycle_*` 日志:`cycleCount` 是否远小于可见卡片数、`outcome` 是否 `unavailable`。
2. grep 导航权威的 `PROVIDERS` 列表与 kernel `cycleKeys` 构造,对照 UI 可见的来源清单,找出"UI 可见但候选集缺席"的来源。
3. 确认该来源的打开是否走了绕过 kernel 的直连分支——这是掩盖注册缺失的标志。
4. 回看 RAW-152:导航权威要求所有启用来源 settle 后才 ready,任何来源缺席注册都违反其"无部分集选目标"契约。

## 预防规则

新增 Companion 来源的接入清单必须包含导航注册,与打开通路同一轮交付:`navigation.cjs`/`task-actions.cjs` 的 `PROVIDERS`、kernel 的候选发布(canonical adapter 或 `publishAuxiliaryCycleTasks` 辅助通道)、`open` 派发分支、`preload/index.js` 适配器,四处齐全并升级 `COMPANION_NAVIGATION_REVISION`。验收标准是端到端断言:从全局快捷键出发能循环到该来源的任务并成功派发打开,而不是仅验证点击。

## 替代路线

- 状态:`verified`。
- 前置条件:kernel 提供辅助候选通道 `publishAuxiliaryCycleTasks`(navigation v4),Controller 在 `publishTaskStatePackage` 内发布 Cursor 候选。
- 有序步骤:Controller 投影卡片 → 发布辅助候选 → kernel `mergedCycleKeys` 合并 canonical 与辅助 → navigation 按 tier 循环 → `openCursor` 派发 deeplink。
- 验证:`pnpm exec vitest run tests/platform/companionNavigationBridge.test.ts tests/platform/companionTaskKernel.test.ts tests/runtime/codexController.test.ts`。
- 适用边界:所有经由 preload 导航权威循环的来源;不适用于纯 UI 内的焦点移动。
- 回退:若辅助通道引入抖动,可按 provider 停发辅助候选,快捷键退回双来源,点击通路不受影响。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-21 | Cursor 接入上一/下一快捷键 | 用户报点击可开但快捷键异常 | Cursor 未注册进 PROVIDERS/cycleKeys/open 派发,候选集退化 | navigation v4 + 辅助候选通道 + openCursor 分支,端到端测试覆盖 | verified |
