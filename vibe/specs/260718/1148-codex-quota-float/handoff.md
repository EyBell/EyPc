# Codex 任务状态交接

Tool: codex
Date: 2026-07-30
State: `implemented-unverified`

## 当前结论

- 完成证据通过后立即从进行中移出，同时清除 active-exit baseline；后续相同完整快照不再反弹。
- 实时增量与完整快照现共用同一个 active-exit 转换器；恢复运行前遗留的相同 interrupted/failed 只能保持 ongoing，不会在 inventory 重建时误入 stopped。
- 非 active 任务首次观测或收到晚到的 Codex 原生 unread=true 时会唤醒一次有界 latest-Turn 复核；相同 true 的后续轮询不重启。若最新 Turn 已完成，完成和未读在同一路径收敛，无需切换任务。
- 无 waiting flag、无精确 `turn-started` 的可疑 active 收到 unread=true 时也只做 `verifyStaleActive` 取证；unread 不直接改变状态。
- 精确或 snapshot 佐证的同 revision completed 不再要求 `completedAt`；confirmed provenance 会保留在会话期 inventory，后续只读快照不会丢失。
- latest-Turn single-flight 在 active/exit/佐证模式变化时由新模式接管；缺失 Turn outcome 即使 idle/not-running 也保持 ongoing，stopped 只接受明确 failed/interrupted。
- Activity Delta 每次发布递增 generation，完整 snapshot 带同一序列屏障；full inventory 保留精确 inProgress 与 confirmed terminal provenance，严格旧增量不能反压。
- mixed-key delta 的已知任务即时应用；missing-key 清单只隔离缺失行，同批现存任务的完成/未读不再被整批冻结。
- 重复相同 active snapshot 复用一个 `[0,300,1000]` 周期；首次/新到达 unread=true 可启动一次，只有任务切换歧义、Activity/映射或模式变化才替换兼容周期。
- Codex 原生 read-state 是唯一未读权威；完成未读角标/全局命令只打开第一条，旧 EyPc completion acknowledgement 不再参与投影。
- Activity 来源已区分 connector、initial snapshot 与真实 patch；Turn 来源已区分 inventory、exact、targeted 和 corroborated。active-exit 转换器自身在 delta/full snapshot 两条入口识别 confirmed provenance，同 revision 完成不再因入口差异回到 ongoing。
- 真实 activity patch 可以在旧 completed 元数据仍存在时立即开始新 active 周期；同轮精确 completed 仍立即完成。
- 任务状态语义是 `task-state-v3`；v2/旧 preload 仅标记 degraded，不清空任务。
- `completionPresentationDelayMs` 已从当前设置类型、默认值和规范化输出移除；展示层无独立延迟。
- 新会话 `quota-auto` 已按 RAW-046 收敛：任一实际返回的普通 5 小时/周窗口为 0 都切换最高可用 Spark；缺失窗口不等于 0，普通池读数优先正值 5 小时。
- RAW-071 的旧配色格式/对比度/配对色域/暂态预览/回滚路径已从现行 Runtime 撤掉；测试、PRD、架构、Soul 和错误记忆统一为独立 token 直存直渲。
- MQTT 响应式与 Quick Jump Escape 静态合同已限制在对应 media/function 边界，等价换行或后续无关函数不再制造假失败。
- RAW-130 给真实 Desktop activity patch 与精确 App Server active/Turn-started 分配同一进程内 evidence sequence。旧 idle activity-event 即使因 read-state-only、Side Chat 或 inventory 重放再次经过发布器，也不能撤销更晚的 `app-server-live`；只有真正后到的 Desktop 非 active patch，或精确 terminal/App Server non-active，才能关闭该水位。
- RAW-131 已完成 stale-active reader positive-epoch 屏障、synthetic idle 去除、任意 exact active patch（含 active→active waiting）开新 epoch、missing-row mapping/verified-archive 清理、Side Chat 初始与最终 active-exit 子 Turn/重放、整份 delta + full snapshot generation race 与 stopped archive 七项实现，并补入闭合矩阵合同；当前仍须执行合同和真实宿主验收，不能仅凭静态实现宣称 accepted。
- RAW-132 在不放宽上述七项门禁的前提下，把 main/Side Chat 父任务聚合收敛为纯解析器；单个 child 的 terminal 读回在其它分支仍 exact active 时只延后该分支并保持父任务 `active/inProgress`。五项会话期匿名裁决计数通过同一 generation 屏障进入设置页“状态裁决”，不含任务身份或内容；Domain/Bridge/Controller 反向合同已写但未执行。
- RAW-133 把诊断 key、规范化和相等判断收敛到 Domain，Controller 在既有 source/generation 屏障后接纳整包且 diagnostics-only 变化只通知一次。运行页常驻值压缩为“保护合计 · 周期”，明细只在原生帮助按钮 hover/focus 时展示，内部计数不进入 `aria-live`；同页旧 `span role=button` 已统一清理。父聚合表直接执行生产纯解析器，避免测试复制状态算法；合同未执行。

## 验证

详细命令、七项修复、闭合矩阵与 RAW-132/133 回归安全合同见 [verify.md](verify.md#L1)。静态检查已通过空白、双 preload 全文件镜像、诊断 schema 唯一性、伪按钮残留和文档链接审计；2026-07-31 修复异步 release 夹具 TS2349 后，`pnpm run typecheck` 通过。状态链专项 `115 / 115`、状态矩阵 `168 / 168`、完整 Codex 文件组 `189 / 189`、完整仓库 `633 / 633` 仅是 RAW-129 的历史基线；RAW-131–133 新增或改写的状态矩阵、父聚合、匿名诊断、变更通知与可访问性合同仍未执行。当前最终状态为 `implemented / 运行验收未完成`。

## 真实宿主验收

闭合矩阵执行和代码合同通过前，以下宿主步骤仅作后续验收清单，不构成当前接纳：

1. 正常重载 uTools 插件，确认运行中 preload 与 Renderer 同为 v3。
2. 验收普通 active→completed-unread，卡片、角标和归档能力同批更新。
3. 验收 interrupted/failed 后恢复运行再 completed-unread，不得经过 stopped，也不依赖任务切换。
4. 在 completed、stopped 和 active 任务间切换，未选中任务的状态不得改变。
5. 让一条曾 interrupted 的后台任务恢复运行，触发其它任务切换/未读变化和两轮清单刷新，确认它始终保持进行中；随后真实停止，确认后到 idle 才进入已停止。
