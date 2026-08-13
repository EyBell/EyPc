---
id: eypc-req-codex-raw-146
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-146
status: active
domain: companion-codex
authority: user-stated
source_annotations: "automated-verified-host-pending / refines-RAW-067-108-128-134-145 / ordered-first-open-and-contract-drift-closeout"
relations:
  - refines-RAW-067-108-128-134-145
---

# RAW-146 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户原文：“除了实际宿主未更新之外，其他发现异常的情况进行修复。” 全局核验确认三类非宿主残留：Controller 的全局待输入动作直接读取 `inputRequired[0]`，绕过悬浮角标和前后循环使用的置顶优先/稳定显示顺序；紧凑待输入与未读角标的 200ms 帮助及 ARIA 未写“打开第一条”，且 UI 测试把旧文案固化为成功合同；PROJECT_STATUS/PRD/Verify 仍保留 connector fallback、固定 6 小时、过期全量数与 8092 正在监听等陈述。修复后 Domain 提供唯一 `orderCodexTasksForDisplay`，Controller 与 Float 共用相同置顶判定和 pinned-section 顺序，全局待输入与紧凑角标均从完整隐藏兼容集合选择同一首条；提示固定为 `待输入 N · 打开第一条 / 进行中 N / 未读 N · 打开第一条`。回归夹具明确让较新的未置顶任务排在源数组首位、较旧置顶任务排在后位，并要求全局动作仍打开置顶任务；所有旧字符串断言已扫描并替换。权威文档改为 `persisted-decision`、可配置默认 24 小时和当前 8092 未监听。聚焦 Controller/UI `90/90`、完整 Vitest `752/752`、typecheck、preload/运行时静态门禁与文档链接审计通过；按用户范围未启动服务、未更新 ASAR、未重载或操作实际 uTools 宿主。
