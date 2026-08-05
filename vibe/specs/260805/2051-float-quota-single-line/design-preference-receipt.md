# 设计偏好查询回执

Tool: claude (Cowork)
Date: 2026-08-05
Gate: `design-preference-gate: accepted`（[vibe/rules/README.md](../../../rules/README.md#L5)）

RAW: [raw-requirement.md](raw-requirement.md#L1) · Spec: [spec.md](spec.md#L1)

本回执在**改行为之前**产出。工作性质：展开浮窗额度区的信息密度、悬浮帮助与配色配置，属于中型以上 UI/交互/配置工作。

## 查询范围

| 偏好条目 | 类别 | 命中原因 |
| --- | --- | --- |
| `eypc-codex-content-information` | content-information | `quota-bubble-free`、200ms 帮助时序 |
| `eypc-codex-typography` | typography | `readable-dense-12-10-9`、单行密度 |
| `eypc-codex-color-theme` | color-theme | `twelve-builtin-themes`、`direct-color-application`、`visible-part-preview` |
| `eypc-codex-visual-taste` | visual-taste | 额度读数的视觉层级 |
| `eypc-codex-accessibility` | accessibility | `non-color-state-cues`、`focus-equivalent-help` |
| `eypc-codex-interaction-input` | interaction-input | `nonreflow-bottom-selection-cue`（额度区高度变化不得推动列表几何） |

权威正文：`developer-soul.md#codex-companion-taste`。

## 被本轮用户请求覆盖的 soul 条目

规则优先级：**用户当前请求 > 项目规则**。以下两条被明确覆盖，覆盖范围仅限额度块自身。

| 被覆盖的 soul | 原文要点 | 覆盖它的用户决定 |
| --- | --- | --- |
| 2026-07-21 companion operation correction | 「…hover-expanded controls, width animation, **quota bubbles** and moving list elements remain avoided」 | 「标题做成悬浮提示」 |
| 2026-07-21 live-input interaction refinement | 「Row details are opaque after 500ms and status/short-button explanations after 200ms, but **quota hover stays bubble-free**」 | 同上 |

`ARCHITECTURE.md` 里对应的「the quota surface remains bubble-free」一句同步改写，否则文档会与代码相矛盾。

**覆盖的边界（我自己加的约束，不在用户原话里，但是 soul 的其余部分仍然生效）：**

- 额度提示复用**浮窗自有**的 `queueActionHint / clearActionHint` 200ms 不透明提示层，与状态/短按钮帮助同一个层、同一个时序。不新建第二种气泡，不引入主窗口的 `OperationTooltipLayer`（ARCHITECTURE 明确浮窗子窗口在该 owner 之外），也不使用原生 `title`。
- 提示只承载「平台 · 完整标题 · 重置时间」，仍然不含任何会话内容、路径或凭证。

## 未偏离、且本轮主动对齐的部分

1. **非颜色状态线索**（`non-color-state-cues`）—— 用户只要求「按平台区分颜色」。如果只靠颜色，四个块在灰度或高对比模式下会退化成四个无差别数字。
   因此每块保留一个**短标文字**（`5h` / `周` / `S周`），平台再由**分组 + 平台前缀**承担：跨平台时两组之间是一条 1px 分隔线，Claude 组前缀 `Claude`。颜色是第二线索，不是唯一线索。
2. **Spark 用 `S`**（2026-07-21 quota/composer refinement：`ordinary→Spark quota priority with an S`）—— 短标沿用 `S`，写作 `S5h` / `S周`，不另发明标记。
3. **12/10/9 字号层级**（`readable-dense-12-10-9`）—— 短标 9px，百分比降到 13px（原 16px），提示 9px。不引入 8px。
4. **不改变列表几何**（`nonreflow-bottom-selection-cue` 的同源约束）—— 额度区从两个 section 变成一个 section，`min-height` 固定为 30px，无论 Claude 是否接入、是否有额度都不再随内容增减行数，因此下方任务列表的顶边不再随平台接入状态跳动。这一点比现状更好：当前接入 Claude 会凭空多出一整段。
5. **可见部位可命名可配置**（2026-07-24 expanded-card configuration clarification：`Each visible control names the exact region it changes; built-in and saved themes preserve the whole set`）—— 平台色作为展开卡主题的两个新 token，落在「卡片」分区，控件文案直接命名它改的区域；12 套内置主题预设与 `defaultCodexExpandedCardAppearance` 同源派生，已保存的旧主题经 `normalizeCodexExpandedCardAppearance` 自动补默认值。
6. **预览与运行时不得漂移**（2026-07-24 water-preview correction 的同源约束）—— 设置页的 `expanded-card-preview-quota` 同步改成新的单行形态并吃同两个 token。
7. **`focus-equivalent-help` 的处理** —— 额度块是静态读数，不是控件。给它加 `tabindex` 会在密集浮窗里凭空插入 2–4 个 Tab 停靠点，与「keyboard-first」相冲突。
   采用的做法：每块的完整信息写进 `aria-label`（`Codex 周限额，剩余 83%，5 天后重置`），读屏用户**不依赖 hover 也能拿到全部信息**；hover 提示只是给鼠标用户的等价物。这不是省略帮助，而是把帮助放进可访问名而非新增焦点停靠。

## 未解决 / 留给宿主验收

平台色默认值由主题 `healthy` 色做 +150° 色相旋转并按 4.5:1 对卡片底色做可读性修正 —— 12 套主题下的实际观感需要你在真实浮窗里确认；任一套不满意都可以直接在「卡片」分区改这两个取色器。
