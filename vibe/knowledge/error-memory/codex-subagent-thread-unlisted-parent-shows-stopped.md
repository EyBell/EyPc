---
id: eypc-codex-subagent-thread-unlisted-parent-shows-stopped
status: verified
scope: project
fingerprint: codex-parent-shows-stopped-while-subagent-runs__thread-list-omits-subagent-rows-in-every-state__parent-link-only-in-thread-read-parentthreadid
first_seen: 2026-08-31
last_verified: 2026-08-31
review_after: 2026-11-30
evidence:
  - preload/codex/inventory-thread-topology.cjs
  - preload/codex/subagent-discovery.cjs
  - preload/index.js
tags:
  - codex-companion
  - side-topology
  - subagent
  - inventory-membership
---

# Codex subagent 线程从不进入 thread/list，父任务显示待继续而非进行中

## 症状

主任务已完成/已暂停、其 subagent 子线程正在运行时，Codex 原生侧栏对该任务显示转圈（组聚合 running），EyPc 动态列表将其分在「待继续」，且行上没有「+N 子任务」拓扑标签（memberCount≤1）。

## 错误假设

1. 以为聚合判断分裂在多个消费端——实测内核 `aggregateKernelRoot` 是唯一聚合点且成员 live 优先，UI 沿 phase→bucket 单链投影，判断没有分裂，是成员证据缺失。
2. 以为 rollout 元数据 `session_id=父线程id` 就是 RPC 行的链接语义——实测 `thread/read` 边界上 subagent 的 `sessionId` 是它自己的 id，权威父链接是 `parentThreadId` 字段；按 session_id 做拓扑兜底在 RPC 行上永不命中。

## 已验证根因

app-server 0.150.1 的 `thread/list` **任何状态下都不返回 subagent 线程**（对照探测：live subagent `01a052cf` 与已中断 subagent `01a056c1` 均 MISSING，而 `thread/read` 对两者都可用并携带精确 `parentThreadId`）。库存拓扑旧逻辑只认 `forkedFromId`（fork 型 UI 分支才有），subagent 型行既不在清单又无 fork 指针，因此永远不能成为内核成员，父任务只按自身终态显示。与 [[codex-running-side-child-invisible-after-reload]] 的 Lane A 同族，但本例与重载无关：不是证据被丢弃，而是清单面从未提供。

另证：2026-08-29 的 subagent rollout 元数据带 `forked_from_id`，2026-08-31 的不带——Codex 侧行为已变，历史上「能链上」不代表现在能。

## 检测顺序

1. 看 EyPc 行有无「+N 子任务」标签：无标签即成员从未建立，不必查聚合与投影。
2. 用同通路探测（spawn `codex app-server --listen stdio://` → `initialize` → `thread/list` 全分页）确认子线程是否在清单；再 `thread/read` 看 `parentThreadId`。
3. 只有子线程确在清单且已链上、父仍显示终态时，才查聚合/投影（另一类问题）。

## 预防规则

- 判断 Codex 父子关系时以 `thread/read.parentThreadId` 为权威；`forkedFromId` 只覆盖 fork 型；rollout 元数据 `session_id` 不得当作 RPC 行链接语义使用。
- 任何「清单驱动」的证据面要先实测清单是否覆盖该实体类型，再谈缓存/聚合；MISSING 于清单的实体需要独立发现通道。
- 已实施（2026-08-31）：[subagent-discovery.cjs](../../../preload/codex/subagent-discovery.cjs#L1) 从最近会话日目录的 rollout 文件名发现候选线程 id（48h/24 上限、mtime 缓存），经 `thread/read.parentThreadId` 命中已列父线程后注入扫描 rows；[inventory-thread-topology.cjs](../../../preload/codex/inventory-thread-topology.cjs#L53) 增加 `parentThreadId` 链接兜底（父缺席记 isolated）。链上后走既有 side-thread → branch evidence → kernel 聚合，无第二判断点。
- 机器运行不携带用户未读语义（2026-09-01 回归补规，共**三处**压制点，缺一即振荡）：subagent/guardian 子线程用户永远不会打开，桌面未读表对它们恒为 true。链入机器子线程后未读必须在全部证据点压为已读——① 库存 side 证据构建；② `codexPrivateBranchEvidence` 的桌面未读观察（`bridge.persistedUnread` 对任意 id 作答，需上游拦截）；③ `codexDesktopAggregateUnread` 桌面桥聚合（childEntries 里任一 child 在未读集即把父任务判成 `desktop-persisted true`）。漏掉 ③ 的表现是拔河振荡：聚合方每隔几秒置未读、打开确认方（openedRead → 恒 `desktop-live` read）逐个翻回，角标在 0~N 间循环跳动，语义指纹永不收敛；触发器是点击 Codex 桌面（促使桥 follow 线程走聚合路径）。判定接口：[subagent-discovery.cjs](../../../preload/codex/subagent-discovery.cjs#L1) 的 `isSubAgentThreadSource` / `codexIsMachineRunThread`。取证手段沉淀：kernel `group-counts-changed` + `desktop-unread-read` + `root-unread-evidence` 三个转变型诊断即可复盘任何未读振荡，无需 UI 观察。

## Alternative Route

- 前置条件：`thread/list` 仍不含 subagent 且 rollout 发现通道失效（如会话目录结构变更）。
- 步骤：改从 app-server 活动事件直接标父——`codexMarkAppServerLiveActive` 已支持 branchThreadId，需补事件→父解析。
- 验证：subagent 运行期间父任务进「正在进行中」。
- 适用边界：仅活动性上浮，不提供子任务拓扑标签。
- 状态：candidate。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-31 | 子任务活动上浮主任务状态 | 用户报 260829 任务子任务运行但显示待继续 | 先按 rollout session_id 做拓扑兜底（RPC 行不命中） | 同通路 RPC 探测证实 thread/list 缺席 + parentThreadId 权威；实现文件发现+parentThreadId 链接 | 预防规则已实施 / 真实宿主重载验收待用户 |
| 2026-09-01 | 重载验收 | 用户报「已完成未读匹配度完全不对」 | 链入的 15 个机器子线程把桌面未读表的永久 true 聚合进父任务 | 审计脚本证实 15 行全为 subagent/guardian 且部分在未读表；两处未读证据点加机器运行压制 + 3 组新断言 | 部分修复（漏第三处） |
| 2026-09-01 | 拔河振荡定谳 | 用户报计数 1↔5↔25 跳动、打开后未读复活、点 Codex 桌面触发 | 只压了两处：`codexDesktopAggregateUnread` 仍在把机器 child 未读上浮成父 `desktop-persisted true`，与 openedRead 的恒 read 互相覆盖 | 三个转变型诊断（group-counts/desktop-unread-read/root-unread-evidence）钉死双方 payload；聚合包装层过滤机器 child | 三处压制齐备 / 重载验收待用户 |
