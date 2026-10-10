---
id: eypc-native-geometry-fixture-must-not-watch-provider-files
status: verified
scope: project
fingerprint: float-geometry-tests-pass-with-emfile-errors__full-node-fs-starts-real-provider-watchers-in-each-vm__isolate-unrelated-native-watchers-in-fixture
first_seen: 2026-10-10
last_verified: 2026-10-10
review_after: 2027-01-10
evidence:
  - tests/platform/codexFloatWindowBridge.test.ts
  - vibe/specs/260915/float-edge-rail/spec.md
tags:
  - test-fixture
  - filesystem-watch
  - native-geometry
---

# 原生几何测试不能监听实际 Provider 文件

## Symptom

浮窗、位置与项目索引的断言全部通过，但测试进程因 `EMFILE: too many open files, watch` 和 StatWatcher 监听器积累而失败。串行测试或调整进程文件上限没有解决。

## Wrong Assumption

浮窗几何夹具可以直接把完整 node:fs 交给预加载入口，认为未测试的 Provider 监听与原生窗口几何无关。

## Verified Root Cause

每个 VM 加载入口都会初始化相关 Provider 监听；完整 fs 把测试连接到了用户真实文件，重复夹具积累原生 watcher。断言通过不等于测试进程干净退出，不能忽略未捕获错误或修改生产监听来绕过。

## Detection Order

1. 分开检查断言结果和未捕获错误；确认报错的测试文件与 watcher 来源。
2. 核对夹具是否透传真实 fs.watch/watchFile，以及测试是否需要这些监听。
3. 几何单元只保留读取能力，将无关 watch/watchFile/unwatchFile 改为无副作用的夹具实现。
4. 对真实监听合同使用专门夹具、临时目录及明确 teardown，不能把监听失败当成可接受 warning。

## Prevention Rule

加载完整 preload 的狭义原生几何夹具必须隔离文件监听；不得通过忽略未捕获错误、加大系统资源或关闭生产功能使测试变绿。

## Latest Applicable Implementation

[几何夹具](../../../tests/platform/codexFloatWindowBridge.test.ts#L348) 的 fs 仅在测试中替换监听方法，生产 Provider 监听合同不变。

## Alternative Route

- Status: `verified`。
- Preconditions: 狭义原生窗口几何测试不验证 Provider 文件监听。
- Ordered steps: 找到 VM fs 注入点；隔离无关 watcher；保留原生窗口读写 mock 与断言；重跑整个夹具文件及位置保存链路。
- Verification: 四文件 59/59 干净退出；其中浮窗 56 项、项目索引 3 项，无未捕获 EMFILE。
- Applicability boundary: 不适用于真实 watcher、订阅或恢复行为的测试，那些必须在受控临时目录验证。
- Fallback: 若测试需要真实监听，明确资源拥有者并在 teardown 关闭；不能用全局 mock 取消受测行为。

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-10 | 浮窗分批提交 | 断言通过但测试进程失败 | 文件上限/串行不能修复夹具侧漏 | [核验](../../specs/260915/float-edge-rail/spec.md#L1) | 隔离几何夹具的实际文件监听 | 59/59，零未捕获错误 |
