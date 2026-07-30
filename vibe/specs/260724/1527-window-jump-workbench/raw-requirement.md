# Window Jump Workbench — Normalized Requirement

## Intent

Add an opt-in, keyboard-first EyPc surface that lets a user discover interactive desktop windows, save plugin-local aliases and favorites, and jump to a saved target from an EyPc page or from a stable uTools global-shortcut slot.

## 2026-07-28 User Supplement

- Reproduce the reported `space-unbound-multiwindow` failure locally, research a more capable generic macOS route online, and allow bounded privacy-safe probes plus real host validation.
- Acceptance must prove the selected Chromium window itself becomes focused after a cross-Space slot jump; bringing only the owning application or a sibling window forward is not success.

## 2026-07-29 User Supplement

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
- A separate detailed operation trace exists only when the renderer is a development build. It records the user-authorized selected target title plus bounded runtime/native stage+outcome pairs; it never records an application name, PID, handle, native reference, raw host output, or exception text. It stays in Runtime memory only, caps at 50 records, and has an independent clear action. A real installed build must neither request the native trace nor render its module. A read-only environment snapshot (native/AX instance match counts and Space binding status) is captured before each activation attempt and displayed as a trace line in the development sidebar; it is session-only, never persisted, and does not activate, raise, focus, close, or switch any window or Space.
- Window discovery and activation are capability-gated. macOS must explain missing Accessibility/Automation permission and expose a system-settings action; Windows reports a foreground-focus refusal rather than attempting an input or focus-protection bypass.
- “展开并前置” is the common window-open operation: Windows restores a minimized target before one foreground attempt; macOS restores `AXMinimized` where readable, requests the owning process/window foreground state, performs `AXRaise`, and verifies readable state. A readable post-raise `AXFocused=false` is non-authoritative after successful foreground and raise, so it is trace-visible but does not overturn activation. “页面置顶” is a separate Windows-only operation backed by `SetWindowPos(HWND_TOPMOST)` plus the same restore/foreground rules. macOS must state that it cannot force an arbitrary third-party window to remain permanently topmost and must not report a false success.
- On macOS, a Core Graphics window ID is an inventory/session reference, not a System Events `AXWindowNumber`. Activation revalidates the same PID/application/CGWindowID, then maps each owning-process `AXUIElement` through `_AXUIElementGetWindow` and requires exactly one element whose returned CG ID equals the selected reference. Final success requires `AXFocusedWindow` to map back to that same CG ID. Title/ordinal compatibility fallback is prohibited; a row without exact mapping has no stable actionable identity.
- A CG-backed macOS target resolves its Space from the exact CG window ID. Direct per-window queries and managed-Space reverse lookup are deduplicated against the current display map: a current binding skips switching, one remote binding may switch, and multiple remote bindings block. If the uTools Electron preload returns no bindings, the same PID/application/CGWindowID validation and SkyLight lookup may run in a fresh bounded JXA process; only a unique isolated binding may switch and it must be confirmed. Multi-window-unbound evidence blocks; a single-owner/current-Space inference may continue only to exact AX-instance activation, never title, ordinal, process-frontmost or desktop-walk guessing.
- Space bindings are session-only. EyPc must not persist a CG window ID, PID/title key, Space ID, or display UUID as a learned activation binding. The Renderer and preload expose the same fixed bridge revision; a stale/missing host bridge blocks activation with a reconnect instruction.
- A slot validates its last native instance under exact platform/application ownership. A complete refresh missing that instance exposes every same-platform/same-application live instance for explicit confirmation, including a sole candidate; no title score or sole-candidate shortcut may replace it automatically. Only confirmed successful native activation commits the new instance/native/application/title fields. A partial/current-Space inventory cannot prove closure or change binding.
- WJ-17 automatic recognition and the earlier WJ-13/WJ-18 title rules are retained only as historical evidence. WJ-19 never substitutes a sibling merely because it belongs to the same application or has the same/similar title.
- A local list pin is independent from favorite, OS page topmost, and slot assignment. Pinning a live row creates only the minimum EyPc target metadata needed to retain it; assigning a live row to a stable slot creates non-favorite retention by default; unpinning does not remove a favorite or slot mapping.
- Native discovery admits only actionable application windows. macOS requires a valid CoreGraphics window number backed by a running regular application; Windows requires an existing visible non-cloaked top-level/Alt-Tab-eligible handle and rejects tool/helper/native browser handles that are not the active root/popup surface. Neither platform uses a size threshold.

## Interaction Contract

- The page is a dense toolbar/list workbench. Pinned targets come first; every remaining saved/live row sorts globally by application name, then display name/title. Favorites and slot-bound targets remain visible when unavailable but do not override application ordering unless pinned. Search covers plugin alias, native title, and application name.
- Stable slots `1–10` live in a left collapsible vertical rail; empty slots open a picker to assign, assigned slots focus the bound target.
- `ArrowUp`/`ArrowDown` change the active row; `Enter` attempts activation; `ArrowRight` opens the right-side action layer; `ArrowLeft` returns to the list; `Tab` and `Shift+Tab` move between list and action controls.
- `Shift+F2` edits the local alias, `F2` opens the complete target editor, `Ctrl+S`/`Enter` saves, `Escape` backs out from editor to actions to selection/search, `Space` toggles multi-selection and advances, and `Ctrl+R` manually loads/refreshes live windows. Favorite and pin are explicit action-panel commands; a pin toggle exposes `aria-pressed` and visible state.
- Text fields retain native editing ownership. Window-list shortcuts apply only outside an ordinary editor except for the named editor commands.

## Non-goals and Safety Boundaries

- No public uTools API is assumed for enumerating or activating another application window.
- macOS exposes a session window reference, not an HWND. Only Windows renders and copies an HWND.
- No real window title modification, hidden background polling, simulated input, accessibility privilege escalation, arbitrary external write, or focus-protection workaround is allowed.
- Saved data is limited to user-created target metadata (including a retained target required by a stable slot), the current locator plus a bounded local history of successfully verified titles, and platform-slot mappings in local plugin state. Unmatched live window titles remain transient runtime data.

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
16. Two Chromium windows on different Spaces activate only through the selected CG window's unique Space and exact AX→CG match. The operation must confirm the application `AXFocusedWindow` maps back to that CG ID; an unbound multi-window process returns `space-unbound-multiwindow` without fronting the other window.
17. Historical WJ-13 acceptance (superseded by WJ-19): process-frontmost retry is no longer an identity fallback; unbound stable identity blocks.
18. A target bound to several non-current Spaces returns `space-ambiguous`; a requested switch that is not confirmed returns `space-switch-timeout` and never continues to AX activation.
19. A stale preload revision produces `bridge-stale` before native activation. Development traces retain separate pre-initial and pre-retry aggregate snapshots without raw identity data.
20. Historical WJ-13 acceptance: a sole same-PID title change required explicit confirmation. WJ-17 supersedes this only when a complete inventory proves one high-confidence unique logical match; every weak or ambiguous case retains the explicit path.
21. Stable global-slot targets may reuse a preload-session Space binding instead of repeating full direct/reverse lookup on every invocation. A cache hit remains a hint only: current display mapping, application/native instance, exact CG→AX mapping, and final focused AX window must still verify; native miss evicts the hint and permits one normal recovery scan. Space/display bindings must not persist across preload lifetimes.
22. A macOS Core Graphics row with `kCGWindowIsOnscreen=false` must not be classified as minimized solely from that field because ordinary windows on another Space are also offscreen. Complete list snapshots may evict absent rows; partial/current-Space snapshots must merge into the prior session list, visibly mark retained rows as cached, and must not prove `target-closed`.
23. Historical WJ-17 acceptance (superseded by WJ-19): title similarity no longer authorizes automatic restart replacement, even for one candidate.
24. Every same-platform/same-application replacement candidate is explicit, regardless of title or candidate count. EyPc retains the logical target/slot and changes binding only after confirmation plus native success.
25. Historical WJ-18 acceptance (superseded by WJ-19): same-source title comparison no longer exists; an unchanged macOS target passes only the PID/application + CGWindowID + exact AX mapping/focus chain.
26. The same `instanceId` remains the same live target across arbitrary title changes, including browser Tab changes, empty titles and the literal title `Window`.
27. Equal application/title with different `instanceId` never matches automatically.
28. A complete refresh with one replacement candidate still enters manual confirmation; Escape restores the logical target row and successful Enter activation alone updates binding.
29. Legacy locator data becomes `lastKnownTitle`, history is removed, and a legacy native reference gains `lastInstanceId` only from bridge-verified activation success.
30. Windows rejects recycled/non-actionable/owner-mismatched HWNDs; macOS rejects rows or activations without a positive CGWindowID and exact AX mapping/readback. Canonical/public preload behavior remains byte-identical.
