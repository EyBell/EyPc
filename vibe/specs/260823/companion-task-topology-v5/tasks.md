# Companion Task Topology — V5/V6 Execution Journal

status: `v6-accepted-by-root / automated-verified-with-known-mqtt-timeout / host-excluded-by-user`
updated: `2026-08-24`

## Work Units

| Unit | Owner | Scope | State | Evidence |
| --- | --- | --- | --- | --- |
| WU-01 | App Root | Authority、冲突、错误记忆、Controlled 账本 | accepted | RAW-176 change review；V4 split-path source baseline |
| WU-02 | `kernel_command_map` | 只读 Kernel/Actions/Navigation/Bridge 调用链 | accepted | 双通路与生产 facade 缺口证据进入 V5 设计 |
| WU-03 | `provider_topology_map` | 只读 Codex/Cursor/Claude 拓扑与隐私证据 | accepted | 三来源精确关系/隐私边界进入通用 graph |
| WU-04 | App Root | Registry/Topology/Snapshot/Identity 实现 | accepted | manifest、graph、V5 Kernel/Snapshot、六能力 identity |
| WU-05 | App Root | Provider 与 Command Gateway 迁移 | accepted | 三 Provider 正式注册；统一命令、去重、串行与异常隔离 |
| WU-06 | App Root | Consumer/UI 投影与摘要 | accepted | Main/Float/角标/循环同 revision；根卡聚合摘要 |
| WU-07 | App Root | Verification/doc closeout | accepted | 自动化、构建、镜像、需求、帮助、架构与错误记忆同步 |
| WU-08 | `codex_req_lineage_audit` | Codex Tab 原始需求、变更、登记覆盖与冲突只读复核 | reported → accepted-by-Root | 纠正初报口径后确认 RAW-167 父条款漏登、39 条无父 ID Action 条款不可自动编号、无未决现有语义冲突 |
| WU-09 | `codex_source_arch_audit` | V5 生产调用链、消费者、旧 facade 与文档漂移只读复核 | reported → accepted-by-Root | V5 单链成立；未发现 Controller/Renderer 旁路；识别 V4/V2 文字与 compatibility-only facade 残留 |
| WU-10 | App Root | Requirement registry、当前架构、代码总览与 assessment 同步 | accepted | RAW-167 parent + #1–#3、V5/V4 时态、Codex source map、coverage/conflict/assessment 同步；不改生产行为 |
| WU-11 | App Root | 聚焦验证、范围复核与最终接纳 | accepted | V5/Codex `7/7` files、`231/231` tests；requirements `298`；changed links/diff passed；真实 Host 排除 |
| WU-12 | App Root | V6 故障链与 sole-owner 复核 | accepted | Renderer/provider shadow reducers、configure boolean 误用、Float ACK recreate 和 Plan clear 过宽得到源码/运行时证据 |
| WU-13 | App Root | Evidence/Topology/Kernel/Snapshot/ACK V6 实现 | accepted | `task-state-v11 / registry-v1 / topology-v2 / kernel-v6 / snapshot-v6 / command-v1 / subscribe-v1 / ack-v2` |
| WU-14 | App Root | 消费者、统一跳转与公开/私有边界迁移 | accepted | Main/Float/页面/角标/previous-next 同 revision；Provider sync action removed；key-only public command |
| WU-15 | App Root | Plan、waiting、multi-Agent、配置 barrier 与 crash 回归 | accepted | exact Plan tri-state、补充输入 running、root aggregate、healthy missing ACK no recreate、RAW-177 unread retained |
| WU-16 | App Root | V6 docs/error-memory/full verification | accepted | focused `493/493`；default full `1448/1449` with sole known MQTT 5s timeout；non-Action `1278/1278`；Action 20s `171/171`；build/mirror/requirements/source-anchor/error-memory/doc gates passed；真实 Host excluded |

## Execution Constraints

- App Root 独占所有写入、架构决策、验证、canonical docs 与最终接纳。
- 两个探索单元只读；不得运行真实插件、Safari、uTools 或真实宿主测试。
- 保留并忽略用户现有 `_to_delete/`；不执行清理、删除或广泛 Git 操作。
- 不记录原始 prompt、命令、stdout/stderr、正文、summary、transcript 或 Provider 原始身份。

## Material Execution Journal

| Event | Work Unit | Evidence | Root Decision |
| --- | --- | --- | --- |
| `EV-260823-01` | WU-08 | 首次报告把 243 个已登记叶子误述为完整覆盖；coverage 反证仍有 RAW-167 与 B 类条款 | 退回同一 Attempt 纠正，不启动重复审计；纠正报告仅接纳可回源计数与身份边界 |
| `EV-260823-02` | WU-08 / WU-09 | 配置角色 `explorer_terra` 在当前运行时不可用 | 使用同模型/effort 的只读 Terra agent 作为 verified alternative；所有 canonical 决策仍由 Root 完成 |
| `EV-260823-03` | WU-10 | 用户将复核焦点进一步限定为 Codex 功能 Tab | 保持 V5 全局拓扑为共享底座，优先同步 Codex 原始需求、快捷任务视图、Environment Action、打开/已读边界和代码总览 |
| `EV-260823-04` | WU-11 | 当前工作树聚焦契约、登记和文档检查均通过；无 `conflicted` leaf | 接纳 post-V5 audit；保留 87 条无父 ID、legacy facade 与外部 native-control contract 作为显式非完成项 |
| `EV-260823-05` | WU-12 | 用户复现角标约两秒延迟、补充输入仍待输入、Plan 已读状态错误、多 Agent cache 异常及 previous/next 崩溃 | 在同一 Controlled ledger 建 V6 corrective revision，不启动平行状态系统 |
| `EV-260823-06` | WU-13 / WU-14 | 源码显示默认 coalesce 为 0；约 1 秒 ACK retry/recreate 与 Renderer/provider shadow cache 才是可见延迟/崩溃链 | Topology 降为 membership-only；Kernel 唯一裁决；ACK timeout 不再重建健康 Float |
| `EV-260823-07` | WU-15 | RAW-177 已在 C-1～C-3 后建立 native receipt/Source Anchor 边界 | V6 只接入其 handoff receipt；不改冲突边、不清 Provider unread、不恢复已移除 facade |
| `EV-260824-08` | WU-14 / WU-16 | 最终 consumer 审核发现 Kernel `unknown` 仍从 inventory 继承旧 bucket/activity/unread/archive，且 verified archive 后 Controller 仍按 Provider 手工删缓存 | 公开 projector 改为 alias-free 中立 unknown；Controller 只同步 Kernel 的原子移除，Provider inventory 只作 metadata/evidence 来源；补回归并纳入既有 consumer-cache 错误记忆 |
