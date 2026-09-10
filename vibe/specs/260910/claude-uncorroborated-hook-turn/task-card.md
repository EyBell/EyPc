# Claude App 终态后未证实 Hook 提问不得锁在进行中

状态：实现、聚焦自动验证、镜像、生产构建与真值已通过；真机重载待用户。

## 问题与授权

用户授权 F-1：修复 Claude 来源仲裁。现场只读样本（标题指纹 `h:407cb75965ae6b61`）上 App 为 `stopped` / `exact-terminal`，unique-cli Hook 仅为 `prompt-submit` 且 `turnStartedAt` 新 4 秒，之后约 2 小时无 Stop、无工具事件；`selectProjectedStateSource` 把 4 秒当成「更晚的父 Turn」而投影 `running`。中断探针未折叠。上午队列裁尾修复不覆盖这条路径。

同轮 F-2 只读核对 Cursor 目标标题指纹 `h:c4706e7782ab6e6b`：20:14 冷读 disk+hook+适配器已是 `completed`；20:32 与 20:35 再次扫描时该指纹不在库存，冷库存无 `completed` 却 `turn-running` 的行。未采到活 Kernel/浮窗包，未重载插件，未改 Cursor 队列裁尾。

## 实现与边界

| 项 | 说明 |
| --- | --- |
| 仲裁 | [selectProjectedStateSource](../../../../preload/claude/code-sessions.cjs#L225)：App 精确终态后，Hook 新 Turn 必须有终态之后的 live progress；仅 `prompt-submit` / `session-start` / `notification` 时，生产路径传入 `now`，空窗超过 `HOOK_PROMPT_ONLY_GRACE_MS`（60s）回 App |
| 读入口 | [index.cjs](../../../../preload/claude/index.cjs#L122) 三处 correlate 传入 `{ now: Date.now() }` |
| 宽限 | 未传 `now` 的旧测试保持「新提问立即 running」，避免历史时间戳被当成超期 |
| 不做 | 不按超时结束仍有工具事件的活 Turn；不改 Kernel；不重载/改 Cursor 队列裁尾 |

## VerificationImpactTrace（实施前）

| 项目 | 选择与边界 |
| --- | --- |
| 修改面 | Claude 来源选择；同步 preload 镜像；用户帮助一句；PRD 收紧既有终态优先句 |
| 影响链 | App log + Hook → correlate → Kernel → 浮窗 |
| 聚焦验证 | `tests/platform/claudeBridge.test.ts`；收尾扩到 AppState / Safety |
| 不运行 | 全仓测试（未触发升级条件前） |
| 帮助/需求 | 无新 RAW；帮助与 PRD 同步既有「中断/结束显示待继续」口径 |

## 验证

| 检查 | 结果 |
| --- | --- |
| 选择器回放现场形态 | `prompt-submit` + 2h `now` → `app`；`+5s` → `hook`；`pre-tool` → `hook` |
| 聚焦测试 | `pnpm exec vitest run tests/platform/claudeBridge.test.ts tests/platform/claudeAppStateBridge.test.ts tests/platform/claudeBridgeSafety.test.ts`：128 通过 |
| 镜像 | `pnpm run sync:preloads` 通过；`public/claude/` 已含 `hookCorroboratesNewerTurn` 与三处 `now` |
| 错忆校验 | `pnpm run validate:error-memory` 通过 |
| 镜像/构建 | `pnpm run build` 合同、类型、Vite、uTools 产物校验通过 |
| 当前真值 | `node scripts/validate-requirements.mjs --write-current-truth` 与 `pnpm run validate:requirements` 通过；无新 RAW 叶子 |
| Cursor 冷读（F-2） | 20:36：库存 36 行，目标指纹缺席，`completed && turn-running` = 0；唯一队列 `2645` 行（读时裁最后 2000）、`435218` 字节未超 `512KiB`；hook 状态 10 条、开 Turn 2。只读 drain，未 `rotateIfNeeded` |
| Cursor 活包 | 无官方 `companion-state-reconciliation/v1` 活快照；`live_canary=blocked` |

产物：EyPc V7；`host-949c7234c0c5e1323833 / renderer-d44854f40fbe509259c1`；北京时间 `2026/09/10 20:34:59`（`2026-09-10T12:34:59.660Z`）。完整插件入口：[dist/plugin.json](../../../../dist/plugin.json#L1)。对应 [当前需求真值](../../PRODUCT_REQUIREMENTS.md#L14) 与 [状态中心](../../PROJECT_STATUS.md#L8)。

结论：F-1 源码与产物已就绪，真机须重载 uTools 后目视 Claude 行是否离开「进行中」。F-2 冷来源不再能定位原标题指纹，活插件内存未核到，本轮不改 Cursor。
