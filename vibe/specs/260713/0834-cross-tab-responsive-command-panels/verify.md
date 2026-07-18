# EyPc 跨页面响应式命令面板验证记录

Tool: codex

## 当前状态

- Implementation: `complete`
- Root decision: `accepted`
- Real host: macOS/Windows/Linux `unverified`

## 基线证据

- 真实浏览器 `420x680`：Ports feature root `420/640`，右侧内容被裁切。
- 真实浏览器 `420x680`：Settings 快捷键表约 `402/646`，依赖横向滚动。
- 真实浏览器 `420x680`：MQTT feature root `420/420`，纵向 `639/1067` 可滚动。
- 真实浏览器 `800x768`：Ports 360px 动作抽屉覆盖主列表约 63%，焦点仍在底层列表。
- Quick Jump computed style：badge 背景透明、无边框。

## Verification Matrix

| Boundary | Automated | Live UI | Result |
| --- | --- | --- | --- |
| Tooltip hover/focus/disabled/form/row controls | 5 component cases pass | disabled button, Settings checkbox and MQTT tree-row focus pass | accepted |
| Quick Jump badge/layout | layout and UI regression pass | 420px real render uses 18px solid badges with target collision avoidance | accepted |
| Shared detail/actions target | Runtime and Favorites/Quick/Settings components pass | Ports/Favorites switch side and restore list focus | accepted |
| MQTT F2/help/row parity | keybinding, action and UI regressions pass | 420px stacked receive/send workspace keeps both command bars reachable | accepted |
| Responsive/scroll/focus | component regressions pass | 4 tabs × 1180/760/640/420 at 680px, 800×736, plus 800/420 at 480px have document `scrollWidth === clientWidth` | accepted |
| Full gates | 38 files / 345 tests; typecheck/build/uTools pass | n/a | accepted |

## Final Evidence

- `pnpm run test`: `38 files / 345 tests` passed.
- `pnpm run typecheck`: passed.
- `pnpm run build`: passed; Vite emitted only the existing chunk-size advisory and then prepared/validated uTools runtime assets.
- `pnpm run validate:utools`: passed inside build and again during closeout.
- Markdown code-link audit: passed for the task package, canonical requirements/status, architecture/technical/Soul and structured error memories.
- Project AI-rule audit: reported pre-existing adapter drift (latest Evolution/Hook/Rule Task Trace/template-propagation contracts are absent from project rule/status surfaces). No finding points to this task's code or changed requirement documents; global/project rule propagation remains out of scope.
- Real browser matrix: Ports, Favorites, MQTT and Settings at `1180x680`, `800x736`, `760x680`, `640x680`, `420x680`, `800x480`, `420x480`; no page-level horizontal overflow.
- Short height: all four pages at 800/420×480 expose default, left-detail and right-action states below the Tab bar; every panel's actual scroll owner reaches its final enabled button. At 420×480, Ports group editor, Favorites target editor, MQTT config editor and Settings shortcut recorder stay within the viewport and scroll to their final control.
- Focus: Ports and Favorites `Ctrl+Left → Ctrl+Right → Escape` enter the new panel and restore the list/grid owner. Settings command row restores after close; Favorites and Quick Favorites also have component switching coverage.
- Modifier ownership: MQTT tree uses exact plain-arrow listeners so `Ctrl/Cmd+Left/Right` reaches Runtime panels; Settings accepts side switching from both the command row and an already-open panel while editing controls keep native ownership.
- Tooltip: disabled favorite action reports its disabled reason; Settings checkbox reports its own `aria-label`, not its parent row action.
- Quick Jump: final 420px render confirmed solid background/border and external-edge preference; product Tooltip is suspended while the layer is open.
- MQTT: 420px workbench is vertically scrollable; receive/send rows are `247.5 / 6 / 247.5px`, and both command bars have equal client/scroll widths.

## Skipped / Residual

- macOS uTools real open/reveal/copy smoke was not available from the browser development host and is not claimed.
- Windows/Linux real-host acceptance remains unverified; platform contracts are covered by automated matrices only.
- Project AI-rule adapter synchronization remains a separate governance task; this round does not rewrite global or project rules.
- No process termination, external MQTT traffic, real file mutation, DB/SQL, publish, credentials or permission changes were performed.

## Documentation Impact

- Final: `requirement-canonical + project-current + architecture + technical + soul + error-memory`。
- Global rule / template propagation: `none`。
- DB/SQL: `not-applicable`。

## Sidecar

- Start: 主线程完成；无缺失入口，风险门禁明确。
- Closeout: Runtime/UI read-only reviewers reported concrete gaps; Root reproduced, repaired, re-ran gates and accepted the result。
