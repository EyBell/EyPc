# Window Jump Workbench — Controlled Specification

Tool: codex
Updated: 2026-08-01

## Status

`wj21-main-child-window-tree / implemented / focused-tests-typecheck-build-verified / host-validation-pending`

真实主窗口是稳定持久目标；普通应用只展示原生桥证明的真实子窗口作为会话级精确落点；Finder/Explorer 固定为虚拟父→真实根两级。无法证明为用户可见、可操作窗口或无法证明关系的表面不进入产品树。

## Authority

- 当前用户事实：[raw-requirement.md](raw-requirement.md#L1)
- 产品权威：[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)
- 架构权威：[ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L1)
- 验证记录：[verify.md](verify.md#L1)
- 当前状态：[PROJECT_STATUS.md](../../PROJECT_STATUS.md#L1)

## Current Contract

### Domain and persistence

- [windows.ts](../../../../src/domain/windows.ts#L1) 是原生观察准入后关系、能力、`WindowFamily { root, children }`、持久目标解析和 `root-current`/`member-exact` 请求的唯一领域 owner。
- 根是唯一普通持久目标；文件管理器虚拟组是唯一虚拟持久目标。子窗口、前台/最小化/缓存状态与原生家族清单只保留在 Runtime 会话。
- 完整清单替换家族；部分清单合并新观察并保留缺席节点为缓存，不能证明根或成员关闭。
- [windowRebind.ts](../../../../src/domain/windowRebind.ts#L1) 只处理持久根实例失效后的人工换绑。所有候选包括唯一候选都必须明确确认，且只有原生激活成功才提交新实例绑定。

### Product tree

- [windowTree.ts](../../../../src/domain/windowTree.ts#L1) 独占树行身份、层级、排序、搜索投影、手动/临时展开、动作上下文、根专属选择、左右导航及焦点恢复。
- 普通应用：真实根为一级，已证明真实子窗为二级；同应用独立根并列，不存在应用虚拟父节点。
- Finder/Explorer：虚拟组为一级、真实根为二级，根下面的成员不投影，确保永远没有第三级。
- 子窗口不创建/修改持久目标，不收藏、pin、改名、绑槽、多选、置顶、强杀或批量操作；只开放精确激活、可关闭时精确关闭、只读详情和 Windows HWND 复制。

### Activation

- 根行和槽位发送 `root-current`，只携带根身份；原生调用时重新解析该根当前/最近活动成员，最终焦点必须仍属于请求根。
- 子行发送 `member-exact`，携带根与成员；调用前重验平台、应用、实例和关系，最终焦点必须命中该成员。
- `member-exact` 的成员缺失、关系漂移或焦点不匹配均明确失败，不得重试 `root-current` 或打开兄弟窗口。

### Platform admission

- Windows 仅枚举 `EnumWindows` 顶层/owned popup；准入要求可见、非 cloaked、可激活、有效范围，并以同应用 `GA_ROOTOWNER` 证明关系。`WS_CHILD`、no-activate、透明、宿主、系统/helper 表面被过滤，`EnumChildWindows` 禁止使用。
- macOS 从普通应用的允许 AX 窗口角色出发；`_AXUIElementGetWindow` 与正 CGWindowID 佐证身份，`AXParent`/`AXTopLevelUIElement`/`AXWindow` 证明根关系。CG-only、系统层、辅助层和不可操作 AX 表面不生成行。
- 标题、应用名、位置、尺寸、列表顺序和候选数量不得推断身份或关系。环境快照、Space 查找/缓存/切换、标题/序号回退和应用级前台猜测均不存在。

### Runtime and UI

- [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1) 先验证桥版本，再通过单一 inventory 更新入口原子更新 family/root/freshness；原生副作用只经现有 platform seam。
- [WindowsPage.vue](../../../../src/pages/WindowsPage.vue#L1) 只渲染领域 `WindowRow`。根/子使用 ARIA level 1/2；搜索临时展开不改手动状态；子窗消失、收起或隐藏时焦点和打开的动作上下文回到根。
- `ArrowRight/ArrowLeft` 负责树展开、进入、返回和收起；`Ctrl+ArrowRight/Ctrl+ArrowLeft` 负责动作层；右键先聚焦，`Escape` 先关闭动作层。
- 功能默认关闭、页面显式刷新、十个 `mainHide` 槽位和会话级隐私安全诊断沿用既有合同。桥版本不匹配时不得接纳清单或执行窗口动作。

## Safety and Non-goals

- 不修改真实窗口标题，不模拟输入，不提升权限，不绕过 Windows 前台保护，不自动启动已关闭应用，不后台轮询窗口。
- macOS 不宣称可将任意第三方窗口永久置顶；强制终止只在用户明确确认后作用于根窗口。
- 本任务不改变 Files、Ports、MQTT、Codex、存储 schema 或 EzAgentPlatform 共享合同。

## Supersession Boundary

WJ-11–WJ-18 的 Space/标题路线和 WJ-20 的成员隐藏方案只保留于 Git 历史与对应错误记忆，不再展开在当前 Spec、Plan、Tasks 或 Verify 中。当前行为只由 WJ-21 合同及仍适用的 WJ-19 根实例人工换绑合同共同定义。
