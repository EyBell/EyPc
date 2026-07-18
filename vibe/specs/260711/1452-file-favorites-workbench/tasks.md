# EyPc 文件收藏工作台执行台账

Tool: codex

## Work Unit Ledger

| Work Unit | Work-order Version | Attempt | Surface | Runtime ID | State | Last Evidence | Blocker | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WU-ROOT-IMPLEMENT | 2 | 2 | main | app-root | accepted | 36 files / 332 tests、typecheck、build、uTools、最终四视口与焦点 smoke 通过 | none | complete |
| WU-SIDECAR-START | 1 | 1 | native-thread | /root/start_sidecar | accepted | 规则、重叠、文档/记忆与风险证据已由 Root 对照源码复核 | none | complete |
| WU-PLATFORM-RUNTIME-AUDIT | 1 | 1 | native-thread | /root/platform_runtime_matrix | accepted | Root 复核并修复 preload 漂移、类型、显式目标、目录超时/错误码与能力缺口 | none | complete |
| WU-UI-A11Y-AUDIT | 1 | 1 | native-thread | /root/ui_a11y_audit | accepted | Root 复核并修复 roving、焦点恢复、双重改名、能力与窄屏状态 | none | complete |
| WU-CLOSEOUT-REVIEW | 1 | 1 | native-thread | /root/closeout_reviewer | accepted | `changes_requested` 的目录原值、drawer 类型、Escape、inspection、tree checkbox、confirm 和窄屏错误均由 Root 修复并回归 | none | complete |
| OPT-RUNTIME-PLATFORM-01 | 2 | 1 | native-thread | /root/optimization_runtime_platform | accepted | 权限元数据、特殊目录项和条件式撤销上下文 findings 已由 Root 实现并回归 | none | complete |
| OPT-UI-CSS-01 | 2 | 1 | native-thread | /root/optimization_ui_css | accepted | pane DOM focus、active descendant、确认恢复、invalid 状态和窄屏可见错误 findings 已由 Root 实现并实测 | none | complete |
| CLOSEOUT-REVIEW-02 | 2 | 2 | native-thread | /root/closeout_reviewer | accepted | Attempt 1 两个 P1 已修；Attempt 2 定点复核 `approved_pending_root_gates`，Root 门禁通过 | none | complete |

## Implementation Tasks

- [x] 补齐领域、平台、Runtime、快捷键和组件 RED 回归。
- [x] 实现收藏图归一化与路径标识。
- [x] 实现结构化文件动作、capability、检查和符号链接元数据。
- [x] 实现目标优先级、快速入口清理、三栏键盘模型、Escape、撤销和新快捷键。
- [x] 实现紧凑双栏/侧层、状态、图标、行内重命名、ARIA、焦点陷阱和恢复。
- [x] 通过全量自动门禁和可执行页面 smoke。
- [x] 同步需求、状态、架构、技术、Soul、错误记忆并执行审计。
- [x] 按用户明确授权删除意外 `pnpm-workspace.yaml`，确认测试/构建未重新生成。
- [x] 保留权限失败前已知元数据，过滤非 file/folder 特殊目录项。
- [x] 撤销按原顺序恢复节点与折叠态，仅在未继续导航时恢复焦点/选区。
- [x] `Tab/Shift+Tab` 同步 Runtime pane 与 DOM focus，修复跨 grid active descendant。
- [x] 修复确认层触发点消失和相邻渲染阶段造成的 `body` 焦点回退。
- [x] 420px 保留非颜色依赖的路径错误文字且无横向溢出。

## Execution Journal

| Event | Time | Work Unit / Attempt | Actor / Surface | Prior → Resulting State | Trigger / Evidence | Root Decision | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E-001 dispatch | 2026-07-11 | WU-SIDECAR-START / 1 | App Root / native-thread | pending → running | Controlled 启动复核可独立只读执行 | 保持只读，Root 独占写入 | 接收后验证 |
| E-002 dispatch | 2026-07-11 | WU-PLATFORM-RUNTIME-AUDIT / 1 | App Root / native-thread | pending → running | 平台/Runtime 影响面可并行盘点 | 保持只读，Root 独立采用 | 接收后验证 |
| E-003 dispatch | 2026-07-11 | WU-UI-A11Y-AUDIT / 1 | App Root / native-thread | pending → running | 420px 与焦点问题需要独立审计 | 保持只读，Root 独立采用 | 接收后验证 |
| E-004 accepted | 2026-07-11 | WU-SIDECAR-START / 1 | App Root / main | reported → accepted | Root 复核旧任务 accepted、当前源码缺口与文档路由 | 接纳净增量与项目内记忆路由；不新增全局规则 | 进入 RED/实现 |
| E-005 accepted | 2026-07-11 | WU-PLATFORM-RUNTIME-AUDIT / 1 | App Root / main | reported_with_blockers → accepted | Root 逐项复现并修复 P0/P1，增加结构化和竞态回归 | 接纳发现与替代路线 | UI/Runtime 收口 |
| E-006 accepted | 2026-07-11 | WU-UI-A11Y-AUDIT / 1 | App Root / main | changes_requested → accepted | Root 复现真实 420/640/1180 焦点问题并补组件/浏览器证据 | 接纳发现，修复后重验 | Closeout Reviewer |
| E-007 accepted | 2026-07-11 | WU-CLOSEOUT-REVIEW / 1 | App Root / main | changes_requested → accepted | Root 修复全部 P1；聚焦与全量、类型、build、uTools、浏览器重跑通过 | 接纳 reviewer 发现；不扩大 P2 | 文档与门禁 |
| E-008 reported | 2026-07-11 | WU-ROOT-IMPLEMENT / 1 | App Root / main | running → reported | 36/326、四视口、确认/改名/Quick 真实浏览器均通过 | 实现可交付；删除门禁未获授权不能 accepted | 请求用户选择意外文件处置 |
| E-009 user correction | 2026-07-11 | WU-ROOT-IMPLEMENT / 2 | User / App Root | reported → running | 用户回复“授权, 然后继续进行优化” | 删除意外文件并把 work-order 升为 2；产品边界不扩张 | 并行增量审计 |
| E-010 accepted | 2026-07-11 | OPT-RUNTIME-PLATFORM-01 / 1 | App Root / main | reported → accepted | Root 复核权限元数据、特殊项和撤销上下文，补平台/Runtime 回归 | 接纳最小修复；不扩展 `other` UI 契约 | UI 优化 |
| E-011 accepted | 2026-07-11 | OPT-UI-CSS-01 / 1 | App Root / main | reported → accepted | Root 修复 pane focus、ARIA、invalid 状态和 420px 可见错误；CSS anchors 保留 | 接纳行为修复；CSS 模块化延期 | 真实浏览器重验 |
| E-012 failure/recovery | 2026-07-11 | WU-ROOT-IMPLEMENT / 2 | App Root / Playwright | verifying → rework → verifying | 组件回归先通过，但确认删除后真实浏览器焦点仍落 `body` | 增加稳定“添加”回退、可见候选和 bounded animation-frame retry；新增错误记忆 | 重跑浏览器与全量门禁 |
| E-013 verified | 2026-07-11 | WU-ROOT-IMPLEMENT / 2 | App Root / main | rework → verifying | 36/332、typecheck/build/uTools 通过；420px 错误可见且无 overflow，侧层和确认层焦点通过 | 接纳阶段性证据 | Closeout Reviewer 2 |
| E-014 rework | 2026-07-11 | CLOSEOUT-REVIEW-02 / 1 | App Root / main | reported → rework | Reviewer 复现 fallback DOM 顺序覆盖声明优先级、symlink target 权限分支丢元数据 | 改为 selector 数组逐项解析；保留 symlink 本体元数据并补回归 | 重放完整门禁并请求 reviewer 复核 |
| E-015 accepted | 2026-07-11 | CLOSEOUT-REVIEW-02 / 2 + WU-ROOT-IMPLEMENT / 2 | App Root / main | reported → accepted | 定点 2 files / 28 tests、全量 36/332、typecheck/build/uTools、preload 三份一致和浏览器证据通过 | 接纳实现与文档；保留真实宿主 gap | complete |
| E-016 closeout | 2026-07-11 | WU-ROOT-IMPLEMENT / 2 | App Root / main | verifying → accepted | Markdown code-link 与 diff check 通过；AI rule audit 仅返回已知项目 adapter P1 | 产品任务完成；治理漂移继续 deferred | complete |

## Efficiency / Token Evidence

- Native Attempts：7 个只读 Work Unit；Closeout Reviewer v2 使用 2 个 Attempt，其输出均由 Root 复现后才 accepted。
- Usage：`usage unavailable`，所有 native-thread 均未暴露可比 Token 数据。
- 有效收益：平台与 UI reviewer 分别发现 preload/目标契约和真实焦点问题，Closeout Reviewer 发现目录原值与抽屉目标类型问题；均减少了最终漏检。
- Coordination overhead：两轮增量审计和两轮 Closeout Reviewer；没有重复写入 Attempt、CLI runner、daemon 或递归 fan-out。
