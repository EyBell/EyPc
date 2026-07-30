# Standard Requirement Spec: 全页面按钮悬浮提醒优化

Tool: codex
Date: 2026-07-30
Status: `implemented-unverified`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)

## Task Documentation Sync Group

- Group key: `dsg:eypc:global-operation-tooltip-v1`
- Group owner: this `spec.md`
- Git document prefixes: 本任务目录、产品/项目状态、架构/技术/偏好/错误记忆，以及共享设置用户说明。
- Durable document members, including raw/canonical and clean consulted owners: 见下方 manifest。
- Declared code/config dependencies: 主应用全局提示层、共享样式、App 单实例挂载、Codex 主页面旧提示样式与 Float 例外样式。
- Linked current/rule/memory authorities: [documentation rules](../../../rules/documentation.md#L1)、[developer soul](../../../knowledge/developer-soul.md#L1)、[operation tooltip error memory](../../../knowledge/error-memory/operation-tooltip-title-only-missing-product-attrs.md#L1)。
- Excluded unrelated dirty documents: 当前工作树中的 MQTT、Codex Companion、Windows 等并行改动均保留；共享文档和 `app.css` 只追加本任务独立 hunk。
- Lookup contract: `get --lookup-only` 返回 `receipt_missing`；本任务建立新 receipt，不复用旧任务。
- Shared-file stage ownership: 当前收口按功能分批提交；共享文件只暂存全局 operation tooltip 独立 hunk，不夹带 Window/Codex 的并行段落。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:global-operation-tooltip-v1",
  "group_owner": "vibe/specs/260730/2050-global-operation-tooltip-polish/spec.md",
  "documents": [
    "vibe/specs/260730/2050-global-operation-tooltip-polish/raw-requirement.md",
    "vibe/specs/260730/2050-global-operation-tooltip-polish/spec.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/knowledge/error-memory/operation-tooltip-title-only-missing-product-attrs.md",
    "vibe/rules/README.md",
    "vibe/rules/documentation.md",
    "src/help/guides/settings.md"
  ],
  "dependencies": [
    "src/App.vue",
    "src/components/OperationTooltipLayer.vue",
    "src/styles/app.css",
    "src/styles/codex.css",
    "src/styles/float.css"
  ],
  "validators": [
    "tests/ui/operationTooltip.test.ts"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260730/2050-global-operation-tooltip-polish",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/knowledge/error-memory/operation-tooltip-title-only-missing-product-attrs.md",
    "src/help/guides/settings.md"
  ]
}
```

## Requirement Delta

- Add: 主应用全部页面统一按钮/操作控件悬浮与聚焦提醒核验。
- Improve: 原生 `title` 兼容层拆分明确的快捷键后缀，动态属性变化时刷新可见提示。
- Fix: Codex 主页面旧伪元素提示与全局层重复显示；保留 Float 子窗口例外。
- Confirmed facts: `OperationTooltipLayer` 已在 `App.vue` 单实例挂载并覆盖主应用 `.app-shell`；最终静态审计覆盖 271 个原生按钮，均存在显式名称来源、MQTT tooltip helper 或可见文本。
- Pending decisions: 无；视觉节奏沿用项目偏好中的 100ms hover、focus immediate 和 quiet overlay。
- Acceptance criteria: 一个主应用提示层、所有按钮可命名、无重复气泡、快捷键不重复、普通括号不误判、动态提示及时刷新、减少动态效果偏好生效。

## Plan-Mode Preflight

- Scope: 只改共享提示组件、共享提示样式、既有测试契约、共享设置帮助和必要项目文档；不改按钮业务、快捷键、页面布局或 Float 提示实现。
- Risk boundary: 无外部写入、无依赖新增、无数据结构/存储/权限变化。
- Documentation level: Standard requirement，由本 Spec 与 raw 承载。
- Test scope policy: 不新增测试模块，只更新既有 `operationTooltip.test.ts`；按项目门禁不执行测试、typecheck、build 或运行态验收。
- Prior-task overlap: `new-task` with `partial-overlap`，继承 `1044-mqtt-tooltip-shortcut-polish` 已验证的 MQTT 局部模式，扩展为全主应用 owner，不回写历史任务范围。
- Documentation impact: `requirement-canonical`，Root 同步 raw/Spec/PRD/status/architecture/technical detail/help/developer-soul/error memory。
- Authority Packet: 项目 rules/documentation/developer-soul、PRD、全局 OperationTooltip、App 单实例挂载、Codex/Float 提示样式与既有 UI 契约。
- `doc_drift` strategy: 源码已有全局层，但 Codex 主页面仍有重复伪元素，且当前文档主要描述 MQTT 局部能力；实现与文档同批收口。
- Sidecar: not applicable，范围集中、静态证据充分，按 main-only 完成。

## Prior Task Overlap

- Relationship: `partial-overlap`
- Prior authority: [1044 MQTT tooltip polish](../1044-mqtt-tooltip-shortcut-polish/spec.md#L1) 只约束 MQTT 页面，并明确 Ports/Favorites 不在其范围。
- Execution logic verification: 复用已存在的全局提示层、属性优先级、禁用原因与快捷键展示，不重复创建页面组件。
- Traceability and decision: `new-task`；本任务是用户明确提出的跨页面范围扩展，新的 group owner 独立承载。

## Canonical Merge

- Base project version: 2026-07-30 当前 `PRODUCT_REQUIREMENTS.md`。
- Result project version: `2026-07-30.2`，全页面 operation tooltip 约束已并入当前产品能力。
- Target sections and backlinks: PRD 全局交互、PROJECT_STATUS 当前 UI 能力。
- Merge status / missing target: complete；无缺失 canonical target。

## Implementation Sync

- Changed logic / desired behavior: 全局提示层只把快捷键形态的原生 title 后缀拆为 `kbd`，保留普通括号文本；承接 `data-tip`；监听活动控件名称/说明/快捷键/禁用状态变化；点击、窗口失活和节点移除时清理；定位箭头随 viewport clamp 保持指向目标。
- Presentation boundary: [app.css](../../../../src/styles/app.css#L1) 为共享提示增加 90ms quiet entry、方向箭头和 reduced-motion 关闭，并只在 `.app-shell` 抑制 Codex 旧 `::after` 气泡；Float 的 [float.css](../../../../src/styles/float.css#L1) 不变。
- Authoritative current document: 本 Spec、[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1) 与 [PROJECT_STATUS.md](../../PROJECT_STATUS.md#L1)。
- Entry-to-module mapping: [App.vue](../../../../src/App.vue#L1) 单实例挂载 → [OperationTooltipLayer.vue](../../../../src/components/OperationTooltipLayer.vue#L1) 委托解析/生命周期 → [app.css](../../../../src/styles/app.css#L1) 主应用呈现；[settings.md](../../../../src/help/guides/settings.md#L1) 提供跨页用户说明。
- Verification evidence: [operationTooltip.test.ts](../../../../tests/ui/operationTooltip.test.ts#L1) 已增加 271 按钮命名合约、App/Float owner 边界、title 解析、`data-tip` 与动态刷新覆盖；按项目门禁未执行。
- Gap / follow-up: 运行态悬浮、键盘焦点、禁用按钮命中、窄窗口箭头位置与真实 reduced-motion 由用户验收。

## Verification

- Route: `user-owned`
- Reason: 项目明确规定由用户执行测试、typecheck、build、uTools 与 UI 验收。
- Checked: 主应用页面/共享组件按钮命名静态扫描、共享 owner 挂载与 Float 边界搜索、Codex 双提示 CSS 边界、task-owned `git diff --check`、AI Markdown code-link audit、documentation sync receipt。
- Skipped by policy: Vitest、typecheck、build、uTools/runtime、截图和真实 hover/focus/reduced-motion 视觉验收。
- Required final state: `未校验，待用户验收`。

| Check | Evidence | Result | Remaining Manual Path |
| --- | --- | --- | --- |
| all-page button naming | `src/pages` + `src/components` source inventory | 271/271 named; pass | user confirms dynamic labels remain non-empty in runtime |
| one shared owner | App one mount; Float zero mounts | pass | user checks no duplicate bubble in each Tab |
| fallback normalization | existing UI contract extended for title chord/ordinary parentheses/`data-tip` mutation | updated, not executed | user runs focused Vitest |
| visual/lifecycle boundary | main Codex pseudo-tip suppression, pointer/blur cleanup, reduced-motion CSS | source pass | user hovers/focuses at normal/narrow width |
| documentation | code-link audit + requirement/canonical/current/knowledge/help sync | pass | no remaining documentation blocker |

## 2026-07-30 分批提交前复核

- 第一性原理：提示层只解释“这个控件是什么、怎么触发、为什么不可用”，不拥有业务动作；一个主窗口只有一个提示 owner，鼠标与键盘得到等价信息，生命周期随控件和窗口结束。
- 原始需求：回看用户“优化所有页面按钮悬浮提醒”的原话与本 Spec 边界，主应用全部页面、动态属性、快捷键括号、旧 `data-tip`、Codex 双气泡和 Float 例外均有对应实现/合同，未改按钮命令、快捷键或布局。
- 实现合理性：事件委托避免逐页重复组件，MutationObserver 只刷新提示相关属性，原生 `title` 兼容值保留并在卸载恢复；viewport clamp、箭头和 reduced-motion 由共享样式统一。静态审阅未发现 P0/P1，运行时视觉与辅助技术仍由用户验收。

## Documentation Impact

- Classification: `requirement-canonical`
- Central Rule Task admission: `project-local / no central row`
- `doc_drift`: resolved；raw/Spec、PRD/status、architecture/technical details、shared help、developer soul 和既有 error memory 已同步。
- Root acceptance gate: 文档与实现已同批收口；开发验收仍为 `未校验，待用户验收`。

## Execution Journal

| Event | Trigger / Evidence | State Change | Root Decision |
| --- | --- | --- | --- |
| requirement expanded | 用户要求核验并优化所有页面按钮悬浮提醒 | 建立新的 Standard requirement | 复用共享 owner，不扩大到 Float 子窗口 |
| design gate ready | 项目 design preference receipt 12/12 categories complete | 固定 quiet overlay、hover/focus 等价和 reduced motion | 不新增依赖或页面专属提示组件 |
| static inventory | 主应用页面/组件 271 个原生按钮与自定义 button role 审计 | 均存在命名来源；发现 Codex 双提示风险 | 优先修共享层与主应用样式 owner |
| implementation complete | shared layer/style and existing UI contract updated | one main-app tooltip owner now covers fallback/detail/dynamic lifecycle | Float boundary preserved; no page business logic changed |
| documentation integrated | PRD/status/architecture/technical details/help/soul/error memory synchronized | `doc_drift` resolved | shared cross-feature help lives in Settings guide |
| allowed static checks | 271-button inventory, owner/CSS searches, diff check, code-link audit | task-owned static evidence passed | development checks intentionally remain user-owned |

## Efficiency / Token Evidence

- Baseline / observed / delta: not applicable（main-only）。
- Confidence / source: 本地源码与项目权威文档。
- Usage: `usage unavailable`

## Closeout

- Requirement Manifest / project version: global operation tooltip v1 integrated into `2026-07-30.2`。
- Canonical merge: complete。
- Verification: task-owned static checks passed；development acceptance remains `未校验，待用户验收`。
- Documentation and memory/error routing: complete；current docs/help/developer soul/existing error memory synchronized。
- Open gate / owner: Vitest/typecheck/build/uTools and visual hover/focus/reduced-motion acceptance belong to user。
