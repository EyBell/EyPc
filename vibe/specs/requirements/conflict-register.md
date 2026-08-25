# Requirement Conflict Register

阶段二冲突核验记录。2026-08-13 基线扫描覆盖全部 `vibe/specs` 文档中含取代/冲突语义且引用两条以上 `RAW` 的 72 处；后续 RAW-174、RAW-175、RAW-176 与本次 RAW-167 漏项复核按日期追加，不把历史基线数伪装成当前总数。

Date: 2026-08-24

## 结论

**现有仓库权威之间没有需要用户裁决的未决冲突。** RAW-177 已明确裁决旧的“Deep Link 成功即建立会话期已读确认”：外部打开只能到 `dispatched/pending`，原生可见、控制权与 applied/read 必须有独立回执。RAW-178 收敛全局当前产品真值的唯一 owner、证据真实性与同步门禁；RAW-179 又以 scoped refinement 裁决“历史 completed Plan 自动等待”和 V6 重复归约，不抹除仍有效的未读、匿名证据与原生 ACK 边界。未分类来源条款现在都有 `SA-*` 身份，但不会在未做语义复核前冒充需求边。

## 处置分类

| 类型 | 数量 | 处置 |
| --- | ---: | --- |
| `explicit-superseded` 整条取代 | 22 | 当前登记中的 `superseded_by` / `supersedes` 双向边 |
| `scoped-superseded` 局部取代 | 58 | 当前登记中的 `scoped_relations`；含 RAW-177 对旧已读确认范围的精确收敛 |
| `semantic-fork` 改变可见行为且未决 | 0 | 无 |
| `agent-vs-user` 转述压过原话 | 0 | 无 |

## 本轮的核心发现

登记此前只能回答「这条是否被整条取代」，而**局部取代的数量（47）是整条取代（18）的两倍半**。也就是说，最常见的那个问题——「这条里还有哪部分作数」——恰恰是登记答不上来的。

局部关系有两种来源：

1. **任务内**，已由来源标注写明，例如 `live-channel-superseded-by-RAW-056`、`color-validation-superseded-by-RAW-071`。首批入册时这些只落在 `source_annotations` 文本里，没有机器边。
2. **跨任务**，只写在 [install-runtime-diagnostics 的「冲突与非目标」节](../260810/1155-install-runtime-diagnostics/raw-requirement.md#L120)散文里，登记**完全没有**。这一类风险最高：被取代的条款在另一个任务的文档中仍标着 `active`，单看那份文档不会发现它已经部分失效。

## 跨任务局部取代（本轮补齐）

| 条款 | 失效部分 | 取代者 |
| --- | --- | --- |
| [RAW-142](codex-raw-142.md#L1) | 任意新 Turn 清除 Plan | [RAW-160](shared-raw-160.md#L1) |
| [RAW-150](codex-raw-150.md#L1) | exact interrupted 立即 stopped | [RAW-160](shared-raw-160.md#L1) |
| [RAW-154](codex-raw-154.md#L1) | exact interrupted 立即 stopped 与旧 Actions/Package 版本 | [RAW-160](shared-raw-160.md#L1) |
| [RAW-159](codex-raw-159.md#L1) | 只在 Kernel no-op 即完成消费去重 | [RAW-160](shared-raw-160.md#L1) |
| [RAW-163](shared-raw-163.md#L1) | 第 50–53 条 main-first 展示门槛 | [RAW-164](shared-raw-164.md#L1) |
| [RAW-164](shared-raw-164.md#L1) | 普通 running > completed-unread 的注意力次序 | [RAW-165](shared-raw-165.md#L1) |

RAW-163 与 RAW-164 这两条正是本会话开头核验过的那组：用户已明确决定采用 all-bead 展示并保留 parent-only 打开，决定早于本轮改动且已在 HEAD 中。此处只是把该决定登记为机器边，不重开裁决。

## 未扫描

102 条无父 `RAW` 的围栏外有序来源条款已进入 [Source Anchor Catalog](../source-anchors/README.md#L1)，可稳定回源，但仍未逐条确认其 requirement/evidence 分类和 semantic module，因此暂不生成 active requirement 冲突边。见 [coverage](coverage.md#L1)。

## 2026-08-15 升级：散文范围改为子条款精确边

子条款可寻址之后，指向 install-runtime-diagnostics 的局部取代不再需要用散文描述范围。**但实测推翻了「47 条都可升级」这个前提。**

47 条 scoped 关系里：

| 类别 | 条数 | 可否升级 |
| --- | ---: | --- |
| 指向六个可寻址父条款 | 6 | 可以 |
| 其余（codex-quota-float 内部） | 41 | **不可以** |

那 41 条的 scope 是**语义面**（`appearance`、`live-authority`、`interaction`、`weekly-ring`…）而非条款子集——它们的来源是 bullet 列表，每条 RAW 本身就是一条叶子，没有编号子条款可指。**scope 描述的是一条需求的某个侧面，不是它的一部分条款。** 这类关系已经处在它能达到的最精确形态。

### 更正：散文区间多框了一条

原记录写「[RAW-163](shared-raw-163.md#L1) 第 50–53 条 main-first 展示门槛」被 RAW-164 取代。逐条回到来源核对后：

- **#50 / #51 / #52** 确是 main-first 展示门槛，被 [RAW-164#58](shared-raw-164-clause-058.md#L1)（「无条件聚合根任务与全部 Side Chat，删除 `mainCompletedRead` 或等价展示门槛」）**整条取代**。
- **#53 不是展示门槛**，它要求 Branch Evidence 携带 `main/side` 角色与分支级 unread。[RAW-164#57](shared-raw-164-clause-057.md#L1) 与 [RAW-166#77](shared-raw-166-clause-077.md#L1) 都**依赖**它——后者进一步把 phase/unread/Goal 拆成三条独立 lane。因此 #53 是 `refined-by`，不是被取代。

按原散文区间机械映射，会让一条仍在生效的证据契约被标成已取代。**这正是「不能按序号区间机械映射」的实例**，也是本轮坚持逐条回源的理由。

### 升级后的边

| 来源 | 关系 | 目标 | 依据 |
| --- | --- | --- | --- |
| [RAW-163#50](shared-raw-163-clause-050.md#L1) | 整条取代 | [RAW-164#58](shared-raw-164-clause-058.md#L1) | #58 删除等价展示门槛 |
| [RAW-163#51](shared-raw-163-clause-051.md#L1) | 整条取代 | [RAW-164#58](shared-raw-164-clause-058.md#L1) | 同上 |
| [RAW-163#52](shared-raw-163-clause-052.md#L1) | 整条取代 | [RAW-164#58](shared-raw-164-clause-058.md#L1) | 同上 |
| [RAW-163#53](shared-raw-163-clause-053.md#L1) | `refined-by` | [RAW-166#77](shared-raw-166-clause-077.md#L1) | 更正，见上 |
| [RAW-164#58](shared-raw-164-clause-058.md#L1) | 局部取代 | [RAW-165#68](shared-raw-165-clause-068.md#L1) | 仅三态次序被换成五级跨分支优先级；聚合规则仍生效 |
| [RAW-142](codex-raw-142.md#L1) | 局部取代 | [RAW-160#7](shared-raw-160-clause-007.md#L1) | #7 明确「继续 Plan 对话不清除」 |
| [RAW-150](codex-raw-150.md#L1) | 局部取代 | [RAW-160#5](shared-raw-160-clause-005.md#L1)、[#6](shared-raw-160-clause-006.md#L1) | 两条分别管 Plan 后 exact interrupted 与普通 interrupted |
| [RAW-154](codex-raw-154.md#L1) | 局部取代 | [RAW-160#2](shared-raw-160-clause-002.md#L1)、[#5](shared-raw-160-clause-005.md#L1)、[#6](shared-raw-160-clause-006.md#L1) | #2 管版本升级，#5/#6 管 interrupted |
| [RAW-159](codex-raw-159.md#L1) | 局部取代 | [RAW-160#37](shared-raw-160-clause-037.md#L1) | #37 要求语义事务提交，取代「只在 Kernel no-op 去重」 |

整条边 18 → **21**，scoped 47 → **52**（一条一对多拆成多条精确边，数量增加而非减少——这正是精度提升的表现）。

#58 同时是取代者与被取代者：它取代了 #50–#52 的展示门槛，其自身的三态次序又被 #68 取代。链上无环，登记可以如实表达这种历史顺序。

### 仍未升级

四个 `codex-raw-1xx` 叶子保持 `active` 而非 `superseded`：只有它们的**一部分**被取代，整条状态翻转会让仍生效的部分一起失效。局部取代就该停在局部。

## 2026-08-17：StopFailure 关闭父 Turn 的局部取代

用户 2026-08-17 选择 D2，把 Claude「待继续」误判写入当前 Controlled 合同 RAW-174。该选择改变可见行为（仍在跑的 Claude 行不再因 Hook `StopFailure` 进入「待继续」），因此解除 semantic-fork 门禁。

PRD / Architecture / authority-reset 中「Stop/StopFailure 关闭当前 Turn」不是登记叶子，无法做机器边。处置是同步改写那些 current authority，并把机器身份落在 [RAW-174](claude-raw-174.md#L1) / [#89](claude-raw-174-clause-089.md#L1)–[#94](claude-raw-174-clause-094.md#L1)。

保留部分：成功 `Stop`、App 精确 failed/interrupted、已观察 open Turn 且无成功结果的 SessionEnd 仍关闭。SessionEnd lifecycle-only 合同不变。install-runtime-diagnostics 的 engineering-invariants [RAW-167 draft](invariants-raw-167.md#L1) 仍是 `proposed`，不参与；它与本次补登的 quick-task-view qualified RAW-167 不是同一身份。

## 2026-08-17：确认整行被气泡取代

用户明确要求确认提示不得再占卡片内整行。`decision_status=explicit-current-request`。RAW-173 中「有待确认时保留 `float-source-status`」被 [RAW-175](codex-raw-175.md#L1) 局部取代；搜索栏收纳条款仍有效。机器边写在 [codex-raw-173](codex-raw-173.md#L1) 的 `scoped_relations`。

该增量使当前机器登记总计成为 **21 whole + 53 scoped**；上文 21/52 是 2026-08-15 精确子条款升级当时的历史水位。

## 2026-08-23：V5 全局拓扑与统一命令

用户直接确认 [RAW-176](shared-raw-176.md#L1)，把“折叠”提升为 Codex、Cursor、Claude 共用的精确任务拓扑，并把点击、Enter、角标、快捷键和前后任务收敛到同一个 Command Gateway。`decision_status=explicit-current-request`，没有未决 semantic fork。

本条保留 RAW-160/164/165/174 的因果 lane、待输入清除屏障、状态优先级和精确关系基础，只在以下范围取代旧实现形态：V4 Registry/Kernel/Package/Actions 身份、Cursor Auxiliary 候选、Controller 来源直调、Renderer 包后二次折叠和四字段 Runtime Identity。历史条款继续保持 `active`，因为它们的其余状态与安全约束仍然生效；当前范围以 V5 Controlled [Change Review](../260823/companion-task-topology-v5/raw-requirement.md#L31) 为准，不创建会误伤保留语义的整条 `superseded` 边。

## 2026-08-23：V6 单状态源纠偏

RAW-176 revision 4 在保留 V5 Provider 注册、精确关系、统一命令及 RAW-177 native receipt/Source Anchor 冲突边的前提下，取代 V5 的预归约 task 输入、Topology 状态聚合、Renderer/provider task watcher/cache/sync action、过宽 Plan 清除与健康 Float 缺 ACK 强制重建。它不把 RAW-177 的 `dispatched` 提升为 opened/read，不恢复 V4/V2 facade，也不改变现有 requirement leaf 状态；当前精确范围见同一 Controlled [Change Review](../260823/companion-task-topology-v5/raw-requirement.md#L31)。

## 2026-08-23：Codex Tab 原始需求与后期变更复核

[RAW-167](codex-quick-task-view-raw-167.md#L1) 的父 identity 与 [#1](codex-quick-task-view-raw-167-clause-001.md#L1)–[#3](codex-quick-task-view-raw-167-clause-003.md#L1) 来源序号此前漏登，本次只做 qualified identity 抽取。它已在来源 Change Review 中明确：`Ctrl+F` 收敛为搜索，`F / Shift+F` 保留 Quick Jump，`Alt+数字 / Alt+F` 表示直接打开；与当前 PRD、帮助和代码合同无未决 semantic fork。

Environment Action 的 39 条有序来源条款继续由其来源/spec/PRD 承载，并已获得稳定 `SA-*` 来源身份；没有 RAW 父身份，所以仍不自动转为需求叶子。

## 2026-08-23：RAW-177 Codex 原生交接边界

用户明确选择 C 全部优化。机器登记新增 [RAW-177](shared-raw-177.md#L1) 与 [#1](invariants-raw-177-clause-001.md#L1)–[#3](shared-raw-177-clause-003.md#L1)。冲突处置如下：

- [RAW-163#55](shared-raw-163-clause-055.md#L1) 的“成功打开主任务即可建立会话期已读确认”被 RAW-177#3 **整条取代**。
- [RAW-164#61](shared-raw-164-clause-061.md#L1) 与 [#64](shared-raw-164-clause-064.md#L1) 仅在“外部 Deep Link 可直接建立 Turn/会话期已读确认”的范围被取代；其因果防回滚、parent-only 打开、待审批/待输入/stopped 等其余语义继续有效。
- [RAW-056](codex-raw-056.md#L1) 中“EyPc 打开不得更改 Codex Desktop 未读”继续有效，并由新合同进一步明确为：没有 Codex 原生回执时，EyPc 自身也不能把派发推导成已读。

本机没有可编辑的 Mirasim 仓库，已安装 App 也没有提供 Codex 原生展示/控制权回执接口。因此当前可实现且已落地的上限是 `requested → dispatched/pending`；`native-confirmed → applied` 是未来真实原生接口和宿主联调门禁，不标记为本地已完成。

## 2026-08-24：RAW-178 唯一全局当前真值

用户明确要求把原始需求、后续追加、变更、优化和架构调整按最新有效结果融合或替代，并保证唯一、真实和同步实时。机器登记新增 [RAW-178](invariants-raw-178.md#L1) 与 [#1](invariants-raw-178-clause-001.md#L1)–[#4](invariants-raw-178-clause-004.md#L1)。本条不取代任何产品行为叶子，也不把 102 条 source-only 来源条款提升为 active；它确定以下治理结果：

- [PRODUCT_REQUIREMENTS](../PRODUCT_REQUIREMENTS.md#L1) 是唯一全局当前产品语义 owner；历史 RAW、任务账本、架构和登记各自保留来源、验收、实现与生命周期职责。
- 已裁决变更只在当前产品投影中保留最新有效语义；旧实现仍可检索，但不得作为并行当前合同。
- 真值快照由需求登记、原始来源、Source Anchor Catalog、架构、产品正文和 Runtime Identity 内容指纹确定性约束；漂移即验证失败。
- `artifact-ready`、自动化验证、`host-loaded` 与原生可见/read ACK 继续分层，文档同步不得提升证据等级。

因此 whole/scoped 取代边仍为当前 `22 / 58`，`semantic-fork=0`、`agent-vs-user=0`。

## 2026-08-24：RAW-179 V7 状态、交互、Tab 与 UI 体系

用户在完成本机日志、源码、安装身份与截图核验后明确授权实施完整 V7，而不是发布 V6 单点热修。机器登记新增 [RAW-179](invariants-raw-179.md#L1) 与 [#1](shared-raw-179-clause-001.md#L1)–[#7](invariants-raw-179-clause-007.md#L1)，并作如下精确裁决：

- [RAW-160#5](shared-raw-160-clause-005.md#L1)、[#7](shared-raw-160-clause-007.md#L1) 与 [#10](shared-raw-160-clause-010.md#L1) 只在“completed Plan artifact 自身建立 waiting/待输入”的范围被 RAW-179#1 精化；当前未决 Plan 选择/实施 interaction 仍可产生 waiting，artifact-only 改为 `stopped / 待继续`。
- [RAW-142](codex-raw-142.md#L1) 同样只在上述 completed-Plan waiting 范围被精化；未读优先、匿名 rollout evidence 和不公开正文/原始 ID 的边界继续有效。
- [RAW-176](shared-raw-176.md#L1) 的 Provider 注册、拓扑、统一命令与 ACK 分层继续有效；其 V6 Provider 预归约反馈、重复公共投影和 Plan tri-state owner 由 RAW-179#2 的七条 evidence lane、生成合同与唯一 V7 Kernel 精化。
- RAW-179#3–#7 新增 FeatureModule/RuntimeSlice、统一交互 owner、有界增量性能、项目级 UI token/无障碍和完整 V7 一次性切换合同，不反向扩大发布、安装或真实 Host 操作权限。

本轮没有 whole supersession；whole/scoped 关系为 `22 / 68`，`conflicted=0`、`semantic-fork=0`、`agent-vs-user=0`。若后续真实 Host 证据与 artifact-ready 产物不一致，应回到同一 V7 任务修正，不能恢复被精化的历史等待规则。
