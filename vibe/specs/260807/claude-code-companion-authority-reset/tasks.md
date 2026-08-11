# Claude Code Companion 权威重置 — Tasks

updated: `2026-08-11`
overall_status: `implementation-landed / RAW-030-full-automated-verified / artifact-ready / native-sidebar-unsupported / host-acceptance-pending`

| ID | Work | Status |
| --- | --- | --- |
| CCR-0 | 冲突扫描、用户选择账本、路线裁决与旧权威降级 | completed |
| CCR-1 | Code-only inventory/title、`completedTurns` 与增量元数据 patch | completed |
| CCR-2 | 版本门禁 App log parser + official Hook correlation + 历史恢复 | completed |
| CCR-3 | 原生 LevelDB 精确未读与历史 `completed-unread` 提升 | completed |
| CCR-4 | inventory/state/unread/quota/App presence 独立全局热缓存 lane | completed |
| CCR-5 | Epitaxy 精确打开、presence 缓存与 latest-target-wins 单飞 | completed |
| CCR-6 | Node 16 HTTPS、动态额度窗口、reset freshness 与退避计划 | completed |
| CCR-7 | Bridge V2、Controller 竞态屏障、Renderer quota chip/tooltip 整理 | completed |
| CCR-8 | 自动化：历史、歧义、轮转、版本失配、request-id、竞态、阻塞与连跳 | completed |
| CCR-9 | 本机库存/状态源、uTools LevelDB、10 连跳 no-clone 定向探针 | completed-targeted |
| CCR-10 | Controlled 文档、项目权威、错误记忆和旧任务 tombstone 同步 | completed |
| CCR-11 | 历史完整 `test → typecheck → build → verify`（执行事实保留，默认 gate 已废止） | superseded-overbroad |
| CCR-12 | uTools/Claude permission/input/response/completion/unread/title/restart 完整矩阵 | pending-host |
| CCR-13 | Claude App 主权威 5h/周/Fable/reset 定向实机读取 | completed-targeted |
| CCR-14 | 规划前 impact trace、full-suite provenance、全局规则/Skills 与项目适配器同步纠正 | completed-rules-focused |
| CCR-15 | Claude App 加密 OAuth 适配、动态 limits、独立 reset/生命周期调度与安全诊断 | completed |
| CCR-16 | state/unread generation、Controller/Float revision、两轮失败 unknown 与 V2 稳定复制 | completed |
| CCR-17 | 精确打开后的同 completion 进程内已读提示与有界原生复读 | completed |
| CCR-18 | 虚拟项目合并、Claude-only 项目、三态 provider 筛选与能力禁用 | completed |
| CCR-19 | 文本化归属、8%/12% 来源背景、键盘/ARIA/高对比度 | completed |
| CCR-20 | 父 Turn Hook reducer、App/Hook/history 集中仲裁与 generation-first 版本比较 | completed-focused-verified |
| CCR-21 | state/unread Promise singleflight、Claude-only 单项同步与成功打开后静默同步 | completed-focused-verified |
| CCR-22 | RAW-024、当前文档/索引/错误 occurrence 与五份 `archived-linked` 历史文档同步 | completed-linked / no-physical-migration |
| CCR-23 | `companion-task-actions-v1` Provider registry、归档 single-flight 与统一 Controller mutation reducer | completed / focused-automated-verified |
| CCR-24 | `claude-metadata-archive-v2` 唯一文件索引、单字段原子事务、并发保护与安全回滚 | completed / focused-automated-verified |
| CCR-25 | Claude 精确 membership delta、一秒索引 watchdog、归档后 open preflight | completed / focused-automated-verified |
| CCR-26 | `eypc-companion-archive` mainHide 五秒同身份确认与帮助/权威/错误记忆同步 | completed / focused-automated-verified |
| CCR-27 | 用户另行确认后的 completed 会话 D′ 真机 canary 与 Claude 手动归档即时移除 | canary-passed / manual-archive-delta-pending（2026-08-10 用户授权后执行真实归档通过，见 [verify.md](verify.md#L94)；Float 点击移除与 App 手动归档 delta 仍待宿主观测） |
| CCR-28 | RAW-027 V2 membership/phase/unread 独立 lane、最新包重放与 V1 fail-closed | completed-focused-verified |
| CCR-29 | RAW-027 Host+Renderer 多订阅、首次库存后动态 watcher 与 unread singleflight | completed-focused-verified |
| CCR-30 | RAW-027 trusted-push 快路、Claude-only gap recovery、latest-question 排序与首键即时导航 | completed-focused-verified |
| CCR-31 | 真实 Claude running→completed-unread、延迟期间打开竞态与跨来源快速连按 | pending-host-acceptance |
| CCR-32 | RAW-028 generic session-end completion 保留、native unread 单调完成投影与最终 package 消费一致性 | completed-focused-verified |
| CCR-33 | RAW-028 移除 Claude 固定库存上限、稳定归档确认与 metadata rebase/单次写前重试 | completed-focused-verified |
| CCR-34 | RAW-028 真实正常完成→未读→已读→新 Prompt 与两次 Claude 归档自动移除 | pending-host-acceptance |
| CCR-35 | RAW-029 D-1 归档提示边界与 D-2 原生侧栏及时收敛能力核验 | D-1 completed-focused-verified / D-2 verified-unsupported-currently |
| CCR-36 | RAW-030 新 session phase 因果优先、原子状态消费、V4 Latest Cache/Float applied ACK 与固定归档提示 | completed-full-automated-verified / artifact-ready / real transition pending |

## Execution Journal

- 2026-08-07 — 撤销“Hooks-only 已完成”和“watcher 延迟等于 UI 发布延迟”；选定版本门禁日志 + Hooks + Code 元数据 + LevelDB 未读。
- 2026-08-07 — 状态、库存、未读、额度和 App presence 拆为独立热 lane；quota 阻塞不再串联任务状态。
- 2026-08-07 — 实机元数据由 25 条中的 17 unknown/0 completed 恢复到 17 completed/5 stopped/3 unknown；当前抽样没有 live running/waiting，不能替代交互矩阵。
- 2026-08-07 — 精确 LevelDB 键包含 Chromium string tag；uTools 宿主 30/30 读取通过，未读集合在该次样本为 0，尚未完成原生小点进入/移除同屏实验。
- 2026-08-07 — 10 次连续快捷跳转收敛为最终目标一次派发，前后 25 条元数据不变；selection/dispatch 性能通过。
- 2026-08-07 — 早期错误凭据/时点只证明 HTTP 401/429，不能作为当前额度权威；后续 Claude App 显式授权路线已用 HTTP 200 与三窗口 reset 取代该门禁，最终 UI 同屏仍单独待验收。
- 2026-08-07 — 代码复核关闭 inventory 失败清空热视图、标题 patch 推进历史 evidence、隐式全局 fetch、日志 occurrence 去重、版本门禁重复进程读取、冷 presence 无硬边界、窗口 freshness 猜测与 watcher E2E 缺口；当前自然样本为 26 条（3 running / 16 completed / 5 stopped / 2 unknown）。
- 2026-08-07 — 历史 `test → typecheck → build → verify` 的运行结果保留为事实，但用户确认该 ladder 在规划阶段未经 impact trace 就被过宽写入；CCR-11 不再是当前 gate，也不得因批准旧计划而复跑。
- 2026-08-07 — RAW-018/DEC-10 生效：计划命令必须来自 provisional impact trace；全局 testing/process/reminder/orchestration/review/closeout 与 EyPc 双适配器/项目规则同步，规则纠正只做受影响验证。
- 2026-08-07 — RAW-019～023 落地：修复 Claude App quota 凭据/limits 形状、state/unread/revision 代际、同完成轮次已读回跳、虚拟项目筛选与文本化归属；受影响 12 文件自动化首轮 286/286、后续定向增量与 typecheck/build/uTools validator 通过。
- 2026-08-07 — 最终受影响自动化 16 文件 343/343、typecheck、production/uTools build 通过。真实 Claude App usage 返回 200，严格为 5h、全模型周、Fable scoped 三窗口/reset；状态探针 26 行（3 running / 17 completed / 4 stopped / 2 unknown），unread 30/30 稳定读到 1 条且无临时目录泄漏，保留 EyPc 点击移除/不回跳交互门禁。
- 2026-08-08 — RAW-024 复现 Stop→SubagentStop 假 running：旧 fold 把子代理/工具尾事件当父 Turn 活动；改为纯父 Turn reducer与 App terminal 同 Turn 优先，并加入真实单项 state/unread 同步。人工 completed/read 覆盖被明确排除。
- 2026-08-08 — 五份仍以当前口吻出现的 Claude 历史文档按全局规则升级为 `archived-linked`；原路径和正文保留，物理迁移未执行且未获授权。
- 2026-08-08 — RAW-024 聚焦回归 `4 files / 120 tests` 与固定动作 `1/1` 通过；临时 scoped `vue-tsc`、canonical preload sync、1868-module Vite production bundle、runtime preparation 和 uTools validator 通过。本机匿名探针把 27 条任务投影为 0 running / 24 completed / 1 stopped / 2 unknown，25 条由 App log 直接确认；真实旧任务 UI 点击同步与未读进出仍保留为交互门禁。
- 2026-08-08 — EyPc 文档收据先以 26/41/22 精确命中，随后旧 provider 归档文档被并发 RAW-149 工作追加 attention 顺序说明而变为 `scope_changed`；归档/链接复核仍通过。本任务保留外来 hunk，停止重签，不把它纳入 RAW-024 成果。
- 2026-08-09 — 更新引入 RAW-025/026（Codex Companion RAW-154）：本机只读干跑已证伪 Deep Link→AX 路线，当前实现改为 D′ 单目标元数据事务；App 日志降为增强证据，归档不再打开 Claude。
- 2026-08-09 — 统一 Dispatcher、Controller mutation reducer、精确文件 delta/一秒 watchdog、归档后 open preflight 与 mainHide 五秒确认已落地；定向测试、镜像、构建、链接/规则审计及私有同步回执均已收口，真实 canary 未获单独确认前不执行。
- 2026-08-09 — RAW-154 最终影响矩阵 `20/20` files、`550/550` tests，typecheck、1868-module production/uTools build、runtime validator、canonical/public 镜像、JS/CJS 语法与 diff 检查通过；未触发全仓 Vitest/verify，真实 Claude 数据零写入。
- 2026-08-09 — 文档同步组扩展为 34 documents / 49 dependencies / 31 validators；33 个变更 Markdown 零断链，适配器共享正文一致，RAW-154 私有同步回执重新记录。历史 v5 回执的并发 scope-change 事实继续保留但不再代表当前门禁。
- 2026-08-11 — RAW-029 将 D′ 成功提示收窄为 EyPc 已归档/移除 + Claude 原生侧栏未确认；聚焦 3 文件 100/100、Preload 语法/镜像、typecheck、1870-module production build、runtime preparation/validator 通过，产物身份为 `host-36616822511986c18f2c / renderer-25da7ef64b81aadc76f8`。首次产物校验发现 checker 固定旧文案，已按同一合同改为三段语义锚点并在最终构建闭合。只读产物、官方入口和脱敏运行期证据共同判定 D-2 当前不具备受支持原生入口，未接入私有 IPC、AX/JXA/UI 自动化或任何新 Claude 写路径。
