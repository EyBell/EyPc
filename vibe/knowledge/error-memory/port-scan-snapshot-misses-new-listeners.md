---
id: eypc-port-scan-snapshot-misses-new-listeners
status: candidate
scope: project
fingerprint: port-scan-snapshot-not-live__ensure-skip-when-list-nonempty__new-listener-invisible-until-ctrl-r
first_seen: 2026-08-14
last_verified: 2026-08-14
review_after: 2026-11-14
evidence:
  - preload/index.js
  - src/runtime/appRuntime.ts
  - src/App.vue
  - src/domain/ports.ts
tags:
  - ports
  - scan-snapshot
  - lsof
  - stale-state
---

# Port Scan Is A Snapshot, Not A Live Watch

## Symptom

A process is listening on a TCP port (including 80), but the EyPc ports list does not show it after the user opens or stays on the ports tab.

## Wrong Assumption

1. The ports tab continuously watches listeners, or switching to the tab / focusing search refreshes the list.
2. Privileged port 80 is invisible to unprivileged `lsof`, or the parser drops `:80`.

## Verified Root Cause

The scan is a one-shot platform listener snapshot. Plugin mount runs it once; later tab/search entry calls `ensurePortsScanned()`, which returns immediately when the in-memory list is already non-empty. New listeners that bind after that snapshot stay invisible until `Ctrl+R` / 刷新扫描.

On the observed host, the bounded platform probe and parser both retained the current listener for port 80. The 2026-08-14 miss coincided with a user-owned listener binding after the earlier snapshot. Default list order follows the platform probe rather than port number, so port 80 can also sit among many rows unless the user searches it.

Inference (not yet host-UI proven): whether the user clicked 刷新 after bind, versus looking at a stale mount snapshot, was not observed inside uTools.

## Evidence

- Mount scan: [App.vue](../../../src/App.vue#L492).
- Skip when list already filled: [appRuntime.ts](../../../src/runtime/appRuntime.ts#L7019).
- Preload platform-probe and `ok: !error` gate: [preload/index.js](../../../preload/index.js#L762).
- Parser keeps `:80`: [ports.ts](../../../src/domain/ports.ts#L51).
- 2026-08-14 live probe: the same bounded platform-probe contract and `parseLsofListeningTcp` retained the current listener for port 80.

## Detection Order

1. Confirm a TCP LISTEN exists with the same bounded platform probe the plugin uses, not Activity Monitor or a browser URL alone.
2. Parse that bounded probe result with `parseLsofListeningTcp` / preload `parseLsof` and check the port is retained.
3. Ask whether 刷新扫描 / `Ctrl+R` ran *after* the listener bound. Tab focus and search focus are not a rescan.
4. If the row exists in the snapshot, check leftover `portSearch` and an applied port group before concluding the scan missed it.
5. Only then consider platform-probe privilege or a failed result discarding the snapshot.

## Prevention Rule

Treat ports as a snapshot. After starting a server, press 刷新扫描. Do not diagnose “lsof cannot see port 80” until the bounded probe result and parser have been checked against the current listener. Do not treat tab focus or `ensurePortsScanned()` as a refresh.

## Alternative Route

- Status: `candidate`.
- Preconditions: a local TCP listener exists and the ports tab is already populated.
- Ordered steps: `Ctrl+R`; if still missing, search the exact port number with no group filter; if still missing, execute the project's bounded listener diagnostic and parser.
- Verification: the plugin list shows `:<port>` for the expected listener after a post-bind refresh. Host UI confirmation is still pending.
- Applicability boundary: EyPc ports tab on macOS/Linux `lsof` and Windows `netstat` snapshots; not a live socket watch.
- Fallback: if `lsof` itself omits the socket, that is a privilege/TCC issue, not this snapshot skip.

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-14 | inspect-report: ports tab missed 80 | User: scan did not show port 80 | Assumed parser/platform probe dropped privileged 80 | Bounded live probe and parser retained port 80；the listener bound after the earlier snapshot；`ensurePortsScanned` skips a non-empty list | None this round (diagnosis only) | candidate; uTools UI refresh not observed |
