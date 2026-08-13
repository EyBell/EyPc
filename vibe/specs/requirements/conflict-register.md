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
