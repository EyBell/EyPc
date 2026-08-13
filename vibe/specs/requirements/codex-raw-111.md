---
id: eypc-req-codex-raw-111
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-111
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-018-094-108-110"
relations:
  - refines-RAW-018-094-108-110
---

# RAW-111 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户截图与授权的只读 Computer Use 联调确认，浮窗角标和展开动态卡片都稳定显示 5 条进行中，但同一时刻当前源码的匿名只读预检为 `1 ongoing / 1 active`，且其中多条浮窗任务的最新 Turn 已明确 completed。根因不是 Renderer 的角标/卡片再次分叉，而是 uTools 长驻旧 Preload/主 Controller，同时加载了较新的浮窗 Renderer；任务状态语义版本偏斜使旧稳定快照继续被当作当前事实。任务状态链必须新增一个无隐私数据的端到端合同版本，由 Preload capability、Controller 和浮窗快照逐段传递。生产平台适配器若发现 Preload 缺少或不匹配该版本，Controller 必须 fail-closed：继续允许独立额度/config 读取，但清空任务卡片与三个角标、标记 `preload-version-mismatch` 并提示在 uTools 中重新加载 EyPc，不得继续显示看似可信的历史数字。浮窗 Renderer 也必须拒绝缺少/不匹配版本的旧 Controller 快照，使仅浮窗 HMR 更新时同样不会保留旧角标。完整新链路版本一致后，仍只消费 RAW-108 的 Controller 稳定投影并恢复真实数量；不新增状态 timer/debounce，不修改 Activity Delta/Projection V3 语义、动作 ID、存储或迁移，也不自动结束/重启 uTools 进程。本次联调观察只证明版本偏斜与当前源码/运行实例差异，不构成重载后的状态时效验收；既有测试文件补合同但不执行，状态保持 `reported / 未校验，待用户验收`。
