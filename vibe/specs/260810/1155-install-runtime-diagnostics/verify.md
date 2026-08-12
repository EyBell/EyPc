# RAW-160 → RAW-164 Companion V4 Verification Record

Status: `RAW-164 increment-automated-verified / rebuilt-artifact-ready / dev-plugin-reload-pending`

## VerificationImpactTrace

| 影响边界 | 自动化证据 | 当前状态 |
| --- | --- | --- |
| V4 reducer / Plan lifecycle | 私有分支矩阵、旧 idle+新 active、主/Side 冲突、Plan/ordinary interrupted、default execution | passed |
| RAW-162 Goal/Turn completion | active Goal 跨两个自动 Turn 零中间 completed、Goal complete 单次完成、四类待继续、cleared/unsupported 回退、暂时失败/真实 timeout verifying、乱序/重复、main/Side、隐私 | passed；Bridge `138/138`，Kernel `39/39` |
| RAW-163 main-first Side Chat projection/open | 历史增量；parent-only 打开保留，main-first 展示门槛由 RAW-164 取代 | historical passed；Bridge+Kernel `177/177` |
| RAW-164 Side topology / all-bead priority / Cloud unread | inventory child 归根且不进公共行；running > completed-unread > completed；active/unread 计数互斥；Goal active 中间 Turn+unread 不终态；完成/已读抗旧快照；三类匿名诊断 | passed；5 files / `189/189` |
| Exact open / alias recovery | Renderer 旧 alias/revision/phase 在 Host 同 key 存在时被忽略；Host 目标缺失、并发过期、私有映射续签、目标消失、同 key 单次重试、失败不推进 | passed |
| UI entry / badge geometry | 卡片、标题、Enter、紧凑 input、全局 feature routing；单数字/两位数/`99+` 与预览合同 | passed；真实视觉待宿主 |
| Window / badges / cycle / pause | 跨窗口例外、无 stopped badge、独立 waiting badge、四层循环、暂停/迁移/四槽 | passed |
| Actions v2 / Execute Plan | 首击零 RPC、确认取消、无专用 Implement Plan 请求仍保留菜单、第二击 Host activity/pending 精读、open/resume/start、single-flight、indeterminate、model/effort、零公共提示 | passed |
| Change-only publication | 1,000 等价 observation；100 次 Renderer focus 变化；Kernel/Main/Float/Navigation/Actions 零公开语义发布，Host 私有焦点保持最新 | passed |
| Float applied ACK | received/applied/rejected、500ms 单次 resend、1s health-gated recreate、同 revision 引用稳定 | passed |
| Codex native unread / terminal recovery | 即时目录读取、1 秒 StatWatcher、watcher error 自愈、原子 rename、active+persisted-unread 定向 latest Turn、Main hidden→Float applied | passed |
| Codex external archive membership | Desktop 手动归档无广播、`sessions/archived_sessions` watcher、1 秒 StatWatcher、双清单全分页对照、精确 `archivedKeys`、dirty archived 排除、watcher 重建、本地事务 suppression retain/release | passed；focused `5/5`（4 new），Bridge `131/131` |
| Atomic Branch/public commit | 私有 Branch Evidence deferred staging 与同源 Host draft 单事务提交；一次语义变化一次 revision | passed |
| Claude hidden Host / state / membership / unread / archive | Hook/App-log/成员/未读首事件即时处理、已登记目标 1 秒 Node recovery、部分 JSON 保留、同值指纹零通知、Main hidden→Float applied、1.28929.0 固定语法与 stopped 直接归档 | passed；真实开发 Host 重载待验收 |
| V3 retained foundations | 240 项、全 cursor、第 41/101/201、Codex archive transaction、Runtime Identity、diagnostics | passed |
| 当前 Codex 增量测试 | core `3/3` files、`221/221` tests；expanded `15/15` files、`433/433` tests | passed |
| type / build / mirrors / validator | typecheck、1871 modules、canonical/public mirror generation、Runtime Identity、uTools validator | passed；artifact `host-251a728efafbf4c7f7d6 / renderer-a671d108ff9d315b7ea4` |
| 仓库全量套件 | RAW-160 曾由用户明确要求在中央 Kernel/Actions/Host watcher 缺陷逃逸后升级 | historical current-foundation passed；`83/83` files、`1328/1328` tests；RAW-161/162/163 无新升级触发，未重复运行 |
| 文档与规则审计 | Controlled group、RAW-067/160、状态/架构/既有错误记忆、code-link、diff | final audit recorded below |
| uTools 开发模式当前身份矩阵 | `runtime-identity-handshake=host-loaded` 后 20 秒稳定窗口与两次匿名快照；见 [host handoff](handoff.md#L1) | pending reload |

## RAW-159 Historical Gate Review

RAW-159 的自动化基线为 83 files / 1272 tests 和 production artifact-ready；安装宿主随后复现了普通 interrupted 过宽、Plan/角标不稳定与消费者 applied 状态缺口，所以该 gate 记为 `host-reproduced-failure / superseded-by-RAW-160-v4-rework`。它的全分页、归档后置条件、诊断与 Runtime Identity 证据仍是有效回归基础，但不能单独作为当前接纳。

## Historical V4 Gate — Invalidated

下列数字只描述本轮 rework 之前的历史 V4 gate。真实安装宿主随后复现状态、打开与角标回归，因此不得继续用它们宣称当前版本无已知 P0。

- V4 最终受影响矩阵：`13/13` files、`445/445` tests。
- 最终全仓：`83/83` files、`1282/1282` tests；首次全仓发现 3 个 RAW-029 旧提示断言，升级到 RAW-160 固定文案后完成 Claude Bridge 与全仓复跑；最终架构收口删除 15 个 Controller 旧裁决/兜底测试，并由 Kernel ownership、attention progress、reload-required、Claude read-hint 与真实 Kernel adapter 测试承接，最终测试总数因此按当前权威基线重新计数。
- 最终聚焦身份/Kernel/Float/Actions：`4/4` files、`62/62` tests。
- 当时的 production artifact 身份为 `host-495d79c14c1cbb24794d / renderer-568dfd47041bcb997f6b`；它不是本轮待验收重建包。
- Main、Float、Kernel、Actions、Navigation、Claude archive 的 canonical/public/dist 逐字节一致；相关 JS/CJS/MJS `node --check` 通过；同步 IPC/`Atomics.wait` 静态扫描零命中；`git diff --check` 通过。
- 改动文档 code-link audit 通过；Controlled sync group JSON 可解析且类别互斥，覆盖 44 份文档、14 项依赖、12 项 validator 和 11 个写集前缀。CodeNote `ey-pc` 项目入口只负责路由，已核对仍指向本仓 `AGENTS.md / vibe/rules/README.md / vibe/specs/PROJECT_STATUS.md`；当前状态已在被路由文件同步，因此不向全局索引复制 RAW-160 业务状态。
- 自适应错误索引只对本轮范围收口：Claude module 补齐 `module-v1`，新增 link-only Companion Task State module 为本轮 Plan/状态/缓存/版本记忆提供唯一 Primary owner。项目 flat root 缺 `root-v1` 及其历史叶子未迁移是既有仓库债务，本轮未批量移动、删除或吸收。
- `audit_ai_rules.py --mode project --git-view working` 当前报告 137 项项目级既有自适应索引/过程模板债务；按本轮新增/修改的 Plan、consumer cache、Claude phase、V4 ownership、Goal/Turn completion 及其模块/记录关键词过滤为 0 项。该 broad baseline 未冒充绿色，也不扩张 RAW-160/162 写集。
- 规则链五层只读核验通过：Codex/Claude 全局入口均引用 CodeNote kernel；项目 `AGENTS.md / CLAUDE.md` 仅保留预期入口说明差异且共同路由同一项目规则；所有当前 rule/status 目标可读；`.agents/skills/companion-state-reconciliation` 解析到带有效 frontmatter 的 canonical Skill。未新增/改名 Skill，因此无需用本轮会话宣称新的索引加载证明。
- `codexAppServerBridge` 假 App Server 覆盖 Execute Plan；没有启动真实 Codex Turn。
- Claude archive 测试使用夹具；没有重复写真实 Claude 会话。

## 2026-08-11—12 Regression Rework Evidence

- 当前受影响矩阵为 `20/20` files、`547/547` tests，覆盖 Kernel、App Server Bridge、Actions、Domain、Controller、Float UI、process navigation、Feature Routing、Runtime Identity、Claude cold/live state、membership、unread 与 package/consumer boundaries。
- RAW-160 历史状态矩阵覆盖主运行+Side 终态、Side 运行+主 interrupted、旧 idle+新 active、审批/普通输入、全完成、全终态 idle 及冲突 verifying；其中“Side 运行覆盖主 interrupted”的期望已由 RAW-163 取代，当前必须保持主 interrupted/stopped 展示。
- 打开矩阵覆盖 Renderer 旧 alias/revision/phase、生命周期重建、两个并发过期请求共享一次解析、私有映射直接续签、目标消失；Host 已持有 key 时断言直接采用当前 target、零库存读取，缺失时仍始终同 key、最多一次重试、失败不打开其它任务且不推进 attention。
- UI 合同覆盖卡片/标题/Enter 统一 `codex.task.open`、紧凑角标 `codex.input.open`、uTools feature 路由，以及 Float/设置预览的 `20px` 高度、`20px` 单数字最小宽度、共同 padding/radius 和无 monospace/tabular 设置。
- 最终代码复核追加三条反向合同：Kernel `unknown` 投影保留可信库存语义且不制造 running；新 hydration-only active 以 unknown 为前态且不进入 active；待输入直接入口无候选时返回 unavailable，不回退本地置顶，而普通循环仍保留 pin fallback。
- 焦点回声反向合同连续提交 100 个不同 `focusedKey`，断言公开 package revision、publishedAt 与订阅发布均不增长，同时 Host Actions 上下文保留最后焦点；Controller 的 card/input/cycle 打开也断言不在动作前同步任务包。
- 追加 Claude hidden-Host P0 后，真实链测试在 `onPluginOut(false)` 下穿过 Hook queue → process Host → Kernel → Float task-package → applied ACK：正常首事件 `≤250ms`；人为丢弃目录通知后，1 秒 Node StatWatcher 恢复且总时限 `≤1.25s`。1,000 个等价 Hook 尾事件只产生第一次语义通知；半行 JSONL 在换行前保留，不会因即时 drain 丢失。
- 最终同类计时器审计又覆盖 Claude task membership 与 unread：首次 `fs.watch` 回调同步处理，已登记会话/LevelDB 文件由一秒 StatWatcher 补漏；部分 JSON 不删除最后可信任务，同值 unread 指纹不通知。Plan 完成但缺少专用 Implement Plan 请求时，菜单能力仍保留，第二击再由 Host 精确拒绝真实活动/普通 pending。
- 当前影响选择矩阵为 `20/20` files、`547/547` tests；包含 Claude App `1.28929.0` 固定状态语法、cold replay abstain、generic session-end 不覆盖 completion、stopped 行内两次确认归档、Codex/Claude Provider 写前复核和未知相邻版本 fail closed。
- Codex 未读 P0 暴露前一轮的升级门禁曾通过：`83/83` files、`1325/1325` tests、语义 typecheck、1871-module Vite build、uTools runtime preparation 和 validator；该历史产物身份为 `host-7d964955afb146b4ee98 / renderer-3549884a1cbfed8c3984`，不再是当前接纳目标。
- Codex 未读真实宿主失败返工后，核心 `3/3` files、`221/221` tests 与扩展 `15/15` files、`433/433` tests 通过。覆盖 native event 丢失、目录 watcher error 后重建、原子 rename、进程 Host 1 秒恢复、mainHide→Kernel→Float applied，以及连续 1,000 个同值 stat 信号零额外 revision/Float send。
- persisted unread false→true 在旧 exact active/turn-started 下仍会定向读取最新 Turn；测试确认 active 收敛 completed-unread，同时更新正向 sequence 可拒绝迟到终态。Codex rollout waiting 进入/退出也由 Host StatWatcher 恢复，不再依赖 Renderer `phaseOnly` interval。
- Kernel 测试确认同一源事件的 Branch Evidence 先 deferred staging，再与 Host draft 一次提交：只增加一次 package revision/订阅发布；相同 evidence 不发布。
- RAW-160 最新完整 `pnpm run verify` 通过：`83/83` files、`1328/1328` tests、语义 typecheck、1871-module Vite build、Preload 镜像生成、uTools runtime preparation/validator；对应产物身份为 `host-252d34393f05b238e278 / renderer-ff8fbe75184168a9e150`。RAW-161 当前增量证据和身份记录在下节；上一条 `1325/1325` 与 `host-7d…` 只保留为更早历史门禁。
- canonical/public Preload 由项目同步脚本生成；没有手改生成镜像。真实 uTools、原生窗口和长时间 alias 视觉/交互未由构建替代。
- 改动文档 code-link audit 通过；当前 Controlled manifest 可解析且类别互斥，覆盖 50 documents、26 dependencies、25 validators 和 11 个写集前缀。RAW-067/160/162、项目状态、架构及 Goal/Turn 错误记忆已同步，没有创建重复任务或记忆。

## 2026-08-12 Real-host Findings

- 1.5.4 的 ASAR 与运行进程精确匹配 `host-fc14212e36723e3b4fbe / renderer-4dfbb00a631314bc45f5`。Computer Use 展开 Float 后，两个 Codex API 仍为 active 的任务均落入待继续，真实否定第一份重建包。
- 1.5.5 的 ASAR 与运行进程精确匹配 `host-6a76cc45575078bc2ced / renderer-0fa112cd0697e912ea85`。新日志记录卡片 16 次、attention 3 次、global 2 次 `stale-target`，只有 2 次卡片打开成功；同一时段 package revision 连续推进且伴随 focus/package echo。用户同时确认卡片无点击效果、待输入和快捷键无法跳转，因此 1.5.5 被拒绝。
- RAW-160 最终身份为 `host-252d34393f05b238e278 / renderer-ff8fbe75184168a9e150`；它现在只作为本增量的全量基础。上述 1.5.4/1.5.5、`host-7d…` 与更早开发 Host 只作为失败/历史证据；完整脱敏账本见 [real-host session](../../../knowledge/computer-use/sessions/2026-08-12-raw-160-companion-regression.md#L1)。
- 通过 Codex 任务接口创建 3 个本轮前缀无副作用任务：固定文本任务观察到真实 active→completed，Plan 文本正常完成；内置输入请求在当前 Default task surface 不可用，因此不能冒充 waiting-input 宿主验收。未保存提示、原始任务 ID 或输出目录。
- 旧宿主脱敏诊断持续产生 same-state/host-commit no-op，且无 error；由于身份不匹配，这只证明日志路线可用，不替代当前包的 10 分钟零推送、alias 与视觉门禁。
- 最终构建后只读 Computer Use 再次连接到项目 `127.0.0.1:8092/float.html` 开发 Float：紧凑态三个单数字角标均为圆形；展开态 waiting/running/completed-unread/completed 互斥；对一条既有授权前缀安全任务只做 Host focus 后，筛选结果、页签、分组和能力不变，独立额度刷新也未重分类任务。未调用打开/归档/隐藏/暂停/执行。AX 未公开新构建 Preload identity，随后 macOS 锁屏，因此这只能接纳当前 Renderer 几何与 focus-no-reclass 部分，不能把 same-key 打开、全局热键、Plan 实例或当前 Host 身份标为通过；脱敏账本见 [real-host session](../../../knowledge/computer-use/sessions/2026-08-12-raw-160-companion-regression.md#L1)。

## 2026-08-12 RAW-161 External Archive Evidence

- 真实事件的只读取证已确认 Codex Desktop 原生归档成功、任务文件进入 `archived_sessions`，而 EyPc 两次状态仍为 `inventoryChanged=false / archivedCount=0`；因此本增量按权威库存恢复而非筛选修补处理。
- focused recovery selection（外部归档、漏通知、dirty archived、本地 suppression release/retain）：`5/5` passed，其中 4 条为 RAW-161 新增回归。
- `pnpm exec vitest run tests/platform/codexAppServerBridge.test.ts`：`131/131` passed。
- `pnpm run typecheck`、`pnpm run build`、`node --check preload/index.js`、`node --check public/preload.js`、`pnpm run sync:preloads`、canonical/public `cmp` 与 `git diff --check` 均通过；production build 为 1871 modules，uTools runtime validator 通过。
- 当前产物身份为 `host-78205ae167fc7b27c653 / renderer-9c35abd09a8a390040c5`。未操作真实 Codex 任务或重载 uTools；真实外部归档端到端接纳仍属于当前身份的开发宿主门禁。

### RAW-161 VerificationDecision

`route=impact-selected frontend+runtime+docs / changed-surface=Codex process-Host membership watcher + authoritative archived/unarchived reconciliation + dirty recovery + local archive suppression lifetime / affected-set=preload canonical/public + Codex App Server Bridge tests / selected=focused recovery 5-test matrix with 4 new regressions + full 131-test affected bridge + syntax + typecheck + 1871-module build + mirror/runtime validator + doc audits / skipped=repository-wide Vitest because no current testing-owner escalation trigger; real uTools mutation because not authorized as implementation verification / outcome=increment-automated-verified, dev-plugin-reload-pending / owner=RAW-161 increment in existing Controlled task / residual-risk=current-identity real Desktop manual archive and IPC reconnect timing`。

## 2026-08-12 RAW-162 Goal Completion Evidence

- `tests/platform/codexAppServerBridge.test.ts`：`138/138` passed。新增真实链覆盖 active Goal 跨两个自动 Turn 全程 running、漏 Goal 通知时终态补读并只完成一次、四种非活动状态归入 stopped/“待继续”、Goal cleared 和 protocol unsupported 回退原 Turn 语义、暂时失败与真实 5 秒 RPC timeout 保留 stable nonterminal/verifying、迟到查询被通知 sequence/updatedAt 拒绝，以及私有 objective/身份/用量不跨 Activity、task-package 或 Float。
- `tests/platform/companionTaskKernel.test.ts`：`39/39` passed。新增 Goal 优先级、main/Side 混合、未知分支阻止 complete 分支提前完成、同精度时间戳由更新流序号开启 epoch、旧 complete Goal 被严格更新 Turn 取代和中间 Turn completion 原子抑制。
- `tests/runtime/codexController.test.ts + tests/domain/companionTaskPackage.test.ts`：`62/62` passed；`tests/platform/codexFloatWindowBridge.test.ts + tests/domain/companionPresentation.test.ts`：`89/89` passed；`tests/platform/runtimeIdentity.test.ts`：`5/5` passed。合计受影响 7 文件、333 项；最终合并选择连续两次 `333/333` 通过。
- `node --check preload/index.js`、`node --check preload/companion/task-kernel.cjs`、public 镜像语法、`pnpm run sync:preloads`、canonical/public/dist `cmp` 通过；`pnpm run build` 完成 typecheck、1871 modules、runtime preparation 与 uTools validator。
- 当前产物身份为 `host-c36f104c3a4cd42e77c2 / renderer-27b635545542097fd7b1`。未自动重载开发插件、未触碰真实用户任务；因此状态是 `increment-automated-verified / rebuilt-artifact-ready / dev-plugin-reload-pending`，不是 installed-host accepted。

### RAW-162 VerificationDecision

`route=impact-selected frontend+runtime+docs / changed-surface=Codex App Server Goal get+notifications + process-private Goal cache + Kernel Goal/Turn epoch reduction + Goal-only atomic publication + generated preload / impact-source=direct bridge callers, private branch ledger, Host task-package transaction and Float applied consumer / affected-set=preload canonical/public/dist, Kernel, Codex Bridge, Controller/Task Package, Float Bridge/Presentation, Runtime Identity and current Controlled/error-memory docs / selected=7 affected files with 333 tests + exact 5-second timeout + syntax + sync/cmp + typecheck + 1871-module build + uTools validator + doc link/rule/diff audits / skipped=repository-wide pnpm test/verify because no current testing-owner escalation trigger; development plugin reload because it is an independent user-owned gate / escalation=none / outcome=increment-automated-verified, rebuilt-artifact-ready, dev-plugin-reload-pending / owner=RAW-162 increment in existing Controlled task / residual-risk=current identity has not executed a real Goal across two automatic Turns in uTools`。

## 2026-08-12 RAW-163 Main-first Side Chat Projection And Parent-only Open

- `tests/platform/companionTaskKernel.test.ts` 与 `tests/platform/codexAppServerBridge.test.ts`：合计 `177/177` passed（Bridge `138/138`、Kernel `39/39`）。矩阵覆盖 main completed-read + Side running、main completed-read + Side completed-unread、main completed-unread + Side running、main interrupted/waiting/running 与子分支冲突，以及 canonical groups/counts 的 phase/unread 同步。
- Bridge 回归证明私有证据只含哈希 branch ref、`main/side` 角色和 unread bool/known；序列化结果不含 parent/Side raw ID。活跃 Side Chat 存在且第一次 Deep Link 失败时只调用一次 parent URL，第二次成功仍调用 parent，Side URL 调用次数为零。
- `node --check` 对 canonical/public main preload 与 task-kernel 通过；`pnpm run sync:preloads` 后 canonical/public `cmp` 通过。
- `pnpm run build` 通过 typecheck、1871-module Vite build、runtime preparation 与 uTools validator；产物身份为 `host-2c01a8beb95919a22af5 / renderer-cc3ff8f60b7179ed599f`。
- 本轮 15 份改动 Markdown 的 code-link audit 通过，当前合同残留扫描只保留显式标注为被 RAW-163 取代的历史描述，`git diff --check` 通过。项目级 `audit_ai_rules.py --mode project --git-view working` 仍报告 137 项既有自适应索引/过程模板债务，按 RAW-163、main-first、Side Chat、parent-only 与本轮 owner/源码路径过滤为 0 项；该 broad baseline 未冒充绿色，也未扩张本轮写集。
- 未运行仓库级 `pnpm test/verify`：本次变化封闭于 Kernel 私有聚合和 Host Deep-Link 边界，没有 testing-owner 全量升级触发。未重载 uTools 开发插件，也未打开或修改真实用户任务。

### RAW-163 VerificationDecision

`route=impact-selected frontend+runtime+docs / changed-surface=Kernel main-first branch scope + private branch unread projection + parent-only Codex Deep Link + generated preload / impact-source=private Branch Evidence → canonical task/views and action alias → openCodexThread → electron/uTools Deep Link / affected-set=preload canonical/public, Kernel, Codex Bridge, current Controlled/current-state/help/error-memory docs / selected=Bridge+Kernel 177 tests + canonical/public syntax + sync/cmp + typecheck + 1871-module build + runtime validator + doc link/rule/diff/receipt audits / skipped=repository-wide pnpm test/verify because no testing-owner escalation trigger; uTools development reload because it is an independent user-owned gate / escalation=none / outcome=increment-automated-verified, rebuilt-artifact-ready, dev-plugin-reload-pending / owner=RAW-163 increment in existing Controlled task / residual-risk=current identity has not yet been observed against a real parent/Side state matrix`。

## 2026-08-12 RAW-164 Side Chat And Cloud State Convergence

- `tests/platform/codexAppServerBridge.test.ts`、`tests/platform/companionTaskKernel.test.ts` 与三个 Runtime Diagnostics 定向文件合计 `189/189` passed。库存集成覆盖 page size 1 的分页乱序、`sessionId/forkedFromId` 嵌套归根、缺父/跨 session/循环保持独立、Side 运行事件先到与 Desktop 快照后到、重连、精确终态、成功打开后的父/子 Turn 绑定已读、Desktop-only Side fallback、旧 child action alias 失效、重复库存与归档。
- 公共包只保留根任务；Side Chat 只形成进程私有 relation/branch evidence。Kernel 矩阵覆盖 main 已读/未读与 Side running/completed-unread/completed 的全组合，断言任一 running 时父任务只进入 active 且 unread count 为零，活动结束后才显露 completed-unread。
- Cloud 矩阵覆盖 Goal active + 中间 Turn completed + unread=true 仍 running、多个自动 Turn 间零 completed/completed-unread、Goal complete + unread=true 单次 completed-unread、成功打开后 completed，以及旧 unread true/false、旧完整快照、重复 Goal 通知与同 Turn 补全不回滚。
- 匿名 `side-topology-decision`、`parent-state-decision`、`runtime-identity-handshake` 均有语义去重与隐私断言；序列化诊断不含 child raw ID、标题、正文、路径、Goal 内容、预算或用量。
- `node --check preload/index.js`、`node --check preload/companion/task-kernel.cjs`、`pnpm run sync:preloads` 后 canonical/public `cmp`、`pnpm run typecheck`、`pnpm run build`、显式 `pnpm run validate:utools` 与 `git diff --check` 通过。production build 为 1871 modules，artifact 为 `host-251a728efafbf4c7f7d6 / renderer-a671d108ff9d315b7ea4`。
- 17 份改动 Markdown 的 code-link audit 通过；当前合同残留仅保留已明确标注由 RAW-164 取代的 RAW-163 历史证据。项目级 `audit_ai_rules.py --mode project --git-view working` 报告 133 项既有 broad debt，按 RAW-164、当前任务树、Companion module 与本轮状态错误记忆过滤为 0 项；该基线未冒充绿色，也未扩张本轮写集。`51 documents / 26 dependencies / 28 validators` 同步组与 final receipt 由现有 owner 收口。
- 未运行仓库级 `pnpm test/verify`：实际依赖图收敛于 Bridge、Kernel、Runtime Diagnostics、生成 Preload 与当前文档，没有 testing-owner 全量升级触发。未重载 uTools，故 `runtime-identity-handshake=host-loaded`、20 秒双快照和真实 Cloud/Side 稳定性仍待宿主门禁。

### RAW-164 VerificationDecision

`route=impact-selected frontend+runtime+docs / changed-surface=App Server inventory Side topology + Desktop/inventory race order + Kernel all-bead reduction + Goal/unread finalization + anonymous runtime diagnostics + generated preload / impact-source=thread/list|read lineage → process-private relation/Branch Evidence → canonical task/views/counts → Runtime Identity handshake / affected-set=preload canonical/public, Kernel, runtime identity artifact, Codex Bridge, Kernel tests, Runtime Diagnostics tests, Controlled/current-state/help/error-memory docs / selected=5 focused files with 189 tests + canonical syntax + sync/cmp + typecheck + 1871-module production build + explicit runtime validator + doc link/consistency/diff/receipt audits / skipped=repository-wide pnpm test/verify because no testing-owner escalation trigger; development plugin reload/20-second dual snapshot because it is an independent Host gate / escalation=none / outcome=increment-automated-verified, rebuilt-artifact-ready, dev-plugin-reload-pending / owner=RAW-164 increment in existing Controlled task / residual-risk=current identity has not yet reported host-loaded and real inventory/Desktop timing may still expose a Host-only defect`。

### VerificationDecision

`route=impact-selected frontend+runtime+docs + user-required repository escalation / changed-surface=Kernel branch store + Plan capability projection + Host-current same-key open + private focus context + Controller no-presync + Domain abstain projection + exact input candidates + Float dual revisions + counter CSS + Claude native state/membership/unread watcher + Codex native unread/rollout recovery + atomic Branch/public commit / impact-source=current callers, V4 package contract and generated-preload graph / affected-set=Kernel, Bridge, Actions, Controller, Domain, Float, navigation, feature routing, runtime identity and Provider evidence / selected=prior 20-file 547-test broad matrix + Codex core 3-file 221-test and expanded 15-file 433-test matrix + full 83-file 1328-test verify + typecheck/build + mirror/runtime validator + doc audits / skipped=current-identity dev-plugin UI gate only / escalation=user-required because central Kernel, Actions and hidden-Host defects escaped earlier full gates / outcome=full-automated-verified, dev-plugin-reload-pending / owner=RAW-160 Controlled task / residual-risk=current dev-plugin branch continuity, click/input/shortcut opening, >10-minute alias, literal native shortcut and rendered counter geometry`。

## Implementation Review

Tool: Codex

### Review Target

- Requirement: RAW-164 库存 Side Chat 归根、全珠子 `进行中 > 已完成未读 > 已完成`、Cloud Goal/未读稳定性、匿名诊断与 loaded-identity 门禁；RAW-163 parent-only 打开保留。
- Plan: [current plan](plan.md#L1) 的 RAW-164 `VerificationImpactTrace`。
- Implementation: [preload topology/evidence/diagnostics bridge](../../../../preload/index.js#L1)、[private Kernel reducer](../../../../preload/companion/task-kernel.cjs#L1) 及生成镜像/定向回归。

### Checked

- Requirement alignment、inventory/Desktop 拓扑竞态、全珠子状态矩阵、phase/unread 原子投影、Goal/Turn 因果顺序、已读逆序、隐私边界和 parent-only 打开均已核对。
- 最终复核确认 branch role/unread 与 child relation 只在 Host/Kernel 私有路径存在，公开 package 仍只有匿名根任务结果；active/unread groups/counts 来自同一 canonical package。
- 最终复核发现并修复两条旁路：Desktop-only Side fallback 现在保留父/子各自的 Turn 绑定已读；库存把既有独立 child 归为 Side 时会撤销其旧 action alias，旧别名只返回 `expired-alias`，不能打开 Side。
- RAW-163 main-first 展示门槛已被 RAW-164 明确取代；RAW-163 parent-only Deep Link 和成功后会话期已读确认未回退。

### Findings

- P0: 自动化/静态范围内无已知未解决项。
- P1: 自动化/静态范围内无已知未解决项；真实 `host-loaded` 与双快照属于用户要求的独立宿主验收门禁，不伪装成源码已通过。
- P2: 无需扩大公共 TaskPhase、Renderer branch/unread/topology 字段或第二套 reducer。

### Optimization Suggestions

- 无阻塞性优化；优先重载当前 identity，并完成真实库存 child、Cloud 跨 Turn、最终 unread、双快照与 parent-only 打开观察。

### Not Checked

- uTools 开发模式尚未通过握手加载 `host-251a728efafbf4c7f7d6 / renderer-a671d108ff9d315b7ea4`；真实 inventory/Desktop 时序、Cloud 跨 Turn、Float applied、双快照和 parent-only Deep Link 待宿主门禁。
- 未重复运行仓库级 `pnpm test/verify`，因为 RAW-164 没有新的 testing-owner 全量升级触发；RAW-160 的 `1328/1328` 仅作为现有全量基础。
- 真实 Execute Plan 与真实 Claude 归档不属于本轮自动化授权。
