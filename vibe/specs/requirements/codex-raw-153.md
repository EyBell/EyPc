---
id: eypc-req-codex-raw-153
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-153
status: active
domain: companion-codex
authority: user-stated
source_annotations: "automated-verified-host-rework / supersedes-RAW-151-active-vs-active-arbitration / waiting-clear-causal-barrier"
---

# RAW-153 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户真机反馈“待输入→进行中”解除特别慢，并会短暂消失后重新回跳。真实 v7 宿主已复现 `1 待输入 / 4 进行中`，同时 Provider→Domain 匿名投影为 `0 / 5`，确认不是刷新频率问题，而是当前 owner 的旧 Desktop waiting 能压过较新的 App Server active/Turn-started，且 shadow/read-state/refollow 重放可复活已解除请求。Preload 必须为每个 main/Side Chat 请求和 runtime waiting flag 记录单调观测序列，并建立统一 waiting-clear 因果屏障：精确 request remove 或匹配 `serverRequest/resolved` 解除对应实例；较新的 `thread/status/changed active`、`turn/started`、matching output、用户继续和新 `task_started` 清除此前等待；旧 snapshot、read-state、无关 patch、rollout resume 或 refollow 不得跨过屏障；屏障后新出现的请求实例仍立即进入待输入。`desktop-live + active` 只有在不带 waiting flag 时才可直接复用；带旧 waiting 的 active 必须被较新的运行证据替换。未匹配的 resolved 只启动既有单任务有界重订，不盲清并发审批。公开字段保持不变，语义升级为 `task-state-v8`；v7 明确 degraded 并提示重载。排序、打开进度、角标、归档和 Provider 规则不变。只有新构建真实宿主在解除后最迟 1.25 秒进入进行中、30 秒及两次 mainHide/refollow 后不回跳，并能让同任务新请求重新进入，才可由 rework 转为完成。
