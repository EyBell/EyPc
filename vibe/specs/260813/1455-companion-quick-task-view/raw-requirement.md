# RAW-167：伴侣快速任务查看与 Codex 键盘契约修复

Tool: claude
Date: 2026-08-13

## 原始诉求

> 增加一个全局快捷操作, 可以去触发快速任务查看。页面放在这个 utools 插件 悬浮的这个目录上，类似于 easy clipboard 这种筛选模式，可以通过快捷键 c-num 快速切换任务，也可以通过上下键切换，还有 Shift 键预览。快捷键需要可以共用，只不过在不同的功能 Tab 页里面会有不同的解释。

> 当前应该已经有了一个这样的快捷键, 只不过当前的触发交互还不够完善, 你需要去核验并完善一下。比如：CTRL-F 触发搜索时，会被 F 的功能进行取代。说明快捷键的映射方式识别得不够清晰, 焦点的关注也有问题, 上下键的移动也有问题。

> 之前也定义过一系列快捷键的交互方式, 应该是有这样的原始需求, 但是它现在实现的效果十分不好。

## 核验结论：入口已存在，缺陷在交互

`eypc-codex-activate`（「进入 Codex 卡片」，`mainHide`）与应用内 `Ctrl+Alt+Enter` 已经路由到 `codex.float.activate`，悬浮卡片也已具备搜索框、上下键、Shift 预览与 `Ctrl+数字`。本需求因此不是新建面板，而是**修复既有交互 + 在其上补齐筛选模式**。

以下缺陷为源码追踪级定位，实现前均可在指定 file:line 复现推导：

| ID | 缺陷 | 成因 |
| --- | --- | --- |
| D1 | `Ctrl+F` 在 Codex 域触发 Quick Jump 而不是搜索 | `codex.quickJump.openForward` 占用 `Ctrl+F` 且 layer `codex`(500) 恒胜 global `search.focus`(100)，搜索被挤到 `Ctrl+Shift+F` |
| D2 | 激活后 DOM 焦点大概率落空 | `onActivate` 用一个 `nextTick` 抢跨进程展开往返，`querySelector` 拿不到行就无声放弃 |
| D3 | 首次 `↓` 跳过第 1 项、首次 `↑` 无反应 | `moveFocus` 用 `Math.max(0, findIndex(...))` 把「无游标」折叠成「游标在第 0 项」 |
| D4 | 高亮与键盘游标是两个东西 | `focusedItem` 的 `\|\| focusItems[0]` 隐式回退让界面高亮首行、而游标仍为空 |
| D5 | 搜索框吞掉一切按键 | 悬浮卡片没有 `codex-search` 输入角色，`editing` 分支一刀切 return |
| D6 | Shift 预览在筛选时完全失效 | `previewBlocked()` 把「任意输入有焦点」当作阻断条件 |
| D7 | 焦点在 `document.body` 时几乎所有快捷键静默失效 | 命令派发挂在根元素冒泡上；焦点在 body 时事件不会冒泡到根，只有 capture 监听的 Esc/Shift 存活 |

D7 是「快捷键的映射方式识别得不够清晰」的机械成因，D2+D3+D4 合起来是「焦点的关注也有问题 / 上下键的移动也有问题」。

## 规范化需求

- 新增 `mainHide` 全局特性「快速任务查看」，冷启动（Renderer 未挂载）由宿主直接激活悬浮卡片进入筛选模式。
- 筛选模式复用悬浮卡片「动态」视图与现有搜索，不新增第二个 reducer、不新建子窗口。
- 前 10 条可见任务行显示编号，`Ctrl+1…9` / `Ctrl+0` 直接打开对应任务（一击即达，与 `favorites.quick.open.N` 语义一致）。
- 编号随搜索结果实时重排；所见即所开。
- 上下键在搜索框有焦点时仍可移动列表；`Shift` 预览在筛选模式下可用；`Enter` 打开当前游标项。
- 快捷键继续按现状共用 chord、由 `when` 分流：`Ctrl+数字` 在筛选模式下是「打开第 N 条」，在抽屉打开时是「执行抽屉第 N 项」，两条守卫互斥。

## 需求变更评审（Requirement Change Review）

`superseded`：`Ctrl+F` 在 Codex 域的 Quick Jump 归属。

- 现行来源：[PRODUCT_REQUIREMENTS.md#L214](../../PRODUCT_REQUIREMENTS.md#L214)「continues to own … `Ctrl+F/R` … F/Shift+F Quick Jump」；[ARCHITECTURE.md#L186](../../../knowledge/ARCHITECTURE.md#L186)「`Ctrl+Shift+F` reserved for search」。
- 冲突事实：Quick Jump 的原始需求 [260626-eypc-global-quick-jump/01-spec.md#L11](../../260626-eypc-global-quick-jump/01-spec.md#L11) 只声明 `F` / `Shift+F`；`Ctrl+F` 是后加的，且使 Codex 成为全插件唯一 `Ctrl+F` 不等于搜索的 Tab（ports/favorites/mqtt/windows 全部是搜索）。
- 决策（`explicit-current-request`）：按最新用户需求收敛 —— `Ctrl+F` = 聚焦会话搜索；`F` / `Shift+F` 保持 Quick Jump；`Ctrl+Shift+F` 保留为搜索别名。被取代条款在原处标注，不留待再次引用。

`added`：`codex.quick.activate`、`codex.quick.open.1…10`、`codex-search` 输入角色、`codexQuickMode` / `codexDrawerActive` 上下文、`eypc-companion-quick` 特性。

`changed`：`codex.drawer.select.N` 补上缺失的 `codexDrawerActive` 守卫（此前抽屉未打开时也会解析成一个没有目标的抽屉动作）；`codex.list.up/down`、`codex.task.openFocused` 的 `when` 扩展 `codex-search`。

## 同轮追加需求

用户在实现过程中追加了三条，均已落地：

1. **配置页缺一键配置** —「这个快捷方式是不是没有配置页？在配置页面没有直接一键快速配置的，只有一个快速打开」。核验发现 `codex.quick.hotkey.configure` 动作已注册但没有任何按钮派发它；同一面板的 `codex.actionRunner.hotkey.configure` 也是同样的孤儿动作（用户说明里却已承诺存在），并且 `codex.completed-unread.hotkey.configure` 传的标签不在 `plugin.json` 的 cmds 里，按钮点了不可能生效。
2. **`Alt+数字` 直开** —「卡片展开的时候，alt+数字的点击打开效果也需要补全」。`Alt+数字` 成为不依赖筛选模式的常驻打开路径；编号徽标随之常驻，避免隐藏快捷键。
3. **`F` 专项跳转** —「增加一个快速跳转专项的匹配，即直接触发展示行标题行的点击效果」。新增 `Alt+F`：标记只落在展示出来的会话行上，激活等同于点击标题直接打开，而不是普通 `F` 的只转移高亮。

这三条合起来确立了一条可学习的规则：**`Alt` 在 Codex 域统一表示「直接打开」**（`Alt+数字` 开第 N 条，`Alt+F` 用标记开任意一条），`Ctrl` 保留给搜索与模式内动作。

## 安全与范围

- 不新增子窗口、不新增 preload 资产、不引入 `utools.setSubInput` / `setFeature`。
- 搜索框按键白名单严格以 `activeInputRole === 'codex-search'` 为前置，绝不放给 `codex-composer`。
- 打开任务复用既有 Host Deep Link 路径与已读推进语义，不新增 Provider 动作来源、不写 Codex/Claude 原生状态。
- 编号徽标是绝对定位、`pointer-events: none` 的瞬时提示层，不改变行高、列表顶边或行坐标。
- 不启动 `serve` / uTools / 真实宿主；真实全局快捷键、冷启动、Deep Link 打开与视觉验收由用户所有。

## 验收意图

- 冷启动按下全局键即展开卡片并落到搜索框，一次到位。
- 边打字边 `↑↓` / `Shift` 预览 / `Enter` 打开 / `Ctrl+数字` 直开，互不打架。
- `Ctrl+F` 是搜索、`F` 是 Quick Jump；其它 Tab 的 `Ctrl+F` 语义不变。
- 首次 `↓` 落在第 1 行；`Escape` 分层为「预览/浮层 → 选择 → 搜索词 → 退出筛选模式 → 收起卡片」。
- 同一 chord 的两种释义不得互相报冲突。
