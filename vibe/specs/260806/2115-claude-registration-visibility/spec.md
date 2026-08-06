# Spec：Claude 注册状态可见 + 一致性偏差收口

RAW: [raw-requirement.md](raw-requirement.md#L1) · Receipt: [design-preference-receipt.md](design-preference-receipt.md#L1)

## 1. 注册状态逐项可见（用户第 3 点）

新增纯函数 `claudeRegistrationRows(environment, now)`（[companionPresentation.ts](../../../../src/domain/companionPresentation.ts#L1)），返回固定六行：

| id | 标签 | 值 | tone |
| --- | --- | --- | --- |
| `hooks` | 事件钩子 | 已注册 / 已过期 / 未注册 / 未知 | ready / warning / warning / muted |
| `statusline` | 状态栏包装 | 已注册 / 未注册 / 未知 | ready / warning / muted |
| `auth` | 登录状态 | 已登录 / 未登录 | ready / warning |
| `cli` | 命令行程序 | 已找到 `<版本>` / 未找到 | ready / **muted** |
| `home` | 数据目录 | 可读 / 不可读 | ready / warning |
| `checked` | 最近检查 | 刚刚 / N 分钟前 / … / 尚未检查 | muted |

三条设计决定，都是可被后续轮次推翻的判断，所以写在这里：

- **行集合固定，不按问题过滤**。只在坏掉时出现的诊断无法用来确认"一切正常"，而用户的原话正是"可看、可查"。
- **缺 CLI 不是警告**。二进制只服务"从卡片跳回会话"这一个动作，把它标红会让状态与额度都正常的面板看起来是坏的——与 `claudeSetupHint` 把它排到最后同源（[claude-readiness-gated-on-unneeded-capability](../../../knowledge/error-memory/claude-readiness-gated-on-unneeded-capability.md#L1)）。
- **不含任何文件系统路径**。与 `claudeSetupHint` 同一隐私边界，有正向断言。

`elapsedText()` 抽出为共享私有助手，`companionQuotaFreshnessText` 改用它，输出逐字节不变（「读数刚刚更新」「读数更新于 N 分钟前」），避免同一个"多久以前"出现两套措辞。

### 渲染

[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 的「运行 → 接入来源」面板，在两个开关与注册按钮之间插入 `dl.codex-diagnostic-grid.codex-claude-grid`，复用既有诊断行结构；说明走 `codex-tip` 可聚焦按钮。[codex.css](../../../../src/styles/codex.css#L262) 只重述 tone 颜色（该 grid 原本继承诊断横幅的 `currentColor`，本面板是白底）。

### 过期钩子的可达性修复

`claudeRegistered` 原为 `hooks === 'installed'`，于是 `outdated` 时按钮写「注册事件钩子」、且「移除钩子」整个消失——状态行同时在说「已过期，请重新注册」。改为 `installed || outdated`。移除路径按标记匹配，`outdated`（标记在、命令串不符）同样能干净卸载，因此这一改动不扩大写入面。

## 2. 一致性偏差收口（用户第 1 点）

- **桌面端不产生未读**上升为产品合同：[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L103) 新增「无法证明已读的来源不产生未读」，作为「角标以状态为准」的唯一限定；[桌面端 spec](../1130-claude-desktop-provider/spec.md#L5) 的「角标合并待定」相应结案。
- **过期额度窗口分支补测**：`companionResetDetailText` 的 `now >= resetAt`（`额度窗口已重置 · 等待新读数`）此前只有实现没有用例，补两条（含 `now === resetAt` 边界）。
- **[1046 verify.md](../1046-claude-quota-status-visibility/verify.md#L1) 计数漂移**更正：该测试文件与并发的桌面端轮共享，按文件总数记账必然互相打架，改为「本轮新增 N 项 + 文件当前总数」。

## 明确不做

- 不消除「未注册钩子 → 无实时推送」这一边界（用户第 3 点要的是让它可见，不是消除它）。
- 不新开功能 Tab、不新增开关、不动 preload / 注册写入逻辑本身。
- 不代跑宿主验收（用户第 2 点：本人稍后进行）。

## 验收

- 聚焦测试：`companionPresentation`（+7 注册行 +1 过期窗口）、`codexCompanion` UI 合同（+2 源级断言）。
- `vue-tsc --noEmit` 0 错误；`vite build` + `prepare-utools-runtime` + `validate-utools-runtime` 通过。
- 帮助文档 [codex.md](../../../../src/help/guides/codex.md#L1) 新增「在设置里查注册状态」（`EYPC-FEATURE-HELP-001`）。
- 宿主视觉验收归用户。
