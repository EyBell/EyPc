---
id: eypc-preload-module-instanceof-crosses-vm-sandbox-realm
status: verified
scope: project
fingerprint: preload-codex-module-checks-instanceof-map-or-set__value-constructed-inside-vm-sandbox__check-runs-in-modules-own-node-realm__always-false-under-test
first_seen: 2026-08-15
last_verified: 2026-08-28
review_after: 2027-02-15
evidence:
  - preload/codex/waiting-evidence.cjs
  - preload/companion/persisted-side-state.cjs
  - tests/platform/codexAppServerBridge.test.ts
tags:
  - preload
  - codex
  - raw-169
  - vm-sandbox
  - realm
---

# Preload 模块内 `instanceof Map`/`Set` 跨 vm 沙箱 realm 恒假

## Symptom

`codexWaitingFlagClearSequence`/`codexWaitingEvidenceVisible` 从 `preload/index.js` 逐字迁移到 `preload/codex/waiting-evidence.cjs`（RAW-169 第十二块）后，函数体逐字比对零差异，但 `codexAppServerBridge.test.ts` 两条已有用例失败：`resolveServerRequest` 用请求相关性清掉一个 waiting 标记后，该标记仍然可见；`desktopActiveSince` 在等价快照替换后丢失。

## Wrong Assumption

以为「函数体没变，行为就没变」——本条款前十一块的核心纪律。这次栽在**判据本身**：`waitingState.resolvedRequestSequences instanceof Map` 不比较值，比较的是构造函数身份。

## Verified Root Cause

`waitingState.resolvedRequestSequences` 由 `preload/index.js` 内部（在测试里跑在 `vm.runInNewContext` 沙箱）用 `new Map()` 构造，其 `Map` 是**沙箱自己的** intrinsic。抽出的模块经真实 `require()` 加载，跑在**真实 Node realm**，模块里裸写的 `Map` 是另一个构造函数。同一个对象在两个 realm 下都是「货真价实的 Map」，但 `instanceof` 比较的是原型链恒等，跨 realm 恒假——`resolveServerRequest` 清空的 `resolvedRequestSequences` 因此被模块读作「不是 Map」，退化到无条件可见分支，与已解析请求应被隐藏的预期相反。

这与 node-runtime.cjs 「vm 沙箱里 `process` 指向 `processMock`」是同一类缺陷的另一种表现：不是值变了，是运行环境（这次是 realm 而非 mock 替身）变了。已知同款隐患：`preload/codex/rollout-evidence.cjs:55` 的 `initialCorrelations instanceof Set`——目前测得的调用路径里 `initialCorrelations` 恰好在命中该检查前从未跨 realm 构造过（要么是模块自己产出的 Set 回传，要么该路径首次调用时恒为空 Set，检查失败退化到「视为空」与真值一致），所以尚未在现有用例里显性，但同一模式仍然是隐患，未来若有新调用路径直接把 vm 沙箱构造的 `Set` 传入该函数，会复现同一 class 的失败。

## 第二种表现：模块内读宿主全局（2026-08-28 补记）

把 uTools `dbStorage` 侧状态整簇抽到 [persisted-side-state.cjs](../../../preload/companion/persisted-side-state.cjs#L1) 时复现了**同一 class 的另一种表现**：迁走的函数体里裸写 `globalThis.utools?.dbStorage`。

沙箱测试通过 `require` 垫片把模块解析到**真实 Node realm**，于是模块里的 `globalThis` 是宿主全局，而 `utools` 只挂在沙箱的 `globalThis` 上——读到 `undefined`，`getItem`/`setItem` 全部走可选链静默跳过。表现极具迷惑性：没有任何异常，Plan 暂停迁移用例只是断言「V7 键没被写入」，看起来像迁移逻辑写错了，实际逻辑逐字未变。

`instanceof` 那次比较的是构造函数身份，这次读的是全局对象身份；**共同点是「函数体没变，但它现在从另一个 realm 里取环境」**。

## Detection Order

1. 抽取后聚焦测试仍失败，且函数体逐字比对确认零差异 → 检查函数体内是否有裸写的 `instanceof Map` / `instanceof Set` / `instanceof <builtin>`。
2. 用 `throw new Error(...)` 而非 `console.*` 在 vm 沙箱代码路径里做临时探测——沙箱通常不提供 `console` 全局，`console.error` 会静默抛出并被上游 catch 吞掉，读不到任何输出。
3. 确认输入对象的构造位置：若它在 `preload/index.js`（vm 沙箱）内构造、又传给一个真实 `require()` 加载的模块做 `instanceof` 判断，即命中此类。

## Prevention Rule

抽取模块前先搜索函数体内**一切从 realm 取值的写法**，不止 `instanceof`：`instanceof <builtin>`（`Map`/`Set`/`Array`/`RegExp`/`Promise` 等）、`globalThis.*`、裸写的宿主全局（`utools`、`process`、`window`）。命中一律按 node-runtime.cjs 的 `process` 先例注入：`const MapCtor = dependencies.Map || Map`，调用处从入口传入该入口自身 realm 的构造函数引用。不要把 `instanceof` 改写成鸭子类型判断去规避——那是逻辑改写，与「拆分与行为修改不得混在同一提交」冲突；注入构造函数引用才是保持逐字迁移语义的正确修法。全局同理：由入口传入 `storage: () => globalThis.utools?.dbStorage` 这类访问器，让求值发生在入口自己的 realm，模块只消费。

一条便宜的自检：抽完的模块里 `grep -c globalThis` 应当为 0（注释除外）。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-15 | 首次归档：RAW-169 第十二块抽取 waiting-evidence.cjs 时命中，注入 `Map` 后聚焦测试恢复 185/185 |
