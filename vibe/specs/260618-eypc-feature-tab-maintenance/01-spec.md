# 功能 Tab 维护配置 Spec

## 目标

- 默认隐藏顶层 `文件收藏` Tab，但保留收藏数据和内部实现。
- 在 `设置 -> 维护 -> 功能开关` 管理顶层功能的启用状态和排序。
- 功能配置写入现有插件状态库，启动时由 [src/domain/state.ts](../../../src/domain/state.ts#L1) 归一化并自动生效。

## 范围

- 顶层功能包括 `ports`、`favorites`、`settings`。
- `settings` 始终强制启用，可参与排序但不能关闭。
- 禁用功能的 uTools 外部入口回退到 `settings`，并打开功能开关维护面板。
- 不修改 [public/plugin.json](../../../public/plugin.json#L1)，不删除隐藏功能的业务数据。

## 成功标准

- 新安装状态下只显示 `端口进程` 和 `设置` 顶层 Tab。
- 启用 `favorites` 后，Tab 和 `Ctrl+Shift+数字` 顺序按配置刷新。
- 禁用当前 active tab 后自动回到 `settings`。
- 通过 `pnpm run test`、`pnpm run typecheck`、`pnpm run build`、`pnpm run validate:utools`。
