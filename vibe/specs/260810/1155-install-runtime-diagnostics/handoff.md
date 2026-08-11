# Codex Companion v3 Host Handoff

Status: `artifact-ready / real-utools-acceptance-pending`

## 安装前

1. 只安装最终构建生成的同一份 `dist/plugin.json`，记录构建 identity。
2. 在 Codex「运行」确认 diagnostics 为 enabled/debug；不需要清除旧任务缓存。
3. 用 [probe](../../../../scripts/probe-eypc-diagnostics-runtime.mjs#L1) 记录新 sessionId，后续始终按 session/operation/taskRef 查询。

## 状态与库存矩阵

1. 新建 Codex 任务，确认 membership 到达即出现最小“进行中”卡片，标题/项目随后原位补齐。
2. 触发普通输入和审批，观察进行中 ↔ 待输入在下一帧切换，角标不延迟且无字符布局抖动。
3. 完成回复，依次核对 completed、completed-unread、成功打开后的 unread=false 和新 Turn running。
4. 中断任务并完整重启 uTools，确认 single-task 精确读取后进入待继续；再发起新 Turn，确认恢复 running。
5. 使用 40 条以上任务，检查第 41 条以后仍可见、可循环、可打开和可归档。

## 交互与日志矩阵

1. 分别用卡片、手动行、Quick Jump、全局快捷键、本地快捷键和 attention 快捷键打开任务。
2. 从 UI 提示或 JSONL 取得 operationId，查询 target selection、cache ready、alias、Provider dispatch、final outcome 和 duration。
3. 快速连按前后任务，确认第一目标立即执行、只保留最终尾随目标、相同 focus key 不重复发送。
4. 切换 debug/info/error/off，确认 debug 有 no-op/水位，info 只有真实状态和用户操作，error 只有失败，off 不再写业务事件。

## Codex 归档矩阵

1. 正常归档：第一次确认后按钮保持可见，第二次开始显示归档中；只有 native postcondition 完整通过后卡片消失，Codex App 刷新后同样不存在。
2. 故意断开 Desktop bridge 或阻断 ACK：卡片必须保留并显示“归档未确认”，按钮恢复，主窗口、Float 和 uTools 通知携带短 operationId。
3. 查询同一 operationId，确认 intent、confirmation、preflight、write、verify-1、sync、ACK、verify-2、commit、reconciliation/removal 阶段完整且无重复等价 intent。
4. 故障恢复后重试，确认使用新 operationId、只发送一次写，旧库存不能复活已经 commit 的任务。

## 完成条件

只有上述矩阵与 [verify.md](verify.md#L1) 的自动化/构建证据属于同一源码和同一安装包时，任务才能从 `installed-host-pending` 变为完成。安装、重启或进程控制属于宿主操作门禁，执行前需要用户明确授权。
