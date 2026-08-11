# RAW-160 Companion V4 Verification Record

Status: `full-automated-verified / artifact-ready / host-pending`

## VerificationImpactTrace

| 影响边界 | 自动化证据 | 当前状态 |
| --- | --- | --- |
| V4 reducer / Plan lifecycle | 首次/修改 Plan、问题/审批、Plan/ordinary interrupted、default execution、分支冲突 | passed |
| Window / badges / cycle / pause | 跨窗口例外、无 stopped badge、独立 waiting badge、四层循环、暂停/迁移/四槽 | passed |
| Actions v2 / Execute Plan | 首击零 RPC、确认取消、capability、open/resume/start、single-flight、indeterminate、model/effort、零公共提示 | passed |
| Change-only publication | 1,000 等价 observation；Kernel/Main/Float/Navigation/Actions 零新增同步 | passed |
| Float applied ACK | received/applied/rejected、500ms 单次 resend、1s health-gated recreate、同 revision 引用稳定 | passed |
| Claude state/archive result | 新 phase 优先、旧库存不回退、running→terminal、成功提示边界 | passed |
| V3 retained foundations | 240 项、全 cursor、第 41/101/201、Codex archive transaction、Runtime Identity、diagnostics | passed |
| 受影响测试 | 13 files、445 tests | passed |
| 全仓 / type / build / mirrors / validator | `83/83` files、`1282/1282` tests、typecheck、1870 modules、逐字节镜像、语法、Runtime Identity、uTools validator | passed |
| 文档与规则审计 | 44 documents / 14 dependencies / 12 validators；项目双入口、长期任务、Claude authority、错误记忆模块/帮助、code-link、规则/旧权威扫描、diff | focused passed；broad pre-existing debt retained |
| 真实 uTools 同包矩阵 | [host handoff](handoff.md#L1) | pending |

## RAW-159 Historical Gate Review

RAW-159 的自动化基线为 83 files / 1272 tests 和 production artifact-ready；安装宿主随后复现了普通 interrupted 过宽、Plan/角标不稳定与消费者 applied 状态缺口，所以该 gate 记为 `host-reproduced-failure / superseded-by-RAW-160-v4-rework`。它的全分页、归档后置条件、诊断与 Runtime Identity 证据仍是有效回归基础，但不能单独作为当前接纳。

## Final Automated Evidence

- V4 最终受影响矩阵：`13/13` files、`445/445` tests。
- 最终全仓：`83/83` files、`1282/1282` tests；首次全仓发现 3 个 RAW-029 旧提示断言，升级到 RAW-160 固定文案后完成 Claude Bridge 与全仓复跑；最终架构收口删除 15 个 Controller 旧裁决/兜底测试，并由 Kernel ownership、attention progress、reload-required、Claude read-hint 与真实 Kernel adapter 测试承接，最终测试总数因此按当前权威基线重新计数。
- 最终聚焦身份/Kernel/Float/Actions：`4/4` files、`62/62` tests。
- `pnpm run build` 完成 typecheck、1870-module Vite production build、uTools runtime preparation 和 validator；产物身份为 `host-495d79c14c1cbb24794d / renderer-568dfd47041bcb997f6b`。
- Main、Float、Kernel、Actions、Navigation、Claude archive 的 canonical/public/dist 逐字节一致；相关 JS/CJS/MJS `node --check` 通过；同步 IPC/`Atomics.wait` 静态扫描零命中；`git diff --check` 通过。
- 改动文档 code-link audit 通过；Controlled sync group JSON 可解析且类别互斥，覆盖 44 份文档、14 项依赖、12 项 validator 和 11 个写集前缀。CodeNote `ey-pc` 项目入口只负责路由，已核对仍指向本仓 `AGENTS.md / vibe/rules/README.md / vibe/specs/PROJECT_STATUS.md`；当前状态已在被路由文件同步，因此不向全局索引复制 RAW-160 业务状态。
- 自适应错误索引只对本轮范围收口：Claude module 补齐 `module-v1`，新增 link-only Companion Task State module 为本轮 Plan/状态/缓存/版本记忆提供唯一 Primary owner。项目 flat root 缺 `root-v1` 及其历史叶子未迁移是既有仓库债务，本轮未批量移动、删除或吸收。
- `audit_ai_rules.py --mode project --git-view working` 仍报告 135 项项目级既有自适应索引/过程模板债务；按本轮新增/修改的 Plan、consumer cache、Claude phase、V4 ownership 及其模块关键词过滤为 0 项。该 broad baseline 未冒充绿色，也不扩张 RAW-160 写集。
- 规则链五层只读核验通过：Codex/Claude 全局入口均引用 CodeNote kernel；项目 `AGENTS.md / CLAUDE.md` 仅保留预期入口说明差异且共同路由同一项目规则；所有当前 rule/status 目标可读；`.agents/skills/companion-state-reconciliation` 解析到带有效 frontmatter 的 canonical Skill。未新增/改名 Skill，因此无需用本轮会话宣称新的索引加载证明。
- `codexAppServerBridge` 假 App Server 覆盖 Execute Plan；没有启动真实 Codex Turn。
- Claude archive 测试使用夹具；没有重复写真实 Claude 会话。

## Implementation Review

- P0/P1：自动化/静态范围内无已知未解决项。
- 当前非自动化门禁：真实 uTools 安装包的状态、暂停持久化、Float ACK 恢复和 Claude transition。
- 授权门禁：真实 Execute Plan 与真实 Claude 归档不是自动化验收步骤。
