---
id: eypc-req-codex-raw-117
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-117
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-096-104-110-112-116"
relations:
  - refines-RAW-096-104-110-112-116
---

# RAW-117 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户补充同一切换路径中“已完成”也不会同步。RAW-116 保留最后 live shadow 后，任务完成与 owner `following=false` 仍可能竞态：若完整 `turn/completed` 恰好漏收，而定向续订又回放旧 `desktop-live active` snapshot，已知 latest Turn 会继续停在 `inProgress`，既有“已知 terminal 与 active snapshot 冲突”核验也不会启动。对仍在库、成功向原 owner 定向续订、且上一精确 shadow 为无待输入/审批的 active 任务，preload 必须同时复用现有 3 秒 `[0,300,1000]` 单飞 `thread/turns/list(limit=1, sortDirection=desc, itemsView=notLoaded)` 做一次 latest-Turn 校对：同一/更新 Turn 已明确 completed 时立即发布脱敏 `targeted-after-exit` 完成证据，使 Controller 原子包中的完成分段与进行中角标同步收敛；仍为 inProgress、出现等待请求、读取失败或更新 activity 时继续保守 active/ongoing。该校对不得删除 shadow、不得从 snapshot/时间猜完成，不新增 Renderer 计数、timer、协议、持久化或 raw identity 暴露；真实 owner 断开与 RAW-116 清理边界不变。双 preload 镜像同步，既有 bridge 测试文件补“切走时漏收完成通知且替换 snapshot 仍回放 active，也只定向读取一次并发布 completed”的合同且不执行；状态保持 `reported / 未校验，待用户验收`。
