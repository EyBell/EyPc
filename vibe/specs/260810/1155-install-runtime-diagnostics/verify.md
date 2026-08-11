# Codex Companion v3 Verification Record

Status: `full-automated-verified / artifact-ready / host-pending`

## VerificationImpactTrace

| 影响边界 | 自动化证据 | 当前状态 |
| --- | --- | --- |
| v3 reducer / package / no-op | Kernel、Domain、Controller 聚焦回归；1,000 等价 observation | passed |
| 无固定库存上限 | 240 个任务、三页分页、第 41/101/201 个消费者断言 | passed |
| 新任务即时展示 | membership-first / metadata-later 回归 | passed |
| 快捷键与手动跳转 | Runtime Action、navigation、operationId、alias recovery 回归 | passed |
| Codex 归档 | sync failure、verify-2 contradiction、ACK timeout、retry、success、stage logs | passed |
| diagnostics v3 | 三档/off、migration、rotation、probe、显式 level AST | passed |
| P95 发布 | 可信 observedAt → Canonical Package `<100ms` 回归 | passed |
| 全库测试 | `83/83` files、`1272/1272` tests | passed |
| type/build/mirrors/runtime validator | `vue-tsc`、1870-module production build、canonical/public/dist cmp、Runtime Identity `5/5`、uTools validator | passed |
| 真实 uTools 同包矩阵 | 宿主验收 | pending |

## Known Historical Run

本轮中途全库测试曾暴露 8 个回归，集中在无 timer 的 VM、Runtime Identity 资产清单以及旧 Controller 测试仍期待 Provider-only Codex archive 立即删卡片。对应合同修正后，最终同一源码快照的聚焦矩阵 `10/10` files、`388/388` tests 和全库 `83/83` files、`1272/1272` tests 均通过。

## Build And Static Gates

- `pnpm run build` 完成 `vue-tsc --noEmit`、1870-module Vite production build、uTools runtime preparation 和 validator。
- 产物身份：`host-36616822511986c18f2c / renderer-25da7ef64b81aadc76f8`；状态仅为 `artifact-ready`。
- Main、Float、diagnostics、task-kernel、task-actions、navigation 的 canonical/public/dist 文件逐字节一致；`public/runtime-identity.cjs == dist/runtime-identity.cjs`，`public/plugin.json == dist/plugin.json`。
- 受影响 JS/CJS `node --check` 通过；`ipcRenderer.sendSync / .sendSync( / Atomics.wait` 在 preload/public/dist 零命中；`git diff --check` 通过。
- Runtime Identity 聚焦 `1/1` file、`5/5` tests 通过；该结果也包含在全库数字中。
- 实现审查发现并修复公共类型名仍停留在 `PackageV1/DiagnosticsV2` 的语义漂移；当前 Evidence、Canonical State、Package、Intent、ArchiveResult 和 Diagnostics 公共类型均使用 V3 名称。该纯类型收口后 `5/5` files、`211/211` tests、全库与最终 build 再次通过。
- 全部已修改/新增 Markdown 的 code-link audit 与 `git diff --check` 通过；Documentation Sync v2 回执覆盖 39 份文档、15 项依赖和 7 项 validator，最终 `check status=hit`。

## Implementation Review

- P0: none。
- P1: none；Provider-only Codex archive 删除、未确认 terminal 强制 running、source generation 触发 UI、固定任务上限和公共 V1/V2 类型漂移均已移除并有回归。
- P2: none in automated scope。真实 uTools 安装、重启、状态/日志/归档矩阵是明确宿主验收门禁，不是自动化可消除的残余实现缺陷。

## Host Gate

真实安装验收必须使用最终构建的同一 `dist/plugin.json`。不得用开发态日志、手动刷新、旧安装包或 Provider RPC 成功替代 [handoff](handoff.md#L1) 中的原生状态与归档核验。
