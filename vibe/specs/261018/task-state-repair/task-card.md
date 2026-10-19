# 任务状态扫描与等待识别修复

## 范围与状态

- 来源：2026-10-18 用户要求优先修复 Cursor 子任务时间与 Codex 嵌套发现两个 P1，再补 Orca 等待识别、核清未命名任务并定向验证、同步文档。
- 当前：四处初始修复及 Desktop-only 恢复提示续修已完成；排除前序脏改的提交候选快照通过 26 项检查 / 365 测试，既有工作区生产构建证据独立保留。用户安装后，13:59:57.738 精确握手确认最新正式包已加载。原目标现在已归档，获准清理的旧提示也已缺席，受控预检因此未执行写入；原目标的可见整组终态不能在当前现场验收。详见 [重载后核验与未闭环项](live-verification.md#L1)。用户已授权提交推送，精确提交与远端结果以 Git 回执为准；其余未知根留待后续核查。
- 执行：当前 main；三个可定向验证的既有入口修复，保留已有 Side 验证和文档脏改。无需切换运行 checkout 或创建并行工作树；本轮不接管其他任务。
- 前序：[Side 生命周期](../../261013/1425-codex-side-phase/lifecycle-verify.md)、[终态修复](../../261013/1946-side-terminal-reconcile/task-card.md)、[Orca](../../260913/orca-companion/spec.md)。
- 续修：用户追加 Desktop-only 终态补证、根卡 unknown 修复与真实界面复验；当前定位、边界及待测清单见 [终态恢复续修](terminal-recovery.md#L1)。
- 续修实现：已完成 ephemeral Side 的未来恢复提示优化，生产 Bridge 定向 17 个场景与完整构建通过；最新包 EyPc V7 / host-abd34702f885b19bbd12 / renderer-941f0a10e4b7c1c3269d / 13:47:59。现场已核对加载、原生归档库存、精确提示缺席及浮窗查询；没有将另一个可见未知根混作原目标，未扩展单条清理授权。

## BusinessChangeReview

- 基线：当前 [PRODUCT_REQUIREMENTS](../../PRODUCT_REQUIREMENTS.md) 的唯一 Kernel、精确父子关系、嵌套归根、RAW-165 事件时间与扫描时间分离、当前 interaction 优先于 running；需求登记仍保留其既有覆盖边界。
- Allowed delta：Cursor 子节点只使用自身源事件时钟；Codex 在原有 48 小时/24 个候选上计算已验证父子关系的可达闭包；已验证机器子任务的 parentThreadId 优先于继承历史的 forkedFromId；Orca 有明确问答/Plan 工具的等待产生 interaction，并在来源解除时清除。
- Preserved invariants：不按标题/路径/时间猜父子；无根循环与陌生家族不入组；guardian_review 排除、缓存和读取上限保留；未知 Orca 等待不猜审批；monitoring/OSC、未读、置顶、排序、归档权限、根任务唯一卡片沿用现有契约。
- 消费者：Provider evidence → Topology/Kernel → canonical package 的主界面/浮窗分组、计数、attention/cycle 与归档能力。
- 预期变化：新增回归揭露扫描时钟续期、孙任务先于父任务读取及缓存负结果、Orca 待答与解除；旧用例不删改预期。
- 未决/边界：未命名任务身份及独立卡片原因已确认，见下节；本轮产物加载与真实 UI 效果独立于自动验证。Orca 未知工具等待不猜审批类型。

## VerificationImpactTrace

- 所有者：当前主任务。范围为三个适配入口及其直接 Kernel 消费者，无新依赖、服务或运行监控。
- 选测：Codex discovery、provider evidence、Orca inventory 及生产 evidence→Kernel 回归；正常 verify:changed 按现有 map 选择核心检查。
- 构建：生产 preload 与帮助产物变化触及唯一 uTools 打包边界，选 production build（含 semantic typecheck、source/packaged 门禁）；镜像、入口预算、需求及来源锚点同步。
- 排除：全库测试、无关 MQTT、真实业务任务写操作。实现阶段未操作宿主；用户追加真机复核后，执行有限原生读取、插件加载及真实浮窗验证，未代答或改变源任务状态。已有 Bridge 全文件三项历史失败不作本轮通过声明。
- 扩展理由：新增固定回归登记触发现有 map 的全部已登记核心（25 项检查）；它是已有验证治理门禁，不是全库测试。入口预算 +15 行仅为 Cursor 源时钟和 Orca 既有 interaction builder 接线，函数数与可变绑定数不增。
- Desktop-only 续修新增 codex-side-recovery 精确选测（8 个 Bridge 用例），后续正常核心清单为 26 项。入口再增 8 行仅连接恢复候选时间的保留/撤回与延迟持久化；资格判定在既有解析 owner，入口预算为 14721/279/162。

## 未命名任务定位与修复

- 原生 metadata-only thread/read 确认：截图候选是已完成的一级文档子任务，name 为空，属于已有 SRM 根任务；其下还存在二级审查子任务。一级任务最后一轮结束于 2026-10-17 20:46:08，与截图 15.4h 一致；已有匿名 root-unread 发布记录也将该一级任务作为 branchCount=1 的独立根输出。
- 一级机器子任务同时带 forkedFromId 和 parentThreadId，二者均指向同一根；RPC sessionId 却等于子任务自身 id。旧 topology 优先检查普通 fork 的同 session 条件，因此隔离此机器成员，标题回退为“未命名任务”。二级成员又受到发现器只认初始根集合的限制。
- 修复后只对已验证机器来源优先采用精确 parentThreadId；普通跨 session fork 仍隔离，缺父、自环及循环仍不接纳。无需重命名、删除或改写原生任务。
- 证据仅保留有限结构与结论，生产测试使用匿名 ID；未保存对话正文、工具参数或原始运行日志。现有代理不可用后，metadata 查询使用同一 CLI 的短生命周期 stdio 读取，结束后关闭自建进程；未发送任何任务或用户答复。

## 定向回归与维护入口

| 编号 | 接受条件 | 测试与结果依据 |
|---|---|---|
| V1 | 连续扫描不延长旧 Cursor 家族；无时钟子任务不造完成时间；真实 hot 时钟仍生效 | [生产 evidence→Kernel](../../../../tests/platform/providerStateRepair.test.ts#L1)，旧实现两个时钟用例失败，修复后通过 |
| V2 | 孙任务先读、后补根与缓存重用均得到完整后代；无根循环保持排除；读取期间缓存清退不抛异常 | [发现回归](../../../../tests/platform/codexSubagentDiscovery.test.ts#L1)，旧实现失败、修复后通过；没有增加 RPC 上限 |
| V3 | machine parent 优先于继承 fork；普通跨 session fork 不放行 | 同一发现回归中的 topology 场景，按真实 metadata 形状匿名重放，修复前失败、修复后通过 |
| V4 | 明确问答/Plan 等待进入 input；重复扫描请求不漂移；同 epoch 工具变化或继续执行解除等待 | 生产 evidence→Kernel 的 Orca 组合；unknown 等待、working 工具残留与 interrupted 保留原边界 |

- 自动入口：新增 provider-state-repair 检查连接发现、观察、生产 builder→Kernel 及 Orca unread bridge；来源绑定 RAW-165/207/217/219，详见 [唯一机器映射](../../../knowledge/core-verification-map.json#L1)。
- 原有 Bridge 三项历史失败仍保留，不改断言、不 skip；本轮正常入口的既定范围不运行该全文件。
- 源代码与需求输入发生变化时只失效受影响证据。冻结后只由正常选测器写入 output 下的有限结构报告，不把原始 stdout/stderr 或对话保存到仓库。


## 首轮构建与核验记录

- Production build 已通过：1935 modules；semantic typecheck、合同及 uTools 验证通过。source/packaged 各 40 个核心、58 个生命周期、23 个原生未读检查通过，包含工作区原有 Side 补测；不冒充提交版或远端 CI 结果。
- 定向真实生产 Bridge 的两个既有 topology 场景通过；按用例名只选这两项，未运行其余 239 项。入口预算 14713/279/162，通过；无新增同步 IPC 或同步宿主依赖。
- 当前构建身份：EyPc V7；host-83b6f1b34fe25f130fba；renderer-d3e03114d98b1972af2b；2026/10/18 12:44:20（北京时间）。产物为 artifact-ready；用户重载后于 12:58:52.470 精确握手 `host-loaded`。四项指定展示效果已有现场证据，整组终态仍打开，详见 [真实界面核验](live-verification.md#L1)。
- 修复阶段的受限结构证据：[25 项核心检查报告](../../../../output/verification/261018-task-state-repair-core-accepted.json#L1)。报告由 verify:changed 生成，绑定当轮输入摘要，不保存测试原始输出。当时 status=passed、fresh=true；后续真机文档回填改变全仓摘要，该报告不冒充当前文档快照或真实 UI 整体验收。
- 首轮正常入口 25 项/357 测试通过；复查发现缓存可在异步候选读取期间清退，新增定向用例复现空缓存写入。已补存在性检查；首轮报告保留为历史，最终报告绑定该保护后的输入。preload 变化会改变渲染包内嵌 Host 身份；单独 prepare 被身份验证器拒绝后，已恢复完整 build，semantic typecheck、Vite 与 uTools 验证均通过。
- 缓存用例进一步固定扫描期间已有机器成员身份不瞬时丢失（否则影响未读消费者）；增强断言先失败，识别结果改为全部读取结束后同步发布。第二轮 25 项/358 测试的旧快照也保留为历史；修复阶段以 accepted 报告为自动验收依据，后续真实界面验证独立记录。
- 正常入口首次选测拒绝未登记的用户帮助路径；已将该直接消费者加入 provider-evidence 映射，保留 unmapped fail-closed 门禁后重新执行。
- 文档同步：当前产品真值、来源锚点、Orca 既有实现、用户帮助、架构和唯一验证映射均已更新。状态中枢已更正旧包加载事实：2026-10-16 14:53:56 的握手确认 host-d10e931a3ebc96931fd7 / renderer-b444fcf98569a9f24e93 已加载；本轮新包另由 2026-10-18 12:58:52 精确握手确认，两个证据独立保留。
- VerificationDecision：Standard / 三来源状态与机器拓扑 / 当前源码及明确原生 metadata / 正常核心选测与必要打包边界 / 不跑全库、不写真实任务 / 扩展仅由新回归登记触发既有核心清单 / 当前主任务验收 / 后续真机接受范围与未闭环项由 [live-verification](live-verification.md#L1) 维护。

## Desktop-only 续修核验

- 正常入口 [26 项检查 / 366 测试报告](../../../../output/verification/261018-terminal-recovery-core.json#L1) 为 `passed / fresh=true`；包含 8 个精确 Side 恢复场景。该报告绑定代码、测试、构建与当时文档输入；本节及现场收据回填后，文档增量另行验证，不重复已绿的业务套件。
- 完整构建通过 1935 modules、semantic typecheck、source/packaged 各 40 核心 / 58 生命周期 / 23 未读门禁；7 个本轮修改的生产 owner 在 preload/public/dist 字节一致，96 个镜像检查通过。入口预算 14721/279/162。
- 最新正式包于 13:59:57.738 实际加载，Host/Renderer 均与构建预期一致。短时开发入口已结束，临时本机 8092 静态服务已停止；实际浮窗 URL 指向安装的 asar 包。
- 原目标已在原生归档库存中，活动库存完整页不含该任务；精确提示键中原父关系及获准旧成员均为 0。预检因没有唯一匹配而拒绝写入；未创建清理收据或执行数据库更新，临时维护脚本与快照已移除。
- 现场仍可见的另一未知根指纹为 `h:3e1b4a967e3e3510`，不同于本轮原目标 `h:1022ce8e3f5169f3`。其 `sub+4` 只作为独立观察登记，未套用原目标的单条清理授权。原目标终态展示保持 `live-terminal-inconclusive-target-archived`，不宣称整组生命周期验收通过。
- 现场回填后另由 [文档增量报告](../../../../output/verification/261018-terminal-recovery-docs.json#L1) 绑定当前文档快照；只验证本次四份记录的增量选择，不把文档零选测计为业务回归。需求、来源锚点、相对链接与差异格式分别核验。

## 提交范围与独立快照

- 本轮 Git 交付只包含 Cursor 子时钟、Codex 嵌套发现与机器 parent、Orca 明确等待、Desktop 恢复提示及其生产镜像、回归、选测映射、帮助和文档；前序 1425 生命周期、Bridge 补测、错误记录及共享文档历史段保留在工作区，未纳入本轮范围。共享文件只按本轮 hunk 交付。
- [提交候选独立快照](../../../../output/verification/261019-task-state-commit-snapshot-accepted.json#L1) 为 `passed / fresh=true`：26 项检查 / 365 测试，生命周期 55 项、类型检查 282 个文件通过；输入摘要为 `f76c95e865f0ab29d6e84663b88a8c924f9a086a3894e8c0e6056ed512f9961d`。它已排除前序未提交补测；先前工作区的 366 测试 / 58 生命周期仍只代表其历史输入，不替代当前提交范围证据。
- 本轮接受状态仍为 `implementation-verified / host-loaded / live-terminal-inconclusive-target-archived`。用户已授权提交推送；Git 交付不关闭原目标无法现场验收、另一未知根及 Orca 待答解除等后续核查项。

## 文档同步范围

以下清单绑定本轮文档、实现依赖和校验入口；共享文件的整文件新鲜度不授予整文件暂存权，提交归属仍按上述 hunk 边界核对。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "eypc-261018-task-state-repair",
  "group_owner": "vibe/specs/261018/task-state-repair/task-card.md",
  "documents": [
    "vibe/specs/261018/task-state-repair/task-card.md",
    "vibe/specs/261018/task-state-repair/terminal-recovery.md",
    "vibe/specs/261018/task-state-repair/live-verification.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/verification-map.md",
    "vibe/specs/260913/orca-companion/spec.md",
    "src/help/guides/codex.md",
    "vibe/rules/documentation.md",
    "vibe/rules/local-context.md",
    "vibe/specs/requirements/codex-raw-181.md"
  ],
  "dependencies": [
    "preload/index.js",
    "preload/codex/desktop-activity-resolution.cjs",
    "preload/codex/inventory-thread-topology.cjs",
    "preload/codex/side-relation-hints.cjs",
    "preload/codex/subagent-discovery.cjs",
    "preload/companion/evidence-adapter-v7.cjs",
    "preload/orca/inventory.cjs",
    "public/preload.js",
    "public/codex/desktop-activity-resolution.cjs",
    "public/codex/inventory-thread-topology.cjs",
    "public/codex/side-relation-hints.cjs",
    "public/codex/subagent-discovery.cjs",
    "public/companion/evidence-adapter-v7.cjs",
    "public/orca/inventory.cjs",
    "public/runtime-identity.cjs",
    "vibe/knowledge/core-verification-map.json",
    "package.json",
    "output/verification/261018-terminal-recovery-core.json",
    "output/verification/261018-terminal-recovery-docs.json",
    "output/verification/261019-task-state-commit-snapshot-accepted.json"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs",
    "scripts/verify-core-changes.mjs",
    "scripts/validate-preload-entry-budget.mjs",
    "tests/platform/providerStateRepair.test.ts",
    "tests/platform/codexSubagentDiscovery.test.ts",
    "tests/platform/codexAppServerBridge.test.ts"
  ],
  "git_scope_prefixes": [
    "vibe/specs/261018/task-state-repair/task-card.md",
    "vibe/specs/261018/task-state-repair/terminal-recovery.md",
    "vibe/specs/261018/task-state-repair/live-verification.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/verification-map.md",
    "vibe/specs/260913/orca-companion/spec.md",
    "src/help/guides/codex.md"
  ]
}
```
