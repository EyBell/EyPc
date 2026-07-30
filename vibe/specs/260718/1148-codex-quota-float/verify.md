# Codex 任务状态验证记录

Tool: codex
Date: 2026-07-30

## Review Target

- Requirement: [RAW-116–130](raw-requirement.md#L1)
- Plan: [plan.md](plan.md#L1)
- Implementation: preload 直接证据/原生 unread/Activity generation 与 mode-aware latest-Turn 复核、Controller 单一 active-exit 转换器和行级库存隔离、Domain 明确停止与原生 unread 投影；quota-auto 普通窗口仲裁、直接外观持久化和结构边界静态回归同步收口。
- Sidecar: 主线程。

## Checked

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
| Preload | RAW-129 基线两份 `node --check` pass 且当时字节一致；RAW-130 当前仅做静态检查：canonical/public Codex 段精确一致、私有 sequence 未进入公开 Activity entry、`git diff --check` pass。两份文件的其它 Window Jump 差异属于并行既有改动，未覆盖 |
| 文档引用 | changed Markdown 全量 `audit_code_links.py` pass；`Code link audit: OK` |
| 完整仓库 | `633 / 633` pass，`53 / 53` 文件通过；无“既有/已知失败”留存 |
| RAW-130 增量 | 实现与 Bridge 回归合同已写；链接审计和上述静态边界检查通过。依项目门禁未执行测试、typecheck、build、preload 语法或真实 uTools 验收 |

## Full Matrix Findings

- 状态主矩阵当前 `168 / 168` pass；RAW-128 回归覆盖 10 类跨层可复现阻断，生产修改后全部转绿。
- 扩展到仓库内 9 个 Codex 命名测试文件为 `189 / 189`。3 条 `codexAppearance` 旧断言已按 RAW-071 改为直存直渲合同；2 条 `codexNewThread` 已按 RAW-046 修正真实模型仲裁与读数优先级。
- 完整仓库的 `mqttPage` 与 `quickJump` 各 1 条误报已消除：前者容忍等价 CSS 换行并限定目标 media 规则，后者只检查 `handleQuickJumpShortcut` 函数体，不跨到后续 `applyPluginRoute` 的合法 `app.hide`。

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
- P1: 已实现、未执行——较早的 Desktop idle `activity-event` 可在较新的 App Server active 后因 read-state/inventory 重放再次撤销 `app-server-live`；现两种真实事件共享进程内单调 sequence，只有严格后到的 Desktop 非 active 才能撤销，并在 full inventory 中保留私有水位。
- P1: 已修复——`codexNewThread` 只检查周额度归零且优先展示周读数，违反“任一已返回普通窗口为 0 即切 Spark”和普通 5 小时优先合同。
- P2: 已修复——3 条历史外观测试、3 个 Runtime 配色 Action 与 Controller 暂态覆盖仍携带 RAW-071 已废止的本地颜色/对比度/配对预览门禁。
- P2: 已修复——MQTT media 正则对等价 CSS 换行敏感，Quick Jump 否定正则跨越函数边界命中后续合法 `app.hide`；两者均改为结构边界断言。
- P2: 旧 runtime/float `conversations` 别名仍保留一版兼容，待 v2 退役后删除。

## Not Checked

- 未操作真实 Codex 任务、未归档/移除项目、未启停进程。
- 真实 uTools 宿主需正常重载后验收中断恢复 completed-unread、普通完成、任务切换和角标同步。

## Retained Minimal Guards

- 严格更旧 `startedAt`：防止乱序旧 started 反向覆盖，不影响同 revision 状态前进。
- 首次/refollow active 与 terminal 冲突的 `[0,300,1000]` 定向读取，以及 active-exit baseline：实时与全量入口共用同一转换器；精确 started/completed 可立即绕过，不兼容复核模式可接管。
- waiting-input/approval 与精确 `turn-started`：阻止 unread 把真实活动当 stale-active；只限制额外取证，不影响精确完成。
- source fingerprint、Activity generation、missing-key 行级隔离与 50/200ms 结构合并：只防协议串线、旧增量、清单误删和重复扫描；未知/缺失行不再阻断已知/现存任务状态。
