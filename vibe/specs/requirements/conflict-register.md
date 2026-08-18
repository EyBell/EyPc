# Requirement Conflict Register

阶段二冲突核验记录。扫描范围是全部 `vibe/specs` 文档中含取代/冲突语义且引用两条以上 `RAW` 的行，共 72 处。

Date: 2026-08-13

## 结论

**没有需要用户裁决的未决冲突。** 全部 72 处冲突声明都已有明确决定，本轮做的是把已决定的关系从散文变成机器边。

## 处置分类

| 类型 | 数量 | 处置 |
| --- | ---: | --- |
| `explicit-superseded` 整条取代 | 18 | 已在首批入册时转为 `superseded_by` / `supersedes` 双向边 |
| `scoped-superseded` 局部取代 | 47 | 本轮新增 `scoped_relations` 边，含 6 条跨任务 |
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

无 `RAW` 编号的约 160 条编号条款不在扫描范围内——没有身份就无法表达冲突关系。见 [coverage](coverage.md#L1)。

## 2026-08-15 升级：散文范围改为子条款精确边

子条款可寻址之后，指向 install-runtime-diagnostics 的局部取代不再需要用散文描述范围。**但实测推翻了「47 条都可升级」这个前提。**

47 条 scoped 关系里：

| 类别 | 条数 | 可否升级 |
| --- | ---: | --- |
| 指向六个可寻址父条款 | 6 | 可以 |
| 其余（codex-quota-float 内部） | 41 | **不可以** |

那 41 条的 scope 是**语义面**（`appearance`、`live-authority`、`interaction`、`weekly-ring`…）而非条款子集——它们的来源是 bullet 列表，每条 RAW 本身就是一条叶子，没有编号子条款可指。**scope 描述的是一条需求的某个侧面，不是它的一部分条款。** 这类关系已经处在它能达到的最精确形态。

### 更正：散文区间多框了一条

原记录写「[RAW-163](codex-raw-163.md#L1) 第 50–53 条 main-first 展示门槛」被 RAW-164 取代。逐条回到来源核对后：

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

## 2026-08-17：确认整行被气泡取代

用户明确要求确认提示不得再占卡片内整行。`decision_status=explicit-current-request`。RAW-173 中「有待确认时保留 `float-source-status`」被 [RAW-175](codex-raw-175.md#L1) 局部取代；搜索栏收纳条款仍有效。机器边写在 [codex-raw-173](codex-raw-173.md#L1) 的 `scoped_relations`。
