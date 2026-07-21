# Codex App Server 异常退出遗留会话内存

Last verified: 2026-07-19
Scope: `project / Codex App Server preload lifecycle`

## Symptom

- 显式关闭会清理匿名动作映射、turn 状态缓存和首次提问分页游标，但子进程异常 `exit/error` 只清 RPC/process 字段。
- 旧 action alias 在进程退出后仍可能短暂有效；被拒绝的后台分页还可能沿用旧 generation 自动拉起新 App Server。

## Root Cause

- 正常关闭和非预期退出维护两份不对称清理逻辑。
- 后台扫描的 `finally` 无 generation 所有权判断，旧任务可能覆盖新一轮 running 状态。

## Prevention Rule

- 正常关闭、启动失败和非预期 `exit/error` 必须共用一个会话重置函数，统一清 alias、raw-ID 状态缓存、raw-ID/cursor 首问缓存与 capability，并递增 generation。
- 每个异步扫描在 await、catch 和 finally 都校验自己捕获的 generation；旧扫描不得创建新进程、写回缓存或清除新扫描状态。
- 子进程异常结束后旧 alias 立即失效；只有新的显式读取可以建立新会话。

## Regression Evidence

- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) 持有后台 `limit=50` 请求后触发异常退出，断言旧 alias 失效、旧分页不自动 spawn、新读取才建立第二个子进程。
- [preload/index.js](../../../preload/index.js#L1) 的正常关闭和异常退出共同调用同一会话重置函数。

## Detection Order

1. 枚举正常 close、初始化失败、`error`、`exit` 和 RPC overflow 等终止路径。
2. 对比每条路径是否清理相同的敏感内存和 capability。
3. 在异步后台任务 await 边界核对 generation，并检查 finally 是否有所有权保护。
4. 用挂起请求制造进程退出，观察是否出现无用户触发的新 spawn。
