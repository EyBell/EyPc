---
id: eypc-req-codex-state-sync-raw-001
qualified_source: SPEC-261114-CODEX-STATE-SYNC::RAW-001
status: active
domain: companion-codex
authority: agent-transcribed
---

# RAW-001 · Codex 状态流结构兼容

用户已确认按实际消息结构恢复 Codex 完成状态同步，限定在现有 Codex 数据与状态组件实施，并保留既有功能、来源与动作权限。自动识别仅针对状态流；其他事件和写方法沿现有语义。实时状态仍由原 Bridge 持有，跨来源相位、归并及计数仍由共享内核决定。Grok 子 Agent 执行，采用手测与真实来源只读核验；不新增或运行自动化测试，不手动代跑自然 Stop Hook 构建。

本条为用户已确认方案的转述；实现边界、基线证据、执行责任及尚未完成的验收见[唯一规格与验收](../261114/codex-state-sync/raw-requirement.md#L1)。来源可达、结构可解析、状态正确与宿主手测分别记录，不以一次探针或构建通过宣称全部功能正常。

2026-11-16 用户选择执行未读核验答复 F1：限于 Codex 未读组件补齐可信当前账号与本机绑定初始化，并将未知未读纳入已有恢复；保留账号隔离，不直接放宽 cleared 或合并身份桶。该项沿用同一规格、执行者及手测加只读实测方式。
