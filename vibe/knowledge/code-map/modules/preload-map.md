# preload/ 文件地图

Host 进程代码。`preload/index.js` 是入口棘轮对象；新逻辑按簇抽到子模块，不要把业务写回入口。

## 入口与共享

| 文件 | 含义 |
| --- | --- |
| [index.js](../../../../preload/index.js#L1) | Host 入口：装模块、挂 `window.eypcPlatform`、Companion 注入 |
| [float.js](../../../../preload/float.js#L1) | Float 子窗 preload |
| [action.js](../../../../preload/action.js#L1) | Action 子窗 preload |
| [diagnostics.cjs](../../../../preload/diagnostics.cjs#L1) | 运行诊断 |
| [timing-policy.cjs](../../../../preload/timing-policy.cjs#L1) | 有界时序策略 |
| [task-phase.cjs](../../../../preload/task-phase.cjs#L1) | 相位枚举与谓词 |

## companion/

| 文件 | 含义 |
| --- | --- |
| [provider-registry.cjs](../../../../preload/companion/provider-registry.cjs#L1) | Provider 清单与 Host Registry |
| [provider-manifest.json](../../../../preload/companion/provider-manifest.json#L1) | id / 能力 / pin 策略单点 |
| [task-topology.cjs](../../../../preload/companion/task-topology.cjs#L1) | 只收成员关系的图 |
| [task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L894) | 唯一归约器 |
| [task-actions.cjs](../../../../preload/companion/task-actions.cjs#L99) | 命令网关 |
| [navigation.cjs](../../../../preload/companion/navigation.cjs#L1) | 上一/下一与派发泵 |
| [open-handoff.cjs](../../../../preload/companion/open-handoff.cjs#L9) | 打开收据状态机 |
| [open-readiness.cjs](../../../../preload/companion/open-readiness.cjs#L1) | 跳转前启动目标应用 |
| [contracts-v7.cjs](../../../../preload/companion/contracts-v7.cjs#L1) | V7 证据形状 |
| [evidence-adapter-v7.cjs](../../../../preload/companion/evidence-adapter-v7.cjs#L1) | 适配器批规范化 |
| [branch-causality.cjs](../../../../preload/companion/branch-causality.cjs#L1) | 分支因果比较 |
| [persisted-side-state.cjs](../../../../preload/companion/persisted-side-state.cjs#L1) | 无原文的侧状态持久化 |

## Provider 适配器（按目录）

`preload/codex/`：App Server、Desktop IPC、Host 额外进程、额度、归档、Float 桥、置顶写出站。入口级函数应继续往外抽。

`preload/claude/`：App 元数据、Hook 事件、未读 LevelDB 快照、额度、打开、归档、中断探测。

`preload/cursor/`：sqlite 库存、hook 事件、官方 deeplink 打开、归档翻转。

`preload/windows/`：WJ-22 原生列表/激活/Space；失败只降级窗口功能。

改 Provider 时不要在 Controller 或 Float 再写一份业务实现。
