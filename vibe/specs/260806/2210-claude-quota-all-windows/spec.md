# Spec：额度全窗口 + 以 App 节奏同步

> **Partially current, acquisition superseded.** 动态 N-window 与两窗口非破坏合并继续有效；完整来源现在由 [权威重置](../../260807/claude-code-companion-authority-reset/spec.md#L1) revision 4 的显式授权 Claude App OAuth、动态 `limits[]`、per-window source/freshness/reset、reset+1 秒唤醒与分类型退避接管。旧的 Claude Code 凭据、两窗口来源、三次进程期尝试和过期 reset 不能作为 Fable/Fable 5 的完整或当前快照。

RAW: [raw-requirement.md](raw-requirement.md#L1) · Receipt: [design-preference-receipt.md](design-preference-receipt.md#L1)

## 1. 额度模型：两个固定字段 → N 个声明式窗口

[claude.ts](../../../../src/domain/claude.ts#L1)：

- 新增 `ClaudeQuotaWindowEntry`：`key`（payload 原键）+ `kind`（`short` / `weekly` / `other`）+ `scope`（从键名解析出的限定词，已转显示大小写）+ `label` / `shortLabel` + 原有 `remainingPercent` / `resetAt` / `windowMinutes`。
- `ClaudeQuotaSnapshot.windows` 成为权威；`short` / `weekly` 降级为**派生字段**，且**只认无 scope 的那一个**——按模型的周限额永远不能冒充「周」，否则水球球心与既有消费者会读到错的窗口。
- `normalizeClaudeQuota` 改为遍历 `rate_limits` 的**全部键**，排序为 `5h → 周 → 按模型的周 → 未识别`（payload 键序不可信）。
- 标签派生：`^(five_hour|seven_day)(?:[_-](.+))?$`，限定词首字母大写；不匹配的键作为 `other` 原样携带而不是丢弃。**没有模型名对照表**（RAW 的设计约束）。
- 过期判定从「两个字段任一过期」改为「任一窗口过期」。
- `claudePrimaryQuotaWindow` 末位兜底 `windows[0]`，使只有 scoped 窗口的账号仍有球心读数。

呈现层 [companionPresentation.ts](../../../../src/domain/companionPresentation.ts#L130)：`buildClaudeQuotaSection` 由「两个 if」改为遍历 `windows`，行 key 变为 `claude-<payload 键>`；`CompanionQuotaRow` 新增可选 `shortLabel`，chip 短标不再靠 `key.endsWith('-weekly')` 猜。Codex 侧完全未动。

## 2. 同步时机：接入桌面端自己的用量记录

[plan-usage.cjs](../../../../preload/claude/plan-usage.cjs#L1) 现独立承载 `readPlanUsage()`：读 `plan-usage-history.json`，取**时间戳最大**的样本（不是最后一条），只输出 `{at, fiveHourUsedPercent, sevenDayUsedPercent}`。`org` 是账号标识，**显式丢弃**。任何不可用形状一律 `null`。

`mergeClaudePlanUsage(quota, sample, now)`（domain）：

- 样本不新于当前读数 → **按引用原样返回**，绝不让读数倒退。
- 更新的只有两个无 scope 窗口的百分比；`resetAt` 与按模型的窗口**原样保留**——样本里没有这两样，用它去覆盖等于用「没有」擦掉「有」。
- 状态栏从未跑过时，样本可以单独播种两个窗口，`source` 记为 `plan-history`，`resetAt` 为 `null` 而不是编一个。

[codexController.ts](../../../../src/runtime/codexController.ts#L1) 在凭证兜底**之前**折叠该样本：零凭证的来源理应先用。

端口：`preload/claude/index.cjs` 透传 → `preload/index.js` / `public/preload.js` facade 暴露（无桥时返回 `null`）→ [validate-utools-runtime.mjs](../../../../scripts/validate-utools-runtime.mjs#L88) 同时断言**模块侧与 facade 侧**（铁律 14 / D3 教训：模块绿灯掩盖桥接缺口）。

## 3. 明确不做

- 不猜第三个窗口的键名（本机无法证实，见 RAW 取证 5）。
- 不为新来源加开关或状态行：它不读凭证，没有需要用户同意的代价。
- 不动注册写入、任务状态机、Codex 额度通路。
- 不改单行额度契约：第三个读数是同一行的第三个 chip。

## 验收

- 聚焦测试：`claude`（窗口枚举/排序/标签派生/scoped 不冒充 plain/过期；合并的前进、不倒退、播种、空样本）、`companionPresentation`（section 行与 chip 短标）、`claudeBridge`（读取器与 facade）、`claudeCompanionController`（合并落到 view、无样本不变）。
- `vue-tsc --noEmit` 0 错误；`vite build` + `prepare-utools-runtime` + `validate-utools-runtime` 通过。
- 宿主视觉验收归用户：第三个 chip 的实际排布与窄宽表现。
