# 核心代码流程

每篇按一次真实操作写：入口 → Action → Domain / Kernel → 宿主。书签分组与 [`.codemark/codemark.json`](../../../../.codemark/codemark.json#L1) 同编号。

| 编号 | 流程 | 先看 |
| --- | --- | --- |
| 00 | [启动与壳](boot.md#L1) | uTools 打开插件 |
| 01 | [Action 派发](action-dispatch.md#L1) | 任意按钮 / 快捷键 |
| 02 | [Companion Kernel](companion.md#L1) | 任务列表 / 悬浮球 |
| 02a | [Kernel 函数走读](companion-kernel.md#L1) | 证据进 Snapshot、点开一条任务 |
| 03 | [端口](ports.md#L1) | 扫描与结束进程 |
| 04 | [MQTT](mqtt.md#L1) | 连接与归档 |
| 05 | [文件收藏](favorites.md#L1) | 打开 / 槽位 |
| 06 | [窗口跳转](windows.md#L1) | 激活与槽位 |
