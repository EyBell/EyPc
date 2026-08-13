---
id: eypc-req-codex-raw-120
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-120
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / supersedes-RAW-069-077-078-079-completion-hold / refines-RAW-089-092-118-119"
relations:
  - refines-RAW-089-092-118-119
---

# RAW-120 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户授权在任务状态已能按精确 Desktop live 与 latest-Turn revision 判断后，择优取消既有异常筛选和防抖。所有已接受的完整 completed 证据——精确通知、缓存 latest Turn、定向复核或完整快照中的更新 revision / 同 revision 状态前进 / 同 completed revision 完成时间前进——必须立即进入 Controller 原子 completed 包，不再经过 `completionPresentationDelayMs` 展示 hold；配置页删除“进行中离开稳定窗”。该字段仅保留为旧持久化结构兼容且运行时忽略，不自动改写用户存量数据。Preload 缓存完成与 Controller active-exit 新鲜度不得再比较 provider Turn 时间和本机 `desktopActiveSince`，只按 Turn revision/status 单调性判断；有效 completed shape 在无待输入/审批时可取代已完成 Turn 对应的 active replay。保留首次 active snapshot 冲突的 `[0,300,1000]` 有界佐证、50/200ms 结构事件合并、5s/1s push watchdog、15s 完整校对和 missing-key 隔离，因为它们处理证据缺失/库存稳定而不是完成展示。验证需覆盖 bridge 整文件、Controller 普通/恢复完成、Domain active/completed、旧设置入口移除、typecheck 及 preload 镜像；真实 uTools 仍由用户重载验收。
