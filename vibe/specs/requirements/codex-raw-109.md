---
id: eypc-req-codex-raw-109
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-109
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-084-105-106-108"
relations:
  - refines-RAW-084-105-106-108
---

# RAW-109 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

“上一个 Codex 任务”与“下一个 Codex 任务”的普通候选不得直接消费 30 天库存中的完整 `ongoing` 桶。普通候选固定为完整 `inputRequired`，随后是 RAW-108 同一纯展示投影中最近 6 小时、非隐藏的 active 组（`active / waiting-approval / ongoing`），按既有置顶优先/稳定顺序及匿名 key 去重；`completed-unread` 继续只由其独立首条动作打开并本地确认，不进入前后循环。超过 6 小时、已隐藏、已停止和已完成任务不得仅因底层仍是保守 `ongoing` 而留在普通动作候选池；它们仍可按各自合同从项目、隐藏或完成视图访问。普通候选为空时，RAW-105/106 的回退保持不变：只有用户在 EyPc 内明确本地置顶且非 `stopped` 的当前可打开任务可参与，允许其超过 6 小时或隐藏，Codex 原生置顶不参与。所指旧任务的只读核验确认它不是 Codex 原生置顶且底层仍为保守 ongoing；用户随后主动归档只处理该个案，不替代候选修复。本条复用展示资格，不新增动作缓存、timer、debounce、协议、持久化或迁移；既有 Controller 测试合同只更新不执行，状态保持 `reported / 未校验，待用户验收`。
