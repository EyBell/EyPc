# Spec：Claude 额度与状态可见性补全

RAW: [raw-requirement.md](raw-requirement.md#L1) · Receipt: [design-preference-receipt.md](design-preference-receipt.md#L1)

## 变更点

### 1. 精确重置时刻（悬停层）

新增纯函数 `companionResetDetailText(resetAt, now)`（[companionPresentation.ts](../../../../src/domain/companionPresentation.ts#L1)）：

- 输出形如「今天 21:30 重置（约 3 小时后）」「明天 08:00 重置（约 21 小时后）」「周四 03:00 重置（2 天后）」；≥7 天用「M月D日 HH:mm」。
- **时区固定 GMT+8**（用户 2026-08-06 二轮指示）：用固定偏移 + UTC getter 渲染，不随系统时区；「今天/明天」的日界也按 GMT+8 划分。
- 只接管 **Claude** chip 的 resetText；Codex chip 继续用 FloatApp 原有 `formatReset`，串不变。

### 2. 刷新状态（悬停句 + 过期变灰）

- 新增纯函数 `companionQuotaFreshnessText(quota, now)`：「读数 12 分钟前更新」；`status === 'stale'` 时追加「，可能已过期」；无 updatedAt 且 stale → 「读数可能已过期」。
- `companionQuotaChipHint / companionQuotaChipAriaLabel` 增加**可选**第四参 `freshnessText`（默认 `''`，旧调用输出逐字节不变）。
- `CompanionQuotaChip` 增加可选 `stale?: boolean`；仅 Claude chip 由 `buildCompanionQuotaStrip` 依据 `slice.claudeQuota.status` 赋值；Codex chip 不带该字段。
- 浮窗 chip `stale` 时加 `is-stale` 类：整体降不透明度 + 数字转 muted 色；非颜色线索由悬停句与 aria 文本承担。

### 3. hooks/statusline 降级提示（既有状态行）

新增纯函数 `claudeRealtimeGapNote(slice)`：

- 通道可用但 `hooks === 'outdated'` → 「Claude 钩子已过期，重新注册后恢复实时状态」；
- `hooks !== 'installed'` → 「Claude 钩子未注册，任务状态非实时」；
- 仅 `statusline !== 'installed'` → 「Claude 状态栏未注册，额度不会自动更新」；
- Claude 关闭或通道不可用（该场景由 `claudeSetupHint` 负责）→ `''`。

FloatApp 现将 note 交给搜索栏异常 `!` 的 200ms 悬停（[RAW-173](../../260817/0859-float-search-status-compact/spec.md#L1)），不再追加到额度下方整行；degraded/stale/error 仍优先于该 note。Claude 关闭时 note 恒为空串 → Codex-only 搜索栏无额外 `!`。

## 明确不做

- 不改状态机 / 聚合 / preload / 设置页。
- 不在 chip 行内常驻任何新文本（用户拍板：仅悬停）。
- 不改 Codex chip 的 hint/aria 输出串。

## 验收

- 聚焦测试：`tests/domain/companionPresentation.test.ts` 新增用例（reset 文案分档、freshness 分档、stale 投影、hint/aria 第四参缺省回归、gap note 分支）。
- `pnpm run typecheck` 0 错误；非运行 build 通过。
- Codex-only 回归：既有 companionPresentation / FloatApp 相关套件全绿。
- 宿主视觉验收归用户。

## 验证结果

见收尾报告（本文件不重复记录过程）。
