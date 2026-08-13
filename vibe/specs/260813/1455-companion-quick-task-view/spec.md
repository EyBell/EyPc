# Standard Requirement Spec：伴侣快速任务查看与 Codex 键盘契约修复

Tool: claude
Date: 2026-08-13
Status: `automated-verified / host-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)

## Task Documentation Sync Group

- Group key: `dsg:eypc:companion-quick-task-view-v1`
- Group owner: this `spec.md`
- Scope: 本任务目录、Codex 伴侣 PRD/架构/soul 中的快捷键条款、用户说明。
- Shared-file ownership: 只改写 Codex 快捷键与悬浮卡片键盘相关段落；其它并行脏改动不属于本任务。
- Sidecar: 主线程；本任务未启用只读 Sidecar。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:companion-quick-task-view-v1",
  "group_owner": "vibe/specs/260813/1455-companion-quick-task-view/spec.md",
  "documents": [
    "vibe/specs/260813/1455-companion-quick-task-view/raw-requirement.md",
    "vibe/specs/260813/1455-companion-quick-task-view/spec.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/developer-soul.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "src/FloatApp.vue",
    "src/pages/CodexPage.vue",
    "src/styles/float.css",
    "src/float-env.d.ts",
    "src/platform/eypcPlatform.ts",
    "src/runtime/appRuntime.ts",
    "src/runtime/keybinding/keybindingRuntime.ts",
    "src/runtime/feature/featureRouting.ts",
    "preload/index.js",
    "public/preload.js",
    "public/plugin.json",
    "scripts/validate-utools-runtime.mjs"
  ],
  "validators": [
    "tests/runtime/keybinding.test.ts",
    "tests/runtime/keyboardEvent.test.ts",
    "tests/integration/featureRouting.test.ts",
    "tests/integration/appPluginEnter.test.ts",
    "tests/platform/codexFloatWindowBridge.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "tests/ui/codexCompanion.test.ts",
    "tests/unit/featureHelpCoverage.test.ts",
    "tests/unit/globalHotkeyConfigureCoverage.test.ts",
    "scripts/validate-utools-runtime.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260813/1455-companion-quick-task-view",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/developer-soul.md",
    "src/help/guides/codex.md"
  ]
}
```

## Current Contract

### 键盘派发所有权

- 悬浮卡片的命令派发只有一个入口：`window` capture 监听。根元素的冒泡处理保留给落在根内的事件；当事件目标不在根内（宿主刚显示子窗口、DOM 焦点仍在 `document.body`），capture 层补一次派发。补派发只在「目标不在根内」时发生，因此不与根/子层的 `@keydown.stop` 隔离冲突。
- 事件目标可能是 `Window` 而不是元素。派发前统一归一成真实元素（`event.target` → `document.activeElement` → `document.body`），下游的 `closest` / `blur` 判定不再各自防御。
- `Shift+Escape`、分层 `Escape` 与 Shift 预览记账仍由 window 层先行消费；消费后不再向下派发。

### `Ctrl+F` 与 Quick Jump

- `Ctrl+F` 在 Codex 域是**聚焦会话搜索**，与 ports/favorites/mqtt/windows 一致。`Ctrl+Shift+F` 保留为同一命令的别名。
- Quick Jump 保持 `F` / `Shift+F`，即其原始需求声明的唯一形态。`codex.quickJump.openForward` 现在绑定 `F`，在 Codex 域显式拥有该键。
- 本条取代 [PRODUCT_REQUIREMENTS.md#L214](../../PRODUCT_REQUIREMENTS.md#L214) 的 `Ctrl+F` 归属与 [ARCHITECTURE.md#L186](../../../knowledge/ARCHITECTURE.md#L186) 的「`Ctrl+Shift+F` reserved for search」。

### 焦点与列表移动

- `focusedKey` 是唯一的键盘游标真相。`focusedItem` 不再对 `focusItems[0]` 做隐式回退；一个 `immediate` 的 `focusItems` watcher 保证「列表非空即有游标」，并注册在 `renderRows` watcher 之前。
- `moveFocus` 区分「无游标」与「游标在第 0 项」：`findIndex` 为 `-1` 时 `↓` 落到首项、`↑` 落到末项；有游标时维持既有的**不环绕**夹取。
- 激活后的焦点落点不再依赖单个 `nextTick`。`focusFocusKey` / `focusQuickSearch` 使用有界渲染帧重试（3 帧），覆盖跨进程展开往返；超出帧数才放弃。

### 会话搜索框输入角色

- 搜索框声明 `data-input-role="codex-search"`，`floatInputRole()` 与 `shouldBlockTextInputShortcut` 同时识别。
- 白名单：`ArrowUp/Down`、`Shift+ArrowUp/Down`、`Ctrl+K/J`、`Enter`、`Ctrl+F`、`Ctrl+Shift+F`、`Ctrl+0…9`、`Escape`、`Ctrl+Alt+S`、`Shift+Escape`。
- 该白名单**只对 `codex-search` 生效**。`codex-composer`、别名编辑器与其它输入保持原有的完全隔离。
- `codex.list.up/down` 与 `codex.task.openFocused` 的 `when` 扩展 `|| activeInputRole == 'codex-search'`，与 `windows.list.up/down` 的写法同构。

### 快速筛选模式

- 入口：`plugin.json` 的 `eypc-companion-quick`（`mainHide`，稳定标签「快速任务查看」）、应用内 `Ctrl+Alt+K`（`codex.quick.activate`，已进 `SHORTCUT_RESERVATION_RULES`）。
- 冷启动直达：`preload/index.js` 的 `onPluginEnter` 对该 code 直接调用 `activateCodexFloat({ command: 'quick' })`，不依赖 Renderer 挂载。宿主未持有存活子窗口时返回 false，自然回落到 Kernel → Renderer 路由。
- 进入时：强制「动态」页签、清空搜索词与 selection/panel/composer/别名编辑器、展开卡片、聚焦搜索框。
- 任务池与排序完全复用 Kernel V4 的「动态」视图，不新增第二个 reducer。
- 编号只落在 `kind === 'task'` 的行，上限 10，随搜索结果实时重排。徽标是绝对定位、`pointer-events: none` 的覆盖层，不改变行高、列表顶边或行坐标；完整语义在行的 `aria-label` 里，徽标本身对读屏隐藏。
- 退出：`c-num` 打开后立即退出（意图已消费）；卡片收起时退出；`Escape` 分层为「预览/浮层 → 选择 → 搜索词 → 退出筛选模式 → 收起卡片」。

### 数字与跳转：`Alt` 是「直接打开」族

- `codex.task.openIndex.1…10`（`Alt+1…9` + `Alt+0`）：**只要展开卡片的任务列表在就可用**，不要求筛选模式。`when` 含 `!codexDrawerActive && !confirmOpen`，weight `190 - index`。
- `codex.quick.open.1…10`（`Ctrl+1…9` + `Ctrl+0`）：筛选模式专属，`when` 额外含 `codexQuickMode`，weight `200 - index`。
- `codex.drawer.select.1…9`（`Ctrl+1…9`）：`when` 含 `codexDrawerActive`，weight `120 - index`。
- 三者的守卫两两互斥，因此同一 chord 的多行语义在设置页是诚实的，且不互相报冲突。
- **编号徽标常驻**：因为 `Alt+数字` 始终可用，徽标不能只在筛选模式出现，否则就是隐藏快捷键。徽标随可见任务行实时重排；行的 `aria-label` 在筛选模式说「`Ctrl+N` 或 `Alt+N` 打开」，其余时候说「`Alt+N` 打开」。
- `codex.quickJump.openTasks`（`Alt+F`）是**专项跳转**：标记只落在带 `task:` 前缀 `data-focus-key` 的会话行上，激活等同于点击标题（`openTask(..., 'manual-quick-jump')`），而不是普通 `F` 的「转移高亮」。两种模式共用同一套标记分配、前缀筛选与 Escape 分层，靠 `quickJump.mode` 区分。
- `Alt+↑` / `Alt+↓` 的本地置顶排序不受影响。
- `codexQuickMode` / `codexDrawerActive` 由悬浮卡片自行填充；主窗口恒为 `false`。

### 配置页可达性

- Codex「快捷方式」为**每一个**已注册的 `*.hotkey.configure` 动作提供一行，并且**每行只配置它自己那条全局功能**。新增「快速任务查看」（去设置 + 立即进入）、「归档当前任务」、「Action 执行工作台」三行。此前 Action Runner 那行只在用户说明里被承诺、页面并不存在，`eypc-companion-archive` 则连 configure 动作都没有。
- 修正一处行与目标的错位：「悬浮球开关」行原本派发 `codex.hotkey.configure`，而后者配置的是「直接展开 Codex 卡片」。现在悬浮球开关走新的 `codex.float.toggle.hotkey.configure`（目标 `切换 Codex 悬浮球`），`codex.hotkey.configure` 归到「直接展开卡片」行并改名为「配置进入 Codex 卡片快捷键」；该行同时保留原有的「立即展开」。动作 id 未改名，已存的用户覆盖不受影响。
- `configureHotkey` 的标签必须是 `plugin.json` 里真实存在的 `cmds` 文案，否则 uTools 定位不到全局功能、「去设置」按钮点了没反应。`eypc-codex-completed-unread` 原本传的是它的 `explain` 而不是任何 cmd，本轮补进 `cmds`。
- [tests/unit/globalHotkeyConfigureCoverage.test.ts](../../../../tests/unit/globalHotkeyConfigureCoverage.test.ts#L1) 守住三条：标签必须在 cmds 里、动作必须有按钮派发、每个 configure 动作的标签必须属于它自己那个 feature code。

## Implementation Map

- 键盘契约与解析：[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1)。
- 悬浮卡片派发、焦点、筛选模式与编号：[FloatApp.vue](../../../../src/FloatApp.vue#L1)、[float.css](../../../../src/styles/float.css#L1)。
- 入口与路由：[public/plugin.json](../../../../public/plugin.json#L1)、[featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L1)、[appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1)。
- 宿主链路：[eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1) → [preload/index.js](../../../../preload/index.js#L1)（镜像 [public/preload.js](../../../../public/preload.js#L1)），子窗口类型 [float-env.d.ts](../../../../src/float-env.d.ts#L1)。
- 打包断言：[validate-utools-runtime.mjs](../../../../scripts/validate-utools-runtime.mjs#L1)。

## Verification

| Check | Result | Remaining gate |
| --- | --- | --- |
| 受影响聚焦测试 | `9 files / 288 tests` passed | none |
| D1 契约回归 | `Ctrl+F` → `codex.search.focus`、`F` → `codex.quickJump.openForward`、其它 Tab 不变 | none |
| D3/D4 游标回归 | 挂载即有唯一 `tabindex="0"`、首次 `↓` 到第 2 行、`↑` 回第 1 行且不环绕 | none |
| D5 输入角色回归 | `codex-search` 放行 `↑↓/Enter/Ctrl+数字`；`codex-composer` 全部拦截 | none |
| D7 派发回归 | 焦点在 `document.body` 时 `ArrowDown` 仍被 capture 分发器接住 | none |
| c-num 分流 | 筛选模式 → `codex.quick.open.N`；抽屉打开 → `codex.drawer.select.N`；两者无冲突报告 | none |
| 冷启动直达 | `eypc-companion-quick` 单发 `eypc-float:activate {command:'quick'}`，不重放给 Renderer；其它 code 不被吞 | none |
| Type/build/package | `pnpm run build` passed（typecheck + production build + runtime prepare + uTools validation） | none |
| `Alt` 直开族回归 | `Alt+数字` 不依赖筛选模式；`Alt+0` 是第 10 项；抽屉打开时让位；`Alt+↑↓` 仍是本地置顶 | none |
| `Alt+F` 专项跳转回归 | 标记数严格少于普通 `F`；激活派发 `codex.task.open`（`manual-quick-jump`）而非只转移高亮 | none |
| 配置页可达性回归 | 每个 `*.hotkey.configure` 都有派发控件；每个 `configureHotkey` 标签都在 `plugin.json` cmds 里 | none |
| Runtime identity | `host-663509d5b3e9a508e27d / renderer-4a6e75c942a6c41b7cd8`，状态为 `artifact-ready` | uTools 加载同一资产后才形成 `host-loaded` |
| Host acceptance | not run | 真实全局快捷键绑定、冷启动落点、真实 Deep Link 打开、Shift 预览与编号的渲染观察；macOS 上 `Alt(Option)+数字` 会输入特殊字符，需确认 `event.code` 归一在真实宿主同样成立；配置页四个「去设置」按钮实际能打开 uTools 全局功能页 |

## 与计划的偏差

- 计划中的「新增 `tests/ui/floatQuickView.test.ts`」改为在 [tests/ui/codexCompanion.test.ts](../../../../tests/ui/codexCompanion.test.ts#L1) 内新增用例：该文件已持有 `mountFloat` / `floatSnapshot` 装配器，另建文件需复制约 160 行装配代码。覆盖范围与计划一致。
- 打开任务的 Provider 动作来源复用既有 `local-shortcut`，未新增 `quick-open`：语义准确，且避免改动跨桥的动作来源联合类型。
