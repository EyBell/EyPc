---
id: eypc-req-codex-raw-131
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-131
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implemented-unverified / refines-RAW-091-112-124-130 / closed-state-machine-audit"
relations:
  - refines-RAW-091-112-124-130
---

# RAW-131 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户指出连续多轮“全局排查”仍反复遗漏同类任务状态异常，要求不再按单个截图补分支，而是完整摘取全状态机。复核必须枚举所有 Activity/Turn/read-state/Side Chat/inventory/bridge-state 写入、清除、复制、聚合、异步重放与消费点，并用“来源 × 当前态 × 事件 × revision × 重放入口 × 最终卡片/角标/归档能力”闭合矩阵核对。静态审计确认 RAW-130 只修复一个直接清除入口，并找出七个 P1：stale-active latest-Turn 读取可在 unread 或任务切换后撤销更新的精确 active；首次 active 与 interrupted/failed 冲突会被 `suppressUncorroboratedActive` 人工改造成 exact idle 并进入 stopped；active→active request/activity patch 不能清除 confirmed completion，导致明确 active 或等待请求被完成态压住；Preload 单次库存缺行立即丢失已发布任务的 raw→anonymous 会话映射，而 Controller 仍保留旧 stopped 行；Side Chat 没有状态回归合同，初始 active 读取父任务 Turn 且 side-only shadow 不在 inventory 重建后主动再聚合；Controller 只阻止旧 delta，却会接纳并下调到旧 full-snapshot `activityGeneration`；实现、测试与权威文档把 stopped 归档能力分别写成 allowed 与 blocked-stopped。七项运行实现和合同现已写入：reader 捕获 private positive sequence 且 exact positive 不进入 stale 模式；冲突 terminal suppression 投影 `notLoaded/ongoing`；任意 exact active activity patch 开新 epoch，waiting flags 额外高于 confirmed completion；缺行映射在同 fingerprint 下保留 120 秒覆盖最长隔离窗口；Side Chat 按 child ID 读取并在 inventory 后重聚合全部 parent；Controller 拒绝低于当前 generation 的 full snapshot；stopped 全链改为 `blocked-stopped` 且 Host 只接受 completed archive evidence。依项目规则未执行测试、typecheck、build、preload 语法或真实宿主，当前标记 `implemented-unverified`，不得标记 accepted。

## Clarifications

- implementation clarification: the same seven root gaps include every exact active patch, not only waiting patches; both initial Side Chat verification and the last active child's exit query that child; verified single/bulk archive bypasses mapping retention with an explicit archived key; and the generation barrier rejects stale same-source delta bridge-state fields plus lower or generationless V2 full snapshots after a live waterline exists.
