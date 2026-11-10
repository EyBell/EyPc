# EyPc

Tool: codex

EyPc is a uTools plugin for cross-platform PC capability calls. The initial MVP includes:

- Port process scan, search, multi-select, normal terminate, and force kill.
- File/folder favorites with groups, tags, colors, tree view, open, reveal, and remove-from-favorites.
- Feature entries for main, ports, favorites, and settings.
- Command/keybinding runtime inspired by EzClipboard.

## Commands

```bash
pnpm install
pnpm run verify:plan      # preview affected guards
pnpm run verify           # run the same changed-core entry used by CI
pnpm run verify:core      # explicitly run the registered core inventory
pnpm run build
pnpm run serve
```

普通开发和 PR/push 使用同一[核心验证入口](vibe/knowledge/verification-map.md#变更触发与执行入口)。`test` 与 `verify:full` 保留为显式扩大验证范围时的入口；不自动用于未知变更兜底。

## Runtime

Use [public/plugin.json](public/plugin.json#L1) in uTools Developer Tools during development. The build emits runtime files under `dist/`.

## Windows 安装包桌面传送

固定入口为 [send-latest-upxs-to-windows.py](scripts/send-latest-upxs-to-windows.py#L1)：

```bash
python3 scripts/send-latest-upxs-to-windows.py
```

按修改时间选取 `~/Downloads/EyPc-*.upxs` 的最新普通文件，通过已有 SSH 连接传到 `kmserver01` 当前用户的实际桌面目录，同名替换；先核对上传摘要，再替换并复核 SHA-256 和字节数。相同摘要不重复传送。此入口只分发安装包，不安装或重启插件。

可用 `--source /绝对路径/EyPc-1.2.7.upxs` 指定包，或用 `--dry-run` 只检查来源与目标。macOS 若限制 Downloads 直接读取，脚本通过 Finder 仅复制所选安装包到临时目录；仍被系统阻止时会停止，不改变系统权限设置。

## Window Jump

- A row represents one independent OS root window. Browser tabs, IDE editors and proven native child surfaces stay inside that row; changing their title does not break favorites or slots.
- On macOS, a preload-session cache resolves each exact root to its display/Space. Slot activation switches only the target display, so another display's current Space remains independent.
- Finder/Explorer always appears as an expandable parent with each independent file-manager window beneath it. Press `ArrowRight` to expand/enter a child and `ArrowLeft` to return/collapse.
- Right-click first focuses the row and opens the existing contextual panel. File-manager parents can activate, expand, favorite, list-pin, rename and bind slots, but cannot bulk-close or page-topmost children.
- A missing current-Space inventory row is retained as temporarily unobserved. Only an exact native `gone` probe clears the saved locator; replacement stays explicit and a slot-originated recovery changes that slot only. Titles are recognition hints only.
