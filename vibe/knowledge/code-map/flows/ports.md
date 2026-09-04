# 03 端口进程

扫描是只读；结束进程是高风险，必须再验证当前 PID 仍占用该端口。

## 扫描

1. Runtime 发扫描 action。
2. 平台执行 `lsof` / `netstat`（浏览器 dev 走 Vite `/__eypc__/ports/scan`）。
3. [parseLsofListeningTcp](../../../../src/domain/ports.ts#L58) 或 [parseNetstatListeningTcp](../../../../src/domain/ports.ts#L78) 解析。
4. [dedupePortProcesses](../../../../src/domain/ports.ts#L30) 按 `pid:port:protocol` 去重。
5. 分组是插件元数据，不是 OS 对象：[matchPortGroupProcesses](../../../../src/domain/ports.ts#L180)。

页面：[PortsPage.vue](../../../../src/pages/PortsPage.vue#L1)。

## 结束进程

1. UI 只 dispatch kill / force-kill。
2. [shouldProcessMatchVerifiedPort](../../../../src/domain/ports.ts#L312) 确认选中 PID 仍在该端口上。
3. [buildKillPlan](../../../../src/platform/processBridge.ts#L27) 生成平台命令。普通 kill 要确认；force 仅当显式选中 PID 且端口匹配。

不要在页面里拼 `kill` 命令。
