---
id: eypc-keyboard-dispatch-unreachable-when-focus-never-lands
status: verified
scope: project
fingerprint: command-dispatch-bound-to-bubbling-root__initial-focus-scheduled-with-one-nexttick__focus-target-not-rendered-yet-across-process-roundtrip__event-target-stays-document-body__every-command-except-capture-owned-escape-silently-dies
first_seen: 2026-08-13
last_verified: 2026-08-13
review_after: 2027-02-13
evidence:
  - src/FloatApp.vue
  - tests/ui/codexCompanion.test.ts
tags:
  - keyboard
  - focus
  - child-window
  - event-dispatch
---

# 键盘派发挂在冒泡根上，而焦点根本没落进去

## Symptom

悬浮子窗口被全局快捷键唤起后，用户按 `↑` `↓` `Enter` `Ctrl+数字` 全部没反应；
只有 `Escape` 和 `Shift` 预览还活着。反复按也不行，用鼠标点一下列表之后又全部正常。

## Wrong Assumption

以为「把命令派发挂在组件根元素的 `@keydown` 上」等价于「这个窗口里的按键都能收到」，
并且以为激活后 `nextTick(() => focusCurrent())` 足以把焦点放到列表首行。

两个假设各自看起来都成立，合起来才致命。

## Verified Root Cause

两条独立缺陷叠加成一个完全静默的失效：

1. **焦点落空。** 激活流程是 `requestExpansion(true)` 然后 `nextTick(focusCurrent)`。
   `requestExpansion` 是**跨进程往返**——子窗口请求父 preload 改 bounds，父再把新状态推回来；
   而 `nextTick` 只是一个 Vue 渲染 tick。展开后的列表行此时通常还没渲染，
   `document.querySelector('[data-focus-key=…]')` 拿到 `null`，`focus()` 静默不执行。
   焦点因此留在 `document.body`。

2. **派发不可达。** 命令派发挂在根 `<div>` 的冒泡 `@keydown` 上。事件目标是 `body` 时，
   `body` 是根 div 的**祖先**，事件根本不会冒泡到根 div，派发函数整个不执行。
   只有单独挂在 `window` capture 上的 `Escape` / Shift 记账还在工作。

任何一条单独存在都不会被发现：焦点落空但派发在 capture 上，快捷键照样能用；
派发在冒泡根上但焦点正常落进列表，也照样能用。

## Detection Order

1. 先问：**这个窗口的命令派发挂在哪个节点上？** 挂在组件根/任意后代节点，就必然存在
   「焦点在该节点之外」的死区；`document.body` 是最常见的那一个。
2. 再问：**初始焦点是怎么放的？** 只要目标元素的渲染依赖一次跨进程/跨帧往返，
   单个 `nextTick` 就是在赌。查 `querySelector(...)?.focus()` 这种「拿不到就无声跳过」的写法。
3. 复现方式：让 DOM 焦点停在 `document.body`，把按键直接派发到 `window` 上，
   看命令是否仍然生效。这条断言比任何视觉检查都便宜。

## Prevention Rule

- **可达性不能依赖焦点落点。** 命令派发的最终兜底必须在 `window` capture 上。
  本仓的落法是：保留根元素的冒泡派发（子层 `@keydown.stop` 的隔离靠它），
  只在**事件目标不在根内**时由 capture 层补一次派发——两者不会重复消费。
- 事件目标可能是 `Window` 而不是元素。补派发前把 target 归一成真实元素
  （`event.target` → `document.activeElement` → `document.body`），
  否则下游 `target.closest(...)` 直接抛 `TypeError` 且被 try/catch 吞掉。
- **抢焦点要有界重试，不要赌单个 tick。** 目标元素的出现依赖跨进程往返时，
  用有界渲染帧重试（本仓为 3 帧）后再放弃；无声放弃等于把失败留给用户复现。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-13 | 首次归档：RAW-167 核验悬浮卡片键盘交互时定位。同轮补两条回归——焦点在 `document.body` 时 `ArrowDown` 仍生效、`Window` 作为事件目标不再抛错。真实宿主冷启动落点仍待用户验收 |
