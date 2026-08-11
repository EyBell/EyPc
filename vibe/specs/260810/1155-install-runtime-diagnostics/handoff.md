# RAW-160 Companion V4 Host Handoff

Status: `artifact-ready / real-utools-acceptance-pending`

## 安装边界

1. 仅安装最终构建生成的同一份 `dist/plugin.json`，记录四端 Runtime Identity。
   当前产物：`host-495d79c14c1cbb24794d / renderer-568dfd47041bcb997f6b`。
2. 不清空 EyPc 本地任务组织数据；需验证旧 hidden Plan 的一次幂等迁移。
3. 用只读诊断按 session/operation/哈希 taskRef 核验；不得记录或粘贴 Plan 正文、原始任务 ID/路径或执行提示。

## 状态、窗口与循环矩阵

1. 新建 Plan 会话：Plan 尚未生成时保持进行中；生成完成且实施确认未决时变为待输入。
2. 继续修改已生成 Plan：运行期间保持进行中及同一 Plan 生命周期；新 Plan 替换时 revision 更新。
3. 未执行便中断：完成定向复核后稳定待继续；把活动时间移出动态窗口后仍在待继续分组。
4. 普通 interrupted：复核期间保持稳定态/核验中，不得抢在真实 active 前显示待继续。
5. waiting Plan 超出动态小时窗口：展开列表可不显示，但待输入角标和通用 Plan 循环仍能打开；普通问题/审批优先。
6. 检查上一个/下一个：普通 attention → Plan → active → local pin，且与同 revision 角标一致。

## 暂停与界面矩阵

1. 对 Plan-ready 点击“暂”，确认它从动态、角标和所有循环候选消失，并进入已隐藏页顶部“已暂停”。
2. 依次验证 Float/mainHide、Renderer 重挂、refollow 和完整 uTools 重启后仍暂停。
3. 点击“恢”恢复；对 paused Plan 发起 exact default 执行 Turn，确认 paused 与 planReady 自动清除。
4. 检查普通 `顶/隐/归/+`、Plan `顶/暂/归/执`、paused Plan `顶/恢/归/执`，以及抽屉新会话、批量暂停/恢复、键盘焦点和 ARIA。

## Publication 与 Float ACK

1. 对同一状态执行重复 watcher/inventory/refollow，确认 package revision、publishedAt、角标、导航游标和 Execute 确认不变化。
2. 观察 Float 正常 received→applied ACK；模拟首个 applied ACK 丢失时仅重发最新包一次。
3. 心跳健康且累计 1 秒未 applied 才允许受控重建；同 revision 不重复 Vue 投影。

## Claude 矩阵

1. 让一个 Claude 任务从 running 正常终止，确认新 phase 不被旧 inventory cache 覆盖，卡片/角标与循环同 revision 收敛。
2. 已有授权的 D′ 结果只检查提示文案：“EyPc 已归档并移除。Claude 原生侧栏同步未确认，当前不受支持。”
3. 不把 Claude 侧栏自行刷新视为 EyPc 能力；不执行 AX/JXA、重启或 UI 自动化。

## 单独授权动作

- 真实“执”会打开原 Codex 任务并启动一个 default-mode Turn。必须由用户另行指定一个可安全执行的 Plan 并明确授权；然后核验首击零 RPC、二击一次 resume/start、模型/effort 保留和无盲重发。
- 真实 Claude D′ 归档会写目标本地元数据。除非用户再次明确指定目标并授权，否则不重复执行。

## 完成条件

只有 [verification](verify.md#L1) 的最终自动化/构建证据与以上矩阵来自同一源码、同一安装包，才可从 `installed-host-pending` 变为完成。
