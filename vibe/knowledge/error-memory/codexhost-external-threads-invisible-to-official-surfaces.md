---
id: eypc-codexhost-external-threads-invisible-to-official-surfaces
status: verified
scope: project
fingerprint: codexhost-external-harness-threads-absent-from-official-thread-list-and-unread-atom__rendezvous-only-in-harness-child-env__delegation-cli-is-contract-surface
first_seen: 2026-09-01
last_verified: 2026-09-01
review_after: 2026-12-01
evidence:
  - preload/codex/codexhost-discovery.cjs
  - preload/index.js
tags:
  - codexhost
  - codex-companion
  - inventory-membership
  - unread
---

# CodexHost 外部 Harness 会话对官方 Codex 面完全不可见

## 症状

CodexHost（codex-host shim）托管的外部 Harness 会话（claude-code/pi/grok/omp/dsh）在 Codex Desktop 侧栏可见、可跳转、带未读点，但 EyPc 完全不显示；官方 `codex app-server` 的 `thread/list`/`thread/read` 都查不到这些线程。

## 错误假设

以为外部会话是原生线程的变体，能从官方清单或 rollout 文件发现。实测它们不落 `~/.codex/sessions`、不进官方清单、未读也不进官方持久未读原子（`unread-thread-ids-by-host-v1` 全部 host 桶实测缺席）。

## 已验证根因

CodexHost 是官方 app-server 的 shim：外部会话由 Host Runtime 托管并直接投影给 Desktop UI，数据面完全在 Host 内。对外唯一契约面是委派 CLI（`codexhost thread list/read/…`），鉴权需 `CODEXHOST_RUNTIME_ENDPOINT/TOKEN`。两个取会合点的坑：

1. **launcher 进程 env 里的 endpoint 是陈旧值**（旧 runtime 的端口）；真实端口要看 host-runtime 进程实际监听。
2. **有效 token 只在 runtime 派生的 harness 子进程 env 里**（launcher 的 token 同样过期，runtime 自己的 env 也没有）。

跳转无需新通道：外部线程的 `codex://threads/<id>` 深链由 Desktop（shim 下）正常解析，与原生任务同方案（已实跳验证）。

## 检测顺序

1. 侧栏可见但 EyPc 缺席的线程，先 `codexhost thread list --cwd <项目根>` 判定是否 Host 托管（`harnessId != codex`）。
2. 会合点取证：`ps -axww` 找 `node …/host-runtime/dist/main.js … app-server`（排除 `codexhost launch` 行），`pgrep -P` 取子进程，读子进程 env。
3. 未读对不上时先查官方未读原子全部 host 桶；缺席即为 Host 内部状态，EyPc 无处可读，不要在 EyPc 里找丢失路径。

## 预防规则

- 已实施（2026-09-01）：[codexhost-discovery.cjs](../../../preload/codex/codexhost-discovery.cjs#L1) lane——会合点发现（仅信 harness 子进程 env）、CLI `thread list` 契约面、TTL 快照、外部行+合成 turn 注入扫描；外部 id 从官方 turn/goal 读取与 membership 回扫中剔除；token 仅驻内存、不入日志与持久文档。
- CLI `completed` 必须映射为 connector `idle` + 已确认 `snapshot-corroborated` Turn，禁止再写成官方 `notLoaded` 或弱 `inventory` 终态。Desktop follow 不得把无 waiting flag 的已确认完成行重新打成进行中。
- 外部未读只信 Host `hasUnreadTurn`；字段缺省的新完成不得宣称已读。官方未读原子对这些 id 无发言权，不得覆盖 Host 未读。
- 运行中快照可缩短 TTL，墙钟不能单独制造终态。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-09-01 | codexhost 对话识别与跳转 | 用户要求识别 Host 托管会话并跳转 | 官方清单/rollout/未读原子三面皆缺席 | 委派 CLI 实测枚举+实跳；lane 实装并实机验收（发现 6 行、targets 60→67） | 预防规则已实施 / 未读蓝点待二期 |
| 2026-09-01 | RAW-190 完成态 | 已识别的额外进程完成后仍停在进行中 | CLI completed 被当成 notLoaded/弱 inventory；Desktop 覆盖 status/unread | idle + snapshot-corroborated；Host unread 优先；禁止无 flag 的 desktop-live 复活 | candidate；聚焦测试通过，真实 uTools 待重载 |
