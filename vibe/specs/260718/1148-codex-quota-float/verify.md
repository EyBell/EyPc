# Codex 任务状态验证记录

Tool: codex
Date: 2026-07-30

## Review Target

- Requirement: [RAW-116–133](raw-requirement.md#L1)
- Plan: [plan.md](plan.md#L1)
- Implementation: preload 直接证据/原生 unread/Activity generation 与 mode-aware latest-Turn 复核、Controller 单一 active-exit 转换器和行级库存隔离、Domain 明确停止与原生 unread 投影；quota-auto 普通窗口仲裁、直接外观持久化和结构边界静态回归同步收口。
- Sidecar: 主线程。

## Checked

下表中 Bridge/Controller/状态链/类型/构建/整仓通过数均为 RAW-129 历史基线；RAW-130–133 只以各自增量行记录当前证据，不得把历史通过数解释为本轮执行结果。

| 验证 | 结果 |
| --- | --- |
| Bridge 完整文件 | `51 / 51` pass；覆盖同 revision 无 completedAt 精确/佐证完成、stale-active unread 核验、冷启动 unread 一次性唤醒、inventory 证据保留、重复快照周期复用、新证据重启和旧 completed 退出拒绝 |
| Controller 完整文件 | `38 / 38` pass；覆盖 delta/full snapshot 统一 active-exit、confirmed provenance 入口一致、generation 屏障、mixed-key 已知条目和 missing-key 行级隔离 |
| 状态链专项 | `115 / 115` pass，`3 / 3` 文件通过；覆盖 Domain、Preload Bridge 与 Controller 的全部 RAW-128 回归 |
| Codex 状态矩阵 | `168 / 168` pass，`6 / 6` 文件通过；覆盖 Domain、Presentation、Bridge、Platform、Controller 与 Renderer |
| Codex 完整文件组 | `189 / 189` pass，`9 / 9` 文件通过；外观、模型、环境、Float 与状态链无残留失败 |
| 残留矩阵专项 | `61 / 61` pass，`5 / 5` 文件通过；覆盖直存直渲外观、任一普通窗口归零切 Spark、Controller 无暂态配色覆盖、MQTT media 边界与 Quick Jump 函数边界 |
| TypeScript | `pnpm run typecheck` pass |
| 正式构建 | `pnpm run build` pass；含 Vite build、uTools runtime preparation 与 `validate:utools` |
| Preload | RAW-129 基线两份 `node --check` pass；RAW-130–132 仅有各自静态镜像记录；RAW-133 当前确认 canonical/public preload 全文件字节一致、`git diff --check` pass。自 RAW-130 起未重新执行 `node --check` |
| 文档引用 | changed Markdown 全量 `audit_code_links.py` pass；`Code link audit: OK` |
| 完整仓库 | `633 / 633` pass，`53 / 53` 文件通过；无“既有/已知失败”留存 |
| RAW-130 增量 | 实现与 Bridge 回归合同已写；链接审计和上述静态边界检查通过。依项目门禁未执行测试、typecheck、build、preload 语法或真实 uTools 验收 |
| RAW-131 全链复核与实现 | 已静态枚举 Preload Activity/Turn/read-state/Side Chat/inventory/bridge-state 写入与撤销点、Controller delta/full-snapshot 仲裁、Domain 分组/计数/归档能力及 Renderer 消费；7 个 P1 实现与合同已写，未执行 |
| RAW-132 回归安全优化 | 父任务聚合纯函数、Side Chat 分支终态延后、五项匿名裁决计数与 Domain/Bridge/Controller 反向合同已写；未执行测试、typecheck、build、preload 语法或真实宿主 |
| RAW-132 静态收口 | `git diff --check` pass；canonical/public Codex 段与顶层计数定义分别精确一致；changed Markdown `audit_code_links.py` pass；诊断公开形状仅含五个数值字段，Bridge 合同已写 child raw ID 泄漏的负向断言但未执行 |
| RAW-133 统一诊断投影 | Domain 单一 key/规范化/比较；Controller generation 后整包接纳与 diagnostics-only 单通知；Runtime 紧凑摘要、focus 明细、live-region 隔离及全页原生帮助按钮已写 |
| RAW-133 合同状态 | 生产父解析器完整优先级表、malformed 诊断规范化、变化单通知、相同/旧代次零通知与 UI 源码合同已写；依项目规则未执行测试、typecheck、build、preload 语法或真实宿主 |
| RAW-133 静态收口 | `git diff --check` pass；canonical/public preload 全文件精确一致；诊断 key/counter normalizer 在 `src/` 各只有一个定义；CodexPage 无 `span role=button`/手写 tabindex 提示；changed Markdown `audit_code_links.py` pass |
| 设计偏好收口 | `DesignTaskCloseout` 生成 `eligible-for-root-review` 的 W29 canary candidate；`writes_performed=false`，未写偏好缓存、传播状态或 Hook |

## RAW-131 闭合状态机审计

### 必须同时成立的不变式

1. 更新的真实 positive epoch 只能被同一或更新 revision 的明确 terminal/non-active 证据结束；read-state、refollow、inventory、targeted read 和 Side Chat 聚合都不能绕过该顺序。
2. `initial-snapshot active` 与 `failed/interrupted` 冲突属于不确定，最多降为 ongoing；只有真实 Desktop idle 或 bridge `not-running` 才能建立 stopped。
3. 任意 exact activity patch 若结果仍 active 就必须开启新 epoch；waiting request 还是 exact live input authority，active→active 也必须高于 completion presentation。
4. missing-row、source fingerprint 和 Activity generation 的 Preload/Controller 边界必须对称；保留旧卡片时也必须保留其可接收正向事件的会话映射。
5. 主任务与 Side Chat 使用同一因果规则；卡片、分组、三个角标和归档能力消费同一稳定结果。

### 修复记录（实现与合同未执行）

| 级别 | 结论 | 原缺口与影响 | RAW-131 实现 | 合同 |
| --- | --- | --- | --- | --- |
| P1 | stale-active reader 不再撤销 newer exact active | unread/任务切换曾可启动旧 reader，并用同 revision terminal 反压新的 active | reader 记录 parent private positive sequence；exact App Server/Activity positive 不进入 stale 模式，异步返回前再次核对水位 | in-flight reader→Turn-started、unread=true、task-switch/refollow 后均保持 active |
| P1 | conflicting active snapshot 不再合成 idle | active+interrupted/failed 曾被 suppression 改成 desktop-live idle 并满足 stopped | suppression 投影为 `notLoaded`；completed 仍由 confirmed evidence 关闭，failed/interrupted 冲突保持 ongoing | 改写旧 synthetic-idle 期望，验证真实新 Turn 可恢复 active |
| P1 | exact active/waiting 高于旧 completion | active→active activity/request patch 曾保留 `turn-completed` | 所有 exact active patch 调用统一 epoch opener；Domain waiting flags 高于 confirmed completion | active→active ordinary activity 与 Plan request 分别覆盖 confirmed completion |
| P1 | missing-row 隔离同时保留匿名映射 | Controller 保留旧卡片时 Preload 曾立即丢失 raw→anonymous mapping | 同 source fingerprint 下保留映射 120 秒，覆盖最长 60 秒 Controller quarantine；verified single/bulk archive 直接清除映射并发 explicit archived key | 已登记→缺行→exact active→连续 inventory 仍通过原匿名 key 发布；显式归档后 activity snapshot 不再含 key |
| P1 | Side Chat 使用 child 因果状态机 | child initial/最终 active-exit 曾读取 parent Turn，side-only shadow 在 inventory 后不重放 | Turn reader 以 parent:child 独立 key 查询 child；最后一个 active child 退出时沿 child query；waiting 开 parent epoch；inventory 后重聚合全部 affected parents | child initial/patch、两 child flags、initial/exit child Turn target、inventory rebuild |
| P1 | Activity generation 屏障双向生效 | 较慢旧 full snapshot 曾可覆盖先到的新 delta并下调 generation；旧 delta 仍可先改 bridge state | 同源旧 delta 在任何字段前拒绝；live waterline 后的低代次或缺代次 V2 full snapshot 在提交前拒绝，水位只允许 `max` 前进 | full gen5→delta4 拒绝；delta6→delta5/not-running 拒绝；delta3→full gen2/无代次拒绝 |
| P1 | stopped 全链禁止归档 | Domain/Controller/Host 曾允许 stopped evidence，与 canonical 冲突 | Domain 投影 `blocked-stopped/canArchive=false`；Controller 只发 completed；Host 只接受 completed；UI 显示“会话已停止但未完成” | Domain、Controller、Host invalid-request、UI disabled reason |

### 闭合合同矩阵

| 轴 | 历史覆盖 | RAW-131 新增合同（未执行） |
| --- | --- | --- |
| Positive 来源 | main Desktop initial/patch、App Server active/started | exact active + unread=true + stale terminal；active→active request；Side Chat initial/patch；multiple child |
| 重放入口 | unread=false、refollow、连续 inventory | unread=true targeted read、owner disconnect/reset、known-row dropout、side-only inventory rebuild |
| 异步顺序 | old delta after full snapshot | new delta before old full snapshot；reader started before/after positive epoch |
| 终态 | completed、interrupted、failed 的若干单例 | conflicting interrupted/failed 不得合成 idle；same-revision stale terminal after exact active |
| 最终消费 | 部分 Bridge/Controller/Domain 单层断言 | 同一序列的 authority、bucket、compact count、archive capability 端到端断言 |

实现结论：此前通过数量是示例合同的通过，不是状态空间闭合证明；RAW-131 已改写 synthetic idle 和 stopped archive 的错误期望，并为其它五类缺口补入合同。合同尚未执行，因此当前结论是 `implemented-unverified`，不是 accepted。

## RAW-132 回归安全复核

### 保留的旧错误门禁

1. stale-active reader 在发起和异步返回两端都核对 positive sequence；新 activity epoch 后的旧 terminal 不得落库。
2. conflicting initial active + failed/interrupted 只能 suppression 到 unavailable/ongoing，禁止恢复 synthetic idle/stopped。
3. active→active ordinary/waiting patch 继续开启新 epoch；waiting 继续高于旧 completion。
4. missing-row anonymous mapping 继续按同 fingerprint 保留，显式 archive 继续立即删除；Controller missing-key quarantine 未放宽。
5. 同源 generation 继续同时保护 task fields、Desktop bridge state 与新增诊断计数；低代次 delta 和低代次/无代次 V2 full snapshot 均不得回退。
6. stopped 继续是 `blocked-stopped`，Domain、Controller、Host 和 UI 均不恢复归档能力。

### 新增优化合同（未执行）

| 关注点 | 实现 | 反向失败条件 |
| --- | --- | --- |
| 父任务聚合 | `codexResolveParentActivity` 统一 main/child/waiting/error/App Server live 优先级 | 任一发布路径另算一次优先级或让 terminal 覆盖剩余 active branch 即失败 |
| Side Chat 终态 | child terminal 发现其它 branch 仍 active 时重开父 live epoch并延后该分支结果 | 父卡片变 stopped/completed、`lastTurnStatus` 不再 inProgress 即失败 |
| 匿名诊断 | 仅输出五个非负累计计数，Controller 在 generation 门禁后接纳，设置页只显示计数 | 出现 task key/raw ID/content，或 generation 5 覆盖 generation 6 即失败 |
| Domain 模型 | exact active/waiting/uncertain/completed/stopped 的表驱动反向组合 | 任一旧状态优先级或 archive capability 返回历史错误即失败 |

静态实现已写；依项目验证规则，本轮没有执行上述合同。当前只能确认“未发现代码形状上放宽旧门禁”，不能声称运行时 accepted。

## RAW-133 统一与效率复核

| 关注点 | 唯一权威与最小路径 | 反向失败条件 |
| --- | --- | --- |
| 诊断形状 | Domain 的一个 key tuple 同时驱动规范化和相等判断 | Controller/Page 复制五字段清单或各自解释非法值 |
| 接纳与通知 | Controller 先过同源 fingerprint/generation，再整包比较；diagnostics-only 变化恰好一次 `notify` | 旧代次先改诊断/桥状态、相同轮询重复通知、变化无通知 |
| 父聚合验证 | Bridge 测试注入并调用生产 `codexResolveParentActivity`，表覆盖 main、child wait、最新 active interval、system error、App Server fallback | 测试重写另一套优先级算法或遗漏任一来源 |
| 常驻信息密度 | 页面只显示“保护合计 · 周期”，五项明细留在原生帮助按钮 | 永久长串占宽、明细含身份/content、帮助只支持鼠标 |
| 辅助技术 | `aria-live` 只包围连接诊断标题；内部累计值不在 live region；所有 `.codex-tip` 均为原生按钮 | 每次计数增长都被播报，或保留 `span role=button/tabindex` 分支 |

本轮静态复核不发现第二套诊断规范、第二套父聚合算法或旧伪按钮分支。运行合同仍未执行，因此结论保持 `implemented-unverified`。

## 2026-07-30 分批提交前复核

- 第一性原理：任务卡片只消费按来源与代次排序后的单一稳定状态；更晚的正向活动证据不能被旧异步读取撤销，未确认终态不能获得归档能力，诊断只暴露匿名累计数。当前 Bridge → Controller → Domain → Page 的权威方向与这些不变式一致。
- 原始需求：逐项回看 RAW-131 的七个状态缺口、RAW-132 的父任务聚合/Side Chat/匿名诊断、RAW-133 的 Domain 单一 schema/原子通知/紧凑可访问呈现；对应生产入口和未执行合同均有直接映射，未发现遗漏或扩成任务身份/内容采集。
- 实现合理性：父聚合与诊断规范化各只有一个生产算法，Preload/Controller 两侧都以同源 generation 做顺序屏障，stopped 归档在 Domain、Controller、Host 与 Float 四层一致阻断。提交前静态审阅未发现新的 P0/P1；运行行为仍受下方用户验收门禁约束。

## Full Matrix Findings

- RAW-129 历史基线中的状态主矩阵为 `168 / 168`；RAW-128 当时覆盖 10 类跨层可复现阻断。RAW-131–133 修改后的当前矩阵尚未执行。
- 同一历史基线中，仓库内 9 个 Codex 命名测试文件为 `189 / 189`；这些数字不作为当前父聚合、诊断通知或辅助技术合同的通过证据。
- 完整仓库 `633 / 633` 同样只属于 RAW-129 历史基线；RAW-131–133 之后没有新的整仓执行结果。

## Findings

- P0: none.
- P1: 已修复——已接受 completed 未清除 active-exit baseline，导致后续 full snapshot 可反判回 inProgress。
- P1: 已修复——真实 activity patch 与首次 snapshot 无来源区分，旧 completed 元数据可压住新活动。
- P1: 已修复——初始/refollow snapshot 的旧 unread false 永久压住稍后原生 unread true；现由证据优先级与只读原生状态 watcher 即时发布。
- P1: 已修复——完成前 stream patch false 在残留 waiting flag 分支中绕过 completion 清理；所有 exact completion 现统一走 completion publisher。
- P1: 已修复——App Server 精确 active 事件在已有 Desktop idle snapshot 权威时被忽略，导致恢复中的 interrupted 任务持续显示已停止；现以 `app-server-live` 保留正向事件直到明确终止。
- P1: 已修复——普通 completed shape、同 revision started/inProgress 与 completedAt 必填形成三层重复阻断；现只让三类已确认 completion provenance 关闭 live 周期，并允许精确同 revision 状态前进。
- P1: 已修复——Controller 的 delta 路径只保护旧 completed，而 full snapshot 可用相同旧 interrupted/failed 清除 baseline 并发布 stopped；现两条入口共用一个 active-exit 转换器，未确认 terminal 保持 ongoing。
- P1: 已修复——persisted unread=true 到达旧 interrupted 投影时只更新 unread，无法发现已经 completed 的最新 Turn；现只唤醒一次有界 targeted 复核，unread 本身仍不推断完成。
- P1: 已修复——缓存已是 completed 的 unresolved live epoch 会拒绝同 revision、缺失 completedAt 的精确完成；现只拒绝严格旧 revision，且 confirmed duplicate 不重开 unread 周期。
- P1: 已修复——active snapshot 佐证仍把 completedAt 当 terminal shape 必填字段；现只要求 terminal + startedAt，并保留最终尝试与 activity revision 校验。
- P1: 已修复——stale-active 复核占用 single-flight 时，随后的 active-exit/unread 普通复核会被丢弃；现只合并兼容模式，不兼容模式取消旧周期并由当前状态接管，旧异步结果不能删除新周期。
- P1: 已修复——缺失 latest-Turn outcome 在 exact idle/not-running 下仍会进入 stopped；现停止必须具备明确 failed/interrupted，缺证据始终 ongoing。
- P1: 已修复——targeted/corroborated provenance 只存在于发出的对象副本，后续 activity snapshot 会回到 inventory；现写回会话期 inventory 后再原子发布。
- P1: 已修复——EyPc completion-revision 本地确认会压住 Codex 原生 unread=true；现移除写入/投影覆盖，完成未读命令只打开第一条，旧字段只作忽略式迁移。
- P1: 已修复——Activity Delta 同批出现未知 key 时整批返回；现已知任务即时应用，未知 key 只触发 urgent 结构复核。
- P1: 已修复——完整 inventory 重建会丢失精确 inProgress、confirmed terminal provenance，并缺少与增量共享的 generation 屏障；现保留更强会话期证据并拒绝严格旧增量。
- P1: 已修复——missing-key 隔离冻结整批清单；现只保留缺失行，现存任务的完成/未读在 stale 清单中仍立即发布。
- P1: 已修复——unchanged native unread=true 在普通读取中反复重启佐证，重复相同 active snapshot 也重置周期；现首次/新到达 true 只启动一次，任务切换歧义可接管，兼容 snapshot 复用一个有界周期。
- P1: 已修复——active 退出可把相同旧 inventory completed 无条件标成 targeted completion；现只接受缓存相对 baseline 前进或已有 confirmed provenance。
- P1: 已修复——冷启动原生 unread 已为 true 时，库存投影也已为 true，旧“值变化”判断漏掉首次 Turn 复核；现用会话期原生观测水位只唤醒首个 true，后续轮询不重启。
- P1: 已修复——confirmed terminal 由 delta 调用方额外传入，full snapshot 同 revision 佐证仍会被纯转换器压回 inProgress；现转换器直接读取 candidate provenance，两条入口零差异。
- P1: 已实现、未执行——较早的 Desktop idle `activity-event` 可在较新的 App Server active 后因 read-state/inventory 重放再次撤销 `app-server-live`；现两种真实事件共享进程内单调 sequence，只有严格后到的 Desktop 非 active 才能撤销，并在 full inventory 中保留私有水位。
- P1: 已修复——`codexNewThread` 只检查周额度归零且优先展示周读数，违反“任一已返回普通窗口为 0 即切 Spark”和普通 5 小时优先合同。
- P2: 已修复——3 条历史外观测试、3 个 Runtime 配色 Action 与 Controller 暂态覆盖仍携带 RAW-071 已废止的本地颜色/对比度/配对预览门禁。
- P2: 已修复——MQTT media 正则对等价 CSS 换行敏感，Quick Jump 否定正则跨越函数边界命中后续合法 `app.hide`；两者均改为结构边界断言。
- P2: 旧 runtime/float `conversations` 别名仍保留一版兼容，待 v2 退役后删除。

## Not Checked

- 依项目验证门禁，本轮未执行 RAW-131–133 新增/改写测试、`pnpm run typecheck`、`pnpm run build`、preload `node --check` 或真实宿主加载；历史通过数不能替代本轮运行验证。
- 未操作真实 Codex 任务、未归档/移除项目、未启停进程。
- 真实 uTools 宿主需正常重载后验收中断恢复 completed-unread、普通完成、任务切换和角标同步。

## Retained Minimal Guards

- 严格更旧 `startedAt`：防止乱序旧 started 反向覆盖，不影响同 revision 状态前进。
- 首次/refollow active 与 terminal 冲突的 `[0,300,1000]` 定向读取，以及 active-exit baseline：实时与全量入口共用同一转换器；精确 started/completed 可立即绕过，不兼容复核模式可接管。
- waiting-input/approval 与精确 `turn-started`：阻止 unread 把真实活动当 stale-active；只限制额外取证，不影响精确完成。
- source fingerprint、Activity generation、missing-key 行级隔离与 50/200ms 结构合并：只防协议串线、旧增量、清单误删和重复扫描；未知/缺失行不再阻断已知/现存任务状态。
