---
id: eypc-preload-module-forgets-injection-at-call-site
status: verified
scope: project
fingerprint: extracted-module-factory-accepts-a-dependency-param__entry-loader-call-omits-it__module-falls-back-to-ambient-global__global-differs-between-production-realm-and-vm-sandbox-test-realm
first_seen: 2026-08-15
last_verified: 2026-08-15
review_after: 2027-02-15
evidence:
  - preload/codex/launch-path-preference.cjs
  - preload/index.js
  - tests/platform/codexAppServerBridge.test.ts
tags:
  - preload
  - codex
  - raw-169
  - vm-sandbox
  - realm
---

# 抽取模块设计了注入参数，入口调用处却忘了传

## Symptom

`launch-path-preference.cjs` 的工厂函数签名写了 `dependencies.process`/`dependencies.os`/`dependencies.fs`/`dependencies.utools`，函数体里也正确地用 `dependencies.process || process` 兜底——看起来已经照着 node-runtime.cjs / run-database.cjs 的先例做了注入。但入口 `preload/index.js` 里实际调用 `createCodexLaunchPathPreference({...})` 时只传了 `platformPath`/`launchPlan`/`storageKey` 三项，漏了 `fs`/`os`/`process`/`utools` 四个。聚焦测试里三条 Windows 平台候选扫描用例当场失败：模块内部兜底取到的是**模块自己 require 时刻的真实 Node `process`**，不是测试 vm 沙箱注入的 `{ platform: 'win32', ... }` 假 process，`host.platform === 'win32'` 恒假，落进 macOS/Linux 分支。

## Wrong Assumption

以为「工厂函数体里写了 `dependencies.x || x` 兜底逻辑」等于「注入已经完成」。兜底逻辑只解决了「没传时不崩溃」，解决不了「没传时用哪个 realm 的全局对象」——这正是本条款反复出现的那类缺陷（`instanceof Map` 跨 realm 恒假是同根同源的另一种表现，见 [preload-module-instanceof-crosses-vm-sandbox-realm](preload-module-instanceof-crosses-vm-sandbox-realm.md#L1)）：兜底到的全局对象在生产环境（真实 Electron/Node 进程，只有一个 realm）里凑巧是对的，在 vm 沙箱测试环境里是错的，二者不会同时暴露问题——只有跑测试才能看见。

## Verified Root Cause

工厂签名与调用处是两处独立的文本，中间没有编译期检查两者是否一致。设计阶段（写模块文件）与接线阶段（写入口 loader 调用）如果不是同一次动作完成、且事后不逐行核对，注入链会在中间断掉而不报错——因为 `dependencies.x || x` 的兜底分支永远语法合法，只在语义上错。

## Detection Order

1. 抽取模块新增任何 `dependencies.xxx` 参数后，立即 `grep` 入口里 `createCodexXxx({` 的实际调用，逐项核对每个参数名都出现在调用的对象字面量里——不要读函数体确认「写了注入逻辑」就当作接线完成。
2. 聚焦测试里凡是依赖 `process.platform`/`os.homedir`/`fs.*`/`globalThis.utools` 分支的用例最先暴露；若某条平台特定断言（如 Windows 分支）失败但同名 macOS/Linux 断言通过，优先怀疑注入链断裂而非逻辑改写。
3. 用 `throw`（而非 `console.*`——vm 沙箱通常不提供 `console`）在模块内部临时打印 `dependencies` 实际收到的键名，与预期签名比对。

## Prevention Rule

写工厂函数签名的同一次编辑里，同步改入口 loader 的调用处；改完立即跑该模块相关的聚焦测试而不是只做语法检查——语法检查测不出兜底到了错误的全局对象。

## Related

- [Preload module `instanceof` crosses vm sandbox realm](preload-module-instanceof-crosses-vm-sandbox-realm.md#L1) — same root cause (ambient global differs by realm), different manifestation (identity check vs. missing wire-up)
- [Behavior check cannot prove derived value unchanged](behavior-check-cannot-prove-derived-value-unchanged.md#L1) — this round also caught a copied-constant mistake (labels typed from memory instead of diffed against source); same session, different lesson

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-15 | 首次归档：RAW-169 第十五块抽取 launch-path-preference.cjs 时命中，补齐四个注入参数后 Windows 平台聚焦测试恢复 |
