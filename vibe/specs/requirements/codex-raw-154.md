---
id: eypc-req-codex-raw-154
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-154
status: active
domain: companion-codex
authority: user-stated
source_annotations: "automated-verified-host-pending / refines-RAW-150-153 / provider-neutral-task-action-kernel-and-mutation-convergence"
relations:
  - refines-RAW-150-153
scoped_relations:
  - kind: superseded-by
    target: eypc-req-shared-raw-160
    scope: "exact interrupted 立即 stopped 与旧 Actions/Package 版本"
---

# RAW-154 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户要求从第一性原理统一“状态观察、动作分发、Provider 副作用、结果收敛”，去除 Controller 内 Codex/Claude 重复归档分支，并修复 Claude 归档只打开不归档、App 手动归档后插件更新慢的问题。新增 `companion-task-actions-v1` 可辨识请求/结果合同和穷举 Provider registry；UI 只提交 open/archive 意图，Domain 独占互斥 bucket/capability，Dispatcher 按“动作类型 → Provider”选择 Adapter，Provider Adapter 独占 inspect/open/archive/close 与原生副作用，Controller mutation reducer 只接纳已验证结果。Open 继续由 `companion-navigation-v1` 进行 75ms 尾随合并和跨来源单并发；archive 永不合并/替换，只对相同 Provider+任务 single-flight，不同任务/Provider 互不阻断。归档期间卡片保留并标记 archiving；`archived` 精确移除并只发布一次，`failed/indeterminate` 保留，旧 Claude AX 通路禁止回退。Claude 精确文件 watcher 发布仅含匿名 key、membership mutation、单调 generation 与接纳时间的 `CompanionTaskMutationDelta`，Controller 不等待 quota/state/unread/full inventory 即接纳；1 秒 watchdog 只复核私有索引已登记文件，手动 App 归档和 EyPc 静默归档进入同一 reducer，正常 P95≤250ms、掉 callback≤1.25s。`task-state-v9` 标识精确 interrupted 终态 watermark 与该收敛合同；旧 v8 保留任务但标记 degraded。全局 `eypc-companion-archive` 保持 `mainHide:true`，外部 action id 为 `codex.task.archiveFocused`，内部委托统一 Dispatcher；优先当前仍有效的聚焦可归档任务，否则用非隐藏 attention 首项，首次只显示目标并建立 5 秒进程级确认，第二次 identity 完全一致才执行，key/revision/focus/phase/Provider 任一变化即取消。真实 v9 uTools 状态切换和经用户另行确认的可丢弃 Claude canary 未完成前，状态保持 `automated-verified / host-pending`。
