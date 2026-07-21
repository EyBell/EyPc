# Codex Companion 真实会话与交互实施计划

Tool: codex
Date: 2026-07-21
Status: `completed`

Authority: [spec.md](spec.md#L1)

1. 用只读本机预检确认 Codex 原生项目注册、Pinned/Projects/Chats 顺序、未归档完整库存和最新 Turn 时间，锁定与截图差异的根因。
2. 将 [preload/index.js](../../../../preload/index.js#L1) 升级为 Host Snapshot V2：精确主文件/备份读取、完整分页、原生归属优先级、严格 latest Turn `startedAt`、扫描指纹重试与 fail-closed 完整性门禁。
3. 将 [codex.ts](../../../../src/domain/codex.ts#L1) 和 [codexController.ts](../../../../src/runtime/codexController.ts#L1) 升级为会话投影 V3：1–365 天滚动窗口、五页签、项目结构、统一倒序、stale 快照和隐私安全迁移。
4. 增加最后页签/折叠状态、别名、本地置顶顺序、本地移除项目集合；只保存散列身份和稳定项目指纹。
5. 重构 [FloatApp.vue](../../../../src/FloatApp.vue#L1)：页签置顶、统一搜索、真实额度文字、项目分组、第一版紧凑操作、多选、焦点、抽屉与原位二次确认。
6. 重构 [CodexWaterBall.vue](../../../../src/components/CodexWaterBall.vue#L1)：移除悬浮迷你详情/5h 假标签，中心只显示最近重置的真实额度，Weekly 存在时绘制 5px 完整轨道与剩余圆弧。
7. 将 Codex 命令接入独立快捷键域，并向悬浮子窗同步解析后命令；输入框保留原生编辑键，同层冲突才阻止配置。
8. 实现短期 action alias + 任务版本 + 项目指纹的真实单条归档；归档后完整核验 `archived=false/true` 两侧，失败不乐观删除。
9. 实现项目全历史归档：跳过 active、20 条一批、并发 2、逐项双向核验并返回部分失败；“从 EyPc 移除”保持明确本地语义。
10. 扩充自动化：主文件/备份、分页/游标、指纹、归属、时间边界、五页签、搜索、别名/置顶/迁移、快捷键、确认、批量失败与归档验证。
11. 在 380px/330px 完成第一版浏览器视觉核验，覆盖 Weekly-only 23% fixture、双/无额度、圆环、项目顺序、无 Console error 和键盘路径。
12. 使用 [codex-real-preflight.mjs](../../../../scripts/codex-real-preflight.mjs#L1) 执行生产桥接真实只读预检；使用 [codex-archive-lifecycle-check.mjs](../../../../scripts/codex-archive-lifecycle-check.mjs#L1) 创建专用临时任务完成真实归档/恢复双向验收并最终归档清理。
13. 运行全量测试、类型检查、生产构建、uTools runtime、diff 和文档链接门禁，同步 Controlled 六件套及项目当前权威。
14. 按交互修订 2 将任务/项目操作改为固定 32px 槽位的常显短字符，保留同槽 `确`，移除圆点、图标、hover 展开与宽度动画。
15. 只从 Codex 悬浮子窗移除 `OperationTooltipLayer` 及所有 Tooltip/title 数据，保留 ARIA 与主程序其他页面的统一 Tooltip。
16. 将 Space 改为原位切换；实现两项起自动显示的绝对浮动批量栏，并按焦点/末选项所在半区在顶部或底部重定位，保证列表行零位移。
17. 扩充组件/CSS/快捷键自动化并在 380px、330px 与 104px compact 完成无 Tooltip、无横溢、固定 32px 槽、批量栏上下避让及 Space 原位的浏览器验证。
18. 同步修订 2 的 Controlled/项目/个人产品文档，重跑全量门禁、真实只读预检与专用临时归档生命周期。

Completion: 1–18 全部完成；精确证据与残余见 [verify.md](verify.md#L1)。
