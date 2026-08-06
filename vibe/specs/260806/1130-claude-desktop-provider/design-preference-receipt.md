# 设计偏好查询回执（Phase 4 · 打开路线与设置页）

Tool: claude (Cowork)
Date: 2026-08-06
Gate: `design-preference-gate: accepted`（[vibe/rules/README.md](../../../rules/README.md#L1)）

Spec: [spec.md](spec.md#L1) · Plan: [plan.md](plan.md#L1) · Tasks: [tasks.md](tasks.md#L1)

P0-2 把回执推迟到「有 UI 行为的那一期」，即本期。P1–P3 是纯域 / 只读桥 / Controller 接线，无用户可见新控件；P4 同时动打开动作、设置页文案与帮助文档，属中型以上交互/配置工作，故在改行为之前完成本次查询。

## 查询范围

| 偏好条目 | 类别 | 命中原因 |
| --- | --- | --- |
| `eypc-codex-product-context` | product-context | 桌面端作为第三个证据源的产品边界 |
| `eypc-codex-content-information` | content-information | 打开语义、提示时序、隐私、`archive-state-trust` |
| `eypc-codex-interaction-input` | interaction-input | 卡片打开动作、`ordinary-core-open` |
| `eypc-codex-accessibility` | accessibility | 非颜色状态线索、focus 等价帮助 |
| `eypc-window-jump`（soul `#window-jump-taste`） | interaction/platform | AX 激活的身份与失败语义 |

权威正文：`developer-soul.md#codex-companion-taste`、`developer-soul.md#window-jump-taste`。

## 用户拍板（AskUserQuestion，2026-08-06）

1. 打开落点：**前置 App + 提示会话名**（不写剪贴板，不维持现状）。
2. 开关粒度：**不加子开关**，桌面端跟随既有「接入 Claude Code」。
3. 设置页：**并进现有状态行**，零新增控件。

三项都与下面的偏好结论同向，无覆盖冲突。

## 结论

### 1. 打开桌面会话 = 弱信号，不写已读回执

Soul 的 `exact-completed-evidence-only` 与 RAW-138「只有确认成功的打开才即刻标记已读；失败或未确认的派发什么都不改」是硬约束。桌面端没有 `claude://cowork/<sessionId>`，AX 只能把 App 前置，**无法证明用户看到了那条会话**。

因此桌面端打开固定报 `dispatched`：不写 `claudeReceipts`、不动未读、不动隐藏/Tab 状态。CLI 那条「确认聚焦终端 → 写回执」的强信号路径保持不变。这也保证「已完成未读」不会因为一次前置就假性清零。

### 2. 目标窗口的身份只来自 appId/appName，不来自标题

`window-jump-taste` 写死：「标题、Tab、显示器/Space、应用名、序数、位置、尺寸、候选数量都不建立身份或关系」。所以：

- **准入**用应用身份（macOS bundle id 前缀 `com.anthropic.claude*`，或应用名等于 `Claude`），只收 `relationship === 'root'` 且 `canActivate` 的用户可见窗口；
- 标题**只用于在多个已经通过准入的窗口之间挑一个更可能的**（精确等于会话标题时优先），命中不了就退回唯一根窗口；
- 多个根窗口且标题无精确命中时**不猜**，激活最近可用的根窗口并在消息里说明需要在 App 内自行选择。

「投影缺失不证明死亡」同样适用：找不到窗口时报「Claude 桌面端未在运行」，不推断会话状态、不改任何卡片。

### 3. 消息文案给出会话名，但不泄漏路径

`privacy` 与 window-jump 的「开发追踪必须有界且脱敏」要求不外泄路径/PID。消息形如「已前置 Claude 桌面端 · 请在应用内选择「<会话标题>」」——标题是 App 自己的 title（P1-2 已定为显示名），不含 cwd、不含 sessionId、不含 uuid。

### 4. 设置页：状态而非说明文案

RAW-087 明确避免「常驻的说明性文案」，要求解释走可聚焦的信息控件。上一轮回执第 4 条已把「状态」与「说明」分开：状态可以常驻。

因此桌面端事实**并进既有那行状态**（`已连接 Claude Code 2.1.220 · 桌面端 3 个会话`），不新增开关、不新增行、不新增常驻解释；「桌面端只读、无需注册」这类解释放进既有 `data-operation-description` 提示层与功能说明 guide。未开启 Claude 时该行文案保持原样（`关闭时不读取任何 Claude 数据`），因为此时桌面端同样不读。

### 5. 不新增开关，与「provider sprawl」避免项一致

2026-07-18 的 companion feedback 把「provider sprawl」列为避免风格。桌面端与 CLI 是**同一个 Claude 账号的两个前端**，P1-2 已经把它们并入同一个 `claude` 通道（不新增 provider id），配置层再分叉会让「接入来源」出现两个语义重叠的开关。用户拍板一致。

## 未偏离的部分

- 卡片行与来源标记不变：桌面会话仍走既有 `claude` 来源标记，不新增第三种标记（沿用上一轮回执第 1 条的 46px 行高合同）。
- 水球、角标、循环序零改动（P1-2 的通道合并设计使然）。
- 无新增悬浮气泡，符合 `quota-bubble-free`。
- 打开失败给的是产品语汇消息（「Claude 桌面端未在运行」「已前置 Claude 桌面端」），不泄漏 provider 原始词汇与系统错误原文。

## 顺带修正的既有缺陷（非本期设计决定）

查证 AX 路线时发现 CLI 的终端聚焦从未真正成功过，两处契约断裂：

1. `open.cjs` 传给 `windows.activate` 的是自造对象，缺 `platform` 字段，而窗口子系统对 `source.platform !== hostPlatform` 直接返回 `not-found`；
2. 成功判定写成 `outcome === 'ok'`，而真实契约是 `activated`（`preload/windows/index.cjs` 的 `parseActivationResult` 白名单）。

原有 8 项桥测试全绿是因为测试桩直接返回 `{ outcome: 'ok' }`，把错误契约固化进了用例。修复后 CLI 打开会真正走「聚焦已有终端」而不是每次新开终端，这属于恢复既定设计，不改变产品语义。已归档 error-memory。

---

## P5 增补（2026-08-06，对抗复核收口）

### 结论：本期无新增交互面，设计偏好门无需重新过闸

P5 的改动全部是正确性修复（facade 端口、readiness 门、状态机时钟、去重集、卡片顺序、路径校验、
桥尾窗与 watcher）。**零新增控件、零新增文案位、零布局改动**，46px 行高合同与四槽动作条未被触碰。
唯一的用户可见变化是既有卡片**终于会出现**、状态与顺序**终于正确**——这些是 spec 早已定义的行为，
不是新的设计决定。

> **⚠️ 2026-08-06 修正：下面这一节的两条否决理由都是错的，结论保留但推理作废。**
> ① 「隐藏即减角标」不成立——`codexPresentation.ts:159-160` 与
> [PRODUCT_REQUIREMENTS.md#L122](../../PRODUCT_REQUIREMENTS.md#L122) 明确把隐藏的完成未读卡
> **算进**角标；② 引用的 `developer-soul.md#L64/#L70` acknowledgement 子句**已被
> RAW-082/128/138/139 取代**（[#L123](../../PRODUCT_REQUIREMENTS.md#L123)），soul 已就地标注失效。
> ③ 当时还断言「隐藏链路早已接好」，实际隐藏根本不生效且是 P5 引入的回归。
> **正确解法不是加控件，而是照 Codex 的 `unreadKnown === false → completed` 通路
> （`codex.ts:1704/1713`）让桌面卡不产生 completed-unread**，已于同日落地，见
> [verify.md](verify.md#L1)「按 Codex 通路对齐」。保留原文仅为留痕。

### 一次被否决的候选设计：桌面卡「标记已读」动作

对抗复核提出「桌面卡永远无法置已读 → 已完成未读角标只增不减」，并建议新增显式确认控件。
查证后**前提不成立，方案也与 soul 冲突**，故不采纳：

1. **前提错**：`codexController.ts` 早已给桌面卡接了与 CLI 同一套隐藏契约
   （`desktopHiddenKeys` 按 `claudeDesktopCompletionRevision` 对账），而 `companionAggregate` 的
   `bucketsFor` 对 `isHidden` 的卡只返回 `['hidden']`。**隐藏一张桌面卡，角标立刻减一。**
2. **与 soul 直接冲突**：`developer-soul.md#L64`（2026-07-18）明写
   「Opening never advances viewed state; hiding completed-unread does, and **there is no separate
   acknowledgement control**」；`#L70`（2026-07-20）的避免行为里再次列出
   「no Pin/manual-collapse/**acknowledgement controls**」。
3. **现状本就合规**：RAW-082 / RAW-138 之所以引入「打开即已读」，前提是确认成功的 Deep Link
   能证明打开了哪一条。P4 判定 AX 激活证明不了这一点因而不写回执——这恰好回落到 2026-07-18 的
   soul 默认。桌面卡的现行语义是 soul 的默认分支，不是缺口。

**用户 2026-08-06 拍板：不加控件，维持现状。** 落地动作只有两项文档补充：
帮助文档新增「桌面端卡片怎么消掉未读 = 用「隐」」一段（此前完全没说，用户确实会困惑），
并把「近 14 天未归档」这个覆盖范围写进说明。

### soul 覆盖情况

无。本期没有任何决定覆盖 soul 条目。
