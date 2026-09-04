# Runtime And Packaging Error Memory Route

<!-- adaptive-document-index: module-v1 -->

## Scope

Link-only route for GUI launch environments、preload/runtime identity、packaging manifests、native addons、host lifecycle and local tooling failures.

## Current Authorities And Routes

- [Architecture](../../ARCHITECTURE.md#L1)
- [Project documentation rules](../../../rules/documentation.md#L1)
- [Controlled runtime verification](../../../specs/260810/1155-install-runtime-diagnostics/verify.md#L1)
- [Package scripts](../../../../package.json#L1)

## Primary Error Records

- [Float bridge mock contract drift](../codex-float-bridge-mock-contract-drift.md#L1)
- [GUI NVM launcher path](../codex-gui-nvm-launcher-path.md#L1)
- [GUI PAC proxy timeout](../codex-gui-pac-proxy-timeout.md#L1)
- [Preload capability version skew](../codex-preload-capability-version-skew.md#L1)
- [Content-derived path segment unvalidated](../content-derived-path-segment-unvalidated.md#L1)
- [Facade port omitted below passing module validator](../facade-port-omitted-below-passing-module-validator.md#L1)
- [New preload module missing from packaging manifest](../new-preload-module-missing-from-packaging-manifest.md#L1)
- [Persistent float window outlives plugin reload](../persistent-float-window-outlives-plugin-reload.md#L1)
- [Verify policy must not skip uTools artifact build](../verify-policy-must-not-skip-utools-artifact-build.md#L1)
- [Port scan snapshot misses new listeners](../port-scan-snapshot-misses-new-listeners.md#L1)
- [Preload module `instanceof` crosses vm sandbox realm](../preload-module-instanceof-crosses-vm-sandbox-realm.md#L1)
- [Preload module forgets injection at call site](../preload-module-forgets-injection-at-call-site.md#L1)
- [Module loader lands inside a block scope](../module-loader-lands-inside-a-block-scope.md#L1)
- [pnpm store/build-policy mismatch](../pnpm-store-build-policy-mismatch.md#L1)
- [Real Claude binary breaks empty-machine fixtures](../sandbox-real-claude-binary-breaks-empty-machine-fixtures.md#L1)
- [Dev Float entry is not HMR](../utools-dev-float-entry-not-hmr.md#L1)
- [Developer-tools project-list loading](../utools-developer-tools-project-list-loading.md#L1)
- [Generated command needs shell quoting](../utools-generated-command-needs-shell-quoting.md#L1)
- [Guarded preload module silently unavailable](../utools-guarded-preload-module-silent-unavailable.md#L1)
- [Native-addon host signature mismatch](../utools-macos-native-addon-host-signature-mismatch.md#L1)
- [`onPluginOut` hide versus process exit](../utools-onpluginout-hidden-vs-process-exit.md#L1)
- [Private sync IPC entry freeze](../utools-private-sync-ipc-entry-freeze.md#L1)

## Related Error Records

- [Task-state version skew degrades atomically](../codex-task-state-version-skew-must-degrade-atomically.md#L1)
- [Claude readiness must not depend on an unneeded capability](../claude-readiness-gated-on-unneeded-capability.md#L1)

## Historical Or Migration Sources

- [Legacy File Favorites macOS open/preload/shortcut compound record](../../error-memory.md#file-favorites-macos-open-preload-and-shortcut-hints) remains a migration source, not a reusable single fingerprint.
- Thin uTools pointers remain project-local routing only; reusable host/preload facts are owned by the CodeNote uTools archive and are not copied here.
