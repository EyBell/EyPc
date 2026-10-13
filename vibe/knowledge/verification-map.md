# Companion 验证影响映射

验证策略唯一 owner：[CodeNote testing rules](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/testing/rules.md#core-preservation-automatic-gates)。此文件只登记当前项目的消费者和执行入口。

| 变更选择器 | 已接受核心行为 | 自动入口 / 定向证据 | 消费者 | 验证边界 |
| --- | --- | --- | --- | --- |
| Companion Kernel phase / topology / interaction / unread / archive | 主 input 优先；活动子成员提升根卡；历史子终态不清主 running；当前输入优先潜在未读；根卡唯一；活动成员禁止归档 | validate-utools-runtime 自动调用 check-companion-core-invariants，source/dist 各 10 场景；Kernel/Topology/TaskPackage/Presentation 与 provider Adapter 定向测试 | canonical snapshot → Main/Float 角标/分组/cycle/归档 | 包内语义已覆盖；宿主像素、跨时刻未读不由构建证明 |
| 核心自动门禁本身 / 原测试预期变更 | 独立 oracle 不随原 Vitest 断言改变；已知 child-only 错误仍必须拒绝 | tests/scripts/companionCoreInvariants.test.ts 正向与负向 canary；已有构建入口仍保留 | source → 生产包验证 | 不能自动裁决真实需求变更，仍须原有 review |
| Rollout decision cache | 文件不变只复用解析，强制探测仍应用原有状态归约；不降检测频率 | codexRolloutDecisionCache 与 codexAsyncQuestions 定向测试；Bridge 既有状态回归 | 文件监听/进程探测 → 归约 → Main/Float | 实际 CPU 与宿主时序独立验收；既有失败不改断言隐藏 |

最后验证：2026-10-13；触发规则和负向 canary 证据见[本轮审计](../specs/261013/1425-codex-side-phase/audit.md#L1)。
