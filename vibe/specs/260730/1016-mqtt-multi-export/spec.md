# Standard Requirement Spec: MQTT 多选快速导出

Tool: codex
Date: 2026-07-30
Status: `integrated`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)

## Task Documentation Sync Group

- Group key: `dsg:eypc:mqtt-multi-export-v1`
- Group owner: this `spec.md`
- Git document prefixes: 本任务目录、MQTT current sync、产品/项目状态、项目知识与 MQTT 用户说明。
- Durable document members, including raw/canonical and clean consulted owners: 见下方 manifest。
- Declared code/config dependencies: MQTT 导出领域逻辑、Runtime Action、页面/样式、platform/preload 和既有测试契约。
- Linked current/rule/memory authorities: [MQTT current sync](../../2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1), [documentation rules](../../../rules/documentation.md#L1), [developer soul](../../../knowledge/developer-soul.md#L1)。
- Excluded unrelated dirty documents: Codex Companion 的 preload/tests/spec/error-memory 改动不在本任务范围；`PRODUCT_REQUIREMENTS.md` / `PROJECT_STATUS.md` / `ARCHITECTURE.md` 既有 Codex 脏 hunk 保留，本任务仅追加 MQTT 独立 hunk。
- Lookup contract: `get --lookup-only` 只检索；本任务不复用旧 receipt。
- Shared-file stage ownership: 不执行 stage/commit；共享文件仅修改 MQTT 段落。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:mqtt-multi-export-v1",
  "group_owner": "vibe/specs/260730/1016-mqtt-multi-export/spec.md",
  "documents": [
    "vibe/specs/260730/1016-mqtt-multi-export/raw-requirement.md",
    "vibe/specs/260730/1016-mqtt-multi-export/spec.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/rules/documentation.md",
    "src/help/guides/mqtt.md"
  ],
  "dependencies": [
    "src/domain/mqttExport.ts",
    "src/runtime/appRuntime.ts",
    "src/platform/eypcPlatform.ts",
    "src/pages/MqttPage.vue",
    "src/styles/app.css",
    "preload/index.js",
    "public/preload.js"
  ],
  "validators": [
    "tests/domain/mqtt.test.ts",
    "tests/runtime/action.test.ts",
    "tests/integration/appPluginEnter.test.ts",
    "tests/platform/favoriteFileBridge.test.ts",
    "tests/ui/mqttPage.test.ts",
    "scripts/validate-utools-runtime.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260730/1016-mqtt-multi-export",
    "vibe/specs/2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/rules/documentation.md",
    "src/help/guides/mqtt.md"
  ]
}
```

## Requirement Delta

- Add: MQTT 当前记录列表已选项的融合 JSON 复制/文件导出。
- Add: 多选复制拆分为「只复制 topic」「只复制 payload」「全都复制（融合 JSON）」；单条快捷操作/详情同步提供三项。
- Confirmed facts: 既有 `mqttRecordListStates` 拥有分列表选择集；剪切板走 platform；文件导出需新增用户选定路径的 preload 桥。
- Pending decisions: 无；未指定的样式和焦点行为继承现有 MQTT 工作台。
- Acceptance criteria: 已选集可按三种复制模式导出、格式无损、取消保存无副作用、导出后保留选择、提示成功/取消/失败。

## Plan-Mode Preflight

- Scope: 实现 MQTT 已选记录序列化、Runtime Action、剪切板/文件桥与顶栏操作；不改 MQTT 连接、归档、快捷键、删除和远端 Broker 行为。
- Risk boundary: 文件写入仅在用户从系统保存对话框选择的单一路径发生；不覆盖未选定路径。
- Documentation level: Standard requirement，由本 Spec 与 raw 承载。
- Test scope policy: 不新增测试模块，只更新既有契约；按项目门禁不执行测试、typecheck、build 或运行态验收。
- Prior-task overlap: `new-task` with `partial-overlap`，复用 MQTT current sync 与多选机制，仅增加导出净增量。
- Documentation impact: `requirement-canonical`，Root 同步 raw/Spec/PRD/current sync/status/架构/技术详情/用户说明。
- Authority Packet: 项目 rules/documentation/developer-soul、PRODUCT_REQUIREMENTS、MQTT current sync、platform/preload 现有文件和剪切板桥；问题仅是导出边界与最小 UI 接入。
- `doc_drift` strategy: 源码当前无批量导出，文档也无此承诺，未发现冲突；实现后同批更新。
- Sidecar: not applicable，边界集中且 Root 已有完整代码和桥路径证据。

## Prior Task Overlap

- Relationship: `partial-overlap`
- Document governance: 现有 MQTT 权威是 [current sync](../../2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1)；本任务作为新的有界需求增量单独记录。
- Execution logic verification: 既有选择、行顺序、Runtime Action 和剪切板路径仍适用；无已实现的导出逻辑可复用。
- Traceability and decision: `new-task`，在 current sync 中增加反链。

## Canonical Merge

- Base project version: 2026-07-30 当前 `PRODUCT_REQUIREMENTS.md`。
- Result project version: 2026-07-30 MQTT 多选融合 JSON 导出已并入当前 PRD/current sync。
- Target sections and backlinks: PRD `MQTT`、MQTT current sync，PROJECT_STATUS MQTT 行。
- Merge status / missing target: complete；无缺失 canonical target。

## Implementation Sync

- Changed logic / desired behavior: 当前消息、历史或收藏/模板列表出现显式多选时，顶栏显示数量与复制/保存按钮；输出一个版本化融合 JSON，保留原始 payload，合法 JSON 另附结构化值，导出后保留选择。
- Authoritative current document: [MQTT current sync](../../2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1)。
- Entry-to-module/storage/integration mapping: [MqttPage.vue](../../../../src/pages/MqttPage.vue#L1) → Runtime Action [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1) → pure projection [mqttExport.ts](../../../../src/domain/mqttExport.ts#L1) → clipboard or normalized platform `saveTextFile` → mirrored desktop preload save dialog/write bridge。
- Verification evidence: 既有 [mqtt.test.ts](../../../../tests/domain/mqtt.test.ts#L1)、[action.test.ts](../../../../tests/runtime/action.test.ts#L1)、[favoriteFileBridge.test.ts](../../../../tests/platform/favoriteFileBridge.test.ts#L1)、[mqttPage.test.ts](../../../../tests/ui/mqttPage.test.ts#L1) 契约已更新；按项目门禁未执行。
- Gap / follow-up / not applicable: 真实 uTools 保存对话框、剪切板与窄宽工具栏由用户验收；未新增快捷键，not applicable。

## Verification

### Verification Decision

- Route: `user-owned`
- Reason: 项目明确规定由用户执行测试、typecheck、build、uTools 与 UI 验收。
- Checked: 文档代码链接、task diff 格式、两份 preload 语法与完整镜像、MQTT `saveTextFile` 实现块/暴露点、同步 IPC 与 main entry 同步宿主依赖静态搜索。
- Skipped: Vitest、typecheck、build、uTools/runtime、截图和真实文件保存。
- Owner: user。
- Residual risk: 保存对话框、剪切板与窄宽顶栏交互需真实 uTools 验收。

| Check | Evidence | Result | Remaining Manual Path |
| --- | --- | --- | --- |
| requirement/raw/canonical parity | raw + Spec + PRD/current sync | synchronized | user reviews requirement interpretation |
| export domain contract | existing MQTT domain test contract updated | unverified | user runs focused Vitest |
| clipboard/file bridge | existing Runtime/preload test contracts updated | unverified | user runs focused Vitest + real uTools save |
| UI/accessibility | semantic buttons, explicit labels, polite selected-count status; source contract updated | unverified | user runs UI/runtime acceptance |
| allowed static structure | code-link audit, diff check, preload syntax/full SHA-256 mirror, MQTT bridge mirror, sync-IPC/main-entry searches | pass | no remaining static blocker |

## Documentation Impact

- Classification: `requirement-canonical`
- Central Rule Task admission: `project-local / no central row`
- Parent identity or local parent backlink: MQTT current sync。
- `doc_drift`: resolved；实现、canonical/current、architecture/technical detail 和用户说明已同步。
- Affected authoritative documents: raw/Spec、PRD、MQTT current sync、PROJECT_STATUS、ARCHITECTURE、technical-details、MQTT 用户说明。
- Root acceptance gate: 实现与所有必要文档已同步，但仍标记“未校验，待用户验收”。

## Execution Journal

| Event | Trigger / Evidence | State Change | Root Decision |
| --- | --- | --- | --- |
| requirement confirmed | 用户提出 MQTT 多选快速导出 | Standard requirement 已建立 | 复用现有多选与 Runtime Action，新增最小文件桥 |
| design gate ready | project MQTT workbench + global interaction/accessibility preferences | 固定工具栏中加入语义化 count/copy/save cluster | 不新增依赖或快捷键 |
| implementation reported | domain/runtime/platform/preload/UI 与既有契约已更新 | merged-export v1 端到端路径完成 | 保留选择；保存路径由用户决定 |
| documentation integrated | PRD/status/current sync/knowledge/help 同步 | `doc_drift` resolved | 开发验收仍归用户 |
| allowed static checks | link/diff/syntax/full mirror/sync IPC searches | task-owned checks passed | 未执行项目禁止的测试/typecheck/build/runtime |

## Efficiency / Token Evidence

- Baseline / observed / delta: not applicable（main-only）。
- Confidence / source: 本地源码证据。
- Usage: `usage unavailable`

## Closeout

- Requirement Manifest / project version: MQTT multi-export v1 integrated。
- Canonical merge: complete。
- Verification: task-owned static structure passed；development acceptance remains `未校验，待用户验收`。
- Documentation and memory/error routing: complete；architecture/technical-details/help 已同步，developer soul 无新增偏好信号，暂无 error-memory 信号。
- Open gate / owner: 真实 uTools 交互与聚焦测试由用户验收。
