---
id: eypc-codex-native-unread-schema-protocol-drift
status: verified
scope: project
fingerprint: codex-completed-unread-mismatch__obsolete-atom-reader-and-v2-policy-drop-native-identity-host-v1-and-v3-events__select-one-context-without-cross-account-union
first_seen: 2026-10-13
last_verified: 2026-10-13
review_after: 2027-01-13
evidence:
  - preload/codex/desktop-unread-evidence.cjs
  - preload/index.js
  - scripts/check-companion-native-unread.mjs
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/261013/1425-codex-side-phase/lifecycle-verify.md
tags:
  - codex-companion
  - unread-state
  - native-schema
  - protocol-version
---

# 原生未读格式与协议迁移未被兼容

## Symptom

原生已完成未读显示蓝点，EyPc 根卡未读却 unknown 或已读；持久 unread 读取失败，兼容 live 事件也未补足。只修状态映射或可选字段回退无法解决。

## Wrong Assumption

沿用旧 atom 的 unread-thread-ids-by-host-v1，并认为 thread-read-state-changed 仍为 v2；测试替身只提供旧格式与旧事件，因此未执行当前真实来源。

## Verified Root Cause

本机原生安装产物已经使用根级 electron-thread-read-state-v1，按 identityKey/executionHostKey 保存；本机状态文件旧 atom 字段已缺失。当前 native IPC read-state 为 v3，仍携带布尔值，但附加身份/执行宿主 context；旧版本策略拒绝该帧并降级。证据仅检查字段结构与原生实现，不读取凭据、不保存原始身份或任务标识。

## Detection Order

1. 核对实际已加载 Host/Renderer 与日志会话，不能将新源码当成已加载。
2. 分开检查文件大小/JSON、允许字段结构和 IPC 版本；缺旧字段不等于原生未读为空。
3. 持久读取只选一组身份与执行宿主；优先精确 live context，冷启动仅允许单身份及明确 local adoption 的迁移绑定。
4. 多身份、无绑定、已清迁移或未知版本保持 unavailable，禁止跨账号/远端桶求并集。
5. 在完整 Bridge→Kernel 中检验主/Side 未读；独立门禁运行真实解析器和版本策略，并验证旧实现 canary 被拒绝。

## Prevention Rule

原生状态升级必须用当前 schema/协议的合成夹具执行既有采集入口，再对照安装产物有限结构。保留旧协议兼容与已有文件监听/定向查询；不增加认证读取，不把不可用当已读，不用快照布尔值覆盖明确 live 权威。

## Latest Applicable Implementation

- [身份与宿主选择](../../../preload/codex/desktop-unread-evidence.cjs#L28)。
- [独立 source/packaged 检测](../../../scripts/check-companion-native-unread.mjs#L8)。
- [现场与组合回归](../../specs/261013/1425-codex-side-phase/lifecycle-verify.md#L1)。

## Alternative Route

- Status: verified（源码/生产包与组合回归）；新宿主现场验收独立记录。
- Preconditions: 原生 v1 身份状态或明确受支持旧 atom；v3 需有效本地 context。
- Ordered steps: 解析有限字段；选定单一绑定；校验 UUID 集合；保持来源权威；成员未读归约到唯一根卡。
- Verification: native/legacy 优先级、双身份隔离、远端隔离、未知版本、精确空桶、旧策略负向检测；当前 Bridge 和 Side 完成未读组合通过。
- Applicability boundary: 当前 v3 chatgpt context；其他未知身份形式不猜测，不读取认证文件；未读不供应运行/完成相位证据。
- Fallback: 不能确定绑定时 unavailable；兼容 live 来源仍可独立供应确证。

## Occurrence History

| Date | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- |
| 2026-10-13 | 原生蓝点与 EyPc completed 不一致、诊断读取失败 | 只检查旧 atom / 拒绝 v3 | 当前单身份单宿主解析与兼容 live 协议；原采集执行通路保留 | 自动验证通过，现场以本轮新宿主日志为准 |
