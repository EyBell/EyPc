# RAW-201：额度读数点击即刷新与 Claude 额度车道诊断

Tool: claude · Date: 2026-09-02 · Level: Standard（需求）

spec_id: SPEC-260902-QUOTA-CHIP-REFRESH-LANE-DIAGNOSTICS

## 用户原话

> 还有 Claude Code 限额额度的展示 现在怎么是个玄学问题 它这个刷新 我完全把握不到是什么形式 还有频率

> 开关是开着的，先把 D-1 诊断加上

> 并且加一个悬浮卡片 展开时 额度悬浮处不是有提示信息吗 点击那个位置 可以触发直接刷新

「开关」指 Codex 页「允许读取 Claude App 额度」；「D-1」指同轮回复里的推荐项：给 Claude 额度车道加有界诊断事件（来源、读数年龄、下一次允许时刻、失败原因，不带数值）。截图为展开卡额度行，悬停 Claude 5 小时块时提示「读数更新于 7 分钟前，可能已过期」。

## 输入规范化边界

本记录只保存可执行的产品语义，不保存额度数值、账号身份、凭据状态或会话正文。

## 规范化需求

1. 展开卡额度行的每个读数块都是刷新触发器：点击任一块立即强制刷新 Codex 与 Claude 两个来源的额度，不等自动周期。Claude 块保持可聚焦并以 button 角色播报，Enter / Space 与点击同义；Codex 块保持原有非聚焦行为，只响应点击。
2. 手动刷新让 Claude usage API 绕过普通 cadence 与通用失败退避，但不得绕过 429 Retry-After 与 401/403 凭据锁；不改变「额度刷新（秒）」设置与自动周期。
3. 每次 Claude 额度读取记录一条有界 `quota / claude-quota-read` 运行诊断：触发原因（`cold / timer / reset / force / manual / lifecycle-*`）、statusline 缓存年龄、App plan 样本年龄、usage API 结果（`disabled / accepted / skipped / failed`）与阻塞原因（`interval / backoff / retry-after / credential`）、Retry 距离、窗口 / scoped / 已知 reset 计数、最早 reset 距离、主读数来源、年龄与新鲜度；不记录百分比、reset 时刻、身份或凭据。
4. 200ms 提示在原有读数说明后追加「点击立即刷新」；提示层、行高与额度行单行布局不变。

## 需求变更评审

`scanned_owners`：[RAW-019](../../requirements/claude-raw-019.md#L1) Claude App 加密缓存 + 动态 limits 为额度主权威、[RAW-184](../../requirements/claude-raw-184.md#L1) / [RAW-186](../../requirements/claude-raw-186.md#L1) 球心读数、[RAW-177#3](../../requirements/shared-raw-177-clause-003.md#L1) Deep Link 不构成已读、[PRODUCT_REQUIREMENTS](../../PRODUCT_REQUIREMENTS.md#L270)。

| 操作 | 条款 | 处置 |
| --- | --- | --- |
| added | 额度块点击即刷新 | 新增交互；只强制读取两个来源，不写任何 Provider 状态或已读 |
| added | `claude-quota-read` 诊断 | 新增有界事件；只含枚举、年龄与计数 |
| changed | usage API cadence | 手动触发可提前一次读取；429 / 401 / 403 边界与 1m/5m/15m/1h 退避序列不变 |
| unchanged | 球心选择、窗口映射、freshness 判定 | RAW-019 / RAW-184 / RAW-186 原样 |

`conflict_candidates`：无。`decision_status`：`explicit-current-request`。

## 验收意图

- 点击展开卡任一额度块后，诊断日志两秒内出现 `reason=manual` 的 `claude-quota-read`，Claude 提示从「读数更新于 N 分钟前」变为「读数刚刚更新」。
- 429 期间点击不触发新的 API 调用，事件 `usageApi=skipped`、`blockedBy=retry-after`。
- 自动周期、焦点唤醒与 reset+1s 唤醒各自带上自己的 `trigger`，从此每次跳动可归因到一条车道。
