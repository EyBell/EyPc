# Orca Companion Provider

spec_id: SPEC-260913-ORCA-COMPANION
status: implementing

## Goal

把本机 Orca Agents 接成 EyPc 第四个 Companion Provider：状态、跳转、跟踪。默认关闭。

## Contract

见 [raw-requirement.md](raw-requirement.md#L1) RAW-219、RAW-220。

实现要点：

- Manifest `orca`：opt-in，`open` / `archive` / `topology`，pin inbound+outbound。入站优先 `terminal.isPinned`，CLI 缺字段时直读 `orca-data.json` 会话库 tab 布尔。EyPc 置顶写回 `terminal pin --pinned/--no-pinned`，收到同 handle/tab 的回执后，再用 `terminal list` 核对同 handle/paneKey 的布尔才确认。显式 false 优先于旧文件 true。仅有 `agentIdentity`、没有对话的工具栏窗格不进清单。Orca 窗口里已关掉的窗格不进清单：`terminal list` 没有该 `paneKey` 时丢掉 `worktree ps` 残留行。
- Preload `preload/orca/`：CLI 解析、inventory、switch、pane close。成功的 `terminal list` 是还开着的窗格权威；关在 Orca 窗口里、list 已没有的 `paneKey` 不得再用 `worktree ps` 残留行合成卡片。`terminal list --include-visual-layouts` 只取 **tab** 节点（`tabId` + `activeLeafId` + `title`）作抬头；同 `tabId` 的 pane OSC 标题（工作中常是 spinner）不是主题。Grok `Waiting for response` 会被 Orca 规范化成 `⠋ Grok`，EyPc 在 `agent.state` 仍为 `done`、尚无 toolName 时也要标进行中。Claude Agents 已是 `done` 时，残留 OSC `✳` 不得抬回进行中。Agents 仍为 `working` / `waiting` / `blocked` 时不得因 `workingMode=monitoring` 或 `turnCompletedAt` 收成已完成；`waiting` / `blocked` 与中断仍优先。主轮次结束以 Agents 离开活状态为准，`unread=true` 只在已非活状态时记已完成未读。失败则回退无布局的 `terminal list`。Orca 三处状态不是一份：标签卡才有已完成未读和标签钉；左侧树只有 working/done/interrupted；Agent Session History（`aiVault.listSessions`）无 unread/pin/phase，禁止当未读或钉，也禁止读 preview。工作树 `unread` 是汇总；CLI agent 行带布尔 `unread` 时卡片跟该字段。没有按窗格字段时，仅当该工作树只有一条已完成会话才可吃汇总；多条已完成不得猜最右/最新。禁止扇出到组内每一条。仍为 `working` 的 Claude 窗格不得吃工作区汇总未读。
- 排序与行上时钟：`lastQuestionAt` 只取进入 `working` 的 `stateStartedAt`。`lastOutputAt`、中途 `updatedAt`、轮询 `acceptedAt` 不得进入提问钟。完成/中断发 `lastQuestionAt: 0`，Kernel `incoming || previous` 保留上一问。
- 打开成功后列表高亮跟到当前任务；「上一个 / 下一个」沿用 Kernel `cycleKeys` 状态候选顺序，只有环内打开会接管循环游标。已读完成项的展示分组不得覆盖循环候选（[RAW-182 修复](../../260915/companion-cycle-authority/task-card.md#L1)）。
- Kernel 经现有 V7 证据车道消费；Host 1 秒轮询 `watchInventory` 后 `queueCompanionHostReconciliation('orca')`。
- RAW-220：标签栏已完成未读应在 Orca 按窗格导出。未导出前，EyPc `unread-bridge` 把「曾观测到进行中 → Agents `done`」记成本地已完成未读；`working`+`monitoring` 仍算进行中，不记账。缺原生字段时，插件 `terminal switch` 派发成功后只清临时账本这一轮；已有原生布尔时不清本地缓存中的原生未读，等后续轮询原生 false。进行中点卡片仍不得改成已完成。CLI `agent.unread` 布尔优先。原生 `dispatched` 仍不确认 Orca 窗口已读。
- 设置页「接入 Orca」；Float 项目筛选增加「只显示 Orca」。

## Verification

Focused：`orcaCli` / `orcaInventory` / `orcaPin` / `orcaOpen` / `orcaArchive` / `orcaUnreadBridge` / companionProvider / companionPresentation。

Real uTools / 浮窗对照需用户明确授权后再做。

- 2026-09-15 存储隔离：未读账本每轮扫描合并提交，未变化的完成记录不写；通过宿主注入的 `utools.db.promises.get/put` 沿用 `_id/value/_rev` 文档，禁止这条链调用同步 `dbStorage`。单写者只保留最新待写状态；失败留脏到下一次观测重试。初读最多异步等待 1 秒，失败或超时后仅保留会话内状态，不覆盖未知旧账本；因此异常会话的新回执不保证跨重启保存。该修复尚无真实宿主验收。

## 2026-09-17 Claude 残留 OSC 不得钉进行中

- 授权范围：用户确认 F1/F3。现场 `km-srm-ref` Claude Agents 已是 `done`，窗格 OSC 仍以 `✳` 开头，库存把已结束回合抬回 working，已完成未读进不来。Grok `⠋ Waiting for response` 继续可在 Agents `done` 时标进行中。
- 当前：implemented-local / focused-tests-passed / artifact-ready / host-reload-pending。`orcaInventory` 33/33、`orcaUnreadBridge` 14/14。产物 `host-2f5fe28e747c664d8f1b` / `renderer-81460a26a4391da4e01a`，北京时间 `2026/09/17 20:49:52`。
- VerificationImpactTrace：Orca Agents `done` + pane OSC → `sessionState` → unread-bridge 观察 projected working→done。聚焦 `orcaInventory` / `orcaUnreadBridge`；不运行全仓测试。

## 2026-09-16 Claude 主轮次结束信号

- 授权范围：用户确认 Grok 已完成未读可通、Orca 内 Claude 任务结束后 EyPc 仍不跟进；把 Claude `workingMode=monitoring` / `turnCompletedAt` / 窗格 `unread=true` 收成主轮次已完成，并禁止工作区汇总落到旁路 done 行。
- 当前：implemented-local / focused-tests-passed / host-retest-pending。`orcaInventory` 31/31、`orcaUnreadBridge` 13/13。正式 CLI 仍不导出 `agents[].unread`。17:05 包的 toolName 短路已被二次纠正取代。
- 2026-09-16 用户纠正（二次）：已加载 `host-3511f71c23bb5ea98b6d` 后仍把该卡显示为已完成已读。诊断 `phase-transition` 在 completed↔running 间振荡（工具间隙 `monitoring` 无 toolName 就折成 done，快捷打开变成已读，下一工具又拉回 running）。改为：Agents 仍 `working/waiting/blocked` 时 `monitoring` / `turnCompletedAt` 一律不 lead-complete；已完成未读只在 Agents `done` 时记账。
- VerificationImpactTrace：Orca Agents live state → inventory `sessionState` → unread-bridge 只观察 projected `working→done`。聚焦 `orcaInventory` / `orcaUnreadBridge`；不运行全仓测试。

## 2026-09-15 状态同步收敛（F1、F2）

- 授权范围：收敛既有 RAW-219/220 文档，补齐 Orca 原生未读与标签置顶读写、同一任务回读及 EyPc 接管；真实宿主验收仍属后续 F3。
- 执行：沿用本任务已存在的 EyPc main 与 Orca czz-dev 局部实现，只增量修改状态/置顶边界；保留启动卡顿任务及其他未提交修改。未创建第二份需求权威。
- 当前：implemented-local / focused-tests-passed / artifact-ready / installed-host-pending。旧“猜最右/最新未读”方案已废弃。旧安装 Orca 1.4.202 的字段/命令缺口仍在；本地构建不等于正式交付。
- VerificationImpactTrace：Orca renderer 未读/钉 → runtime 图与 CLI 行 → EyPc inventory/打开/置顶 → 现有 Kernel 快照。聚焦核验逐窗格 true/false、同标签读写回执、旧 CLI 字段缺失、取消置顶优先级、原生未读不被跳转清除。选择对应边界的单元/合同测试与受影响编译、构建；不运行全仓测试，不启动或重载宿主。
- Sidecar：main-only；前轮已定位唯一状态与文档所有者，无独立代理检查需求。

## 当前状态链与验收

Orca 同一窗格完成/已读 → 原生 graph → CLI 布尔 → EyPc inventory → Kernel 单一快照 → Main、Float、Codex 功能 Tab、角标与循环。各界面共享 phase/unread/providerPin，不维护第二套 Orca 状态。

| 维度 | 当前实现 | 确认边界 |
| --- | --- | --- |
| 原生未读 | agents[].unread 的 true/false 优先；跳转不清原生 true | 等同窗格原生 false；派发不等于已读 |
| 旧版未读 | 缺字段时观测 working → done 的临时账本；打开清本轮 | 插件查看记忆，不冒充 Orca 橙点 |
| 标签钉 | terminal.isPinned 布尔优先，缺字段才读会话文件；写后同目标 list 回读 | 同 tab 的分屏共享标签钉；其他 tab 不受影响 |
| 写失败 | 不宣告原生成功，保留本地偏好回退 | CLI 缺命令、旧 handle、回执错目标、缺字段均失败 |
| 已完成/排序 | 沿用现有 phase 与提问时钟；不因打开或置顶重造相位 | 前景 `working/waiting/blocked` 不得变成完成；`monitoring` / `turnCompletedAt` 不能在活状态下收成已完成；Grok `done` 且无工作帧才是已完成；Claude Agents `done` 即使残留 `✳` 也是已完成 |

### 定向验证

- `orcaInventory`、`orcaUnreadBridge`、`orcaPin`、`orcaNativeHandoff` 共 48 项通过。覆盖显式 false 对旧 true、原生未读开后不清、轮询清除、同目标 pin/unpin、缺字段/旧 handle/错目标失败。
- 生产构建与 uTools runtime 校验通过；92 对已提交镜像一致，新追踪模块镜像随构建生成；需求登记、来源锚点、错误索引与文档链接检查通过。产物身份见当前 PROJECT_STATUS 条目。
- Orca 侧 77 项聚焦测试、node/CLI/web 类型检查和 CLI/桌面构建通过；对应本地需求 R4。
- 未执行全仓测试、实际 Orca 安装、uTools 重载或真实双向 UI 对照。插件继续保持启动卡顿任务设定的屏蔽状态；本轮不宣告卡顿已修复。

### 文档与 Git 落地核验

- 既有 EyPc RAW-219/220 和 Provider 代码已有历史提交；本次 F1/F2 修订留在 main 工作区，未提交/推送。
- Orca 原生导出需求原先已在 czz-dev 落盘但未提交；现在由原 Spec/Manifest/hub 续接 R4，不另建需求树。
- RequirementChangeReview：同一 outcome 的 compatible-update；澄清原生优先和写后确认，历史猜最右/仅本地钉表述 superseded。decision_status: selected-option（F1/F2）；无待决冲突。
- Documentation Impact：产品状态、当前 Spec、来源登记、Help、Architecture、Orca 错误记录与索引同步；保留历史原始记录。

### F3 仍待执行

新宿主/插件加载后，用可丢弃对话验证：开始 → 完成未读 → 原生查看 → EyPc 同步；双向 pin/unpin、同工作区多标签不串位、同标签分屏共享钉、working 时跳转不改变相位、关闭窗格退库存。若未来执行真实测试，先满足启动卡顿任务的宿主可测试条件。

## Task Documentation Sync Group

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:orca-native-state-sync-260915",
  "group_owner": "vibe/specs/260913/orca-companion/spec.md",
  "documents": [
    "vibe/specs/260913/orca-companion/raw-requirement.md",
    "vibe/specs/260913/orca-companion/spec.md",
    "vibe/specs/requirements/shared-raw-219.md",
    "vibe/specs/requirements/shared-raw-220.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "src/help/guides/codex.md",
    "vibe/knowledge/error-memory/orca-worktree-unread-must-not-fan-out.md",
    "vibe/knowledge/error-memory/orca-claude-monitoring-is-lead-complete.md",
    "vibe/knowledge/error-memory/orca-claude-done-asterisk-must-not-stay-working.md",
    "vibe/knowledge/error-memory/orca-workspace-pin-is-not-conversation-pin.md",
    "vibe/knowledge/error-memory/README.md",
    "vibe/knowledge/error-memory/modules/orca-companion.md",
    "vibe/knowledge/error-memory/modules/companion-inventory.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md"
  ],
  "dependencies": [
    "preload/orca/index.cjs",
    "preload/orca/inventory.cjs",
    "preload/orca/pin.cjs",
    "preload/orca/unread-bridge.cjs",
    "preload/orca/native-state.cjs",
    "preload/companion/provider-manifest.json",
    "vibe/rules/README.md",
    "vibe/specs/source-anchors/catalog.json",
    "public/orca/index.cjs",
    "public/orca/inventory.cjs",
    "public/orca/pin.cjs",
    "public/runtime-identity.cjs"
  ],
  "validators": [
    "tests/platform/orcaInventory.test.ts",
    "tests/platform/orcaUnreadBridge.test.ts",
    "tests/platform/orcaPin.test.ts",
    "tests/platform/orcaNativeHandoff.test.ts",
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs",
    "scripts/validate-committed-preload-mirrors.mjs",
    "scripts/validate-error-memory.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260913/orca-companion/raw-requirement.md",
    "vibe/specs/260913/orca-companion/spec.md",
    "vibe/specs/requirements/shared-raw-219.md",
    "vibe/specs/requirements/shared-raw-220.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "src/help/guides/codex.md",
    "vibe/knowledge/error-memory/orca-worktree-unread-must-not-fan-out.md",
    "vibe/knowledge/error-memory/orca-claude-monitoring-is-lead-complete.md",
    "vibe/knowledge/error-memory/orca-claude-done-asterisk-must-not-stay-working.md",
    "vibe/knowledge/error-memory/orca-workspace-pin-is-not-conversation-pin.md",
    "vibe/knowledge/error-memory/README.md",
    "vibe/knowledge/error-memory/modules/orca-companion.md",
    "vibe/knowledge/error-memory/modules/companion-inventory.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md"
  ]
}
```
