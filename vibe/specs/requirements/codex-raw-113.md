---
id: eypc-req-codex-raw-113
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-113
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / supersedes-RAW-111-fail-closed-empty-and-refines-RAW-108-109-112"
---

# RAW-113 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户在上一轮版本门禁上线后明确反馈“所有状态都没了”，并要求所有任务状态封装在一起、不得把状态逻辑混散到多个层。只读运行观察确认紧凑浮窗只剩额度而三个任务角标全部消失；源码核验确认 Controller 在 Preload revision 不一致时先构造 `preload-version-mismatch` 错误空快照、停止任务库存与 Activity Delta，Float Renderer 又独立做相同 revision 判断并再次清空，导致一个兼容诊断同时抹掉卡片、角标和状态。RAW-111 的“mixed-version 任务投影必须清空”由本条废止：Preload 仍只负责原始通信证据白名单与抖动稳定，Controller 必须把已稳定的完整会话快照、最近 6 小时互斥动态分组、`input / active / unread` 三个紧凑数量、下一次纯时间边界、语义/来源 revision、兼容等级与提示封装为一个原子 `CodexTaskStatePackageV1`；浮窗动态列表、状态段、角标/ARIA、水球摘要、设置预览和前后任务 active 候选只能消费该包，不得独立筛选、计数、清空或维护状态 timer。Controller 的既有调度器负责 6 小时边界重投影，不新增第二个 timer/debounce。revision 缺失或不匹配时，Controller 继续读取/订阅任务证据并保留原子包，只把兼容状态标为 `degraded`、提示建议重载；新 Renderer 消费旧主 Controller 快照时可在同一个领域归一化函数中一次构造降级包，但不得清空旧快照中仍存在的任务。顶层 `conversations` 仅保留一版兼容别名。RAW-112 的首次 snapshot 佐证、Preload/Controller 全部抖动保护、完成展示窗、Projection V3、动作、存储与隐私边界均不变。既有 domain/Controller/UI 测试文件补充原子包与 mixed-version 保留合同但不执行；状态保持 `reported / 未校验，待用户验收`。
