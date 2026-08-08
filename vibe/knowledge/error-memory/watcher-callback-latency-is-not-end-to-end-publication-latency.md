---
id: eypc-watcher-callback-latency-is-not-end-to-end-publication-latency
status: verified
scope: project
fingerprint: event-driven-state__watcher-callback-latency-used-as-ui-publication-slo__downstream-refresh-can-block-or-coalesce__measure-authority-event-through-controller-publish-on-one-monotonic-clock
first_seen: 2026-08-07
last_verified: 2026-08-07
review_after: 2027-02-07
evidence:
  - vibe/specs/260807/claude-code-companion-authority-reset/research.md
  - vibe/specs/260807/claude-code-companion-authority-reset/verify.md
  - preload/claude/index.cjs
  - src/runtime/codexController.ts
  - tests/runtime/claudeCompanionController.test.ts
  - scripts/probe-claude-code-runtime.mjs
tags:
  - claude-companion
  - watcher
  - latency
  - controller
  - verification
---

# Watcher Callback Latency Is Not End-to-End Publication Latency

## Symptom

Claude watcher 在 100 次本地事件中很快唤醒，于是旧验收把 append→callback P95 当成“状态已快速同步到卡片”。但 callback 后仍可能进入库存、LevelDB 和额度网络的整轮刷新；最坏情况下额度请求可再阻塞数秒。没有异常文本，错误表现是指标绿色而用户界面仍明显滞后。

## Wrong Assumption

把 source wake 当成 consumer outcome：只要 `fs.watch` 回调及时，就假定 reducer、Controller merge、互斥投影和 Renderer publish 也及时完成。该假设遗漏了 callback 之后的 await、coalescing、全量 I/O、generation barrier 和 publish。

## Verified Root Cause

- 旧 watcher 统一唤醒全量 `refreshClaude()`；callback 只证明“发现了变化”，没有证明对应 authority 已发布。
- quota supplement 可有约 8 秒等待，且与 state refresh 串联；所以 callback 分布与最终 publish 分布没有可推导关系。
- 旧探针的计时终点在 watcher callback，而产品 SLO 的终点应是 Controller 向统一任务快照发出可观察 publish。

## Detection Order

1. 在写性能结论前声明产品起点和终点；状态同步应为 authority event accepted → final Controller publish。
2. 所有阶段使用同一 monotonic clock，并区分 source wake、reader completion、merge、publish。
3. 主动阻塞一个无关 authority（例如 quota），验证目标 state lane 仍满足 SLO。
4. 用 watcher-shaped 事件通过真实 facade/Controller，而不是直接调用纯 reducer 后声称端到端。
5. 单独记录漏通知恢复窗口；watcher 正常 P95 不能证明 recovery deadline。

## Prevention Rule

- 任何“实时”“同步延迟”验收必须量到最终 consumer publish；source callback 只能命名为 wake latency。
- 测试至少包含 100 次转换、无关 I/O 阻塞、一次丢通知恢复和零重复 publish/bucket。
- 探针输出字段必须显式标注 `endToEndPublicationMeasuredHere`; 为 false 时不得参与 UI SLO 结论。

## Alternative Route

Status: `verified`

Preconditions:

- 状态 Bridge 能发布独立 delta，并携带 generation/source/freshness/compatibility。
- Controller 有可观察 publish hook，测试能冻结 quota promise。

Ordered steps:

1. 让 state watcher 只读取/发布 state delta。
2. Controller 在 state lane 内应用单调 evidence/generation 后立即 publish。
3. 同时让 quota promise 保持 pending，执行 100 次 state transition。
4. 计算 event acceptance→publish 的 monotonic P95，并断言 inventory/quota 不被目标事件重读。
5. 抑制一次 watcher wake，由 1 秒 recovery 恢复，断言总时限 `<=1.25s`。

Verification:

- [Controller regression](../../../tests/runtime/claudeCompanionController.test.ts#L1) 在 blocked quota 下通过 `100` 次转换与 `<=250ms` 门禁；[probe](../../../scripts/probe-claude-code-runtime.mjs#L1) 仅报告 watcher wake，并明确不把它标成端到端。

Fallback:

- 无法观测最终 publish 时，将性能状态记为 `not-measured`，不得用 callback、纯 reducer 或文件 mtime 代替。

Applicability boundary:

- 适用于 EyPc 事件驱动的 provider/Controller/UI 状态链；不把网络服务端确认或操作系统实际绘制时间自动纳入，除非产品 SLO 明确要求。

## Occurrence History

| Date | Task | Trigger | Failed route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-07 | Claude Companion authority reset | 用户观察状态同步仍慢并要求 Codex 同构通信 | 以 100 次 watcher callback P95 作为 UI publish P95 | old probe boundary + coupled refresh call chain | 重命名 source metric，新增 blocked-quota Controller E2E regression | verified |
