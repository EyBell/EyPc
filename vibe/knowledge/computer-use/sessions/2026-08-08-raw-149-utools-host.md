---
schema: computer-use-session/v1
session_id: raw-149-utools-host-20260808
status: interrupted
recording_fidelity: live-complete
project: EyPc
task_ref: ../../../specs/260718/1148-codex-quota-float/verify.md
route_id: utools-developer-tools-reconnect
host: codex-desktop-macos
application: uTools
surface: Developer Tools / EyPc task companion
started_at: 2026-08-08T13:47:00+08:00
ended_at: 2026-08-08T13:48:51+08:00
privacy: sanitized
---

# RAW-149 uTools 真机验收会话

## Preflight

- Goal: 将本轮 `task-state-v6` 构建正常重新接入 uTools，观察真实 EyPc 待输入/已完成未读入口与匿名状态；若已有合适的非 Full Access 任务，再验证权限请求新增与解除生命周期。
- Dedicated-route blocker: scoped CLI 已完成真实 Provider→生产 Domain 只读预检，但运行中五份 EyPc ASAR 均为 v5；项目运行时合同确认 Preload 变更只能通过 uTools Developer Tools 重新接入后生效，当前无等价重载 CLI/API。
- Route evidence: project uTools development runtime and verified child-preload reload memory.
- Host/sandbox: 本机 macOS；仅操作 uTools Developer Tools 与 EyPc/Codex 任务表面，不读取任务正文、命令、路径、权限内容或原始请求 ID。
- Allowed side effects: 在 uTools 中选择仓库 `dist/plugin.json` 并正常重新接入/打开 EyPc；只读观察匿名计数、版本、排序和进入/解除结论；打开既有任务但不代答。
- Forbidden side effects: 不批准/拒绝/提交 Codex 请求，不修改 Access/系统权限/凭据，不杀进程，不归档/删除任务，不写 Codex 原生状态，不上传或外传数据。
- Confirmation gates: 任何权限或 Access 变更、批准/拒绝、进程终止均停在动作前请求用户确认；普通本地开发插件重接入已由当前实现与真机计划明确授权。
- Success assertions: 运行宿主显示 v6；真实待输入计数与当前生产 Domain 一致；专用入口呈现“最新优先，连续触发依次打开”；成功打开才推进。实时权限生命周期只有在无需变更权限且可最终由用户拒绝时才可接纳。
- Cleanup/retention: 不保存截图、AX 原文或任务内容；仅保留本会话的脱敏方法账本。开发服务若必须启动但不能在当前授权下终止，先停在启动前。

## Events

| seq | at | method | normalized_input | pre_state | result | post_state | assertion | decision | impact | evidence_ref |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-08-08T13:48:51+08:00 | `get_app_state` | `app=/Applications/Microsoft Edge.app` | Computer Use exclusion gate admitted via established-route-blocked; first machine-profile observation required before uTools action | error: Mac locked and automatic unlock unavailable | no UI state observed | uTools v6 reconnect not advanced | stop; require manual unlock, no blind retry | none | — |

## Closeout

- Project/application state: uTools remained running with its pre-existing v5 EyPc ASARs; no UI action or plugin reconnect occurred.
- User-data restoration: not applicable; no user data or application state was changed.
- Retained artifacts: this sanitized ledger only.
- External side effects: none.
- Unverified assertions: running-host v6 identity, compact hint/action behavior, real approval add/open/resolve lifecycle and reload progress restoration.
- Interruption reason: the Mac was locked and the Computer Use host could not unlock it; bypassing the lock or repeating blind UI calls is forbidden.
- project_route: candidate; uTools Developer Tools reconnect remains the only established host route after manual unlock.
- project_error: none.
- global_extraction: none.
