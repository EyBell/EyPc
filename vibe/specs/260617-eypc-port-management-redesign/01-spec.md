# EyPc Port Management Redesign Spec

Tool: codex

## Original Requirement

1. 端口可以进行查询, 可支持完全匹配, 也支持正则匹配, 不需要展示可能的组合, 隐藏起来, 自动匹配即可, 按匹配度进行排序
2. 查询操作的触发和展示现在无法正常展示
3. 搜索出来的端口, 可以进行类似 EzClipboard的交互, ↑↓移动, 空格多选, 单个/批量-清理(弹出确认版和强制版)
4. 分组可以自定义端口, 端口区间, 正则表达式, 无需默认的分组, 用户自行定义, 给出示例和正则的简单说明
5. 可以多选后进行收藏分组, 重命名分组, 大致分左右两栏同时展示(左分组, 右查询), 分组也需要快捷键进行快捷操作, 且两栏可以快捷键进行选择聚焦, 都可搜索, 移动高亮, 共用一个搜索的窗口展示(居中)
6. 所有的操作都提供command映射自定义管理

## Acceptance

- Search uses a hidden unified matcher and returns sorted results by relevance: exact port/PID/command match, prefix match, contains match, then regex match.
- Search supports literal input, explicit regex like `/node|java/i`, and safe auto-regex attempts for valid patterns.
- Ports page exposes a keyboard-first two-pane layout: groups on the left, query results on the right.
- Result pane supports `ArrowUp`, `ArrowDown`, `Space`, `Enter`, and `Ctrl+Enter` for focus, multi-select, confirmed cleanup, and direct force cleanup.
- Group pane supports inline search, focus movement, apply, rename, edit rules, delete, confirmed cleanup, and direct force cleanup through actions.
- Port query uses an always-visible inline input. Typing updates filtering in real time and triggers scan when no scan data is loaded.
- User-defined groups support port numbers, port ranges, and regex rules. Regex rules match full process text: port, PID, command, address, user, protocol, and state.
- New users start with no default port groups. Legacy built-in `default:*` groups are removed during state normalization while user groups are preserved.
- Multi-selected ports can create a new group draft populated with selected ports.
- Every visible operation is registered in Runtime Action and appears in Settings for shortcut override/disable/reset.

## Safety

- Normal cleanup always opens confirmation before process termination.
- Force cleanup is direct by design, but only targets selected current rows or selected group matches.
- Runtime re-scans before cleanup and filters targets by PID+port ownership.
- Preload re-scans again before executing `kill` or `taskkill`.
- Real user process termination is not part of automated verification.

## Current Gaps

- Search currently lives in [src/domain/ports.ts](../../../src/domain/ports.ts#L98) and now filters by relevance-scored literal, explicit regex, and auto-regex matches.
- Initial state currently defines built-in port groups in [src/domain/state.ts](../../../src/domain/state.ts#L6).
- Runtime registers cleanup actions in [src/runtime/appRuntime.ts](../../../src/runtime/appRuntime.ts#L208), but list navigation shortcuts are not mapped to focus/selection behavior.
- Ports UI is rendered from [src/pages/PortsPage.vue](../../../src/pages/PortsPage.vue#L17), with no group CRUD or shared centered search layer.
