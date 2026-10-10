# ChatGPT Projects 只读索引提交核验

日期：2026-10-10。状态：`implementation-landed / focused-automated-verified / host-pending`。

现有增量将 ChatGPT Projects 与 Workspace 原生项目分开：sidebar g-p- 项目与 chatgpt catalog 绑定一致、48 小时内且最新 Turn 有效，才补入任务；每次最多 8 条。Workspace assignment 优先，缺 catalog 或真实 Turn 时不制造任务，不使普通库存扫描失败。项目卡片展示，但移除别名仍为 chatgpt，不能进入 Workspace 删除写入。

实现：[只读索引](../../../../preload/codex/chatgpt-project-index.cjs#L1)。核验：[绑定、真实 Turn、删除边界与失败降级](../../../../tests/platform/chatgptProjectIndex.test.ts#L1) 5/5；代码打开 SQLite 为 readOnly 并关闭连接，无写入。真实 catalog 内容、真实项目卡片及宿主验收未运行；GPT 状态正常反馈不替代这些 gate。

集成边界：入口 guarded loader、扫描补入、turn/started 增量补入、项目卡片追加及发布模块清单；无数据库迁移、配置修改或远端服务写入。
