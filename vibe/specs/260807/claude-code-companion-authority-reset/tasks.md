# Claude Code Companion 权威重置 — Tasks

updated: `2026-08-07`
overall_status: `implementation-landed / acceptance-pending`

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
