---
id: eypc-claude-exact-topology-must-retract-absent-children
status: verified
scope: project
fingerprint: claude-live-delta-keeps-absent-subagent-nodes__exact-topology-complete-family-not-snapshotted__stale-live-child-lifts-stopped-parent
first_seen: 2026-09-07
last_verified: 2026-09-07
review_after: 2027-03-07
evidence:
  - user-corrected
  - count-only source fold stopped turnOpen-false zero-active-subagents
  - plugin liveCount-1 with N topology children
  - focused kernel and applyClaudeState tests
tags:
  - companion
  - claude
  - topology
  - phase
---

# Claude 精确拓扑缺席的子代理不得把已停止父卡钉在进行中

## Symptom

Cloud Code 源折叠已是 stopped，Turn 关闭，hook 子代理 0 active，插件根卡仍是进行中并显示「N 子任务 · 1 活动」。置顶只搬家，不发明 running。

## Wrong Assumption

Live Claude 批次按 delta 增补节点即可，子代理一旦进过 Kernel 就会被后续 `active: false` 更新；名单变短或某次批次省略子节点时，旧 running 成员会自己消失。

## Verified Root Cause

`applyClaudeStateToCompanionKernel` 发布的是 membership/topology delta。Cold preflight 只在**全部**会话 `topologyComplete` 时才 snapshot 拓扑。单会话 unique-cli 仍可能带着旧 child 节点：后续精确名单不再包含它，delta 不删。`aggregateKernelRoot` 任一 live 成员都会把根卡抬成进行中，`liveCount` 即为那一个残留。同时间戳把仍在名单里的子代理改成 `turn-completed` 本来就能过因果门；缺席的那一个不会被重发。metadata-only 入站不带子女，不能当成「子女已空」。

## Correct Detection Order

1. 源：parent `stopped`、`turnOpen=false`、hook 子代理 `active===true` 为 0。
2. 插件：`topology.liveCount>0` 且 `memberCount` 仍含旧子女。
3. 先查 Kernel 私有 child 是否还在当前精确 `subagents` 名单里，再查因果是否拒收同序终态。

## Prevention Rule

精确会话（`topologyComplete` 且非 metadata-only）把该 family 标成全家快照；本批未出现的私有成员必须撤回。不要用「父已 stopped 就忽略 live 子女」——真活子代理仍应抬升根卡。不要把 aborted+开 Turn 的 Cursor 行打成完成。

## Latest Applicable Implementation

- 证据标记：[preload/index.js](../../../preload/index.js#L11575)
- Kernel 撤回：[preload/companion/task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L2050)
- 回归：[tests/platform/companionTaskKernel.test.ts](../../../tests/platform/companionTaskKernel.test.ts#L3633)、[tests/platform/codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1703)

## Alternative Route

- Status: `verified`（2026-09-07 聚焦 Kernel + applyClaudeState）
- Preconditions: Claude 精确拓扑；后续批次省略已不在名单里的子代理。
- Steps: 非 metadata-only 且 `topologyComplete` 时把 family 当全家快照，删除本批未出现的私有成员。
- Verification: 同序 inactive 子女不得被因果挡住；精确空名单撤回 live 子节点；`topologyComplete: false` 省略子女时保留旧成员。
- Applicability boundary: Claude 精确拓扑入站。不含 Cursor 分叉、不含 metadata-only。
- Fallback: 若真活子代理被撤回，先核该次批次是否误标 `topologyComplete`，而不是恢复无删的 delta。

## Occurrence History

| Date | Task | Trigger | Failed route | Recovery | Result |
| --- | --- | --- | --- | --- | --- |
| 2026-09-07 | F-1-a Cloud Code 进行中 vs 源 stopped | 用户选 F1a | 当作 RAW-185 置顶双投影或 RAW-214 Cursor 适配器 | 匿名 count-only 对照源 fold 与 Kernel liveCount；delta 缺席子节点复现 | verified；family snapshot 撤回 |
