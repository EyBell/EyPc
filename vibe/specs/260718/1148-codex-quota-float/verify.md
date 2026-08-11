# Codex 任务状态验证记录

Tool: codex
Date: 2026-08-10

## Review Target

- Requirement: [RAW-116–155](raw-requirement.md#L1)
- Plan: [plan.md](plan.md#L1)
- Implementation: RAW-150 保留内部 `stopped` 并显示“待继续”；RAW-151/153 将双向 waiting edge 与 waiting-clear 因果屏障收敛到 v8；RAW-152 以 `companion-navigation-v1` 提升通用打开队列；RAW-154 新增 `companion-task-actions-v1`、单一 Controller mutation reducer、Claude D′ 唯一目标静默归档与 membership delta，并以精确 interrupted terminal watermark 升级 `task-state-v9`。
- Sidecar: 主线程。

## Checked

下表保留 RAW-129 历史基线和 RAW-130–153 当时的增量记录；当前执行结果以文末 RAW-154 与 Full Matrix Findings 为准，历史“未执行”、旧计数、Deep Link+AX Claude 归档和 v8 当前版本结论不再冒充最新状态。

| 验证 | 结果 |
| --- | --- |
| Bridge 完整文件 | `51 / 51` pass；覆盖同 revision 无 completedAt 精确/佐证完成、stale-active unread 核验、冷启动 unread 一次性唤醒、inventory 证据保留、重复快照周期复用、新证据重启和旧 completed 退出拒绝 |
| Controller 完整文件 | `38 / 38` pass；覆盖 delta/full snapshot 统一 active-exit、confirmed provenance 入口一致、generation 屏障、mixed-key 已知条目和 missing-key 行级隔离 |
| 状态链专项 | `115 / 115` pass，`3 / 3` 文件通过；覆盖 Domain、Preload Bridge 与 Controller 的全部 RAW-128 回归 |
| Codex 状态矩阵 | `168 / 168` pass，`6 / 6` 文件通过；覆盖 Domain、Presentation、Bridge、Platform、Controller 与 Renderer |
| Codex 完整文件组 | `189 / 189` pass，`9 / 9` 文件通过；外观、模型、环境、Float 与状态链无残留失败 |
| 残留矩阵专项 | `61 / 61` pass，`5 / 5` 文件通过；覆盖直存直渲外观、任一普通窗口归零切 Spark、Controller 无暂态配色覆盖、MQTT media 边界与 Quick Jump 函数边界 |
| TypeScript | `pnpm run typecheck` pass |
| 正式构建 | `pnpm run build` pass；含 Vite build、uTools runtime preparation 与 `validate:utools` |
| Preload | RAW-129 基线两份 `node --check` pass；RAW-130–132 仅有各自静态镜像记录；RAW-133 当前确认 canonical/public preload 全文件字节一致、`git diff --check` pass。自 RAW-130 起未重新执行 `node --check` |
| 文档引用 | changed Markdown 全量 `audit_code_links.py` pass；`Code link audit: OK` |
| 完整仓库 | `633 / 633` pass，`53 / 53` 文件通过；无“既有/已知失败”留存 |
| RAW-130 增量 | 实现与 Bridge 回归合同已写；链接审计和上述静态边界检查通过。依项目门禁未执行测试、typecheck、build、preload 语法或真实 uTools 验收 |
| RAW-131 全链复核与实现 | 已静态枚举 Preload Activity/Turn/read-state/Side Chat/inventory/bridge-state 写入与撤销点、Controller delta/full-snapshot 仲裁、Domain 分组/计数/归档能力及 Renderer 消费；7 个 P1 实现与合同已写，未执行 |
| RAW-132 回归安全优化 | 父任务聚合纯函数、Side Chat 分支终态延后、五项匿名裁决计数与 Domain/Bridge/Controller 反向合同已写；未执行测试、typecheck、build、preload 语法或真实宿主 |
| RAW-132 静态收口 | `git diff --check` pass；canonical/public Codex 段与顶层计数定义分别精确一致；changed Markdown `audit_code_links.py` pass；诊断公开形状仅含五个数值字段，Bridge 合同已写 child raw ID 泄漏的负向断言但未执行 |
| RAW-133 统一诊断投影 | Domain 单一 key/规范化/比较；Controller generation 后整包接纳与 diagnostics-only 单通知；Runtime 紧凑摘要、focus 明细、live-region 隔离及全页原生帮助按钮已写 |
| RAW-133 合同状态 | 生产父解析器完整优先级表、malformed 诊断规范化、变化单通知、相同/旧代次零通知与 UI 源码合同已写；依项目规则未执行测试、typecheck、build、preload 语法或真实宿主 |
| RAW-134 可配置动态窗口 | `dynamicTaskWindowHours` 默认 24、1–8760 规范化、Domain 可配置分组/边界、Controller 设置即时重投影和任务页输入已写；帮助、PRD、架构与任务文档已同步 |
| RAW-134 合同状态 | 复用现有 Domain/Controller/UI 测试文件补默认/边界、12/36 小时筛选、24→48→24 即时重投影及配置源码合同；依项目规则未执行测试、typecheck、build、截图或真实宿主 |
| RAW-134 静态收口 | `git diff --check` pass；`dynamicTaskWindowHours` 的类型/默认/规范化、Domain 消费、Controller 发布/设置重投影和 UI 读写入口均有唯一直接命中；changed Markdown `audit_code_links.py` 返回 `Code link audit: OK` |
| RAW-135 秒级刷新配置 | `quotaRefreshSeconds` 默认 300、旧 `quotaRefreshMinutes × 60` 迁移、额度/完整校对均规范化到整数 `0–86400`；运行/任务页改为数字秒输入，0 明示仅手动；Controller 2 秒额度与 3 秒库存两条调度互不等待 |
| RAW-135 完成事件快路 | 已知 main/Side Chat 的无 Turn 载荷 `turn/completed` 不再走 stale-active → full inventory；改为 completion-event 单飞，立即 + `25/75/150/300/600/1000ms` 读取，更新 positive epoch 取消，非 completed/失败/耗尽才 urgent 回退 |
| RAW-135 相关回归 | Bridge 全文件 `58 / 58`、Domain/Controller/UI `107 / 107`，四文件组合 `165 / 165` pass。新 Bridge 合同证明首次最新 Turn 仍 inProgress 时，25ms 第二读确认 completed，期间 `thread/list` 零新增 |
| RAW-135 自动门禁 | 双 preload 已由 `pnpm run sync:preloads` 同步且全文件一致，canonical/public `node --check` pass；`pnpm run typecheck` pass；`pnpm run build` pass，含再次 typecheck、production Vite build、uTools runtime preparation 与 `validate:utools`。真实 uTools 中完成事件体感时延仍未执行 |
| RAW-135 文档门禁 | raw/Spec/Plan/Tasks/Verify/Handoff、帮助、PRD、项目状态、架构、技术细节与错误记忆已同步；changed Markdown `audit_code_links.py` 返回 `Code link audit: OK` |
| RAW-136 相关回归 | Bridge/Domain/Controller/平台四文件 `151 / 151` pass；覆盖 Plan-only 精确标记/清除/隐私、父分支混合等待、Domain 卡片、read-state-only 保留和普通等待→Plan→recent active 独占循环 |
| RAW-136 自动门禁 | `pnpm run verify` 同步 canonical/public preload 后通过完整 Vitest `697 / 697`（`57 / 57` 文件）、`vue-tsc --noEmit`、production Vite build、uTools runtime preparation 与 `validate:utools`；真实快捷键顺序仍为 host-pending |
| RAW-136 文档门禁 | raw/Spec/Plan/Tasks/Verify/Handoff、帮助、PRD、项目状态、架构、技术细节与 Developer Soul 已同步；changed Markdown `audit_code_links.py` 返回 `Code link audit: OK` |
| RAW-137 聚焦状态链 | Bridge `62 / 62`、Controller `44 / 44`，合计 `106 / 106` pass；覆盖 snapshot true + persisted false、反向 true、精确事件覆盖、原生不可用回退既有合同、main/Side 聚合、IPC refollow 的 active/completed/input/approval/Plan、新 Turn、桥关闭重开与 App Server-only 库存重建下的已知/未知 Side Chat、feature/inbox 旧异步隔离、关闭期间库存增删/项目离库/保留任务归属与原生置顶变化，以及 `taskRefreshSeconds=0` 缺行闭合 |
| RAW-137 完整仓库 | 最终 `pnpm run verify` 成功：同步 canonical/public preload，完整 Vitest `704 / 704`（`57 / 57` 文件），随后 `vue-tsc --noEmit`、production Vite build、uTools runtime preparation 与 `validate:utools` 全部通过。首次尝试因外层 120 秒上限在 Vitest 期间被终止、无断言失败；补充 inbox 合同后的下一次尝试先通过 `704/704`，再由 typecheck 捕获测试误向零参数公开 `refresh()` 传参，修正后聚焦测试/typecheck 与最终统一门禁均通过 |
| RAW-137 构建与宿主包 | `pnpm run typecheck` pass；`pnpm run build` pass，含再次 typecheck、production Vite build、uTools runtime preparation 与 `validate:utools`；`pnpm run sync:preloads` 后 canonical/public 三类 preload 镜像一致 |
| RAW-137 文档与真实宿主 | raw/Spec/Plan/Tasks/Verify/Handoff、项目状态、架构、既有 unread 与会话状态机错误记忆已同步；真实 uTools/Codex 关闭—读取/完成/等待/归档/删除/项目变化—重开矩阵未执行，保持 host-pending |
| RAW-138 当前宿主只读证据 | 当前 uTools 运行包含 RAW-137 标记且 canonical/public/dist 资产一致；当前 IPC owner 的 Codex 扩展为 revisioned stream/read v11/v2，字段含本地 host。宿主日志中的精确 read-state 广播早于最新插件进程启动，而之后的原生 unread 集合仍保留旧 true；结合用户提供的 Codex 已读界面，确认缺口为“断开期 event 不重放 + persisted true 反压 refollow false”，不是旧包或当前协议不匹配。未记录 raw ID、标题、路径或内容 |
| RAW-138 Bridge/Controller 聚焦回归 | Bridge `67 / 67`、Controller `49 / 49`，组合 `116 / 116` pass；新增覆盖 refollow snapshot false + persisted true、snapshot true + persisted false 保持、v1/v2 exact event、v6/v11 stream、main/Side 聚合、成功打开/打开失败、Desktop IPC 不可用时的 open 确认及新 completion 清理旧 false |
| RAW-138 完整仓库 | `pnpm run verify` 成功：同步 canonical/public preload，完整 Vitest `722 / 722`（`57 / 57` 文件），随后 `vue-tsc --noEmit`、production Vite build、uTools runtime preparation 与 `validate:utools` 全部通过；耗时 131.6 秒，无断言/类型/构建失败，仅保留 Node SQLite experimental warning |
| RAW-138 镜像与宿主门禁 | canonical/public preload SHA-256 一致且 `node --check` 通过，正式构建已生成 dist 并由 uTools runtime validation 接纳；没有安装/重载新包、点击真实任务或写 Codex 原生状态，因此新代码的真实卡片打开与关闭期已读恢复仍为 host-pending |
| RAW-139 真实宿主版本与点击证据 | 当前机器缓存多个 EyPc ASAR；悬浮窗初始实际 URL 对应 1.2.6，激活插件后切到 1.2.33，后者的 main/public/dist preload 哈希与源码一致并含 RAW-138 open acknowledgement。正确实例点击第一条完成未读卡片后，Codex 日志确认打开预期 task route，插件计数 2→1；Codex 原生 unread 集合仍为 true，符合“不写原生状态”的显式边界。证据只记录版本/哈希/计数与路由结论，不写 task ID、标题、路径或内容 |
| RAW-139 聚焦回归 | `tests/integration/appPluginEnter.test.ts`、`featureRouting.test.ts`、`tests/runtime/codexController.test.ts`、`tests/platform/codexAppServerBridge.test.ts`、`codexActionRuntime.test.ts` 合计 `141 / 141` pass；覆盖 mainHide 无二次 hide/show、当前 Tab 保留、冷库存 completed-unread/input/前后任务 preflight、同 key alias 恢复、过期 alias 一次刷新重试，以及成功打开已读/插件隐藏生命周期合同 |
| RAW-139 TypeScript | `pnpm run typecheck` pass |
| RAW-139 完整仓库 | `pnpm run verify` 成功：同步 canonical/public 三类 preload，完整 Vitest `730 / 730`（`57 / 57` 文件），随后 `vue-tsc --noEmit`、production Vite build、runtime preparation 与 `validate:utools` 全部通过；耗时 136.1 秒，仅有 Node SQLite experimental warning |
| RAW-139 静态收口 | `git diff --check` pass；main/float/action 的 canonical/public/dist preload 各组三份 SHA-256 一致，三份 canonical `node --check` pass；项目本轮更新 Markdown 与 CodeNote 四份 uTools 权威/错误记忆文档分别执行 `audit_code_links.py`，均返回 `Code link audit: OK` |
| RAW-139 宿主门禁 | 源码修复后的包尚未安装/重载；真实全局快捷键冷启动、跨显隐旧卡片 alias 重建和中断期 App 已读恢复保持 host-pending。当前真实点击仅接纳 RAW-138 在正确 1.2.33 preload 中的行为，不冒充 RAW-139 新 route/preflight 验收 |
| RAW-140 失败复现 | 新增快捷键成功打开后的 IPC reset/refollow 时序断言；修复前稳定收到 `desktop-live=false → desktop-persisted=true`，直接证明确认被 Bridge reset 清除，而非 Renderer 延迟或点击失败 |
| RAW-140 生命周期修复 | 成功打开确认提升为 preload 进程内最多 1000 条 completion-epoch 提示；普通 mainHide close/rebuild、IPC reset、resubscribe 与 refollow 保留，同 completion 晚到证据不反压；该条当时的 revision 释放语义已由 RAW-144 收紧为具体 Turn 身份 |
| RAW-140 聚焦回归 | `codexAppServerBridge.test.ts` 全文件 `70/70`；App route/Controller/Bridge/Action 五文件 `144/144`；覆盖断桥前不可用、IPC reset、mainHide 关闭并重建、同 completion 晚到证据与新 Turn 释放 |
| RAW-140 TypeScript | `pnpm run typecheck` pass；仅有 Node SQLite experimental warning |
| RAW-140 完整仓库 | 最终 `pnpm run verify` pass：同步 canonical/public/dist preload，完整 Vitest `733/733`（`57/57` 文件），随后 `vue-tsc --noEmit`、production Vite build、runtime preparation 与 `validate:utools` 全部通过；耗时 134.5 秒，仅有 Node SQLite experimental warning |
| RAW-140 静态收口 | main preload canonical/public/dist SHA-256 均为 `332d0845327b616e10b22ba3fb1796f55feb665c47e67782eab4b3612642d0c2`；float/action 三份镜像也各自一致，三份 canonical `node --check` pass。项目本轮 changed Markdown 与 CodeNote `mainHide/onPluginOut` 两份权威/错误记忆显式链接审计均为 `Code link audit: OK`；两个仓库 `git diff --check` pass |
| RAW-140 提交边界 | 从 Git index 写出独立 detached 临时 worktree，排除未暂存的 Action Runner / Window Jump 改动后，Codex 相关 7 文件 `212/212` pass 且 `vue-tsc --noEmit` pass；暂存的 main/public preload SHA-256 同为 `42fce409f21b519ecd3854774e91acd7ee14fe69318f179b5db159d409a5b3a1` |
| RAW-140 宿主门禁 | 新构建尚未安装/重载；真实完成未读全局快捷键成功打开后跨 mainHide/轮询持续已读、随后新 Turn 再次未读仍为 host-pending |
| RAW-141 真实根因 | 当前原生 `Needs input` 任务的 stream owner 已消失；新 follower 只获 `following=true` 而无 snapshot，App Server 库存为 `notLoaded`、latest Turn 为 `interrupted` 且完整 Turn view 不含 pending request。rollout 尾部存在唯一未匹配 `request_user_input`，与当前 25 条未归档库存中的唯一原生待输入一一对应；证据记录未保留 task ID、路径、call ID、prompt 或答案 |
| RAW-141 持久回退 | 只对 interrupted/failed/inProgress、只在 `CODEX_HOME/sessions` realpath 内、只读最多 4 MiB 尾部；仅匹配精确 `request_user_input` call/output 与后续 user-message 边界。纯解析与完整库存投影合同覆盖未决、已回答、用户继续和其它 function call，公开 snapshot 不含 call ID |
| RAW-141 owner 连续性 | owner disconnect/bridge reset 保留已观察普通输入、审批和 Plan sticky shadow，普通 active 降回 connector；新 Desktop snapshot、精确 App Server new Turn/completion 和较新库存 revision 清除。普通 pluginOut 保留 Desktop observer 并在库存重建后恢复公开状态，kill 完全关闭 |
| RAW-141 聚焦回归 | Bridge/Controller/Domain/Presentation 四文件 `170/170` pass；`node --check preload/index.js` pass；`pnpm run typecheck` pass。完整仓库结果在最终收口行记录 |
| RAW-141 当前真实投影 | 修复后同一真实任务由 `notLoaded + interrupted + connector` 恢复为 `active + waitingOnUserInput + connector`；更新后的只读预检返回 `active=1`、`unconfirmedOngoing=1`，与 Codex 原生状态一致。该证据验证源码读取路径，不冒充已安装 uTools 新构建验收 |
| RAW-141 完整仓库 | `pnpm run verify` pass：同步 canonical/public preload，完整 Vitest `737/737`（`57/57` 文件）、`vue-tsc --noEmit`、production Vite build、runtime preparation 与 `validate:utools` 全部通过；耗时 137.6 秒，仅有 Node SQLite experimental warning |
| RAW-141 提交边界 | 从 Git index 导出独立目录，排除 Action Runner、窗口、样式和其它未暂存修改；该提交自身完整 Vitest `711/711`（`54/54` 文件）、`vue-tsc --noEmit`、production build、runtime preparation 与 uTools validation 全部通过，耗时 144.4 秒。暂存 main/public preload 字节一致且 `node --check` pass |
| RAW-141 宿主门禁 | 当前只读源码查询已验证 ownerless input 恢复；新构建尚未安装/重载，真实普通输入、Plan 实施确认和该长期 Needs input 在卡片/角标/前后快捷键中的连续展示与解除仍为 host-pending |
| RAW-142 Plan 证据与优先级 | rollout 纯解析合同证明最新 Turn 的精确 `item_completed + Plan` 建立待实现，后续 `task_started` 清除；完整库存与实时 item/completion 均只发布匿名 `active + waitingOnUserInput + planImplementationOnly`。Domain 证明即使 unread=true、latest Turn completed，仍进入 inputRequired 而不进入 completed-unread；普通 connector waiting 保持原边界 |
| RAW-142 未读稳定性 | 原生 unread 成功解析为 false 后，模拟 atom 状态瞬时不可用、完整库存对象替换及 IPC refollow snapshot=true；最终状态保持 `desktop-persisted=false`，收集到的全部增量不存在同 key 的 `hasUnreadTurn=true` 错误中间帧 |
| RAW-142 聚焦回归 | `pnpm exec vitest run tests/domain/codex.test.ts tests/platform/codexAppServerBridge.test.ts`：`114/114` pass；Controller 仅运行“waiting-input activity”与“completed persisted Plan”两个相关合同：`2/2` pass、其余 51 skipped |
| RAW-142 静态门禁 | `node --check preload/index.js`、`pnpm run typecheck` pass；`preload/index.js` 与 `public/preload.js` 字节一致；两份 main preload 的 `sendSync/sendSyncV2/ipcRenderer.sendSync` 搜索为空 |
| RAW-142 范围约束 | 遵循用户要求未执行完整 `pnpm run verify`、完整 Vitest、production build 或真实 uTools 操作；未将历史 RAW-141 全量结果冒充本轮结果。真实 completed Plan 展示、新 Turn 解除和完成未读无闪跳保持 host-pending |
| RAW-143 根因量化 | 当前原生状态约 1.29 MiB、16 项目、217 条归属；近似 parse/sort/fingerprint 平均约 2.5ms。当前 sessions 文件数 112 仅作库存规模代理；阻塞调用链明确为普通 hide 清缓存后 App Server cold start、完整 `thread/list` 和每任务 `thread/turns/list(limit=1)`，不是项目 Map/排序 |
| RAW-143 热缓存合同 | 非 kill pluginOut 后 App Server 未收到 stdin end、spawn 仍为一次，旧 task alias 可直接 Deep Link，打开过程新增 `thread/list/thread/turns/list` 为 0；kill 分支仍关闭 App Server 与 Desktop observer |
| RAW-143 单飞与 Runner 合同 | 两个并发 expired task alias 只增加一次 tasks snapshot，均按同 key 新 alias 打开；Action 槽首次冷读一次，执行前/后 catalog 刷新及随后 Runner 热打开均保持 task snapshot 总数为 1 |
| RAW-143 聚焦门禁 | `codexController`、`codexAppServerBridge`、`codexActionRuntime`、`codexActionRunnerBridge` 四文件 `149/149` pass；`pnpm run typecheck`、`node --check preload/index.js`、canonical/public main preload 字节一致及 `git diff --check` pass。未运行完整 verify/build 或真实 uTools |
| RAW-144 缓存生命周期 | Controller 离开 Codex Tab 后不 close、不清库存，off-tab Activity Delta 仍把任务即时更新为 waiting-input；额度/config 继续由页面/Float 门控。Runner 冷加载后热打开零 catalog 重读，库存新增项目与 alias 变化只加载新增/变化项目 |
| RAW-144 已读复现闭环 | Electron 与 uTools fallback 成功打开均发布匿名已读；确认只在已有具体 Turn 时进入进程级 map，并携带不公开的 Turn ID。同一 Turn `completedAt` 向后补全仍保持已读，新 Turn 释放；Controller 拒绝较旧 completed-unread full snapshot 覆盖较新 opened-read delta |
| RAW-144 Review Implementation | 全部未提交代码/测试/过程文档按 Action Runner、Codex 状态、生命周期/路由、生成镜像四组复核；修复 P1：UI 门禁导致缓存 teardown、Runner 全项目重复读取、uTools fallback 漏确认、无 Turn 确认长期粘住及同 Turn 时间补全误释放；修复 P2：任务收件箱关闭后每秒空刷新/Activity polling。未发现剩余 P0/P1；真实宿主时延与 fallback 行为仍为外部验收项 |
| RAW-144 聚焦门禁 | 15 个直接受影响测试文件 `301/301` pass；`pnpm run typecheck`、三类 canonical preload `node --check`、canonical/public 三类 preload 字节一致、`pnpm exec vite build`、runtime preparation、`validate:utools` 与 `git diff --check` pass。未运行完整 Vitest/`pnpm run verify` |
| RAW-145 当前通路失败复现 | 当前本机真实 Codex 只读快照先由 canonical Preload 恢复 `connectorWaitingInput=1`，再执行生产 Domain `projectConversations` 得到 `productWaitingInput=0`；证明 RAW-141 只修到 Bridge，旧预检因复制更宽松 connector-active 判断产生假阳性。owner 存在时请求为 `desktop-live`，owner 丢失后切到 rollout connector 回退，解释“之前正常、现在重复” |
| RAW-145 来源修复 | v5 新增 `persisted-decision`，仅安全未匹配 `request_user_input` 与精确 latest completed Plan 可使用；完整库存/Activity 恢复保留来源，精确 started/active/completed 清理，普通 connector waiting 继续被 Domain 拒绝，v4 Plan-only 保持 degraded 兼容 |
| RAW-145 聚焦回归与构建 | `pnpm exec vitest run tests/platform/codexAppServerBridge.test.ts tests/domain/codex.test.ts tests/runtime/codexController.test.ts tests/platform/eypcPlatform.test.ts` 为 `192/192` pass；`pnpm run typecheck` pass；完整 `pnpm run build` pass，包含再次 typecheck、production Vite build、runtime preparation 与 `validate:utools` |
| RAW-145 当前真实产品投影 | 更新后的预检直接转译并调用生产 Domain，同时要求 preload/domain 均为 `task-state-v5`。首个修复后匿名观测为 `connectorWaitingInput=0 / persistedWaitingInput=1 / liveWaitingInput=0 / productWaitingInput=1`；最终复跑时 Provider 已解除该决定，同一路径为 `0 / 0 / 0 / 0`。两次均 `completeness=verified`、Desktop bridge connected、命令 exit 0，证明建立与解除同向收敛；未读取/记录任务正文、raw identity 或路径 |
| RAW-145 镜像与宿主门禁 | canonical/public/dist main preload 均为 458304 bytes、SHA-256 `ee5b99279dc2429a6bec75ddb5acda3ca3b674b4b57337c7aa031120bc49d423`；当前安装 ASAR 的 preload 仍为修复前 456730-byte 哈希 `67a7c465b188c40da947848d06e1070eedf1d5abc862ab8721e3049630168243`。因此源码到真实 Provider/Domain 已贯通，但 uTools 卡片必须正常重载新构建后验收，不把旧 ASAR 界面当作新代码结果 |
| RAW-145 重载产物与当前服务事实 | `dist/plugin.json` 仍保持本地 preload 并把 development main 指向 `127.0.0.1:8092`；RAW-145 当时三入口曾 HTTP 200，但 RAW-146 核验时该端口已不监听。产物可供后续正常启动/接入，本轮按用户要求不启动服务、不改写缓存、不重载或重启 uTools |
| RAW-146 首条排序与角标合同 | Domain 新增唯一显示排序函数，Controller/Float 共用置顶优先和稳定源顺序；全局待输入不再直接读取 `inputRequired[0]`。反向夹具让较新未置顶任务排在源数组首位、较旧置顶任务排在后位，命令仍精确打开置顶任务。待输入/未读的 hover/focus/ARIA 明确写“打开第一条”，超过 99 的进行中 ARIA 同步新格式 |
| RAW-146 自动门禁 | Controller/UI 聚焦 `90/90`、完整 Vitest `752/752`（`57/57` 文件）、`pnpm run typecheck`、main preload 语法/镜像、`validate:utools`、`git diff --check` 与 changed Markdown 链接审计通过；当前真实 Provider→Domain 预检仍为 `persistedWaitingInput=1 / productWaitingInput=1`。实际 uTools 更新明确排除 |
| 2026-08-07 当前宿主身份复核 | 两个活动 EyPc Renderer 都加载 `task-state-v5`，排除历史“当前安装 ASAR 仍为 v4”的解释；RAW-147 写入后 canonical/public/dist 已同步为新产物，而活动 ASAR 仍是缺少 RAW-147 的旧 v5。`8092` 未监听，最终 owner snapshot 与状态转换必须在正常重载后验收 |
| 2026-08-07 故障复现时的实时状态缺口 | 诊断采样时 Codex 任务接口报告 EyPc 工作区有 2 条 active；两条匿名键均存在于 EyPc 的 25 条库存和 Activity 映射，但都只有 `connector + notLoaded`，`liveEpochOpened=0`，排除库存丢失并确认当时缺的是 Desktop live/request authority。该计数是时点证据，不作为提交时当前态 |
| 2026-08-07 follow 回声实机复现 | EyPc 初始化后确实发送 follow；两个已加载旧实现的 peer follower 各自发送定向 `following=true` 公告，而当前 [no-reply boundary](../../../../preload/index.js#L3519) 所替代的旧分支把公告再次回发。250ms 内计得 32,329 次定向正向回声，2.5s 计得约 368,000 次，期间没有 `thread-stream-state-changed`。当前 Codex 包内实现确认正向消息是发送方 follower 状态，真正要求重报的是 `thread-stream-following-status-requested` |
| RAW-147 协议修复与回归 | 移除正向公告回发；显式 following-status request 仍只定向回复一次。新增 [Bridge 反向合同](../../../../tests/platform/codexAppServerBridge.test.ts#L3163) 先 RED（同线程出站 1→2）后 GREEN；完整 Bridge `81/81` pass。RAW-147 精确变更快照的 `pnpm run build` 内 typecheck、Vite、runtime preparation 与 `validate:utools` 全部通过；随后并发进入的 Claude 改动使当前整树复跑停在未纳入本提交的 fixture `projectKey` 可选性类型错误，未越界修改该独立写集 |
| RAW-147 Preload 与真实预检 | canonical/public/dist main preload 字节一致，三份 `node --check` 与同步 IPC 静态搜索通过。[codex-real-preflight.mjs](../../../../scripts/codex-real-preflight.mjs#L1) 改为缓存式内存 TypeScript 模块加载并从 importer 位置解析相对依赖；提交前 30 天真实 Provider→生产 Domain 投影返回 `ok=true`、`task-state-v5`、`completeness=verified`，最新时点为 `productActive=0 / unconfirmedOngoing=4` |
| RAW-147 有界真实 IPC | 最终 `dist/preload.js` 连接真实 broker 只发送 24 条初始正向 follow；收到两个旧客户端共 48 条正向公告后没有追加出站，证明递归已被交付产物切断。旧 uTools ASAR 尚未重载，因此 `incomingState=0` 只作为宿主仍旧的门禁证据，不冒充 snapshot/active→waiting 验收 |
| RAW-147 文档与错误记忆收口 | task/current/technical 权威层已复核；[stream-follow 主记录](../../../knowledge/error-memory/codex-task-switch-unfollow-must-not-drop-live-shadow.md#L1) 唯一持有回声根因与路线，[pending-request 记录](../../../knowledge/error-memory/codex-pending-user-request-overrides-idle-runtime.md#L1) 通过更新引入只保留检测依赖。索引禁止再建第二份协议回声诊断；并发 Claude 文档与实现写集不进入本提交 |
| 2026-08-07 实现状态 | RAW-147 源码、聚焦回归、精确快照类型/构建、当前三向镜像/runtime、真实预检与有界 IPC 已验证；当前整树 typecheck/build 复跑受并发 Claude fixture 类型漂移阻断。真实 uTools 重载、owner snapshot 与 active→waiting 转换仍为 host-pending。本轮没有启动 8092、没有重载/重启 uTools、没有写 Codex 原生状态 |
| RAW-149 Request/隐私合同 | Bridge 夹具覆盖命令执行、文件修改、permissions approval、普通输入、Plan 与 MCP elicitation 的新增/同时存在/移除，优先请求时间并冻结缺失时间的首次观测；进程随机盐关联只在私有内存区分同方法、无时间请求，原始标识与散列均不跨桥或持久化；Side Chat 取最新未决时间。公开 snapshot/Activity Delta 只含匿名 `waitingSince`，不含请求 ID、正文、命令、路径或权限内容 |
| RAW-149 状态与排序合同 | v6 Domain/Presentation 将 `waiting-input / waiting-approval` 同时归入待输入且审批不重复进入 ongoing；旧任务收到新审批仍按状态时间进入近期动态。Codex/Claude 跨来源以 `statusEnteredAt DESC` 排序，置顶不覆盖；隐藏外部来源仍与完整角标同源 |
| RAW-149 进度合同 | Controller 覆盖 `1→2→3，新 6→6→4→5`、同任务新状态插队、全部访问后回绕、重载恢复、失败不推进、列表手动成功推进和候选暂时不可打开时不误清历史；每组持久化最多 200 个匿名状态实例，普通前后循环与本地置顶兜底不变 |
| RAW-149 聚焦自动化 | `pnpm exec vitest run tests/platform/codexAppServerBridge.test.ts tests/domain/codex.test.ts tests/domain/claudeCode.test.ts tests/domain/companionAggregate.test.ts tests/domain/codexPresentation.test.ts tests/runtime/codexController.test.ts tests/platform/eypcPlatform.test.ts tests/ui/codexCompanion.test.ts --reporter=dot`：`8/8` 文件、`292/292` 测试通过 |
| RAW-149 类型/构建/运行时 | `pnpm run sync:preloads` 后 canonical/public 同步；两份 main preload `node --check` 通过；`pnpm run build` 通过，包含再次 `vue-tsc --noEmit`、production Vite build、runtime preparation 与 `validate:utools` |
| RAW-149 真实只读预检 | [codex-real-preflight.mjs](../../../../scripts/codex-real-preflight.mjs#L1) 对当前真实 Provider 调用生产 Domain 与 Presentation：`ok=true`、`task-state-v6`、Desktop bridge connected、completeness verified；多次复跑均通过待输入/active key 互斥断言，匿名计数随真实任务状态变化，不固化为产品合同。证据只接纳版本、匿名计数和连接结论，不把它冒充实时 permissions approval |
| RAW-149 真机 UI 门禁 | 运行中五份 EyPc uTools ASAR 均只含 v5，没有活动 v6；首次 Computer Use 只读观察即因 Mac 锁屏中断，未绕过锁屏或盲重试，也未启动 8092、重接入插件、修改 Access、批准/拒绝请求或终止进程。脱敏会话见 [RAW-149 uTools 真机验收](../../../knowledge/computer-use/sessions/2026-08-08-raw-149-utools-host.md#L1) |
| RAW-150 待继续与能力合同 | Domain 继续输出 `stopped`，Presentation/Float 统一显示“待继续”，动态顺序为待输入→进行中→待继续→已完成未读→已完成，且无新增顶层 Tab、角标或快捷入口；Renderer 只消费 capability，不复制证据判断 |
| RAW-150 Provider 归档合同 | Codex stopped 写前重读精确任务/latest Turn，恢复运行返回 `state-changed`；Claude 仅在 macOS App `1.26832.0` 下于打开前和聚焦后两次重读 compatible completed/stopped phase，再执行唯一语义动作及日志/`isArchived`/库存三重验证。任务多选按 Provider 分发，项目批量仍只处理 Codex completed；`failed/indeterminate` 保留卡片 |
| RAW-151 双向热通路合同 | Desktop/App Server snapshot、patch 与 status event 进入同一 reducer；revision/owner/载荷缺口只重订目标任务。Ownerless rollout 监听 request call、matching output、用户继续与新 `task_started` 两条边，phase-only 读取不访问 unread、quota、inventory 或全量 latest Turn |
| RAW-151 时延与掉通知合同 | Controller 用同一 monotonic clock 完成 100 轮进行中→待输入→进行中，在 `taskRefreshSeconds=0/86400`、非 Codex Tab、隐藏 Float 与阻塞完整读取下断言 P95≤250ms；分别丢 Activity callback 与 rollout watcher 通知，由 1 秒 watchdog 在 1.25 秒内恢复，无重复发布/分组和完整库存读取 |
| RAW-150/151 宿主门禁修订 | 真实运行宿主后来已升级到 `task-state-v7`，并暴露当前 owner 旧 waiting 在较新 active 后仍滞留/回跳的缺陷；因此 RAW-151 的旧 `host-pending` 结论改为 `host-exposed-defect / rework-by-RAW-153`，不得再引用旧 v5 解释 |
| RAW-153 Bridge 反向合同 | [codexAppServerBridge.test.ts](../../../../tests/platform/codexAppServerBridge.test.ts#L1) 完整文件 `94/94`：当前 owner waiting→较新 Turn started、旧 full snapshot/read-state/refollow 不回跳、新 correlation 重入、匹配 resolved 只清一个并发审批、未匹配 resolved 有界重订、runtime flag removal、Side Chat/Plan、rollout resume 立即清除后复核均通过 |
| RAW-153 受影响矩阵 | Bridge、Domain/Presentation、Controller、Platform、Float/UI 共 `9/9` 文件、`379/379` 测试通过；不改变排序、attention 进度、归档、Provider 聚合或通用导航合同 |
| RAW-153 类型/构建/Preload | `pnpm run typecheck` pass；`pnpm run build` pass，含 1868-module Vite build、runtime preparation 与 `validate:utools`；`pnpm run sync:preloads` 后 canonical/public main preload 字节一致，两份 `node --check` pass，`sendSync|getAllFeatureHotKey` 静态搜索为空 |
| RAW-153 真实 Provider→当前源码预检 | [codex-real-preflight.mjs](../../../../scripts/codex-real-preflight.mjs#L1) 对当前真实 Provider 调用 v8 Preload 与生产 Domain/Presentation，返回 `ok=true`、`task-state-v8`、Desktop bridge connected、completeness verified；当前匿名瞬时投影为 `productWaitingInput=1 / productActive=2`。该结果证明源码数据通路，不冒充运行中 uTools 宿主已加载 v8 |
| RAW-153 真实旧宿主复现 | 当前活动 ASAR 精确读回 `task-state-v7`；真实浮窗匿名计数复现 `waiting=1 / active=4`，而同期 Provider→生产 Domain 为 `waiting=0 / active=5`，证明缺陷是 v7 active-vs-active 因果仲裁，不是 UI 刷新频率。Computer Use 只暴露 EyPc 子浮窗，无法正常进入 uTools Developer Tools；未覆盖缓存、未杀进程、未冒充 v8 验收 |
| 2026-07-31 TypeScript 门禁 | 用户执行 `vue-tsc --noEmit` 暴露反向 generation 屏障夹具的异步 release 回调被收窄为 `never`；改为可调用门闩加独立 pending 信号后，`pnpm run typecheck` 通过。未执行 Vitest、build、preload 语法或真实宿主 |
| RAW-133 静态收口 | `git diff --check` pass；canonical/public preload 全文件精确一致；诊断 key/counter normalizer 在 `src/` 各只有一个定义；CodexPage 无 `span role=button`/手写 tabindex 提示；changed Markdown `audit_code_links.py` pass |
| 设计偏好收口 | `DesignTaskCloseout` 生成 `eligible-for-root-review` 的 W29 canary candidate；`writes_performed=false`，未写偏好缓存、传播状态或 Hook |
| 2026-07-31 自动化收口 | 聚焦回归 `151 / 151`（`4 / 4` 文件）；`pnpm run verify` 依次同步三类 canonical preload 镜像、通过完整 Vitest `697 / 697`（`57 / 57` 文件）、`vue-tsc --noEmit`、production Vite build、uTools runtime preparation 与 `validate:utools` |
| 首轮命令时限诊断 | 首次 `pnpm run verify` 仅因 120 秒命令上限在仍持续通过的慢速 Runtime 文件中被截断，不计为验收结果；确认不是并发泄漏后，以 10 分钟有界命令原样复跑并在 140.2 秒完成全绿 |
| Preload 单一来源 | [scripts/utools-preload-assets.mjs](../../../../scripts/utools-preload-assets.mjs#L1) 统一 main/float/action canonical、public 与 dist 路径；prepare、validate 与测试消费同一清单，[scripts/sync-utools-preloads.mjs](../../../../scripts/sync-utools-preloads.mjs#L1) 只负责显式同步 public 镜像 |
| 非阻断警告 | Node SQLite experimental warning；Vite 主 chunk `599.74 kB` 超过 `500 kB` 提示。两者均未造成类型、测试、构建或 uTools validation 失败 |
| Closeout shell 复核 | 一次含 Markdown 反引号的双引号 `rg` 参数触发 zsh 命令替换；该输出已作废，按 CodeNote [verified error memory](../../../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/memory/error-archive/2026-07-10-zsh-double-quoted-backtick-command-substitution.md#L1) 改为单引号并重跑，未写文件或影响验收证据 |

## RAW-131 闭合状态机审计

### 必须同时成立的不变式

1. 更新的真实 positive epoch 只能被同一或更新 revision 的明确 terminal/non-active 证据结束；read-state、refollow、inventory、targeted read 和 Side Chat 聚合都不能绕过该顺序。
2. `initial-snapshot active` 与 `failed/interrupted` 冲突属于不确定，最多降为 ongoing；只有真实 Desktop idle 或 bridge `not-running` 才能建立 stopped。
3. 任意 exact activity patch 若结果仍 active 就必须开启新 epoch；waiting request 还是 exact live input authority，active→active 也必须高于 completion presentation。
4. missing-row、source fingerprint 和 Activity generation 的 Preload/Controller 边界必须对称；保留旧卡片时也必须保留其可接收正向事件的会话映射。
5. 主任务与 Side Chat 使用同一因果规则；卡片、分组、三个角标和归档能力消费同一稳定结果。

### 修复记录（实现与合同已自动化验证）

| 级别 | 结论 | 原缺口与影响 | RAW-131 实现 | 合同 |
| --- | --- | --- | --- | --- |
| P1 | stale-active reader 不再撤销 newer exact active | unread/任务切换曾可启动旧 reader，并用同 revision terminal 反压新的 active | reader 记录 parent private positive sequence；exact App Server/Activity positive 不进入 stale 模式，异步返回前再次核对水位 | in-flight reader→Turn-started、unread=true、task-switch/refollow 后均保持 active |
| P1 | conflicting active snapshot 不再合成 idle | active+interrupted/failed 曾被 suppression 改成 desktop-live idle 并满足 stopped | suppression 投影为 `notLoaded`；completed 仍由 confirmed evidence 关闭，failed/interrupted 冲突保持 ongoing | 改写旧 synthetic-idle 期望，验证真实新 Turn 可恢复 active |
| P1 | exact active/waiting 高于旧 completion | active→active activity/request patch 曾保留 `turn-completed` | 所有 exact active patch 调用统一 epoch opener；Domain waiting flags 高于 confirmed completion | active→active ordinary activity 与 Plan request 分别覆盖 confirmed completion |
| P1 | missing-row 隔离同时保留匿名映射 | Controller 保留旧卡片时 Preload 曾立即丢失 raw→anonymous mapping | 同 source fingerprint 下保留映射 120 秒，覆盖最长 60 秒 Controller quarantine；verified single/bulk archive 直接清除映射并发 explicit archived key | 已登记→缺行→exact active→连续 inventory 仍通过原匿名 key 发布；显式归档后 activity snapshot 不再含 key |
| P1 | Side Chat 使用 child 因果状态机 | child initial/最终 active-exit 曾读取 parent Turn，side-only shadow 在 inventory 后不重放 | Turn reader 以 parent:child 独立 key 查询 child；最后一个 active child 退出时沿 child query；waiting 开 parent epoch；inventory 后重聚合全部 affected parents | child initial/patch、两 child flags、initial/exit child Turn target、inventory rebuild |
| P1 | Activity generation 屏障双向生效 | 较慢旧 full snapshot 曾可覆盖先到的新 delta并下调 generation；旧 delta 仍可先改 bridge state | 同源旧 delta 在任何字段前拒绝；live waterline 后的低代次或缺代次 V2 full snapshot 在提交前拒绝，水位只允许 `max` 前进 | full gen5→delta4 拒绝；delta6→delta5/not-running 拒绝；delta3→full gen2/无代次拒绝 |
| P1 | 历史 stopped 禁止归档（RAW-150 已取代） | RAW-131 当时发现 Domain/Controller/Host 允许 stopped evidence 与当时 canonical 冲突 | 当时收敛为 `blocked-stopped`；RAW-150 保留该状态证据判定，但将当前任务级能力改为 allowed，并要求 Host 写前重读，恢复运行返回 `state-changed` | 历史反向合同保留；当前 Domain、Controller、Codex Host、Claude adapter 与 UI 合同另见 RAW-150 行 |

### 闭合合同矩阵

| 轴 | 历史覆盖 | RAW-131 新增合同（未执行） |
| --- | --- | --- |
| Positive 来源 | main Desktop initial/patch、App Server active/started | exact active + unread=true + stale terminal；active→active request；Side Chat initial/patch；multiple child |
| 重放入口 | unread=false、refollow、连续 inventory | unread=true targeted read、owner disconnect/reset、known-row dropout、side-only inventory rebuild |
| 异步顺序 | old delta after full snapshot | new delta before old full snapshot；reader started before/after positive epoch |
| 终态 | completed、interrupted、failed 的若干单例 | conflicting interrupted/failed 不得合成 idle；same-revision stale terminal after exact active |
| 最终消费 | 部分 Bridge/Controller/Domain 单层断言 | 同一序列的 authority、bucket、compact count、archive capability 端到端断言 |

实现结论：此前通过数量是示例合同的通过，不是状态空间闭合证明；RAW-131 改写 synthetic idle 并补齐其它因果缺口，其当时的 stopped archive block 已由 RAW-150 的任务级 capability + Host 写前复核取代。状态闭合合同继续有效；真实 v7 宿主仍未 accepted。

## RAW-132 回归安全复核

### 保留的旧错误门禁

1. stale-active reader 在发起和异步返回两端都核对 positive sequence；新 activity epoch 后的旧 terminal 不得落库。
2. conflicting initial active + failed/interrupted 只能 suppression 到 unavailable/ongoing，禁止恢复 synthetic idle/stopped。
3. active→active ordinary/waiting patch 继续开启新 epoch；waiting 继续高于旧 completion。
4. missing-row anonymous mapping 继续按同 fingerprint 保留，显式 archive 继续立即删除；Controller missing-key quarantine 未放宽。
5. 同源 generation 继续同时保护 task fields、Desktop bridge state 与新增诊断计数；低代次 delta 和低代次/无代次 V2 full snapshot 均不得回退。
6. 更新引入（RAW-150）：stopped 状态识别继续使用 RAW-131 的闭合因果边界，但 Presentation 显示“待继续”且任务级 capability 为 allowed；Codex/Claude mutation 必须通过各自写前复核，项目批量仍只允许 Codex completed。

### 新增优化合同（已自动化验证）

| 关注点 | 实现 | 反向失败条件 |
| --- | --- | --- |
| 父任务聚合 | `codexResolveParentActivity` 统一 main/child/waiting/error/App Server live 优先级 | 任一发布路径另算一次优先级或让 terminal 覆盖剩余 active branch 即失败 |
| Side Chat 终态 | child terminal 发现其它 branch 仍 active 时重开父 live epoch并延后该分支结果 | 父卡片变 stopped/completed、`lastTurnStatus` 不再 inProgress 即失败 |
| 匿名诊断 | 仅输出五个非负累计计数，Controller 在 generation 门禁后接纳，设置页只显示计数 | 出现 task key/raw ID/content，或 generation 5 覆盖 generation 6 即失败 |
| Domain 模型 | exact active/waiting/uncertain/completed/stopped 的表驱动反向组合 | 任一旧状态优先级或 archive capability 返回历史错误即失败 |

静态实现及上述反向合同均已执行通过；这证明自动化运行语义未放宽旧门禁，但不替代真实宿主 accepted。

## RAW-133 统一与效率复核

| 关注点 | 唯一权威与最小路径 | 反向失败条件 |
| --- | --- | --- |
| 诊断形状 | Domain 的一个 key tuple 同时驱动规范化和相等判断 | Controller/Page 复制五字段清单或各自解释非法值 |
| 接纳与通知 | Controller 先过同源 fingerprint/generation，再整包比较；diagnostics-only 变化恰好一次 `notify` | 旧代次先改诊断/桥状态、相同轮询重复通知、变化无通知 |
| 父聚合验证 | Bridge 测试注入并调用生产 `codexResolveParentActivity`，表覆盖 main、child wait、最新 active interval、system error、App Server fallback | 测试重写另一套优先级算法或遗漏任一来源 |
| 常驻信息密度 | 页面只显示“保护合计 · 周期”，五项明细留在原生帮助按钮 | 永久长串占宽、明细含身份/content、帮助只支持鼠标 |
| 辅助技术 | `aria-live` 只包围连接诊断标题；内部累计值不在 live region；所有 `.codex-tip` 均为原生按钮 | 每次计数增长都被播报，或保留 `span role=button/tabindex` 分支 |

本轮复核不发现第二套诊断规范、第二套父聚合算法或旧伪按钮分支，相关运行合同已通过；结论更新为 `automated-verified / host-pending`。

## 2026-07-30 分批提交前复核

- 第一性原理：任务卡片只消费按来源与代次排序后的单一稳定状态；更晚的正向活动证据不能被旧异步读取撤销，未确认终态不能获得归档能力，诊断只暴露匿名累计数。当前 Bridge → Controller → Domain → Page 的权威方向与这些不变式一致。
- 原始需求：逐项回看 RAW-131 的七个状态缺口、RAW-132 的父任务聚合/Side Chat/匿名诊断、RAW-133 的 Domain 单一 schema/原子通知/紧凑可访问呈现；对应生产入口和未执行合同均有直接映射，未发现遗漏或扩成任务身份/内容采集。
- 实现合理性：父聚合与诊断规范化各只有一个生产算法，Preload/Controller 两侧都以同源 generation 做顺序屏障；RAW-150 后 stopped 任务级归档在 Domain capability、Controller adapter、Host 写前复核与 Float 消费四层一致，项目批量仍单独阻断。提交前静态审阅未发现新的 P0/P1；运行行为仍受下方用户验收门禁约束。

## RAW-136 快捷键优先级复核

| 关注点 | 自动合同 | 反向失败条件 |
| --- | --- | --- |
| Plan 分类与隐私 | 精确 `item/plan/requestImplementation` 只发布 `planImplementationOnly=true`；普通输入/审批混合使父任务为 false | Delta/快照含方法、正文、raw identity，或混合等待仍被当作 Plan |
| 生命周期 | 普通 Activity Delta 显式 false 清除 Plan；`readStateOnly` 在 Controller 保留当前值 | 请求已解决仍残留 Plan，或未读变化误清 Plan |
| 独占优先级 | 普通待输入/近期待审批存在时只在普通层回绕；清空后只在两个 Plan 间回绕；Plan 完成后才进入 recent active | 同一轮跨层、Plan 抢占普通输入、Plan 未清空就进入 active |
| 方向与回绕 | 游标不属于新层时 next 从首项、previous 从末项；层内每次前进/后退并首尾回绕 | 解决上一层后跳过首项、触发一次不前进或循环越层 |
| 兼容与回退 | `task-state-v4` 端到端一致；v3/缺失标记保守归普通等待；三层空后沿用非停止 EyPc 本地置顶 | 旧 preload 清空任务、未知等待进入 Plan、改变 native pin/stopped 资格 |

执行证据：Bridge/Domain/Controller/平台四文件 `151 / 151`；`pnpm run typecheck`；production `pnpm run build`（包含再次 typecheck、Vite、runtime preparation、`validate:utools`）；canonical/public preload 镜像一致。真实 uTools 快捷键顺序未执行，保持 `host-pending`。

## RAW-148 Codex 识别与精简复核

### 识别链结论

- Runtime 识别的 Host 输入合同没有重复实现；重复发生在 Renderer 展示投影。[codexEnvironmentPresentation.ts](../../../../src/domain/codexEnvironmentPresentation.ts#L1) 现统一拥有横幅优先级、兼容宿主等待谓词、诊断表、状态裁决明细、启动候选与帮助说明，[CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) 只渲染一个 computed projection。
- [companionPresentation.ts](../../../../src/domain/companionPresentation.ts#L1) 的任务归属解析不再接收未使用的 provider enablement，项目归属也由同一模块投影；[FloatApp.vue](../../../../src/FloatApp.vue#L1) 构造任务/项目 `RenderRow` 时各解析一次 marker，ARIA、文本与来源 class 不再各自维护识别逻辑。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1) 的手动路径保存/恢复共享 `applyLaunchPathChange`。Host mutation 返回的新环境直接成为当前快照，测试证明 set/clear 各调用一次、`inspectEnvironment` 零调用。

### 冲突裁定

- 当前 RAW-022、RAW-148、架构和对应 Domain/UI 测试一致要求每条任务/项目始终显示归属。
- [项目规则](../../../rules/README.md#L1) 与 [PRODUCT_REQUIREMENTS](../../PRODUCT_REQUIREMENTS.md#L1) 的旧 Codex-only “全文逐字一致/单来源隐藏标记”表述与之冲突。按权威顺序裁定为：数据、状态、额度、空态、角标语义保持兼容；归属标记是明确例外。既有 [superseded-rule error memory](../../../knowledge/error-memory/superseded-rule-cited-as-authority.md#L1) 追加本次 occurrence 和 verified alternative route，没有新建重复记录。

### 自动化证据

- 聚焦：`tests/domain/codexEnvironmentPresentation.test.ts`、`tests/domain/companionPresentation.test.ts`、`tests/runtime/codexController.test.ts`、`tests/ui/codexCompanion.test.ts`，结果 `4/4` 文件、`188/188` 测试通过。
- 语义类型边界：当前整树 `vue-tsc --noEmit` 通过；RAW-147 当时由并发 Claude fixture 导致的阻断已不再是当前事实。
- 未触发：本轮没有修改 Bridge、Preload、构建入口或生成产物，因此没有运行 build、preload 镜像/语法、真实 Codex/uTools 或浏览器验收。

## RAW-152 进程级任务导航复核

### Review Target

- Requirement: 单卡点击保持精确；核验并修复 Codex/Claude 通用前后任务在快捷键、全局缓存和旧生命周期路径中的崩溃风险。
- Plan: 全启用来源库存原子 ready；Preload 进程级游标与跨来源最大并发 1；75ms 只派发最终目标；热入口只消费一次；mainHide/Renderer remount 保留，显式停用/kill 失效。
- Implementation: [navigation.cjs](../../../../preload/companion/navigation.cjs#L1)、[preload/index.js](../../../../preload/index.js#L1)、[eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1) 与 [codexController.ts](../../../../src/runtime/codexController.ts#L1)，生成镜像由 [utools-preload-assets.mjs](../../../../scripts/utools-preload-assets.mjs#L1) 纳入。

### Checked

- Requirement alignment: 单卡/attention 使用精确 key，不改变候选层级；通用循环才要求精确 revision，旧 Host fail closed。
- Plan-to-implementation coverage: Codex/Claude lane 分别 settled 后才发布 ready；Host 维护 retained snapshot、process cursor、trailing cycle 和 direct FIFO；`onPluginEnter` 热命中清 payload；Controller dispose 只 detach，feature disable 仍关闭 Provider。
- Risk and compatibility: 所有打开共享一个 Host pump，实测最大并发 1；Provider 配置变化清快照；诊断不含任务名称、路径、原始 ID 或 alias；Codex stale alias 仅按同 key tasks-only 重建一次。remount 尚保留旧 ready 快照时，当前卡片把已在 Controller 校验过的精确 target 交给同一 Host FIFO，不绕过全局串行。
- Verification evidence: 导航/平台/Controller/Claude/App 入口/Float 六文件 `160/160`，完整 Codex/Claude Preload 打开链五文件 `165/165`；合计受影响 `325/325`。`pnpm run build` 通过 `vue-tsc`、1868-module Vite build、运行时准备与 uTools validation；canonical/public/dist 镜像由构建校验通过，两份 canonical preload 语法检查通过。

### Findings

- P0: none.
- P1: none after fix. 原 OR 就绪、Codex/Claude 双派发、Renderer dispose 关闭 Host，以及 remount 期间旧 retained snapshot 阻断新精确卡片四条路径均已有反向合同。
- P2: none required for closeout.

### Optimization Suggestions

- 真实 uTools 接纳时记录跨来源快速连按的宿主崩溃/打开结果即可；不把私有任务身份加入诊断。

### Not Checked

- 未重载当前 uTools、未真实连续打开 Codex/Claude 任务；宿主级崩溃结论保持 pending。

## RAW-153 waiting-clear 因果屏障复核

### Review Target

- Requirement: 解除待输入必须在首个更新周期、最迟 1.25 秒进入进行中；旧 snapshot/read-state/refollow/rollout resume 不得回跳，屏障后的同任务新请求必须重新进入。
- Implementation: [preload/index.js](../../../../preload/index.js#L1) 的私有 Desktop waiting state、App Server 事件仲裁与 resolved 处理；公开版本在 [codex.ts](../../../../src/domain/codex.ts#L1) 和 [eypcPlatform.test.ts](../../../../tests/platform/eypcPlatform.test.ts#L1) 同步为 v8。

### Checked

- Requirement alignment: request remove/匹配 resolved 精确清实例；active/Turn-started 与 rollout 反向边建立清除屏障；未匹配 resolved 只重订目标任务；所有公开结构与 attention/排序/归档合同不变。
- Plan-to-implementation coverage: main/Side Chat request 与 runtime waiting flag 都有私有单调观测序列；full snapshot/patch/removal、refollow、inventory rebuild、rollout resume 和 owner-sticky shadow 共用同一可见性判定；current-owner `desktop-live + active + waiting` 不再进入错误的 already-active 快路。
- Privacy: request ID 只进入进程随机盐私有关联；序列、clear barrier、正文、命令、路径和权限内容均不跨桥、不持久化。resolved 未匹配时不枚举或清理其它请求。
- Automated evidence: Bridge `94/94`；九个直接受影响文件 `379/379`；typecheck、production build、runtime preparation、uTools validation、canonical/public main preload 语法/镜像和同步 IPC 静态检查均通过。未触发完整 Vitest/`pnpm run verify` 升级。

### Findings

- P0: none.
- P1: fixed in source——v7 把任何 `desktop-live + active` 都视为可复用，未区分 shadow 是否仍带 waiting flag，因此新 Turn/active 既不能即时清等待，还会取消恢复重订。
- P1: fixed in source——App Server active 水位只压过 Desktop idle，压不过观测更早的 Desktop waiting；任意旧 snapshot/read-state/refollow 重放都可能重新进入待输入。
- P1: fixed in source——`serverRequest/resolved` 未接入，无法用协议中的 `threadId + requestId` 补强精确解除；现匹配精确清除，未匹配保持并发审批并有界复核。
- P1: fixed in source——runtime waiting flag 从新快照消失时没有实例级屏障，旧完整快照可恢复；现与 request removal 使用同一序列门禁。
- P2: none required; 未加入未经证明的 `backgroundThrottling` 调整。

### Host Gate

- v7 真机缺陷已复现，修订 RAW-151 的旧 host-pending 结论；该证据证明修复必要性，不证明 v8 修复已加载。
- RAW-154 已由 v9 继续承接该宿主门禁；正常重接入、解除 ≤1.25 秒、30 秒稳定、两次 mainHide/refollow 不回跳、同任务新请求重入、精确 interrupted→待继续→新 Turn 恢复仍未完成。当前状态保持 `automated-verified / host-pending`。

## Full Matrix Findings

- RAW-129 历史基线中的状态主矩阵为 `168 / 168`；RAW-128 当时覆盖 10 类跨层可复现阻断。RAW-131–145 的历史执行数保留在上表，不能覆盖当前结果。
- RAW-146 直接受影响的 Controller/UI 两文件为 `90 / 90`；新增合同覆盖完整待输入集合中较新未置顶与较旧置顶的反向顺序。
- RAW-147 直接受影响的 Bridge 文件为 `81 / 81`；新增合同先以正向 peer announcement 导致额外写入稳定 RED，再证明只有显式 following-status request 会定向重报一次。
- RAW-148 直接受影响的 Domain/Controller/UI 四文件为 `188 / 188`；环境展示分支表、兼容等待、任务/项目归属识别和 mutation 零二次探测均有反向合同。
- RAW-149 直接受影响的 Bridge/Domain/Presentation/Controller/Platform/UI 八文件为 `292 / 292`；权限请求白名单、状态时间、同方法无时间请求私有关联、跨来源排序、进度状态机、隐私与版本降级均有反向合同。
- RAW-150/151 直接受影响的 Bridge/Domain/Presentation/Controller/Platform/UI 与 Claude adapter 共 `11 / 11` 文件、`382 / 382` 测试通过；覆盖待继续映射、两端归档、Claude 不兼容版本前置禁用、completed/stopped 成功与聚焦后恢复运行零动作、单一 reducer、双向 P95、两类掉通知、频率/Tab/Float/I/O 解耦、revision/owner/generation/read-state/隐私、更新证据取消定向重订和项目批量边界。
- RAW-152 直接受影响的导航模块、Preload、Platform、Controller、App 入口与 Codex/Claude 打开链共 `11 / 11` 文件、`325 / 325` 测试通过；覆盖部分库存阻塞、跨来源不并发、连续键最终目标、手动优先、mainHide remount、retained 快照期间精确新卡片、Provider 变化失效、热入口零 Renderer 重派发、旧 bridge revision 拒绝与显式 disable teardown。
- RAW-153 直接受影响的 Bridge/Domain/Presentation/Controller/Platform/Float/UI 共 `9 / 9` 文件、`379 / 379` 测试通过；Bridge 完整文件为 `94 / 94`，覆盖 current-owner waiting 清除、三类旧重放阻断、新 correlation、匹配/未匹配 resolved、并发审批、runtime flag、Side Chat/Plan 与 rollout resume。
- RAW-154 当前受影响的 Domain、Provider Bridge、Dispatcher、Controller、feature route、Float/UI 与 watcher E2E 共 `20 / 20` 文件、`550 / 550` tests pass。覆盖 exact interrupted 无 idle 停止、pending request 优先、新 Turn 恢复、待继续排除 active 角标、stale target fail-closed、archive single-flight/Provider 独立、D′ 零 Deep Link/AX、幂等/版本/phase/身份门禁、原子写/回滚/并发不覆盖、已归档 open 拒绝、仅已登记文件 mutation、外部 remove/upsert delta、旧 inventory tombstone、1 秒 watchdog 与 5 秒快捷确认。
- `pnpm run typecheck` pass。`pnpm run build` pass：再次 `vue-tsc --noEmit`、1868-module production Vite build、uTools runtime preparation 与 `validate:utools` 均成功。没有执行全仓 Vitest/`pnpm run verify`，因为本轮 impact trace 已由上述 20 文件覆盖且无扩大触发。
- `pnpm run sync:preloads` 后 canonical/public main、companion task-actions、Claude archive/code-sessions/index 镜像字节一致；五个 canonical JS/CJS `node --check` pass，`git diff --check` pass。当前源码 revision 为 `task-state-v9`；历史 v7/v8 真实宿主只证明旧缺陷，不证明 v9 已加载。
- 文档/规则收口复核 33 个变更 Markdown，零断链、零仓库根兜底链接；`AGENTS.md`/`CLAUDE.md` 的工具专属导语不同但共享适配器正文逐字一致。审计把残留的“v8 是当前语义 / interrupted 等 idle”改为 v9 当前合同并保留 v8 历史，Claude 同步组私有回执按 34 documents / 49 dependencies / 31 validators 重新记录。
- 最新完整仓库 Vitest 仍是 RAW-146 的历史基线 `752 / 752`、`57 / 57` 文件；RAW-147 与 RAW-149 都没有完整仓库升级触发，分别执行各自完整受影响文件。RAW-149 的 typecheck、production build、preload/runtime 与真实只读预检独立通过，不把锁屏前未发生的 UI 宿主动作计入接纳。

## RAW-154 返工验证：统一 Package 与 Runtime Identity

- 原 20 文件 `550/550` 是 RAW-154 D′/v9 基线的历史证据。本次返工没有把它改写成新架构的验收，而是针对唯一 Kernel、真实 Bridge 组合、静默入口与身份握手新增/复跑 12 个影响文件共 `485/485`：`companionNavigationBridge`、`companionTaskActionsBridge`、`companionTaskKernel`、`runtimeIdentity`、`eypcPlatform`、`codexAppServerBridge`、`codexFloatWindowBridge`、`codexController`、`claudeCompanionController`、Runtime action、Companion UI 与 feature routing；其中 Controller 用例使用真实 Kernel，验证 Main/Float 接收同一包对象且卡片点击、快捷键循环落到相同的完整 Provider 目标；App Server Preload 用例验证没有 Renderer 时，只有 `inventoryChanged` 而没有现有任务行变化也会触发任务专用重读；Kernel 用例验证 degraded 包预检失败时保留旧包但拒绝导航；RuntimeIdentity 用例验证 Host 变化同时改变 Host/Renderer ID，而纯 UI 变化只改变 Renderer ID。
- Kernel 组合测试使用真实 [task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1)、[navigation.cjs](../../../../preload/companion/navigation.cjs#L1) 与 [task-actions.cjs](../../../../preload/companion/task-actions.cjs#L1)，证明卡片和通用循环把同一个包含 revision/phase/capability 的完整目标交给相同 Provider 调用，不使用绕过 stale-target 校验的 legacy mock。
- Reducer 覆盖 running、waiting-input、waiting-approval、completed、stopped、更新 Turn 恢复 running、乱序旧 active、模糊 freshness/双失败 unknown、completed+unread 组合与 100 次快速 revision 交替；每次发布都是同 revision 下的任务、分组、角标和 cycleKeys，重复语义不发布。最终实现复核追加反向合同：同 producer 的重复/低 `draftRevision` 不能用缺行草稿删除新任务；跨 Provider 草稿只有 source generation 前进的一侧可更新，generation 倒退的一侧完整保留。
- 静默入口在 Renderer 从未挂载时完成前/后任务派发，随后模拟 Alt+Tab 不会重放。热路径测试 P95 <200ms；可用 Provider 的共享冷预检 P95 <1.5s；Main/Float 接纳同一 package revision 的测试延迟 <50ms。上述是确定性本机自动化，不冒充真实 uTools OS 调度性能。
- 身份测试覆盖旧 Main Preload+新 UI、新 Main Preload+旧/缺失 Float UI、旧子窗口 Preload/ASAR；全部进入 `reload-required` 并禁止任务动作。精确 Host/Renderer/Kernel/Package 身份匹配后才允许桥接。
- 最终实现复核补齐新 Main Preload+旧 Main UI：Main Renderer-facing Kernel、Codex/Claude 打开/创建/归档端口在精确握手前统一返回 `reload-required`；Preload 内部 `onPluginEnter` 仍可独立消费静默入口。production validator 直接执行握手前 Kernel/codex 调用并证明惰性，再完成精确握手。
- `pnpm run typecheck`、1870-module production/uTools build、runtime validator、canonical/public preload 镜像与 5 个 JS/CJS `node --check` 通过；最终构建身份为 `host-9d4cb1b3a288c5a8bc61 / renderer-30eb78df00c13c1e9eab`。构建日志只报告 `artifact-ready`；真实 Host 未握手前禁止记为 `host-loaded`。最终 `git diff --check` 见下述收尾门禁。
- 当前状态重新回到 `automated-verified / host-pending`。正式接纳仍须用户在 uTools 开发工具重新接入 `dist/plugin.json`，结束旧插件后台进程并重新进入，重开 Float，核对 Main UI/Main Preload/Float UI/Float Preload 四端身份一致，再执行 Renderer 未挂载的静默前后切换、Alt+Tab 零重放、Codex/Claude 跨来源循环与状态延迟矩阵。实现没有调用私有 uTools API，也没有自动终止进程或执行真实 Claude 写入。

## RAW-155 验证：V2 Lane、Push-first、导航与运行诊断

- 影响选择的 19 个测试文件共 `575/575` 通过：Kernel、navigation、Float bridge、runtime diagnostics、Claude bridge/state/unread、Codex Host、Platform、RuntimeIdentity、Claude Controller/watcher E2E、Codex Controller/keybinding、Codex/Provider/Aggregate/Presentation Domain 与 Companion UI。最终复核同时证明 Claude terminal phase 可独立启用其派发时精确复核的归档能力，而 Codex newer non-terminal phase 会在不等待 inventory 的情况下撤销旧归档能力与 fingerprint。
- 回归覆盖：Codex exact interrupted 先于陈旧 active shell 且 inventory-only 保守；Codex 同代次 phase/unread 独立接纳与成员信号窄恢复；Claude Host+Renderer 多订阅、首个冷 inventory 后动态目录 watcher、并发 unread singleflight、旧 async unread 基于最新包重放；V1 fail closed 与 Provider 三 lane generation；正常 push 零 quota/environment/full-inventory 读取。
- 导航覆盖首键立即派发、仅 in-flight 最终 trailing、manual/attention 取消 trailing、同 key 去重、跨 Provider 并发 1 与冷预检 fail closed。排序覆盖状态分组后全部按最近提问倒序，Provider/置顶不覆盖；刷新设置/UI/快捷键反向合同确认无 `taskRefreshSeconds`、手动全刷、hero refresh 或 Ctrl+R，额度旧 0→300 且最小 1 秒。
- Float 覆盖 2 秒 heartbeat、6 秒 stall、60 秒 recreate cooldown、10 秒恢复观察与 interaction-id 的 10 秒/blur/lifecycle 清理。诊断覆盖 allowlist enum、250ms 慢标记、JSONL 2 MB/10 MB/7 天轮转、0700/0600 权限与 raw ID/标题/提示词/路径/URL/Token/命令/stdout/stderr/stack 拒绝。
- `pnpm run typecheck` 通过；Canonical/Public Preload 同步与 21 个 JS/CJS/MJS `node --check` 通过。第一次 production build 产物已生成，但 validator VM 缺少顶层 timer 宿主桩而失败；补入不执行 callback 的 `setTimeout/clearTimeout/setInterval/clearInterval` 后，`pnpm run validate:utools` 与最终完整 `pnpm run build` 均通过。最终为 1870 modules，身份 `host-8dd41fb34ee0eaa27ae3 / renderer-2537cdea077c5e564f7b`，状态仅 `artifact-ready`。
- `git diff --check` 与 28 个变更 Markdown 的 code-link audit 通过。`pnpm run probe:runtime-diagnostics` 安全返回 `diagnostics-directory-missing`（exit 2）：当前本机尚无新 Host 写出的安装日志，这与“未重载真实 uTools”一致，不是日志实现通过真机验收的证据。
- 未运行全仓 `pnpm test`/`pnpm verify`：影响轨迹没有新的整仓升级触发器。真实 uTools running→completed-unread、exact interrupted、快速连按、Float stall 自恢复、安装目录 JSONL 与轮转尚未观察，继续 `host-pending`。

## RAW-155 增量验证：单一最终投影、快速状态与稳定归档

- 影响选择的 9 个测试文件共 `303/303` 通过，覆盖 Claude 正常 completion 后 generic session-end 不降为 stopped、native unread 的 completed-unread 单调投影、Codex 冷启动 exact interrupted、精确 failed 仍保持既有 idle/not-running 门禁、2005 个 canonical tasks、405 个 Claude sessions、新 Codex key 元数据补读、卡片/Tab/项目/分组/角标原子重投影、Provider-specific unknown 可见性、unread revision 不覆盖 Codex archive completion watermark、确认期间 revision/alias churn、Claude archive 安全 rebase/单次写前重试与脱敏 state-decision 日志。
- `pnpm run sync:preloads` 使 canonical/public Preload mirror 一致；`pnpm run build` 通过 typecheck、1870-module production Vite build、uTools runtime preparation 与 validator。构建身份为 `host-b1ebbac81b95ca4f0405 / renderer-5b82a3734cf73beb8df3`，状态仅 `artifact-ready`。
- 最终 `git diff --check` 与变更文档 code-link audit 通过。没有运行全仓 Vitest：此次行为边界由上述 9 个受影响文件闭合，未出现扩大影响轨迹的失败或项目级升级触发器。
- 未检查真实 uTools/Claude Host：新 Codex 任务即时出现、Claude 正常完成→未读→已读→新 Prompt、exact interrupted、两 Provider 的 EyPc 归档自动移除、确认期间真实状态 churn、Float 恢复和安装日志仍为 host gate。Claude RAW-029 已证明 D′ 不产生原生 `archived` ACK，原生侧栏及时收敛当前为 `unsupported`，不再以观察或重启后视觉结果冒充本 gate。

## RAW-159 验证：V3 单一语义、Codex 持久化归档与操作诊断

- 聚焦自动化已覆盖状态真值表、乱序/重复证据、1,000 条等价 observation 零 semantic/package revision/Float/focus、240 项三页库存及第 41/101/201 个消费者、新 membership 先显示后补元数据、快捷键/手动跳转 operationId 与 focus no-op。
- Codex archive 回归覆盖 Provider 写成功但 Desktop sync 失败、第二次 server verify 矛盾、native ACK 超时、失败后按钮/卡片保留及可重试、成功十阶段 commit/removal、确认 identity 不受等价 revision 影响、tombstone 阻挡旧库存复活，以及同一 operationId 的阶段顺序和显式等级。
- diagnostics v3 回归覆盖 error/info/debug/off、userConfigured/defaultsRevision 迁移、8 MB/64 MB/14 天轮转、禁用内容键、所有写入显式 level 的静态 AST 门禁，以及 v2/v3 session/operation/trace/provider/taskRef/scope/event/level/since/tail 查询和状态/no-op/快捷键/导航/归档/错误聚合。
- 同一源码快照聚焦 `10/10` files、`388/388` tests；公共 V3 类型命名收口后又通过 `5/5` files、`211/211` tests，并最终全库 `83/83` files、`1272/1272` tests。typecheck、1870-module production build、canonical/public/dist mirrors、Runtime Identity `5/5` 与 uTools validator 通过。产物身份为 `host-36616822511986c18f2c / renderer-25da7ef64b81aadc76f8`，仅 `artifact-ready`。文档审计/receipt 见 [RAW-159 verify](../../260810/1155-install-runtime-diagnostics/verify.md#L1)。
- 真实 uTools 同包状态、40+ 库存、操作日志、Codex App 一致归档和故障保留矩阵仍 pending；未授权安装/重启前不得报告 host-loaded 或完成。

## Findings

- P0: none.
- P1: 已修复——已接受 completed 未清除 active-exit baseline，导致后续 full snapshot 可反判回 inProgress。
- P1: 已修复——真实 activity patch 与首次 snapshot 无来源区分，旧 completed 元数据可压住新活动。
- P1: 已修复——初始/refollow snapshot 的旧 unread false 永久压住稍后原生 unread true；现由证据优先级与只读原生状态 watcher 即时发布。
- P1: 已修复——完成前 stream patch false 在残留 waiting flag 分支中绕过 completion 清理；所有 exact completion 现统一走 completion publisher。
- P1: 已修复——App Server 精确 active 事件在已有 Desktop idle snapshot 权威时被忽略，导致恢复中的 interrupted 任务持续显示已停止；现以 `app-server-live` 保留正向事件直到明确终止。
- P1: 已修复——普通 completed shape、同 revision started/inProgress 与 completedAt 必填形成三层重复阻断；现只让三类已确认 completion provenance 关闭 live 周期，并允许精确同 revision 状态前进。
- P1: 已修复——Controller 的 delta 路径只保护旧 completed，而 full snapshot 可用相同旧 interrupted/failed 清除 baseline 并发布 stopped；现两条入口共用一个 active-exit 转换器，未确认 terminal 保持 ongoing。
- P1: 已修复——persisted unread=true 到达旧 interrupted 投影时只更新 unread，无法发现已经 completed 的最新 Turn；现只唤醒一次有界 targeted 复核，unread 本身仍不推断完成。
- P1: 已修复——缓存已是 completed 的 unresolved live epoch 会拒绝同 revision、缺失 completedAt 的精确完成；现只拒绝严格旧 revision，且 confirmed duplicate 不重开 unread 周期。
- P1: 已修复——active snapshot 佐证仍把 completedAt 当 terminal shape 必填字段；现只要求 terminal + startedAt，并保留最终尝试与 activity revision 校验。
- P1: 已修复——stale-active 复核占用 single-flight 时，随后的 active-exit/unread 普通复核会被丢弃；现只合并兼容模式，不兼容模式取消旧周期并由当前状态接管，旧异步结果不能删除新周期。
- P1: 已修复——缺失 latest-Turn outcome 在 exact idle/not-running 下仍会进入 stopped；现停止必须具备明确 failed/interrupted，缺证据始终 ongoing。
- P1: 已修复——targeted/corroborated provenance 只存在于发出的对象副本，后续 activity snapshot 会回到 inventory；现写回会话期 inventory 后再原子发布。
- P1: 已修复——EyPc completion-revision 本地确认会压住 Codex 原生 unread=true；现移除写入/投影覆盖，旧字段只作忽略式迁移。RAW-149 的完成未读专用入口只维护匿名打开进度，仍不写 Codex 原生 unread。
- P1: 已修复——Activity Delta 同批出现未知 key 时整批返回；现已知任务即时应用，未知 key 只触发 urgent 结构复核。
- P1: 已修复——完整 inventory 重建会丢失精确 inProgress、confirmed terminal provenance，并缺少与增量共享的 generation 屏障；现保留更强会话期证据并拒绝严格旧增量。
- P1: 已修复——missing-key 隔离冻结整批清单；现只保留缺失行，现存任务的完成/未读在 stale 清单中仍立即发布。
- P1: 已修复——unchanged native unread=true 在普通读取中反复重启佐证，重复相同 active snapshot 也重置周期；现首次/新到达 true 只启动一次，任务切换歧义可接管，兼容 snapshot 复用一个有界周期。
- P1: 已修复——active 退出可把相同旧 inventory completed 无条件标成 targeted completion；现只接受缓存相对 baseline 前进或已有 confirmed provenance。
- P1: 已修复——冷启动原生 unread 已为 true 时，库存投影也已为 true，旧“值变化”判断漏掉首次 Turn 复核；现用会话期原生观测水位只唤醒首个 true，后续轮询不重启。
- P1: 已修复——confirmed terminal 由 delta 调用方额外传入，full snapshot 同 revision 佐证仍会被纯转换器压回 inProgress；现转换器直接读取 candidate provenance，两条入口零差异。
- P1: 已修复并验证——较早的 Desktop idle `activity-event` 可在较新的 App Server active 后因 read-state/inventory 重放再次撤销 `app-server-live`；现两种真实事件共享进程内单调 sequence，只有严格后到的 Desktop 非 active 才能撤销，并在 full inventory 中保留私有水位。
- P1: 已修复——`codexNewThread` 只检查周额度归零且优先展示周读数，违反“任一已返回普通窗口为 0 即切 Spark”和普通 5 小时优先合同。
- P1: 历史修复并由 RAW-149 细化——全局待输入曾直接使用源数组首项；当前两个专用 attention 入口改为跨来源 `statusEnteredAt DESC` 与持久化未打开进度，置顶比较器只保留给普通显示/通用循环。
- P1: 已修复——正向 peer follower 状态公告被误当作请求再次回发，两个已加载旧实现的 EyPc follower 可互相放大控制消息并饿死 owner snapshot；现公告单向消费，只有显式 following-status request 才回复一次。
- P1: 已修复——动态最近窗口原只看 Turn 活动，旧任务新出现审批会被时间窗漏掉；`taskActivityAt` 现同时纳入 `statusEnteredAt`，状态进入与解除都按同一状态时间重投影。
- P1: 已修复——打开进度清理曾以“当前可打开 alias”代替“当前状态组成员”，临时 alias 不可用会误删历史；现成员清理与动作候选分离，只有权威离组/状态时间变化才淘汰实例。
- P1: 已修复——跨 Provider 聚合只以可见外部任务生成待输入列表，却把外部完整计数直接相加，隐藏等待/未读会造成角标与动作集合不一致；现完整 attention 集合统一聚合后再生成计数和排序。
- P1: 已修复——完整请求快照仅按方法与时间匹配会把同时存在、同方法且无时间的审批互换首次观测时间；现以进程随机盐散列有限请求标识作私有会话关联，原始标识与散列都不跨桥或持久化。
- P1: 已修复——真实预检复制了审批属于 active 的旧 Presentation 谓词，无法发现待输入与进行中重复计数；现直接调用生产 `projectCodexDynamicStatus` 并断言两组 key 互斥。
- P1: 已修复——通用任务快捷键只要 Codex 或 Claude 任一库存有值就把全局缓存判为可用，可能在另一来源未完成时按部分集合跳转；现所有启用来源分别 settled 后才原子 ready。
- P1: 历史并发缺陷已修复，并由 RAW-155 优化首键时延——Preload 进程 owner 推进游标，首个目标立即派发，仅 in-flight 时保留最终 trailing，全部来源共享最大并发 1。
- P1: 已修复——普通 mainHide 的 Renderer 卸载仍通过 Controller `dispose()` 关闭 Host，会使刚修复的 Preload 热缓存再次失效；现 dispose 只 detach，显式功能停用、Provider 变化、kill 与进程退出保留清理权威。
- P1: RAW-153 已修复源码并由 v9 继续承接宿主接纳——当前 owner 的 `desktop-live + active + waiting` 被旧 already-active 快路保留，较新 Turn/active 后 snapshot/read-state/refollow 可再次复活 waiting；现请求/runtime 序列与 waiting-clear 屏障统一仲裁。
- P1: RAW-153 已修复源码并由 v9 继续承接宿主接纳——`serverRequest/resolved` 缺失精确处理；现匹配请求单独清除，未匹配只启动目标任务有界重订并保留其它并发审批。
- P1: RAW-154 已修复——精确 interrupted 仍会被更旧 Desktop active 压回进行中；现 exact terminal watermark 在无 pending request 时立即进入待继续，更新的新 Turn 才恢复运行。
- P1: RAW-154 已修复——Claude archive 复用 open/AX 路径，在本机只能打开且不能归档；现 archive 不再调用 Deep Link/AX，只执行唯一目标 D′ 元数据事务，普通 open 写前拒绝已归档目标。
- P1: RAW-154 已修复——Controller 分别维护 Codex/Claude 归档与乐观删行，全局 latch 会互相阻断；现一个 Dispatcher 和 mutation reducer 按 Provider+task single-flight，不同来源互不阻断，归档期间卡片保留。
- P1: RAW-154 已修复——Claude App 手动归档等待完整库存扫描且可被 single-flight/quota 阻塞；现精确文件 mutation delta 立即发布，旧 inventory 由 tombstone 阻断，掉 callback 只由 1 秒索引候选 watchdog 恢复。
- P2: 已修复——3 条历史外观测试、3 个 Runtime 配色 Action 与 Controller 暂态覆盖仍携带 RAW-071 已废止的本地颜色/对比度/配对预览门禁。
- P2: 已修复——MQTT media 正则对等价 CSS 换行敏感，Quick Jump 否定正则跨越函数边界命中后续合法 `app.hide`；两者均改为结构边界断言。
- P2: 历史修复并由 RAW-149 取代文案——紧凑角标帮助/ARIA 曾遗漏动作语义；当前输入/未读统一说明“最新优先，连续触发依次打开”，不再承诺永远打开第一条。
- P2: 已修复——PROJECT_STATUS/PRD/Verify 对 persisted-decision、24 小时默认、最新测试基线与 8092 当前存活状态存在漂移；现区分历史证据、当前静态产物和未执行的真实宿主更新。
- P2: 已修复——真实预检从仓库根直接执行单个 TypeScript 文件，无法加载生产 Domain 新增的相对值依赖；现用缓存式内存模块加载器按 importer 路径解析依赖。
- P2: 旧 runtime/float `conversations` 别名仍保留一版兼容，待 v2 退役后删除。

## Not Checked

- RAW-155 尚未在真实重载的 uTools/Claude 中观察 running→completed-unread、延迟期间打开竞态、exact interrupted 展示、跨 Provider 首键即时/连按 trailing、Float 卡死自恢复与安装目录日志轮转；自动化和构建不得冒充这些宿主证据。
- RAW-152 尚未在重载后的真实 uTools 中完成跨 Codex/Claude 连续前后键、普通 mainHide 往返和进程重载；自动化只证明派发仲裁与生命周期合同，不宣称宿主崩溃已真实消失。
- RAW-150/151 的真实 v7 宿主已暴露 waiting→active 滞留/回跳，旧“当前 ASAR 仍为 v5、仅 host-pending”结论已作废并由 RAW-153 rework 接管。
- RAW-154 尚未在正常重接入的真实 `task-state-v9` 宿主完成双向 waiting、30 秒稳定、两次 mainHide/refollow、exact interrupted→待继续→新 Turn 恢复和角标验收；当前已知运行 ASAR 的历史读回为 v7，自动化不得替代新宿主门禁。
- RAW-154 返工尚未取得真实 RuntimeIdentity 四端 `host-loaded` 握手；当前产物只能报告 `artifact-ready`。未在 Renderer 从未挂载的真实 uTools 进程里核验静默前后任务、600ms 进度提示/5 秒失败、Alt+Tab 零重放与跨 Provider P95。
- 未执行任何真实归档写入。Claude D′ canary 仍需要用户对一个可丢弃 completed 会话另行确认；无需辅助功能权限或 Deep Link，成功硬门禁为目标元数据与活动库存双确认，Claude 侧栏是否即时刷新只记录观察。
- RAW-149 尚未在新构建的真实 uTools 中完成 permissions approval 新增→最新插队→打开原任务→拒绝/resolved 清除，也未完成多条待输入/完成未读的重载进度恢复。首次 UI 观察因 Mac 锁屏安全中断；当前运行 ASAR 后续已到 v7，但尚未加载 RAW-153 v8，自动化与源码预检不能替代该门禁。
- 当前执行上下文为 unrestricted filesystem + approval never，不能在本任务中自然制造非 Full Access 审批；未修改 Codex Access 或系统权限，也未代用户批准/拒绝任何请求。
- RAW-148 未触碰 Preload、Bridge、入口或产物，故按影响轨迹未运行 build、镜像/语法、真实 Codex/uTools；这些不是本轮自动接纳条件。
- RAW-147 已执行受影响的完整 Bridge 文件 `81/81`、精确变更快照的 `pnpm run typecheck` 与 production build、当前三份 main preload 镜像/语法/同步 IPC 检查、runtime validation、真实只读预检和有界真实 IPC；影响面没有触发整仓 Vitest 或 `pnpm run verify` 升级。当时并发 Claude fixture 的 `projectKey` 可选性错误阻断了整树复跑；该历史阻断在 RAW-148 当前整树 typecheck 中已不再出现，本轮仍未因无触发器而补跑 build。
- RAW-147 的 follower 修复已进入后续 v7 宿主；当前源码已推进到 RAW-154 v9。owner snapshot 与 active→普通输入/审批的正向边已有历史真实通路，解除与 interrupted 终态必须按 v9 门禁重新验收。
- 未操作真实 Codex 任务、未归档/移除项目、未启停进程。
- 真实 uTools 宿主需正常重载后验收正向 follower 公告零回发、owner snapshot、active→waiting、任务切换与角标同步。

## Retained Minimal Guards

- 严格更旧 `startedAt`：防止乱序旧 started 反向覆盖，不影响同 revision 状态前进。
- 首次/refollow active 与 terminal 冲突的 `[0,300,1000]` 定向读取，以及 active-exit baseline：实时与全量入口共用同一转换器；精确 started/completed 可立即绕过，不兼容复核模式可接管。
- waiting-input/approval 与精确 `turn-started`：阻止 unread 把真实活动当 stale-active；只限制额外取证，不影响精确完成。
- source fingerprint、Activity generation、missing-key 行级隔离与 50/200ms 结构合并：只防协议串线、旧增量、清单误删和重复扫描；未知/缺失行不再阻断已知/现存任务状态。
