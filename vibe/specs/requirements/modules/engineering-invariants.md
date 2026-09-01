# Engineering Invariants Requirements

## Scope

跨产品域的结构性约束：判断唯一性、单点定义、收敛的零行为 diff 口径与防回归手段。这些条款不描述某个功能的表现，而描述代码结构必须满足的不变量。

## Current Authorities And Routes

- 条款正文：[RAW-167 draft](../../260810/1155-install-runtime-diagnostics/raw-requirement-next.draft.md#L1)
- 当前用户确认的唯一性与同步合同：[RAW-178](../../260823/codex-tab-boundary-optimization/raw-requirement.md#L18)
- 当前 V7 全局体系合同：[RAW-179](../../260824/eypc-v7-global-refactor/raw-requirement.md#L1)
- 唯一全局当前产品真值：[PRODUCT_REQUIREMENTS](../../PRODUCT_REQUIREMENTS.md#L1)
- 交付记录：[verify.md](../../260810/1155-install-runtime-diagnostics/verify.md#L1)
- RAW-167～172 六条工程草案已于 2026-09-01 由用户确认转述忠实，全部 `active`；RAW-169 更早单独确认。`authority` 保留 `agent-transcribed`——正文是 Claude Code 对原话的转述，不是逐字原话，确认的是忠实度而非作者身份。RAW-177#1、RAW-178 系列与 RAW-179 工程条款为用户明确确认的 `active` 不变量。

## Primary Requirements

- [RAW-167](../invariants-raw-167.md#L1) — `active` · `agent-transcribed`
- [RAW-168](../invariants-raw-168.md#L1) — `active` · `agent-transcribed`
- [RAW-169](../invariants-raw-169.md#L1) — `active` · `user-stated`
- [RAW-170](../invariants-raw-170.md#L1) — `active` · `agent-transcribed`
- [RAW-171](../invariants-raw-171.md#L1) — `active` · `agent-transcribed`
- [RAW-172](../invariants-raw-172.md#L1) — `active` · `agent-transcribed`
- [RAW-177#1](../invariants-raw-177-clause-001.md#L1) — `active` · 来源锚点与需求身份分层
- [RAW-178](../invariants-raw-178.md#L1) — `active` · 唯一全局当前产品真值
- [RAW-178#1](../invariants-raw-178-clause-001.md#L1) — `active` · 最新有效语义融合/替代
- [RAW-178#2](../invariants-raw-178-clause-002.md#L1) — `active` · 当前产品语义唯一主文档
- [RAW-178#3](../invariants-raw-178-clause-003.md#L1) — `active` · 可复核证据与验收真实性
- [RAW-178#4](../invariants-raw-178-clause-004.md#L1) — `active` · 确定性实时漂移门禁
- [RAW-179](../invariants-raw-179.md#L1) — `active` · V7 全局状态、交互、Tab 与 UI 体系
- [RAW-179#3](../invariants-raw-179-clause-003.md#L1) — `active` · FeatureModule 与 RuntimeSlice Tab 体系
- [RAW-179#5](../invariants-raw-179-clause-005.md#L1) — `active` · 有界增量性能合同
- [RAW-179#7](../invariants-raw-179-clause-007.md#L1) — `active` · 一次性 V7 切换与外部门禁

## Related Requirements

- [RAW-177#1](../invariants-raw-177-clause-001.md#L1) 提供来源锚点与需求身份的分层基础；RAW-178 在其上增加唯一当前真值与同步门禁，不把来源条款自动升级为产品需求。
- [RAW-179#1](../shared-raw-179-clause-001.md#L1)、[#2](../shared-raw-179-clause-002.md#L1)、[#4](../interaction-raw-179-clause-004.md#L1) 与 [#6](../interaction-raw-179-clause-006.md#L1) 分别由状态和交互责任模块主拥有，此处只保留父合同关系。

## Historical Or Migration Sources

- 本组条款源于 [RAW-166 独立复核](../../260810/1155-install-runtime-diagnostics/verify.md#L256) 暴露的结构债，不取代任何既有产品条款。
