---
id: eypc-codex-gui-pac-proxy-timeout
status: verified
scope: project
fingerprint: codex-app-server-rpc-times-out-in-utools__macos-system-proxy-is-local-pac-but-gui-child-has-no-explicit-proxy-env__derive-bounded-static-loopback-pac-for-child-only__eypc-codex-provider
first_seen: 2026-07-18
last_verified: 2026-07-18
review_after: 2027-01-18
evidence:
  - user-host-observation
  - system-proxy-state-check
  - regression-test
  - proxy-free-real-app-server-smoke
tags:
  - codex-app-server
  - utools
  - macos
  - pac
  - proxy
  - child-process
---

# Codex App Server Times Out In A GUI/Local-PAC Environment

## Symptom

The real uTools Codex page reached a live App Server but returned `Codex App Server 响应超时` after the bounded RPC timeout. Quota and configuration remained unavailable even though the proxy application's system-proxy switch appeared enabled.

## Wrong Assumption

The initial diagnosis treated disabled manual HTTP/HTTPS proxy flags as proof that macOS system proxy was disabled. It missed the separately enabled PAC configuration. A second tempting assumption was that a system PAC automatically applies to every local child-process network client.

## Verified Root Cause

macOS had an active local PAC, while the GUI-launched uTools/App Server process had no explicit proxy environment. The Codex App Server network path did not evaluate that PAC. The process therefore initialized successfully but its network-backed quota/config RPC timed out. The same bridge succeeded when an HTTP proxy was applied to the Codex child only.

## Evidence

- Controlled child environment and PAC derivation: [preload/index.js](../../../preload/index.js#L1).
- Static-loopback, explicit-precedence and unsafe-PAC regressions: [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1).
- Proxy-free real App Server acceptance: [verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1).

## Correct Detection Order

1. Inspect the complete macOS proxy dictionary, including `ProxyAutoConfigEnable` and the PAC URL; do not infer global state from manual HTTP/HTTPS flags alone.
2. Distinguish process startup from RPC connectivity. A live wrapper/native process plus a bounded RPC timeout is not a missing App Server.
3. Reproduce from a GUI-like environment with shell proxy variables removed, then compare with a child-only explicit proxy without reading or displaying its value.
4. If a PAC is active, accept only an unauthenticated loopback URL and a bounded static `FindProxyForURL` return whose first directive is a loopback HTTP `PROXY`.
5. Re-run the real quota/config read with proxy variables removed and confirm that no test App Server remains after bridge close.

## Prevention Rule

GUI-hosted provider bridges must treat macOS PAC discovery and child-process proxy configuration as separate contracts. Never execute PAC JavaScript, fetch remote PAC URLs, persist proxy material, change system proxy settings, or assume that a visible proxy toggle is consumed by a non-browser child network stack.

## Latest Applicable Implementation

[preload/index.js](../../../preload/index.js#L1) preserves explicit proxy variables, otherwise performs a bounded macOS-only local-PAC probe and adds compatible proxy variables only to the spawned Codex environment. Unsupported PAC shapes fail open to the existing launch path. [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) locks the supported and rejected shapes.

## Alternative Route

- Status: `verified`.
- Preconditions: EyPc runs on macOS; the GUI host has no explicit proxy variables; the active PAC URL and selected HTTP proxy endpoint are unauthenticated loopback addresses; the PAC has one static return and begins with `PROXY`.
- Ordered steps: prefer inherited explicit proxy configuration; read bounded system proxy metadata; fetch the local PAC without redirects; parse but never evaluate the strict static subset; inject uppercase and lowercase HTTP(S) proxy variables into the Codex child only; continue the original launch path when any check fails.
- Verification: focused bridge tests reject dynamic, remote and SOCKS-only shapes; full tests/typecheck/build pass; a real proxy-variable-free quota/config read succeeds with Weekly-only degradation.
- Applicability boundary: EyPc's macOS Codex App Server launch. It does not authorize a general PAC evaluator, remote/corporate proxy import, credential storage, parent-environment mutation or system network changes.
- Fallback: preserve the structured timeout and last-successful stale quota; add an explicit product proxy setting only if a future non-static or non-loopback requirement is confirmed.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18 | Codex quota/task companion | Real uTools changed from immediate process exit to a bounded App Server timeout | Treat manual HTTP/HTTPS flags as the whole system proxy state and rely on the visible proxy toggle | PAC state comparison plus GUI-like proxy-free reproduction | Derive only the verified static loopback PAC into the Codex child environment | verified; source/package pass, refreshed uTools UI remains a host observation |
