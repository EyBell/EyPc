# RAW：Claude 额度与状态可见性补全

Date: 2026-08-06 · Tool: claude (Cowork) · Level: Standard（需求）

## 用户原话

> 现在claude的额度，以及对话的状态是怎样实现的？我目前看不到"正在进行中"的状态, 更不用说快速跳转到对应的这个任务。而且，额度也没有刷新的状态，关于 5 小时限额和周限额的刷新时间，也没有精确时间点。
>
> 现在还没有实现完整吧，你进行自检核验，将缺失的进行补全优化。

## 自检结论（inspect-report 轮）

1. **进行中状态**：状态机与「正在进行中」分组均已实现（[claude.ts](../../../../src/domain/claude.ts#L193)、[FloatApp.vue](../../../../src/FloatApp.vue#L335)）。看不到的最可能原因是宿主 hooks 未注册/已过期——但**浮窗对此完全沉默**：`claudeSetupHint` 只在整条通道不可用时出现，degraded（hooks 坏但额度/卡片正常）时用户无任何线索。这是本轮要补的产品缺口。
2. **快速跳转**：`openClaudeTask`（聚焦终端 / `--resume`）与跨 provider 循环序已实现；「跳不到」是缺口 1 的下游，不需要独立改动。
3. **额度**：`resets_at` 两条来源全链路都有，但呈现层丢弃了精确时刻（`formatReset` 只有粗粒度相对时间）；`ClaudeQuotaSnapshot.status/updatedAt/source` 在 chip 投影处被裁掉，刷新状态不可见。

## 用户拍板（2026-08-06 AskUserQuestion）

- 精确重置时刻：**仅悬停提示**（保持 chip 行单行读数密度）。
- 刷新状态：**悬停句 + 过期变灰**（无常驻文案）。

## 范围

呈现层（companionPresentation + FloatApp + float.css）+ 帮助文档 + 测试。不动状态机、不动 preload、不动设置页。Codex-only 模式逐字节一致（铁律 3）。
