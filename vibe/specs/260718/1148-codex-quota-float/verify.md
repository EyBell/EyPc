# Codex 任务状态验证记录

Tool: codex
Date: 2026-08-03

## Review Target

- Requirement: [RAW-116–145](raw-requirement.md#L1)
- Plan: [plan.md](plan.md#L1)
- Implementation: preload 直接证据/原生 unread/Activity generation 与 mode-aware latest-Turn 复核、无 Turn 载荷 completed 专属快路、精确 Plan-only 隐私标记、已知 Side Chat 会话期拓扑重订及普通 mainHide 热 App Server/alias 连续性；Controller 单一 active-exit 转换器、停用代次重建、行级库存隔离/零周期自闭合、发布成功感知的 tasks-preflight single-flight、同 key alias 重建、Runner verified inventory 复用与普通等待→Plan→近期 active 独占循环；Feature route 由 `mainHide` 独占 Codex 全局入口可见性；Domain 明确停止/原生 unread/Plan 卡片投影；额度/完整校对自由秒数、quota-auto 普通窗口仲裁、直接外观持久化和结构边界静态回归同步收口。
- Sidecar: 主线程。

## Checked

下表保留 RAW-129 历史基线和 RAW-130–145 当时的增量记录；当前执行结果以 RAW-146 行及文末 Full Matrix Findings 为准，历史“未执行”或旧计数不再冒充最新状态。

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
| P1 | stopped 全链禁止归档 | Domain/Controller/Host 曾允许 stopped evidence，与 canonical 冲突 | Domain 投影 `blocked-stopped/canArchive=false`；Controller 只发 completed；Host 只接受 completed；UI 显示“会话已停止但未完成” | Domain、Controller、Host invalid-request、UI disabled reason |

### 闭合合同矩阵

| 轴 | 历史覆盖 | RAW-131 新增合同（未执行） |
| --- | --- | --- |
| Positive 来源 | main Desktop initial/patch、App Server active/started | exact active + unread=true + stale terminal；active→active request；Side Chat initial/patch；multiple child |
| 重放入口 | unread=false、refollow、连续 inventory | unread=true targeted read、owner disconnect/reset、known-row dropout、side-only inventory rebuild |
| 异步顺序 | old delta after full snapshot | new delta before old full snapshot；reader started before/after positive epoch |
| 终态 | completed、interrupted、failed 的若干单例 | conflicting interrupted/failed 不得合成 idle；same-revision stale terminal after exact active |
| 最终消费 | 部分 Bridge/Controller/Domain 单层断言 | 同一序列的 authority、bucket、compact count、archive capability 端到端断言 |

实现结论：此前通过数量是示例合同的通过，不是状态空间闭合证明；RAW-131 已改写 synthetic idle 和 stopped archive 的错误期望，并为其它五类缺口补入合同。当前合同已随完整仓库 `697 / 697` 自动化验证通过；真实宿主仍未 accepted。

## RAW-132 回归安全复核

### 保留的旧错误门禁

1. stale-active reader 在发起和异步返回两端都核对 positive sequence；新 activity epoch 后的旧 terminal 不得落库。
2. conflicting initial active + failed/interrupted 只能 suppression 到 unavailable/ongoing，禁止恢复 synthetic idle/stopped。
3. active→active ordinary/waiting patch 继续开启新 epoch；waiting 继续高于旧 completion。
4. missing-row anonymous mapping 继续按同 fingerprint 保留，显式 archive 继续立即删除；Controller missing-key quarantine 未放宽。
5. 同源 generation 继续同时保护 task fields、Desktop bridge state 与新增诊断计数；低代次 delta 和低代次/无代次 V2 full snapshot 均不得回退。
6. stopped 继续是 `blocked-stopped`，Domain、Controller、Host 和 UI 均不恢复归档能力。

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
- 实现合理性：父聚合与诊断规范化各只有一个生产算法，Preload/Controller 两侧都以同源 generation 做顺序屏障，stopped 归档在 Domain、Controller、Host 与 Float 四层一致阻断。提交前静态审阅未发现新的 P0/P1；运行行为仍受下方用户验收门禁约束。

## RAW-136 快捷键优先级复核

| 关注点 | 自动合同 | 反向失败条件 |
| --- | --- | --- |
| Plan 分类与隐私 | 精确 `item/plan/requestImplementation` 只发布 `planImplementationOnly=true`；普通输入/审批混合使父任务为 false | Delta/快照含方法、正文、raw identity，或混合等待仍被当作 Plan |
| 生命周期 | 普通 Activity Delta 显式 false 清除 Plan；`readStateOnly` 在 Controller 保留当前值 | 请求已解决仍残留 Plan，或未读变化误清 Plan |
| 独占优先级 | 普通待输入/近期待审批存在时只在普通层回绕；清空后只在两个 Plan 间回绕；Plan 完成后才进入 recent active | 同一轮跨层、Plan 抢占普通输入、Plan 未清空就进入 active |
| 方向与回绕 | 游标不属于新层时 next 从首项、previous 从末项；层内每次前进/后退并首尾回绕 | 解决上一层后跳过首项、触发一次不前进或循环越层 |
| 兼容与回退 | `task-state-v4` 端到端一致；v3/缺失标记保守归普通等待；三层空后沿用非停止 EyPc 本地置顶 | 旧 preload 清空任务、未知等待进入 Plan、改变 native pin/stopped 资格 |

执行证据：Bridge/Domain/Controller/平台四文件 `151 / 151`；`pnpm run typecheck`；production `pnpm run build`（包含再次 typecheck、Vite、runtime preparation、`validate:utools`）；canonical/public preload 镜像一致。真实 uTools 快捷键顺序未执行，保持 `host-pending`。

## Full Matrix Findings

- RAW-129 历史基线中的状态主矩阵为 `168 / 168`；RAW-128 当时覆盖 10 类跨层可复现阻断。RAW-131–145 的历史执行数保留在上表，不能覆盖当前结果。
- RAW-146 直接受影响的 Controller/UI 两文件为 `90 / 90`；新增合同覆盖完整待输入集合中较新未置顶与较旧置顶的反向顺序。
- 最新完整 Vitest 为 `752 / 752`、`57 / 57` 文件；它取代 `751 / 751` 作为当前自动化基线。类型、preload/运行时静态门禁独立记录，不把实际宿主计入自动接纳。

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
- P1: 已修复——EyPc completion-revision 本地确认会压住 Codex 原生 unread=true；现移除写入/投影覆盖，完成未读命令只打开第一条，旧字段只作忽略式迁移。
- P1: 已修复——Activity Delta 同批出现未知 key 时整批返回；现已知任务即时应用，未知 key 只触发 urgent 结构复核。
- P1: 已修复——完整 inventory 重建会丢失精确 inProgress、confirmed terminal provenance，并缺少与增量共享的 generation 屏障；现保留更强会话期证据并拒绝严格旧增量。
- P1: 已修复——missing-key 隔离冻结整批清单；现只保留缺失行，现存任务的完成/未读在 stale 清单中仍立即发布。
- P1: 已修复——unchanged native unread=true 在普通读取中反复重启佐证，重复相同 active snapshot 也重置周期；现首次/新到达 true 只启动一次，任务切换歧义可接管，兼容 snapshot 复用一个有界周期。
- P1: 已修复——active 退出可把相同旧 inventory completed 无条件标成 targeted completion；现只接受缓存相对 baseline 前进或已有 confirmed provenance。
- P1: 已修复——冷启动原生 unread 已为 true 时，库存投影也已为 true，旧“值变化”判断漏掉首次 Turn 复核；现用会话期原生观测水位只唤醒首个 true，后续轮询不重启。
- P1: 已修复——confirmed terminal 由 delta 调用方额外传入，full snapshot 同 revision 佐证仍会被纯转换器压回 inProgress；现转换器直接读取 candidate provenance，两条入口零差异。
- P1: 已修复并验证——较早的 Desktop idle `activity-event` 可在较新的 App Server active 后因 read-state/inventory 重放再次撤销 `app-server-live`；现两种真实事件共享进程内单调 sequence，只有严格后到的 Desktop 非 active 才能撤销，并在 full inventory 中保留私有水位。
- P1: 已修复——`codexNewThread` 只检查周额度归零且优先展示周读数，违反“任一已返回普通窗口为 0 即切 Spark”和普通 5 小时优先合同。
- P1: 已修复——全局待输入动作直接使用源数组首项，绕过紧凑角标/任务循环的置顶优先显示顺序；现三者共用 Domain 排序函数，并由“后项置顶”反向合同锁定。
- P2: 已修复——3 条历史外观测试、3 个 Runtime 配色 Action 与 Controller 暂态覆盖仍携带 RAW-071 已废止的本地颜色/对比度/配对预览门禁。
- P2: 已修复——MQTT media 正则对等价 CSS 换行敏感，Quick Jump 否定正则跨越函数边界命中后续合法 `app.hide`；两者均改为结构边界断言。
- P2: 已修复——紧凑角标帮助/ARIA 未说明“打开第一条”，且测试把旧文案固化为成功；现输入/未读动作语义进入可见提示与 ARIA，并扫描清除旧断言。
- P2: 已修复——PROJECT_STATUS/PRD/Verify 对 persisted-decision、24 小时默认、最新测试基线与 8092 当前存活状态存在漂移；现区分历史证据、当前静态产物和未执行的真实宿主更新。
- P2: 旧 runtime/float `conversations` 别名仍保留一版兼容，待 v2 退役后删除。

## Not Checked

- 2026-08-03 的完整 Vitest、`pnpm run typecheck`、preload 镜像/语法、真实只读预检和 uTools runtime validation 已通过；本增量未重新执行会写入 `dist` 的 production build，现有 dist preload 与 canonical/public 字节一致。真实宿主加载与状态转换仍未执行，自动化通过不能替代宿主验收。
- 未操作真实 Codex 任务、未归档/移除项目、未启停进程。
- 真实 uTools 宿主需正常重载后验收中断恢复 completed-unread、普通完成、任务切换和角标同步。

## Retained Minimal Guards

- 严格更旧 `startedAt`：防止乱序旧 started 反向覆盖，不影响同 revision 状态前进。
- 首次/refollow active 与 terminal 冲突的 `[0,300,1000]` 定向读取，以及 active-exit baseline：实时与全量入口共用同一转换器；精确 started/completed 可立即绕过，不兼容复核模式可接管。
- waiting-input/approval 与精确 `turn-started`：阻止 unread 把真实活动当 stale-active；只限制额外取证，不影响精确完成。
- source fingerprint、Activity generation、missing-key 行级隔离与 50/200ms 结构合并：只防协议串线、旧增量、清单误删和重复扫描；未知/缺失行不再阻断已知/现存任务状态。
