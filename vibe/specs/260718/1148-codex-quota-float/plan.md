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
19. 按交互修订 3 增加 App Server 状态通知与 200ms 单飞轻量活动扫描；状态变化匿名增量投影，库存结构变化才触发完整 V2 扫描，连续失败退避到 1s。
20. 将任务区域扩为 `全部 / 待输入 / 动态 / 已完成 / 已隐藏 / 项目` 六页签；动态页按待输入、当前动态、已完成未查看分段，并在水球左上/右上展示三种非零计数。
21. 恢复子窗自有的不透明详情说明：任务 500ms，状态与短字符操作 200ms；保持无原生 `title`、无主应用 Tooltip 层和无额度气泡。
22. 将整行点击改为直接打开，选择限定在左侧槽与 Space；Space 新增选择后下移。实现唯一高亮的鼠标/键盘所有权、右键完整抽屉、单项/批量动作隔离、抽屉方向键/Enter/Ctrl+数字和全页 F Quick Jump。
23. 增加 `codex.float.activate` 与静态 uTools 入口，直接显示、展开并聚焦卡片；成功打开完成未查看任务推进本地查看水位，项目折叠采用乐观反馈，自动收起缩短到约 100ms。
24. 更新组件、桥接、Runtime、快捷键和集成自动化，重点覆盖 200ms 活动通道、六页签、三角标、说明延时、Space 下移、动作隔离、右键/Quick Jump 和全局激活。
25. 在完整测试、类型、构建、uTools、380/330px 视觉、真实只读预检和文档链接均通过后，将修订 3 记录为 accepted；不重复执行已通过的真实归档生命周期，不操作用户现有任务。
26. 在修订 3 的干净基线上复核用户列出的跨 Tab 能力，保留六页签、200ms 活动通道、批量栏和归档协议，只迁移状态机/右键/焦点/预览/Quick Jump 合同，明确拒绝 payload、草稿持久化、主窗口 Tooltip/ConfirmLayer 和主窗口焦点所有权。
27. 将额度升级为普通/Spark V2，读取 `rateLimitsByLimitId` 与动态 `model/list`；增加普通 5 小时→普通周→最高 Spark 的水球投影、Spark `S` 和 `quota-auto` 默认模型解析。
28. 增加专用瞬时新会话桥接与 editor：冻结/刷新确认模型，精确 `thread/start` 模型/cwd 且关闭 provider fallback，成功校验后才 `turn/start`/Deep Link；实现零轮清理、短期重试打开、提示词零持久化和 App Server 不可用的显式空白页路径。
29. 将会话行改为单击选择、双击/Enter 打开；项目只常显 `＋`，右键/Ctrl+右统一完整抽屉。删除普通 hover 卡片并实现纯 Shift 白名单预览、目标所有权、翻转/夹紧/内部滚动、失焦/Escape 抑制；补强 Quick Jump 裁剪/遮挡/命中栈过滤和焦点恢复。
30. 注册可改键的 Codex profile `Ctrl+T`，让浮窗使用主窗口同一 `when`/layer 解析并独立维护 `codex-composer` 输入角色与暂态 LIFO；补齐额度、模型、composer、快捷键、Shift、Quick Jump、失败清理和重试打开测试。
31. 用本机生成的 App Server JSON schema 与只读 `model/list`/`account/rateLimits/read` 核对协议；完成 380/330/104px 浏览器视觉、全量测试/类型/构建/uTools、canonical/public preload 同步、Markdown code-link audit 和受控文档收口。真实系统听写与真实 `turn/start`/Deep Link 留作单独宿主验收，不在本轮创建真实任务。
32. 按交互修订 5 将收起水球改为上下半区命中：删除角标 hover 展开，上半区只保留数字角标直接点击，下半区 pointer enter/move 才立即展开；补充几何命中回归并重跑全量测试、类型、构建/uTools 与文档门禁。

Completion: 1–32 全部完成；真实系统听写与真实 `turn/start`/Deep Link 按计划保留为单独宿主验收，精确证据与残余见 [verify.md](verify.md#L1)。
