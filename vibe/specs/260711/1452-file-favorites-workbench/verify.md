# EyPc 文件收藏工作台验证记录

Tool: codex

## 当前状态

- 实现与自动/浏览器验证：`verified`；Work-order v2 Closeout Reviewer Attempt 2 与 Root 完整门禁均通过，状态为 `accepted`。
- 用户已明确授权删除意外 `pnpm-workspace.yaml`；文件已移除，测试、类型检查和构建均未重新生成。
- 宿主接纳：macOS uTools、Windows 和 Linux 均为 `unverified`，没有实机证据就不宣称通过。

## RED/GREEN 矩阵

| 边界 | RED | GREEN | 证据 | 决策 |
| --- | --- | --- | --- | --- |
| 坏图、路径标识 | duplicate/orphan/self/cycle 与 duplicate+self 复现 | 归一化、visited、Windows/UNC/POSIX identity 与展示原值通过 | [favorites.test.ts](../../../../tests/domain/favorites.test.ts#L1)、[state.test.ts](../../../../tests/domain/state.test.ts#L1) | verified |
| 结构化平台结果 | boolean/void、缺失、权限、reject/timeout、copy false 暴露误报；`lstat` 成功而 `access` 拒绝会丢元数据 | darwin/win32/linux/browser outcome/error/capability 矩阵通过；权限拒绝保留 kind/symlink/size/mtime 与 `exists=true` | [favoriteFileBridge.test.ts](../../../../tests/platform/favoriteFileBridge.test.ts#L1)、[eypcPlatform.test.ts](../../../../tests/platform/eypcPlatform.test.ts#L1) | source verified；real host unverified |
| Quick、目标优先级、Escape、撤销 | stale target、invalid explicit 回退、drawer 类型与恢复链复现；旧撤销只追加节点 | 显式→冻结抽屉→焦点→可见多选、完整 Escape；撤销恢复顺序/折叠，并只在未继续导航时恢复焦点/选区 | [action.test.ts](../../../../tests/runtime/action.test.ts#L1)、[keybinding.test.ts](../../../../tests/runtime/keybinding.test.ts#L1) | verified |
| 目录竞态、显示值、符号链接 | Quick 旧响应、A→B 旧响应、路径改写及特殊 Dirent 被误标 file | request generation、host 原值、identity 选择、reject/timeout、可解析 symlink；特殊/未解析项过滤 | Runtime/platform tests | verified |
| ARIA、焦点、状态、行内改名 | 真实 420/640 的 body 焦点、双重 rename、Tab 停靠；单 `nextTick` 在触发点删除时再次落 `body` | 单一 roving owner、pane DOM focus request、正确 active descendant、dialog/menu/confirm trap；可见稳定回退与 bounded frame retry | [favoritesBehavior.test.ts](../../../../tests/ui/favoritesBehavior.test.ts#L1) | verified |
| 420px 与四视口 | 复用规划轮 overflow/body-focus 失败 | 构建产物四视口无页面/workbench/list 横向溢出 | live browser measurements and screenshots | verified |

## 完整门禁

| Check | Result | Notes |
| --- | --- | --- |
| `pnpm run test` | pass | 36 files / 332 tests；最新聚焦 2 files / 28 tests 亦通过 |
| `pnpm run typecheck` | pass | `vue-tsc --noEmit` |
| `pnpm run build` | pass | Vite 1810 modules；typecheck、prepare 与 validator included |
| `pnpm run validate:utools` | pass | canonical/public/dist preload 一致且 Runtime API contract 通过 |
| `git diff --check` | pass | 最终代码、测试与文档 diff 无空白错误 |
| AI rules audit | known P1 / deferred | 项目 adapter/hub 缺当前母版 process、Hook 与传播基线；为既有治理漂移，不在产品任务扩面 |
| Markdown code-link audit | pass | task、PROJECT_STATUS、产品需求、知识与结构化错误记忆：`Code link audit: OK` |

## Live UI Verification

| Viewport | Document / Workbench / Items | Responsive evidence | Result |
| --- | --- | --- | --- |
| 1180×680 | `1180/1180 · 1180/1180 · 939/937` | 紧凑双栏 | pass |
| 760×680 | `760/760 · 760/760 · 519/517` | 紧凑双栏 | pass |
| 640×680 | `640/640 · 640/640 · 618/616` | side layer 在断点切换后关闭；无页面级 overflow | pass |
| 420×680 | `420/420 · 420/420 · 402/400` | side layer `left=4 right=314 width=310`；打开焦点到 tree，关闭焦点回“打开容器栏” | pass |
| Quick 420×680 | `420/420` | active role=`favorite-items`，首项 `aria-activedescendant`，management actions=`0` | pass |

真实浏览器还确认：宽屏 `Tab` 将 DOM 焦点从收藏 grid 移到容器 tree，只有一个 `.focused` 行且 active descendant 属于当前 owner；420px 路径错误文字可见，行 `400/400` 且页面 `420/420`；容器侧层打开时立即可见并聚焦 tree，关闭后聚焦“打开容器栏”；确认移出后原行按钮消失，1180px 按声明优先级聚焦 `favorite-items` grid，420px 在过渡阶段稳定聚焦“添加”按钮。临时截图已人工检查且位于忽略目录，不作为版本化产品资产。

## Prior Task Overlap Verification

- Document governance：旧规范/验证保留为基线，本任务只更新增量权威。
- Execution logic verification：旧任务 26 文件 / 197 测试只作为历史证据；本轮最终变更边界由 36 文件 / 332 测试和真实浏览器重验覆盖。
- Traceability：`partial-overlap`，`delta-only + new-task`。

## Sidecar

- Start Explorer：`accepted`；旧任务为 `partial-overlap`，本轮按 `delta-only + new-task` 实施。
- 两轮 Platform/Runtime 与 UI reviewer：`accepted`；Root 复现并修复其 P0/P1/P2 净增量。
- Closeout Reviewer：`accepted findings`；其 `changes_requested` 中全部 P1 已由 Root 修复并通过聚焦、全量、类型、构建、uTools 与浏览器重验。
- Closeout Reviewer 2：Attempt 1 `changes_requested`；fallback 优先级与 symlink target 权限 P1 修复后，Attempt 2 为 `approved_pending_root_gates`，Root 门禁已通过并接纳。
- `missing_required_updates`：none；产品实现与本任务文档已收口。
- `optional_improvements`：收藏 CSS cascade anchors 保留；若模块化应独立迁移到末端加载的 favorites stylesheet 并重跑四视口。
- `memory_routing_decision`：需求 → PRODUCT_REQUIREMENTS；当前逻辑 → ARCHITECTURE/technical-details；视觉口味 → developer-soul；坏图/Quick/对话框渲染竞态 → verified structured error memory；pnpm trap → candidate memory（占位文件已授权清理）。
- `risk_gates`：真实文件修改、DB、发布、权限、外部写入均排除；Windows/Linux 实机验收保留。
- `verification_required`：自动与四视口完成；真实宿主仍待用户/实机环境。
- `evolution_candidates`：产品实现 `none`；项目 AI-rule adapter 漂移为 `candidate-only / deferred`，未修改或传播全局规则。

## Efficiency / Token Evidence

| Metric | Baseline | Observed | Delta | Confidence / Source |
| --- | --- | --- | --- | --- |
| Native Attempts | 主线程单线审计 | 7 个只读单元 | 两轮平台/UI 与 Closeout 提供被 Root 复现的净增量发现 | high / task ledger |
| Usage | unavailable | unavailable | unavailable | runtime 未暴露 |
| First-pass acceptance | not applicable | 4/4 reported；Root 接纳 findings | leaf reported 不替代 Root acceptance | high / Root replay |
| Coordination overhead | none | 一次收口复核与对应回归 | 未重复写入或 fan-out | medium / journal |

## 未验证边界

- Windows/Linux uTools 宿主打开、定位、真实项复制。
- 当前 macOS uTools 真实 smoke 尚未执行。
- 未执行真实文件创建、移动、重命名或删除；这些能力也未进入桥接接口。
- 收藏 CSS 首尾 cascade anchors 仍有维护成本；当前末端区同时承载独有覆盖，未在本轮冒险机械删除。
