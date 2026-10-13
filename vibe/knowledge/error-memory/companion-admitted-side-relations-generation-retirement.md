---
id: eypc-companion-admitted-side-relations-generation-retirement
status: verified
scope: project
fingerprint: late-transport-old-topology-removal__accepted-edge-global-floor-invalidates-family__archive-leaves-side__guard-admission-and-reuse-admitted-graph
first_seen: 2026-10-13
last_verified: 2026-10-13
review_after: 2027-01-13
evidence:
  - preload/companion/task-kernel.cjs
  - scripts/check-companion-lifecycles.mjs
  - tests/scripts/companionLifecycles.test.ts
tags:
  - companion
  - lifecycle
  - preservation
---

# 已接纳 Side 关系的 generation 与全家撤回

## Symptom / Wrong Assumption

旧 generation 撤回可拆掉活动子关系；部分新观察后，根卡忽然失去 Side，归档可能留下一张子卡。将最新全局 topology generation 当作所有已接纳关系的即时失效点，混淆了入站排序与成员寿命。

## Verified Root Cause

成员删除有旧 generation 门禁，显式关系删除原来没有。展示/归档又对已接纳 relationStore 使用全局 floor；另一个部分批次前进后，仍有效的老边被重新排除。独立时序检查对旧撤回、错误 floor 和归档残留均实际失败，修复后通过。

## Detection Order / Prevention Rule

先核对 transport 与 source lane generation，避免使用旧 draft 被整包拒绝的夹具冒充覆盖。其次核对是否真的有完整快照/当前精确撤回。入站插入/删除保留 generation 门禁；已接纳边只由有效撤回、完整替换或节点删除退出，不能因其他家族 generation 前进而失效。展示与归档使用同一成员图。

## Alternative Route

当前采用原 relationStore admission 和原 Topology 派生器，不新增通路/TTL；source 与生产包各执行 17 个生命周期检查点，并有三个坏实现的负向 canary。四 Provider 的迟到/当前撤回均有回归。实机新宿主仍独立验收。

## Occurrence History

2026-10-13：用户要求完整续核，确认旧源码和复制坏实现失败、修复后通过。[证据与限制](../../specs/261013/1425-codex-side-phase/lifecycle-verify.md#L1)。
