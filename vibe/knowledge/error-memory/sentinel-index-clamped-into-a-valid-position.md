---
id: eypc-sentinel-index-clamped-into-a-valid-position
status: verified
scope: project
fingerprint: findindex-returns-minus-one__wrapped-in-math-max-zero__no-cursor-becomes-cursor-at-index-zero__paired-with-an-implicit-first-item-fallback-in-the-derived-getter__highlight-and-keyboard-cursor-diverge
first_seen: 2026-08-13
last_verified: 2026-08-13
review_after: 2027-02-13
evidence:
  - src/FloatApp.vue
  - tests/ui/codexCompanion.test.ts
tags:
  - keyboard
  - list-navigation
  - state-modeling
---

# 哨兵值被夹成合法下标，于是"没有游标"和"游标在第 0 项"再也分不开

## Symptom

列表首次按 `↓`，焦点直接跳到**第 2 行**；首次按 `↑` 完全没反应。
界面上第 1 行明明是高亮的。用户的描述是"上下键的移动有问题"。

## Wrong Assumption

以为 `Math.max(0, findIndex(...))` 是一个无害的防御性夹取——"反正下标不能是负数"。
实际上 `findIndex` 的 `-1` 不是越界，是**哨兵值**，它表达的是"没有当前项"这一独立状态。
夹成 `0` 等于断言"没有当前项 = 当前项是第 0 项"，而这两者需要的下一步动作完全不同。

## Verified Root Cause

两处代码分别做了一半的错事，合起来才出现可见症状：

- `moveFocus` 里 `const currentIndex = Math.max(0, focusItems.findIndex(item => item.key === focusedKey))`。
  `focusedKey` 为空时 `-1 → 0`，于是 `↓` 目标是 `0 + 1 = 1`（第 2 项），`↑` 目标是 `max(0, -1) = 0`（原地不动）。
- 派生 getter 里 `focusedItem = find(focusedKey) || focusItems[0] || null`。
  这个隐式回退让**界面照样高亮第 1 行**，`Enter` 也会打开第 1 行。

于是"看到的高亮"和"键盘游标"变成两个不同的东西：视觉说游标在第 0 项，
`moveFocus` 说游标不存在。用户看到的就是"高亮在第 1 行，按 ↓ 却到了第 3 行的位置"。

冷启动确实会命中：补种 `focusedKey` 的 watcher 没有 `immediate: true`，首次挂载不触发。

## Detection Order

1. 搜索 `Math.max(0, ...findIndex...)`、`?? 0`、`|| 0` 包住查找结果的地方。
   对每一处问：**这个 0 和"找不到"是同一件事吗？**
2. 搜索派生 getter 里的 `find(...) || list[0]` 这类隐式回退。
   它会掩盖上一条的症状，让 bug 只在"移动"时暴露而不在"渲染"时暴露。
3. 复现断言：把游标状态置空，分别按 `↑` 和 `↓`，检查落点是"末项 / 首项"还是"原地 / 第二项"。

## Prevention Rule

- **哨兵值要显式分支，不要靠夹取。** 本仓的落法：
  `currentIndex < 0 ? (direction === 1 ? 0 : last) : clamp(currentIndex + direction)`。
  "无游标"时 `↓` 落首项、`↑` 落末项；有游标时维持既有的不环绕夹取。
- **一个状态只能有一个真相。** 删掉派生 getter 的隐式回退，改成一个 `immediate` 的 watcher
  把"列表非空即有游标"变成显式不变量；并让它注册在依赖它的 watcher 之前。
- 视觉高亮与键盘游标必须由同一个字段驱动；测试里同时断言
  "有且只有一个 `tabindex="0"`" 与"移动落点"，两者不能分开验。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-13 | 首次归档：RAW-167 核验悬浮卡片列表移动时定位。同轮补回归——挂载即有唯一游标、首次 `↓` 到第 2 行、`↑` 回第 1 行且不环绕 |
