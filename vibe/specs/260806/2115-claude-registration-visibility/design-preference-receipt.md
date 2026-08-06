# 设计偏好查询回执：Claude 注册状态可见

Gate: `design-preference-gate: accepted`（[vibe/rules/README.md](../../../rules/README.md#L5)）· Date: 2026-08-06

## 查询的权威

- [developer-soul.md](../../../knowledge/developer-soul.md#L1) → `Codex Companion Taste`
- [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L99) → `Companion 多来源汇总` / `Codex Companion`

## 命中的条款与它们如何约束了实现

| 条款 | 约束 | 本轮的落法 |
| --- | --- | --- |
| RAW-087 无回读与配置密度（soul 2026-07-24）：「explanatory detail 放在可聚焦信息控件后，避免常驻说明文案」 | 六行说明不能常驻页面 | 每行只有 `标签 + 短状态值`，解释全在 `codex-tip` 可聚焦按钮的悬停/聚焦提示里 |
| RAW-133 诊断统一（soul 2026-07-30）：「一份 Domain 拥有的诊断 schema、紧凑常驻摘要、焦点等价的原生按钮详情；避免重复字段清单与鼠标专用伪按钮」 | 不得在渲染层现编状态判断，不得用 `role="button"` | 状态判断是纯函数 `claudeRegistrationRows()`；提示控件是真 `<button>`，测试正向断言源码不含 `role="button"` |
| soul 2026-07-18 就绪度反馈：「分离的系统/运行时/进程/配置状态行 + 精确补救 + 不用颜色单独表意」 | 状态不能只靠颜色 | 每行的值本身就是文字（已注册/已过期/未注册），色调只是附加；`未知` 用 muted 而非警告色 |
| soul 2026-07-19 诊断一致性：「成功的往返优先于缺失的附加能力，不要在额度可见时报红」 | 缺 CLI 不得让健康面板看起来坏了 | `命令行程序` 行固定 muted，不进警告；与 `claudeSetupHint` 把缺二进制排最后同源 |

## 未新增的东西

不新增视觉语言：复用既有 `.codex-diagnostic-grid` 的行结构与 `codex-tip` 提示控件，只重述 tone 颜色（该 grid 原先靠外层诊断横幅的 `currentColor`，而本面板是白底）。不新增开关、不新增 Tab、不新增常驻文案行。

## 保留的偏差

`.codex-claude-grid` 的三个 tone 颜色是本页固定色值（`#087d73 / #8a5a00 / #526872`），与设置页其余固定色一致；本页尚未接入外观 token 体系，未就此扩大改动范围。
