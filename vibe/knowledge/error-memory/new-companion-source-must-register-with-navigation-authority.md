---
id: eypc-new-companion-source-must-register-with-navigation-authority
status: superseded
scope: project
fingerprint: companion-cycle-shortcut__new-source-click-only-integration__navigation-authority-blind
first_seen: 2026-08-21
last_verified: 2026-08-23
review_after: 2027-08-23
evidence:
  - preload/companion/provider-manifest.json
  - preload/companion/task-topology.cjs
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

## V5 Supersession

[Companion Task Topology V5](../../specs/260823/companion-task-topology-v5/spec.md#L1) 取代本记录的现行修复路线。当前没有 Provider 硬编码导航数组、`publishAuxiliaryCycleTasks`、Cursor Controller 直连或来源专用 open callback：同一 JSON Registry 声明 Provider/capability，Kernel Snapshot 生成根 `cycleKeys`，点击与快捷键都提交 `CompanionTaskCommandV1`，生产 facade 同时门禁 Registry/Topology/Snapshot/Command/Subscribe/ACK。任何 V4/漏方法 Host 都返回 `reload-required`，不能静默漏掉新来源。

以下内容保留为 V4 事故证据，用于阻止 Auxiliary/直连双通路回流；不再作为当前接入步骤。

## 症状

任务卡点击打开一切正常,但「上一个/下一个任务」全局快捷键要么反复停在同一张卡,要么落到一个桌面端未运行的任务上报 `unavailable`(日志见 `cycle_*` 事件 `cycleCount: 1`、`outcome: "unavailable"`)。新来源(Cursor)的任务永远不会被快捷键选中。

## 错误假设

认为「打开链路走通 = 该来源已完整接入」。实际打开有两条独立通路:点击走 Controller 内的直连分支(`openCursorTask` 直接 deeplink),快捷键走 preload 导航权威(`companion-navigation`)的 `cycleKeys` 游标。直连分支的存在掩盖了导航侧从未注册的事实——恰是 RAW-152 修复所针对的同类缺口在新来源上的复发。

## 已验证根因

导航权威的候选集由三处 provider 特定注册共同决定,新来源一处都没进:① `preload/companion/navigation.cjs` 的 `PROVIDERS` 硬编码 `['codex','claude']`,`normalizeTarget` 直接丢弃未注册 provider 的目标;② kernel `views.cycleKeys` 只由已注册 adapter 的 canonical 任务构成,Cursor 卡片是 Controller 层折叠进视图的,从不进入 kernel;③ `open` 派发只有 `openClaude`/`openCodex` 分支。于是快捷键候选集退化成极小集合(如仅剩一张 Claude 卡),该卡对应桌面端未运行时整个快捷键表现为"坏了"。

同日生产桥接复发证明只补裸 Kernel 仍不完整:`publishAuxiliaryCycleTasks` 已存在于 Kernel 返回值,Controller 也会发布 Cursor 卡,但 `window.eypcPlatform.companionKernel` 漏转发该方法。Controller 的可选能力判断随后静默返回,而 Runtime Identity 只校验版本与核心方法,所以宿主仍报告 `host-loaded`;运行日志中主包与导航目标同为 40、快捷键 `cycleCount=2`,只在 Codex/Claude 间循环。相关裸 Kernel/Controller 测试全部通过,因为它们绕过了生产 preload 暴露边界。

## 检测顺序

1. 快捷键异常时先查导航诊断与 `cycle_*` 日志:`cycleCount` 是否远小于可见卡片数、`outcome` 是否 `unavailable`。
2. grep 导航权威的 `PROVIDERS` 列表、kernel `cycleKeys` 构造与 `window.eypcPlatform.companionKernel` 暴露对象;不能只确认 Kernel 返回值有方法,还要确认生产桥接确实转发。
3. 确认该来源的打开是否走了绕过 kernel 的直连分支——这是掩盖注册缺失的标志。
4. 回看 RAW-152:导航权威要求所有启用来源 settle 后才 ready,任何来源缺席注册都违反其"无部分集选目标"契约。

## 预防规则

新增 Companion 来源的接入清单必须包含导航注册,与打开通路同一轮交付:`navigation.cjs`/`task-actions.cjs` 的 `PROVIDERS`、kernel 的候选发布(canonical adapter 或 `publishAuxiliaryCycleTasks` 辅助通道)、`open` 派发分支、`preload/index.js` 生产暴露适配器,四处齐全并升级 `COMPANION_NAVIGATION_REVISION`。该能力必须进入 Renderer 平台兼容门禁,缺失时 `reload-required`,不得用可选方法静默退化。自动化验收必须从生产 preload 生成的 `window.eypcPlatform` 出发:快捷键能循环到该来源并成功派发打开,而不是仅验证点击或直接实例化裸 Kernel。

## 历史替代路线

- 状态:`superseded-by-v5`。
- 前置条件:kernel 提供辅助候选通道 `publishAuxiliaryCycleTasks`(navigation v4),Controller 在 `publishTaskStatePackage` 内发布 Cursor 候选。
- 有序步骤:Controller 投影卡片 → 发布辅助候选 → kernel `mergedCycleKeys` 合并 canonical 与辅助 → navigation 按 tier 循环 → `openCursor` 派发 deeplink。
- 验证:`pnpm exec vitest run tests/platform/codexAppServerBridge.test.ts tests/platform/eypcPlatform.test.ts tests/platform/runtimeIdentity.test.ts tests/platform/companionNavigationBridge.test.ts tests/platform/companionTaskKernel.test.ts tests/runtime/codexController.test.ts`；随后同步 preload 镜像并构建。真实 uTools/plugin 验证仅在用户于当前任务主动直接要求时执行。
- 适用边界:所有经由 preload 导航权威循环的来源;不适用于纯 UI 内的焦点移动。
- 回退:若辅助通道引入抖动,可按 provider 停发辅助候选,快捷键退回双来源,点击通路不受影响。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-21 | Cursor 接入上一/下一快捷键 | 用户报点击可开但快捷键异常 | Cursor 未注册进 PROVIDERS/cycleKeys/open 派发,候选集退化 | navigation v4 + 辅助候选通道 + openCursor 分支,端到端测试覆盖 | verified |
| 2026-08-21（晚） | 快捷键再次失效排查 | 用户报更重：完全打不开 | 非本条复发：v4 注册已在宿主生效（identity handshake 一致），失效来自 Kernel 选择器就绪门禁把 `verifying` 当过期并静默失败 | 见 [selector readiness 叶子](selector-readiness-must-not-treat-verifying-phase-as-stale.md#L1) | verified（本条结论不变） |
| 2026-08-21（夜） | Cursor 仍无法被上一/下一选中 | 手点 Cursor 正常,快捷键只在 Codex/Claude 间循环 | 裸 Kernel 有辅助发布能力,但生产 `window.eypcPlatform.companionKernel` 漏转发；可选检查静默返回且测试绕过宿主边界 | preload 转发 + 平台必需能力门禁 + 生产 preload bridge 循环派发测试 | automated-verified / host-test-not-requested |
| 2026-08-23 | V5 全局拓扑与统一命令 | 用户要求消除反复出现的双通路结构 | Auxiliary/Controller 直调仍要求多点同步 | Registry + V5 Snapshot + 单一 Command Gateway + 六能力身份门禁 | superseded / automated-verified / host-excluded-by-user |
