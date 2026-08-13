---
id: eypc-error-memory-flat-index-lacks-primary-ownership
status: verified
scope: project
fingerprint: error-memory-root-directly-routes-many-leaves__most-leaves-have-no-unique-primary-module__invalid-status-and-review-metadata-remain-undetected__adaptive-index-plus-validator
first_seen: 2026-08-13
last_verified: 2026-08-13
review_after: 2027-02-13
evidence:
  - vibe/knowledge/error-memory/README.md
  - vibe/knowledge/error-memory/modules
  - scripts/validate-error-memory.mjs
  - package.json
tags:
  - error-memory
  - governance
  - adaptive-index
  - validation
---

# Flat Error Index Hid Ownership And Lifecycle Drift

## Symptom

错误根索引直接路由大量叶子，但只有少数业务模块。多数记录没有唯一 Primary owner，历史记录使用了合同外状态，部分复核日期缺失或写成自然语言，重复/失效路线只能靠人工逐条辨认。

## Failed Route

继续扩写根索引和业务共识长段落，并假设“记录仍能搜到”就等于消解路线清晰。该做法不能证明覆盖完整，也不能阻止一个叶子被多个模块当成当前主责。

## Verified Root Cause

项目已经跨过 adaptive-document-index 阈值，却没有完成全叶子的唯一主归属，也没有机器校验 frontmatter、fingerprint、链接、模块容量和 Primary/Related 约束。历史 `archived` 文案还被误用成机器状态。

## Alternative Route

- Status: `verified`。
- Preconditions: 叶子路径保持稳定，当前需求和任务文档仍是产品权威。
- Steps: 根索引只保留消解合同与模块路由；每个叶子恰好一个 Primary、最多两个 Related；失效路线用 `superseded`/`retired` 逻辑归档；运行只读 validator。
- Verification: `pnpm run validate:error-memory` 覆盖 metadata、唯一 id/fingerprint、链接、模块容量和所有叶子主归属；过期记录只告警，不自动提升或删除。
- Applicability boundary: 只整理错误知识与召回通路，不改变叶子描述的产品事实，也不取代当前 requirement/spec。

## Correct Detection Order

1. 从当前 Git 视图枚举全部叶子与模块，而不是使用手写数量。
2. 校验 metadata 和唯一 fingerprint，再判断是否真重复。
3. 按稳定业务边界分配唯一 Primary；跨域关系只放 Related。
4. 将已被当前合同取代的路线标为 superseded，将仍待验收的路线保留 candidate。
5. 最后运行链接、容量和覆盖校验；任何语义冲突单独交给用户决断。

## Prevention Rule

错误记忆采用 `root → module → leaf` 单向路由。根索引不再维护平铺叶子清单，模块不复制事实正文；相同 fingerprint 更新同一叶子，不因相似措辞合并不同证据边界。只有 verified 且未过复核期的 Alternative Route 可进入当前召回。

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-13 | RAW-166 error-resolution consolidation | 用户要求全量梳理、归档重复/失效记录并统一判断结构 | 扩写平铺根索引且无覆盖校验 | 建立七个业务模块、唯一 Primary 门禁与只读 validator | verified；全叶子覆盖通过，过期 candidate 保持告警 |
