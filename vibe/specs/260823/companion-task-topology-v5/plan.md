# Companion Task Topology — V5 Delivery And V6 Corrective Plan

status: `v6-completed / automated-verified-with-known-mqtt-timeout / host-excluded-by-user`
updated: `2026-08-24`

## Ordered Work

1. `completed` — 建立 Registry、Topology、V5 类型、Runtime Identity 与 Controlled 文档。
2. `completed` — Kernel 接纳三 Provider 正式 evidence lanes，生成唯一完整 Snapshot，删除 Auxiliary Cursor。
3. `completed` — 迁移 Codex 分支、Cursor 冷/热关系、Claude Subagent 身份到通用拓扑。
4. `completed` — 建立统一 Command Gateway、operation 去重、同键串行、expected revision 重校验和 Adapter 隔离。
5. `completed` — Main、Float、角标、循环与注意力入口只消费 V5 Snapshot；增加统一根聚合摘要。
6. `completed` — 聚焦回归、受影响边界验证、镜像与文档同步；真实宿主边界按用户要求记为 `excluded-by-user`。
7. `completed` — 逐条复核 Codex Tab 的已登记需求、未登记原始来源、后期变更与当前 V5 权威，区分可直接抽取与需用户命名的条款。
8. `completed` — 只读追踪 Registry、Topology、Kernel、Command、Bridge、Controller、Main/Float 与帮助入口的现行源码调用链和旧接口残留。
9. `completed` — 补登记快速任务查看 RAW-167，消除 V4/V5 文档漂移，生成当前 Codex Tab 架构/代码总览、审计记录与变更清单。
10. `completed` — 运行 V5/Codex 7 文件 231 项聚焦契约、requirements、文档链接和 diff 校验，由 App Root 完成范围复核与接纳。
11. `completed` — 复核用户报告的两秒角标延迟、补充输入不离开待输入、多 Agent 缓存、Plan 已读/取消语义和上一个/下一个崩溃链；确认无产品级 debounce，延迟/崩溃来自分裂 reducer/cache 与 Float ACK 超时重建。
12. `completed` — 建立 V6 evidence template/batch、Topology V2 membership-only、Kernel V6 sole reducer、Snapshot V6 public/private 边界与 ACK V2；保留 Command V1/Subscribe V1 和 RAW-177 handoff。
13. `completed` — Main、Float、Codex 页面、角标、计数、注意力及 previous/next 迁移到同一 Snapshot/Command；删除 Provider 专用 Claude task sync action，配置 barrier 立即清 stale，公开 Snapshot 不再暴露 alias。
14. `completed` — 增加补充输入→running、Plan unread/read/cancel/execute、multi-agent root、100 次快速 revision、发布/打开延迟、ACK 不重建与 RAW-177 unread 保留回归；迁移 V5 fixtures。
15. `completed` — 同步本 Controlled revision、current architecture/PRD/status/help、RAW-176 登记文字与既有错误记忆；不回退 RAW-177、Source Anchor Catalog 或已移除 facade。
16. `completed` — 执行 focused、typecheck、完整测试、build、uTools/runtime、mirror、requirements/source-anchor/error-memory、doc links 与 diff gates；记录真实 Host 未运行边界。

## Provisional VerificationImpactTrace

| Changed semantic boundary | Direct checks | Wider boundary candidate |
| --- | --- | --- |
| Registry + Topology + Snapshot schema | domain/kernel topology fixtures | typecheck；公共 preload contract build |
| Kernel + Actions + Navigation | focused platform tests | repository test only if implementation confirms public root-contract/unbounded fan-out trigger |
| Cursor/Claude source adapters | cursor/claude hook and inventory fixtures | privacy allowlist/mirror checks |
| Main/Float projection | controller/domain/ui focused tests | Vite build |
| Canonical docs/errors | requirements/error-memory/code-link validators | no host inference |
| Post-V5 requirement lineage + architecture docs | requirements validator、changed-link audit、diff check | no source/build/host escalation；本轮不改变运行代码 |
| V6 evidence/Topology/Kernel/Snapshot identities | domain/topology/kernel/runtime-identity fixtures | typecheck + full suite + production/uTools build，因公共根合同和消费者扇出升级 |
| Waiting/Plan/multi-Agent/consumer latency | Kernel、App Server、Controller、Float、watcher fixtures | deterministic latency assertions；real Host latency remains separate |
| RAW-177 handoff preservation | App Server open-handoff regression + source anchor/requirements validators | no real native receipt inference |

实际 diff 同时改变生产 preload 根身份、Provider manifest、Kernel/Package schema 与全部消费者，满足根公共合同和无界扇出升级触发；完整 `pnpm run test` 已执行，结果与既有 MQTT 例外见 [verify.md](verify.md#L1)。
