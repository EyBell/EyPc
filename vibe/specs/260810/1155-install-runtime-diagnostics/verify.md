# RAW-160 → RAW-161 Companion V4 Verification Record

Status: `increment-automated-verified / rebuilt-artifact-ready / dev-plugin-reload-pending`

## VerificationImpactTrace

| 影响边界 | 自动化证据 | 当前状态 |
| --- | --- | --- |
| V4 reducer / Plan lifecycle | 私有分支矩阵、旧 idle+新 active、主/Side 冲突、Plan/ordinary interrupted、default execution | passed |
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
| type / build / mirrors / validator | typecheck、1871 modules、canonical/public mirror generation、Runtime Identity、uTools validator | passed；artifact `host-78205ae167fc7b27c653 / renderer-9c35abd09a8a390040c5` |
| 仓库全量套件 | RAW-160 曾由用户明确要求在中央 Kernel/Actions/Host watcher 缺陷逃逸后升级 | historical current-foundation passed；`83/83` files、`1328/1328` tests；RAW-161 无新升级触发，未重复运行 |
| 文档与规则审计 | Controlled group、RAW-067/160、状态/架构/既有错误记忆、code-link、diff | final audit recorded below |
| uTools 开发模式当前身份矩阵 | [host handoff](handoff.md#L1) | pending reload |

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
- `audit_ai_rules.py --mode project --git-view working` 仍报告 135 项项目级既有自适应索引/过程模板债务；按本轮新增/修改的 Plan、consumer cache、Claude phase、V4 ownership 及其模块关键词过滤为 0 项。该 broad baseline 未冒充绿色，也不扩张 RAW-160 写集。
- 规则链五层只读核验通过：Codex/Claude 全局入口均引用 CodeNote kernel；项目 `AGENTS.md / CLAUDE.md` 仅保留预期入口说明差异且共同路由同一项目规则；所有当前 rule/status 目标可读；`.agents/skills/companion-state-reconciliation` 解析到带有效 frontmatter 的 canonical Skill。未新增/改名 Skill，因此无需用本轮会话宣称新的索引加载证明。
- `codexAppServerBridge` 假 App Server 覆盖 Execute Plan；没有启动真实 Codex Turn。
- Claude archive 测试使用夹具；没有重复写真实 Claude 会话。

## 2026-08-11—12 Regression Rework Evidence

- 当前受影响矩阵为 `20/20` files、`547/547` tests，覆盖 Kernel、App Server Bridge、Actions、Domain、Controller、Float UI、process navigation、Feature Routing、Runtime Identity、Claude cold/live state、membership、unread 与 package/consumer boundaries。
- 状态矩阵覆盖主运行+Side 终态、Side 运行+主 interrupted、旧 idle+新 active、审批/普通输入、全完成、全终态 idle 及冲突 verifying。
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
- 改动文档 code-link audit 通过；当前 Controlled manifest 可解析且类别互斥，覆盖 49 documents、26 dependencies、25 validators 和 11 个写集前缀。RAW-067/160、项目状态、架构及既有错误记忆已同步，没有创建重复记忆。

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

### VerificationDecision

`route=impact-selected frontend+runtime+docs + user-required repository escalation / changed-surface=Kernel branch store + Plan capability projection + Host-current same-key open + private focus context + Controller no-presync + Domain abstain projection + exact input candidates + Float dual revisions + counter CSS + Claude native state/membership/unread watcher + Codex native unread/rollout recovery + atomic Branch/public commit / impact-source=current callers, V4 package contract and generated-preload graph / affected-set=Kernel, Bridge, Actions, Controller, Domain, Float, navigation, feature routing, runtime identity and Provider evidence / selected=prior 20-file 547-test broad matrix + Codex core 3-file 221-test and expanded 15-file 433-test matrix + full 83-file 1328-test verify + typecheck/build + mirror/runtime validator + doc audits / skipped=current-identity dev-plugin UI gate only / escalation=user-required because central Kernel, Actions and hidden-Host defects escaped earlier full gates / outcome=full-automated-verified, dev-plugin-reload-pending / owner=RAW-160 Controlled task / residual-risk=current dev-plugin branch continuity, click/input/shortcut opening, >10-minute alias, literal native shortcut and rendered counter geometry`。

## Implementation Review

- 先前“P0/P1 无已知未解决项”已由真实宿主复现否定，历史状态改记 `host-reproduced-failure / rework`。
- 当前 rework 在自动化/静态范围内无已知未解决 P0/P1；接纳状态为 `full-automated-verified / dev-plugin-reload-pending`。
- 最终实现复核发现的状态、target、焦点回声、Plan 菜单门禁、Claude/Codex hidden-Host state/membership/unread timer、Codex watcher 自愈、双 revision 和当前 Claude App 版本门禁缺陷均已修复；最新 Codex 增量为 433 项、全仓为 1328 项。没有保留第二套最终分类器、点击前重分类路径或 Renderer phase 补漏 interval。
- 当前非自动化门禁：uTools 开发模式重新加载当前身份后的分支持续运行、长时间/手动/快捷打开、角标视觉，以及既有暂停持久化和 Claude transition。Host/Float ACK 正常及掉通知时限已由真实进程链自动化覆盖。
- 授权门禁：真实 Execute Plan 与真实 Claude 归档不是自动化验收步骤。
