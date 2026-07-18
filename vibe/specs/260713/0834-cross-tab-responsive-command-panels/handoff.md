# EyPc 跨页面响应式命令面板交接

Tool: codex

## Controller

- Controller: `app-root`
- Work-order version: 1
- Plan: [plan.md](plan.md#L1)
- Ledger: [tasks.md](tasks.md#L1)
- Verification: [verify.md](verify.md#L1)

## 当前状态

- Root 已接纳实现：统一 Operation Tooltip、Quick Jump 实底与避让、跨 Tab 左详情/右动作面板、目标优先级、焦点恢复和窄屏纵向布局均已落地。
- 自动化、1180/760/640/420×680、800×736 与 800/420×480 的真实浏览器矩阵、canonical 和记忆同步已完成；证据见 [verify.md](verify.md#L1)。
- 当前脏工作树包含此前已接纳收藏工作台改动，禁止 reset/clean 或把旧改动误归入本任务。
- 无 DB/SQL、发布、权限、凭据、真实文件修改、端口终止或外部 MQTT 写入。

## 残余门禁

- macOS uTools 真实打开/定位/复制 smoke 与 Windows/Linux 实机验收仍未执行，不得宣称宿主通过。
- Vite 仍提示主 chunk 超过 500kB；本轮未扩张到无关的打包拆分。

## 恢复规则

后续若继续宿主验收，先读取 [verify.md](verify.md#L1) 的残余门禁并只补对应平台证据；不要重做已接纳的浏览器矩阵，也不要把宿主未验证误写为实现失败。
