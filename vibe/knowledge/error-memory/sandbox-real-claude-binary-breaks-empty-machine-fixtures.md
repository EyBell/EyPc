---
id: eypc-sandbox-real-claude-binary-breaks-empty-machine-fixtures
status: verified
scope: project
fingerprint: sandbox-claude-binary__cli-discovery-fixtures-assume-empty-machine__fixed-probe-paths-see-host-binary__treat-as-environment-not-regression
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - tests/platform/claudeCliDiscovery.test.ts
  - tests/platform/claudeBridge.test.ts
  - vibe/specs/260806/1046-claude-quota-status-visibility/verify.md
tags:
  - verification-environment
  - sandbox
  - claude-cli-discovery
  - fixture-isolation
---

# Sandbox Real Claude Binary Breaks Empty-Machine Fixtures

## Symptom

在云端/Cowork Linux 沙箱里跑 `claudeCliDiscovery` 与 `claudeBridge` 的环境探测用例，8 项失败：期望 fixture 临时目录里的假二进制或「未安装」，实际返回 `/usr/local/bin/claude`。

## Wrong Assumption

以为失败是本轮呈现层改动引入的回归。

## Verified Root Cause

这类沙箱自带真实 Claude Code（`/usr/local/bin/claude`）。CLI 探测器有固定的兜底探测路径（不随 fixture 的 PATH/HOME 覆盖），「空机器」fixture 隔离不了它。沙箱无权限移走该二进制（`mv` EACCES），无法在环境内自证。

## Detection Order

1. 看失败断言的 Received 值：出现 `/usr/local/bin/claude` 即为环境泄漏，不是回归。
2. `which claude` 确认沙箱真装了二进制。
3. 确认失败用例的被测源码本轮未触碰（git diff 范围核对）。

## Prevention Rule

在自带 Claude Code 的沙箱里验证时，`claudeCliDiscovery.test.ts` 与 `claudeBridge.test.ts` 的环境探测用例按环境失败归档，不计入回归判定；其余 claude 套件（BridgeSafety / PreloadCore / QuotaFallback / codexCompanion）在沙箱可靠。宿主侧全量跑仍归用户验收。

## Alternative Route

若要在沙箱强行隔离：给探测器加可注入的兜底路径列表（生产默认不变），fixture 传空列表。属测试架构改动，未实施。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：额度可见性轮验证时确认 8 项失败全部环境所致（基线对照 + Received 路径证据） |
