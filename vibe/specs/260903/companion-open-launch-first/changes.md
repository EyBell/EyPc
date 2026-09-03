# Changes: 跳转前确保目标应用已打开与 CodexHost 启动通路

| Path | Core description |
| --- | --- |
| `preload/companion/open-readiness.cjs` | 新增：`companion-open-readiness-v1`，`ensure / wrapOpen` + `createDesktopAppStrategy`（pgrep 探测、`open -b` / `open -a` 启动、窗口或延迟 settle） |
| `preload/codex/desktop-launch.cjs` | 新增：Codex 探测 / 普通启动 / `codexhost launch` / CLI·描述符·运行中 Desktop 环境三证据检测 / Host 就绪 / codexhost 路径解析与手动偏好 / `inspect` / `strategy` |
| `preload/index.js` | 接线：`CODEXHOST_PATH_STORAGE_KEY`、`companionOpenReadinessSettings`、两个守卫式加载、discovery `onCliPathObserved`、Claude `processRunning`、Registry 三处 `open` 包装、环境快照 `codexhost`、`setCodexhostPath / clearCodexhostPath` |
| `preload/claude/open.cjs` | `processRunning` 回退：清单空 / 未知时以 `pgrep -x Claude` 为准；opener 仍不启动 |
| `preload/codex/codexhost-discovery.cjs` | 会合点解析成功时回调 `onCliPathObserved(cliPath)` |
| `preload/companion/task-actions.cjs` / `navigation.cjs` | `normalizeOpenLaunch` 透传有界 `launch` 字段 |
| `scripts/utools-preload-assets.mjs` | 两个新模块进打包清单 |
| `scripts/validate-preload-entry-budget.mjs` | ratchet 14164 → 14295 / 276 → 278 / 153 → 155（带日期注释） |
| `src/domain/codex.ts` | `openLaunchesTarget`、`codexhostLaunch`、`CodexhostEnvironmentV1` + `normalizeCodexhostEnvironment` |
| `src/domain/companionProvider.ts` | `CompanionOpenLaunchV1` / `CompanionOpenResultV2.launch` |
| `src/domain/companionPresentation.ts` | `codexhostSourceStatusText` |
| `src/domain/codexEnvironmentPresentation.ts` | 「CodexHost」诊断行（健康时隐藏） |
| `src/pages/CodexPage.vue` | 「接入来源」三块：统一开关、CodexHost 三态、codexhost 位置表单 |
| `src/runtime/appRuntime.ts` | `codex.set-codexhost-path / pick-codexhost-path / clear-codexhost-path` |
| `src/runtime/codexController.ts` | `setCodexhostPath / clearCodexhostPath` |
| `src/platform/eypcPlatform.ts` | 平台面 `setCodexhostPath? / clearCodexhostPath?` |
| `src/help/guides/codex.md` | 运行分区、切换任务、Cursor、Claude 段与 CodexHost 启动通路说明 |
| `tests/platform/companionOpenReadiness.test.ts` | 新增 12 例 |
| `tests/platform/codexDesktopLaunch.test.ts` | 新增 12 例 |
| `tests/platform/claudeBridge.test.ts` | 改两例标题；新增进程探针为真 / 为假 / 失败三例 |
| `tests/platform/codexhostDiscovery.test.ts` | 会合点回调断言 |
| `tests/platform/codexAppServerBridge.test.ts` | 沙箱 `pgrep -x` 改答 pid，桌面应用视为在运行 |
| `tests/domain/codex.test.ts` | 两个新设置的默认与归一化 |
| `vibe/knowledge/error-memory/codexhost-plain-cold-start-bypasses-host.md` | 错误记忆：深链冷启动绕过 CodexHost，之后 launch 被拒；第一版 shim 误判已登记 |
