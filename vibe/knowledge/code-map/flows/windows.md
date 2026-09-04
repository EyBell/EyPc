# 06 窗口跳转

稳定身份是「可独立操作的根窗口」。浏览器 Tab / 标题 / 显示器不能当 id。

## 观测 → 族

原生列表进 [coalesceNativeWindowFamilies](../../../../src/domain/windows.ts#L256)。关系只承认 AX/HWND 证据，不用同名进程猜测。

树：[windowTree.ts](../../../../src/domain/windowTree.ts#L1)。子窗口不能收藏、绑槽、批量。

## 激活

Runtime 注册 [windows.activate](../../../../src/runtime/appRuntime.ts#L9036)。根行 `root-current`，子行 `member-exact`。单独清 locator 仍只要 `probeInstance` 的 `verified-gone`。同应用唯一记录 + 唯一实时根见 [uniqueSameAppRebindLive](../../../../src/domain/windows.ts#L181) 与 [tryUniqueSameAppRebind](../../../../src/runtime/appRuntime.ts#L1895)（`gone` 或 `indeterminate` 可换绑，`live` 不可）。

原生实现只在 [preload/windows/](../../../../preload/windows/index.cjs#L1)，入口 preload 只做守卫和挂载。

## 槽位

[featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L46) `eypc-window-slot-*` → `windows.slot.activate`。成功激活不弹主窗；失败回工作台并带诊断。
