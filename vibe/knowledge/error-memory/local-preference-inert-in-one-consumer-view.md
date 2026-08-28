---
id: eypc-local-preference-inert-in-one-consumer-view
status: verified
scope: project
fingerprint: local-preference-field-persisted-and-honored-by-some-consumers__one-consumer-view-never-reads-it-and-applies-its-own-filter-instead__feature-silently-inert-in-that-view-while-button-state-and-persistence-all-look-correct__no-test-or-type-error-signals-the-gap
first_seen: 2026-08-27
last_verified: 2026-08-27
review_after: 2027-02-27
evidence:
  - vibe/specs/260827/companion-pinned-parking/raw-requirement.md
  - vibe/specs/requirements/shared-raw-183.md
  - preload/companion/task-kernel.cjs
  - src/domain/codexPresentation.ts
  - src/FloatApp.vue
  - tests/platform/companionTaskKernel.test.ts
tags:
  - codex-companion
  - local-pin
  - presentation
  - projection
---

# 一个本地偏好在某个消费视图里从未被读取

## Symptom

用户报告：给任务点了置顶，但过一阵它照样从「动态」页签消失，置顶「没有用」。

界面上一切正常——置顶按钮有按下态、`aria-pressed` 正确、右键菜单文案在「本地置顶／取消本地置顶」之间正确切换、偏好也确实持久化了。没有报错，没有类型错误，没有测试变红。

## Wrong Assumption

**「这个字段被写入了、被持久化了、而且确实有消费者在读，所以功能是通的。」**

`localPin` 当时确有三个真实消费者：通用循环的 `fallback` 层、「项目」页签的 `pinned` 分区、行 `kind` 标签。三处都能验证通过。于是「置顶已实现」被当成了整体结论。

但用户实际使用的是第四个视图——「动态」页签——而那个视图的分组投影从头到尾没有读过 `pinSource`／`localPin`。

## Verified Root Cause

两件事叠加，缺一不会暴露：

1. **该视图从不读这个字段。** 动态页签只渲染六个按相位派生的组（[FloatApp.vue](../../../src/FloatApp.vue#L462)），`pinSource` 在这条渲染路径上不出现。
2. **该视图另有一个更强的过滤条件，无声地压过了偏好。** 已完成组按活动时间窗过滤（[codexPresentation.ts](../../../src/domain/codexPresentation.ts#L152)，默认 24 小时）。置顶不是「排序权重不够」，而是**根本没参与这次判断**，所以过窗即整条消失。

关键在于第 2 点让第 1 点变得不可见：如果该视图没有额外过滤，置顶项会照常显示，缺口要很久才会被察觉。正是这个「更强的默认规则」把「偏好未被读取」伪装成了「偏好被覆盖」。

## Cost

功能形态上完整、实际长期空转。用户是靠日常使用体感发现的，不是靠任何自动化。全套单元测试、类型检查与构建门禁自始至终全绿——**没有任何一层会因为「某个视图没读某个字段」而失败**。

## Correct Detection Order

面对「这个本地偏好好像不起作用」时，按这个顺序查，不要先去读写入侧：

1. **先枚举这个字段的全部消费者**，用 `grep` 搜字段名及其投影后的别名（这里是 `localPin` → `pinSource`），把**用户实际在看的那个视图**逐一对照进去。写入侧正常几乎是必然的，从它查起等于从最不可能的地方开始。
2. **对那个视图，确认字段是否出现在其投影路径里。** 完全不出现 ＝ 空转，不是「优先级不够」。这两种结论的修法完全不同。
3. **只有确认字段确实被读了之后**，才去比较它与同一视图内其他过滤条件（时间窗、可见性、能力位）的先后顺序。

## Rule

**「字段被写入 + 存在若干消费者」不等于「功能在用户所在的那个视图里成立」。**

- 新增或复核一个本地偏好时，把**消费者清单**当成交付物的一部分列出来，逐个视图确认，而不是确认「至少有人读了它」。用户不在乎有几个消费者读了它，只在乎他眼前那个视图读没读。
- 一个视图若带有自己的默认过滤（时间窗、活跃度、可见性），任何声称「能让内容留下」的偏好都**必须显式放在该过滤之前**，并为此留一条断言。参见本轮的[窗口豁免断言](../../../tests/platform/companionTaskKernel.test.ts#L947)：两条同样过窗的任务，只有置顶那条留下——这条断言在修复前必然失败。
- 反过来也要克制：确认偏好被读取后，**不要顺手扩大它的语义**。本轮曾把「置顶」实现成「移出工作流」（连带把置顶任务踢出前后循环），被用户否决——置顶只应给一类本来无路可达的任务加一条快速触发口，不应剥夺任务自身状态已有的入口。空转的修法是「补上读取」，不是「重新定义这个偏好」。

## Boundary

本记录只针对**本地偏好字段**在某个消费视图中未被读取的情形。它与[生产者先于消费者建成](producer-built-before-checking-the-consumer-can-express-it.md#L1)不同：那条讲的是消费侧合同主动压制了该状态、需要替换合同；本条讲的是消费侧根本没有这段代码，需要补上读取。两者的修法与检测入口都不一样，不要合并。
