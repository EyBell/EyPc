# Engineering Invariants Requirements

## Scope

跨产品域的结构性约束：判断唯一性、单点定义、收敛的零行为 diff 口径与防回归手段。这些条款不描述某个功能的表现，而描述代码结构必须满足的不变量。

## Current Authorities And Routes

- 条款正文：[RAW-167 draft](../../260810/1155-install-runtime-diagnostics/raw-requirement-next.draft.md#L1)
- 当前用户确认的唯一性与同步合同：[RAW-178](../../260823/codex-tab-boundary-optimization/raw-requirement.md#L18)
- 唯一全局当前产品真值：[PRODUCT_REQUIREMENTS](../../PRODUCT_REQUIREMENTS.md#L1)
- 交付记录：[verify.md](../../260810/1155-install-runtime-diagnostics/verify.md#L1)
- RAW-167～172 六条工程草案仍为 `proposed`；RAW-177#1 与 RAW-178 系列为用户明确确认的 `active` 不变量。

## Primary Requirements

- [RAW-167](../invariants-raw-167.md#L1) — `proposed` · `agent-transcribed`
- [RAW-168](../invariants-raw-168.md#L1) — `proposed` · `agent-transcribed`
- [RAW-169](../invariants-raw-169.md#L1) — `proposed` · `agent-transcribed`
- [RAW-170](../invariants-raw-170.md#L1) — `proposed` · `agent-transcribed`
- [RAW-171](../invariants-raw-171.md#L1) — `proposed` · `agent-transcribed`
- [RAW-172](../invariants-raw-172.md#L1) — `proposed` · `agent-transcribed`
- [RAW-177#1](../invariants-raw-177-clause-001.md#L1) — `active` · 来源锚点与需求身份分层
- [RAW-178](../invariants-raw-178.md#L1) — `active` · 唯一全局当前产品真值
- [RAW-178#1](../invariants-raw-178-clause-001.md#L1) — `active` · 最新有效语义融合/替代
- [RAW-178#2](../invariants-raw-178-clause-002.md#L1) — `active` · 当前产品语义唯一主文档
- [RAW-178#3](../invariants-raw-178-clause-003.md#L1) — `active` · 可复核证据与验收真实性
- [RAW-178#4](../invariants-raw-178-clause-004.md#L1) — `active` · 确定性实时漂移门禁

## Related Requirements

- [RAW-177#1](../invariants-raw-177-clause-001.md#L1) 提供来源锚点与需求身份的分层基础；RAW-178 在其上增加唯一当前真值与同步门禁，不把来源条款自动升级为产品需求。

## Historical Or Migration Sources

- 本组条款源于 [RAW-166 独立复核](../../260810/1155-install-runtime-diagnostics/verify.md#L256) 暴露的结构债，不取代任何既有产品条款。
