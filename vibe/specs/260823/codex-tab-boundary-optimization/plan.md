# Codex Tab Boundary Optimization — Implementation Plan

status: `completed / accepted-by-Root / v6-current-reconciled`
updated: `2026-08-24`
work_order_version: `3`
planned_child_count: `3`

## Scope

- In scope: RAW-177#1～#3、EyPc 需求登记/来源寻址、旧 facade 移除、可证实的 Codex handoff/ACK 合同、聚焦验证及所有受影响权威。
- Out of scope: 删除用户文件、清理 `_to_delete/`、提交/推送、发布/部署、进程控制、真实 uTools/Safari/插件/Codex Desktop/Mirasim 测试、伪造外部 ACK。
- Risk boundary: 没有可编辑的 Mirasim 仓库或 native receipt API；本地实现最多证明 dispatch/pending。

## Execution Topology And Outcome

| Work Unit | Surface | Mode | Accepted outcome |
| --- | --- | --- | --- |
| WU-C1 | `codex_req_lineage_audit` | read-only | 稳定来源身份方案；Root 复算得到 29 文档、196 锚点、94 已登记 RAW 子条款、102 来源-only 条款 |
| WU-C2 | `codex_source_arch_audit` | read-only | 精确移除 V4/V2 facade、v2 常量及对应测试断言；无当前调用者 |
| WU-C3 | `mirasim_handoff_audit` | read-only | 本机无可编辑 Mirasim 仓库；接受 EyPc 本地单调 handoff 合同和 native receipt 门禁 |
| WU-C4 | App Root | write | C-1～C-3 源码、测试、requirements、PRD/help、architecture 和 Controlled 文档已整合；后期 V6 current authority 保留三项边界 |
| WU-C5 | App Root | verify | V6 current 聚焦矩阵、需求、类型/构建/uTools、镜像、文档链接和 diff 已复核；默认全量仅保留已知 MQTT 5 秒超时 |

三个只读 Work Unit 的证据问题彼此独立，Root 独占所有写入、架构裁决和验收。usage counters unavailable，不宣称 Token 节省。

## Actual VerificationImpactTrace

| Changed surface | Proven affected set | Selected checks | Deliberately skipped |
| --- | --- | --- | --- |
| Requirement source identity | 29 个原始需求文档、需求登记、coverage/conflict/module owners | registry + source-anchor validators、文档链接审计 | 不把 102 条来源-only 条款自动升级为产品需求 |
| V4/V2 facade removal | platform public shape、Domain revision、Runtime Identity/Controller tests | focused platform/runtime/controller tests、typecheck、production build | 不保留兼容旁路 |
| Handoff/read boundary + V6 current chain | navigation/actions/kernel、App Server bridge、Float/Controller/UI、Evidence/Topology/Snapshot/ACK | 14 文件 `493/493` current 聚焦矩阵、typecheck、production/uTools build、preload mirrors；接纳 V6 全量拆分证据 | 不运行真实 Codex Desktop/Mirasim/uTools/Safari |
| Canonical/current docs | requirements、PRD、architecture、status、guide、Controlled ledger | post-sync conflict scan、requirements validator、document code-link audit、diff check | 不扫描或改写无关用户文档 |

## Ordered Work

1. `completed` — 接纳 WU-C1～WU-C3 只读证据并冻结写集。
2. `completed` — 修正历史 87 条快照，建立隐私安全的确定性 Source Anchor Catalog。
3. `completed` — 移除 facade，落地单调 handoff、未读权限和 UI pending 语义。
4. `completed` — 同步 requirement canonical、architecture、PRD/help、PROJECT_STATUS 与 Controlled ledger。
5. `completed` — 原始 C 级镜像、文档链接和 diff 门禁通过。
6. `completed` — 发现同工作树后期 V6 改造会使 V5 证据失效，保持写隔离并等待唯一状态链完成。
7. `completed` — 接纳 V6 权威链，重新核对 C-1/C-2/C-3 均未回退，并以当前 `493/493` 聚焦矩阵、构建、需求及文档门禁完成最终验收。
