# Window Jump Workbench — Normalized Requirement

## Intent

Add an opt-in, keyboard-first EyPc surface that lets a user discover interactive desktop windows, save plugin-local aliases and favorites, and jump to a saved target from an EyPc page or from a stable uTools global-shortcut slot.

## 2026-07-28 User Supplement (Historical; superseded by WJ-20)

- Reproduce the reported `space-unbound-multiwindow` failure locally, research a more capable generic macOS route online, and allow bounded privacy-safe probes plus real host validation.
- Acceptance must prove the selected Chromium window itself becomes focused after a cross-Space slot jump; bringing only the owning application or a sibling window forward is not success.

## 2026-07-29 User Supplement (Historical; superseded by WJ-19)

- Fixed slot bindings must survive a computer/plugin restart without requiring the user to bind the same logical windows again. When a persisted native reference expires and the replacement window remains broadly consistent, EyPc should recognize and replace it automatically.
- Automatic replacement needs a conservative reusable rule set. It may learn from successfully verified replacements, but it must not choose an arbitrary sibling when one application or browser owns several similar windows.

## 2026-07-29 User Correction (WJ-18)

- A stable macOS window must not repeatedly report “目标窗口标题或所属应用已变化” when the selected native window has not changed.

## 2026-07-30 User Requirement (WJ-19)

- EyPc 的持久目标 ID 与当前操作系统窗口实例 ID 必须分层：`WindowTarget.id` 只标识插件内逻辑目标，`WindowInstanceId` 标识一个真实窗口生命周期。
- 浏览器切换 Tab 只会改变标题，不能让已收藏目标、槽位、焦点或激活引用失效；标题只用于展示、搜索和人工辨认。
- Windows 实例由当前 owner PID + HWND 构成，macOS 实例由 PID + CGWindowID 构成；操作前必须重新核验 owner/应用及可操作性，Renderer 将实例 ID 视为不透明值。
- 原实例消失后执行一次有界刷新。完整清单中的所有同平台、同应用窗口均是人工候选；即使只有一个，也必须由用户明确确认后才能在原生激活成功时换绑。Escape 取消并恢复原目标焦点。
- 完整清单无候选时仅清空实例绑定，保留收藏、别名和槽位；部分清单不能证明关闭或清除绑定。
- 旧 `titleLocator` 仅迁移为 `lastKnownTitle`，`titleHistory` 丢弃。旧 `lastNativeRef` 只有经过桥接层实例/应用验证并成功激活后才回填 `lastInstanceId`。
- WJ-19 明确取代 WJ-17 的标题相似度自动恢复与 WJ-18 的同源标题等值身份门禁。

## 2026-07-30 User Acceptance (WJ-19.1; Space-cache clause superseded by WJ-20)

- 用户要求在 WJ-19 实施后再次从原始需求和第一性原理统一核验，并明确“交互的方便性才是最核心的”；随后接受所识别问题并要求继续优化。
- 人工候选必须直接展示每个实时窗口自己的当前标题，不能重复原目标别名，也不能继承原目标的收藏、列表置顶或槽位徽标。
- 候选态是一条窄的确认/取消流程：进入时清空无关多选、聚焦候选列表；只允许移动焦点、`Enter` 确认、`Escape` 取消及显式刷新，不打开操作面板、编辑、收藏、置顶、关窗或改槽位。一次 `Escape` 必须先退出候选态并恢复原目标行焦点。
- 历史 WJ-19.1 约束曾要求在读取 Space 会话缓存前先核验完整实例；WJ-20 已删除整个 Space 缓存/查找/切换路径，当前实现不得再读取该缓存。
- `win32:PID:HWND` 是当前已观测窗口的原生定位键。HWND 可能被系统复用，因此 EyPc 必须在每次操作前复核可操作顶层窗口、owner PID 与应用；当前合同不承诺跨关闭/复用周期的数学绝对唯一性，失效后仍走人工换绑。

## 2026-07-30 User Acceptance (WJ-19.2)

- 用户继续追问“还有需要优化的吗”，并在确认剩余交互问题后要求继续优化；本轮仍以“方便完成正确换绑”为核心，而不是增加身份猜测或更多操作入口。
- 候选态中的显式刷新即使暂时没有同应用候选，也不能静默退出或把用户抛回普通列表。候选上下文必须保留，空态明确提示继续刷新或按 `Escape` 返回；完整清单确认无候选时仍按 WJ-19 清除已失效实例绑定，部分清单只能保留并补充候选。
- 候选说明同时展示逻辑目标别名与上次标题，候选行展示当前前台、最小化或部分清单缓存状态，所有标题与状态只帮助人工辨认，不参与自动匹配或换绑。
- 候选从空态重新出现或被完整清单替换时，焦点必须落到可确认候选；流程仍只能由成功确认或 `Escape` 明确结束。
- 用户进一步要求确保本轮优化不带回之前已经纠正的错误；标题相似/等值身份、唯一候选自动换绑、macOS 标题/序号回退、任何 Space 缓存/查找/切换以及候选态副操作都必须继续保持移除或阻断。
- 用户继续要求从第一性原理统一代码：关键身份与换绑逻辑必须封装，不能让候选集合、刷新证据、焦点恢复和动作禁用条件散落在 Runtime、页面与动作注册中。
- 当前增量采用一个会话级换绑状态机作为唯一流程所有者，并用一个 `always / browse / rebind` 交互策略入口约束所有窗口动作。平台桥接继续只负责证明 OS 窗口实例，页面只读取 Runtime 投影；不得借“统一框架”重新引入标题、序号、唯一候选或任意同应用窗口猜测。

## 2026-07-31 User Requirement (WJ-20; member-visibility clause superseded by WJ-21)

- 产品目标从“枚举每个原生表面”进一步收敛为“切换一个独立操作系统主窗口”：浏览器 Tab、IDE 编辑页、Sheet、Dialog、Tool Window 等内部成员只要能被原生关系证明属于同一根窗口，就必须映射到同一个根 `WindowInstanceId`，不得新增主列表记录或使收藏/槽位失效。
- 普通应用的两个独立主窗口仍是两个精确目标，不能因为应用、PID、标题相同而合并。无法证明成员关系时宁可保留独立根，也不使用标题、序号、唯一候选或同应用猜测。
- 任一已证明成员获得焦点或作为快捷键入口时，最终都激活并验证同一个根窗口；成员本身不展示、不收藏、不绑定槽位，成员标题只进入当前搜索/辨认元数据。
- Finder/Explorer 是专项展示：平台和规范化应用身份组成一个虚拟父节点，多个独立文件管理器根窗口作为始终稳定的二级子项；即使只有一个子窗口也保持父子结构。该专项树不能替代“所有应用按真实主窗口收敛”的全局要求。
- 文件管理器父节点可收藏、列表置顶、改名、绑定槽位，并按“当前焦点 → 上次成功根 → 会话最近根 → 当前树排序第一根”激活；无实时子窗口时保留目标且不自动启动应用。具体子窗口仍可精确收藏、改名、绑定槽位、窗口置顶和关闭。
- 整体列表使用语义树：`ArrowRight` 展开/进入首子项，`ArrowLeft` 返回父节点/收起，搜索命中子标题时临时展开，清空搜索恢复手动展开态；子项因收起而不可见时焦点回到父节点。
- 右键统一为“先聚焦，再打开现有右侧面板”，面板按 `window / file-manager-group / selection / slot` 上下文提供安全动作。虚拟父节点不参与批量选择，也不提供页面置顶、关闭全部或强制关闭全部。Escape 先关闭右侧面板，再处理搜索、编辑、换绑和选择。
- `WindowTarget` 使用 `scope: instance | file-manager-group`；重复旧目标只有在原生族证据证明同根时才无损合并，槽位全部重映射，收藏/列表置顶取并集，其他别名进入 `alternateAliases`。用户主动改名后清除备用别名。
- 原生桥只返回成员到根的证据，唯一 `coalesceNativeWindowFamilies` 与 `windowTree` 领域模块集中拥有根归一化、去重、文件管理器识别、排序、搜索、扁平可见树、焦点恢复、迁移合并和父节点落点。Runtime 与页面不得重新实现原生分组或标题身份判断。
- Windows 使用 `GA_ROOTOWNER` 并在激活后验证前台窗口的 root owner；macOS 使用 PID、CGWindowID、`AXWindow`、`AXTopLevelUIElement`、`_AXUIElementGetWindow` 与最终 `AXFocusedWindow` 根映射。WJ-20 移除旧环境快照、Space 查找/缓存/切换和标题门禁，不允许这些历史路径回流。
- 桥接版本为 `wj20-root-window-family`，双 preload 字节镜像。既有测试模块只更新合同，不创建新测试文件；测试、`vue-tsc`、构建、uTools 重载以及 Windows/macOS 真实跳转均不执行，统一标记 `未校验，待用户验收`。

## 2026-07-31 User Optimization (WJ-20.1)

- 用户要求再次把原始需求与实现统一核验，以实际交互结果和第一性原理为准，确认没有遗漏、矛盾或带回已经删除的错误路径。
- 窗口相关代码必须继续全局精简：关键规则应适当抽取封装，不允许行身份、目标解析、槽位映射、树投影、父子导航、选择过滤和动作上下文散落在 Runtime 与页面中重复实现。
- 集中化不能改变核心行为：内部成员仍只归入真实根，普通独立根仍分开，文件管理器父节点仍是展示/快捷入口，根失效仍人工换绑，标题/Space/序号/唯一候选旧路径仍不得回流。
- 当前权威需求中与 WJ-20 冲突的旧环境快照、Space 激活和 `ArrowRight` 操作层描述必须明确降为历史，避免文档重新驱动出错误实现。

## 2026-07-31 User Correction (WJ-21)

- 第一性目标是把稳定切换单位收敛为“主窗口”，同时保留用户可见、可验证的真实子窗口结构。WJ-20“成员全部吞并、不展示”的条款降为历史：普通应用必须展示“真实主窗口 → 真实子窗口”，同应用的多个独立主窗口保持并列一级项，不创建应用虚拟父节点。
- Finder/Explorer 是唯一例外，只显示固定两级“虚拟文件管理器父节点 → 真实主窗口”；文件管理器真实主窗口下面不再展示第三级子窗。
- 主窗口默认激活使用 `root-current`：请求只持有真实主窗口；执行时重新解析该根当前活动或最近活动的真实子窗口。因此子窗口、Tab、编辑页或对话变化不改变主窗口收藏、列表置顶、槽位和默认切换身份。
- 用户可选择一个真实子窗口执行 `member-exact`：请求同时携带根和成员，操作前重新验证平台、应用、实例与真实父根；精确子窗消失或关系失效时必须明确失败，不能静默回退到根或兄弟窗口。
- `WindowTarget` 仍只持久化真实主窗口或文件管理器虚拟组。真实子窗口只在会话清单中存在，不收藏、不列表置顶、不改名、不绑定槽位、不参与多选；只允许精确激活、能力允许时精确关闭、只读详情以及 Windows HWND 复制。强杀、页面置顶和批量动作只属于真实主窗口。
- 完整清单替换根和子窗；部分清单保留旧家族节点并标记缓存，不能证明某个子窗已经关闭。子窗消失、折叠或因搜索隐藏时，焦点回到其真实主窗口。
- 普通应用的真实主窗为 ARIA 一级 `treeitem`，真实子窗为二级；根 `Enter`/双击执行 `root-current`，子窗执行 `member-exact`。`ArrowRight/ArrowLeft` 负责展开、进入、返回和收起；搜索可临时展开命中子窗，但不能覆盖手动展开状态。继续使用现有 Vue 原生树和已选 `build-primitive` ARIA/焦点原则，不新增 UI 依赖。
- 平台桥必须只接纳可验证的用户可见、可操作窗口。Windows 只从 `EnumWindows` 顶层/owned popup 与 `GA_ROOTOWNER` owner 链建立关系，不调用会递归枚举控件 HWND 的 `EnumChildWindows`；过滤 `WS_CHILD`、cloaked、no-activate、透明隐藏、宿主、系统辅助和无有效窗口范围的表面。macOS 以普通前台应用中的有效 `AXWindow`/`AXSheet`/`AXDialog`、正 CGWindowID 及 `AXParent`/`AXTopLevelUIElement`/`AXWindow` 关系为准；Core Graphics 只做身份佐证，CG-only、系统层、辅助层和无可操作 AX 身份的表面全部省略。
- 两个平台都不得用标题、应用名、位置、尺寸或“唯一候选”猜父子关系，也不得绕过系统前台保护。根激活必须验证最终焦点仍属于请求根；精确子窗激活必须额外验证最终焦点命中请求成员。
- 桥接版本提升为 `wj21-main-child-window-tree`，canonical/public 双 preload 必须字节一致；旧 preload 必须提示重载并阻止混用。
- 需求、Controlled 任务、产品权威、架构、Developer Soul、状态页、窗口指南及 CodeNote EyPc 摘要必须同步；本轮不改变 EzAgentPlatform 共享合同。只执行镜像、版本、静态符号、代码链接和 `git diff --check` 检查，不新增/修改测试文件，不运行测试、类型检查、构建或真实 uTools 操作；宿主验收保持用户所有。

### Historical WJ-18 Detail (superseded by WJ-19)

- Exact activation may compare a saved Core Graphics title only with the current `kCGWindowName` for the same PID and CG window ID. It must not require a System Accessibility `AXTitle` to equal the Core Graphics title, because those APIs can expose different strings for the same window.
- Missing/unreadable current title evidence is an activation-verification failure, not proof that the window changed. A real title-change diagnostic requires an explicit same-source mismatch; exact `_AXUIElementGetWindow` and `AXFocusedWindow` checks remain mandatory for selecting and verifying the focused AX element.

## Product Decisions

- Support Windows and macOS in the first release. Windows uses top-level desktop-window APIs; macOS uses CoreGraphics inventory with a bounded System Events accessibility fallback.
- The feature is disabled by default. The Tab scans only after an explicit refresh; stable-slot global features use the session live-window cache first and may rescan once on miss. It does not run a background scanner or reload on every Tab enter.
- An alias is EyPc metadata only. The implementation never changes an application window title.
- Ten fixed slot commands, `EyPc 窗口槽 1` through `EyPc 窗口槽 10`, are `mainHide` uTools shortcut targets. Successful jumps do not show the plugin transit window; lost or ambiguous targets open the windows Tab with an exception reminder. Slot labels remain stable when an alias changes, and mappings are separated by platform.
- `mainHide` must remain the host-entry behavior, not a second generic Renderer hide. A slot and a manual workbench activation both use the same bounded recovery: stale native-reference `not-found` triggers one healthy real-time rescan and one retry. Only after a supported/listable/activatable capability and that rescan find no matching window may the outcome be accepted as `target-closed`; every other non-success is a blocking defect.
- Activation diagnostics are session-only Runtime records (at most 50) with an opaque id, time, slot/manual entry, slot number, platform, stage, stable code, level, and sanitized explanation. They never enter `AppState`, plugin storage, native references, raw host logs, or console output. The compact workbench exception panel must expose blocking records as alerts, confirmed closed targets as status, and a clear-this-session action.
- A separate detailed operation trace exists only when the renderer is a development build. It records the user-authorized selected target title plus bounded runtime/native stage+outcome pairs; it never records an application name, PID, handle, native reference, raw host output, or exception text. It stays in Runtime memory only, caps at 50 records, and has an independent clear action. A real installed build must neither request the native trace nor render its module. Under WJ-20 the trace contains only root-instance observation, mapping and final-focus stages; it does not capture an environment/Space snapshot or expose Space binding state.
- Window discovery and activation are capability-gated. macOS must explain missing Accessibility/Automation permission and expose a system-settings action; Windows reports a foreground-focus refusal rather than attempting an input or focus-protection bypass.
- “展开并前置” is the common window-open operation: Windows restores a minimized target before one foreground attempt; macOS restores `AXMinimized` where readable, requests the owning process/window foreground state, performs `AXRaise`, and verifies readable state. A readable post-raise `AXFocused=false` is non-authoritative after successful foreground and raise, so it is trace-visible but does not overturn activation. “页面置顶” is a separate Windows-only operation backed by `SetWindowPos(HWND_TOPMOST)` plus the same restore/foreground rules. macOS must state that it cannot force an arbitrary third-party window to remain permanently topmost and must not report a false success.
- On macOS, a Core Graphics window ID is an inventory/session reference, not a System Events `AXWindowNumber`. Activation revalidates the same PID/application/CGWindowID, then maps each owning-process `AXUIElement` through `_AXUIElementGetWindow` and requires exactly one element whose returned CG ID equals the selected reference. Final success requires `AXFocusedWindow` to map back to that same CG ID. Title/ordinal compatibility fallback is prohibited; a row without exact mapping has no stable actionable identity.
- Historical WJ-13–WJ-18 only: the bridge once resolved and switched a target Space through CG/SkyLight evidence. WJ-20 supersedes and removes this entire lookup/cache/switch route; no current activation branch may use a Space binding, environment snapshot, isolated-JXA Space resolver or current-Space inference.
- The Renderer and preload expose the same fixed `wj21-main-child-window-tree` revision; a stale/missing host bridge blocks activation with a reconnect instruction. PID/CGWindowID remains current root identity evidence, not a persisted Space binding.
- A slot validates its last native instance under exact platform/application ownership. A complete refresh missing that instance exposes every same-platform/same-application live instance for explicit confirmation, including a sole candidate; no title score or sole-candidate shortcut may replace it automatically. Only confirmed successful native activation commits the new instance/native/application/title fields. A partial inventory cannot prove closure or change binding.
- WJ-17 automatic recognition and the earlier WJ-13/WJ-18 title rules are retained only as historical evidence. WJ-19 never substitutes a sibling merely because it belongs to the same application or has the same/similar title.
- A local list pin is independent from favorite, OS page topmost, and slot assignment. Pinning a live row creates only the minimum EyPc target metadata needed to retain it; assigning a live row to a stable slot creates non-favorite retention by default; unpinning does not remove a favorite or slot mapping.
- Native discovery admits only actionable user-visible windows. macOS requires an admitted AX window role in a running regular application plus a positive CoreGraphics window number used only as identity corroboration; CG-only/system/helper surfaces never create rows. Windows requires a visible non-cloaked, activatable top-level or owned-popup HWND with valid bounds and filters child controls, no-activate, transparent, host and helper surfaces. Neither platform uses a title/position/size heuristic to infer relationships.

## Interaction Contract

- The page is a dense toolbar/list workbench. Pinned targets come first; every remaining saved/live row sorts globally by application name, then display name/title. Favorites and slot-bound targets remain visible when unavailable but do not override application ordering unless pinned. Search covers plugin alias, native title, and application name.
- Stable slots `1–10` live in a left collapsible vertical rail; empty slots open a picker to assign, assigned slots focus the bound target.
- `ArrowUp`/`ArrowDown` change the active tree row; `Enter` activates a root through `root-current` or a child through `member-exact`; `ArrowRight` expands any expandable root/group or enters its first child; `ArrowLeft` returns to the parent or collapses it. `Ctrl+ArrowRight` opens the right-side action layer, `Ctrl+ArrowLeft` returns to the list, and `Tab`/`Shift+Tab` move between list and action controls.
- `Shift+F2` edits the local alias, `F2` opens the complete target editor, `Ctrl+S`/`Enter` saves, `Escape` backs out from editor to actions to selection/search, `Space` toggles multi-selection and advances, and `Ctrl+R` manually loads/refreshes live windows. Favorite and pin are explicit action-panel commands; a pin toggle exposes `aria-pressed` and visible state.
- Text fields retain native editing ownership. Window-list shortcuts apply only outside an ordinary editor except for the named editor commands.

## Non-goals and Safety Boundaries

- No public uTools API is assumed for enumerating or activating another application window.
- macOS exposes a session window reference, not an HWND. Only Windows renders and copies an HWND.
- No real window title modification, hidden background polling, simulated input, accessibility privilege escalation, arbitrary external write, or focus-protection workaround is allowed.
- Saved data is limited to user-created target metadata (including a retained target required by a stable slot), the last verified instance/native reference, display-only `lastKnownTitle`, and platform-slot mappings in local plugin state. Unmatched live window titles remain transient runtime data; no title history or title-derived identity is persisted.

## Acceptance Scenarios

1. Two browser windows with the same title resolve to a user choice rather than an arbitrary activation.
2. A minimized Windows target is restored before foreground activation is attempted.
3. Closing a saved target produces a safe unavailable result and opens the windows workbench from a global slot hotkey; any later replacement requires explicit confirmation.
4. Renaming an alias leaves a configured uTools shortcut slot intact.
5. Windows reports focus refusal clearly; macOS reports missing permission, then retries after user approval.
6. Editing a target does not intercept native text editing keys.
7. Entering the windows Tab does not scan until the user manually loads or refreshes.
8. After a manual load, a global slot hotkey with a warm cache activates the OS window without showing the EyPc transit window.
9. A local pin moves the target ahead of unpinned rows without changing its favorite or slot state; unpinned rows remain application-sorted.
10. macOS CoreGraphics results unwrap into real rows instead of an empty successful cache; browser/helper native surfaces that are not actionable application windows remain absent.
11. Historical WJ-08 acceptance (superseded by WJ-19): a stale slot reference once allowed automatic recovery; current behavior always requires explicit replacement confirmation.
12. A truly closed target is reported only after a healthy complete rescan finds neither the saved instance nor any same-app candidate; it clears the retained instance/native reference and records `target-closed`. Partial inventory and every other failure retain binding and remain blocking/visible.
13. A macOS window activates only through a unique `_AXUIElementGetWindow` mapping to its CGWindowID; missing, duplicate or unknown mapping is blocking and never falls back to title/ordinal.
14. A development run may clear and inspect bounded sanitized operation stages for an activation, while a real installed build renders no operation-trace module and requests no native trace.
15. Windows “页面置顶” restores, makes the real window topmost, and attempts foreground activation; macOS clearly blocks permanent third-party topmost while retaining “展开并前置”. Assigning a live row to a stable slot alone does not make it a favorite.
16. Historical WJ-13–WJ-18 acceptance (superseded by WJ-20): cross-Space lookup/switch and `space-unbound-multiwindow` no longer exist. Current macOS success requires exact root CG↔AX mapping and final focused-root verification only.
17. Historical WJ-13 acceptance (superseded by WJ-19): process-frontmost retry is no longer an identity fallback; unbound stable identity blocks.
18. Historical WJ-13–WJ-18 acceptance (superseded by WJ-20): `space-ambiguous` and `space-switch-timeout` belonged to the removed Space route and are no longer current diagnostics.
19. A stale preload revision produces `bridge-stale` before native activation. Historical pre-initial/pre-retry environment snapshots are removed; current development traces contain bounded root-native stages only.
20. Historical WJ-13/WJ-17 acceptance (superseded by WJ-19): title change/similarity no longer decides whether a replacement may bind; every replacement remains explicit.
21. Historical WJ-16 acceptance (superseded by WJ-20): preload-session Space bindings and direct/reverse lookup caches are removed, so no slot activation may read, seed or evict them.
22. A macOS Core Graphics row with `kCGWindowIsOnscreen=false` must not be classified as minimized solely from that field because ordinary windows on another Space are also offscreen. Complete list snapshots may evict absent rows; partial/current-Space snapshots must merge into the prior session list, visibly mark retained rows as cached, and must not prove `target-closed`.
23. Historical WJ-17 acceptance (superseded by WJ-19): title similarity no longer authorizes automatic restart replacement, even for one candidate.
24. Every same-platform/same-application replacement candidate is explicit, regardless of title or candidate count. EyPc retains the logical target/slot and changes binding only after confirmation plus native success.
25. Historical WJ-18 acceptance (superseded by WJ-19): same-source title comparison no longer exists; an unchanged macOS target passes only the PID/application + CGWindowID + exact AX mapping/focus chain.
26. The same `instanceId` remains the same live target across arbitrary title changes, including browser Tab changes, empty titles and the literal title `Window`.
27. Equal application/title with different `instanceId` never matches automatically.
28. A complete refresh with one replacement candidate still enters manual confirmation; Escape restores the logical target row and successful Enter activation alone updates binding.
29. Legacy locator data becomes `lastKnownTitle`, history is removed, and a legacy native reference gains `lastInstanceId` only from bridge-verified activation success.
30. Windows rejects non-actionable, owner/app-mismatched or no-longer-current HWND observations and never treats `PID+HWND` as a persistence guarantee across handle reuse; macOS rejects rows or activations without a positive CGWindowID and exact AX mapping/readback. Canonical/public preload behavior remains byte-identical.
31. Candidate rows show their own live titles and no inherited favorite/pin/slot state. Entry focuses the first candidate and clears unrelated selection; one Escape exits directly and restores the original target row. Candidate-mode side actions remain unavailable.
32. Historical WJ-19.1 acceptance (superseded by WJ-20): the full-instance-before-Space-cache ordering remains evidence for why the old route was safe, but the current bridge has no Space cache or switch branch.
33. An open candidate flow survives complete-empty, partial-new, partial-empty and complete-replacement refreshes. Complete-empty clears only the stale instance/native binding, partial snapshots retain and add candidates, returned/replacement candidates regain focus, and no refresh auto-confirms or silently exits.
34. Candidate lifecycle state, complete/partial inventory transitions, stale-binding effects, candidate focus and cancel focus restoration are decided by one pure state machine. Runtime only adapts its effects, action availability uses one shared policy, and the page consumes a read-only rebind projection.
35. Ordinary applications display independent real roots as level-one rows and only bridge-proven real children as level-two rows. Activating a saved root after its child changes opens the root's current/last member without changing the saved target; choosing a child activates exactly that member.
36. A missing or relation-mismatched child produces an explicit exact-member failure and never activates the root or a sibling. Children never persist, favorite, pin, bind slots, join selection, edit, force-terminate or request page-topmost; exact close appears only when the bridge reports it closable.
37. Finder/Explorer remains exactly two levels—virtual parent to real roots—and never exposes a third child level. Two independent ordinary roots in one application remain two level-one rows.
38. macOS CG-only/system/helper surfaces and Windows child-control/no-activate/cloaked/transparent/host/helper handles never enter the product tree. Unproven visibility, actionability or parentage is omission, not an app-level fallback group.
39. A complete snapshot replaces root/child membership; a partial snapshot retains cached family nodes and cannot prove a child closed. When a child disappears, collapses or becomes search-hidden, focus returns to its root; search auto-expansion never mutates manual expansion state.
