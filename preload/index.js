const { Buffer } = require('node:buffer')
const { execFile, execFileSync, spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
let https = null
try { https = require('node:https') } catch { /* older constrained preload harness: quota fallback stays unavailable */ }

const RUNTIME_IDENTITY_REVISION = 'runtime-identity-v2'
let runtimeIdentityArtifact = null
let runtimeIdentityLoadError = ''
let runtimeIdentityCompatible = false
let runtimeIdentityDiagnosticFingerprint = ''
try {
  runtimeIdentityArtifact = require('./runtime-identity.cjs')
} catch (error) {
  runtimeIdentityLoadError = String(error && error.message || error || 'runtime identity unavailable')
}
let childEnvelopeContractsV7 = null
try { childEnvelopeContractsV7 = require('./companion/contracts-v7.cjs') } catch {}
// Companion dbStorage side-state lives in its own module. The require is
// tolerant because this entry is also loaded inside VM sandboxes that provide
// only a minimal `require`; when the module is absent the fallback reports
// storage as not ready, which the existing Kernel activation gate already
// refuses to run on, rather than pretending the writes landed.
let createCompanionPersistedSideState = null
try { ({ createCompanionPersistedSideState } = require('./companion/persisted-side-state.cjs')) } catch {}
const companionPersistedSideState = typeof createCompanionPersistedSideState === 'function'
  ? createCompanionPersistedSideState({
      record: (value) => codexRecord(value),
      revisions: () => companionV7Revisions,
      storage: () => globalThis.utools?.dbStorage
    })
  : {
      planPauseStorageReady: () => false,
      readCompanionPlanPauseReceipts: () => [],
      persistCompanionPlanPause: () => false,
      readCompanionInteractionIdentitySalt: () => null,
      readCompanionInteractionTombstones: () => [],
      persistCompanionInteractionTombstones: () => false
    }
const {
  readCompanionPlanPauseReceipts,
  persistCompanionPlanPause,
  readCompanionInteractionIdentitySalt,
  readCompanionInteractionTombstones,
  persistCompanionInteractionTombstones
} = companionPersistedSideState

function createHostChildEnvelopeV7(surfaceId, channel, payload, metadata = {}) {
  return childEnvelopeContractsV7?.createChildEnvelopeV7?.({
    runtimeIdentity: String(runtimeIdentityArtifact?.hostAssetId || ''),
    surfaceId,
    channel,
    payloadRevision: Number.isSafeInteger(metadata.payloadRevision) ? metadata.payloadRevision : 0,
    requestId: metadata.requestId,
    interactionId: metadata.interactionId,
    ack: metadata.ack,
    heartbeat: metadata.heartbeat,
    logCursor: metadata.logCursor,
    payload
  }) || null
}

function normalizeHostChildEnvelopeV7(value, surfaceId, channel) {
  const envelope = childEnvelopeContractsV7?.normalizeChildEnvelopeV7?.(value, { surfaceId, channel }) || null
  if (!envelope || envelope.runtimeIdentity !== String(runtimeIdentityArtifact?.hostAssetId || '')) return null
  return envelope
}

const STORAGE_KEY = 'eypc/state/v1'
const CODEX_LAUNCH_PATH_STORAGE_KEY = 'eypc/codex/launch-path/v1'
const CODEX_DESKTOP_SIDE_RELATION_STORAGE_KEY = 'eypc/codex/desktop-side-relations/v1'
const MQTT_ARCHIVE_STORAGE_KEY = 'eypc/mqtt/archive/v1'
const MQTT_SECRETS_LOCAL_STORAGE_KEY = 'eypc/mqtt/secrets-local/v1'
const MQTT_SECRETS_FILE_NAME = 'mqtt-secrets-local.json'
const MQTT_SECRETS_KEY_FILE_NAME = 'mqtt-secrets-local.key'
const MQTT_SECRETS_ENCRYPTION_VERSION = 2
const MQTT_SECRETS_AES_ALGORITHM = 'aes-256-gcm'
const CODEX_RPC_TIMEOUT_MS = 12_000
const CODEX_PROCESS_OUTPUT_LIMIT = 256 * 1024
const CODEX_THREAD_ALIAS_TTL_MS = 10 * 60_000
const CODEX_THREAD_PAGE_SIZE = 100
const CODEX_NATIVE_STATE_MAX_BYTES = 4 * 1024 * 1024
const CODEX_THREAD_TURN_STATUS_CONCURRENCY = 10
const CODEX_THREAD_TURN_STATUS_TIMEOUT_MS = 5_000
const CODEX_THREAD_GOAL_TIMEOUT_MS = 5_000
const CODEX_PLAN_CAPABILITY_TIMEOUT_MS = 1_250
const CODEX_THREAD_TURN_STATUS_RETRY_MS = 30_000
const CODEX_THREAD_GOAL_RETRY_MS = 30_000
const CODEX_DESKTOP_TURN_REFRESH_DEADLINE_MS = 3_000
const CODEX_DESKTOP_TURN_REFRESH_DELAYS_MS = [0, 300, 1_000]
const CODEX_COMPLETION_EVENT_REFRESH_DELAYS_MS = [0, 25, 75, 150, 300, 600, 1_000]
const CODEX_WAITING_EDGE_REFRESH_DEADLINE_MS = 1_250
const CODEX_WAITING_EDGE_REFRESH_DELAYS_MS = [0, 50, 150, 300, 600, 1_000]
const CODEX_THREAD_FIRST_PROMPT_PAGE_LIMIT = 50
const CODEX_THREAD_FIRST_PROMPT_PAGE_BUDGET = 4
const CODEX_DESKTOP_IPC_FRAME_MAX_BYTES = 256 * 1024 * 1024
const CODEX_DESKTOP_IPC_RECONNECT_MAX_MS = 5_000
const COMPANION_DIAGNOSTIC_TASK_SALT = crypto.randomBytes(16)
const CODEX_DESKTOP_WAITING_STATE_LIMIT = 1_000
const CODEX_DESKTOP_RESOLVED_REQUEST_LIMIT = 400
// Both mirror WATCHER_RECOVERY_INTERVAL_MS in preload/timing-policy.cjs, which
// owns the semantics. This entry deliberately performs no unguarded local
// require — every module it loads goes through a guarded loader with a
// base-path fallback, because a throw here takes down the whole preload. The
// literals are therefore held in step by a test assertion rather than by an
// import; change the policy, not these.
const CODEX_NATIVE_STATE_RECOVERY_INTERVAL_MS = 1_000
const CODEX_INVENTORY_MEMBERSHIP_RECOVERY_INTERVAL_MS = 1_000
// Keep synchronized with src/domain/codex.ts. This value crosses the context
// boundary so a newer renderer can mark long-lived preload evidence degraded.
const CODEX_TASK_STATE_REVISION = 'task-state-v12'
const EXECUTE_PLAN_PROMPT_V1 = '请按已完成的 Plan 开始执行。'
const CODEX_DESKTOP_IPC_VERSIONS = {
  'client-status-changed': 0,
  'ipc-connection-reset': 1,
  'thread-stream-state-changed': 11,
  'thread-stream-following-changed': 1,
  'thread-stream-following-status-requested': 1,
  'thread-read-state-changed': 2,
  'thread-archived': 2,
  'thread-unarchived': 1
}

function codexDesktopIpcVersionAccepted(method, version) {
  const expectedVersion = CODEX_DESKTOP_IPC_VERSIONS[method]
  if (!Number.isInteger(expectedVersion)) return true
  // Older installed Codex editor extensions publish unrevisioned stream-state
  // v6 and read-state v1; the current Desktop/editor protocol uses v11/v2.
  return version === expectedVersion
    || method === 'thread-stream-state-changed' && version === 6
    || method === 'thread-read-state-changed' && version === 1
}
const WINDOW_BRIDGE_TIMEOUT_MS = 5_000
const WINDOW_BRIDGE_OUTPUT_LIMIT = 1024 * 1024
const WINDOW_BRIDGE_REVISION = 'wj22-native-instance-space-cache'
let windowSubsystem = null
let windowSubsystemLoadError = ''
try {
  let windowModule = null
  let relativeLoadError = null
  try {
    windowModule = require('./windows/index.cjs')
  } catch (error) {
    relativeLoadError = error
  }
  if (!windowModule) {
    const baseCandidates = [
      typeof __dirname === 'string' ? __dirname : '',
      process.cwd(),
      path.join(process.cwd(), 'preload'),
      path.join(process.cwd(), 'public')
    ].filter(Boolean)
    for (const base of Array.from(new Set(baseCandidates))) {
      try {
        windowModule = require(path.join(base, 'windows', 'index.cjs'))
        break
      } catch {}
    }
  }
  const createWindowSubsystem = windowModule && windowModule.createWindowSubsystem
  if (typeof createWindowSubsystem !== 'function') throw relativeLoadError || new Error('window module factory unavailable')
  windowSubsystem = createWindowSubsystem({
    execFile,
    platform: process.platform,
    process,
    globalThis,
    timeoutMs: WINDOW_BRIDGE_TIMEOUT_MS,
    outputLimit: WINDOW_BRIDGE_OUTPUT_LIMIT
  })
} catch (error) {
  windowSubsystemLoadError = String(error && error.message || error || 'window module unavailable')
}

// Claude companion bridge. Loaded exactly like the window subsystem: a guarded
// require with public/dist fallbacks, so a missing or broken module degrades the
// Claude provider alone and never touches Codex, MQTT, ports or favorites.
let claudeBridge = null
let claudeBridgeLoadError = ''
try {
  let claudeModule = null
  let claudeRelativeLoadError = null
  try {
    claudeModule = require('./claude/index.cjs')
  } catch (error) {
    claudeRelativeLoadError = error
  }
  if (!claudeModule) {
    const claudeBaseCandidates = [
      typeof __dirname === 'string' ? __dirname : '',
      process.cwd(),
      path.join(process.cwd(), 'preload'),
      path.join(process.cwd(), 'public')
    ].filter(Boolean)
    for (const base of Array.from(new Set(claudeBaseCandidates))) {
      try {
        claudeModule = require(path.join(base, 'claude', 'index.cjs'))
        break
      } catch {}
    }
  }
  const createClaudeBridge = claudeModule && claudeModule.createClaudeBridge
  if (typeof createClaudeBridge !== 'function') throw claudeRelativeLoadError || new Error('claude module factory unavailable')
  claudeBridge = createClaudeBridge({
    fs,
    path,
    os,
    crypto,
    execFile,
    execFileSync,
    https,
    process,
    platform: process.platform,
    resourcesPath: typeof process.resourcesPath === 'string' ? process.resourcesPath : '',
    safeStorage: getElectronSafeStorage(),
    dataDirectory: resolveClaudeDataDirectory(),
    windows: {
      list: (...args) => windowSubsystem ? windowSubsystem.list(...args) : Promise.resolve({ windows: [] }),
      activate: (...args) => windowSubsystem ? windowSubsystem.activate(...args) : Promise.resolve({ outcome: 'unsupported' })
    }
  })
} catch (error) {
  claudeBridgeLoadError = String(error && error.message || error || 'claude module unavailable')
}

// Cursor Agent companion. Same guarded-require shape as Claude: a missing
// module degrades this provider alone. Cold inventory plus a deep-link jump
// (agent?id=<composerId>) that focuses the exact local conversation.
let cursorBridge = null
let cursorBridgeLoadError = ''
try {
  let cursorModule = null
  let cursorRelativeLoadError = null
  try {
    cursorModule = require('./cursor/index.cjs')
  } catch (error) {
    cursorRelativeLoadError = error
  }
  if (!cursorModule) {
    const cursorBaseCandidates = [
      typeof __dirname === 'string' ? __dirname : '',
      process.cwd(),
      path.join(process.cwd(), 'preload'),
      path.join(process.cwd(), 'public')
    ].filter(Boolean)
    for (const base of Array.from(new Set(cursorBaseCandidates))) {
      try {
        cursorModule = require(path.join(base, 'cursor', 'index.cjs'))
        break
      } catch {}
    }
  }
  const createCursorBridge = cursorModule && cursorModule.createCursorBridge
  if (typeof createCursorBridge !== 'function') throw cursorRelativeLoadError || new Error('cursor module factory unavailable')
  cursorBridge = createCursorBridge({
    fs,
    path,
    os,
    process,
    platform: process.platform,
    env: process.env,
    execFile,
    execFileSync,
    dataDirectory: resolveCursorDataDirectory()
  })
} catch (error) {
  cursorBridgeLoadError = String(error && error.message || error || 'cursor module unavailable')
}

// Process-lifetime companion task authority. Provider adapters only contribute
// raw evidence and capabilities; this Kernel owns the canonical package,
// cursor and dispatch arbitration across mainHide/Renderer remounts.
let createCompanionTaskKernel = null
let createCompanionHostRegistry = null
let companionV7Revisions = null
let companionEvidenceChannelsV7 = null
let codexBranchObservationV7 = null
let claudeSessionObservationV7 = null
let cursorSessionObservationV7 = null
let createCompanionEvidenceNodeV7 = null
let createCompanionInteractionEvidenceV7 = null
let createCompanionInteractionSetV7 = null
let createCompanionEvidenceBatchV7 = null
// The phase vocabulary, reached through the Kernel that already owns the
// companion path. A load failure here is the same failure as a missing
// reducer: every consumer below is already dead, so no separate fallback.
let isKnownTaskPhase = null
let isSettledTaskPhase = null
let companionNavigationLoadError = ''
try {
  let kernelModule = null
  let kernelRelativeLoadError = null
  try {
    kernelModule = require('./companion/task-kernel.cjs')
  } catch (error) {
    kernelRelativeLoadError = error
  }
  if (!kernelModule) {
    const kernelBaseCandidates = [
      typeof __dirname === 'string' ? __dirname : '',
      process.cwd(),
      path.join(process.cwd(), 'preload'),
      path.join(process.cwd(), 'public')
    ].filter(Boolean)
    for (const base of Array.from(new Set(kernelBaseCandidates))) {
      try {
        kernelModule = require(path.join(base, 'companion', 'task-kernel.cjs'))
        break
      } catch {}
    }
  }
  if (typeof kernelModule?.createCompanionTaskKernel !== 'function') {
    throw kernelRelativeLoadError || new Error('companion task kernel factory unavailable')
  }
  createCompanionTaskKernel = kernelModule.createCompanionTaskKernel
  createCompanionHostRegistry = typeof kernelModule.createCompanionHostRegistry === 'function'
    ? kernelModule.createCompanionHostRegistry
    : null
  companionV7Revisions = kernelModule.COMPANION_V7_REVISIONS || null
  companionEvidenceChannelsV7 = Array.isArray(kernelModule.COMPANION_EVIDENCE_CHANNELS_V7)
    ? kernelModule.COMPANION_EVIDENCE_CHANNELS_V7
    : null
  let evidenceAdapter = null
  try { evidenceAdapter = require('./companion/evidence-adapter-v7.cjs') } catch {}
  if (!evidenceAdapter) {
    for (const base of [typeof __dirname === 'string' ? __dirname : '', process.cwd(), path.join(process.cwd(), 'preload'), path.join(process.cwd(), 'public')].filter(Boolean)) {
      try {
        evidenceAdapter = require(path.join(base, 'companion', 'evidence-adapter-v7.cjs'))
        break
      } catch {}
    }
  }
  codexBranchObservationV7 = evidenceAdapter?.codexBranchObservationV7
  claudeSessionObservationV7 = evidenceAdapter?.claudeSessionObservationV7
  cursorSessionObservationV7 = evidenceAdapter?.cursorSessionObservationV7
  createCompanionEvidenceNodeV7 = evidenceAdapter?.createEvidenceNodeV7
  createCompanionInteractionEvidenceV7 = evidenceAdapter?.createInteractionEvidenceV7
  createCompanionInteractionSetV7 = evidenceAdapter?.createInteractionSetV7
  createCompanionEvidenceBatchV7 = evidenceAdapter?.createEvidenceBatchV7
  if (!createCompanionHostRegistry || !companionV7Revisions || !companionEvidenceChannelsV7
    || !codexBranchObservationV7 || !claudeSessionObservationV7 || !cursorSessionObservationV7
    || !createCompanionEvidenceNodeV7 || !createCompanionInteractionEvidenceV7
    || !createCompanionInteractionSetV7 || !createCompanionEvidenceBatchV7) {
    throw new Error('companion V7 evidence adapter unavailable')
  }
  isKnownTaskPhase = kernelModule.isKnownTaskPhase
  isSettledTaskPhase = kernelModule.isSettledTaskPhase
  if (typeof isKnownTaskPhase !== 'function' || typeof isSettledTaskPhase !== 'function') {
    throw new Error('companion task phase vocabulary unavailable')
  }
} catch (error) {
  companionNavigationLoadError = String(error && error.message || error || 'companion task kernel unavailable')
}

// Codex Environment Action node-runtime discovery. Loaded through the same
// guarded require as every other module here: this entry never performs an
// unguarded local require, because a throw at module scope takes the whole
// bridge down. A failed load degrades runtime discovery to its empty result
// rather than breaking the preload.
let codexNodeRuntimeHelpers = null
try {
  let nodeRuntimeModule = null
  try {
    nodeRuntimeModule = require('./codex/node-runtime.cjs')
  } catch {}
  if (!nodeRuntimeModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      process.cwd(),
      path.join(process.cwd(), 'preload'),
      path.join(process.cwd(), 'public')
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        nodeRuntimeModule = require(path.join(base, 'codex', 'node-runtime.cjs'))
        break
      } catch {}
    }
  }
  if (typeof nodeRuntimeModule?.createCodexNodeRuntime === 'function') {
    codexNodeRuntimeHelpers = nodeRuntimeModule.createCodexNodeRuntime({ fs, path, os, crypto, process })
  }
} catch {}

// Environment Action command allowlist. Depends on nothing, so it is required
// directly rather than constructed, through the same guarded path as everything
// else here. A failed load leaves every command unvalidated, which the callers
// read as "do not launch".
let codexCommandValidation = null
try {
  try {
    codexCommandValidation = require('./codex/command-validation.cjs')
  } catch {}
  if (!codexCommandValidation) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      process.cwd(),
      path.join(process.cwd(), 'preload'),
      path.join(process.cwd(), 'public')
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        codexCommandValidation = require(path.join(base, 'codex', 'command-validation.cjs'))
        break
      } catch {}
    }
  }
  if (typeof codexCommandValidation?.validateCodexEnvironmentActionCommandHost !== 'function') {
    codexCommandValidation = null
  }
} catch { codexCommandValidation = null }

// Action Runner window geometry, including the minimums it clamps to.
let codexRunnerBounds = null
try {
  try {
    codexRunnerBounds = require('./codex/runner-bounds.cjs')
  } catch {}
  if (!codexRunnerBounds) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      process.cwd(),
      path.join(process.cwd(), 'preload'),
      path.join(process.cwd(), 'public')
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        codexRunnerBounds = require(path.join(base, 'codex', 'runner-bounds.cjs'))
        break
      } catch {}
    }
  }
  if (typeof codexRunnerBounds?.clampCodexActionRunnerBounds !== 'function') codexRunnerBounds = null
} catch { codexRunnerBounds = null }

// Action log redaction. A failed load redacts everything to the empty string
// rather than letting unredacted output through — the safe direction.
let codexLogRedaction = null
try {
  let redactionModule = null
  try {
    redactionModule = require('./codex/log-redaction.cjs')
  } catch {}
  if (!redactionModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      process.cwd(),
      path.join(process.cwd(), 'preload'),
      path.join(process.cwd(), 'public')
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        redactionModule = require(path.join(base, 'codex', 'log-redaction.cjs'))
        break
      } catch {}
    }
  }
  if (typeof redactionModule?.createCodexLogRedaction === 'function') {
    codexLogRedaction = redactionModule.createCodexLogRedaction({ os })
  }
} catch { codexLogRedaction = null }

// Action log buffering and decoding. Host effects are injected rather than
// reached for, so the module never sees the runner window, the IPC channel
// names or the database. `deliverLogDeltas` receives the whole batch so the
// liveness check stays outside the loop, exactly where it was.
let codexLogStream = null
try {
  let logStreamModule = null
  try {
    logStreamModule = require('./codex/log-stream.cjs')
  } catch {}
  if (!logStreamModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      process.cwd(),
      path.join(process.cwd(), 'preload'),
      path.join(process.cwd(), 'public')
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        logStreamModule = require(path.join(base, 'codex', 'log-stream.cjs'))
        break
      } catch {}
    }
  }

  if (typeof logStreamModule?.createCodexActionLogStream === 'function') {
    codexLogStream = logStreamModule.createCodexActionLogStream({
      redact: (text, privatePaths) => sanitizeCodexActionLogText(text, privatePaths),
      persistRun: (run) => persistCodexActionRun(run),
      deliverLogDeltas: (deltas) => {
        if (!codexActionRunnerAlive()) return
        for (const delta of deltas) {
          const envelope = createHostChildEnvelopeV7('action', CODEX_ACTION_RUNNER_CHANNELS.log, delta, {
            payloadRevision: Number(delta.cursor || 0),
            logCursor: Number(delta.cursor || 0)
          })
          if (!envelope) continue
          try { codexActionRunnerWindow.webContents.send(CODEX_ACTION_RUNNER_CHANNELS.log, envelope) } catch {}
        }
      }
    })
  }
} catch { codexLogStream = null }

// Action run history. Owns the database handle, its ready flag and the run
// memory that used to be three module-level bindings written from seven places.
let codexRunDatabase = null
try {
  let runDatabaseModule = null
  try {
    runDatabaseModule = require('./codex/run-database.cjs')
  } catch {}
  if (!runDatabaseModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      process.cwd(),
      path.join(process.cwd(), 'preload'),
      path.join(process.cwd(), 'public')
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        runDatabaseModule = require(path.join(base, 'codex', 'run-database.cjs'))
        break
      } catch {}
    }
  }
  if (typeof runDatabaseModule?.createCodexRunDatabase === 'function') {
    codexRunDatabase = runDatabaseModule.createCodexRunDatabase({
      fs,
      path,
      os,
      utools: typeof globalThis !== 'undefined' ? globalThis.utools : null
    })
  }
} catch { codexRunDatabase = null }

// Environment Action authorization. Owns the command vault and the confirm
// tokens: the renderer supplies an id, never a command, and one confirmation
// binds one execution to one fingerprint tuple.
let codexActionAuthorization = null
try {
  let authorizationModule = null
  try {
    authorizationModule = require('./codex/action-authorization.cjs')
  } catch {}
  if (!authorizationModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        authorizationModule = require(path.join(base, 'codex', 'action-authorization.cjs'))
        break
      } catch {}
    }
  }
  if (typeof authorizationModule?.createCodexActionAuthorization === 'function') {
    codexActionAuthorization = authorizationModule.createCodexActionAuthorization({ crypto })
  }
} catch { codexActionAuthorization = null }

// Rollout pending-evidence readers. Pure text analysis; the hot value coercers
// stay in this entry because a load failure must not reach their 300-plus call
// sites, so they are injected into the module instead.
let codexRolloutEvidence = null
try {
  let rolloutModule = null
  try {
    rolloutModule = require('./codex/rollout-evidence.cjs')
  } catch {}
  if (!rolloutModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        rolloutModule = require(path.join(base, 'codex', 'rollout-evidence.cjs'))
        break
      } catch {}
    }
  }
  if (typeof rolloutModule?.createCodexRolloutEvidence === 'function') {
    codexRolloutEvidence = rolloutModule.createCodexRolloutEvidence({ record: codexRecord, timestampMs: codexTimestampMs })
  }
} catch { codexRolloutEvidence = null }

// Codex native registry validation. The parse is pure text-in/structure-out;
// the filesystem reads and the size cap stay here, so this module never
// decides whether to read — only whether what was read is admissible.
let codexNativeRegistry = null
try {
  let registryModule = null
  try {
    registryModule = require('./codex/native-registry.cjs')
  } catch {}
  if (!registryModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        registryModule = require(path.join(base, 'codex', 'native-registry.cjs'))
        break
      } catch {}
    }
  }
  if (typeof registryModule?.createCodexNativeRegistry === 'function') {
    codexNativeRegistry = registryModule.createCodexNativeRegistry({
      crypto,
      codexError,
      codexRecord,
      codexNativeString,
      validCodexThreadId,
      codexNormalizeNativeRoot
    })
  }
} catch { codexNativeRegistry = null }

// A failed load must not read as an empty registry — that would be written back
// as a complete one. It refuses exactly as a malformed document does.
function parseCodexNativeRegistryText(text) {
  if (!codexNativeRegistry) throw codexError('protocol-error', 'Codex native project state is unavailable')
  return codexNativeRegistry.parseCodexNativeRegistryText(text)
}

// How to invoke a Codex CLI candidate, and what proxy the spawned process
// should inherit. Two modules because they are two subjects: one resolves an
// executable, the other is a refusal boundary over untrusted PAC output.
let codexLaunchContext = null
let codexProxyDiscovery = null
try {
  const loadCodexModule = (relative, file) => {
    let loaded = null
    try {
      loaded = require(relative)
    } catch {}
    if (loaded) return loaded
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        return require(path.join(base, 'codex', file))
      } catch {}
    }
    return null
  }
  const launchModule = loadCodexModule('./codex/launch-plan.cjs', 'launch-plan.cjs')
  if (typeof launchModule?.createCodexLaunchPlan === 'function') {
    codexLaunchContext = launchModule.createCodexLaunchPlan({ fs, path, process })
  }
  const proxyModule = loadCodexModule('./codex/proxy-discovery.cjs', 'proxy-discovery.cjs')
  if (typeof proxyModule?.createCodexProxyDiscovery === 'function') {
    codexProxyDiscovery = proxyModule.createCodexProxyDiscovery({ execFile, process })
  }
} catch {
  codexLaunchContext = null
  codexProxyDiscovery = null
}

// Environment TOML parsing. Depends on nothing, so it is required directly
// rather than constructed, on the same precedent as command-validation.cjs. A
// failed load leaves every environment file unparseable rather than partially
// trusted.
let codexEnvironmentToml = null
try {
  try {
    codexEnvironmentToml = require('./codex/environment-toml.cjs')
  } catch {}
  if (!codexEnvironmentToml) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      process.cwd(),
      path.join(process.cwd(), 'preload'),
      path.join(process.cwd(), 'public')
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        codexEnvironmentToml = require(path.join(base, 'codex', 'environment-toml.cjs'))
        break
      } catch {}
    }
  }
  if (typeof codexEnvironmentToml?.parseCodexEnvironmentTomlText !== 'function') {
    codexEnvironmentToml = null
  }
} catch { codexEnvironmentToml = null }

// How the desktop plan bridge classifies a live request: its correlation
// identity, its timestamp, and whether it is currently waiting on the user.
let codexDesktopRequestProjection = null
try {
  let projectionModule = null
  try {
    projectionModule = require('./codex/desktop-request-projection.cjs')
  } catch {}
  if (!projectionModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        projectionModule = require(path.join(base, 'codex', 'desktop-request-projection.cjs'))
        break
      } catch {}
    }
  }
  if (typeof projectionModule?.createCodexDesktopRequestProjection === 'function') {
    codexDesktopRequestProjection = projectionModule.createCodexDesktopRequestProjection({
      record: codexRecord,
      timestampMs: codexTimestampMs,
      crypto,
      correlationSalt: readCompanionInteractionIdentitySalt(),
      nextLiveEvidenceSequence: codexNextLiveEvidenceSequence
    })
  }
} catch { codexDesktopRequestProjection = null }

// Rate-limit and account payloads into the shape the status UI reads. Pure
// computation; a failed load leaves quota unreadable rather than misread.
let codexQuotaSanitizer = null
try {
  let quotaModule = null
  try {
    quotaModule = require('./codex/quota-sanitizer.cjs')
  } catch {}
  if (!quotaModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        quotaModule = require(path.join(base, 'codex', 'quota-sanitizer.cjs'))
        break
      } catch {}
    }
  }
  if (typeof quotaModule?.createCodexQuotaSanitizer === 'function') {
    codexQuotaSanitizer = quotaModule.createCodexQuotaSanitizer({
      record: codexRecord,
      percent: codexPercent,
      number: codexNumber,
      timestampMs: codexTimestampMs
    })
  }
} catch { codexQuotaSanitizer = null }

// Reconstructs thread fork/parent topology from a flat inventory row list.
// Pure graph reconstruction; a failed load leaves every thread isolated
// rather than guessing at a fork relationship.
let codexInventoryThreadTopologyModule = null
try {
  let topologyModule = null
  try {
    topologyModule = require('./codex/inventory-thread-topology.cjs')
  } catch {}
  if (!topologyModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        topologyModule = require(path.join(base, 'codex', 'inventory-thread-topology.cjs'))
        break
      } catch {}
    }
  }
  if (typeof topologyModule?.createCodexInventoryThreadTopology === 'function') {
    codexInventoryThreadTopologyModule = topologyModule.createCodexInventoryThreadTopology({
      record: codexRecord,
      validThreadId: validCodexThreadId,
      nativeString: codexNativeString
    })
  }
} catch { codexInventoryThreadTopologyModule = null }

// Merges a fresh inventory turn projection with previously known activity so
// a lower-fidelity snapshot never regresses evidence a live source already
// established. Pure computation; a failed load leaves the projection
// unmerged rather than guessing at which side is fresher.
let codexInventoryTurnFieldsModule = null
try {
  let turnFieldsModule = null
  try {
    turnFieldsModule = require('./codex/inventory-turn-fields.cjs')
  } catch {}
  if (!turnFieldsModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        turnFieldsModule = require(path.join(base, 'codex', 'inventory-turn-fields.cjs'))
        break
      } catch {}
    }
  }
  if (typeof turnFieldsModule?.createCodexInventoryTurnFields === 'function') {
    codexInventoryTurnFieldsModule = turnFieldsModule.createCodexInventoryTurnFields({
      timestampMs: codexTimestampMs
    })
  }
} catch { codexInventoryTurnFieldsModule = null }

// Whether a Desktop waiting flag is still live evidence or already cleared by
// a later observation. `Map` is injected on the node-runtime precedent so an
// `instanceof` check matches a `resolvedRequestSequences` Map constructed in
// this same realm rather than the module's own.
let codexWaitingEvidence = null
try {
  let waitingEvidenceModule = null
  try {
    waitingEvidenceModule = require('./codex/waiting-evidence.cjs')
  } catch {}
  if (!waitingEvidenceModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      process.cwd(),
      path.join(process.cwd(), 'preload'),
      path.join(process.cwd(), 'public')
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        waitingEvidenceModule = require(path.join(base, 'codex', 'waiting-evidence.cjs'))
        break
      } catch {}
    }
  }
  if (typeof waitingEvidenceModule?.createCodexWaitingEvidence === 'function') {
    codexWaitingEvidence = waitingEvidenceModule.createCodexWaitingEvidence({ Map })
  }
} catch { codexWaitingEvidence = null }

// Builds and patches the Desktop conversation shadow from stream snapshots
// and JSON-Patch deltas. `codexDesktopProjectedRequest(s)` are this entry's
// own delegating stubs for the already-extracted desktop-request-projection
// module, injected here like any other collaborator.
let codexDesktopShadow = null
try {
  let desktopShadowModule = null
  try {
    desktopShadowModule = require('./codex/desktop-shadow.cjs')
  } catch {}
  if (!desktopShadowModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        desktopShadowModule = require(path.join(base, 'codex', 'desktop-shadow.cjs'))
        break
      } catch {}
    }
  }
  if (typeof desktopShadowModule?.createCodexDesktopShadow === 'function') {
    codexDesktopShadow = desktopShadowModule.createCodexDesktopShadow({
      record: codexRecord,
      timestampMs: codexTimestampMs,
      validThreadId: validCodexThreadId,
      nextLiveEvidenceSequence: codexNextLiveEvidenceSequence,
      reduceWaitingEdge: codexReduceWaitingEdge,
      activityStatus: sanitizeCodexActivityStatus,
      projectedRequest: codexDesktopProjectedRequest,
      projectedRequests: codexDesktopProjectedRequests
    })
  }
} catch { codexDesktopShadow = null }

// The manual launch-path preference and the automatic candidate search that
// runs when no manual path is set. `codexPlatformPath`/`codexLaunchPlan` are
// this entry's own delegating stubs for already-extracted modules, injected
// like any other collaborator.
let codexLaunchPathPreference = null
try {
  let launchPathModule = null
  try {
    launchPathModule = require('./codex/launch-path-preference.cjs')
  } catch {}
  if (!launchPathModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        launchPathModule = require(path.join(base, 'codex', 'launch-path-preference.cjs'))
        break
      } catch {}
    }
  }
  if (typeof launchPathModule?.createCodexLaunchPathPreference === 'function') {
    codexLaunchPathPreference = launchPathModule.createCodexLaunchPathPreference({
      platformPath: codexPlatformPath,
      launchPlan: codexLaunchPlan,
      storageKey: CODEX_LAUNCH_PATH_STORAGE_KEY,
      fs,
      os,
      process,
      utools: typeof globalThis !== 'undefined' ? globalThis.utools : null
    })
  }
} catch { codexLaunchPathPreference = null }

// Reads a rollout tail for live-runtime phase (active/completed/interrupted)
// as opposed to persisted Turn status. Pure text analysis; `record` and
// `rolloutTimestampMs` are injected on the rollout-evidence precedent.
let codexRolloutRuntimeState = null
try {
  let rolloutRuntimeModule = null
  try {
    rolloutRuntimeModule = require('./codex/rollout-runtime-state.cjs')
  } catch {}
  if (!rolloutRuntimeModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        rolloutRuntimeModule = require(path.join(base, 'codex', 'rollout-runtime-state.cjs'))
        break
      } catch {}
    }
  }
  if (typeof rolloutRuntimeModule?.createCodexRolloutRuntimeState === 'function') {
    codexRolloutRuntimeState = rolloutRuntimeModule.createCodexRolloutRuntimeState({
      record: codexRecord,
      rolloutTimestampMs: codexRolloutTimestampMs
    })
  }
} catch { codexRolloutRuntimeState = null }

// Locates the Desktop IPC socket and decides whether it is safe to trust.
// `codexNativeStatePaths` is this entry's own delegating stub for an
// already-extracted module, injected like any other collaborator.
let codexDesktopIpcEndpointModule = null
try {
  let ipcEndpointModule = null
  try {
    ipcEndpointModule = require('./codex/desktop-ipc-endpoint.cjs')
  } catch {}
  if (!ipcEndpointModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        ipcEndpointModule = require(path.join(base, 'codex', 'desktop-ipc-endpoint.cjs'))
        break
      } catch {}
    }
  }
  if (typeof ipcEndpointModule?.createCodexDesktopIpcEndpoint === 'function') {
    codexDesktopIpcEndpointModule = ipcEndpointModule.createCodexDesktopIpcEndpoint({
      nativeStatePaths: codexNativeStatePaths,
      fs,
      path,
      process
    })
  }
} catch { codexDesktopIpcEndpointModule = null }

// Three independent parent/child aggregations (App Server dominance, merged
// activity, merged unread). `codexDesktopUnreadObservation` stays in the
// entry and is injected: it touches `codexDesktopOpenedReadAcknowledgements`,
// a high-share binding this module must never take on.
let codexDesktopActivityAggregation = null
try {
  let activityAggregationModule = null
  try {
    activityAggregationModule = require('./codex/desktop-activity-aggregation.cjs')
  } catch {}
  if (!activityAggregationModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        activityAggregationModule = require(path.join(base, 'codex', 'desktop-activity-aggregation.cjs'))
        break
      } catch {}
    }
  }
  if (typeof activityAggregationModule?.createCodexDesktopActivityAggregation === 'function') {
    codexDesktopActivityAggregation = activityAggregationModule.createCodexDesktopActivityAggregation({
      timestampMs: codexTimestampMs,
      unreadObservation: codexDesktopUnreadObservation
    })
  }
} catch { codexDesktopActivityAggregation = null }

// A failed load degrades to the same "unavailable" shape the function itself
// already produces when no NVM or system Node is found -- the launch path
// caller already reads `public.state === 'unavailable'` as "cannot resolve
// a Node runtime", not a new case.
let codexActionRuntimeProjectionModule = null
try {
  let runtimeProjectionModule = null
  try {
    runtimeProjectionModule = require('./codex/action-runtime-projection.cjs')
  } catch {}
  if (!runtimeProjectionModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        runtimeProjectionModule = require(path.join(base, 'codex', 'action-runtime-projection.cjs'))
        break
      } catch {}
    }
  }
  if (typeof runtimeProjectionModule?.createCodexActionRuntimeProjection === 'function') {
    codexActionRuntimeProjectionModule = runtimeProjectionModule.createCodexActionRuntimeProjection({
      nodeRuntimeCandidates: codexActionNodeRuntimeCandidates,
      nvmRoots: codexActionNvmRoots,
      runtimePreference: codexActionRuntimePreference,
      projectNodeHint: codexActionProjectNodeHint,
      resolveNodeToken: codexActionResolveNodeToken,
      readNvmAlias: codexActionReadNvmAlias
    })
  }
} catch { codexActionRuntimeProjectionModule = null }

// A failed load degrades both probes to "not running": the connection
// attempts they gate simply do not fire, the same outcome a genuine "not
// running" verdict produces.
let codexDesktopProcessProbe = null
try {
  let processProbeModule = null
  try {
    processProbeModule = require('./codex/desktop-process-probe.cjs')
  } catch {}
  if (!processProbeModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        processProbeModule = require(path.join(base, 'codex', 'desktop-process-probe.cjs'))
        break
      } catch {}
    }
  }
  if (typeof processProbeModule?.createCodexDesktopProcessProbe === 'function') {
    codexDesktopProcessProbe = processProbeModule.createCodexDesktopProcessProbe({
      execFile,
      process,
      run,
      record: codexRecord
    })
  }
} catch { codexDesktopProcessProbe = null }

// A failed load can no longer resolve anything under $CODEX_HOME: paths
// degrade to empty strings (callers already treat an empty path as "nothing
// found" rather than a claimed location), the roots list degrades to empty,
// containment checks degrade to `false` (reject rather than guess trust),
// and rollout candidate resolution degrades to `null` (the same verdict a
// genuinely missing or untrusted rollout file produces).
let codexNativeStatePathsModule = null
try {
  let nativeStatePathsModule = null
  try {
    nativeStatePathsModule = require('./codex/native-state-paths.cjs')
  } catch {}
  if (!nativeStatePathsModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        nativeStatePathsModule = require(path.join(base, 'codex', 'native-state-paths.cjs'))
        break
      } catch {}
    }
  }
  if (typeof nativeStatePathsModule?.createCodexNativeStatePaths === 'function') {
    codexNativeStatePathsModule = nativeStatePathsModule.createCodexNativeStatePaths({
      process,
      path,
      os,
      fs
    })
  }
} catch { codexNativeStatePathsModule = null }


// A failed load degrades each of the six functions to its own existing
// "no evidence" answer: shadow activity resolves to `null` (the same value
// a shadow with no runtime already produces), the sticky/terminal/defer
// booleans resolve to `false`, and the live sequence resolves to `0` (the
// same value every early-return branch inside the original function already
// produces) -- no caller learns a new case.
let codexDesktopActivityResolution = null
try {
  let activityResolutionModule = null
  try {
    activityResolutionModule = require('./codex/desktop-activity-resolution.cjs')
  } catch {}
  if (!activityResolutionModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        activityResolutionModule = require(path.join(base, 'codex', 'desktop-activity-resolution.cjs'))
        break
      } catch {}
    }
  }
  if (typeof activityResolutionModule?.createCodexDesktopActivityResolution === 'function') {
    codexDesktopActivityResolution = activityResolutionModule.createCodexDesktopActivityResolution({
      timestampMs: codexTimestampMs,
      validThreadId: validCodexThreadId,
      isConfirmedTurnEvidence: codexIsConfirmedTurnEvidence,
      waitingEvidenceVisible: codexWaitingEvidenceVisible,
      desktopRequestFlag: codexDesktopRequestFlag,
      desktopIsPlanImplementationRequest: codexDesktopIsPlanImplementationRequest
    })
  }
} catch { codexDesktopActivityResolution = null }

// A failed load silently disables side-relation hint persistence and restore:
// the process falls back to today's session-only recovery, never to a
// partially shaped or unvalidated persisted payload.
let codexSideRelationHints = null
try {
  let sideRelationHintsModule = null
  try {
    sideRelationHintsModule = require('./codex/side-relation-hints.cjs')
  } catch {}
  if (!sideRelationHintsModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        sideRelationHintsModule = require(path.join(base, 'codex', 'side-relation-hints.cjs'))
        break
      } catch {}
    }
  }
  if (typeof sideRelationHintsModule?.createCodexSideRelationHints === 'function') {
    codexSideRelationHints = sideRelationHintsModule.createCodexSideRelationHints({
      timestampMs: codexTimestampMs,
      validThreadId: validCodexThreadId
    })
  }
} catch { codexSideRelationHints = null }

// A failed load silently disables rollout-file subagent discovery: the scan
// then sees exactly the `thread/list` inventory, which is the pre-discovery
// baseline, never a partially validated candidate set.
let codexSubagentDiscovery = null
try {
  let subagentDiscoveryModule = null
  try {
    subagentDiscoveryModule = require('./codex/subagent-discovery.cjs')
  } catch {}
  if (!subagentDiscoveryModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        subagentDiscoveryModule = require(path.join(base, 'codex', 'subagent-discovery.cjs'))
        break
      } catch {}
    }
  }
  if (typeof subagentDiscoveryModule?.createCodexSubagentDiscovery === 'function') {
    codexSubagentDiscovery = subagentDiscoveryModule.createCodexSubagentDiscovery({
      fs,
      path,
      validThreadId: validCodexThreadId,
      readThread: (threadId) => requestCodexRpc(
        'thread/read',
        { threadId, includeTurns: false },
        CODEX_THREAD_TURN_STATUS_TIMEOUT_MS
      ),
      record: (entry) => runtimeDiagnostics.record(entry)
    })
  }
} catch { codexSubagentDiscovery = null }

// A failed load silently disables the CodexHost lane: the scan then sees
// exactly the official inventory, which is the pre-lane baseline.
let codexhostDiscovery = null
try {
  let codexhostDiscoveryModule = null
  try {
    codexhostDiscoveryModule = require('./codex/codexhost-discovery.cjs')
  } catch {}
  if (!codexhostDiscoveryModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        codexhostDiscoveryModule = require(path.join(base, 'codex', 'codexhost-discovery.cjs'))
        break
      } catch {}
    }
  }
  if (typeof codexhostDiscoveryModule?.createCodexhostDiscovery === 'function') {
    codexhostDiscovery = codexhostDiscoveryModule.createCodexhostDiscovery({
      execFile,
      record: (entry) => runtimeDiagnostics.record(entry)
    })
  }
} catch { codexhostDiscovery = null }


// A failed load degrades to the bare minimum safe fields (`key` plus an
// `unavailable` unread authority) rather than a partial passthrough: this is
// an allowlist gate between an internal record and the renderer, so an
// unvalidated field must never leak through just because the validator
// could not be loaded.
let codexActivityPublicProjection = null
try {
  let activityProjectionModule = null
  try {
    activityProjectionModule = require('./codex/activity-public-projection.cjs')
  } catch {}
  if (!activityProjectionModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        activityProjectionModule = require(path.join(base, 'codex', 'activity-public-projection.cjs'))
        break
      } catch {}
    }
  }
  if (typeof activityProjectionModule?.createCodexActivityPublicProjection === 'function') {
    codexActivityPublicProjection = activityProjectionModule.createCodexActivityPublicProjection({
      record: codexRecord,
      timestampMs: codexTimestampMs
    })
  }
} catch { codexActivityPublicProjection = null }
// A failed load degrades to "no special handling": the raw candidate is handed
// to the OS path lookup, and no proxy is injected. Both are the same answers
// these modules give when they find nothing, so no caller learns a new case.
function codexPlatformPath() {
  return codexLaunchContext ? codexLaunchContext.codexPlatformPath() : (process.platform === 'win32' ? path.win32 : path)
}

function codexLaunchPlan(candidate, source = 'unknown', detected = false) {
  if (codexLaunchContext) return codexLaunchContext.codexLaunchPlan(candidate, source, detected)
  const command = candidate || 'codex'
  return { command, argsPrefix: [], key: command, source, detected }
}

async function resolveCodexProxyEnvironment() {
  return codexProxyDiscovery ? codexProxyDiscovery.resolveCodexProxyEnvironment() : {}
}

// A failed load leaves every rollout tail unreadable rather than misread: an
// `unknown` answer makes callers widen the tail and then abstain, which is the
// same path a genuinely inconclusive tail takes.
function codexRolloutPendingUserInputStateText(text, initialCorrelations) {
  return codexRolloutEvidence
    ? codexRolloutEvidence.codexRolloutPendingUserInputStateText(text, initialCorrelations)
    : { known: false, pending: false, correlations: new Set(), edge: 'none' }
}

function codexRolloutHasPendingUserInputText(text) {
  return codexRolloutEvidence ? codexRolloutEvidence.codexRolloutHasPendingUserInputText(text) : false
}

function codexRolloutTimestampMs(...values) {
  return codexRolloutEvidence ? codexRolloutEvidence.codexRolloutTimestampMs(...values) : 0
}

function codexRolloutPendingPlanStateText(text) {
  return codexRolloutEvidence
    ? codexRolloutEvidence.codexRolloutPendingPlanStateText(text)
    : { known: false, pending: false, planReady: false, planLifecycleState: 'unknown', planLifecycleRevision: 0, planClearReason: '', turnMode: 'unknown' }
}
const CODEX_ACTION_RUNNER_MIN_WIDTH = codexRunnerBounds?.CODEX_ACTION_RUNNER_MIN_WIDTH ?? 720
const CODEX_ACTION_RUNNER_MIN_HEIGHT = codexRunnerBounds?.CODEX_ACTION_RUNNER_MIN_HEIGHT ?? 420

function cursorUnavailable(shape) {
  const message = `Cursor 模块未加载：${cursorBridgeLoadError || 'unknown error'}`
  if (shape === 'inventory') {
    return { revision: '', available: false, reason: 'unknown', sessions: [], truncated: false, readAt: Date.now() }
  }
  if (shape === 'environment') {
    return { available: false, reason: 'unknown', sessionCount: 0, readAt: Date.now(), hooks: 'unknown' }
  }
  if (shape === 'register') {
    return { ok: false, message }
  }
  return { outcome: 'unavailable', confirmsRead: false, message }
}

function claudeUnavailable(shape) {
  const message = `Claude 模块未加载：${claudeBridgeLoadError || 'unknown error'}`
  if (shape === 'snapshot') return { version: 1, revision: '', sessions: [], truncated: false, quota: null, readAt: Date.now() }
  if (shape === 'environment') {
    return { version: 1, installed: false, homeReady: false, authenticated: false, cliVersion: '', hooks: 'unknown', statusline: 'unknown', checkedAt: Date.now() }
  }
  if (shape === 'open') return { outcome: 'unavailable', confirmsRead: false, message }
  if (shape === 'archive') return { outcome: 'failed', message }
  return { ok: false, message }
}

function unavailableWindowCapability(reason = '') {
  return {
    platform: 'unsupported',
    bridgeRevision: WINDOW_BRIDGE_REVISION,
    supported: false,
    permission: 'unsupported',
    canList: false,
    canActivate: false,
    canClose: false,
    canAlwaysOnTop: false,
    reason: reason || '窗口子系统未加载'
  }
}
const CODEX_ACTION_RUNNER_CHANNELS = {
  snapshot: 'eypc-action-runner:snapshot',
  log: 'eypc-action-runner:log',
  logRequest: 'eypc-action-runner:log-request',
  action: 'eypc-action-runner:action',
  snapshotRequest: 'eypc-action-runner:snapshot-request',
  hide: 'eypc-action-runner:hide',
  dragStart: 'eypc-action-runner:drag-start',
  dragMove: 'eypc-action-runner:drag-move',
  dragEnd: 'eypc-action-runner:drag-end',
  resizeStart: 'eypc-action-runner:resize-start',
  resizeMove: 'eypc-action-runner:resize-move',
  resizeEnd: 'eypc-action-runner:resize-end',
  resizeCancel: 'eypc-action-runner:resize-cancel'
}
const CODEX_ACTION_RUNNER_STORAGE_KEY = 'eypc/codex/action-runner/v1'
let lastEnterPayload = null
const enterPayloadListeners = new Set()
let mqttSqliteAdapter = null
let mqttStorageLastError = ''
let mqttMigratedLegacyArchive = false
let codexProcess = null
let codexLaunchKey = ''
let codexStartupHint = ''
let codexReadyPromise = null
let codexRpcId = 0
let codexRpcBuffer = ''
let codexNativePlanExecutionCapabilityPromise = null
let codexNativePlanExecutionCapability = null
const codexRpcPending = new Map()
const codexThreadActions = new Map()
const codexProjectActions = new Map()
const codexActivityListeners = new Set()
let codexActivityInventory = new Map()
let codexActivitySourceFingerprint = ''
let codexActivityGeneration = 0
const codexActivitySemanticFingerprints = new Map()
const codexInteractionSemanticFingerprints = new Map()
let codexActivityBridgeFingerprint = ''
let codexInventoryRefreshPending = false
let codexInventoryMembershipGeneration = 0
let codexInventoryMembershipReconcileInFlight = null
let codexInventoryMembershipReconcilePending = false
let codexInventoryMembershipForcePending = false
const codexInventoryMembershipWatchers = new Map()
const codexInventoryMembershipStatPaths = new Set()
const codexLocalArchiveRecoverySuppressions = new Set()
let codexLiveEvidenceSequence = 0
let codexActivityDecisionCounters = {
  liveEpochOpened: 0,
  hydrationActiveDeferred: 0,
  staleTurnDiscarded: 0,
  branchTerminalDeferred: 0,
  snapshotConflictSuppressed: 0,
  missingMappingRetained: 0,
  waitingEdgeResubscribe: 0,
  waitingEdgeRecoveryExpired: 0
}
const CODEX_MISSING_ACTIVITY_MAPPING_RETENTION_MS = 120_000
const CODEX_DESKTOP_SIDE_RELATION_LIMIT = 1_000
const CODEX_PRIVATE_BRANCH_TERMINAL_LIMIT = 2_000
const CODEX_DESKTOP_OPENED_READ_LIMIT = 1_000
const CODEX_DESKTOP_PROVISIONAL_FOLLOW_LIMIT = 1_000
const CODEX_ROLLOUT_PENDING_INPUT_TAIL_BYTES = 4 * 1024 * 1024
const CODEX_ROLLOUT_PENDING_PLAN_TAIL_BYTES = [256 * 1024, 1024 * 1024, 4 * 1024 * 1024]
const CODEX_ROLLOUT_PROCESS_PROBE_MS = 1_000
let codexDesktopBridge = null
// Process-private Kernel owner. Declared before Provider callbacks so an early
// Desktop/App Server event can safely no-op until Kernel construction finishes.
let companionTaskKernel = null
// Recovery hints intentionally survive Desktop/App Server bridge teardown
// inside this preload process. They carry topology only: never live state,
// unread state, prompts, or Renderer-visible identifiers. RAW-181 additionally
// mirrors them as bounded persisted hints (threadId/parentThreadId/observedAt
// only) so a fresh preload process can re-follow a Desktop-only Side child;
// the restored hint asserts no state until the existing follow plus targeted
// latest-Turn verification confirms it.
const codexDesktopSideRelations = new Map()
const codexDesktopSideRelationObservedAt = new Map()
let codexDesktopSideRelationHintsRestored = false
let codexDesktopSideRelationPersistTimer = null
// Verified App Server inventory topology is kept separately from Desktop
// recovery hints. It is process-private and only contributes anonymized branch
// evidence to the parent task; Side Chat IDs never become public rows.
const codexInventorySideRelations = new Map()
const codexInventorySideBranchEvidence = new Map()
// Null means no complete App Server inventory has been accepted in this
// process generation yet. A Set (including an empty Set) is a positive,
// complete membership observation used only for stale Desktop Side recovery.
let codexCompleteInventoryThreadIds = null
const codexSideTopologyDiagnosticFingerprints = new Map()
// Raw branch IDs and exact terminal evidence remain Host-only. The V7 evidence
// adapter hashes branch refs before the single Provider batch reaches Kernel.
const codexPrivateBranchTerminals = new Map()
// Reserved for a future native-visible read receipt. Deep-link dispatch must
// never populate this map: only a concrete native receipt may acknowledge the
// currently observed completion. The receipt remains process-local.
const codexDesktopOpenedReadAcknowledgements = new Map()
const codexThreadTurnStatusCache = new Map()
const codexThreadTurnStatusDirty = new Map()
let codexThreadTurnStatusDirtyGeneration = 0
// Goal evidence is process-private. Entries contain only a finite status,
// updatedAt/freshness and causal sequence; objective, budgets, usage and raw
// response objects never enter this cache or cross the Bridge.
const codexThreadGoalCache = new Map()
const codexThreadGoalRefreshes = new Map()
let codexThreadGoalRpcAvailable = null
let codexThreadGoalGeneration = 0
const codexThreadFirstPromptCache = new Map()
const codexThreadPendingInputCache = new Map()
const codexThreadPendingPlanCache = new Map()
const codexRolloutDecisionTrackers = new Map()
let codexRolloutProcessProbeTimer = null
let codexRolloutProcessProbeInFlight = false
let codexRolloutProcessProbePending = false
let codexRolloutProcessProbeGeneration = 0
let codexThreadTurnStatusRpcAvailable = null
let codexThreadFirstPromptScanRunning = false
let codexThreadFirstPromptScanGeneration = 0
const codexActionRunnerActionListeners = new Set()
let codexActionRunnerWindow = null
let codexActionRunnerCatalog = { version: 1, projects: [], generatedAt: 0 }
let codexActionRunnerPreference = { pinned: false, view: 'records', runtimeByProject: {} }
let codexActionRunnerPreferenceLoaded = false
let codexActionRunnerForceClose = false
let codexActionRunnerVisible = false
let codexActionRunnerDrag = null
let codexActionRunnerResize = null
let codexNodeRuntimeDiscoveryCache = { expiresAt: 0, candidates: [] }

function run(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: 10_000 }, (error, stdout, stderr) => {
      resolve({ ok: !error, command, stdout: String(stdout || ''), stderr: String(stderr || ''), error: error ? String(error.message || error) : '' })
    })
  })
}

async function runFirst(plans) {
  let last = null
  for (const plan of plans) {
    const result = await run(plan.command, plan.args)
    last = result
    if (result.ok) return result
  }
  return last || { ok: false, stdout: '', stderr: '', error: 'no command candidates' }
}

function scanPlans() {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    return [
      { command: `${systemRoot}\\System32\\netstat.exe`, args: ['-ano', '-p', 'tcp'] },
      { command: 'netstat', args: ['-ano', '-p', 'tcp'] }
    ]
  }
  return [
    { command: '/usr/sbin/lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] },
    { command: '/usr/bin/lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] },
    { command: 'lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] }
  ]
}

function killPlans(pid, force) {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    const args = ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])]
    return [
      { command: `${systemRoot}\\System32\\taskkill.exe`, args },
      { command: 'taskkill', args }
    ]
  }
  const args = [force ? '-KILL' : '-TERM', String(pid)]
  return [
    { command: '/bin/kill', args },
    { command: 'kill', args }
  ]
}

function portFromAddress(value) {
  const match = String(value || '').match(/:(\d+)(?:\s|\)|$)/)
  return match ? Number(match[1]) : null
}

function dedupePorts(items) {
  const byKey = new Map()
  for (const item of items) {
    const key = `${item.pid}:${item.port}:${item.protocol}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { ...item, id: key })
      continue
    }
    const addresses = Array.from(new Set([...String(existing.address || '').split(' · '), item.address].map((value) => String(value || '').trim()).filter(Boolean)))
    byKey.set(key, {
      ...existing,
      command: existing.command || item.command,
      user: existing.user || item.user,
      state: existing.state || item.state,
      address: addresses.join(' · ')
    })
  }
  return Array.from(byKey.values())
}

function parseLsof(output) {
  const rows = String(output || '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const parts = line.split(/\s+/)
      if (parts.length < 9 || !line.includes('(LISTEN)')) return []
      const pid = Number(parts[1])
      const port = portFromAddress(parts.slice(8).join(' '))
      if (!Number.isInteger(pid) || !port) return []
      return [{ id: `${pid}:${port}:tcp`, pid, port, command: parts[0], user: parts[2], address: parts.slice(8).join(' ').replace(/\s*\(LISTEN\)\s*$/, ''), protocol: 'tcp', state: 'LISTEN' }]
    })
  return dedupePorts(rows)
}

function parseNetstat(output) {
  const rows = String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^TCP\s+/i.test(line) && /\bLISTENING\b/i.test(line))
    .flatMap((line) => {
      const parts = line.split(/\s+/)
      const pid = Number(parts[parts.length - 1])
      const port = portFromAddress(parts[1])
      if (!Number.isInteger(pid) || !port) return []
      return [{ id: `${pid}:${port}:tcp`, pid, port, command: `pid-${pid}`, address: parts[1], protocol: 'tcp', state: 'LISTEN' }]
    })
  return dedupePorts(rows)
}

async function scanPorts() {
  const result = await runFirst(scanPlans())
  if (!result.ok) {
    console.warn('[EyPc] port scan failed:', result.error || result.stderr)
    return []
  }
  return process.platform === 'win32' ? parseNetstat(result.stdout) : parseLsof(result.stdout)
}

async function killProcess(request) {
  const pid = Math.max(0, Math.trunc(Number(request && request.pid) || 0))
  const port = Math.max(0, Math.trunc(Number(request && request.port) || 0))
  const force = Boolean(request && request.force)
  const current = await scanPorts()
  if (!current.some((item) => item.pid === pid && item.port === port)) {
    return { ok: false, pid, port, force, error: 'PID no longer owns target port' }
  }
  const result = await runFirst(killPlans(pid, force))
  return { ok: result.ok, pid, port, force, error: result.ok ? undefined : result.error || result.stderr || 'kill failed' }
}

function readState() {
  try {
    if (!globalThis.utools || !globalThis.utools.dbStorage) return null
    return globalThis.utools.dbStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeState(state) {
  const startedAt = Date.now()
  try {
    if (!globalThis.utools || !globalThis.utools.dbStorage) {
      try {
        runtimeDiagnostics.record?.({
          level: 'error',
          scope: 'state-storage',
          event: 'application-state-write',
          outcome: 'failed',
          code: 'storage-unavailable',
          durationMs: Date.now() - startedAt
        })
      } catch {}
      return false
    }
    globalThis.utools.dbStorage.setItem(STORAGE_KEY, state)
  } catch (error) {
    try {
      runtimeDiagnostics.record?.({
        level: 'error',
        scope: 'state-storage',
        event: 'application-state-write',
        outcome: 'failed',
        code: fileErrorCode(error),
        durationMs: Date.now() - startedAt
      })
    } catch {}
    return false
  }
  try {
    runtimeDiagnostics.configure?.(state?.settings?.runtimeDiagnostics)
    runtimeDiagnostics.record?.({
      level: 'debug',
      scope: 'state-storage',
      event: 'application-state-write',
      outcome: 'persisted',
      durationMs: Date.now() - startedAt,
      details: { updatedAt: state?.updatedAt, activeTab: state?.activeTab }
    })
  } catch {}
  return true
}

// A failed load treats every candidate as an unusable preference (''):
// callers already read an empty preference as "fall through to automatic
// detection," the same outcome an unset preference produces.
function normalizeCodexLaunchPathPreference(value) {
  return codexLaunchPathPreference ? codexLaunchPathPreference.normalizeCodexLaunchPathPreference(value) : ''
}

function readCodexLaunchPathPreference() {
  return codexLaunchPathPreference ? codexLaunchPathPreference.readCodexLaunchPathPreference() : ''
}

function writeCodexLaunchPathPreference(pathValue) {
  try {
    if (!globalThis.utools || !globalThis.utools.dbStorage) return false
    const path = normalizeCodexLaunchPathPreference(pathValue)
    globalThis.utools.dbStorage.setItem(CODEX_LAUNCH_PATH_STORAGE_KEY, path ? { version: 1, path } : { version: 1 })
    return true
  } catch {
    return false
  }
}

function codexLaunchPathIsFile(pathValue) {
  return codexLaunchPathPreference ? codexLaunchPathPreference.codexLaunchPathIsFile(pathValue) : false
}

function readLegacyMqttArchive() {
  try {
    if (!globalThis.utools || !globalThis.utools.dbStorage) return null
    return globalThis.utools.dbStorage.getItem(MQTT_ARCHIVE_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeLegacyMqttArchive(archive) {
  try {
    if (!globalThis.utools || !globalThis.utools.dbStorage) return false
    globalThis.utools.dbStorage.setItem(MQTT_ARCHIVE_STORAGE_KEY, archive)
    return true
  } catch {
    return false
  }
}

function archiveHasData(archive) {
  return Boolean(
    archive &&
    typeof archive === 'object' &&
    (
      (Array.isArray(archive.connectionSnapshots) && archive.connectionSnapshots.length > 0) ||
      (Array.isArray(archive.sessions) && archive.sessions.length > 0) ||
      (Array.isArray(archive.publishTemplates) && archive.publishTemplates.length > 0) ||
      (Array.isArray(archive.publishDraftHistory) && archive.publishDraftHistory.length > 0)
    )
  )
}

function defaultMqttArchive() {
  return { version: 1, connectionSnapshots: [], sessions: [], publishTemplates: [], publishDraftHistory: [] }
}

function resolveMqttSqlitePath() {
  const explicitPath = process.env && typeof process.env.EYPC_MQTT_DB_PATH === 'string'
    ? process.env.EYPC_MQTT_DB_PATH.trim()
    : ''
  if (explicitPath) return explicitPath
  let baseDir = ''
  try {
    if (globalThis.utools && typeof globalThis.utools.getPath === 'function') {
      baseDir = String(globalThis.utools.getPath('userData') || '').trim()
    }
  } catch {}
  if (!baseDir) {
    try {
      baseDir = path.join(os.homedir(), '.eypc')
    } catch {
      baseDir = path.join(process.cwd(), '.eypc')
    }
  }
  return path.join(baseDir, 'mqtt-archive.sqlite')
}

function resolveCursorDataDirectory() {
  let baseDir = ''
  try {
    if (globalThis.utools && typeof globalThis.utools.getPath === 'function') {
      baseDir = String(globalThis.utools.getPath('userData') || '').trim()
    }
  } catch {}
  if (!baseDir) {
    try {
      baseDir = path.join(os.homedir(), '.eypc')
    } catch {
      baseDir = path.join(process.cwd(), '.eypc')
    }
  }
  return path.join(baseDir, 'cursor-companion')
}

function resolveClaudeDataDirectory() {
  let baseDir = ''
  try {
    if (globalThis.utools && typeof globalThis.utools.getPath === 'function') {
      baseDir = String(globalThis.utools.getPath('userData') || '').trim()
    }
  } catch {}
  if (!baseDir) {
    try {
      baseDir = path.join(os.homedir(), '.eypc')
    } catch {
      baseDir = path.join(process.cwd(), '.eypc')
    }
  }
  return path.join(baseDir, 'claude-companion')
}

function resolveMqttUserDataDir() {
  try {
    if (globalThis.utools && typeof globalThis.utools.getPath === 'function') {
      const userData = String(globalThis.utools.getPath('userData') || '').trim()
      if (userData) return userData
    }
  } catch {}
  try {
    return path.dirname(resolveMqttSqlitePath())
  } catch {}
  try {
    return path.join(os.homedir(), '.eypc')
  } catch {
    return path.join(process.cwd(), '.eypc')
  }
}

function resolveRuntimeDiagnosticsDirectory() {
  return path.join(resolveMqttUserDataDir(), 'eypc-diagnostics')
}

const runtimeDiagnosticsDirectory = resolveRuntimeDiagnosticsDirectory()
let runtimeDiagnostics = {
  revision: 'eypc-runtime-diagnostics-v3',
  record: () => null,
  configure: () => null,
  cleanup: () => false,
  flush: () => Promise.resolve(false),
  ensureDirectory: () => false,
  snapshot: () => ({
    revision: 'eypc-runtime-diagnostics-v3',
    status: 'unavailable',
    updatedAt: 0,
    sessionId: '',
    processId: process.pid,
    settings: { enabled: true, level: 'debug', userConfigured: false, defaultsRevision: 3 },
    directory: runtimeDiagnosticsDirectory,
    activeFile: '',
    totals: { events: 0, filtered: 0, debug: 0, info: 0, error: 0, slow: 0, writeFailures: 0 },
    storage: { fileCount: 0, totalBytes: 0, maxFileBytes: 8 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024, retentionDays: 14 },
    recent: []
  })
}
try {
  let diagnosticsModule = null
  for (const base of [
    typeof __dirname === 'string' ? __dirname : '',
    process.cwd(),
    path.join(process.cwd(), 'preload'),
    path.join(process.cwd(), 'public')
  ].filter(Boolean)) {
    try {
      diagnosticsModule = require(path.join(base, 'diagnostics.cjs'))
      if (typeof diagnosticsModule?.createRuntimeDiagnostics === 'function') break
    } catch {}
  }
  if (typeof diagnosticsModule?.createRuntimeDiagnostics === 'function') {
    runtimeDiagnostics = diagnosticsModule.createRuntimeDiagnostics({
      fs,
      path,
      directory: runtimeDiagnosticsDirectory,
      settings: readState()?.settings?.runtimeDiagnostics
    })
  }
} catch {}

async function openRuntimeDiagnosticsDirectory() {
  const startedAt = Date.now()
  const ensured = runtimeDiagnostics.ensureDirectory?.() === true
  try {
    const result = await openFavoritePath(runtimeDiagnosticsDirectory)
    runtimeDiagnostics.record?.({
      level: result.outcome === 'failed' ? 'error' : 'info',
      scope: 'runtime-diagnostics',
      event: 'open-directory',
      outcome: result.outcome,
      ...(result.errorCode ? { code: result.errorCode } : {}),
      durationMs: Date.now() - startedAt,
      details: { directory: runtimeDiagnosticsDirectory, ensured }
    })
    return result
  } catch (error) {
    runtimeDiagnostics.record?.({
      level: 'error',
      scope: 'runtime-diagnostics',
      event: 'open-directory',
      outcome: 'failed',
      code: fileErrorCode(error),
      durationMs: Date.now() - startedAt,
      details: { directory: runtimeDiagnosticsDirectory, ensured }
    })
    throw error
  }
}

function currentRuntimeDiagnosticsFile() {
  const activeFile = String(runtimeDiagnostics.snapshot?.()?.activeFile || '').trim()
  if (!activeFile) return ''
  if (path.dirname(activeFile) !== runtimeDiagnosticsDirectory) return ''
  return /^runtime-[0-9]+-[0-9]+\.jsonl$/.test(path.basename(activeFile)) ? activeFile : ''
}

async function openRuntimeDiagnosticsFile() {
  const startedAt = Date.now()
  await runtimeDiagnostics.flush?.()
  const activeFile = currentRuntimeDiagnosticsFile()
  if (!activeFile) {
    return fileActionResult('failed', { errorCode: 'not-found', message: 'runtime diagnostics file has not been created' })
  }
  try {
    const result = await openFavoritePath(activeFile)
    runtimeDiagnostics.record?.({
      level: result.outcome === 'failed' ? 'error' : 'info',
      scope: 'runtime-diagnostics',
      event: 'open-file',
      outcome: result.outcome,
      ...(result.errorCode ? { code: result.errorCode } : {}),
      durationMs: Date.now() - startedAt,
      details: { activeFile }
    })
    return result
  } catch (error) {
    runtimeDiagnostics.record?.({
      level: 'error',
      scope: 'runtime-diagnostics',
      event: 'open-file',
      outcome: 'failed',
      code: fileErrorCode(error),
      durationMs: Date.now() - startedAt,
      details: { activeFile }
    })
    throw error
  }
}

function clearRuntimeDiagnosticsFiles() {
  return typeof runtimeDiagnostics.clear === 'function'
    ? runtimeDiagnostics.clear()
    : { outcome: 'unavailable', removedFiles: 0, failedFiles: 0, remainingFiles: 0, remainingBytes: 0 }
}

function resolveMqttSecretsPath() {
  const explicitPath = process.env && typeof process.env.EYPC_MQTT_SECRETS_PATH === 'string'
    ? process.env.EYPC_MQTT_SECRETS_PATH.trim()
    : ''
  return explicitPath || path.join(resolveMqttUserDataDir(), MQTT_SECRETS_FILE_NAME)
}

function resolveMqttSecretsKeyPath() {
  return path.join(path.dirname(resolveMqttSecretsPath()), MQTT_SECRETS_KEY_FILE_NAME)
}

function normalizeSqliteArchiveInput(archive) {
  const source = archive && typeof archive === 'object' ? archive : {}
  return {
    version: 1,
    connectionSnapshots: Array.isArray(source.connectionSnapshots) ? source.connectionSnapshots : [],
    sessions: Array.isArray(source.sessions) ? source.sessions : [],
    publishTemplates: Array.isArray(source.publishTemplates) ? source.publishTemplates : [],
    publishDraftHistory: Array.isArray(source.publishDraftHistory) ? source.publishDraftHistory : []
  }
}

function ensureMqttSqliteSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connection_snapshots (
      id TEXT PRIMARY KEY,
      updated_at INTEGER NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      started_at INTEGER NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      timestamp INTEGER NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS publish_templates (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS publish_draft_history (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL
    );
  `)
}

function createMqttSqliteAdapter() {
  try {
    const sqlite = require('node:sqlite')
    const DatabaseSync = sqlite && sqlite.DatabaseSync
    if (typeof DatabaseSync !== 'function') throw new Error('node:sqlite DatabaseSync unavailable')
    const dbPath = resolveMqttSqlitePath()
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const db = new DatabaseSync(dbPath)
    ensureMqttSqliteSchema(db)

    const writeMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    const deleteMeta = db.prepare('DELETE FROM meta WHERE key = ?')
    const readConnections = db.prepare('SELECT id, data_json FROM connection_snapshots ORDER BY updated_at DESC, id ASC')
    const readSessions = db.prepare('SELECT id, data_json FROM sessions ORDER BY started_at DESC, id ASC')
    const readMessages = db.prepare('SELECT id, session_id, data_json FROM messages ORDER BY timestamp ASC, id ASC')
    const readTemplates = db.prepare('SELECT id, data_json FROM publish_templates ORDER BY updated_at DESC, id ASC')
    const readDraftHistory = db.prepare('SELECT id, data_json FROM publish_draft_history ORDER BY updated_at DESC, id ASC')
    const deleteConnection = db.prepare('DELETE FROM connection_snapshots WHERE id = ?')
    const deleteSession = db.prepare('DELETE FROM sessions WHERE id = ?')
    const deleteMessage = db.prepare('DELETE FROM messages WHERE id = ?')
    const deleteTemplate = db.prepare('DELETE FROM publish_templates WHERE id = ?')
    const deleteDraftHistory = db.prepare('DELETE FROM publish_draft_history WHERE id = ?')
    const insertConnection = db.prepare('INSERT OR REPLACE INTO connection_snapshots (id, updated_at, data_json) VALUES (?, ?, ?)')
    const insertSession = db.prepare('INSERT OR REPLACE INTO sessions (id, connection_id, started_at, data_json) VALUES (?, ?, ?, ?)')
    const insertMessage = db.prepare('INSERT OR REPLACE INTO messages (id, session_id, connection_id, direction, timestamp, data_json) VALUES (?, ?, ?, ?, ?, ?)')
    const insertTemplate = db.prepare('INSERT OR REPLACE INTO publish_templates (id, connection_id, updated_at, data_json) VALUES (?, ?, ?, ?)')
    const insertDraftHistory = db.prepare('INSERT OR REPLACE INTO publish_draft_history (id, connection_id, updated_at, data_json) VALUES (?, ?, ?, ?)')

    function parseRow(row) {
      try { return JSON.parse(String(row && row.data_json || '{}')) } catch { return null }
    }

    function sessionData(session) {
      const data = { ...session }
      delete data.messages
      return data
    }

    function syncRows(existingRows, items, serialize, upsert, remove) {
      const existing = new Map(existingRows.map((row) => [String(row.id), String(row.data_json || '')]))
      const nextIds = new Set()
      for (const item of items) {
        if (!item || !item.id) continue
        const id = String(item.id)
        const serialized = JSON.stringify(serialize(item))
        nextIds.add(id)
        if (existing.get(id) !== serialized) upsert(item, serialized)
      }
      for (const id of existing.keys()) {
        if (!nextIds.has(id)) remove.run(id)
      }
    }

    function beginTransaction(run) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const result = run()
        writeMeta.run('updated_at', String(Date.now()))
        deleteMeta.run('archive_json')
        db.exec('COMMIT')
        return result
      } catch (error) {
        try { db.exec('ROLLBACK') } catch {}
        throw error
      }
    }

    function writeArchiveToSqlite(archive) {
      const normalized = normalizeSqliteArchiveInput(archive)
      return beginTransaction(() => {
        syncRows(readConnections.all(), normalized.connectionSnapshots, (item) => item, (item, serialized) => {
          insertConnection.run(String(item.id), Math.trunc(Number(item.updatedAt) || 0), serialized)
        }, deleteConnection)
        syncRows(readSessions.all(), normalized.sessions, sessionData, (item, serialized) => {
          insertSession.run(String(item.id), String(item.connectionId || ''), Math.trunc(Number(item.startedAt) || 0), serialized)
        }, deleteSession)
        const messages = normalized.sessions.flatMap((session) => (Array.isArray(session && session.messages)
          ? session.messages.map((message) => ({
            ...message,
            sessionId: message && message.sessionId || session.id,
            connectionId: message && message.connectionId || session.connectionId
          }))
          : []))
        syncRows(readMessages.all(), messages, (item) => item, (item, serialized) => {
          insertMessage.run(String(item.id), String(item.sessionId || ''), String(item.connectionId || ''), String(item.direction || 'event'), Math.trunc(Number(item.timestamp) || 0), serialized)
        }, deleteMessage)
        syncRows(readTemplates.all(), normalized.publishTemplates, (item) => item, (item, serialized) => {
          insertTemplate.run(String(item.id), String(item.connectionId || ''), Math.trunc(Number(item.operatedAt || item.updatedAt) || 0), serialized)
        }, deleteTemplate)
        syncRows(readDraftHistory.all(), normalized.publishDraftHistory, (item) => item, (item, serialized) => {
          insertDraftHistory.run(String(item.id), String(item.connectionId || ''), Math.trunc(Number(item.updatedAt) || 0), serialized)
        }, deleteDraftHistory)
        return true
      })
    }

    function readArchiveTables() {
      const messagesBySession = new Map()
      for (const row of readMessages.all()) {
        const message = parseRow(row)
        if (!message) continue
        const sessionId = String(row.session_id || message.sessionId || '')
        const messages = messagesBySession.get(sessionId) || []
        messages.push(message)
        messagesBySession.set(sessionId, messages)
      }
      return normalizeSqliteArchiveInput({
        connectionSnapshots: readConnections.all().map(parseRow).filter(Boolean),
        sessions: readSessions.all().map((row) => {
          const session = parseRow(row)
          return session ? { ...session, messages: messagesBySession.get(String(row.id)) || [] } : null
        }).filter(Boolean),
        publishTemplates: readTemplates.all().map(parseRow).filter(Boolean),
        publishDraftHistory: readDraftHistory.all().map(parseRow).filter(Boolean)
      })
    }

    function readArchiveFromSqlite() {
      const current = readArchiveTables()
      if (archiveHasData(current)) return current
      const legacy = readLegacyMqttArchive()
      if (archiveHasData(legacy)) {
        writeArchiveToSqlite(legacy)
        mqttMigratedLegacyArchive = true
        writeMeta.run('migrated_legacy_archive_at', String(Date.now()))
        return normalizeSqliteArchiveInput(legacy)
      }
      return defaultMqttArchive()
    }

    function mutateArchive(input) {
      if (!input || input.revision !== 'mqtt-archive-mutation-v1' || input.kind !== 'append-message') return false
      const session = input.session
      const message = input.message
      if (!session || !session.id || !message || !message.id) return false
      return beginTransaction(() => {
        const snapshot = input.connectionSnapshot
        if (snapshot && snapshot.id) {
          insertConnection.run(String(snapshot.id), Math.trunc(Number(snapshot.updatedAt) || 0), JSON.stringify(snapshot))
        }
        insertSession.run(String(session.id), String(session.connectionId || ''), Math.trunc(Number(session.startedAt) || 0), JSON.stringify(sessionData(session)))
        insertMessage.run(String(message.id), String(message.sessionId || session.id), String(message.connectionId || session.connectionId || ''), String(message.direction || 'event'), Math.trunc(Number(message.timestamp) || 0), JSON.stringify(message))
        return true
      })
    }

    return {
      dbPath,
      readArchive: readArchiveFromSqlite,
      writeArchive: writeArchiveToSqlite,
      mutateArchive
    }
  } catch (error) {
    mqttStorageLastError = error instanceof Error ? error.message : String(error)
    return null
  }
}

function mqttSqlite() {
  if (mqttSqliteAdapter) return mqttSqliteAdapter
  mqttSqliteAdapter = createMqttSqliteAdapter()
  return mqttSqliteAdapter
}

function getMqttStorageStatus() {
  const adapter = mqttSqlite()
  if (adapter) {
    return {
      mode: 'sqlite',
      sqliteAvailable: true,
      dbPath: adapter.dbPath,
      migratedLegacyArchive: mqttMigratedLegacyArchive,
      ...(mqttStorageLastError ? { lastError: mqttStorageLastError } : {})
    }
  }
  return {
    mode: globalThis.utools && globalThis.utools.dbStorage ? 'legacy-dbStorage' : 'browser-localStorage',
    sqliteAvailable: false,
    migratedLegacyArchive: mqttMigratedLegacyArchive,
    ...(mqttStorageLastError ? { lastError: mqttStorageLastError } : {})
  }
}

function readMqttArchive() {
  const adapter = mqttSqlite()
  if (adapter) {
    try {
      return adapter.readArchive()
    } catch (error) {
      mqttStorageLastError = error instanceof Error ? error.message : String(error)
    }
  }
  return readLegacyMqttArchive()
}

function writeMqttArchive(archive) {
  const adapter = mqttSqlite()
  if (adapter) {
    try {
      return adapter.writeArchive(archive)
    } catch (error) {
      mqttStorageLastError = error instanceof Error ? error.message : String(error)
    }
  }
  return writeLegacyMqttArchive(archive)
}

function mutateMqttArchive(input) {
  const adapter = mqttSqlite()
  if (!adapter || typeof adapter.mutateArchive !== 'function') return false
  try {
    return adapter.mutateArchive(input) === true
  } catch (error) {
    mqttStorageLastError = error instanceof Error ? error.message : String(error)
    return false
  }
}

function normalizeMqttSecrets(value) {
  const source = value && typeof value === 'object' ? value : {}
  const candidate = source.version === 1 && source.secrets && typeof source.secrets === 'object'
    ? source.secrets
    : source
  return Object.fromEntries(Object.entries(candidate)
    .map(([key, secret]) => [String(key || '').trim(), secret])
    .filter(([key, secret]) => key && typeof secret === 'string' && secret.length > 0))
}

function isEncryptedMqttSecretsPayload(value) {
  return Boolean(value && typeof value === 'object' && value.version === MQTT_SECRETS_ENCRYPTION_VERSION && typeof value.data === 'string')
}

function mqttSecretsPlaintext(secrets) {
  return JSON.stringify({
    version: 1,
    secrets: normalizeMqttSecrets(secrets)
  })
}

function getElectronSafeStorage() {
  try {
    const electron = require('electron')
    const safeStorage = electron && electron.safeStorage
    if (!safeStorage || typeof safeStorage.encryptString !== 'function' || typeof safeStorage.decryptString !== 'function') return null
    if (typeof safeStorage.isEncryptionAvailable === 'function' && !safeStorage.isEncryptionAvailable()) return null
    return safeStorage
  } catch {
    return null
  }
}

function parseStoredMqttSecretsKey(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  try {
    const key = Buffer.from(text, 'base64')
    return key.length === 32 ? key : null
  } catch {
    return null
  }
}

function readOrCreateMqttSecretsKey() {
  const keyPath = resolveMqttSecretsKeyPath()
  try {
    const existing = parseStoredMqttSecretsKey(fs.readFileSync(keyPath, 'utf8'))
    if (existing) return existing
  } catch {}
  const key = crypto.randomBytes(32)
  fs.mkdirSync(path.dirname(keyPath), { recursive: true })
  fs.writeFileSync(keyPath, key.toString('base64'), { mode: 0o600 })
  try {
    fs.chmodSync(keyPath, 0o600)
  } catch {}
  return key
}

function encryptMqttSecretsPayload(secrets) {
  const plaintext = mqttSecretsPlaintext(secrets)
  const safeStorage = getElectronSafeStorage()
  if (safeStorage) {
    const encrypted = safeStorage.encryptString(plaintext)
    return {
      version: MQTT_SECRETS_ENCRYPTION_VERSION,
      crypto: 'electron-safe-storage',
      encoding: 'base64',
      data: Buffer.from(encrypted).toString('base64')
    }
  }

  const key = readOrCreateMqttSecretsKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(MQTT_SECRETS_AES_ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    version: MQTT_SECRETS_ENCRYPTION_VERSION,
    crypto: MQTT_SECRETS_AES_ALGORITHM,
    encoding: 'base64',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ciphertext.toString('base64')
  }
}

function decryptMqttSecretsPayload(payload) {
  if (!isEncryptedMqttSecretsPayload(payload)) return normalizeMqttSecrets(payload)
  try {
    if (payload.crypto === 'electron-safe-storage') {
      const safeStorage = getElectronSafeStorage()
      if (!safeStorage) return {}
      return normalizeMqttSecrets(JSON.parse(safeStorage.decryptString(Buffer.from(payload.data, 'base64'))))
    }
    if (payload.crypto !== MQTT_SECRETS_AES_ALGORITHM || typeof payload.iv !== 'string' || typeof payload.tag !== 'string') return {}
    const decipher = crypto.createDecipheriv(MQTT_SECRETS_AES_ALGORITHM, readOrCreateMqttSecretsKey(), Buffer.from(payload.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
    const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8')
    return normalizeMqttSecrets(JSON.parse(plaintext))
  } catch {
    return {}
  }
}

function readMqttSecrets() {
  try {
    const raw = fs.readFileSync(resolveMqttSecretsPath(), 'utf8')
    const payload = JSON.parse(raw)
    const secrets = decryptMqttSecretsPayload(payload)
    if (!isEncryptedMqttSecretsPayload(payload) && Object.keys(secrets).length) writeMqttSecrets(secrets)
    return secrets
  } catch (error) {
    if (!error || error.code !== 'ENOENT') return {}
  }
  try {
    if (!globalThis.localStorage) return {}
    const raw = globalThis.localStorage.getItem(MQTT_SECRETS_LOCAL_STORAGE_KEY)
    const payload = raw ? JSON.parse(raw) : {}
    const secrets = decryptMqttSecretsPayload(payload)
    if (Object.keys(secrets).length) writeMqttSecrets(secrets)
    return secrets
  } catch {
    return {}
  }
}

function writeMqttSecrets(secrets) {
  const normalized = normalizeMqttSecrets(secrets)
  let encryptedPayload = null
  try {
    encryptedPayload = encryptMqttSecretsPayload(normalized)
  } catch {
    return false
  }
  let wroteFile = false
  try {
    const secretsPath = resolveMqttSecretsPath()
    fs.mkdirSync(path.dirname(secretsPath), { recursive: true })
    fs.writeFileSync(secretsPath, JSON.stringify(encryptedPayload, null, 2), { mode: 0o600 })
    try {
      fs.chmodSync(secretsPath, 0o600)
    } catch {}
    wroteFile = true
  } catch {}
  let wroteLocalStorage = false
  try {
    if (!globalThis.localStorage) return wroteFile
    globalThis.localStorage.setItem(MQTT_SECRETS_LOCAL_STORAGE_KEY, JSON.stringify(encryptedPayload))
    wroteLocalStorage = true
  } catch {
    wroteLocalStorage = false
  }
  return wroteFile || wroteLocalStorage
}

function fileActionResult(outcome, options = {}) {
  return { outcome, ...options }
}

function fileErrorCode(error, fallback = 'io-error') {
  const code = error && typeof error === 'object' ? String(error.code || '') : ''
  if (code === 'ENOENT') return 'not-found'
  if (code === 'EACCES' || code === 'EPERM') return 'permission-denied'
  if (code === 'ETIMEDOUT') return 'timeout'
  if (code === 'ENOTSUP' || code === 'ENOSYS') return 'unsupported'
  const message = String(error && (error.message || error) || '').toLowerCase()
  if (message.includes('no application') || message.includes('no handler') || message.includes('default app')) return 'no-handler'
  if (message.includes('timed out') || message.includes('timeout')) return 'timeout'
  if (message.includes('permission') || message.includes('access denied')) return 'permission-denied'
  if (message.includes('not found') || message.includes('no such file')) return 'not-found'
  return fallback
}

function fileErrorMessage(error, fallback) {
  return String(error && (error.message || error) || fallback)
}

function isAbsoluteFavoritePath(target) {
  if (!target) return false
  return process.platform === 'win32' ? path.win32.isAbsolute(target) : path.posix.isAbsolute(target)
}

function favoriteStatKind(stat) {
  if (stat && typeof stat.isFile === 'function' && stat.isFile()) return 'file'
  if (stat && typeof stat.isDirectory === 'function' && stat.isDirectory()) return 'folder'
  return 'other'
}

async function inspectFavoritePath(target) {
  const normalizedTarget = String(target || '').trim()
  if (!isAbsoluteFavoritePath(normalizedTarget)) {
    return {
      path: normalizedTarget,
      status: 'invalid',
      kind: 'unknown',
      exists: false,
      isSymbolicLink: false,
      errorCode: 'invalid-path',
      error: 'path must be absolute'
    }
  }

  try {
    const lstat = await withFileActionTimeout(fs.promises.lstat ? fs.promises.lstat(normalizedTarget) : fs.promises.stat(normalizedTarget))
    const isSymbolicLink = Boolean(lstat && typeof lstat.isSymbolicLink === 'function' && lstat.isSymbolicLink())
    let resolvedStat = lstat
    let linkTargetKind
    if (isSymbolicLink) {
      try {
        resolvedStat = await withFileActionTimeout(fs.promises.stat(normalizedTarget))
        linkTargetKind = favoriteStatKind(resolvedStat)
      } catch (error) {
        const errorCode = fileErrorCode(error)
        return {
          path: normalizedTarget,
          status: errorCode === 'not-found' ? 'missing' : errorCode === 'permission-denied' ? 'permission-denied' : 'offline',
          kind: 'other',
          exists: errorCode !== 'not-found',
          isSymbolicLink: true,
          linkTargetKind: errorCode === 'not-found' ? 'missing' : 'unknown',
          ...(Number.isFinite(lstat && lstat.size) ? { size: lstat.size } : {}),
          ...(Number.isFinite(lstat && lstat.mtimeMs) ? { modifiedAt: lstat.mtimeMs } : {}),
          errorCode,
          error: fileErrorMessage(error, 'symbolic link target unavailable')
        }
      }
    }
    const inspection = {
      path: normalizedTarget,
      status: 'available',
      kind: favoriteStatKind(resolvedStat),
      exists: true,
      isSymbolicLink,
      ...(linkTargetKind ? { linkTargetKind } : {}),
      ...(Number.isFinite(resolvedStat && resolvedStat.size) ? { size: resolvedStat.size } : {}),
      ...(Number.isFinite(resolvedStat && resolvedStat.mtimeMs) ? { modifiedAt: resolvedStat.mtimeMs } : {})
    }
    if (fs.promises.access) {
      try {
        await withFileActionTimeout(fs.promises.access(normalizedTarget, fs.constants && fs.constants.R_OK))
      } catch (error) {
        const errorCode = fileErrorCode(error)
        return {
          ...inspection,
          status: errorCode === 'not-found' ? 'missing' : errorCode === 'permission-denied' ? 'permission-denied' : 'offline',
          exists: errorCode !== 'not-found',
          errorCode,
          error: fileErrorMessage(error, 'path access check failed')
        }
      }
    }
    return inspection
  } catch (error) {
    const errorCode = fileErrorCode(error)
    return {
      path: normalizedTarget,
      status: errorCode === 'not-found' ? 'missing' : errorCode === 'permission-denied' ? 'permission-denied' : 'offline',
      kind: 'unknown',
      exists: false,
      isSymbolicLink: false,
      errorCode,
      error: fileErrorMessage(error, 'path inspection failed')
    }
  }
}

async function inspectFavoritePaths(targets) {
  const paths = Array.isArray(targets) ? targets : []
  return Promise.all(paths.map((target) => inspectFavoritePath(target)))
}

async function preflightFavoritePath(target) {
  const inspection = await inspectFavoritePath(target)
  if (inspection.status === 'available') return { target: inspection.path, inspection }
  return {
    result: fileActionResult('failed', {
      errorCode: inspection.errorCode || 'io-error',
      message: inspection.error || 'path unavailable',
      paths: [inspection.path]
    })
  }
}

function electronShell() {
  try {
    const electron = require('electron')
    return electron.shell || (electron.remote && electron.remote.shell) || null
  } catch {
    return null
  }
}

async function withFileActionTimeout(value) {
  let timeoutId
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(Object.assign(new Error('file action timed out'), { code: 'ETIMEDOUT' })), 10_000)
      })
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function utoolsShellDispatch(method, target) {
  try {
    if (!globalThis.utools) return fileActionResult('failed', { errorCode: 'unsupported', message: `${method} unavailable`, paths: [target] })
    if (method === 'reveal') {
      if (typeof globalThis.utools.shellShowItemInFolder !== 'function') return fileActionResult('failed', { errorCode: 'unsupported', message: 'reveal unavailable', paths: [target] })
      globalThis.utools.shellShowItemInFolder(target)
      return fileActionResult('dispatched', { paths: [target] })
    }
    if (typeof globalThis.utools.shellOpenPath !== 'function') return fileActionResult('failed', { errorCode: 'unsupported', message: 'open unavailable', paths: [target] })
    globalThis.utools.shellOpenPath(target)
    return fileActionResult('dispatched', { paths: [target] })
  } catch (error) {
    return fileActionResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, `${method} failed`), paths: [target] })
  }
}

async function copyTextAction(target) {
  const normalizedTarget = String(target || '')
  try {
    if (globalThis.utools && typeof globalThis.utools.copyText === 'function') {
      const copied = await globalThis.utools.copyText(normalizedTarget)
      if (copied === false) return fileActionResult('failed', { errorCode: 'io-error', message: 'copy text failed', paths: [normalizedTarget] })
      return fileActionResult(copied === true ? 'success' : 'dispatched', { paths: [normalizedTarget] })
    }
  } catch (error) {
    return fileActionResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, 'copy text failed'), paths: [normalizedTarget] })
  }
  return fileActionResult('failed', { errorCode: 'unsupported', message: 'copy text unavailable', paths: [normalizedTarget] })
}

async function copyText(target) {
  const result = await copyTextAction(target)
  return result.outcome === 'success' || result.outcome === 'dispatched'
}

function saveTextFilePath(result) {
  if (typeof result === 'string') return result.trim()
  if (result && typeof result === 'object' && typeof result.filePath === 'string' && !result.canceled) return result.filePath.trim()
  return ''
}

function saveTextFileName(value) {
  const base = path.basename(String(value || '').trim()) || 'mqtt-export.json'
  return base.toLowerCase().endsWith('.json') ? base : `${base}.json`
}

async function saveTextFile(input) {
  const source = input && typeof input === 'object' ? input : {}
  const suggestedName = saveTextFileName(source.suggestedName)
  const text = String(source.text ?? '')
  const options = {
    title: '保存 MQTT 融合 JSON',
    defaultPath: suggestedName,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }
  let target = ''
  try {
    if (globalThis.utools && typeof globalThis.utools.showSaveDialog === 'function') {
      target = saveTextFilePath(await globalThis.utools.showSaveDialog(options))
    } else {
      const electron = require('electron')
      const dialog = electron.dialog || (electron.remote && electron.remote.dialog)
      if (dialog && typeof dialog.showSaveDialogSync === 'function') {
        target = saveTextFilePath(dialog.showSaveDialogSync(options))
      } else if (dialog && typeof dialog.showSaveDialog === 'function') {
        target = saveTextFilePath(await dialog.showSaveDialog(options))
      } else {
        return { outcome: 'failed', errorCode: 'unsupported', message: 'save dialog unavailable' }
      }
    }
    if (!target) return { outcome: 'cancelled' }
    await withFileActionTimeout(fs.promises.writeFile(target, text, { encoding: 'utf8' }))
    return { outcome: 'saved' }
  } catch (error) {
    return {
      outcome: 'failed',
      errorCode: fileErrorCode(error),
      message: fileErrorMessage(error, 'save text file failed')
    }
  }
}

async function copyFavoritePath(target) {
  const normalizedTarget = String(target || '').trim()
  if (!normalizedTarget) return fileActionResult('failed', { errorCode: 'invalid-path', message: 'empty path' })
  return copyTextAction(normalizedTarget)
}

async function copyFavoriteItems(targets) {
  const paths = Array.isArray(targets) ? [...new Set(targets.map((target) => String(target || '').trim()).filter(Boolean))] : []
  if (!paths.length) return fileActionResult('failed', { errorCode: 'invalid-path', message: 'no files to copy' })
  const inspections = await inspectFavoritePaths(paths)
  const unavailable = inspections.find((inspection) => inspection.status !== 'available')
  if (unavailable) {
    return fileActionResult('failed', {
      errorCode: unavailable.errorCode || 'io-error',
      message: unavailable.error || 'file unavailable',
      paths
    })
  }
  try {
    if (!globalThis.utools || typeof globalThis.utools.copyFile !== 'function') {
      return fileActionResult('failed', { errorCode: 'unsupported', message: 'copy items unavailable', paths })
    }
    const copied = await globalThis.utools.copyFile(paths)
    return copied
      ? fileActionResult('success', { paths })
      : fileActionResult('failed', { errorCode: 'io-error', message: 'copy items failed', paths })
  } catch (error) {
    return fileActionResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, 'copy items failed'), paths })
  }
}

async function macOpen(target, reveal = false) {
  const result = await runFirst([{
    command: '/usr/bin/open',
    args: reveal ? ['-R', target] : [target]
  }])
  if (result && result.ok) return fileActionResult('success', { paths: [target] })
  const error = result && (result.error || result.stderr)
  return fileActionResult('failed', {
    errorCode: fileErrorCode(error, 'no-handler'),
    message: fileErrorMessage(error, reveal ? 'reveal failed' : 'default open failed'),
    paths: [target]
  })
}

async function openFavoritePath(target) {
  const preflight = await preflightFavoritePath(target)
  if (preflight.result) return preflight.result
  const normalizedTarget = preflight.target
  let failure = fileActionResult('failed', { errorCode: 'unsupported', message: 'open unavailable', paths: [normalizedTarget] })
  const shell = electronShell()
  if (shell && typeof shell.openPath === 'function') {
    try {
      const errorText = String(await withFileActionTimeout(shell.openPath(normalizedTarget)) || '').trim()
      if (!errorText) return fileActionResult('success', { paths: [normalizedTarget] })
      failure = fileActionResult('failed', { errorCode: fileErrorCode(errorText, 'no-handler'), message: errorText, paths: [normalizedTarget] })
    } catch (error) {
      failure = fileActionResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, 'open failed'), paths: [normalizedTarget] })
    }
  } else if (process.platform === 'darwin') {
    const macResult = await macOpen(normalizedTarget, false)
    if (macResult.outcome === 'success') return macResult
    failure = macResult
  }

  if (process.platform === 'darwin') {
    const revealResult = await macOpen(normalizedTarget, true)
    if (revealResult.outcome === 'success') {
      return fileActionResult('revealed-instead', { message: 'open failed; item revealed instead', paths: [normalizedTarget] })
    }
  }
  const dispatched = utoolsShellDispatch('open', normalizedTarget)
  return dispatched.outcome === 'dispatched' ? dispatched : failure
}

async function revealFavoritePath(target) {
  const preflight = await preflightFavoritePath(target)
  if (preflight.result) return preflight.result
  const normalizedTarget = preflight.target
  if (process.platform === 'darwin') {
    const macResult = await macOpen(normalizedTarget, true)
    if (macResult.outcome === 'success') return macResult
  }
  const shell = electronShell()
  if (shell && typeof shell.showItemInFolder === 'function') {
    try {
      shell.showItemInFolder(normalizedTarget)
      return fileActionResult('dispatched', { paths: [normalizedTarget] })
    } catch (error) {
      const failure = fileActionResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, 'reveal failed'), paths: [normalizedTarget] })
      const dispatched = utoolsShellDispatch('reveal', normalizedTarget)
      return dispatched.outcome === 'dispatched' ? dispatched : failure
    }
  }
  return utoolsShellDispatch('reveal', normalizedTarget)
}

function favoriteFileCapabilities() {
  const shell = electronShell()
  const utools = globalThis.utools || {}
  let dialog = null
  try {
    const electron = require('electron')
    dialog = electron.dialog || (electron.remote && electron.remote.dialog)
  } catch {}
  const canPick = typeof utools.showOpenDialog === 'function' || Boolean(dialog && (dialog.showOpenDialog || dialog.showOpenDialogSync))
  return {
    platform: process.platform === 'darwin' || process.platform === 'win32' || process.platform === 'linux' ? process.platform : 'unsupported',
    open: Boolean((shell && typeof shell.openPath === 'function') || process.platform === 'darwin' || typeof utools.shellOpenPath === 'function'),
    reveal: Boolean(process.platform === 'darwin' || (shell && typeof shell.showItemInFolder === 'function') || typeof utools.shellShowItemInFolder === 'function'),
    copyPath: typeof utools.copyText === 'function',
    copyItems: typeof utools.copyFile === 'function',
    pickFiles: canPick,
    pickFolders: canPick,
    listDirectory: true,
    inspectPaths: true,
    run: process.platform === 'darwin' || process.platform === 'win32' || process.platform === 'linux',
    terminalRun: process.platform === 'darwin' || process.platform === 'win32' || process.platform === 'linux'
  }
}

function favoriteRunResult(outcome, options = {}) {
  return { outcome, ...options }
}

function normalizeFavoriteRunRequest(value) {
  if (!value || typeof value !== 'object') return null
  const targetPath = String(value.targetPath || '').trim()
  const executable = String(value.executable || '').trim()
  const cwd = String(value.cwd || '').trim()
  const mode = value.mode === 'terminal' ? 'terminal' : value.mode === 'background' ? 'background' : null
  const args = Array.isArray(value.args) ? value.args : null
  if (!mode || !targetPath || !executable || !cwd || !args || args.length > 64) return null
  if (executable.length > 4096 || cwd.length > 4096 || executable.includes('\0') || cwd.includes('\0')) return null
  if (!args.every((item) => typeof item === 'string' && item.length <= 4096 && !item.includes('\0'))) return null
  if (!isAbsoluteFavoritePath(targetPath) || !isAbsoluteFavoritePath(cwd)) return null
  if (!path.isAbsolute(executable) && (executable.includes('/') || executable.includes('\\'))) return null
  const favoriteId = String(value.favoriteId || '').slice(0, 200)
  const favoriteName = String(value.favoriteName || '').slice(0, 200)
  // L2: a runner-declared log path is informational only. It is never executed, never
  // created, and a relative or malformed value is dropped instead of guessed at.
  const declaredLogPath = typeof value.declaredLogPath === 'string' ? value.declaredLogPath.trim() : ''
  const declaredLog = declaredLogPath
    && declaredLogPath.length <= 4096
    && !declaredLogPath.includes('\0')
    && isAbsoluteFavoritePath(declaredLogPath)
    ? declaredLogPath
    : ''
  return { targetPath, executable, args: [...args], cwd, mode, favoriteId, favoriteName, declaredLogPath: declaredLog }
}

const FAVORITE_RUN_LOG_MAX_BYTES = 2 * 1024 * 1024
const FAVORITE_RUN_LOG_KEEP_FILES = 40
const FAVORITE_RUN_HISTORY_LIMIT = 60

let favoriteRunMemory = []
const favoriteRunListeners = new Set()

function resolveFavoriteRunLogDirectory() {
  let baseDir = ''
  try {
    if (globalThis.utools && typeof globalThis.utools.getPath === 'function') {
      baseDir = String(globalThis.utools.getPath('userData') || '').trim()
    }
  } catch {}
  if (!baseDir) {
    try {
      baseDir = path.join(os.homedir(), '.eypc')
    } catch {
      baseDir = path.join(process.cwd(), '.eypc')
    }
  }
  return path.join(baseDir, 'favorite-runs')
}

function notifyFavoriteRunListeners() {
  for (const listener of [...favoriteRunListeners]) {
    try {
      listener()
    } catch {}
  }
}

function favoriteRunView(run) {
  return {
    runId: run.runId,
    favoriteId: run.favoriteId,
    favoriteName: run.favoriteName,
    mode: run.mode,
    status: run.status,
    startedAt: run.startedAt,
    ...(typeof run.endedAt === 'number' ? { endedAt: run.endedAt } : {}),
    ...(typeof run.exitCode === 'number' ? { exitCode: run.exitCode } : {}),
    ...(run.signal ? { signal: run.signal } : {}),
    executable: run.executable,
    args: [...run.args],
    cwd: run.cwd,
    ...(run.logPath ? { logPath: run.logPath } : {}),
    ...(typeof run.logBytes === 'number' ? { logBytes: run.logBytes } : {}),
    ...(run.logTruncated ? { logTruncated: true } : {}),
    ...(run.declaredLogPath ? { declaredLogPath: run.declaredLogPath } : {}),
    ...(typeof run.declaredLogExists === 'boolean' ? { declaredLogExists: run.declaredLogExists } : {}),
    ...(run.message ? { message: run.message } : {})
  }
}

function pruneFavoriteRunLogFiles(directory) {
  try {
    const entries = fs.readdirSync(directory)
      .filter((name) => /^run-.*\.log$/.test(name))
      .map((name) => {
        const full = path.join(directory, name)
        try {
          return { full, mtime: fs.statSync(full).mtimeMs }
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort((left, right) => right.mtime - left.mtime)
    for (const entry of entries.slice(FAVORITE_RUN_LOG_KEEP_FILES)) {
      try { fs.unlinkSync(entry.full) } catch {}
    }
  } catch {}
}

/**
 * Enforces the per-run ceiling at rest. The child writes straight to the file descriptor so it
 * survives a plugin restart, which means the cap can only be applied once the run has ended.
 * The tail is kept because that is where failures land.
 */
function capFavoriteRunLog(run) {
  if (!run.logPath) return
  let size = 0
  try {
    size = fs.statSync(run.logPath).size
  } catch {
    return
  }
  if (size <= FAVORITE_RUN_LOG_MAX_BYTES) {
    run.logBytes = size
    return
  }
  const notice = Buffer.from(`[EyPc] 日志超过 ${FAVORITE_RUN_LOG_MAX_BYTES} 字节上限，已保留末尾部分\n`, 'utf8')
  const keep = Math.max(0, FAVORITE_RUN_LOG_MAX_BYTES - notice.length)
  let descriptor = null
  try {
    descriptor = fs.openSync(run.logPath, 'r')
    const buffer = Buffer.alloc(keep)
    fs.readSync(descriptor, buffer, 0, keep, size - keep)
    fs.closeSync(descriptor)
    descriptor = null
    fs.writeFileSync(run.logPath, Buffer.concat([notice, buffer]))
    run.logBytes = notice.length + keep
    run.logTruncated = true
  } catch {
    run.logBytes = size
  } finally {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor) } catch {}
    }
  }
}

function finishFavoriteRun(run, patch) {
  if (run.status !== 'running') return
  Object.assign(run, patch, { endedAt: Date.now() })
  capFavoriteRunLog(run)
  if (run.declaredLogPath) {
    try {
      run.declaredLogExists = fs.statSync(run.declaredLogPath).isFile()
    } catch {
      run.declaredLogExists = false
    }
  }
  notifyFavoriteRunListeners()
}

/**
 * Background launch with L1 log capture. Output goes to a file descriptor rather than a pipe so a
 * plugin restart cannot break the child's stdout; the trade-off is that the exit code is only
 * observed while this process is alive.
 */
function spawnFavoriteBackgroundRun(normalized, executable) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const runId = `fav_${startedAt.toString(36)}_${crypto.randomBytes(6).toString('base64url')}`
    const directory = resolveFavoriteRunLogDirectory()
    let logPath = ''
    let descriptor = null
    try {
      fs.mkdirSync(directory, { recursive: true })
      logPath = path.join(directory, `${runId}.log`.replace(/^fav_/, 'run-'))
      descriptor = fs.openSync(logPath, 'a')
      fs.writeSync(descriptor, `[EyPc] ${new Date(startedAt).toISOString()} ${executable} ${normalized.args.join(' ')}\n[EyPc] cwd: ${normalized.cwd}\n`)
    } catch {
      // Capture is best effort. A run without a log is still a run with an exit code.
      if (descriptor !== null) {
        try { fs.closeSync(descriptor) } catch {}
      }
      descriptor = null
      logPath = ''
    }

    let child = null
    try {
      child = spawn(executable, normalized.args, {
        cwd: normalized.cwd,
        shell: false,
        detached: true,
        stdio: descriptor === null ? 'ignore' : ['ignore', descriptor, descriptor],
        windowsHide: true
      })
    } catch (error) {
      if (descriptor !== null) {
        try { fs.closeSync(descriptor) } catch {}
      }
      resolve(favoriteRunResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, 'runner start failed') }))
      return
    }
    if (descriptor !== null) {
      try { fs.closeSync(descriptor) } catch {}
    }

    const run = {
      runId,
      favoriteId: normalized.favoriteId,
      favoriteName: normalized.favoriteName,
      mode: 'background',
      status: 'running',
      startedAt,
      executable,
      args: [...normalized.args],
      cwd: normalized.cwd,
      logPath,
      declaredLogPath: normalized.declaredLogPath
    }

    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      finishFavoriteRun(run, { status: 'failed', message: 'runner start timed out' })
      finish(favoriteRunResult('failed', { errorCode: 'timeout', message: 'runner start timed out' }))
    }, 5_000)

    child.once('error', (error) => {
      finishFavoriteRun(run, { status: 'failed', message: fileErrorMessage(error, 'runner start failed') })
      finish(favoriteRunResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, 'runner start failed') }))
    })
    child.once('exit', (code, signal) => {
      finishFavoriteRun(run, {
        status: signal ? 'stopped' : code === 0 ? 'exited' : 'failed',
        ...(typeof code === 'number' ? { exitCode: code } : {}),
        ...(signal ? { signal: String(signal) } : {})
      })
    })
    child.once('spawn', () => {
      try { child.unref() } catch {}
      favoriteRunMemory = [run, ...favoriteRunMemory].slice(0, FAVORITE_RUN_HISTORY_LIMIT)
      pruneFavoriteRunLogFiles(directory)
      notifyFavoriteRunListeners()
      finish(favoriteRunResult('started', {
        runId,
        startedAt,
        ...(logPath ? { logPath } : {}),
        ...(normalized.declaredLogPath ? { declaredLogPath: normalized.declaredLogPath } : {})
      }))
    })
  })
}

function listFavoriteRuns(limit = FAVORITE_RUN_HISTORY_LIMIT) {
  const size = Number.isFinite(limit) ? Math.max(0, Math.min(FAVORITE_RUN_HISTORY_LIMIT, Math.floor(limit))) : FAVORITE_RUN_HISTORY_LIMIT
  return favoriteRunMemory.slice(0, size).map((run) => favoriteRunView(run))
}

function watchFavoriteRuns(listener) {
  if (typeof listener !== 'function') return () => {}
  favoriteRunListeners.add(listener)
  return () => { favoriteRunListeners.delete(listener) }
}

function windowsSystemExecutable(name) {
  if (process.platform !== 'win32') return ''
  const windowsRoot = String(process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows')
  const aliases = {
    'cmd.exe': path.win32.join(windowsRoot, 'System32', 'cmd.exe'),
    cmd: path.win32.join(windowsRoot, 'System32', 'cmd.exe'),
    'powershell.exe': path.win32.join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    powershell: path.win32.join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  }
  return aliases[String(name || '').toLowerCase()] || ''
}

function favoriteExecutableCandidates(executable) {
  if (path.isAbsolute(executable)) return [executable]
  const candidates = []
  const systemExecutable = windowsSystemExecutable(executable)
  if (systemExecutable) candidates.push(systemExecutable)
  const pathEntries = String(process.env.PATH || '').split(path.delimiter).map((entry) => entry.trim()).filter(Boolean)
  const extensions = process.platform === 'win32'
    ? String(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : ['']
  const hasExtension = process.platform !== 'win32' || Boolean(path.win32.extname(executable))
  for (const directory of pathEntries) {
    if (hasExtension) candidates.push(path.join(directory, executable))
    else for (const extension of extensions) candidates.push(path.join(directory, `${executable}${extension}`))
  }
  return [...new Set(candidates)]
}

function inspectFavoriteExecutable(executable) {
  let permissionDenied = false
  for (const candidate of favoriteExecutableCandidates(executable)) {
    let stat = null
    try {
      stat = fs.statSync(candidate)
    } catch (error) {
      if (fileErrorCode(error) === 'permission-denied') permissionDenied = true
      continue
    }
    if (!stat.isFile()) continue
    try {
      fs.accessSync(candidate, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK)
      return { path: candidate, errorCode: null }
    } catch (error) {
      if (fileErrorCode(error) === 'permission-denied') permissionDenied = true
    }
  }
  return { path: '', errorCode: permissionDenied ? 'permission-denied' : 'not-found' }
}

function resolveFavoriteExecutable(executable) {
  return inspectFavoriteExecutable(executable).path
}

function spawnFavoriteDetached(command, args, cwd, outcome) {
  return new Promise((resolve) => {
    let settled = false
    let timer = null
    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(result)
    }
    let child = null
    try {
      child = spawn(command, args, {
        cwd,
        shell: false,
        detached: true,
        stdio: 'ignore',
        windowsHide: outcome !== 'dispatched'
      })
    } catch (error) {
      finish(favoriteRunResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, 'runner start failed') }))
      return
    }
    child.once('error', (error) => finish(favoriteRunResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, 'runner start failed') })))
    child.once('spawn', () => {
      try { child.unref() } catch {}
      finish(favoriteRunResult(outcome))
    })
    timer = setTimeout(() => finish(favoriteRunResult('failed', { errorCode: 'timeout', message: 'runner start timed out' })), 5_000)
  })
}

function favoriteTerminalAdapter(executable, args, cwd) {
  if (process.platform === 'darwin') {
    const osascript = '/usr/bin/osascript'
    const script = [
      'on run argv',
      'set workDir to item 1 of argv',
      'set executablePath to item 2 of argv',
      'set commandText to "cd " & quoted form of workDir & " && exec " & quoted form of executablePath',
      'repeat with itemIndex from 3 to count argv',
      'set commandText to commandText & " " & quoted form of (item itemIndex of argv)',
      'end repeat',
      'tell application "Terminal"',
      'activate',
      'do script commandText',
      'end tell',
      'end run'
    ].join('\n')
    return { command: osascript, args: ['-e', script, cwd, executable, ...args] }
  }
  if (process.platform === 'win32') {
    const powershell = resolveFavoriteExecutable('powershell.exe')
    if (!powershell) return null
    const payload = Buffer.from(JSON.stringify({ cwd, executable, args }), 'utf8').toString('base64')
    const script = '$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($args[0])) | ConvertFrom-Json; Set-Location -LiteralPath ([string]$payload.cwd); $runnerArgs = @($payload.args | ForEach-Object { [string]$_ }); & ([string]$payload.executable) @runnerArgs'
    return { command: powershell, args: ['-NoLogo', '-NoProfile', '-NoExit', '-Command', script, payload] }
  }
  if (process.platform === 'linux') {
    const terminals = [
      { executable: 'x-terminal-emulator', prefix: ['-e'] },
      { executable: 'gnome-terminal', prefix: ['--'] },
      { executable: 'konsole', prefix: ['-e'] },
      { executable: 'xfce4-terminal', prefix: ['-x'] }
    ]
    for (const terminal of terminals) {
      const command = resolveFavoriteExecutable(terminal.executable)
      if (command) return { command, args: [...terminal.prefix, executable, ...args] }
    }
  }
  return null
}

async function runFavorite(request) {
  const normalized = normalizeFavoriteRunRequest(request)
  if (!normalized) return favoriteRunResult('failed', { errorCode: 'invalid-path', message: 'invalid structured runner request' })
  const target = await preflightFavoritePath(normalized.targetPath)
  if (target.result) return favoriteRunResult('failed', { errorCode: target.result.errorCode, message: target.result.message, paths: [normalized.targetPath] })
  try {
    const cwdStat = await withFileActionTimeout(fs.promises.stat(normalized.cwd))
    if (!cwdStat.isDirectory()) return favoriteRunResult('failed', { errorCode: 'invalid-path', message: 'working directory is not a directory', paths: [normalized.targetPath] })
  } catch (error) {
    return favoriteRunResult('failed', { errorCode: fileErrorCode(error), message: fileErrorMessage(error, 'working directory unavailable'), paths: [normalized.targetPath] })
  }
  const executableInspection = inspectFavoriteExecutable(normalized.executable)
  const executable = executableInspection.path
  if (!executable) {
    const permissionDenied = executableInspection.errorCode === 'permission-denied'
    return favoriteRunResult('failed', {
      errorCode: permissionDenied ? 'permission-denied' : 'not-found',
      message: permissionDenied ? 'executable is not permitted' : 'executable not found',
      paths: [normalized.targetPath]
    })
  }
  if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable)) {
    return favoriteRunResult('failed', {
      errorCode: 'invalid-path',
      message: 'cmd and bat files must use explicit cmd.exe arguments',
      paths: [normalized.targetPath]
    })
  }
  if (normalized.mode === 'background') {
    return spawnFavoriteBackgroundRun(normalized, executable)
  }
  const adapter = favoriteTerminalAdapter(executable, normalized.args, normalized.cwd)
  if (!adapter) return favoriteRunResult('unsupported', { errorCode: 'unsupported', message: 'supported terminal application not found', paths: [normalized.targetPath] })
  const adapterExecutable = resolveFavoriteExecutable(adapter.command)
  if (!adapterExecutable) return favoriteRunResult('unsupported', { errorCode: 'not-found', message: 'terminal adapter not found', paths: [normalized.targetPath] })
  return spawnFavoriteDetached(adapterExecutable, adapter.args, normalized.cwd, 'dispatched')
}

function normalizePickedFavorite(result, kind) {
  const filePaths = Array.isArray(result)
    ? result
    : Array.isArray(result && result.filePaths)
      ? result.filePaths
      : typeof result === 'string'
        ? [result]
        : []
  const target = String(filePaths[0] || '').trim()
  if (!target) return null
  const explicitKind = result && typeof result === 'object' && result.kind
  let inferredKind = 'folder'
  try {
    inferredKind = fs.statSync(target).isFile() ? 'file' : 'folder'
  } catch {}
  const pickedKind = kind === 'file' || kind === 'folder'
    ? kind
    : explicitKind === 'file' || explicitKind === 'folder'
      ? explicitKind
      : inferredKind
  return {
    kind: pickedKind,
    path: target,
    name: path.basename(target) || target,
    parentId: null,
    tags: [],
    color: pickedKind === 'folder' ? '#2F80ED' : '#F2994A'
  }
}

function normalizePickedFavorites(result, kind) {
  const filePaths = Array.isArray(result)
    ? result
    : Array.isArray(result && result.filePaths)
      ? result.filePaths
      : typeof result === 'string'
        ? [result]
        : []
  return filePaths
    .map((target) => normalizePickedFavorite([target], kind))
    .filter(Boolean)
}

function favoritePickDialogOptions(kind) {
  kind = kind === 'folder' ? 'folder' : 'file'
  const properties = kind === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections']
  return {
    title: kind === 'folder' ? '选择要收藏的文件夹' : '选择要收藏的文件',
    properties
  }
}

async function pickFavoritePaths(kind) {
  const options = favoritePickDialogOptions(kind)
  try {
    if (globalThis.utools && typeof globalThis.utools.showOpenDialog === 'function') {
      const result = await globalThis.utools.showOpenDialog(options)
      return normalizePickedFavorites(result, kind)
    }
  } catch {}

  try {
    const electron = require('electron')
    const dialog = electron.dialog || (electron.remote && electron.remote.dialog)
    if (dialog && typeof dialog.showOpenDialogSync === 'function') {
      return normalizePickedFavorites(dialog.showOpenDialogSync(options), kind)
    }
    if (dialog && typeof dialog.showOpenDialog === 'function') {
      const result = await dialog.showOpenDialog(options)
      return normalizePickedFavorites(result, kind)
    }
  } catch {}

  return []
}

async function pickFavoritePath() {
  const picked = await pickFavoritePaths('file')
  return picked[0] || null
}

async function listFavoriteDirectory(target) {
  const base = String(target || '').trim()
  if (!isAbsoluteFavoritePath(base)) return { ok: false, entries: [], error: 'directory path must be absolute', errorCode: 'invalid-path' }
  try {
    const entries = await withFileActionTimeout(fs.promises.readdir(base, { withFileTypes: true }))
    const normalized = await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(base, entry.name)
      let lstat = null
      try {
        lstat = await withFileActionTimeout(fs.promises.lstat ? fs.promises.lstat(entryPath) : fs.promises.stat(entryPath))
      } catch {}
      const isSymbolicLink = Boolean((typeof entry.isSymbolicLink === 'function' && entry.isSymbolicLink()) || (lstat && typeof lstat.isSymbolicLink === 'function' && lstat.isSymbolicLink()))
      let resolvedStat = lstat
      let linkTargetKind
      if (isSymbolicLink) {
        try {
          resolvedStat = await withFileActionTimeout(fs.promises.stat(entryPath))
          linkTargetKind = favoriteStatKind(resolvedStat)
        } catch (error) {
          linkTargetKind = fileErrorCode(error) === 'not-found' ? 'missing' : 'unknown'
        }
      }
      const direntKind = typeof entry.isDirectory === 'function' && entry.isDirectory() ? 'folder' : typeof entry.isFile === 'function' && entry.isFile() ? 'file' : null
      const resolvedKind = favoriteStatKind(resolvedStat)
      const kind = direntKind || (resolvedKind === 'folder' || resolvedKind === 'file' ? resolvedKind : null)
      if (!kind) return null
      return {
        kind,
        name: entry.name,
        path: entryPath,
        ...(Number.isFinite(resolvedStat && resolvedStat.size) && kind === 'file' ? { size: resolvedStat.size } : {}),
        ...(Number.isFinite(resolvedStat && resolvedStat.mtimeMs) ? { modifiedAt: resolvedStat.mtimeMs } : {}),
        ...(isSymbolicLink ? { isSymbolicLink: true, linkTargetKind: linkTargetKind || resolvedKind } : {})
      }
    }))
    const supportedEntries = normalized.filter(Boolean)
    return {
      ok: true,
      entries: supportedEntries.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    }
  } catch (error) {
    return { ok: false, entries: [], error: error instanceof Error ? error.message : 'directory listing failed', errorCode: fileErrorCode(error) }
  }
}

function codexError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function codexErrorResult(error) {
  const sourceCode = error && typeof error === 'object' ? String(error.code || '') : ''
  const code = sourceCode === 'ETIMEDOUT' || sourceCode === 'timeout'
    ? 'timeout'
    : sourceCode === 'not-authenticated'
      ? 'not-authenticated'
      : sourceCode === 'runtime-unavailable'
        ? 'runtime-unavailable'
        : sourceCode === 'process-exited'
          ? 'process-exited'
          : sourceCode === 'protocol-error'
            ? 'protocol-error'
            : 'unavailable'
  const messages = {
    timeout: 'Codex App Server 响应超时',
    'not-authenticated': 'Codex 尚未登录或登录已失效',
    'runtime-unavailable': 'Codex CLI 启动失败，请检查本机 Node/Codex 安装',
    'process-exited': 'Codex App Server 已退出',
    'protocol-error': 'Codex App Server 返回了不兼容的数据',
    unavailable: '未找到可用的 Codex CLI'
  }
  return { ok: false, error: { code, message: messages[code] }, receivedAt: Date.now() }
}

function codexRecord(value) {
  return value && typeof value === 'object' ? value : {}
}

function codexNextLiveEvidenceSequence() {
  codexLiveEvidenceSequence += 1
  return codexLiveEvidenceSequence
}

function codexNoteActivityDecision(name) {
  if (!Object.prototype.hasOwnProperty.call(codexActivityDecisionCounters, name)) return
  codexActivityDecisionCounters[name] = Math.min(
    Number.MAX_SAFE_INTEGER,
    codexActivityDecisionCounters[name] + 1
  )
}

function codexActivityDecisionDiagnostics() {
  return { ...codexActivityDecisionCounters }
}

function codexMarkAppServerLiveActive(known, sequence = codexNextLiveEvidenceSequence(), branchThreadId = '', forceNewEpoch = false) {
  if (!known) return 0
  const normalizedBranchThreadId = validCodexThreadId(branchThreadId) ? branchThreadId : ''
  const sameLiveEpoch = known.appServerLiveActive === true
    && (known.appServerLiveBranchThreadId || '') === normalizedBranchThreadId
    && Number.isInteger(known.appServerLiveSequence)
  const acceptedSequence = sameLiveEpoch && forceNewEpoch !== true ? known.appServerLiveSequence : sequence
  known.appServerLiveActive = true
  known.appServerLiveSequence = acceptedSequence
  known.appServerLiveBranchThreadId = normalizedBranchThreadId
  known.activeEvidenceSequence = Math.max(Number(known.activeEvidenceSequence) || 0, acceptedSequence)
  known.idleConfirmed = false
  return acceptedSequence
}

function codexMarkConfirmedTerminalEvidence(known, evidence, sequence = codexNextLiveEvidenceSequence()) {
  if (!known || !codexIsConfirmedTurnEvidence(evidence)) return 0
  known.lastTurnEvidence = evidence
  known.terminalEvidenceSequence = Math.max(Number(known.terminalEvidenceSequence) || 0, sequence)
  return known.terminalEvidenceSequence
}

function codexHasConfirmedTerminalEvidence(known) {
  return codexDesktopActivityResolution ? codexDesktopActivityResolution.codexHasConfirmedTerminalEvidence(known) : false
}

function codexShouldDeferHydrationActive(bridge, known, parentThreadId, branchThreadId, activity) {
  return codexDesktopActivityResolution
    ? codexDesktopActivityResolution.codexShouldDeferHydrationActive(bridge, known, parentThreadId, branchThreadId, activity)
    : false
}

function codexDeferHydrationActive(bridge, known, parentThreadId, branchThreadId) {
  codexNoteActivityDecision('hydrationActiveDeferred')
  bridge.scheduleLatestTurnRefresh(parentThreadId, {
    queryThreadId: branchThreadId,
    forceQuery: true,
    restart: true
  })
  runtimeDiagnostics.record({
    level: 'debug',
    scope: 'task-evidence',
    event: 'active-hydration-deferred',
    outcome: 'abstained',
    provider: 'codex',
    taskRef: typeof known?.key === 'string' ? known.key : '',
    details: { branch: branchThreadId === parentThreadId ? 'main' : 'side', latestTurn: known?.lastTurnStatus || '' }
  })
}

function codexClearAppServerLiveActive(known) {
  if (!known) return
  known.appServerLiveActive = false
  delete known.appServerLiveSequence
  delete known.appServerLiveBranchThreadId
}

function codexPrivateBranchTerminalKey(parentThreadId, branchThreadId) {
  return `${parentThreadId}\0${branchThreadId}`
}

function codexRememberPrivateBranchTerminal(parentThreadId, branchThreadId, turn, evidence, options = {}) {
  if (!validCodexThreadId(parentThreadId) || !validCodexThreadId(branchThreadId)) return null
  const source = codexRecord(turn)
  if (!['completed', 'interrupted', 'failed'].includes(source.status)
    || !codexIsConfirmedTurnEvidence(evidence)) return null
  const key = codexPrivateBranchTerminalKey(parentThreadId, branchThreadId)
  const previous = codexPrivateBranchTerminals.get(key)
  const sameTerminal = previous
    && previous.lastTurnStatus === source.status
    && codexTimestampMs(previous.turnStartedAt) === codexTimestampMs(source.startedAt)
    && previous.lastTurnEvidence === evidence
  const suppliedSequence = Number(options.terminalEvidenceSequence)
  const terminalEvidenceSequence = Number.isInteger(suppliedSequence) && suppliedSequence > 0
    ? suppliedSequence
    : sameTerminal && Number.isInteger(previous.terminalEvidenceSequence)
      ? previous.terminalEvidenceSequence
      : 0
  // Reading an inventory row is not a terminal event. Callers may refresh an
  // already admitted terminal, but only a real completion/targeted decision is
  // allowed to supply a new causal sequence.
  if (!terminalEvidenceSequence) return null
  const value = {
    parentThreadId,
    branchThreadId,
    lastTurnStatus: source.status,
    lastTurnEvidence: evidence,
    activeEvidenceSequence: Number(options.activeEvidenceSequence) || Number(previous?.activeEvidenceSequence) || 0,
    terminalEvidenceSequence,
    idleConfirmed: options.idleConfirmed === true,
    turnStartedAt: codexTimestampMs(source.startedAt),
    terminalAt: codexTimestampMs(source.completedAt) || codexTimestampMs(source.startedAt),
    observedAt: terminalEvidenceSequence
  }
  codexPrivateBranchTerminals.delete(key)
  codexPrivateBranchTerminals.set(key, value)
  while (codexPrivateBranchTerminals.size > CODEX_PRIVATE_BRANCH_TERMINAL_LIMIT) {
    const oldest = codexPrivateBranchTerminals.keys().next().value
    if (!oldest) break
    codexPrivateBranchTerminals.delete(oldest)
  }
  return value
}

function codexForgetPrivateBranchTerminal(parentThreadId, branchThreadId = '') {
  if (!validCodexThreadId(parentThreadId)) return
  if (validCodexThreadId(branchThreadId)) {
    codexPrivateBranchTerminals.delete(codexPrivateBranchTerminalKey(parentThreadId, branchThreadId))
    return
  }
  for (const [key, value] of codexPrivateBranchTerminals) {
    if (value.parentThreadId === parentThreadId) codexPrivateBranchTerminals.delete(key)
  }
}

function codexReadPrivateBranchTerminal(parentThreadId, branchThreadId) {
  return codexPrivateBranchTerminals.get(codexPrivateBranchTerminalKey(parentThreadId, branchThreadId)) || null
}

function codexPrivateBranchIdleConfirmed(parentThreadId, branchThreadId, known) {
  const shadow = codexDesktopBridge?.shadows?.get(branchThreadId)
    || codexDesktopBridge?.sideShadows?.get(branchThreadId)
  const activity = codexDesktopShadowActivity(shadow)
  return activity?.status === 'idle'
    || branchThreadId === parentThreadId && known?.idleConfirmed === true
}

function codexInventorySnapshotLiveSequence(parentThreadId, branchThreadId, known, shadow) {
  return codexDesktopActivityResolution
    ? codexDesktopActivityResolution.codexInventorySnapshotLiveSequence(parentThreadId, branchThreadId, known, shadow)
    : 0
}

function codexStoredConnectorStatusAuthority(known) {
  return known?.connectorStatusAuthority === 'persisted-decision'
    ? 'persisted-decision'
    : 'connector'
}

function codexRestoreConnectorActivity(known) {
  if (!known) return
  known.status = known.connectorStatus
  known.activeFlags = [...known.connectorActiveFlags]
  known.planImplementationOnly = known.connectorPlanImplementationOnly === true
  known.statusAuthority = codexStoredConnectorStatusAuthority(known)
  if (known.status === 'active'
    && known.activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
    && codexTimestampMs(known.connectorWaitingSince)) known.waitingSince = known.connectorWaitingSince
  else delete known.waitingSince
  delete known.desktopActiveSince
}

function codexDesktopActivitySupersedesAppServer(known, shadows) {
  if (known?.appServerLiveActive !== true || !Number.isInteger(known.appServerLiveSequence)) return false
  const latestDesktopSequence = Math.max(0, ...shadows
    .filter(Boolean)
    .map((shadow) => Number.isInteger(shadow.activityEventSequence) ? shadow.activityEventSequence : 0))
  return latestDesktopSequence > known.appServerLiveSequence
}

function codexNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function codexTimestampMs(value) {
  const parsed = codexNumber(value)
  if (parsed <= 0) return 0
  return parsed < 10_000_000_000 ? parsed * 1000 : parsed
}

const CODEX_THREAD_GOAL_STATUSES = ['active', 'paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete']
const CODEX_THREAD_GOAL_NON_ACTIVE_STATUSES = ['paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete']

function sanitizeCodexThreadGoal(value) {
  const source = codexRecord(value)
  const goalStatus = CODEX_THREAD_GOAL_STATUSES.includes(source.status) ? source.status : ''
  const goalUpdatedAt = codexTimestampMs(source.updatedAt)
  if (!goalStatus || !goalUpdatedAt) return null
  return { goalStatus, goalUpdatedAt, goalFreshness: 'fresh' }
}

function codexPublishThreadGoalEvidence(threadId) {
  if (!validCodexThreadId(threadId)) return false
  const parentThreadId = codexDesktopBridge?.parentThreadIdFor?.(threadId)
    || codexSideParentThreadId(threadId)
    || threadId
  const known = codexActivityInventory.get(parentThreadId)
  if (!known) return false
  return emitCodexActivityDelta([known], false, 'normal', [], {
    allowWithoutFingerprint: true,
    forcePrivateEvidence: true
  }) === true
}

function codexSetThreadGoalEvidence(threadId, evidence, options = {}) {
  if (!validCodexThreadId(threadId)) return { accepted: false, entry: null }
  const source = codexRecord(evidence)
  const goalStatus = [...CODEX_THREAD_GOAL_STATUSES, 'none', 'unknown'].includes(source.goalStatus)
    ? source.goalStatus
    : 'unknown'
  const goalFreshness = source.goalFreshness === 'verifying' || goalStatus === 'unknown'
    ? 'verifying'
    : 'fresh'
  const goalUpdatedAt = goalStatus === 'none' || goalStatus === 'unknown'
    ? 0
    : codexTimestampMs(source.goalUpdatedAt)
  const current = codexThreadGoalCache.get(threadId)
  const requestBaselineSequence = Number(options.requestBaselineSequence)
  if (Number.isInteger(requestBaselineSequence)
    && Number(current?.goalEvidenceSequence) > requestBaselineSequence) {
    return { accepted: false, entry: current || null }
  }
  if (goalUpdatedAt > 0
    && Number(current?.goalUpdatedAt) > goalUpdatedAt
    && current?.goalFreshness === 'fresh') {
    return { accepted: false, entry: current }
  }
  const retryAt = goalFreshness === 'verifying'
    ? Number(source.retryAt) || Date.now() + CODEX_THREAD_GOAL_RETRY_MS
    : 0
  const semanticSame = current?.goalStatus === goalStatus
    && current?.goalFreshness === goalFreshness
    && Number(current?.goalUpdatedAt) === goalUpdatedAt
  if (semanticSame) {
    if (retryAt && retryAt !== current.retryAt) current.retryAt = retryAt
    return { accepted: false, entry: current }
  }
  const entry = {
    goalStatus,
    goalFreshness,
    goalUpdatedAt,
    goalEvidenceSequence: Number.isInteger(options.sequence) && options.sequence > 0
      ? options.sequence
      : codexNextLiveEvidenceSequence(),
    retryAt
  }
  codexThreadGoalCache.set(threadId, entry)
  if (options.publish === true) codexPublishThreadGoalEvidence(threadId)
  return { accepted: true, entry }
}

function codexMarkThreadGoalRpcUnsupported(options = {}) {
  const changed = codexThreadGoalRpcAvailable !== false
  codexThreadGoalRpcAvailable = false
  const threadIds = new Set([
    ...codexThreadGoalCache.keys(),
    ...codexActivityInventory.keys(),
    ...codexAllSideRelations().keys()
  ])
  const changedParents = new Set()
  for (const threadId of threadIds) {
    const result = codexSetThreadGoalEvidence(threadId, {
      goalStatus: 'none',
      goalFreshness: 'fresh'
    })
    if (!result.accepted) continue
    const parentThreadId = codexDesktopBridge?.parentThreadIdFor?.(threadId)
      || codexSideParentThreadId(threadId)
      || threadId
    if (validCodexThreadId(parentThreadId)) changedParents.add(parentThreadId)
  }
  if (options.publish === true && changedParents.size) {
    const entries = [...changedParents].map((threadId) => codexActivityInventory.get(threadId)).filter(Boolean)
    if (entries.length) emitCodexActivityDelta(entries, false, 'normal', [], {
      allowWithoutFingerprint: true,
      forcePrivateEvidence: true
    })
  }
  return changed
}

function codexMarkThreadGoalVerifying(threadId) {
  const current = codexThreadGoalCache.get(threadId)
  if (current?.goalFreshness === 'verifying') return current
  return codexSetThreadGoalEvidence(threadId, {
    goalStatus: current?.goalStatus || 'unknown',
    goalUpdatedAt: current?.goalUpdatedAt || 0,
    goalFreshness: 'verifying',
    retryAt: Date.now() + CODEX_THREAD_GOAL_RETRY_MS
  }).entry
}

function codexPrivateThreadGoalEvidence(threadId) {
  const hostExternal = codexhostDiscovery?.externalGoalEvidence?.(threadId) || null
  if (hostExternal) return hostExternal
  const entry = codexThreadGoalCache.get(threadId)
  if (!entry) {
    return codexThreadGoalRpcAvailable === false
      ? { goalStatus: 'none', goalFreshness: 'fresh', goalEvidenceSequence: 0, goalUpdatedAt: 0 }
      : { goalStatus: 'unknown', goalFreshness: 'verifying', goalEvidenceSequence: 0, goalUpdatedAt: 0 }
  }
  return {
    goalStatus: entry.goalStatus,
    goalFreshness: entry.goalFreshness,
    goalEvidenceSequence: Number(entry.goalEvidenceSequence) || 0,
    goalUpdatedAt: Number(entry.goalUpdatedAt) || 0
  }
}

function codexThreadGoalNeedsTerminalRefresh(threadId, known) {
  if (codexThreadGoalRpcAvailable === false) return false
  const entry = codexThreadGoalCache.get(threadId)
  if (!entry || entry.goalFreshness === 'verifying' || entry.goalStatus === 'unknown') return true
  // A cached active Goal predates this exact terminal Turn observation. It may
  // legitimately remain active for another automatic Turn, but it may also
  // have completed without its notification reaching this process. Re-read it
  // before allowing either outcome to settle.
  if (entry.goalStatus === 'active') return true
  if (!CODEX_THREAD_GOAL_NON_ACTIVE_STATUSES.includes(entry.goalStatus)) return false
  const turnStartedAt = codexTimestampMs(known?.lastTurnStartedAt)
  const activeSequence = Number(known?.activeEvidenceSequence) || 0
  return (entry.goalUpdatedAt > 0 && turnStartedAt > entry.goalUpdatedAt)
    || (entry.goalUpdatedAt > 0
      && turnStartedAt === entry.goalUpdatedAt
      && activeSequence > Number(entry.goalEvidenceSequence || 0))
    || (entry.goalUpdatedAt === 0 && activeSequence > Number(entry.goalEvidenceSequence || 0))
}

function refreshCodexThreadGoal(threadId, options = {}) {
  if (!validCodexThreadId(threadId)) return Promise.resolve(null)
  // Extra-process ids never reach the App Server; a read would only leave a verifying entry.
  if (codexhostDiscovery?.externalGoalEvidence?.(threadId)) return Promise.resolve(null)
  const current = codexThreadGoalCache.get(threadId)
  if (codexThreadGoalRpcAvailable === false) {
    return Promise.resolve(codexSetThreadGoalEvidence(threadId, {
      goalStatus: 'none',
      goalFreshness: 'fresh'
    }, { publish: options.publish === true }).entry)
  }
  if (options.force !== true && current) {
    if (current.goalFreshness === 'fresh') return Promise.resolve(current)
    if (Number(current.retryAt) > Date.now()) return Promise.resolve(current)
  }
  const inFlight = codexThreadGoalRefreshes.get(threadId)
  if (inFlight) return inFlight
  const generation = codexThreadGoalGeneration
  const requestBaselineSequence = Number(current?.goalEvidenceSequence) || 0
  let operation = null
  operation = Promise.resolve().then(async () => {
    try {
      const response = codexRecord(await requestCodexRpc(
        'thread/goal/get',
        { threadId },
        CODEX_THREAD_GOAL_TIMEOUT_MS
      ))
      if (generation !== codexThreadGoalGeneration) return null
      const goal = response.goal == null ? null : sanitizeCodexThreadGoal(response.goal)
      if (response.goal != null && !goal) throw codexError('protocol-error', 'Codex Goal state is invalid')
      codexThreadGoalRpcAvailable = true
      return codexSetThreadGoalEvidence(threadId, goal || {
        goalStatus: 'none',
        goalFreshness: 'fresh'
      }, {
        requestBaselineSequence,
        publish: options.publish === true
      }).entry
    } catch (error) {
      if (generation !== codexThreadGoalGeneration) return null
      if (Number(error?.rpcCode) === -32601) {
        codexMarkThreadGoalRpcUnsupported({ publish: options.publish === true })
        codexSetThreadGoalEvidence(threadId, {
          goalStatus: 'none',
          goalFreshness: 'fresh'
        }, { publish: options.publish === true })
        return codexThreadGoalCache.get(threadId) || null
      }
      const latest = codexThreadGoalCache.get(threadId)
      return codexSetThreadGoalEvidence(threadId, {
        goalStatus: latest?.goalStatus || 'unknown',
        goalUpdatedAt: latest?.goalUpdatedAt || 0,
        goalFreshness: 'verifying',
        retryAt: Date.now() + CODEX_THREAD_GOAL_RETRY_MS
      }, {
        requestBaselineSequence,
        publish: options.publish === true
      }).entry
    }
  }).finally(() => {
    if (codexThreadGoalRefreshes.get(threadId) === operation) codexThreadGoalRefreshes.delete(threadId)
  })
  codexThreadGoalRefreshes.set(threadId, operation)
  return operation
}

async function readCodexThreadGoals(rows) {
  const queue = (Array.isArray(rows) ? rows : [])
    .map((row) => codexRecord(row).id)
    .filter(validCodexThreadId)
  const workers = Array.from(
    { length: Math.min(CODEX_THREAD_TURN_STATUS_CONCURRENCY, queue.length) },
    async () => {
      for (;;) {
        const threadId = queue.shift()
        if (!threadId) return
        await refreshCodexThreadGoal(threadId)
      }
    }
  )
  await Promise.all(workers)
  return codexThreadGoalCache
}

function codexPercent(value) {
  return Math.max(0, Math.min(100, Math.round(codexNumber(value))))
}

function codexLaunchCandidate(source, state) {
  return codexLaunchPathPreference
    ? codexLaunchPathPreference.codexLaunchCandidate(source, state)
    : { source, state }
}

function codexLaunchResult(plan, launchMode, manualLaunchPathState, launchCandidates) {
  return codexLaunchPathPreference
    ? codexLaunchPathPreference.codexLaunchResult(plan, launchMode, manualLaunchPathState, launchCandidates)
    : { ...plan, launchMode, manualLaunchPathState, launchCandidates: launchCandidates.slice(0, 8) }
}

function codexSpawnEnvironment(command, additions = {}) {
  const platformPath = codexPlatformPath()
  const env = { ...(process.env || {}), ...additions }
  if (!platformPath.isAbsolute(command)) return env
  const pathKey = process.platform === 'win32'
    ? Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path'
    : 'PATH'
  const commandDir = platformPath.dirname(command)
  const existing = typeof env[pathKey] === 'string' ? env[pathKey] : ''
  const entries = existing.split(platformPath.delimiter).filter(Boolean)
  env[pathKey] = [commandDir, ...entries.filter((entry) => entry !== commandDir)].join(platformPath.delimiter)
  return env
}

// A failed load degrades to the same "raw candidate, undetected" shape a
// scan that finds nothing already returns: no manual/automatic candidates
// surfaced, launch falls through to the OS path lookup.
function resolveCodexLaunchPlan() {
  return codexLaunchPathPreference
    ? codexLaunchPathPreference.resolveCodexLaunchPlan()
    : codexLaunchResult(codexLaunchPlan('codex', 'unknown', false), 'automatic', 'not-configured', [])
}

function readCodexProbeResult(command, args, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(guard)
      resolve(value)
    }
    const guard = setTimeout(() => finish({ ok: false, stdout: '' }), timeoutMs + 250)
    try {
      execFile(command, args, {
        encoding: 'utf8',
        maxBuffer: CODEX_PROCESS_OUTPUT_LIMIT,
        timeout: timeoutMs,
        windowsHide: true
      }, (error, stdout) => finish({ ok: !error, stdout: error ? '' : String(stdout || '') }))
    } catch {
      finish({ ok: false, stdout: '' })
    }
  })
}

function inspectCodexConfigFile() {
  const platformPath = codexPlatformPath()
  const env = process.env || {}
  const codexHome = typeof env.CODEX_HOME === 'string' && env.CODEX_HOME.trim()
    ? env.CODEX_HOME.trim()
    : platformPath.join(os.homedir(), '.codex')
  const configFile = platformPath.join(codexHome, 'config.toml')
  try {
    if (!fs.existsSync(configFile)) return 'missing'
    if (typeof fs.accessSync === 'function') fs.accessSync(configFile, fs.constants && fs.constants.R_OK)
    return 'detected'
  } catch {
    return 'unreadable'
  }
}

async function inspectCodexRelatedProcess() {
  if (codexProcessAlive()) return 'running'
  if (process.platform === 'darwin') {
    const result = await readCodexProbeResult('/bin/ps', ['-ax', '-o', 'comm='], 1_500)
    if (!result.ok) return 'unknown'
    const running = result.stdout.split(/\r?\n/).some((line) => {
      const executable = line.trim().split('/').pop() || ''
      return /^codex(?:\.exe)?$/i.test(executable)
    })
    return running ? 'running' : 'not-running'
  }
  if (process.platform === 'win32') {
    const platformPath = codexPlatformPath()
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    const tasklist = platformPath.join(systemRoot, 'System32', 'tasklist.exe')
    const result = await readCodexProbeResult(tasklist, ['/FO', 'CSV', '/NH'], 1_500)
    if (!result.ok) return 'unknown'
    const running = result.stdout.split(/\r?\n/).some((line) => /^"?codex(?:\.exe)?"?,/i.test(line.trim()))
    return running ? 'running' : 'not-running'
  }
  return 'unknown'
}

async function inspectCodexEnvironment() {
  const platform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'unsupported'
  const launch = resolveCodexLaunchPlan()
  const processState = await inspectCodexRelatedProcess()
  const desktopBridgeState = codexEnsureDesktopBridge().state
  const runtimeState = platform === 'unsupported' ? 'unsupported' : launch.detected ? 'detected' : launch.invalid ? 'unusable' : 'missing'
  return {
    version: 1,
    checking: false,
    platform,
    runtimeState,
    runtimeSource: launch.detected || launch.invalid ? launch.source : 'unknown',
    processState,
    configState: platform === 'unsupported' ? 'unknown' : inspectCodexConfigFile(),
    connectionState: codexProcessAlive() ? 'connected' : 'not-checked',
    desktopBridgeState,
    launchMode: launch.launchMode,
    manualLaunchPathState: launch.manualLaunchPathState,
    launchCandidates: launch.launchCandidates,
    statusFeedMode: desktopBridgeState === 'connected'
      ? 'desktop-live'
      : platform === 'unsupported' ? 'unavailable' : 'connector-fallback',
    checkedAt: Date.now(),
    ...(launch.invalid ? { errorCode: 'runtime-unavailable' } : {})
  }
}

async function setCodexLaunchPath(pathValue) {
  const manualPath = normalizeCodexLaunchPathPreference(pathValue)
  if (!manualPath) throw codexError('runtime-unavailable', '请输入 Codex CLI 可执行文件的完整绝对路径')
  const exists = codexLaunchPathIsFile(manualPath)
  const plan = exists ? codexLaunchPlan(manualPath, 'manual', true) : null
  if (!plan || !plan.detected) throw codexError('runtime-unavailable', '所选 Codex CLI 路径不可用，请选择可执行文件本身')
  if (!writeCodexLaunchPathPreference(manualPath)) throw codexError('unavailable', '无法保存手动 Codex CLI 位置')
  return inspectCodexEnvironment()
}

async function clearCodexLaunchPath() {
  if (!writeCodexLaunchPathPreference('')) throw codexError('unavailable', '无法清除手动 Codex CLI 位置')
  return inspectCodexEnvironment()
}

function rejectCodexPending(error) {
  for (const pending of codexRpcPending.values()) {
    clearTimeout(pending.timeoutId)
    pending.reject(error)
  }
  codexRpcPending.clear()
}

function inspectCodexStderr(chunk) {
  const sample = Buffer.isBuffer(chunk)
    ? chunk.subarray(0, 512).toString('utf8')
    : String(chunk || '').slice(0, 512)
  const normalized = sample.toLowerCase()
  if ((normalized.includes('env: node') || normalized.includes('node: not found')) && normalized.includes('no such file')) {
    codexStartupHint = 'node-not-found'
  }
}

function codexProcessEndError(reason) {
  const reasonCode = reason && typeof reason === 'object' ? String(reason.code || '') : ''
  if (reasonCode === 'ENOENT' || codexStartupHint === 'node-not-found') {
    return codexError('runtime-unavailable', 'Codex runtime unavailable')
  }
  return codexError('process-exited', 'Codex App Server exited')
}

// A failed load degrades to "no endpoint, not secure": the connection
// attempt this feeds never fires, and callers already treat a missing
// endpoint as "Desktop IPC unavailable."
function codexDesktopIpcEndpoint() {
  return codexDesktopIpcEndpointModule ? codexDesktopIpcEndpointModule.codexDesktopIpcEndpoint() : ''
}

function codexDesktopIpcEndpointIsSecure(endpoint) {
  return codexDesktopIpcEndpointModule ? codexDesktopIpcEndpointModule.codexDesktopIpcEndpointIsSecure(endpoint) : false
}

// A failed load falls back to answers that never claim a match or a wait
// state: no correlation, no timestamp, no flag. Callers already treat those
// as "nothing to report" rather than as a distinct case.
function codexDesktopRequestTimestamp(value) {
  return codexDesktopRequestProjection ? codexDesktopRequestProjection.codexDesktopRequestTimestamp(value) : 0
}

function codexDesktopRequestCorrelation(value) {
  return codexDesktopRequestProjection ? codexDesktopRequestProjection.codexDesktopRequestCorrelation(value) : ''
}

function codexDesktopProjectedRequest(value, observedAt = Date.now(), previous = null) {
  if (codexDesktopRequestProjection) return codexDesktopRequestProjection.codexDesktopProjectedRequest(value, observedAt, previous)
  const source = codexRecord(value)
  return {
    type: typeof source.type === 'string' ? source.type.slice(0, 80) : '',
    method: typeof source.method === 'string' ? source.method.slice(0, 120) : '',
    observedAt: codexTimestampMs(observedAt) || Date.now(),
    observedSequence: codexNextLiveEvidenceSequence()
  }
}

function codexDesktopProjectedRequests(values, previous = []) {
  if (codexDesktopRequestProjection) return codexDesktopRequestProjection.codexDesktopProjectedRequests(values, previous)
  const observedAt = Date.now()
  return values.map((value) => codexDesktopProjectedRequest(value, observedAt, null))
}

function codexDesktopIsPlanImplementationRequest(request) {
  return codexDesktopRequestProjection ? codexDesktopRequestProjection.codexDesktopIsPlanImplementationRequest(request) : false
}

function codexDesktopRequestKind(request) {
  return codexDesktopRequestProjection ? codexDesktopRequestProjection.codexDesktopRequestKind(request) : ''
}

function codexDesktopRequestFlag(request) {
  return codexDesktopRequestProjection ? codexDesktopRequestProjection.codexDesktopRequestFlag(request) : ''
}

// A failed load reads every observation as visible (clearSequence 0, no
// resolved-set check): the caller's own history-based edge detection still
// applies, it just loses the explicit-clear fast path.
function codexWaitingFlagClearSequence(waitingState, flag) {
  return codexWaitingEvidence ? codexWaitingEvidence.codexWaitingFlagClearSequence(waitingState, flag) : 0
}

function codexWaitingEvidenceVisible(waitingState, flag, observedSequence) {
  return codexWaitingEvidence ? codexWaitingEvidence.codexWaitingEvidenceVisible(waitingState, flag, observedSequence) : true
}

function codexDesktopRuntimeHasWaitingFlags(runtime) {
  return codexDesktopRequestProjection?.codexDesktopRuntimeHasWaitingFlags(runtime) === true
}

function codexDesktopRuntimeBecamePlainActive(previousRuntime, currentRuntime) {
  return codexDesktopRequestProjection?.codexDesktopRuntimeBecamePlainActive(previousRuntime, currentRuntime) === true
}

// A failed load returns no sequences rather than guessing at a watermark:
// callers merge this into a larger sequences map, so an empty result simply
// contributes nothing this round.
function codexDesktopRuntimeWaitingSequences(flags, previousFlags = [], previousSequences = {}, options = {}) {
  return codexDesktopShadow
    ? codexDesktopShadow.codexDesktopRuntimeWaitingSequences(flags, previousFlags, previousSequences, options)
    : {}
}

/**
 * One private reducer owns both edges of the actionable-wait lifecycle.
 * Callers provide only finite waiting flags and timestamps; request identity,
 * method payloads and rollout correlations never cross the preload boundary.
 */
function codexReduceWaitingEdge(input = {}) {
  return codexDesktopActivityResolution
    ? codexDesktopActivityResolution.codexReduceWaitingEdge(input)
    : { flags: [], waiting: false, waitingSince: 0, changed: false }
}

function codexDesktopPersistedUnread(known) {
  const unreadAuthority = known?.connectorUnreadAuthority === 'desktop-persisted'
    ? 'desktop-persisted'
    : 'unavailable'
  return {
    hasUnreadTurn: unreadAuthority === 'desktop-persisted' && known?.connectorHasUnreadTurn === true,
    unreadAuthority
  }
}

function codexIsConfirmedTurnEvidence(value) {
  return value === 'turn-completed' || value === 'targeted-after-exit' || value === 'snapshot-corroborated'
}

function honorHostExternalProjection(threadId, known, activity) {
  return typeof codexhostDiscovery?.honorExternalProjection === 'function'
    ? codexhostDiscovery.honorExternalProjection(threadId, known, activity)
    : activity
}

function honorHostExternalOpenRead(threadId, result) {
  return typeof codexhostDiscovery?.honorExternalOpenRead === 'function'
    ? codexhostDiscovery.honorExternalOpenRead(threadId, result, (id) => {
      codexEnsureDesktopBridge()?.markThreadOpenedRead(id)
    })
    : result
}

function codexDesktopUnreadObservation(bridge, known, threadId, shadow, persistedUnreadIds) {
  if (codexDesktopOpenedReadAcknowledgements.has(threadId)) {
    return { hasUnreadTurn: false, unreadAuthority: 'desktop-live' }
  }
  if (codexhostDiscovery?.isExternalThreadId?.(threadId) === true) {
    return codexhostDiscovery.compareHostDesktopUnread(known, {
      connected: bridge?.state === 'connected',
      liveUnread: bridge?.liveUnread.get(threadId),
      shadow
    })
  }
  const cachedUnread = bridge?.liveUnread.get(threadId)
  const liveUnread = bridge?.state === 'connected' || cachedUnread?.ownerClientId === 'eypc-open'
    ? cachedUnread
    : null
  if (cachedUnread?.ownerClientId === 'eypc-open' && cachedUnread.hasUnreadTurn === false) {
    return { hasUnreadTurn: false, unreadAuthority: 'desktop-live' }
  }
  const exact = shadow?.unreadEvidence === 'event'
    ? shadow
    : liveUnread?.unreadEvidence === 'event' ? liveUnread : null
  if (exact && typeof exact.hasUnreadTurn === 'boolean') {
    return { hasUnreadTurn: exact.hasUnreadTurn === true, unreadAuthority: 'desktop-live' }
  }
  // A refollow snapshot is the only replayable current-state evidence after
  // an exact read event was missed while EyPc was disconnected. Its explicit
  // false may clear a stale persisted true. A snapshot true remains weaker
  // than native non-membership; completion publication already clears any
  // pre-completion false before a new unread transition is reconciled.
  if (shadow?.unreadEvidence === 'snapshot' && shadow.hasUnreadTurn === false) {
    return { hasUnreadTurn: false, unreadAuthority: 'desktop-live' }
  }
  // A successfully parsed native set remains authoritative over snapshot true:
  // both membership and non-membership beat that weaker positive replay.
  if (persistedUnreadIds instanceof Set) {
    return { hasUnreadTurn: persistedUnreadIds.has(threadId), unreadAuthority: 'desktop-persisted' }
  }
  // Once this preload session has successfully parsed Codex's native unread
  // set, a transient atomic-replace/read failure must not demote that exact
  // membership/nonmembership to a weaker snapshot true. The bridge cache also
  // spans a full inventory object replacement, which prevents refresh/shortcut
  // paths from publishing one stale unread frame before Desktop corrects it.
  if (bridge?.persistedUnread?.has(threadId)) {
    return {
      hasUnreadTurn: bridge.persistedUnread.get(threadId) === true,
      unreadAuthority: 'desktop-persisted'
    }
  }
  const lastPersisted = codexDesktopPersistedUnread(known)
  if (lastPersisted.unreadAuthority === 'desktop-persisted') return lastPersisted
  if (typeof liveUnread?.hasUnreadTurn === 'boolean' || typeof shadow?.hasUnreadTurn === 'boolean') {
    const fallback = typeof liveUnread?.hasUnreadTurn === 'boolean' ? liveUnread : shadow
    return { hasUnreadTurn: fallback?.hasUnreadTurn === true, unreadAuthority: 'desktop-live' }
  }
  return codexDesktopPersistedUnread(known)
}

// A failed load reads as no unread evidence at all: the same shape an
// observation set with nothing positive already produces.
function codexDesktopAggregateUnread(bridge, known, parentThreadId, ownShadow, childEntries, persistedUnreadIds) {
  // A machine sub-run (subagent/guardian) sits in the desktop unread set
  // forever because the user never opens it. Letting it into this aggregation
  // pinned every parent 'desktop-persisted unread' while the opened-read
  // acknowledgement kept publishing read — the completed-unread tug-of-war.
  const humanChildEntries = (Array.isArray(childEntries) ? childEntries : [])
    .filter(([threadId]) => codexSubagentDiscovery?.codexIsMachineRunThread?.(threadId) !== true)
  return codexDesktopActivityAggregation
    ? codexDesktopActivityAggregation.codexDesktopAggregateUnread(bridge, known, parentThreadId, ownShadow, humanChildEntries, persistedUnreadIds)
    : { hasUnreadTurn: false, unreadAuthority: 'unavailable' }
}

function codexPersistDesktopSideRelationHints() {
  if (codexDesktopSideRelationPersistTimer) clearTimeout(codexDesktopSideRelationPersistTimer)
  codexDesktopSideRelationPersistTimer = null
  if (!codexSideRelationHints) return false
  try {
    return globalThis.utools?.dbStorage?.setItem?.(
      CODEX_DESKTOP_SIDE_RELATION_STORAGE_KEY,
      codexSideRelationHints.codexSideRelationHintPayload(
        codexDesktopSideRelations,
        codexDesktopSideRelationObservedAt,
        Date.now()
      )
    ) !== false
  } catch {
    return false
  }
}

function codexScheduleDesktopSideRelationHintPersist() {
  if (!codexSideRelationHints || codexDesktopSideRelationPersistTimer) return
  codexDesktopSideRelationPersistTimer = setTimeout(codexPersistDesktopSideRelationHints, 50)
  codexDesktopSideRelationPersistTimer.unref?.()
}

function codexRestoreDesktopSideRelationHints() {
  if (codexDesktopSideRelationHintsRestored) return
  codexDesktopSideRelationHintsRestored = true
  if (!codexSideRelationHints) return
  let rows = []
  try {
    rows = codexSideRelationHints.codexRestoredSideRelationHints(
      globalThis.utools?.dbStorage?.getItem?.(CODEX_DESKTOP_SIDE_RELATION_STORAGE_KEY),
      Date.now()
    )
  } catch {
    return
  }
  let restored = 0
  for (const row of rows) {
    if (codexDesktopSideRelations.has(row.threadId)) continue
    // Restore fills the in-memory hint table only. No goal RPC, no shadow, no
    // activity: the follow plus targeted latest-Turn machinery decides state.
    codexDesktopSideRelations.set(row.threadId, row.parentThreadId)
    codexDesktopSideRelationObservedAt.set(row.threadId, row.observedAt)
    restored += 1
  }
  if (!restored) return
  recordCompanionDiagnosticEvent({
    level: 'info',
    scope: 'task-topology',
    event: 'side-relation-hints-restored',
    outcome: 'restored',
    provider: 'codex',
    details: { count: restored }
  })
}

function codexSideParentThreadId(threadId) {
  return codexInventorySideRelations.get(threadId)
    || codexDesktopSideRelations.get(threadId)
    || ''
}

function codexAllSideRelations() {
  const relations = new Map(codexDesktopSideRelations)
  for (const [threadId, parentThreadId] of codexInventorySideRelations) {
    relations.set(threadId, parentThreadId)
  }
  return relations
}

function codexForgetInventorySideRelation(threadId, options = {}) {
  const parentThreadId = codexInventorySideRelations.get(threadId)
  if (validCodexThreadId(parentThreadId)) codexForgetPrivateBranchTerminal(parentThreadId, threadId)
  codexInventorySideRelations.delete(threadId)
  codexInventorySideBranchEvidence.delete(threadId)
  if (options.preserveDesktopRelation === true) return
  if (codexDesktopSideRelations.has(threadId)) codexForgetDesktopSideRelation(threadId)
  codexDesktopBridge?.sideShadows?.delete(threadId)
  codexDesktopBridge?.sideRecoveryPending?.delete(threadId)
  codexDesktopBridge?.liveUnread?.delete(threadId)
  codexDesktopBridge?.persistedUnread?.delete(threadId)
}

function codexForgetInventorySideRelationsForParent(parentThreadId) {
  for (const [threadId, parent] of codexInventorySideRelations) {
    if (parent === parentThreadId) codexForgetInventorySideRelation(threadId)
  }
}

function codexRememberDesktopSideRelation(threadId, parentThreadId) {
  if (!validCodexThreadId(threadId)
    || !validCodexThreadId(parentThreadId)
    || threadId === parentThreadId) return false
  const previousParentThreadId = codexDesktopSideRelations.get(threadId)
  if (validCodexThreadId(previousParentThreadId) && previousParentThreadId !== parentThreadId) {
    codexForgetPrivateBranchTerminal(previousParentThreadId, threadId)
  }
  codexDesktopSideRelations.delete(threadId)
  codexDesktopSideRelations.set(threadId, parentThreadId)
  codexDesktopSideRelationObservedAt.set(threadId, Date.now())
  while (codexDesktopSideRelations.size > CODEX_DESKTOP_SIDE_RELATION_LIMIT) {
    const oldest = codexDesktopSideRelations.keys().next().value
    if (!oldest) break
    const oldestParent = codexDesktopSideRelations.get(oldest)
    if (validCodexThreadId(oldestParent)) codexForgetPrivateBranchTerminal(oldestParent, oldest)
    codexDesktopSideRelations.delete(oldest)
    codexDesktopSideRelationObservedAt.delete(oldest)
  }
  codexScheduleDesktopSideRelationHintPersist()
  if (!codexThreadGoalCache.has(threadId) && codexThreadGoalRpcAvailable !== false) {
    void refreshCodexThreadGoal(threadId, { publish: true })
  }
  return true
}

function codexForgetDesktopSideRelation(threadId) {
  const parentThreadId = codexDesktopSideRelations.get(threadId)
  if (validCodexThreadId(parentThreadId)) codexForgetPrivateBranchTerminal(parentThreadId, threadId)
  const removed = codexDesktopSideRelations.delete(threadId)
  codexDesktopSideRelationObservedAt.delete(threadId)
  if (removed) codexScheduleDesktopSideRelationHintPersist()
}

function codexForgetDesktopSideRelationsForParent(parentThreadId) {
  codexForgetPrivateBranchTerminal(parentThreadId)
  let removed = false
  for (const [threadId, parent] of codexDesktopSideRelations) {
    if (parent !== parentThreadId) continue
    codexDesktopSideRelations.delete(threadId)
    codexDesktopSideRelationObservedAt.delete(threadId)
    removed = true
  }
  if (removed) codexScheduleDesktopSideRelationHintPersist()
}

function codexRememberDesktopOpenedRead(threadId, parentThreadId, known) {
  if (!validCodexThreadId(threadId) || !validCodexThreadId(parentThreadId)) return false
  const branchEvidence = codexInventorySideBranchEvidence.get(threadId)
  const aggregateParent = threadId === parentThreadId
    && [...codexAllSideRelations().values()].some((candidate) => candidate === parentThreadId)
  const turnStartedAt = codexTimestampMs(
    threadId === parentThreadId
      ? known?.lastTurnStartedAt
      : branchEvidence?.turnStartedAt || known?.lastTurnStartedAt
  ) || (codexhostDiscovery?.isExternalThreadId?.(threadId) === true ? Date.now() : 0)
  // A process-scope acknowledgement must be bound to a concrete Turn; an unbound false could
  // suppress every later completion. An extra-process id binds to the open time instead:
  // Host turns started before the jump are read, a later Host status change still supersedes.
  if (!turnStartedAt) return false
  codexDesktopOpenedReadAcknowledgements.delete(threadId)
  codexDesktopOpenedReadAcknowledgements.set(threadId, {
    parentThreadId,
    // A parent with Side Chats represents multiple independent Turn IDs. Bind
    // its acknowledgement by the aggregate causal timestamp. Inventory-backed
    // child receipts use their exact Turn ID; a Desktop-only child preserves
    // the prior parent-Turn fallback until inventory can supply its own Turn.
    turnId: !aggregateParent && typeof (threadId === parentThreadId
      ? known?.lastTurnId
      : branchEvidence?.turnId || known?.lastTurnId) === 'string'
      ? threadId === parentThreadId ? known.lastTurnId : branchEvidence?.turnId || known.lastTurnId
      : '',
    turnStartedAt,
    turnCompletedAt: codexTimestampMs(
      threadId === parentThreadId
        ? known?.lastTurnCompletedAt
        : branchEvidence?.terminalAt || known?.lastTurnCompletedAt
    )
  })
  while (codexDesktopOpenedReadAcknowledgements.size > CODEX_DESKTOP_OPENED_READ_LIMIT) {
    const oldest = codexDesktopOpenedReadAcknowledgements.keys().next().value
    if (!oldest) break
    codexDesktopOpenedReadAcknowledgements.delete(oldest)
  }
  return true
}

function codexDesktopOpenedReadCoversCompletion(parentThreadId, known) {
  const acknowledgement = codexDesktopOpenedReadAcknowledgements.get(parentThreadId)
  if (!acknowledgement || acknowledgement.parentThreadId !== parentThreadId) return false
  const currentStartedAt = codexTimestampMs(known?.lastTurnStartedAt)
  if (!acknowledgement.turnStartedAt || !currentStartedAt) return false
  const acknowledgementTurnId = typeof acknowledgement.turnId === 'string' ? acknowledgement.turnId : ''
  const currentTurnId = typeof known?.lastTurnId === 'string' ? known.lastTurnId : ''
  // Turn identity is the stable epoch key. completedAt may be filled in or
  // corrected after the task was opened; treating that enrichment as a new
  // completion makes an already-read card recur as unread.
  if (acknowledgementTurnId && currentTurnId) return acknowledgementTurnId === currentTurnId
  if (currentStartedAt < acknowledgement.turnStartedAt) return true
  if (currentStartedAt > acknowledgement.turnStartedAt) return false
  const currentCompletedAt = codexTimestampMs(known?.lastTurnCompletedAt)
  return !acknowledgement.turnCompletedAt || currentCompletedAt <= acknowledgement.turnCompletedAt
}

function codexClearDesktopOpenedRead(bridge, parentThreadId) {
  if (!validCodexThreadId(parentThreadId)) return false
  const relatedThreadIds = []
  for (const [threadId, acknowledgement] of codexDesktopOpenedReadAcknowledgements) {
    if (threadId === parentThreadId || acknowledgement.parentThreadId === parentThreadId) relatedThreadIds.push(threadId)
  }
  if (!relatedThreadIds.length) return false
  runtimeDiagnostics.record({ level: 'debug', scope: 'task-evidence', event: 'opened-read-cleared', outcome: 'cleared', provider: 'codex', taskRef: codexThreadKey(parentThreadId), count: relatedThreadIds.length, details: { caller: String(new Error().stack || '').split('\n').slice(2, 4).map((line) => line.trim().split(' ')[1] || '').join('<') } })
  for (const threadId of relatedThreadIds) {
    codexDesktopOpenedReadAcknowledgements.delete(threadId)
    const liveUnread = bridge?.liveUnread.get(threadId)
    if (liveUnread?.ownerClientId === 'eypc-open') bridge.liveUnread.delete(threadId)
    const shadow = bridge?.shadows.get(threadId) || bridge?.sideShadows.get(threadId)
    if (liveUnread?.ownerClientId === 'eypc-open'
      && shadow?.unreadEvidence === 'event'
      && shadow.hasUnreadTurn === false) {
      shadow.hasUnreadTurn = undefined
      shadow.unreadEvidence = ''
    }
  }
  return true
}

function codexReconcileDesktopOpenedReadWithTurn(bridge, parentThreadId, turn) {
  if (!codexDesktopOpenedReadAcknowledgements.has(parentThreadId)) return false
  if (!turn?.lastTurnStatus || !codexTimestampMs(turn.lastTurnStartedAt)) return false
  if (turn.lastTurnStatus === 'completed'
    && codexDesktopOpenedReadCoversCompletion(parentThreadId, turn)) return false
  return codexClearDesktopOpenedRead(bridge, parentThreadId)
}

function codexReconcileInventorySideOpenedReadWithTurn(threadId, parentThreadId, turn) {
  const acknowledgement = codexDesktopOpenedReadAcknowledgements.get(threadId)
  if (!acknowledgement || acknowledgement.parentThreadId !== parentThreadId) return false
  const turnStartedAt = codexTimestampMs(turn?.startedAt)
  if (!turn?.status || !turnStartedAt) return false
  const acknowledgementTurnId = typeof acknowledgement.turnId === 'string' ? acknowledgement.turnId : ''
  const turnId = typeof turn.id === 'string' ? turn.id : ''
  const sameTurn = acknowledgementTurnId && turnId
    ? acknowledgementTurnId === turnId
    : turnStartedAt <= acknowledgement.turnStartedAt
  if (turn.status === 'completed' && sameTurn) return false
  codexDesktopOpenedReadAcknowledgements.delete(threadId)
  return true
}

function codexForgetDesktopOpenedReadThread(threadId) {
  codexDesktopOpenedReadAcknowledgements.delete(threadId)
}

// A failed load returns null: the shadow build downstream already treats a
// null runtime as an unusable snapshot.
function codexDesktopRuntimeProjection(value) {
  return codexDesktopShadow ? codexDesktopShadow.codexDesktopRuntimeProjection(value) : null
}

// A failed load is a no-op: the waiting state's request history simply does
// not learn this round's observations.
function codexRememberDesktopRequestObservations(waitingState, requests) {
  if (codexDesktopShadow) codexDesktopShadow.codexRememberDesktopRequestObservations(waitingState, requests)
}

function codexDesktopRequestObservationCandidates(previousShadow, waitingState) {
  return codexDesktopShadow ? codexDesktopShadow.codexDesktopRequestObservationCandidates(previousShadow, waitingState) : []
}

// A failed load returns null: a snapshot the entry cannot build is treated
// exactly like a snapshot revision it decided not to accept.
function codexDesktopShadowFromSnapshot(change, previousShadow = null, waitingState = null) {
  return codexDesktopShadow ? codexDesktopShadow.codexDesktopShadowFromSnapshot(change, previousShadow, waitingState) : null
}

function codexDesktopShadowActivity(shadow) {
  return codexDesktopActivityResolution ? codexDesktopActivityResolution.codexDesktopShadowActivity(shadow) : null
}

function codexDesktopHasStickyPendingRequest(shadow) {
  return codexDesktopActivityResolution ? codexDesktopActivityResolution.codexDesktopHasStickyPendingRequest(shadow) : false
}

function codexRecordDesktopShadowInventoryBaseline(shadow, known) {
  if (!shadow || !known) return
  if (shadow.ownerDisconnectedAt && shadow.inventoryBaselineRecorded === true) return
  const turnStartedAt = codexTimestampMs(known.connectorLastTurnStartedAt || known.lastTurnStartedAt)
  const updatedAt = codexTimestampMs(known.connectorUpdatedAt)
  if (turnStartedAt) shadow.inventoryBaselineTurnStartedAt = turnStartedAt
  if (updatedAt) shadow.inventoryBaselineUpdatedAt = updatedAt
  if (typeof known.connectorLastTurnStatus === 'string') {
    shadow.inventoryBaselineTurnStatus = known.connectorLastTurnStatus
  }
  shadow.inventoryBaselineRecorded = true
}

function codexDesktopOrphanedPendingSuperseded(shadow, known) {
  if (!shadow?.ownerDisconnectedAt || !known) return false
  const baselineTurnStartedAt = codexTimestampMs(shadow.inventoryBaselineTurnStartedAt)
  const currentTurnStartedAt = codexTimestampMs(known.connectorLastTurnStartedAt)
  if (baselineTurnStartedAt && currentTurnStartedAt > baselineTurnStartedAt) return true
  if (baselineTurnStartedAt
    && currentTurnStartedAt === baselineTurnStartedAt
    && shadow.inventoryBaselineTurnStatus
    && known.connectorLastTurnStatus
    && shadow.inventoryBaselineTurnStatus !== known.connectorLastTurnStatus) return true
  const baselineUpdatedAt = codexTimestampMs(shadow.inventoryBaselineUpdatedAt)
  const currentUpdatedAt = codexTimestampMs(known.connectorUpdatedAt)
  return Boolean(baselineUpdatedAt && currentUpdatedAt > baselineUpdatedAt)
}

// A failed load degrades to the parent's own unmerged status: no children
// evidence considered, no waiting flags asserted -- the same shape a parent
// with no Side Chats already produces.
function codexResolveParentActivity(own, childActivities, options = {}) {
  return codexDesktopActivityAggregation
    ? codexDesktopActivityAggregation.codexResolveParentActivity(own, childActivities, options)
    : {
      status: own?.status || 'idle',
      activeFlags: [],
      planImplementationOnly: false,
      hasInput: false,
      hasApproval: false,
      hasActive: false,
      hasSystemError: false,
      appServerActive: false,
      waitingSince: 0,
      desktopActiveSince: 0
    }
}

function codexAppServerActiveDominates(known, shadows) {
  return codexDesktopActivityAggregation ? codexDesktopActivityAggregation.codexAppServerActiveDominates(known, shadows) : false
}

function codexDesktopPatchIndex(value, length, allowEnd = false) {
  return codexDesktopShadow ? codexDesktopShadow.codexDesktopPatchIndex(value, length, allowEnd) : -1
}

// A failed load rejects the patch (`false`) rather than guessing at how to
// apply it: the caller already treats a rejected patch as a resubscribe
// signal, the same outcome a genuinely malformed patch produces.
function codexApplyDesktopShadowPatch(shadow, patch) {
  return codexDesktopShadow ? codexDesktopShadow.codexApplyDesktopShadowPatch(shadow, patch) : false
}

function codexApplyCachedCompletedTurnEvidence(known, threadId) {
  const turn = codexThreadTurnStatusCache.get(threadId)?.turn
  if (!turn || turn.status !== 'completed' || !turn.startedAt) return false
  const baselineStartedAt = codexTimestampMs(known.lastTurnStartedAt)
  const baselineCompletedAt = codexTimestampMs(known.lastTurnCompletedAt)
  const freshCompleted = turn.startedAt > baselineStartedAt
    || turn.startedAt === baselineStartedAt && known.lastTurnStatus !== 'completed'
    || turn.startedAt === baselineStartedAt
      && known.lastTurnStatus === 'completed'
      && turn.completedAt > baselineCompletedAt
  if (!freshCompleted) return false
  known.lastTurnStatus = 'completed'
  known.lastTurnStartedAt = turn.startedAt
  if (turn.id) known.lastTurnId = turn.id
  else if (turn.startedAt !== baselineStartedAt) delete known.lastTurnId
  if (turn.completedAt) known.lastTurnCompletedAt = turn.completedAt
  else delete known.lastTurnCompletedAt
  codexMarkConfirmedTerminalEvidence(known, 'targeted-after-exit')
  codexClearAppServerLiveActive(known)
  return true
}

function codexRecordCompletedPlanArtifact(known) {
  if (!known || known.lastTurnStatus !== 'completed'
    || known.pendingCompletedPlanItem !== true) return false
  delete known.pendingCompletedPlanItem
  known.planReady = true
  known.planLifecycleState = 'ready'
  known.planClearReason = ''
  known.planLifecycleRevision = codexTimestampMs(known.lastTurnStartedAt)
    || codexTimestampMs(known.lastTurnCompletedAt)
    || Date.now()
  known.turnMode = 'plan'
  return true
}

function codexApplyCompletedTurnNotification(bridge, known, threadId, value, options = {}) {
  if (!bridge || !known || !validCodexThreadId(threadId)) return false
  const turn = sanitizeCodexTurnStatus(value)
  if (!turn?.startedAt || (turn.status !== 'completed' && turn.status !== 'interrupted')) return false
  const previousStartedAt = codexTimestampMs(known.lastTurnStartedAt)
  const previousCompletedAt = codexTimestampMs(known.lastTurnCompletedAt)
  // An exact turn/completed notification is stronger than the local time at
  // which an active shadow was observed. Provider timestamps may be only
  // second-granular, and a task-switch replay can also observe active after the
  // Turn has already completed. Freshness is therefore ordered by this Turn's
  // started/completed revision below, not by cross-clock millisecond ordering.
  // A resumed interrupted/failed Turn can keep the same startedAt. If its
  // exact latest outcome is now completed, that terminal transition is newer
  // even when the intermediate inProgress notification was missed.
  const recoveredTerminalRevision = turn.startedAt === previousStartedAt
    && known.lastTurnStatus !== turn.status
  const unresolvedLiveActive = known.status === 'active'
    && (known.statusAuthority === 'desktop-live' || known.statusAuthority === 'app-server-live')
    && !codexIsConfirmedTurnEvidence(known.lastTurnEvidence)
  const freshTerminal = turn.startedAt > previousStartedAt
    || recoveredTerminalRevision
    || known.lastTurnStatus === turn.status
      && turn.startedAt === previousStartedAt
      && (turn.status === 'interrupted' || turn.completedAt > previousCompletedAt || unresolvedLiveActive)
  if (!freshTerminal) return false
  const refreshGoal = codexThreadGoalNeedsTerminalRefresh(threadId, {
    ...known,
    lastTurnStartedAt: turn.startedAt
  })
  if (refreshGoal) codexMarkThreadGoalVerifying(threadId)

  const retainedWaiting = codexReduceWaitingEdge({
    active: turn.status === 'interrupted',
    flags: known.activeFlags,
    previousFlags: known.activeFlags,
    previousWaitingSince: known.waitingSince,
    evidenceAt: turn.startedAt
  })
  const retainPendingRequest = turn.status === 'interrupted' && retainedWaiting.waiting
  const retainedWaitingAuthority = known.statusAuthority
  const retainedPlanImplementationOnly = known.planImplementationOnly === true
  bridge.cancelWaitingEdgeRefresh(threadId)
  if (!retainPendingRequest) bridge.clearOrphanedPending(threadId)
  known.connectorStatus = retainPendingRequest ? 'active' : 'notLoaded'
  known.connectorActiveFlags = retainPendingRequest ? [...retainedWaiting.flags] : []
  if (retainPendingRequest) known.connectorWaitingSince = retainedWaiting.waitingSince
  else delete known.connectorWaitingSince
  known.connectorPlanImplementationOnly = retainPendingRequest && retainedPlanImplementationOnly
  known.connectorStatusAuthority = retainPendingRequest && retainedWaitingAuthority === 'persisted-decision'
    ? 'persisted-decision'
    : 'connector'
  if (known.statusAuthority !== 'desktop-live') {
    known.status = retainPendingRequest ? 'active' : 'notLoaded'
    known.activeFlags = retainPendingRequest ? [...retainedWaiting.flags] : []
    known.planImplementationOnly = retainPendingRequest && retainedPlanImplementationOnly
    if (retainPendingRequest) known.waitingSince = retainedWaiting.waitingSince
    else delete known.waitingSince
    known.statusAuthority = retainPendingRequest ? retainedWaitingAuthority : 'connector'
    known.activityEvidence = 'connector'
    delete known.desktopActiveSince
  }

  codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
  known.lastTurnStatus = turn.status
  known.lastTurnStartedAt = turn.startedAt
  if (turn.id) known.lastTurnId = turn.id
  else if (turn.startedAt !== previousStartedAt) delete known.lastTurnId
  if (turn.status === 'completed' && turn.completedAt) known.lastTurnCompletedAt = turn.completedAt
  else delete known.lastTurnCompletedAt
  const terminalEvidenceSequence = codexMarkConfirmedTerminalEvidence(known, 'turn-completed')
  codexRememberPrivateBranchTerminal(threadId, threadId, turn, 'turn-completed', {
    terminalEvidenceSequence,
    activeEvidenceSequence: known.activeEvidenceSequence,
    idleConfirmed: codexPrivateBranchIdleConfirmed(threadId, threadId, known)
  })
  codexClearAppServerLiveActive(known)
  if (turn.status === 'completed') codexRecordCompletedPlanArtifact(known)
  bridge.cancelLatestTurnRefresh(threadId)
  // Any false already present when the exact completion arrives belongs to
  // the pre-completion epoch, even when an unresolved request flag is still
  // draining. Clear it through the shared completion publisher; a genuinely
  // later read-state event can immediately reassert explicit false.
  if (turn.status === 'completed') {
    if (options.deferPublish === true) {
      bridge.applyFreshCompletionUnread(known, threadId, { clearStaleLiveFalse: true })
    } else bridge.publishTargetedCompletion(known, threadId, 'turn-completed')
  } else if (options.deferPublish !== true) emitCodexActivityDelta([known], false)
  if (refreshGoal) void refreshCodexThreadGoal(threadId, { force: true, publish: true })
  return true
}

function codexApplyStartedTurnNotification(bridge, known, threadId, value, waitingThreadId = threadId) {
  if (!bridge || !known || !validCodexThreadId(threadId)) return false
  const turn = sanitizeCodexTurnStatus(value)
  if (turn?.status !== 'inProgress' || !turn.startedAt) return false
  const goal = codexThreadGoalCache.get(waitingThreadId)
  const refreshGoal = codexThreadGoalRpcAvailable !== false && (
    !goal
    || goal.goalFreshness === 'verifying'
    || (CODEX_THREAD_GOAL_NON_ACTIVE_STATUSES.includes(goal.goalStatus)
      && (!goal.goalUpdatedAt || turn.startedAt >= goal.goalUpdatedAt))
  )
  codexForgetPrivateBranchTerminal(threadId, waitingThreadId)
  bridge.cancelWaitingEdgeRefresh(waitingThreadId)
  bridge.clearOrphanedPending(threadId)
  delete known.pendingCompletedPlanItem
  known.connectorStatus = 'active'
  known.connectorActiveFlags = []
  delete known.connectorWaitingSince
  known.connectorPlanImplementationOnly = false
  known.connectorStatusAuthority = 'connector'
  const previousStartedAt = codexTimestampMs(known.lastTurnStartedAt)
  const restoreAppServerActive = () => {
    const sequence = codexMarkAppServerLiveActive(
      known,
      undefined,
      waitingThreadId,
      turn.startedAt !== previousStartedAt || known.lastTurnStatus !== 'inProgress'
    )
    bridge.clearWaitingEvidence(
      waitingThreadId,
      ['waitingOnUserInput', 'waitingOnApproval'],
      { sequence }
    )
    known.status = 'active'
    known.activeFlags = []
    known.planImplementationOnly = false
    delete known.waitingSince
    known.statusAuthority = 'app-server-live'
    known.activityEvidence = 'activity-event'
    known.activityRevision = codexActivityGeneration
    delete known.desktopActiveSince
  }
  if (known.lastTurnStatus === 'inProgress' && turn.startedAt === previousStartedAt) {
    restoreAppServerActive()
    bridge.cancelLatestTurnRefresh(threadId)
    bridge.cancelCompletionUnreadRefresh(threadId)
    emitCodexActivityDelta([known], false)
    if (refreshGoal) void refreshCodexThreadGoal(waitingThreadId, { force: true, publish: true })
    return true
  }
  // App Server notifications are ordered on one stream. A same-second
  // completed/interrupted → started transition is therefore a real restart,
  // not a timestamp regression. Only an actually older startedAt is stale.
  if (turn.startedAt < previousStartedAt) return false

  codexClearDesktopOpenedRead(bridge, threadId)
  codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
  known.lastTurnStatus = 'inProgress'
  known.lastTurnStartedAt = turn.startedAt
  if (turn.id) known.lastTurnId = turn.id
  else if (turn.startedAt !== previousStartedAt) delete known.lastTurnId
  delete known.lastTurnCompletedAt
  known.lastTurnEvidence = 'turn-started'
  delete known.terminalEvidenceSequence
  restoreAppServerActive()
  bridge.cancelLatestTurnRefresh(threadId)
  bridge.cancelCompletionUnreadRefresh(threadId)
  if (!bridge.restoreSuppressedActive(threadId)) emitCodexActivityDelta([known], false)
  if (refreshGoal) void refreshCodexThreadGoal(waitingThreadId, { force: true, publish: true })
  return true
}

function codexClearStalePreCompletionLiveUnread(bridge, threadId) {
  if (!bridge || !validCodexThreadId(threadId)) return
  const known = codexActivityInventory.get(threadId)
  if (codexDesktopOpenedReadCoversCompletion(threadId, known)) return
  codexClearDesktopOpenedRead(bridge, threadId)
  const shadow = bridge.shadows.get(threadId)
  if (shadow && shadow.hasUnreadTurn === false) shadow.hasUnreadTurn = undefined
  const liveUnread = bridge.liveUnread.get(threadId)
  if (liveUnread && liveUnread.hasUnreadTurn === false) bridge.liveUnread.delete(threadId)
  for (const [sideId, sideShadow] of bridge.sideShadows) {
    if (sideShadow.parentThreadId !== threadId) continue
    if (sideShadow.hasUnreadTurn === false) sideShadow.hasUnreadTurn = undefined
    const sideLive = bridge.liveUnread.get(sideId)
    if (sideLive && sideLive.hasUnreadTurn === false) bridge.liveUnread.delete(sideId)
  }
}

class CodexDesktopCompanionBridge {
  constructor() {
    this.state = 'not-checked'
    this.socket = null
    this.buffer = Buffer.alloc(0)
    this.clientId = 'initializing-client'
    this.initializeRequestId = ''
    this.initializeTimer = null
    this.reconnectTimer = null
    this.reconnectAttempt = 0
    this.closed = false
    this.inventory = new Set()
    this.shadows = new Map()
    this.sideShadows = new Map()
    this.sideRecoveryPending = new Set()
    this.liveUnread = new Map()
    this.persistedUnread = new Map()
    this.turnRefreshes = new Map()
    this.unreadRefreshes = new Map()
    this.waitingEdgeRefreshes = new Map()
    this.waitingStates = new Map()
    this.unreadStateWatcher = null
    this.unreadStateWatchPath = ''
    this.unreadStateStatWatcherActive = false
    this.unreadStateWatcherRetryAvailable = true
    this.lastSocketError = ''
  }

  cancelLatestTurnRefreshByKey(refreshKey) {
    const refresh = this.turnRefreshes.get(refreshKey)
    if (!refresh) return false
    refresh.cancelled = true
    if (refresh.timer) clearTimeout(refresh.timer)
    this.turnRefreshes.delete(refreshKey)
    return true
  }

  cancelLatestTurnRefresh(threadId) {
    if (!validCodexThreadId(threadId)) return
    for (const [refreshKey, refresh] of [...this.turnRefreshes]) {
      if (refresh.parentThreadId === threadId || refresh.queryThreadId === threadId) {
        this.cancelLatestTurnRefreshByKey(refreshKey)
      }
    }
  }

  cancelCompletionUnreadRefresh(threadId) {
    const refresh = this.unreadRefreshes.get(threadId)
    if (!refresh) return
    refresh.cancelled = true
    if (refresh.timer) clearTimeout(refresh.timer)
    this.unreadRefreshes.delete(threadId)
  }

  clearLatestTurnRefreshes() {
    for (const refreshKey of [...this.turnRefreshes.keys()]) this.cancelLatestTurnRefreshByKey(refreshKey)
    for (const threadId of this.unreadRefreshes.keys()) this.cancelCompletionUnreadRefresh(threadId)
  }

  cancelWaitingEdgeRefresh(threadId) {
    const refresh = this.waitingEdgeRefreshes.get(threadId)
    if (!refresh) return false
    for (const timer of refresh.timers) clearTimeout(timer)
    this.waitingEdgeRefreshes.delete(threadId)
    return true
  }

  clearWaitingEdgeRefreshes() {
    for (const threadId of [...this.waitingEdgeRefreshes.keys()]) this.cancelWaitingEdgeRefresh(threadId)
  }

  waitingStateFor(threadId, create = true) {
    if (!validCodexThreadId(threadId)) return null
    let state = this.waitingStates.get(threadId)
    if (!state && create) {
      state = {
        inputClearSequence: 0,
        approvalClearSequence: 0,
        resolvedRequestSequences: new Map(),
        requestHistory: [],
        runtimeWaitingSequences: {}
      }
      this.waitingStates.set(threadId, state)
      while (this.waitingStates.size > CODEX_DESKTOP_WAITING_STATE_LIMIT) {
        const removable = [...this.waitingStates.keys()].find((candidate) => (
          candidate !== threadId
          && !this.shadows.has(candidate)
          && !this.sideShadows.has(candidate)
        ))
        const oldest = removable || this.waitingStates.keys().next().value
        if (!oldest || oldest === threadId) break
        this.waitingStates.delete(oldest)
      }
    }
    return state || null
  }

  forgetWaitingState(threadId, includeChildren = false) {
    this.waitingStates.delete(threadId)
    if (!includeChildren) return
    for (const [childThreadId, parentThreadId] of codexAllSideRelations()) {
      if (parentThreadId === threadId) this.waitingStates.delete(childThreadId)
    }
    for (const [childThreadId, shadow] of this.sideShadows) {
      if (shadow.parentThreadId === threadId) this.waitingStates.delete(childThreadId)
    }
  }

  attachWaitingState(threadId, shadow) {
    if (!shadow) return null
    const state = this.waitingStateFor(threadId)
    shadow.waitingState = state
    const sequences = codexDesktopRuntimeWaitingSequences(
      shadow.runtime?.activeFlags,
      shadow.runtime?.activeFlags,
      shadow.runtimeWaitingSequences || state?.runtimeWaitingSequences || {}
    )
    shadow.runtimeWaitingSequences = sequences
    if (state) {
      state.runtimeWaitingSequences = {
        ...(state.runtimeWaitingSequences || {}),
        ...sequences
      }
      codexRememberDesktopRequestObservations(state, shadow.requests)
    }
    return state
  }

  rememberRuntimeWaitingSequences(threadId, shadow, previousFlags, refresh = false) {
    if (!shadow) return
    const state = this.attachWaitingState(threadId, shadow)
    const sequences = codexDesktopRuntimeWaitingSequences(
      shadow.runtime?.activeFlags,
      previousFlags,
      shadow.runtimeWaitingSequences || state?.runtimeWaitingSequences || {},
      { refresh }
    )
    shadow.runtimeWaitingSequences = sequences
    if (state) {
      state.runtimeWaitingSequences = {
        ...(state.runtimeWaitingSequences || {}),
        ...sequences
      }
    }
  }

  recordWaitingResolutionOnShadow(shadow, sequence) {
    if (!shadow || !Number.isInteger(sequence) || sequence <= 0) return false
    shadow.activityEvidence = 'activity-event'
    shadow.activityEventSequence = Math.max(Number(shadow.activityEventSequence) || 0, sequence)
    delete shadow.suppressUncorroboratedActive
    return true
  }

  recordInteractionTerminalOnShadow(shadow, request, state, sequence) {
    if (!shadow || !request || !['resolved', 'cancelled', 'execution-started'].includes(state)
      || !Number.isInteger(sequence) || sequence <= 0
      || typeof request.interactionRef !== 'string') return false
    request.interactionState = state
    request.resolutionSequence = sequence
    const terminals = new Map((Array.isArray(shadow.interactionTerminals) ? shadow.interactionTerminals : [])
      .filter((value) => typeof value?.interactionRef === 'string')
      .map((value) => [value.interactionRef, value]))
    terminals.delete(request.interactionRef)
    terminals.set(request.interactionRef, {
      interactionRef: request.interactionRef,
      identityExact: request.identityExact === true,
      type: request.type,
      method: request.method,
      observedSequence: request.observedSequence,
      observedAt: request.observedAt,
      ...(request.startedAt ? { startedAt: request.startedAt } : {}),
      interactionState: state,
      resolutionSequence: sequence
    })
    while (terminals.size > CODEX_DESKTOP_RESOLVED_REQUEST_LIMIT) {
      const oldest = terminals.keys().next().value
      if (!oldest) break
      terminals.delete(oldest)
    }
    shadow.interactionTerminals = [...terminals.values()]
    shadow.requestSetRevision = Math.max(Number(shadow.requestSetRevision) || 0, sequence)
    shadow.requestSetComplete = true
    shadow.requestSetAuthority = 'provider-live'
    return true
  }

  resolveWaitingRequestObservations(threadId, requests, sequence = 0, shadow = null) {
    const observations = (Array.isArray(requests) ? requests : [])
      .filter((request) => codexDesktopRequestFlag(request) && Number.isInteger(request?.observedSequence))
    if (!observations.length) return 0
    const state = this.waitingStateFor(threadId)
    const resolvedSequence = Number.isInteger(sequence) && sequence > 0
      ? sequence
      : codexNextLiveEvidenceSequence()
    for (const request of observations) {
      state.resolvedRequestSequences.delete(request.observedSequence)
      state.resolvedRequestSequences.set(request.observedSequence, resolvedSequence)
      this.recordInteractionTerminalOnShadow(shadow, request, 'resolved', resolvedSequence)
    }
    while (state.resolvedRequestSequences.size > CODEX_DESKTOP_RESOLVED_REQUEST_LIMIT) {
      const oldest = state.resolvedRequestSequences.keys().next().value
      if (!Number.isInteger(oldest)) break
      state.resolvedRequestSequences.delete(oldest)
    }
    this.recordWaitingResolutionOnShadow(shadow, resolvedSequence)
    return resolvedSequence
  }

  recordRemovedWaitingRequests(threadId, previousRequests, currentRequests, shadow = null, sequence = 0) {
    const removed = codexDesktopRequestProjection
      ? codexDesktopRequestProjection.codexDesktopRemovedWaitingRequests(previousRequests, currentRequests)
      : []
    return this.resolveWaitingRequestObservations(threadId, removed, sequence, shadow)
  }

  retainCausallyOpenWaitingRequests(threadId, previousState, shadow) {
    const knownThreadId = shadow.sideConversation && validCodexThreadId(shadow.parentThreadId)
      ? shadow.parentThreadId
      : threadId
    const known = validCodexThreadId(knownThreadId) ? codexActivityInventory.get(knownThreadId) : null
    return codexDesktopRequestProjection?.codexDesktopRetainCausallyOpenRequests(
      shadow, previousState, known?.planReady === true && known.lastTurnStatus === 'completed') === true
  }

  recordRemovedRuntimeWaitingFlags(threadId, previousFlags, currentFlags, currentRequests, sequence = 0, shadow = null) {
    const current = new Set(Array.isArray(currentFlags) ? currentFlags : [])
    const requestFlags = new Set((Array.isArray(currentRequests) ? currentRequests : [])
      .map(codexDesktopRequestFlag)
      .filter(Boolean))
    const removed = [...new Set((Array.isArray(previousFlags) ? previousFlags : [])
      .filter((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval'))]
      .filter((flag) => !current.has(flag) && !requestFlags.has(flag))
    if (!removed.length) return 0
    const resolvedSequence = this.clearWaitingEvidence(threadId, removed, {
      sequence: Number.isInteger(sequence) && sequence > 0
        ? sequence
        : codexNextLiveEvidenceSequence()
    })
    this.recordWaitingResolutionOnShadow(shadow, resolvedSequence)
    return resolvedSequence
  }

  // A leftover plan/question request is waiting evidence only while Desktop is
  // idle or itself flagged as waiting. Once runtime resumes plain-active, the
  // same already-observed wait is stale continuation residue, not a new wait.
  clearStaleWaitingAfterRuntimeResume(
    threadId,
    previousRuntime,
    currentRuntime,
    currentRequests,
    shadow = null,
    previousRequests = []
  ) {
    const flags = codexDesktopRequestProjection?.codexDesktopResumedWaitingFlags(
      previousRuntime, currentRuntime, currentRequests, previousRequests
    ) || []
    if (!flags.length) return false
    const sequence = this.clearWaitingEvidence(threadId, flags)
    if (shadow) {
      shadow.activityEvidence = 'activity-event'
      shadow.activityEventSequence = Math.max(Number(shadow.activityEventSequence) || 0, sequence)
      delete shadow.suppressUncorroboratedActive
    }
    const knownThreadId = shadow?.sideConversation && validCodexThreadId(shadow.parentThreadId)
      ? shadow.parentThreadId
      : threadId
    const known = codexActivityInventory.get(knownThreadId)
    if (known) {
      delete known.pendingCompletedPlanItem
      known.connectorPlanImplementationOnly = false
    }
    return true
  }

  clearWaitingEvidence(threadId, flags = ['waitingOnUserInput', 'waitingOnApproval'], options = {}) {
    const state = this.waitingStateFor(threadId)
    if (!state) return 0
    const sequence = Number.isInteger(options.sequence)
      ? options.sequence
      : codexNextLiveEvidenceSequence()
    if (flags.includes('waitingOnUserInput')) {
      state.inputClearSequence = Math.max(state.inputClearSequence || 0, sequence)
    }
    if (flags.includes('waitingOnApproval')) {
      state.approvalClearSequence = Math.max(state.approvalClearSequence || 0, sequence)
    }
    const shadow = this.shadows.get(threadId) || this.sideShadows.get(threadId)
    if (shadow) this.attachWaitingState(threadId, shadow)
    if (options.publish === true) this.publishCurrentShadow(threadId)
    return sequence
  }

  publishCurrentShadow(threadId) {
    const sideShadow = this.sideShadows.get(threadId)
    if (sideShadow) {
      this.publishSideShadow(threadId, sideShadow)
      return true
    }
    const mainShadow = this.shadows.get(threadId)
    if (mainShadow) {
      this.publishShadow(threadId, mainShadow)
      return true
    }
    return false
  }

  resolveServerRequest(threadId, correlation) {
    if (!validCodexThreadId(threadId) || typeof correlation !== 'string' || !correlation) return false
    const shadow = this.shadows.get(threadId) || this.sideShadows.get(threadId)
    const matches = (shadow?.requests || []).filter((request) => (
      request?.correlation === correlation && codexDesktopRequestFlag(request)
    ))
    if (!matches.length) {
      this.scheduleWaitingEdgeRefresh(threadId)
      return false
    }
    const sequence = this.resolveWaitingRequestObservations(threadId, matches, 0, shadow)
    if (!sequence) return false
    this.cancelWaitingEdgeRefresh(threadId)
    this.publishCurrentShadow(threadId)
    return true
  }

  scheduleWaitingEdgeRefresh(threadId) {
    if (!validCodexThreadId(threadId) || this.closed) return false
    this.cancelWaitingEdgeRefresh(threadId)
    const refresh = { startedAt: Date.now(), timers: new Set() }
    this.waitingEdgeRefreshes.set(threadId, refresh)
    codexNoteActivityDecision('waitingEdgeResubscribe')
    for (const delay of CODEX_WAITING_EDGE_REFRESH_DELAYS_MS) {
      const timer = setTimeout(() => {
        refresh.timers.delete(timer)
        if (this.closed || this.waitingEdgeRefreshes.get(threadId) !== refresh) return
        if (Date.now() - refresh.startedAt > CODEX_WAITING_EDGE_REFRESH_DEADLINE_MS) return
        if (delay === 0) this.resubscribe(threadId)
        else {
          this.followAny(threadId, false)
          this.followAny(threadId, true)
        }
      }, delay)
      timer.unref?.()
      refresh.timers.add(timer)
    }
    const deadlineTimer = setTimeout(() => {
      refresh.timers.delete(deadlineTimer)
      if (this.waitingEdgeRefreshes.get(threadId) !== refresh) return
      this.waitingEdgeRefreshes.delete(threadId)
      codexNoteActivityDecision('waitingEdgeRecoveryExpired')
      emitCodexActivityDelta([], false)
    }, CODEX_WAITING_EDGE_REFRESH_DEADLINE_MS)
    deadlineTimer.unref?.()
    refresh.timers.add(deadlineTimer)
    return true
  }

  parentLiveEvidenceSequence(threadId) {
    const known = codexActivityInventory.get(threadId)
    const ownShadow = this.shadows.get(threadId)
    const shadows = [
      ownShadow,
      ...[...this.sideShadows.values()].filter((shadow) => shadow.parentThreadId === threadId)
    ].filter(Boolean)
    return Math.max(
      known?.appServerLiveActive === true && Number.isInteger(known.appServerLiveSequence)
        ? known.appServerLiveSequence
        : 0,
      codexInventorySnapshotLiveSequence(threadId, threadId, known, ownShadow),
      ...shadows.map((shadow) => {
        const activity = codexDesktopShadowActivity(shadow)
        return activity?.status === 'active'
          && shadow.activityEvidence === 'activity-event'
          && Number.isInteger(shadow.activityEventSequence)
          ? shadow.activityEventSequence
          : 0
      })
    )
  }

  hasExactPositiveActivity(threadId) {
    return this.parentLiveEvidenceSequence(threadId) > 0
  }

  hasOtherActiveBranch(parentThreadId, branchThreadId) {
    if (!validCodexThreadId(parentThreadId) || !validCodexThreadId(branchThreadId)) return false
    const known = codexActivityInventory.get(parentThreadId)
    const appServerBranchThreadId = validCodexThreadId(known?.appServerLiveBranchThreadId)
      ? known.appServerLiveBranchThreadId
      : parentThreadId
    if (known?.appServerLiveActive === true && appServerBranchThreadId !== branchThreadId) return true
    const branches = [
      [parentThreadId, this.shadows.get(parentThreadId)],
      ...[...this.sideShadows.entries()].filter(([, shadow]) => shadow.parentThreadId === parentThreadId)
    ]
    return branches.some(([threadId, shadow]) => {
      if (threadId === branchThreadId || !shadow) return false
      return codexDesktopShadowActivity(shadow)?.status === 'active'
    })
  }

  openParentLiveEpoch(threadId, options = {}) {
    const known = codexActivityInventory.get(threadId)
    if (!known) return false
    codexClearDesktopOpenedRead(this, threadId)
    known.lastTurnStatus = 'inProgress'
    delete known.lastTurnId
    delete known.lastTurnCompletedAt
    delete known.lastTurnEvidence
    delete known.terminalEvidenceSequence
    known.idleConfirmed = false
    codexThreadTurnStatusCache.delete(threadId)
    if (options.preserveLatestTurnRefresh !== true) this.cancelLatestTurnRefresh(threadId)
    this.cancelCompletionUnreadRefresh(threadId)
    codexNoteActivityDecision('liveEpochOpened')
    return true
  }

  applyFreshCompletionUnread(known, threadId, options = {}) {
    if (!known || !validCodexThreadId(threadId)) return false
    if (options.clearStaleLiveFalse === true) codexClearStalePreCompletionLiveUnread(this, threadId)
    let unreadIds = null
    try { unreadIds = readCodexDesktopUnreadIds() } catch {}
    // External conversations keep unread inside the Host; the official atom
    // never lists them, so it must not overwrite the merged connector value.
    if (unreadIds && codexhostDiscovery?.isExternalThreadId?.(threadId) !== true) {
      known.connectorHasUnreadTurn = unreadIds.has(threadId)
      known.connectorUnreadAuthority = 'desktop-persisted'
    }
    const observation = codexDesktopUnreadObservation(this, known, threadId, this.shadows.get(threadId), unreadIds)
    known.hasUnreadTurn = observation.hasUnreadTurn
    known.unreadAuthority = observation.unreadAuthority
    return known.hasUnreadTurn === true
  }

  publishTargetedCompletion(known, threadId, evidence = 'targeted-after-exit', branchThreadId = threadId) {
    codexClearAppServerLiveActive(known)
    const terminalEvidenceSequence = codexMarkConfirmedTerminalEvidence(known, evidence)
    codexRememberPrivateBranchTerminal(threadId, branchThreadId, {
      status: 'completed',
      startedAt: known.lastTurnStartedAt
    }, evidence, {
      terminalEvidenceSequence,
      activeEvidenceSequence: known.activeEvidenceSequence,
      idleConfirmed: codexPrivateBranchIdleConfirmed(threadId, branchThreadId, known)
    })
    codexRecordCompletedPlanArtifact(known)
    this.applyFreshCompletionUnread(known, threadId, { clearStaleLiveFalse: true })
    emitCodexActivityDelta([known], false)
    if (known.hasUnreadTurn !== true && !codexDesktopOpenedReadCoversCompletion(threadId, known)) {
      this.scheduleCompletionUnreadRefresh(threadId)
    }
  }

  restoreSuppressedActive(threadId) {
    if (!validCodexThreadId(threadId)) return false
    const shadows = [
      this.shadows.get(threadId),
      ...[...this.sideShadows.values()].filter((shadow) => shadow.parentThreadId === threadId)
    ].filter(Boolean)
    let restored = false
    for (const shadow of shadows) {
      if (shadow.suppressUncorroboratedActive !== true) continue
      delete shadow.suppressUncorroboratedActive
      const activity = codexDesktopShadowActivity(shadow)
      if (activity?.status === 'active' && !codexTimestampMs(shadow.desktopActiveSince)) shadow.desktopActiveSince = Date.now()
      restored = true
    }
    if (restored) this.emitParentActivity(threadId)
    return restored
  }

  verifyUncorroboratedActiveSnapshot(threadId, shadow, options = {}) {
    if (!validCodexThreadId(threadId) || !shadow) return
    const parentThreadId = shadow.sideConversation ? shadow.parentThreadId : threadId
    const known = codexActivityInventory.get(parentThreadId)
    const activity = codexDesktopShadowActivity(shadow)
    const knownTurn = known?.lastTurnStatus === 'inProgress'
      || known?.lastTurnStatus === 'completed'
      || known?.lastTurnStatus === 'failed'
      || known?.lastTurnStatus === 'interrupted'
    if (!known || !validCodexThreadId(parentThreadId) || !knownTurn || !known.lastTurnStartedAt) return
    if (known.connectorPlanImplementationOnly === true) return
    const parentTerminal = codexReadPrivateBranchTerminal(parentThreadId, parentThreadId)
    const detachedDesktopSide = shadow.sideConversation === true
      && threadId !== parentThreadId
      && codexDesktopSideRelations.get(threadId) === parentThreadId
      && !codexInventorySideRelations.has(threadId)
      && codexCompleteInventoryThreadIds instanceof Set
      && !codexCompleteInventoryThreadIds.has(threadId)
      && Boolean(parentTerminal)
      && !(known.appServerLiveActive === true && known.appServerLiveBranchThreadId === threadId)
    if (shadow.activityEvidence !== 'initial-snapshot' && !detachedDesktopSide) return
    if (!detachedDesktopSide && this.hasExactPositiveActivity(parentThreadId)) return
    if (activity?.status !== 'active' || activity.activeFlags.length > 0) return
    // A cold/refollow snapshot is current topology evidence, but it is not a
    // live Turn witness on its own. Verify every uncorroborated plain-active
    // snapshot against that exact branch's latest Turn. This closes both
    // directions without guessing: inProgress opens a live epoch immediately;
    // completed/interrupted/failed keeps hydration from fabricating running.
    this.scheduleLatestTurnRefresh(parentThreadId, {
      verifyStaleActive: true,
      settleSnapshotTerminal: true,
      queryThreadId: threadId,
      snapshotThreadId: threadId,
      snapshotActivityRevision: shadow.activityRevision,
      forceQuery: detachedDesktopSide,
      restart: options.restart === true
    })
  }

  retireMissingDesktopSide(parentThreadId, refresh, known) {
    const threadId = refresh?.queryThreadId
    if (!validCodexThreadId(parentThreadId)
      || !validCodexThreadId(threadId)
      || threadId === parentThreadId
      || codexDesktopSideRelations.get(threadId) !== parentThreadId
      || codexInventorySideRelations.has(threadId)
      || !(codexCompleteInventoryThreadIds instanceof Set)
      || codexCompleteInventoryThreadIds.has(threadId)) return false
    const shadow = this.sideShadows.get(threadId)
    if (!shadow
      || shadow.parentThreadId !== parentThreadId
      || shadow.activityRevision !== refresh.snapshotActivityRevision) return false
    const activity = codexDesktopShadowActivity(shadow)
    if (activity?.status !== 'active'
      || activity.activeFlags.length > 0
      || activity.planImplementationOnly === true) return false
    const parentTerminal = codexReadPrivateBranchTerminal(parentThreadId, parentThreadId)
    if (!parentTerminal) return false
    if (known?.appServerLiveActive === true && known.appServerLiveBranchThreadId === threadId) return false

    const otherBranchLive = this.hasOtherActiveBranch(parentThreadId, threadId)
    this.sideShadows.delete(threadId)
    this.sideRecoveryPending.delete(threadId)
    this.liveUnread.delete(threadId)
    this.persistedUnread.delete(threadId)
    this.waitingStates.delete(threadId)
    codexForgetDesktopSideRelation(threadId)
    if (!otherBranchLive && known) {
      known.lastTurnStatus = parentTerminal.lastTurnStatus
      known.lastTurnStartedAt = parentTerminal.turnStartedAt
      known.lastTurnEvidence = parentTerminal.lastTurnEvidence
      known.terminalEvidenceSequence = parentTerminal.terminalEvidenceSequence
      known.idleConfirmed = parentTerminal.idleConfirmed === true
      if (parentTerminal.lastTurnStatus === 'completed' && parentTerminal.terminalAt) {
        known.lastTurnCompletedAt = parentTerminal.terminalAt
      } else delete known.lastTurnCompletedAt
      codexClearAppServerLiveActive(known)
    }
    runtimeDiagnostics.record({
      level: 'info',
      scope: 'task-topology',
      event: 'desktop-side-reconciled',
      outcome: 'retired-missing',
      provider: 'codex',
      taskRef: typeof known?.key === 'string' ? known.key : '',
      details: { inventory: 'complete', latestTurn: 'empty' }
    })
    this.emitParentActivity(parentThreadId)
    return true
  }

  settleTerminalActiveSnapshot(threadId, refresh, known, turn) {
    const shadow = this.shadows.get(refresh.snapshotThreadId) || this.sideShadows.get(refresh.snapshotThreadId)
    if (!shadow || shadow.activityRevision !== refresh.snapshotActivityRevision) return false
    const activity = codexDesktopShadowActivity(shadow)
    if (activity?.status !== 'active' || activity.activeFlags.length > 0) return false
    const parentThreadId = shadow.sideConversation ? shadow.parentThreadId : refresh.snapshotThreadId
    if (parentThreadId !== threadId || codexActivityInventory.get(threadId) !== known) return false
    if (refresh.queryThreadId !== threadId
      && this.hasOtherActiveBranch(threadId, refresh.queryThreadId)) {
      codexRememberPrivateBranchTerminal(threadId, refresh.queryThreadId, turn,
        turn.status === 'completed' ? 'snapshot-corroborated' : 'targeted-after-exit', {
          terminalEvidenceSequence: codexNextLiveEvidenceSequence(),
          activeEvidenceSequence: shadow.activityEventSequence,
          idleConfirmed: false
        })
      shadow.suppressUncorroboratedActive = true
      delete shadow.desktopActiveSince
      this.openParentLiveEpoch(threadId, { preserveLatestTurnRefresh: true })
      codexNoteActivityDecision('branchTerminalDeferred')
      this.emitParentActivity(threadId)
      return true
    }

    codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
    known.lastTurnStatus = turn.status
    known.lastTurnStartedAt = turn.startedAt
    if (turn.id) known.lastTurnId = turn.id
    else delete known.lastTurnId
    if (turn.status === 'completed' && turn.completedAt) known.lastTurnCompletedAt = turn.completedAt
    else delete known.lastTurnCompletedAt
    if (turn.status === 'completed') codexClearAppServerLiveActive(known)
    shadow.suppressUncorroboratedActive = true
    delete shadow.desktopActiveSince
    codexNoteActivityDecision('snapshotConflictSuppressed')
    this.emitParentActivity(threadId)
    const settled = codexActivityInventory.get(threadId)
    if (settled?.status !== 'active') {
      if (turn.status === 'completed') {
        // The first non-active delta intentionally preserves the exact shadow
        // transition as unavailable. The corroborated terminal result then
        // closes only that unchanged activity epoch as idle, so Controller
        // cannot guard a recovered same-revision completion back to inProgress.
        settled.status = 'idle'
        settled.activeFlags = []
        settled.planImplementationOnly = false
        delete settled.desktopActiveSince
        this.publishTargetedCompletion(settled, threadId, 'snapshot-corroborated', refresh.queryThreadId)
      } else {
        // A replayed active snapshot and a failed/interrupted latest Turn are
        // conflicting evidence. Suppression projects unavailable/ongoing, not
        // synthetic idle/stopped, until a real non-active patch arrives.
        const terminalEvidenceSequence = codexMarkConfirmedTerminalEvidence(settled, 'targeted-after-exit')
        codexRememberPrivateBranchTerminal(threadId, refresh.queryThreadId, turn, 'targeted-after-exit', {
          terminalEvidenceSequence,
          activeEvidenceSequence: shadow.activityEventSequence,
          idleConfirmed: codexPrivateBranchIdleConfirmed(threadId, refresh.queryThreadId, settled)
        })
        emitCodexActivityDelta([settled], false)
      }
    }
    return true
  }

  scheduleCompletionUnreadRefresh(threadId) {
    if (!validCodexThreadId(threadId) || this.unreadRefreshes.has(threadId)) return
    const known = codexActivityInventory.get(threadId)
    if (!known) return
    if (known.lastTurnStatus === 'completed' && known.hasUnreadTurn === true) return
    const refresh = {
      cancelled: false,
      timer: null,
      attempt: 0,
      deadlineAt: Date.now() + CODEX_DESKTOP_TURN_REFRESH_DEADLINE_MS
    }
    this.unreadRefreshes.set(threadId, refresh)
    const finish = () => {
      if (refresh.timer) clearTimeout(refresh.timer)
      refresh.timer = null
      if (this.unreadRefreshes.get(threadId) === refresh) this.unreadRefreshes.delete(threadId)
    }
    const run = () => {
      refresh.timer = null
      const latest = codexActivityInventory.get(threadId)
      if (refresh.cancelled || !latest) {
        finish()
        return
      }
      if (latest.lastTurnStatus === 'completed') {
        if (latest.hasUnreadTurn === true) {
          finish()
          return
        }
        const becameUnread = this.applyFreshCompletionUnread(latest, threadId)
        if (becameUnread) {
          emitCodexActivityDelta([{ ...latest, readStateOnly: true }], false)
          finish()
          return
        }
      }
      const remaining = refresh.deadlineAt - Date.now()
      if (remaining <= 0 || refresh.attempt >= CODEX_DESKTOP_TURN_REFRESH_DELAYS_MS.length) {
        finish()
        return
      }
      const nextDelay = CODEX_DESKTOP_TURN_REFRESH_DELAYS_MS[refresh.attempt]
      refresh.attempt += 1
      if (typeof nextDelay !== 'number' || Date.now() + nextDelay >= refresh.deadlineAt) {
        finish()
        return
      }
      refresh.timer = setTimeout(() => { run() }, nextDelay)
      refresh.timer.unref?.()
    }
    void run()
  }

  scheduleLatestTurnRefresh(threadId, options = {}) {
    if (!validCodexThreadId(threadId)) return
    const verifyStaleActive = options.verifyStaleActive === true
    const recheckInventorySnapshot = verifyStaleActive && options.recheckInventorySnapshot === true
    const confirmCompletionEvent = options.confirmCompletionEvent === true
    const forceQuery = options.forceQuery === true
    const settleSnapshotTerminal = verifyStaleActive && options.settleSnapshotTerminal === true
    const confirmCurrentTerminal = verifyStaleActive && !settleSnapshotTerminal && options.confirmCurrentTerminal === true
    const queryThreadId = validCodexThreadId(options.queryThreadId) ? options.queryThreadId : threadId
    const refreshKey = queryThreadId === threadId ? threadId : `${threadId}:${queryThreadId}`
    if (verifyStaleActive && !forceQuery && this.hasExactPositiveActivity(threadId) && !recheckInventorySnapshot) {
      codexNoteActivityDecision('staleTurnDiscarded')
      return
    }
    const snapshotThreadId = settleSnapshotTerminal && validCodexThreadId(options.snapshotThreadId) ? options.snapshotThreadId : ''
    const snapshotActivityRevision = settleSnapshotTerminal && Number.isInteger(options.snapshotActivityRevision) ? options.snapshotActivityRevision : -1
    const existing = this.turnRefreshes.get(refreshKey)
    if (existing) {
      let incompatibleMode = options.restart === true
        || existing.baselineInventory !== codexActivityInventory.get(threadId)
        || existing.verifyStaleActive !== verifyStaleActive
        || existing.recheckInventorySnapshot !== recheckInventorySnapshot
        || existing.confirmCompletionEvent !== confirmCompletionEvent
        || existing.forceQuery !== forceQuery
      if (!incompatibleMode && verifyStaleActive) {
        if (settleSnapshotTerminal) {
          incompatibleMode = !existing.settleSnapshotTerminal
            || existing.snapshotThreadId !== snapshotThreadId
            || existing.snapshotActivityRevision !== snapshotActivityRevision
        } else if (confirmCurrentTerminal) {
          incompatibleMode = !existing.settleSnapshotTerminal && !existing.confirmCurrentTerminal
        }
      }
      if (!incompatibleMode) return
      this.cancelLatestTurnRefreshByKey(refreshKey)
    }
    const baseline = codexActivityInventory.get(threadId)
    const refresh = {
      cancelled: false,
      timer: null,
      attempt: 0,
      parentThreadId: threadId,
      queryThreadId,
      verifyStaleActive,
      recheckInventorySnapshot,
      confirmCompletionEvent,
      forceQuery,
      settleSnapshotTerminal,
      confirmCurrentTerminal,
      snapshotThreadId,
      snapshotActivityRevision,
      exactEmptyTurnPages: 0,
      deadlineAt: Date.now() + CODEX_DESKTOP_TURN_REFRESH_DEADLINE_MS,
      baselineTurnStatus: baseline?.lastTurnStatus,
      baselineTurnStartedAt: codexTimestampMs(baseline?.lastTurnStartedAt),
      baselineInventory: baseline,
      baselineStatusAuthority: baseline?.statusAuthority,
      baselineActivityEvidence: baseline?.activityEvidence,
      baselineActivityRevision: baseline?.activityRevision,
      baselinePositiveSequence: this.parentLiveEvidenceSequence(threadId),
      refreshDelays: confirmCompletionEvent
        ? CODEX_COMPLETION_EVENT_REFRESH_DELAYS_MS
        : CODEX_DESKTOP_TURN_REFRESH_DELAYS_MS
    }
    this.turnRefreshes.set(refreshKey, refresh)

    const finish = (inventoryChanged = false) => {
      if (refresh.timer) clearTimeout(refresh.timer)
      refresh.timer = null
      if (this.turnRefreshes.get(refreshKey) === refresh) this.turnRefreshes.delete(refreshKey)
      if (inventoryChanged) {
        const known = codexActivityInventory.get(threadId)
        markCodexThreadTurnStatusDirty(threadId)
        emitCodexActivityDelta(known ? [known] : [], true, 'urgent')
      }
    }
    const run = async () => {
      refresh.timer = null
      const known = codexActivityInventory.get(threadId)
      if (refresh.cancelled || !known) {
        finish(false)
        return
      }
      const waitingLive = Array.isArray(known.activeFlags)
        && known.activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
      if (known.status === 'active'
        && !refresh.verifyStaleActive
        && !refresh.confirmCompletionEvent
        && !refresh.forceQuery) {
        finish(false)
        return
      }
      if (refresh.confirmCompletionEvent
        && this.parentLiveEvidenceSequence(threadId) !== refresh.baselinePositiveSequence) {
        codexNoteActivityDecision('staleTurnDiscarded')
        finish(false)
        return
      }
      if (refresh.verifyStaleActive) {
        if (known.status !== 'active' || (waitingLive && !refresh.forceQuery)) {
          finish(false)
          return
        }
        if (this.parentLiveEvidenceSequence(threadId) !== refresh.baselinePositiveSequence) {
          codexNoteActivityDecision('staleTurnDiscarded')
          finish(false)
          return
        }
      }
      if (!refresh.verifyStaleActive
        && !refresh.forceQuery
        && codexApplyCachedCompletedTurnEvidence(known, threadId)) {
        finish(false)
        this.publishTargetedCompletion(known, threadId, refresh.confirmCompletionEvent ? 'turn-completed' : 'targeted-after-exit')
        return
      }
      const remaining = refresh.deadlineAt - Date.now()
      if (remaining <= 0 || refresh.attempt >= refresh.refreshDelays.length) {
        finish(true)
        return
      }
      refresh.attempt += 1
      try {
        const page = await requestCodexRpc('thread/turns/list', {
          threadId: queryThreadId,
          limit: 1,
          sortDirection: 'desc',
          itemsView: 'notLoaded'
        }, refresh.confirmCompletionEvent
          ? Math.max(100, Math.min(350, remaining))
          : Math.max(250, Math.min(1_000, remaining)))
        const latestKnown = codexActivityInventory.get(threadId)
        if (refresh.cancelled || latestKnown !== known) {
          finish(false)
          return
        }
        if (!refresh.verifyStaleActive
          && known.status === 'active'
          && !refresh.confirmCompletionEvent
          && !refresh.forceQuery) {
          finish(false)
          return
        }
        if (refresh.confirmCompletionEvent
          && this.parentLiveEvidenceSequence(threadId) !== refresh.baselinePositiveSequence) {
          codexNoteActivityDecision('staleTurnDiscarded')
          finish(false)
          return
        }
        const latestWaitingLive = Array.isArray(known.activeFlags)
          && known.activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
        if (refresh.verifyStaleActive && (known.status !== 'active' || (latestWaitingLive && !refresh.forceQuery))) {
          finish(false)
          return
        }
        if (refresh.verifyStaleActive
          && this.parentLiveEvidenceSequence(threadId) !== refresh.baselinePositiveSequence) {
          codexNoteActivityDecision('staleTurnDiscarded')
          finish(false)
          return
        }
        const turnPage = codexRecord(page)
        const emptyTurnPage = Array.isArray(turnPage.data) && turnPage.data.length === 0
        if (emptyTurnPage) refresh.exactEmptyTurnPages += 1
        const turn = sanitizeCodexTurnStatusPage(page)
        const terminalTurn = turn?.status === 'completed' || turn?.status === 'failed' || turn?.status === 'interrupted'
        const validTerminalTurn = terminalTurn && turn.startedAt > 0
        const finalAttempt = refresh.attempt >= refresh.refreshDelays.length
        if (refresh.settleSnapshotTerminal
          && finalAttempt
          && emptyTurnPage
          && refresh.exactEmptyTurnPages === refresh.refreshDelays.length
          && this.retireMissingDesktopSide(threadId, refresh, known)) {
          finish(false)
          return
        }
        if (refresh.settleSnapshotTerminal
          && validTerminalTurn
          && turn.startedAt >= refresh.baselineTurnStartedAt
          && (turn.startedAt > refresh.baselineTurnStartedAt
            || refresh.baselineTurnStatus === 'inProgress'
            || finalAttempt)
          && this.settleTerminalActiveSnapshot(threadId, refresh, known, turn)) {
          finish(false)
          return
        }
        const resumedTerminalRevision = turn?.startedAt === refresh.baselineTurnStartedAt
          && refresh.baselineTurnStatus !== 'inProgress'
        if (refresh.verifyStaleActive && turn?.status === 'inProgress'
          && (turn.startedAt > refresh.baselineTurnStartedAt
            || resumedTerminalRevision
            || (turn.startedAt === refresh.baselineTurnStartedAt
              && refresh.settleSnapshotTerminal
              && refresh.baselinePositiveSequence === 0))) {
          codexForgetPrivateBranchTerminal(threadId, queryThreadId)
          const activeSequence = codexMarkAppServerLiveActive(known, undefined, queryThreadId, true)
          codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
          known.status = 'active'
          known.activeFlags = []
          known.planImplementationOnly = false
          delete known.waitingSince
          known.statusAuthority = 'app-server-live'
          known.activityEvidence = 'activity-event'
          known.activityRevision = Math.max(Number(known.activityRevision) || 0, activeSequence)
          known.lastTurnStatus = 'inProgress'
          known.lastTurnStartedAt = turn.startedAt
          if (turn.id) known.lastTurnId = turn.id
          else delete known.lastTurnId
          delete known.lastTurnCompletedAt
          delete known.lastTurnEvidence
          delete known.terminalEvidenceSequence
          finish(false)
          emitCodexActivityDelta([known], false)
          return
        }
        const unchangedActiveEpoch = known.status === 'active'
          && known.statusAuthority === refresh.baselineStatusAuthority
          && known.activityEvidence === refresh.baselineActivityEvidence
          && known.activityRevision === refresh.baselineActivityRevision
          && known.lastTurnEvidence !== 'turn-started'
        const corroboratedCurrentCompletion = refresh.confirmCurrentTerminal
          && finalAttempt
          && unchangedActiveEpoch
          && refresh.baselineTurnStatus === 'completed'
          && turn?.status === 'completed'
          && turn.startedAt === refresh.baselineTurnStartedAt
        const exactCompletionConfirmation = refresh.confirmCompletionEvent
          && unchangedActiveEpoch
          && refresh.baselineTurnStatus === 'completed'
          && turn?.status === 'completed'
          && turn.startedAt === refresh.baselineTurnStartedAt
        const freshTerminalTurn = exactCompletionConfirmation
          || corroboratedCurrentCompletion
          || turn?.startedAt > refresh.baselineTurnStartedAt
          || turn?.startedAt === refresh.baselineTurnStartedAt
            && (refresh.baselineTurnStatus === 'inProgress' || turn.status !== refresh.baselineTurnStatus)
        if (turn?.startedAt
          && turn.status !== 'inProgress'
          && (!refresh.confirmCompletionEvent || turn.status === 'completed')
          && freshTerminalTurn) {
          if (queryThreadId !== threadId && this.hasOtherActiveBranch(threadId, queryThreadId)) {
            // A child result is branch-scoped evidence. Keep the aggregate Turn
            // epoch live while a sibling/main branch is still authoritatively
            // active; otherwise this async read can reintroduce the old
            // running -> stopped/completed parent regression.
            const branchShadow = this.shadows.get(queryThreadId) || this.sideShadows.get(queryThreadId)
            codexRememberPrivateBranchTerminal(
              threadId,
              queryThreadId,
              turn,
              refresh.confirmCompletionEvent ? 'turn-completed' : 'targeted-after-exit',
              {
                terminalEvidenceSequence: codexNextLiveEvidenceSequence(),
                activeEvidenceSequence: branchShadow?.activityEventSequence,
                idleConfirmed: codexPrivateBranchIdleConfirmed(threadId, queryThreadId, known)
              }
            )
            this.openParentLiveEpoch(threadId, { preserveLatestTurnRefresh: true })
            codexNoteActivityDecision('branchTerminalDeferred')
            finish(false)
            this.emitParentActivity(threadId)
            return
          }
          codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
          known.lastTurnStatus = turn.status
          known.lastTurnStartedAt = turn.startedAt
          if (turn.id) known.lastTurnId = turn.id
          else delete known.lastTurnId
          if (turn.status === 'completed' && turn.completedAt) known.lastTurnCompletedAt = turn.completedAt
          else delete known.lastTurnCompletedAt
          codexClearAppServerLiveActive(known)
          finish(false)
          if (turn.status === 'completed') this.publishTargetedCompletion(
            known,
            threadId,
            refresh.confirmCompletionEvent ? 'turn-completed' : 'targeted-after-exit',
            queryThreadId
          )
          else {
            const terminalEvidenceSequence = codexMarkConfirmedTerminalEvidence(known, 'targeted-after-exit')
            const branchShadow = this.shadows.get(queryThreadId) || this.sideShadows.get(queryThreadId)
            codexRememberPrivateBranchTerminal(threadId, queryThreadId, turn, 'targeted-after-exit', {
              terminalEvidenceSequence,
              activeEvidenceSequence: branchShadow?.activityEventSequence || known.activeEvidenceSequence,
              idleConfirmed: codexPrivateBranchIdleConfirmed(threadId, queryThreadId, known)
            })
            emitCodexActivityDelta([known], false)
          }
          return
        }
      } catch {}

      const nextDelay = refresh.refreshDelays[refresh.attempt]
      if (typeof nextDelay !== 'number' || Date.now() + nextDelay >= refresh.deadlineAt) {
        finish(true)
        return
      }
      refresh.timer = setTimeout(() => { void run() }, nextDelay)
      refresh.timer.unref?.()
    }

    void run()
  }

  setState(state) {
    if (this.state === state) return
    this.state = state
    emitCodexActivityDelta([...codexActivityInventory.values()].map(codexActivityPublicEntry), false)
  }

  ensure() {
    if (this.closed || this.socket || this.reconnectTimer || this.state === 'incompatible') return
    if (process.platform !== 'darwin') {
      this.setState('failed')
      return
    }
    const endpoint = codexDesktopIpcEndpoint()
    if (!codexDesktopIpcEndpointIsSecure(endpoint)) {
      this.setState(fs.existsSync(endpoint) ? 'failed' : 'not-running')
      this.scheduleReconnect()
      return
    }
    this.setState('connecting')
    this.lastSocketError = ''
    const socket = net.connect(endpoint)
    this.socket = socket
    socket.on('connect', () => this.initialize())
    socket.on('data', (chunk) => this.handleData(chunk))
    socket.on('error', (error) => {
      this.lastSocketError = String(error?.code || '')
    })
    socket.on('close', () => this.handleClose(socket))
  }

  scheduleReconnect() {
    if (this.closed || this.reconnectTimer || this.state === 'incompatible') return
    const delay = Math.min(CODEX_DESKTOP_IPC_RECONNECT_MAX_MS, 250 * (2 ** Math.min(this.reconnectAttempt, 5)))
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.ensure()
    }, delay)
    this.reconnectTimer.unref?.()
  }

  initialize() {
    this.initializeRequestId = crypto.randomUUID()
    this.send({
      type: 'request',
      method: 'initialize',
      requestId: this.initializeRequestId,
      sourceClientId: 'initializing-client',
      version: 0,
      params: { clientType: 'eypc-desktop-companion' }
    })
    this.initializeTimer = setTimeout(() => this.failConnection('failed'), 2_000)
    this.initializeTimer.unref?.()
  }

  send(message, callback) {
    if (!this.socket || !this.socket.writable) return false
    try {
      const body = Buffer.from(JSON.stringify(message), 'utf8')
      if (!body.length || body.length > CODEX_DESKTOP_IPC_FRAME_MAX_BYTES) return false
      const frame = Buffer.allocUnsafe(body.length + 4)
      frame.writeUInt32LE(body.length, 0)
      body.copy(frame, 4)
      this.socket.write(frame, callback)
      return true
    } catch {
      return false
    }
  }

  sendBroadcast(method, params, targetClientIds, callback) {
    const version = CODEX_DESKTOP_IPC_VERSIONS[method]
    if (!Number.isInteger(version) || this.clientId === 'initializing-client') return false
    return this.send({
      type: 'broadcast',
      method,
      sourceClientId: this.clientId,
      ...(Array.isArray(targetClientIds) ? { targetClientIds } : {}),
      params,
      version
    }, callback)
  }

  handleData(chunk) {
    if (!Buffer.isBuffer(chunk) || !chunk.length) return
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      if (this.buffer.length < 4) return
      const length = this.buffer.readUInt32LE(0)
      if (!length || length > CODEX_DESKTOP_IPC_FRAME_MAX_BYTES) {
        this.failConnection('incompatible')
        return
      }
      if (this.buffer.length < length + 4) return
      const payload = this.buffer.subarray(4, length + 4).toString('utf8')
      this.buffer = this.buffer.subarray(length + 4)
      let message
      try { message = JSON.parse(payload) } catch {
        this.failConnection('incompatible')
        return
      }
      this.handleMessage(message)
    }
  }

  handleMessage(value) {
    const message = codexRecord(value)
    if (message.type === 'client-discovery-request') {
      if (typeof message.requestId === 'string') {
        this.send({ type: 'client-discovery-response', requestId: message.requestId, response: { canHandle: false } })
      }
      return
    }
    if (message.type === 'response' && message.requestId === this.initializeRequestId) {
      const result = codexRecord(message.result)
      if (message.resultType !== 'success' || message.method !== 'initialize' || typeof result.clientId !== 'string' || !result.clientId) {
        this.failConnection('incompatible')
        return
      }
      if (this.initializeTimer) clearTimeout(this.initializeTimer)
      this.initializeTimer = null
      this.clientId = result.clientId
      this.reconnectAttempt = 0
      this.setState('connected')
      this.refreshPersistedUnread(false)
      this.followAll(true)
      if (codexActivitySourceFingerprint || companionTaskKernel?.getPackage?.()?.complete === true) {
        ensureCodexInventoryMembershipWatchers({ reconcile: false })
        requestCodexInventoryMembershipReconciliation('desktop-ipc-connected', { forceTasksOnly: true })
      }
      return
    }
    if (message.type !== 'broadcast' || typeof message.method !== 'string') return
    if (Array.isArray(message.targetClientIds) && !message.targetClientIds.includes(this.clientId)) return
    if (!codexDesktopIpcVersionAccepted(message.method, message.version)) {
      this.failConnection('incompatible')
      return
    }
    const params = codexRecord(message.params)
    if (message.method === 'client-status-changed') {
      const clientId = typeof params.clientId === 'string' ? params.clientId : ''
      if (clientId && clientId !== this.clientId) {
        if (params.status === 'connected' || params.connected === true) this.followAll(true, [clientId])
        else if (params.status === 'disconnected' || params.status === 'closed' || params.connected === false) {
          this.dropOwner(clientId)
          this.followAll(true)
        }
      }
      return
    }
    if (message.method === 'thread-stream-following-status-requested') {
      if (params.hostId === 'local' && validCodexThreadId(params.conversationId)) {
        const targetClientIds = typeof message.sourceClientId === 'string' && message.sourceClientId
          ? [message.sourceClientId]
          : undefined
        if (this.inventory.has(params.conversationId)
          || this.shadows.size + this.sideShadows.size < CODEX_DESKTOP_PROVISIONAL_FOLLOW_LIMIT) {
          this.followAny(params.conversationId, true, targetClientIds)
        }
      }
      return
    }
    if (message.method === 'thread-stream-following-changed') {
      const threadId = params.conversationId
      const ownerClientId = typeof message.sourceClientId === 'string' ? message.sourceClientId : ''
      const shadow = validCodexThreadId(threadId)
        ? (this.shadows.get(threadId) || this.sideShadows.get(threadId))
        : null
      const sideParentThreadId = shadow?.sideConversation ? shadow.parentThreadId : ''
      if (params.hostId === 'local' && params.following === false && ownerClientId && validCodexThreadId(threadId)) {
        const ownsShadow = shadow?.ownerClientId === ownerClientId
        const ownsUnread = this.liveUnread.get(threadId)?.ownerClientId === ownerClientId
        if (!ownsShadow && !ownsUnread) return
        const stillInventoried = this.inventory.has(threadId)
          || Boolean(sideParentThreadId && this.inventory.has(sideParentThreadId))
        // Codex Desktop changes its own followed conversation when the user
        // switches tasks. EyPc still follows every inventoried task, so keep
        // the last exact shadow while requesting a replacement snapshot from
        // the same live owner. A real owner disconnect is handled separately
        // by client-status-changed and still drops all of its live authority.
        if (ownsShadow && stillInventoried && this.followAny(threadId, true, [ownerClientId])) {
          runtimeDiagnostics.record({
            level: 'info',
            scope: 'task-recovery',
            event: 'desktop-replacement-snapshot',
            outcome: 'refollowed',
            provider: 'codex',
            taskRef: threadId,
            details: { shadowRetained: true }
          })
          const parentThreadId = sideParentThreadId || threadId
          const known = codexActivityInventory.get(parentThreadId)
          const activity = codexDesktopShadowActivity(shadow)
          const waitingLive = activity?.activeFlags.includes('waitingOnUserInput')
            || activity?.activeFlags.includes('waitingOnApproval')
          // A task switch can race with turn/completed: the refollowed owner may
          // replay the old active snapshot after the completion notification was
          // missed. Confirm that one ambiguous active edge from latest-Turn data.
          if (known
            && activity?.status === 'active'
            && !waitingLive
            && shadow.activityEvidence === 'initial-snapshot'
            && !this.hasExactPositiveActivity(parentThreadId)) {
            this.scheduleLatestTurnRefresh(parentThreadId, {
              verifyStaleActive: true,
              queryThreadId: threadId,
              restart: true
            })
          }
          return
        }
        if (ownsShadow) {
          this.shadows.delete(threadId)
          this.sideShadows.delete(threadId)
        }
        if (ownsUnread) this.liveUnread.delete(threadId)
        const known = codexActivityInventory.get(threadId)
        if (ownsShadow && sideParentThreadId) {
          this.refreshPersistedUnread(false)
          this.emitParentActivity(sideParentThreadId)
          return
        }
        if (known) {
          if (!ownsShadow && shadow) {
            this.publishShadow(threadId, shadow)
            return
          }
          if (ownsShadow) {
            if (sideParentThreadId) this.emitParentActivity(sideParentThreadId)
            else {
              codexRestoreConnectorActivity(known)
            }
          }
          this.refreshPersistedUnread(false)
          emitCodexActivityDelta([known], false)
        }
      }
      // `following=true` announces the sender's own follower state; it is not
      // a request for our state. Only `thread-stream-following-status-requested`
      // asks us to re-announce, otherwise two followers can echo forever.
      return
    }
    if (message.method === 'thread-stream-state-changed') {
      this.handleStreamState(params, message.sourceClientId, message.version)
      return
    }
    if (message.method === 'thread-read-state-changed') {
      this.handleReadState(params, message.sourceClientId)
      return
    }
    if (message.method === 'thread-archived' || message.method === 'thread-unarchived') {
      if (params.hostId === 'local' && validCodexThreadId(params.conversationId)) {
        if (message.method === 'thread-archived'
          && (codexArchiveBridge?.observeNativeAck(params.conversationId, 'desktop', message.sourceClientId) ?? false)) return
        const archivedKey = message.method === 'thread-archived'
          ? codexArchivedActivityKey(params.conversationId)
          : ''
        const sideShadow = this.sideShadows.get(params.conversationId)
        if (message.method === 'thread-archived') {
          if (sideShadow || codexSideParentThreadId(params.conversationId)) {
            codexForgetDesktopOpenedReadThread(params.conversationId)
            this.forgetWaitingState(params.conversationId)
            codexForgetDesktopSideRelation(params.conversationId)
            codexForgetInventorySideRelation(params.conversationId)
          } else {
            codexClearDesktopOpenedRead(this, params.conversationId)
            this.forgetWaitingState(params.conversationId, true)
            codexForgetDesktopSideRelationsForParent(params.conversationId)
            codexForgetInventorySideRelationsForParent(params.conversationId)
          }
          this.sideRecoveryPending.delete(params.conversationId)
          this.persistedUnread.delete(params.conversationId)
        }
        this.shadows.delete(params.conversationId)
        this.sideShadows.delete(params.conversationId)
        this.liveUnread.delete(params.conversationId)
        if (sideShadow?.parentThreadId) this.emitParentActivity(sideShadow.parentThreadId)
        emitCodexActivityDelta([], true, archivedKey ? 'urgent' : 'normal', archivedKey ? [archivedKey] : [])
      }
      return
    }
    if (message.method === 'ipc-connection-reset') {
      this.resetLiveAuthority()
      this.followAll(true)
    }
  }

  handleStreamState(params, ownerClientId, protocolVersion) {
    if (params.hostId !== 'local' || !validCodexThreadId(params.conversationId)) return
    const change = codexRecord(params.change)
    if (change.type === 'snapshot') {
      const previousShadow = this.shadows.get(params.conversationId) || this.sideShadows.get(params.conversationId)
      const waitingState = this.waitingStateFor(params.conversationId)
      const normalizedChange = protocolVersion === 6 && !Number.isInteger(change.revision)
        ? { ...change, revision: previousShadow?.ownerClientId === ownerClientId ? previousShadow.revision + 1 : 1 }
        : change
      const shadow = codexDesktopShadowFromSnapshot(normalizedChange, previousShadow, waitingState)
      if (!shadow) {
        this.scheduleWaitingEdgeRefresh(params.conversationId)
        return
      }
      this.retainCausallyOpenWaitingRequests(params.conversationId, previousShadow, shadow)
      const requestClearSequence = this.recordRemovedWaitingRequests(
        params.conversationId,
        previousShadow?.requests,
        shadow.requests,
        shadow
      )
      this.attachWaitingState(params.conversationId, shadow)
      this.recordRemovedRuntimeWaitingFlags(
        params.conversationId,
        previousShadow?.runtime?.activeFlags,
        shadow.runtime?.activeFlags,
        shadow.requests,
        requestClearSequence,
        shadow
      )
      this.clearStaleWaitingAfterRuntimeResume(
        params.conversationId,
        previousShadow?.runtime,
        shadow.runtime,
        shadow.requests,
        shadow,
        previousShadow?.requests
      )
      this.cancelWaitingEdgeRefresh(params.conversationId)
      shadow.ownerClientId = ownerClientId
      const hintedParentThreadId = codexSideParentThreadId(params.conversationId)
      if (shadow.sideConversation && validCodexThreadId(hintedParentThreadId)) {
        shadow.parentThreadId = hintedParentThreadId
      }
      const recoveryRequested = this.sideRecoveryPending.delete(params.conversationId)
      const recoveringSide = recoveryRequested
        && shadow.sideConversation
        && shadow.parentThreadId === hintedParentThreadId
      if (recoveryRequested && hintedParentThreadId && !recoveringSide && !shadow.sideConversation) {
        codexForgetDesktopSideRelation(params.conversationId)
      }
      const previousActivity = codexDesktopShadowActivity(previousShadow)
      const snapshotActivity = codexDesktopShadowActivity(shadow)
      const sameLiveSemantics = previousActivity?.status === 'active'
        && snapshotActivity?.status === 'active'
        && JSON.stringify(previousActivity.activeFlags || []) === JSON.stringify(snapshotActivity.activeFlags || [])
        && previousActivity.planImplementationOnly === snapshotActivity.planImplementationOnly
      if (sameLiveSemantics
        && previousShadow?.activityEvidence === 'activity-event'
        && Number(previousShadow.activityEventSequence) > 0) {
        shadow.activityEvidence = 'activity-event'
        shadow.activityEventSequence = previousShadow.activityEventSequence
        if (codexTimestampMs(previousShadow.desktopActiveSince)) {
          shadow.desktopActiveSince = previousShadow.desktopActiveSince
        }
      }
      // A Desktop sideConversation snapshot is direct topology evidence and
      // must win over a stale inventory membership race. Otherwise the child
      // is briefly republished as an independent public task.
      if (shadow.sideConversation && validCodexThreadId(shadow.parentThreadId)) {
        codexRememberDesktopSideRelation(params.conversationId, shadow.parentThreadId)
        this.shadows.delete(params.conversationId)
        this.sideShadows.set(params.conversationId, shadow)
        this.publishSideShadow(params.conversationId, shadow)
        this.verifyUncorroboratedActiveSnapshot(params.conversationId, shadow)
        if (recoveringSide && codexDesktopShadowActivity(shadow)?.status !== 'active') {
          this.scheduleLatestTurnRefresh(shadow.parentThreadId, {
            queryThreadId: params.conversationId,
            forceQuery: true,
            restart: true
          })
        }
        const sideActivity = codexDesktopShadowActivity(shadow)
        const exactSideActivity = shadow.activityEvidence === 'activity-event'
          || (sideActivity?.activeFlags || []).some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
        if (sideActivity?.status === 'active'
          && exactSideActivity
          && this.openParentLiveEpoch(shadow.parentThreadId, { preserveLatestTurnRefresh: true })) {
          this.emitParentActivity(shadow.parentThreadId)
        }
      } else if (this.inventory.has(params.conversationId)) {
        this.sideShadows.delete(params.conversationId)
        this.shadows.set(params.conversationId, shadow)
        this.publishShadow(params.conversationId, shadow)
        this.verifyUncorroboratedActiveSnapshot(params.conversationId, shadow)
      } else {
        // Keep an unregistered main-task shadow inside preload until the
        // verified inventory scan supplies its anonymous key and action alias.
        this.shadows.set(params.conversationId, shadow)
        markCodexThreadTurnStatusDirty(params.conversationId)
        emitCodexActivityDelta([], true, 'urgent')
      }
      return
    }
    if (change.type !== 'patches') return
    const shadow = this.shadows.get(params.conversationId) || this.sideShadows.get(params.conversationId)
    const legacyUnrevisioned = protocolVersion === 6
      && !Number.isInteger(change.baseRevision)
      && !Number.isInteger(change.revision)
    const baseRevision = legacyUnrevisioned ? shadow?.revision : change.baseRevision
    const revision = legacyUnrevisioned && Number.isInteger(shadow?.revision)
      ? shadow.revision + 1
      : change.revision
    if (!shadow
      || shadow.ownerClientId !== ownerClientId
      || !Number.isInteger(baseRevision)
      || baseRevision !== shadow.revision
      || !Number.isInteger(revision)
      || revision <= shadow.revision
      || !Array.isArray(change.patches)
      || change.patches.length > 50_000) {
      this.scheduleWaitingEdgeRefresh(params.conversationId)
      return
    }
    const previousActivity = codexDesktopShadowActivity(shadow)
    const wasActive = previousActivity?.status === 'active'
    const previousRuntime = shadow.runtime
      ? { type: shadow.runtime.type, activeFlags: [...(shadow.runtime.activeFlags || [])] }
      : null
    const previousRuntimeFlags = [...(shadow.runtime?.activeFlags || [])]
    const previousRequestState = {
      requests: [...(shadow.requests || [])],
      runtime: previousRuntime,
      requestSetRevision: shadow.requestSetRevision,
      requestSetComplete: shadow.requestSetComplete,
      requestSetAuthority: shadow.requestSetAuthority
    }
    let containsReadStatePatch = false
    let containsActivityPatch = false
    let containsRequestSetPatch = false
    let refreshRuntimeWaitingSequences = false
    for (const patch of change.patches) {
      const patchSource = codexRecord(patch)
      const patchPath = Array.isArray(patchSource.path) ? patchSource.path : []
      if (patchPath[0] === 'hasUnreadTurn') containsReadStatePatch = true
      if (patchPath[0] === 'threadRuntimeStatus' || patchPath[0] === 'requests') containsActivityPatch = true
      if (patchPath[0] === 'requests') containsRequestSetPatch = true
      if (patchPath[0] === 'threadRuntimeStatus'
        && (patchPath.length === 1 || patchPath[1] === 'activeFlags')) {
        refreshRuntimeWaitingSequences = true
      }
      if (!codexApplyDesktopShadowPatch(shadow, patch)) {
        this.scheduleWaitingEdgeRefresh(params.conversationId)
        return
      }
    }
    const retainedOpenRequest = this.retainCausallyOpenWaitingRequests(params.conversationId, previousRequestState, shadow)
    this.cancelWaitingEdgeRefresh(params.conversationId)
    shadow.revision = revision
    if (containsRequestSetPatch && !retainedOpenRequest) {
      shadow.requestSetRevision = codexNextLiveEvidenceSequence()
      shadow.requestSetComplete = true
      shadow.requestSetAuthority = 'provider-live'
    }
    delete shadow.ownerDisconnectedAt
    const nextActivity = codexDesktopShadowActivity(shadow)
    const semanticActivityChanged = previousActivity?.status !== nextActivity?.status
      || JSON.stringify(previousActivity?.activeFlags || []) !== JSON.stringify(nextActivity?.activeFlags || [])
      || previousActivity?.planImplementationOnly !== nextActivity?.planImplementationOnly
    const activityObservedAt = containsActivityPatch && semanticActivityChanged ? Date.now() : 0
    if (containsActivityPatch) {
      shadow.activityRevision = revision
      if (semanticActivityChanged) {
        shadow.activityEvidence = 'activity-event'
        shadow.activityEventSequence = codexNextLiveEvidenceSequence()
        delete shadow.suppressUncorroboratedActive
      }
    }
    const requestClearSequence = this.recordRemovedWaitingRequests(
      params.conversationId,
      previousRequestState.requests,
      shadow.requests,
      shadow,
      shadow.activityEventSequence
    )
    this.recordRemovedRuntimeWaitingFlags(
      params.conversationId,
      previousRuntimeFlags,
      shadow.runtime?.activeFlags,
      shadow.requests,
      requestClearSequence || shadow.activityEventSequence,
      shadow
    )
    this.clearStaleWaitingAfterRuntimeResume(
      params.conversationId,
      previousRuntime,
      shadow.runtime,
      shadow.requests,
      shadow,
      previousRequestState.requests
    )
    const waitingState = this.attachWaitingState(params.conversationId, shadow)
    codexRememberDesktopRequestObservations(waitingState, shadow.requests)
    this.rememberRuntimeWaitingSequences(
      params.conversationId,
      shadow,
      previousRuntimeFlags,
      refreshRuntimeWaitingSequences
    )
    const runtimeEdge = codexReduceWaitingEdge({
      flags: shadow.runtime?.activeFlags,
      previousFlags: previousRuntimeFlags,
      previousWaitingSince: shadow.runtimeWaitingSince,
      evidenceAt: activityObservedAt
    })
    if (runtimeEdge.waitingSince) shadow.runtimeWaitingSince = runtimeEdge.waitingSince
    else delete shadow.runtimeWaitingSince
    const currentActivity = codexDesktopShadowActivity(shadow)
    const isActive = currentActivity?.status === 'active'
    const exactLiveActivityPatch = containsActivityPatch
      && isActive
      && semanticActivityChanged
      && shadow.activityEvidence === 'activity-event'
      && Number(shadow.activityEventSequence) > 0
    if (exactLiveActivityPatch) {
      const evidenceThreadId = shadow.sideConversation ? shadow.parentThreadId : params.conversationId
      const known = codexActivityInventory.get(evidenceThreadId)
      if (known) {
        if (!currentActivity.activeFlags.length) {
          delete known.pendingCompletedPlanItem
          known.connectorPlanImplementationOnly = false
        }
        this.openParentLiveEpoch(evidenceThreadId)
      }
    }
    if (exactLiveActivityPatch) {
      shadow.desktopActiveSince = activityObservedAt
    } else if (!isActive) {
      delete shadow.desktopActiveSince
    }
    const readStateOnly = containsReadStatePatch && !containsActivityPatch
    if (this.sideShadows.has(params.conversationId)) {
      this.publishSideShadow(params.conversationId, shadow, readStateOnly, wasActive && !isActive)
      if (exactLiveActivityPatch) {
        this.verifyUncorroboratedActiveSnapshot(params.conversationId, shadow, { restart: true })
      }
    }
    else this.publishShadow(params.conversationId, shadow, readStateOnly)
  }

  companionInteractionEvidenceForParent(parentThreadId) {
    const known = codexActivityInventory.get(parentThreadId)
    if (!known?.key) return null
    const shadowEntries = []
    const own = this.shadows.get(parentThreadId)
    if (own) shadowEntries.push([parentThreadId, own])
    const relatedChildIds = new Set()
    for (const [childThreadId, relatedParentThreadId] of codexAllSideRelations()) {
      if (relatedParentThreadId === parentThreadId) relatedChildIds.add(childThreadId)
    }
    for (const [childThreadId, shadow] of this.sideShadows) {
      if (shadow.parentThreadId !== parentThreadId) continue
      relatedChildIds.add(childThreadId)
      shadowEntries.push([childThreadId, shadow])
    }
    const complete = Boolean(own?.requestSetComplete === true)
      && [...relatedChildIds].every((childThreadId) => this.sideShadows.get(childThreadId)?.requestSetComplete === true)
    const requestSetRevision = Math.max(
      0,
      ...shadowEntries.flatMap(([, shadow]) => [
        Number(shadow.requestSetRevision) || 0,
        Number(shadow.activityEventSequence) || 0,
        ...Object.values(codexRecord(shadow.runtimeWaitingSequences)).map((value) => Number(value) || 0)
      ])
    )
    if (!requestSetRevision) return null
    const byInstance = new Map()
    for (const [threadId, shadow] of shadowEntries) {
      const branchRef = threadId === parentThreadId
        ? 'root'
        : codexPrivateBranchRef(parentThreadId, threadId)
      const candidates = [
        ...(Array.isArray(shadow.requests) ? shadow.requests : []),
        ...(Array.isArray(shadow.interactionTerminals) ? shadow.interactionTerminals : [])
      ]
      const visibleRequestFlags = new Set()
      for (const request of candidates) {
        const kind = codexDesktopRequestKind(request)
        const interactionRef = typeof request?.interactionRef === 'string' && /^[a-f0-9]{16,64}$/i.test(request.interactionRef)
          ? request.interactionRef.toLowerCase()
          : ''
        if (!kind || !interactionRef) continue
        const terminal = ['resolved', 'cancelled', 'execution-started'].includes(request.interactionState)
        if (!terminal) {
          const flag = codexDesktopRequestFlag(request)
          if (!flag || !codexWaitingEvidenceVisible(shadow.waitingState, flag, request.observedSequence)) continue
          visibleRequestFlags.add(flag)
        }
        const sequence = terminal
          ? Number(request.resolutionSequence) || Number(request.observedSequence) || 0
          : Number(request.observedSequence) || 0
        if (!Number.isSafeInteger(sequence) || sequence <= 0) continue
        const evidence = {
          revision: companionV7Revisions.interaction,
          provider: 'codex',
          taskKey: known.key,
          branchRef,
          interactionRef,
          kind,
          state: terminal ? request.interactionState : 'opened',
          sequence,
          turnEpoch: Number(known.lastTurnStartedAt) || 0,
          requestSetRevision,
          authority: terminal
            ? 'provider-live'
            : shadow.requestSetAuthority === 'provider-live' ? 'provider-live' : 'provider-snapshot',
          exact: request.identityExact === true
        }
        const instanceKey = `${branchRef}\0${interactionRef}`
        const previous = byInstance.get(instanceKey)
        if (!previous || evidence.sequence > previous.sequence
          || evidence.sequence === previous.sequence && terminal && previous.state === 'opened') {
          byInstance.set(instanceKey, evidence)
        }
      }
      for (const flag of Array.isArray(shadow.runtime?.activeFlags) ? shadow.runtime.activeFlags : []) {
        if (visibleRequestFlags.has(flag)) continue
        const sequence = Number(shadow.runtimeWaitingSequences?.[flag]) || 0
        if (!sequence || !codexWaitingEvidenceVisible(shadow.waitingState, flag, sequence)) continue
        const interactionRef = crypto.createHash('sha256')
          .update('codex-runtime-interaction-v1')
          .update('\0')
          .update(branchRef)
          .update('\0')
          .update(flag)
          .update('\0')
          .update(String(sequence))
          .digest('hex')
          .slice(0, 32)
        byInstance.set(`${branchRef}\0${interactionRef}`, {
          revision: companionV7Revisions.interaction,
          provider: 'codex',
          taskKey: known.key,
          branchRef,
          interactionRef,
          kind: flag === 'waitingOnApproval' ? 'approval' : 'user-input',
          state: 'opened',
          sequence,
          turnEpoch: Number(known.lastTurnStartedAt) || 0,
          requestSetRevision,
          authority: shadow.activityEvidence === 'activity-event' ? 'provider-live' : 'provider-snapshot',
          exact: true
        })
      }
    }
    return {
      taskKey: known.key,
      requestSetRevision,
      interactions: [...byInstance.values()],
      interactionSets: complete ? [{
        revision: companionV7Revisions.interaction,
        provider: 'codex',
        taskKey: known.key,
        requestSetRevision,
        complete: true
      }] : []
    }
  }

  publishShadow(threadId, shadow, readStateOnly = false) {
    const known = codexActivityInventory.get(threadId)
    const activity = honorHostExternalProjection(threadId, known, codexDesktopShadowActivity(shadow))
    if (!known || !activity) return
    codexRecordDesktopShadowInventoryBaseline(shadow, known)
    const previousStatus = known.status
    const desktopEvidence = shadow.activityEvidence === 'activity-event' ? 'activity-event' : 'initial-snapshot'
    const desktopInactiveSupersedes = desktopEvidence === 'activity-event'
      && activity.status !== 'active'
      && codexDesktopActivitySupersedesAppServer(known, [shadow])
    if (desktopInactiveSupersedes) codexClearAppServerLiveActive(known)
    const appServerActive = codexAppServerActiveDominates(known, [shadow])
    known.status = appServerActive ? 'active' : activity.status
    known.activeFlags = appServerActive ? [...known.connectorActiveFlags] : activity.activeFlags
    known.planImplementationOnly = !appServerActive && activity.planImplementationOnly === true
    known.statusAuthority = appServerActive ? 'app-server-live' : 'desktop-live'
    known.activityEvidence = appServerActive ? 'activity-event' : desktopEvidence
    known.activityRevision = shadow.activityRevision
    if (known.status === 'active') {
      const sequence = appServerActive
        ? Number(known.appServerLiveSequence) || 0
        : Math.max(
            Number(shadow.activityEventSequence) || 0,
            codexInventorySnapshotLiveSequence(threadId, threadId, known, shadow)
          )
      if (sequence) known.activeEvidenceSequence = Math.max(Number(known.activeEvidenceSequence) || 0, sequence)
    }
    if (appServerActive && codexTimestampMs(known.connectorWaitingSince)) known.waitingSince = known.connectorWaitingSince
    else if (!appServerActive && activity.waitingSince) known.waitingSince = activity.waitingSince
    else delete known.waitingSince
    if (activity.desktopActiveSince) known.desktopActiveSince = activity.desktopActiveSince
    else delete known.desktopActiveSince
    let unreadIds = null
    try { unreadIds = readCodexDesktopUnreadIds() } catch {}
    const unread = codexDesktopUnreadObservation(this, known, threadId, shadow, unreadIds)
    known.hasUnreadTurn = unread.hasUnreadTurn
    known.unreadAuthority = unread.unreadAuthority
    this.emitParentActivity(threadId, previousStatus, readStateOnly)
  }

  emitParentActivity(parentThreadId, previousStatus, readStateOnly = false, exitQueryThreadId = '') {
    const known = codexActivityInventory.get(parentThreadId)
    if (!known) return
    const priorStatus = previousStatus || known.status
    const own = honorHostExternalProjection(parentThreadId, known, codexDesktopShadowActivity(this.shadows.get(parentThreadId))) || {
      status: known.connectorStatus,
      activeFlags: [...known.connectorActiveFlags],
      ...(codexTimestampMs(known.connectorWaitingSince) ? { waitingSince: known.connectorWaitingSince } : {})
    }
    const childEntries = [...this.sideShadows.entries()].filter(([, shadow]) => shadow.parentThreadId === parentThreadId)
    const children = childEntries.map(([, shadow]) => shadow)
    const childActivities = children.map(codexDesktopShadowActivity).filter(Boolean)
    if (known.connectorPlanImplementationOnly === true) {
      childActivities.push({
        status: 'active',
        activeFlags: ['waitingOnUserInput'],
        planImplementationOnly: true,
        ...(codexTimestampMs(known.connectorWaitingSince) ? { waitingSince: known.connectorWaitingSince } : {})
      })
    }
    const evidenceShadows = [this.shadows.get(parentThreadId), ...children].filter(Boolean)
    for (const shadow of evidenceShadows) codexRecordDesktopShadowInventoryBaseline(shadow, known)
    const desktopActivityEvent = evidenceShadows.some((shadow) => shadow.activityEvidence === 'activity-event')
    let projection = codexResolveParentActivity(own, childActivities, {
      appServerActive: codexAppServerActiveDominates(known, evidenceShadows),
      connectorActivity: known
    })
    const desktopInactiveSupersedes = desktopActivityEvent
      && !projection.hasActive
      && !projection.hasInput
      && !projection.hasApproval
      && codexDesktopActivitySupersedesAppServer(known, evidenceShadows)
    if (desktopInactiveSupersedes) {
      codexClearAppServerLiveActive(known)
      projection = codexResolveParentActivity(own, childActivities, {
        appServerActive: false,
        connectorActivity: known
      })
    }
    const { status, activeFlags, waitingSince, desktopActiveSince } = projection
    known.status = status
    known.activeFlags = activeFlags
    known.planImplementationOnly = projection.planImplementationOnly === true
    known.statusAuthority = projection.appServerActive ? 'app-server-live' : 'desktop-live'
    known.activityEvidence = projection.appServerActive || evidenceShadows.some((shadow) => shadow.activityEvidence === 'activity-event')
      ? 'activity-event'
      : 'initial-snapshot'
    known.activityRevision = Math.max(0, ...evidenceShadows.map((shadow) => Number.isInteger(shadow.activityRevision) ? shadow.activityRevision : 0))
    if (known.status === 'active') {
      known.idleConfirmed = false
      const sequence = Math.max(
        projection.appServerActive ? Number(known.appServerLiveSequence) || 0 : 0,
        codexInventorySnapshotLiveSequence(
          parentThreadId,
          parentThreadId,
          known,
          this.shadows.get(parentThreadId)
        ),
        ...evidenceShadows.map((shadow) => Number(shadow.activityEventSequence) || 0)
      )
      if (sequence) known.activeEvidenceSequence = Math.max(Number(known.activeEvidenceSequence) || 0, sequence)
    }
    if (waitingSince) known.waitingSince = waitingSince
    else delete known.waitingSince
    if (desktopActiveSince) known.desktopActiveSince = desktopActiveSince
    else delete known.desktopActiveSince
    const ownShadow = this.shadows.get(parentThreadId)
    let unreadIds = null
    try { unreadIds = readCodexDesktopUnreadIds() } catch {}
    const unread = codexDesktopAggregateUnread(
      this,
      known,
      parentThreadId,
      ownShadow,
      childEntries,
      unreadIds
    )
    known.hasUnreadTurn = unread.hasUnreadTurn
    known.unreadAuthority = unread.unreadAuthority
    const waitingLive = status === 'active'
      && (activeFlags.includes('waitingOnUserInput') || activeFlags.includes('waitingOnApproval'))
    const openedWaitingEpoch = waitingLive
      && known.lastTurnStatus !== 'inProgress'
      && this.openParentLiveEpoch(parentThreadId)
    emitCodexActivityDelta(
      [readStateOnly && !openedWaitingEpoch ? { ...known, readStateOnly: true } : known],
      false,
      'normal',
      [],
      { interactionEvidence: this.companionInteractionEvidenceForParent(parentThreadId) }
    )
    if (status === 'active') {
      if (!waitingLive && (known.lastTurnStatus === 'completed'
        || priorStatus !== 'active' && known.lastTurnStatus !== 'inProgress')) {
        for (const [evidenceThreadId, shadow] of [
          [parentThreadId, this.shadows.get(parentThreadId)],
          ...childEntries
        ]) {
          this.verifyUncorroboratedActiveSnapshot(evidenceThreadId, shadow)
        }
      } else if (waitingLive) {
        this.cancelLatestTurnRefresh(parentThreadId)
      }
    } else if (priorStatus === 'active') {
      const cachedCompleted = codexApplyCachedCompletedTurnEvidence(known, parentThreadId)
      const confirmedCompletion = known.lastTurnStatus === 'completed'
        && codexIsConfirmedTurnEvidence(known.lastTurnEvidence)
      if (cachedCompleted || confirmedCompletion) this.publishTargetedCompletion(known, parentThreadId)
      else this.scheduleLatestTurnRefresh(parentThreadId, {
        queryThreadId: validCodexThreadId(exitQueryThreadId) ? exitQueryThreadId : parentThreadId
      })
    }
  }

  publishSideShadow(threadId, shadow, readStateOnly = false, exitedActive = false) {
    if (!shadow?.parentThreadId || !this.sideShadows.has(threadId)) return
    this.emitParentActivity(shadow.parentThreadId, undefined, readStateOnly, exitedActive ? threadId : '')
  }

  handleReadState(params, ownerClientId) {
    // v1 Codex editor-extension broadcasts are local-only and omit hostId;
    // v2 Desktop broadcasts may include it. Reject only an explicit non-local
    // host so both real producers reach the same exact read-state path.
    if (params.hostId !== undefined && params.hostId !== 'local') return
    if (!validCodexThreadId(params.conversationId) || typeof params.hasUnreadTurn !== 'boolean') return
    const known = codexActivityInventory.get(params.conversationId)
    const ownShadow = this.shadows.get(params.conversationId)
    const sideShadow = this.sideShadows.get(params.conversationId)
    if (!known && !ownShadow && !sideShadow) return
    if (sideShadow) {
      sideShadow.hasUnreadTurn = params.hasUnreadTurn
      this.liveUnread.set(params.conversationId, {
        ownerClientId: typeof ownerClientId === 'string' && ownerClientId ? ownerClientId : 'desktop-live',
        hasUnreadTurn: params.hasUnreadTurn,
        unreadEvidence: 'event'
      })
      this.emitParentActivity(sideShadow.parentThreadId, undefined, true)
      this.reconcileLateUnread(sideShadow.parentThreadId, params.hasUnreadTurn, params.conversationId)
      return
    }
    this.liveUnread.set(params.conversationId, {
      ownerClientId: typeof ownerClientId === 'string' && ownerClientId ? ownerClientId : 'desktop-live',
      hasUnreadTurn: params.hasUnreadTurn,
      unreadEvidence: 'event'
    })
    if (ownShadow) {
      ownShadow.hasUnreadTurn = params.hasUnreadTurn
      ownShadow.unreadEvidence = 'event'
    }
    if (!known) return
    known.hasUnreadTurn = codexDesktopOpenedReadAcknowledgements.has(params.conversationId)
      ? false
      : params.hasUnreadTurn
    known.unreadAuthority = 'desktop-live'
    emitCodexActivityDelta([{ ...known, readStateOnly: true }], false)
    this.reconcileLateUnread(params.conversationId, params.hasUnreadTurn, params.conversationId)
  }

  markThreadOpenedRead(parentThreadId, targetThreadId = parentThreadId) {
    if (!validCodexThreadId(parentThreadId)) return false
    const known = codexActivityInventory.get(parentThreadId)
    this.cancelCompletionUnreadRefresh(parentThreadId)
    const relatedThreadIds = new Set([parentThreadId])
    if (validCodexThreadId(targetThreadId)) relatedThreadIds.add(targetThreadId)
    for (const [threadId, shadow] of this.sideShadows) {
      if (shadow.parentThreadId === parentThreadId) relatedThreadIds.add(threadId)
    }
    for (const [threadId, relatedParentThreadId] of codexAllSideRelations()) {
      if (relatedParentThreadId === parentThreadId) relatedThreadIds.add(threadId)
    }
    for (const threadId of relatedThreadIds) {
      codexRememberDesktopOpenedRead(threadId, parentThreadId, known)
      this.liveUnread.set(threadId, {
        ownerClientId: 'eypc-open',
        hasUnreadTurn: false,
        unreadEvidence: 'event'
      })
      const shadow = this.shadows.get(threadId) || this.sideShadows.get(threadId)
      if (shadow) {
        shadow.hasUnreadTurn = false
        shadow.unreadEvidence = 'event'
      }
    }
    if (!known) return false
    this.emitParentActivity(parentThreadId, undefined, true)
    return true
  }

  reconcileLateUnread(threadId, hasUnreadTurn, queryThreadId = threadId, options = {}) {
    if (hasUnreadTurn !== true || !validCodexThreadId(threadId)) return
    const known = codexActivityInventory.get(threadId)
    if (!known) return
    const forceTerminalCheck = options.forceTerminalCheck === true
    if (known.status === 'active') {
      if (!forceTerminalCheck && known.lastTurnEvidence === 'turn-started') return
      const ownShadow = this.shadows.get(threadId)
      const inventorySnapshotLive = codexInventorySnapshotLiveSequence(
        threadId,
        threadId,
        known,
        ownShadow
      ) > 0
      // A real-time Turn/activity event is newer than a late unread signal.
      // A cold inventory+snapshot corroboration is only a restart baseline;
      // a later unread edge must re-check that branch instead of preserving
      // the baseline forever.
      if (!forceTerminalCheck && this.hasExactPositiveActivity(threadId) && !inventorySnapshotLive) return
      const waitingLive = Array.isArray(known.activeFlags)
        && known.activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
      if (!forceTerminalCheck
        && (waitingLive || known.lastTurnStatus === 'completed' && codexIsConfirmedTurnEvidence(known.lastTurnEvidence))) return
      if (known.lastTurnStatus === 'completed' && ownShadow?.activityEvidence === 'initial-snapshot') {
        this.verifyUncorroboratedActiveSnapshot(threadId, ownShadow, { restart: true })
      }
      else this.scheduleLatestTurnRefresh(threadId, {
        verifyStaleActive: true,
        forceQuery: forceTerminalCheck,
        queryThreadId,
        confirmCurrentTerminal: known.lastTurnStatus === 'completed',
        recheckInventorySnapshot: inventorySnapshotLive,
        restart: true
      })
      return
    }
    if (known.lastTurnStatus === 'completed') return
    this.scheduleLatestTurnRefresh(threadId)
  }

  follow(threadId, following, targetClientIds) {
    if (!this.inventory.has(threadId) && following) return false
    return this.followAny(threadId, following, targetClientIds)
  }

  followAny(threadId, following, targetClientIds) {
    if (!validCodexThreadId(threadId)) return false
    return this.sendBroadcast('thread-stream-following-changed', {
      hostId: 'local',
      conversationId: threadId,
      following: following === true
    }, targetClientIds)
  }

  followAll(following, targetClientIds) {
    if (this.state !== 'connected') return
    for (const threadId of this.inventory) this.follow(threadId, following, targetClientIds)
    for (const [threadId, parentThreadId] of codexAllSideRelations()) {
      if (!this.inventory.has(parentThreadId)) continue
      if (following && !this.sideShadows.has(threadId)) this.sideRecoveryPending.add(threadId)
      this.followAny(threadId, following, targetClientIds)
    }
  }

  resubscribe(threadId) {
    // Instrumented because the error memory guarding this path counts
    // resubscribe activity to tell stream-continuity failure apart from real
    // task deletion — and an unlogged path makes "no events" prove nothing.
    runtimeDiagnostics.record({
      level: 'info',
      scope: 'task-recovery',
      event: 'desktop-resubscribe',
      outcome: 'shadow-rebuilt',
      provider: 'codex',
      taskRef: threadId,
      details: { inventorySize: this.inventory.size }
    })
    const mainShadow = this.shadows.get(threadId)
    const sideShadow = this.sideShadows.get(threadId)
    const stickyShadow = mainShadow || sideShadow
    const preserveWaiting = codexDesktopHasStickyPendingRequest(stickyShadow)
    if (preserveWaiting) {
      const parentThreadId = sideShadow?.parentThreadId || threadId
      this.markOwnerDisconnected(stickyShadow, codexActivityInventory.get(parentThreadId))
    } else {
      this.shadows.delete(threadId)
      this.sideShadows.delete(threadId)
    }
    this.liveUnread.delete(threadId)
    this.refreshPersistedUnread(false)
    if (sideShadow?.parentThreadId) this.emitParentActivity(sideShadow.parentThreadId)
    else if (preserveWaiting) this.publishShadow(threadId, mainShadow)
    else this.restoreConnectorAuthority(threadId)
    this.followAny(threadId, false)
    this.followAny(threadId, true)
  }

  markOwnerDisconnected(shadow, known) {
    if (!shadow) return
    codexRecordDesktopShadowInventoryBaseline(shadow, known)
    shadow.ownerDisconnectedAt = Date.now()
  }

  clearOrphanedPending(parentThreadId) {
    if (!validCodexThreadId(parentThreadId)) return false
    let changed = false
    const ownShadow = this.shadows.get(parentThreadId)
    if (ownShadow?.ownerDisconnectedAt) {
      this.shadows.delete(parentThreadId)
      changed = true
    }
    for (const [threadId, shadow] of this.sideShadows) {
      if (shadow.parentThreadId !== parentThreadId || !shadow.ownerDisconnectedAt) continue
      this.sideShadows.delete(threadId)
      this.sideRecoveryPending.delete(threadId)
      changed = true
    }
    if (!changed) return false
    const known = codexActivityInventory.get(parentThreadId)
    if (known) {
      codexRestoreConnectorActivity(known)
      known.activityEvidence = 'connector'
    }
    return true
  }

  discardSupersededOrphanedPending() {
    for (const [threadId, shadow] of this.shadows) {
      const known = codexActivityInventory.get(threadId)
      if (!codexDesktopOrphanedPendingSuperseded(shadow, known)) continue
      this.shadows.delete(threadId)
    }
    for (const [threadId, shadow] of this.sideShadows) {
      const known = codexActivityInventory.get(shadow.parentThreadId)
      if (!codexDesktopOrphanedPendingSuperseded(shadow, known)) continue
      this.sideShadows.delete(threadId)
      this.sideRecoveryPending.delete(threadId)
    }
  }

  dropOwner(clientId) {
    const affected = new Set()
    const affectedParents = new Set()
    const retainedParents = new Set()
    for (const [threadId, shadow] of this.shadows) {
      if (shadow.ownerClientId !== clientId) continue
      const known = codexActivityInventory.get(threadId)
      if (codexDesktopHasStickyPendingRequest(shadow)) {
        this.markOwnerDisconnected(shadow, known)
        retainedParents.add(threadId)
        continue
      }
      this.shadows.delete(threadId)
      if (!known) continue
      codexRestoreConnectorActivity(known)
      affected.add(threadId)
    }
    for (const [threadId, shadow] of this.sideShadows) {
      if (shadow.ownerClientId !== clientId) continue
      const known = codexActivityInventory.get(shadow.parentThreadId)
      if (codexDesktopHasStickyPendingRequest(shadow)) {
        this.markOwnerDisconnected(shadow, known)
        if (shadow.parentThreadId) retainedParents.add(shadow.parentThreadId)
        continue
      }
      this.sideShadows.delete(threadId)
      if (shadow.parentThreadId) affectedParents.add(shadow.parentThreadId)
    }
    for (const [threadId, unread] of this.liveUnread) {
      if (unread.ownerClientId !== clientId) continue
      this.liveUnread.delete(threadId)
      affected.add(threadId)
    }
    for (const threadId of [...affected]) {
      const shadow = this.shadows.get(threadId)
      if (!shadow) continue
      this.publishShadow(threadId, shadow)
      affected.delete(threadId)
    }
    if (!affected.size && !affectedParents.size && !retainedParents.size) return
    this.refreshPersistedUnread(false)
    emitCodexActivityDelta([...affected].map((threadId) => codexActivityInventory.get(threadId)).filter(Boolean), false)
    for (const parentThreadId of new Set([...affectedParents, ...retainedParents])) this.emitParentActivity(parentThreadId)
  }

  restoreConnectorAuthority(threadId) {
    const known = codexActivityInventory.get(threadId)
    if (!known) return
    codexRestoreConnectorActivity(known)
    emitCodexActivityDelta([codexActivityPublicEntry(known)], false)
  }

  refreshPersistedUnread(emit = true) {
    let unreadIds = null
    try { unreadIds = readCodexDesktopUnreadIds() } catch {}
    const changed = []
    for (const threadId of this.inventory) {
      const known = codexActivityInventory.get(threadId)
      if (!known) continue
      const shadow = this.shadows.get(threadId)
      // CodexHost external conversations are absent from the official unread
      // atom by design; deriving their connector unread from it stomps the
      // Host-written value the inventory merge just recorded (RAW-190: Host
      // unread is not overwritten by the official atom).
      const externalUnreadOwner = codexhostDiscovery?.isExternalThreadId?.(threadId) === true
      const connectorHasUnreadTurn = unreadIds instanceof Set && !externalUnreadOwner
        ? unreadIds.has(threadId)
        : known.connectorHasUnreadTurn === true
      let persistedBecameTrueQuery = Boolean(unreadIds)
        && this.persistedUnread.get(threadId) !== true
        && connectorHasUnreadTurn
        ? threadId
        : ''
      if (unreadIds instanceof Set && !externalUnreadOwner) {
        this.persistedUnread.set(threadId, connectorHasUnreadTurn)
        known.connectorHasUnreadTurn = connectorHasUnreadTurn
        known.connectorUnreadAuthority = 'desktop-persisted'
      }
      const childEntries = [...this.sideShadows.entries()]
        .filter(([, sideShadow]) => sideShadow.parentThreadId === threadId)
      for (const [childThreadId, parentThreadId] of codexInventorySideRelations) {
        if (parentThreadId === threadId && !childEntries.some(([candidate]) => candidate === childThreadId)) {
          childEntries.push([childThreadId, null])
        }
      }
      if (unreadIds) {
        for (const [childThreadId] of childEntries) {
          const childHasUnreadTurn = unreadIds.has(childThreadId)
          if (!persistedBecameTrueQuery
            && this.persistedUnread.get(childThreadId) !== true
            && childHasUnreadTurn) persistedBecameTrueQuery = childThreadId
          this.persistedUnread.set(childThreadId, childHasUnreadTurn)
        }
      }
      const observation = codexDesktopAggregateUnread(
        this,
        known,
        threadId,
        shadow,
        childEntries,
        unreadIds
      )
      if (known.hasUnreadTurn === observation.hasUnreadTurn && known.unreadAuthority === observation.unreadAuthority) {
        if (persistedBecameTrueQuery) this.reconcileLateUnread(threadId, true, persistedBecameTrueQuery, { forceTerminalCheck: true })
        continue
      }
      known.hasUnreadTurn = observation.hasUnreadTurn
      known.unreadAuthority = observation.unreadAuthority
      changed.push(codexActivityPublicEntry({ ...known, readStateOnly: true }))
      this.reconcileLateUnread(threadId, observation.hasUnreadTurn, persistedBecameTrueQuery || threadId, {
        forceTerminalCheck: Boolean(persistedBecameTrueQuery)
      })
    }
    if (emit && changed.length) emitCodexActivityDelta(changed, false)
  }

  ensureUnreadStateWatcher() {
    if (!this.inventory.size || this.closed) return
    const { primary } = codexNativeStatePaths()
    if (this.unreadStateWatchPath && this.unreadStateWatchPath !== primary) this.closeUnreadStateWatcher()
    this.unreadStateWatchPath = primary
    if (!this.unreadStateStatWatcherActive && typeof fs.watchFile === 'function') {
      try {
        fs.watchFile(primary, {
          persistent: false,
          interval: CODEX_NATIVE_STATE_RECOVERY_INTERVAL_MS
        }, () => {
          if (this.closed || !this.inventory.size || this.unreadStateWatchPath !== primary) return
          this.refreshPersistedUnread(true)
          if (!this.unreadStateWatcher) {
            this.unreadStateWatcherRetryAvailable = true
            this.ensureUnreadStateDirectoryWatcher(primary)
          }
        })
        this.unreadStateStatWatcherActive = true
        runtimeDiagnostics.record({
          level: 'debug',
          scope: 'codex-unread-watcher',
          event: 'stat-recovery',
          outcome: 'installed',
          count: CODEX_NATIVE_STATE_RECOVERY_INTERVAL_MS
        })
      } catch {
        this.unreadStateStatWatcherActive = false
        runtimeDiagnostics.record({
          level: 'error',
          scope: 'codex-unread-watcher',
          event: 'stat-recovery',
          outcome: 'failed',
          code: 'watch-file-install-failed'
        })
      }
    }
    this.ensureUnreadStateDirectoryWatcher(primary)
  }

  ensureUnreadStateDirectoryWatcher(primary = this.unreadStateWatchPath) {
    if (this.unreadStateWatcher || !this.inventory.size || this.closed
      || !primary || typeof fs.watch !== 'function') return
    try {
      this.unreadStateWatcher = fs.watch(path.dirname(primary), { persistent: false }, (_event, filename) => {
        if (filename && String(filename) !== path.basename(primary)) return
        this.unreadStateWatcherRetryAvailable = true
        if (!this.closed) this.refreshPersistedUnread(true)
      })
      this.unreadStateWatcher.unref?.()
      const watcher = this.unreadStateWatcher
      watcher.on?.('error', () => {
        if (this.unreadStateWatcher !== watcher) return
        try { watcher.close() } catch {}
        this.unreadStateWatcher = null
        runtimeDiagnostics.record({
          level: 'error',
          scope: 'codex-unread-watcher',
          event: 'directory-watch',
          outcome: 'failed',
          code: 'watch-error'
        })
        if (!this.unreadStateWatcherRetryAvailable) return
        this.unreadStateWatcherRetryAvailable = false
        queueMicrotask(() => {
          if (!this.closed && this.inventory.size && !this.unreadStateWatcher) {
            this.ensureUnreadStateDirectoryWatcher(primary)
          }
        })
      })
    } catch {
      this.unreadStateWatcher = null
      runtimeDiagnostics.record({
        level: 'error',
        scope: 'codex-unread-watcher',
        event: 'directory-watch',
        outcome: 'failed',
        code: 'watch-install-failed'
      })
    }
  }

  closeUnreadStateWatcher() {
    try { this.unreadStateWatcher?.close() } catch {}
    this.unreadStateWatcher = null
    if (this.unreadStateStatWatcherActive && this.unreadStateWatchPath && typeof fs.unwatchFile === 'function') {
      try { fs.unwatchFile(this.unreadStateWatchPath) } catch {}
    }
    this.unreadStateStatWatcherActive = false
    this.unreadStateWatchPath = ''
    this.unreadStateWatcherRetryAvailable = true
  }

  resetLiveAuthority() {
    this.clearLatestTurnRefreshes()
    this.clearWaitingEdgeRefreshes()
    const retainedParents = new Set()
    for (const [threadId, shadow] of this.shadows) {
      const known = codexActivityInventory.get(threadId)
      if (codexDesktopHasStickyPendingRequest(shadow)) {
        this.markOwnerDisconnected(shadow, known)
        retainedParents.add(threadId)
      } else this.shadows.delete(threadId)
    }
    for (const [threadId, shadow] of this.sideShadows) {
      const known = codexActivityInventory.get(shadow.parentThreadId)
      if (codexDesktopHasStickyPendingRequest(shadow)) {
        this.markOwnerDisconnected(shadow, known)
        if (shadow.parentThreadId) retainedParents.add(shadow.parentThreadId)
      } else this.sideShadows.delete(threadId)
    }
    this.sideRecoveryPending.clear()
    this.liveUnread.clear()
    const changed = []
    for (const threadId of this.inventory) {
      const known = codexActivityInventory.get(threadId)
      if (!known) continue
      if (retainedParents.has(threadId)) continue
      codexRestoreConnectorActivity(known)
      changed.push(known)
    }
    this.refreshPersistedUnread(false)
    emitCodexActivityDelta(changed, false)
    for (const parentThreadId of retainedParents) this.emitParentActivity(parentThreadId)
  }

  updateInventory(threadIds, options = {}) {
    const next = new Set([...threadIds].filter(validCodexThreadId))
    const previous = this.inventory
    if (this.state === 'connected') {
      for (const threadId of this.inventory) if (!next.has(threadId)) this.follow(threadId, false)
    }
    for (const [threadId, shadow] of this.shadows) {
      if (next.has(threadId)) continue
      const pendingLiveRegistration = !previous.has(threadId)
        && codexDesktopShadowActivity(shadow)?.status === 'active'
      if (!pendingLiveRegistration) this.shadows.delete(threadId)
    }
    for (const threadId of this.liveUnread.keys()) if (!next.has(threadId)) this.liveUnread.delete(threadId)
    for (const threadId of this.persistedUnread.keys()) {
      const sideParentThreadId = codexSideParentThreadId(threadId)
      if (!next.has(threadId) && !(sideParentThreadId && next.has(sideParentThreadId))) {
        this.persistedUnread.delete(threadId)
      }
    }
    for (const [refreshKey, refresh] of [...this.turnRefreshes]) {
      if (!next.has(refresh.parentThreadId)) this.cancelLatestTurnRefreshByKey(refreshKey)
    }
    for (const threadId of [...this.waitingEdgeRefreshes.keys()]) {
      const sideParentThreadId = this.sideShadows.get(threadId)?.parentThreadId
      if (!next.has(threadId) && !(sideParentThreadId && next.has(sideParentThreadId))) {
        this.cancelWaitingEdgeRefresh(threadId)
      }
    }
    for (const threadId of this.unreadRefreshes.keys()) if (!next.has(threadId)) this.cancelCompletionUnreadRefresh(threadId)
    for (const [threadId, shadow] of this.sideShadows) {
      if (next.has(shadow.parentThreadId)) continue
      this.sideShadows.delete(threadId)
      this.sideRecoveryPending.delete(threadId)
      if (this.state === 'connected') this.followAny(threadId, false)
    }
    if (options.preserveSideRelations !== true) {
      for (const [threadId, parentThreadId] of codexAllSideRelations()) {
        if (next.has(parentThreadId)) continue
        if (this.state === 'connected') this.followAny(threadId, false)
        this.sideRecoveryPending.delete(threadId)
        this.persistedUnread.delete(threadId)
        if (codexDesktopSideRelations.has(threadId)) codexForgetDesktopSideRelation(threadId)
        if (codexInventorySideRelations.has(threadId)) codexForgetInventorySideRelation(threadId)
      }
      for (const threadId of [...this.waitingStates.keys()]) {
        const parentThreadId = this.sideShadows.get(threadId)?.parentThreadId
          || codexSideParentThreadId(threadId)
        if (!next.has(threadId) && !(parentThreadId && next.has(parentThreadId))) {
          this.waitingStates.delete(threadId)
        }
      }
    }
    this.inventory = next
    this.discardSupersededOrphanedPending()
    this.refreshPersistedUnread(false)
    if (next.size) this.ensureUnreadStateWatcher()
    else this.closeUnreadStateWatcher()
    this.ensure()
    for (const [threadId, shadow] of this.shadows) {
      if (next.has(threadId)) {
        this.publishShadow(threadId, shadow)
        this.verifyUncorroboratedActiveSnapshot(threadId, shadow)
      }
    }
    const sideParents = new Set()
    for (const [threadId, shadow] of this.sideShadows) {
      if (!next.has(shadow.parentThreadId)) continue
      sideParents.add(shadow.parentThreadId)
      this.verifyUncorroboratedActiveSnapshot(threadId, shadow)
    }
    for (const parentThreadId of sideParents) this.emitParentActivity(parentThreadId)
    if (this.state === 'connected') {
      for (const threadId of next) if (!previous.has(threadId)) this.follow(threadId, true)
      for (const [threadId, parentThreadId] of codexAllSideRelations()) {
        if (!next.has(parentThreadId) || this.sideShadows.has(threadId)) continue
        const relationIsNew = !previous.has(parentThreadId)
          || !this.sideRecoveryPending.has(threadId)
        if (!relationIsNew) continue
        this.sideRecoveryPending.add(threadId)
        this.followAny(threadId, true)
      }
    }
  }

  activityForThread(threadId) {
    if (this.state !== 'connected') return null
    const shadow = this.shadows.get(threadId)
    return shadow ? codexDesktopShadowActivity(shadow) : null
  }

  parentThreadIdFor(threadId) {
    if (!validCodexThreadId(threadId)) return ''
    const parentThreadId = this.sideShadows.get(threadId)?.parentThreadId
      || codexSideParentThreadId(threadId)
      || threadId
    return validCodexThreadId(parentThreadId) ? parentThreadId : threadId
  }

  notifyThreadArchived(threadId, cwd) {
    if (this.state === 'incompatible') return Promise.resolve('incompatible')
    if (this.state === 'not-running') return Promise.resolve('not-running')
    if (this.state !== 'connected' || !this.socket?.writable) return Promise.resolve('failed')
    return new Promise((resolve) => {
      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve(value)
      }
      const timeout = setTimeout(() => finish('failed'), 1_000)
      const sent = this.sendBroadcast('thread-archived', {
        hostId: 'local',
        conversationId: threadId,
        cwd: typeof cwd === 'string' ? cwd : ''
      }, undefined, () => finish('dispatched'))
      if (!sent) finish('failed')
    })
  }

  failConnection(state) {
    this.resetLiveAuthority()
    this.setState(state)
    try { this.socket?.destroy() } catch {}
  }

  handleClose(socket) {
    if (this.socket !== socket) return
    if (this.initializeTimer) clearTimeout(this.initializeTimer)
    this.initializeTimer = null
    this.socket = null
    this.buffer = Buffer.alloc(0)
    this.clientId = 'initializing-client'
    if (this.closed) return
    this.resetLiveAuthority()
    if (this.state !== 'incompatible') {
      this.setState(this.lastSocketError === 'ENOENT' || this.lastSocketError === 'ECONNREFUSED' ? 'not-running' : 'failed')
      this.scheduleReconnect()
    }
  }

  dispose() {
    this.closed = true
    this.clearLatestTurnRefreshes()
    this.clearWaitingEdgeRefreshes()
    this.closeUnreadStateWatcher()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.initializeTimer) clearTimeout(this.initializeTimer)
    this.reconnectTimer = null
    this.initializeTimer = null
    if (this.state === 'connected') this.followAll(false)
    try { this.socket?.destroy() } catch {}
    this.socket = null
    this.shadows.clear()
    this.sideShadows.clear()
    this.sideRecoveryPending.clear()
    this.liveUnread.clear()
    this.persistedUnread.clear()
    this.waitingStates.clear()
    this.state = 'not-checked'
  }
}

function codexEnsureDesktopBridge() {
  codexRestoreDesktopSideRelationHints()
  if (!codexDesktopBridge || codexDesktopBridge.closed) codexDesktopBridge = new CodexDesktopCompanionBridge()
  codexDesktopBridge.ensure()
  return codexDesktopBridge
}

function closeCodexDesktopBridge() {
  codexDesktopBridge?.dispose()
  codexDesktopBridge = null
}

function resetCodexThreadSessionState(options = {}) {
  codexThreadActions.clear()
  codexProjectActions.clear()
  codexActivityInventory = new Map()
  codexActivitySourceFingerprint = ''
  codexActivityGeneration += 1
  codexActivitySemanticFingerprints.clear()
  codexInteractionSemanticFingerprints.clear()
  codexActivityBridgeFingerprint = ''
  codexInventoryRefreshPending = false
  codexInventoryMembershipGeneration += 1
  codexInventoryMembershipReconcileInFlight = null
  codexInventoryMembershipReconcilePending = false
  codexInventoryMembershipForcePending = false
  codexLocalArchiveRecoverySuppressions.clear()
  for (const threadId of [...codexInventorySideRelations.keys()]) {
    codexForgetInventorySideRelation(threadId, {
      preserveDesktopRelation: options.preserveDesktopActivity === true
    })
  }
  codexInventorySideBranchEvidence.clear()
  codexSubagentDiscovery?.codexResetSubagentDiscovery?.()
  codexhostDiscovery?.codexhostResetDiscovery?.()
  codexCompleteInventoryThreadIds = null
  codexSideTopologyDiagnosticFingerprints.clear()
  codexPrivateBranchTerminals.clear()
  codexActivityDecisionCounters = {
    liveEpochOpened: 0,
    hydrationActiveDeferred: 0,
    staleTurnDiscarded: 0,
    branchTerminalDeferred: 0,
    snapshotConflictSuppressed: 0,
    missingMappingRetained: 0,
    waitingEdgeResubscribe: 0,
    waitingEdgeRecoveryExpired: 0
  }
  if (options.preserveDesktopActivity !== true) {
    codexDesktopBridge?.updateInventory(new Set(), { preserveSideRelations: true })
    codexDesktopBridge?.waitingStates.clear()
  }
  codexThreadTurnStatusCache.clear()
  codexThreadTurnStatusDirty.clear()
  codexThreadTurnStatusDirtyGeneration += 1
  codexThreadGoalCache.clear()
  codexThreadGoalRefreshes.clear()
  codexThreadGoalRpcAvailable = null
  codexThreadGoalGeneration += 1
  codexThreadFirstPromptCache.clear()
  codexThreadPendingInputCache.clear()
  codexThreadPendingPlanCache.clear()
  codexClearRolloutDecisionTrackers()
  codexThreadTurnStatusRpcAvailable = null
  codexThreadFirstPromptScanRunning = false
  codexThreadFirstPromptScanGeneration += 1
}

function sanitizeCodexActivityStatus(value) {
  const source = codexRecord(value)
  const status = ['active', 'idle', 'notLoaded', 'systemError'].includes(source.type) ? source.type : ''
  if (!status) return null
  const activeFlags = status === 'active' && Array.isArray(source.activeFlags)
    ? [...new Set(source.activeFlags.filter((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput'))]
    : []
  return { status, activeFlags }
}

function codexActivityPublicEntry(value) {
  if (codexActivityPublicProjection) return codexActivityPublicProjection.codexActivityPublicEntry(value)
  const source = codexRecord(value)
  return { key: typeof source.key === 'string' ? source.key : '', unreadAuthority: 'unavailable' }
}

function codexArchivedActivityKey(threadId) {
  const known = codexActivityInventory.get(threadId)
  if (!known || typeof known.key !== 'string' || !/^[a-f0-9]{32}$/.test(known.key)) return ''
  codexDesktopBridge?.forgetWaitingState(threadId, true)
  codexForgetPrivateBranchTerminal(threadId)
  for (const [alias, action] of codexThreadActions) {
    if (action.threadId === threadId) codexThreadActions.delete(alias)
  }
  codexThreadTurnStatusCache.delete(threadId)
  codexThreadTurnStatusDirty.delete(threadId)
  codexThreadGoalCache.delete(threadId)
  codexThreadGoalRefreshes.delete(threadId)
  codexThreadFirstPromptCache.delete(threadId)
  codexInteractionSemanticFingerprints.delete(known.key)
  codexActivityInventory.delete(threadId)
  return known.key
}

function codexInventoryMembershipReason(value) {
  return [
    'watcher-event',
    'stat-recovery',
    'watcher-rebuilt',
    'plugin-enter',
    'desktop-ipc-connected',
    'tasks-bootstrap'
  ].includes(value) ? value : 'watcher-event'
}

function codexInventoryMembershipEnabled() {
  const current = companionTaskKernel?.getPackage?.()
  return current?.enabled === true && current.providers?.codex === true
}

function codexInventoryMembershipRoots() {
  return codexNativeStatePathsModule ? codexNativeStatePathsModule.codexInventoryMembershipRoots() : []
}

function codexForgetExternallyArchivedThread(threadId, expectedKey = '') {
  const bridge = codexDesktopBridge
  const sideShadow = bridge?.sideShadows?.get(threadId)
  if (sideShadow || codexSideParentThreadId(threadId)) {
    codexForgetDesktopOpenedReadThread(threadId)
    bridge?.forgetWaitingState?.(threadId)
    codexForgetDesktopSideRelation(threadId)
    codexForgetInventorySideRelation(threadId)
  } else {
    codexClearDesktopOpenedRead(bridge, threadId)
    bridge?.forgetWaitingState?.(threadId, true)
    codexForgetDesktopSideRelationsForParent(threadId)
    codexForgetInventorySideRelationsForParent(threadId)
  }
  bridge?.sideRecoveryPending?.delete(threadId)
  bridge?.persistedUnread?.delete(threadId)
  bridge?.shadows?.delete(threadId)
  bridge?.sideShadows?.delete(threadId)
  bridge?.liveUnread?.delete(threadId)
  if (sideShadow?.parentThreadId) bridge?.emitParentActivity?.(sideShadow.parentThreadId)
  const removedKey = codexArchivedActivityKey(threadId)
  if (!removedKey) {
    for (const [alias, action] of codexThreadActions) {
      if (action.threadId === threadId) codexThreadActions.delete(alias)
    }
    codexThreadTurnStatusCache.delete(threadId)
    codexThreadTurnStatusDirty.delete(threadId)
    codexThreadGoalCache.delete(threadId)
    codexThreadGoalRefreshes.delete(threadId)
    codexThreadFirstPromptCache.delete(threadId)
  }
  return removedKey || (/^[a-f0-9]{32}$/.test(expectedKey) ? expectedKey : '')
}

async function reconcileCodexInventoryMembership(reason, forceTasksOnly, generation) {
  const startedAt = Date.now()
  const [unarchivedRows, archivedRows] = await Promise.all([
    listAllCodexThreads(false),
    listAllCodexThreads(true)
  ])
  if (generation !== codexInventoryMembershipGeneration || !codexInventoryMembershipEnabled()) return false

  const unarchivedIds = new Set(unarchivedRows.map((row) => codexRecord(row).id).filter(validCodexThreadId))
  const archivedIds = new Set(archivedRows.map((row) => codexRecord(row).id).filter(validCodexThreadId))
  for (const threadId of [...codexLocalArchiveRecoverySuppressions]) {
    if (unarchivedIds.has(threadId) && !archivedIds.has(threadId)) codexLocalArchiveRecoverySuppressions.delete(threadId)
  }

  const currentPackage = companionTaskKernel?.getPackage?.()
  const currentCodexKeys = new Set((Array.isArray(currentPackage?.tasks) ? currentPackage.tasks : [])
    .filter((task) => task?.provider === 'codex' && typeof task.key === 'string')
    .map((task) => task.key))
  for (const activity of codexActivityInventory.values()) {
    if (typeof activity?.key === 'string' && /^[a-f0-9]{32}$/.test(activity.key)) currentCodexKeys.add(activity.key)
  }
  const unarchivedKeys = new Set([...unarchivedIds].map(codexThreadKey))
  const archivedKeysInInventory = new Set([...archivedIds].map(codexThreadKey))
  const suppressedKeys = new Set([...codexLocalArchiveRecoverySuppressions].map(codexThreadKey))
  const confirmedArchived = []
  for (const threadId of archivedIds) {
    if (unarchivedIds.has(threadId) || codexLocalArchiveRecoverySuppressions.has(threadId)) continue
    const key = codexThreadKey(threadId)
    if (!currentCodexKeys.has(key)) continue
    const removedKey = codexForgetExternallyArchivedThread(threadId, key)
    if (removedKey) confirmedArchived.push(removedKey)
  }

  const added = [...unarchivedKeys].some((key) => !currentCodexKeys.has(key))
  const missingUnclassified = [...currentCodexKeys].some((key) => !suppressedKeys.has(key)
    && !unarchivedKeys.has(key)
    && !archivedKeysInInventory.has(key)
    // CodexHost external conversations never appear in the official
    // membership listing; treating them as missing would loop cold scans.
    && codexhostDiscovery?.isExternalThreadKey?.(key) !== true)
  const contradictory = [...unarchivedKeys].some((key) => archivedKeysInInventory.has(key))
  const inventoryChanged = confirmedArchived.length > 0 || added || missingUnclassified || contradictory
  if (inventoryChanged) {
    emitCodexActivityDelta([], true, 'urgent', confirmedArchived, { allowWithoutFingerprint: true })
  }
  if (inventoryChanged || forceTasksOnly) queueCompanionHostReconciliation('codex')
  runtimeDiagnostics.record({
    level: inventoryChanged || forceTasksOnly ? 'info' : 'debug',
    scope: 'task-recovery',
    event: 'codex-inventory-membership',
    outcome: confirmedArchived.length ? 'archived-confirmed' : inventoryChanged ? 'reconciliation-queued' : forceTasksOnly ? 'forced' : 'unchanged',
    durationMs: Date.now() - startedAt,
    slowMs: 250,
    count: unarchivedIds.size + archivedIds.size,
    cache: 'provider-direct',
    details: {
      reason,
      unarchivedCount: unarchivedIds.size,
      archivedCount: archivedIds.size,
      confirmedArchivedCount: confirmedArchived.length,
      forceTasksOnly: forceTasksOnly === true
    }
  })
  return inventoryChanged || forceTasksOnly
}

function requestCodexInventoryMembershipReconciliation(reasonValue, options = {}) {
  if (!codexInventoryMembershipEnabled()) return false
  const reason = codexInventoryMembershipReason(reasonValue)
  const forceTasksOnly = options.forceTasksOnly === true
  if (codexInventoryMembershipReconcileInFlight) {
    codexInventoryMembershipReconcilePending = true
    if (forceTasksOnly) codexInventoryMembershipForcePending = true
    return true
  }
  const generation = codexInventoryMembershipGeneration
  let operation = null
  operation = reconcileCodexInventoryMembership(reason, forceTasksOnly, generation)
    .catch(() => {
      if (generation === codexInventoryMembershipGeneration) {
        runtimeDiagnostics.record({
          level: 'error',
          scope: 'task-recovery',
          event: 'codex-inventory-membership',
          outcome: 'failed',
          code: 'provider-read-failed',
          cache: 'provider-direct',
          details: { reason, forceTasksOnly }
        })
      }
      return false
    })
    .finally(() => {
      if (codexInventoryMembershipReconcileInFlight !== operation) return
      codexInventoryMembershipReconcileInFlight = null
      if (!codexInventoryMembershipReconcilePending) return
      const nextForce = codexInventoryMembershipForcePending
      codexInventoryMembershipReconcilePending = false
      codexInventoryMembershipForcePending = false
      queueMicrotask(() => requestCodexInventoryMembershipReconciliation('watcher-event', { forceTasksOnly: nextForce }))
    })
  codexInventoryMembershipReconcileInFlight = operation
  return true
}

function ensureCodexInventoryMembershipWatchers(options = {}) {
  if (!codexInventoryMembershipEnabled()) return false
  let rebuilt = false
  for (const root of codexInventoryMembershipRoots()) {
    if (!codexInventoryMembershipWatchers.has(root) && typeof fs.watch === 'function') {
      let watcher = null
      const listener = (eventType) => {
        if (eventType !== 'rename') return
        ensureCodexInventoryMembershipWatchers()
        requestCodexInventoryMembershipReconciliation('watcher-event')
      }
      try {
        watcher = fs.watch(root, { persistent: false, recursive: true }, listener)
      } catch {
        try { watcher = fs.watch(root, { persistent: false }, listener) } catch {}
      }
      if (watcher) {
        codexInventoryMembershipWatchers.set(root, watcher)
        watcher.unref?.()
        watcher.on?.('error', () => {
          if (codexInventoryMembershipWatchers.get(root) !== watcher) return
          try { watcher.close() } catch {}
          codexInventoryMembershipWatchers.delete(root)
          ensureCodexInventoryMembershipWatchers({ forceReconcile: true })
        })
        rebuilt = true
      }
    }
    if (!codexInventoryMembershipStatPaths.has(root) && typeof fs.watchFile === 'function') {
      try {
        const statWatcher = fs.watchFile(root, {
          persistent: false,
          interval: CODEX_INVENTORY_MEMBERSHIP_RECOVERY_INTERVAL_MS
        }, () => {
          ensureCodexInventoryMembershipWatchers()
          requestCodexInventoryMembershipReconciliation('stat-recovery')
        })
        statWatcher?.unref?.()
        codexInventoryMembershipStatPaths.add(root)
        rebuilt = true
      } catch {}
    }
  }
  if (options.reconcile !== false && (rebuilt || options.forceReconcile === true)) {
    requestCodexInventoryMembershipReconciliation('watcher-rebuilt', { forceTasksOnly: true })
  }
  return rebuilt
}

function closeCodexInventoryMembershipWatchers() {
  for (const watcher of codexInventoryMembershipWatchers.values()) {
    try { watcher.close() } catch {}
  }
  codexInventoryMembershipWatchers.clear()
  if (typeof fs.unwatchFile === 'function') {
    for (const root of codexInventoryMembershipStatPaths) {
      try { fs.unwatchFile(root) } catch {}
    }
  }
  codexInventoryMembershipStatPaths.clear()
}

function codexActivityDelta(entries, inventoryChanged, receivedAt = Date.now(), inventoryRefreshPriority = 'normal', archivedKeys = [], options = {}) {
  const normalizedArchivedKeys = [...new Set(archivedKeys.filter((key) => typeof key === 'string' && /^[a-f0-9]{32}$/.test(key)))]
  const interactionEvidence = codexRecord(options.interactionEvidence)
  const interactions = Array.isArray(interactionEvidence.interactions) ? interactionEvidence.interactions : []
  const interactionSets = Array.isArray(interactionEvidence.interactionSets) ? interactionEvidence.interactionSets : []
  return {
    version: 2,
    sourceFingerprint: codexActivitySourceFingerprint,
    generation: codexActivityGeneration,
    entries: entries.map(codexActivityPublicEntry).filter((entry) => entry.key),
    ...(interactions.length || interactionSets.length ? { interactions, interactionSets } : {}),
    ...(normalizedArchivedKeys.length ? { archivedKeys: normalizedArchivedKeys } : {}),
    inventoryChanged: inventoryChanged === true,
    ...(inventoryChanged === true ? { inventoryRefreshPriority: inventoryRefreshPriority === 'urgent' ? 'urgent' : 'normal' } : {}),
    desktopBridgeState: codexDesktopBridge?.state || 'not-checked',
    decisionDiagnostics: codexActivityDecisionDiagnostics(),
    receivedAt
  }
}

function codexActivitySemanticFingerprint(value) {
  const entry = codexActivityPublicEntry(value)
  if (!entry.key) return null
  const semanticEntry = { ...entry }
  delete semanticEntry.activityRevision
  const match = [...codexActivityInventory.entries()].find(([, known]) => known === value || known.key === entry.key)
  const branchEvidence = entry.readStateOnly === true || !match
    ? null
    : codexPrivateBranchEvidence(match[0], match[1])
  const branches = (branchEvidence?.branches || []).map((branch) => {
    const semantic = { ...branch }
    delete semantic.observedAt
    return semantic
  }).sort((left, right) => String(left.ref).localeCompare(String(right.ref)))
  return {
    lane: `${entry.key}:${entry.readStateOnly === true ? 'read' : 'state'}`,
    value: JSON.stringify({ entry: semanticEntry, branches })
  }
}

function codexActivityInventorySemanticFingerprint() {
  const entries = [...codexActivityInventory.values()]
    .map(codexActivitySemanticFingerprint)
    .filter(Boolean)
    .sort((left, right) => left.lane.localeCompare(right.lane))
    .map((entry) => [entry.lane, entry.value])
  return JSON.stringify({
    sourceFingerprint: codexActivitySourceFingerprint,
    bridgeState: codexDesktopBridge?.state || 'not-checked',
    entries
  })
}

function codexPrimeActivitySemanticFingerprints() {
  codexActivitySemanticFingerprints.clear()
  codexInteractionSemanticFingerprints.clear()
  for (const value of codexActivityInventory.values()) {
    for (const candidate of [value, { ...value, readStateOnly: true }]) {
      const fingerprint = codexActivitySemanticFingerprint(candidate)
      if (fingerprint) codexActivitySemanticFingerprints.set(fingerprint.lane, fingerprint.value)
    }
  }
  codexActivityBridgeFingerprint = `${codexActivitySourceFingerprint}\0${codexDesktopBridge?.state || 'not-checked'}`
}

function emitCodexActivityDelta(entries, inventoryChanged, inventoryRefreshPriority = 'normal', archivedKeys = [], options = {}) {
  if (!codexActivitySourceFingerprint && options.allowWithoutFingerprint !== true) return
  const changedEntries = []
  const nextFingerprints = []
  const inputEntries = Array.isArray(entries) ? entries : []
  for (const value of inputEntries) {
    const fingerprint = codexActivitySemanticFingerprint(value)
    if (!fingerprint) continue
    if (options.forcePrivateEvidence === true
      || codexActivitySemanticFingerprints.get(fingerprint.lane) !== fingerprint.value) changedEntries.push(value)
    const fullValue = { ...value }
    delete fullValue.readStateOnly
    for (const candidate of [fullValue, { ...fullValue, readStateOnly: true }]) {
      const semantic = codexActivitySemanticFingerprint(candidate)
      if (semantic) nextFingerprints.push(semantic)
    }
  }
  for (const fingerprint of nextFingerprints) codexActivitySemanticFingerprints.set(fingerprint.lane, fingerprint.value)
  const bridgeFingerprint = `${codexActivitySourceFingerprint}\0${codexDesktopBridge?.state || 'not-checked'}`
  const bridgeChanged = bridgeFingerprint !== codexActivityBridgeFingerprint
  const normalizedArchivedKeys = [...new Set((Array.isArray(archivedKeys) ? archivedKeys : [])
    .filter((key) => typeof key === 'string' && /^[a-f0-9]{32}$/.test(key)))]
  const inventorySignal = inventoryChanged === true
    && (!codexInventoryRefreshPending || normalizedArchivedKeys.length > 0)
  const interactionEvidence = codexRecord(options.interactionEvidence)
  const interactionTaskKey = typeof interactionEvidence.taskKey === 'string' ? interactionEvidence.taskKey : ''
  const semanticInteractions = Array.isArray(interactionEvidence.interactions)
    ? interactionEvidence.interactions.map((value) => {
        const interaction = codexRecord(value)
        return {
          branchRef: interaction.branchRef,
          interactionRef: interaction.interactionRef,
          kind: interaction.kind,
          state: interaction.state,
          sequence: interaction.sequence,
          exact: interaction.exact === true
        }
      }).sort((left, right) => `${left.branchRef}:${left.interactionRef}`.localeCompare(`${right.branchRef}:${right.interactionRef}`))
    : []
  const interactionFingerprint = interactionTaskKey
    ? JSON.stringify({
        complete: Array.isArray(interactionEvidence.interactionSets) && interactionEvidence.interactionSets.length > 0,
        interactions: semanticInteractions
      })
    : ''
  const previousInteractionFingerprint = interactionTaskKey
    ? codexInteractionSemanticFingerprints.get(interactionTaskKey)
    : undefined
  const canonicalNeedsInteractionClear = previousInteractionFingerprint === undefined
    && semanticInteractions.length === 0
    && companionTaskKernel?.getPackage?.().tasks?.some((task) => (
      task.key === interactionTaskKey && (task.phase === 'waiting-input' || task.phase === 'waiting-approval')
    ))
  const interactionChanged = Boolean(interactionTaskKey && interactionFingerprint
    && (previousInteractionFingerprint === undefined
      ? semanticInteractions.length > 0 || canonicalNeedsInteractionClear
      : previousInteractionFingerprint !== interactionFingerprint))
  if (interactionChanged && !changedEntries.some((value) => codexActivityPublicEntry(value).key === interactionTaskKey)) {
    const matchingEntry = inputEntries.find((value) => codexActivityPublicEntry(value).key === interactionTaskKey)
    if (matchingEntry) changedEntries.push(matchingEntry)
  }
  if (!changedEntries.length && !bridgeChanged && !inventorySignal && !normalizedArchivedKeys.length && !interactionChanged) return false
  codexActivityBridgeFingerprint = bridgeFingerprint
  if (inventoryChanged === true) codexInventoryRefreshPending = true
  if (interactionChanged) {
    codexInteractionSemanticFingerprints.set(interactionTaskKey, interactionFingerprint)
    const kinds = Object.fromEntries(['user-input', 'approval', 'plan-choice', 'plan-implementation'].map((kind) => [
      kind,
      semanticInteractions.filter((interaction) => interaction.kind === kind && interaction.state === 'opened').length
    ]))
    const states = Object.fromEntries(['opened', 'resolved', 'cancelled', 'execution-started'].map((state) => [
      state,
      semanticInteractions.filter((interaction) => interaction.state === state).length
    ]))
    runtimeDiagnostics.record({
      level: 'debug',
      scope: 'task-interaction',
      event: 'request-set',
      outcome: 'accepted',
      provider: 'codex',
      taskRef: companionDiagnosticTaskRef('codex', interactionTaskKey),
      observationGeneration: Number(interactionEvidence.requestSetRevision) || 0,
      count: semanticInteractions.length,
      details: {
        revision: companionV7Revisions.interaction,
        requestSetRevision: Number(interactionEvidence.requestSetRevision) || 0,
        complete: Array.isArray(interactionEvidence.interactionSets) && interactionEvidence.interactionSets.length > 0,
        kinds,
        states,
        exactCount: semanticInteractions.filter((interaction) => interaction.exact).length
      }
    })
  }
  codexActivityGeneration += 1
  const delta = codexActivityDelta(
    changedEntries,
    inventoryChanged === true,
    Date.now(),
    inventoryRefreshPriority,
    normalizedArchivedKeys,
    { interactionEvidence: interactionChanged ? interactionEvidence : null }
  )
  for (const listener of codexActivityListeners) {
    try { listener(delta) } catch {}
  }
  return true
}

function handleCodexServerMessage(message) {
  if (!message || typeof message !== 'object' || typeof message.method !== 'string') return false
  const method = message.method
  const params = codexRecord(message.params)
  if (method === 'serverRequest/resolved') {
    const threadId = typeof params.threadId === 'string' ? params.threadId : ''
    const requestId = params.requestId
    const validRequestId = typeof requestId === 'string'
      ? requestId.length > 0 && requestId.length <= 512
      : Number.isSafeInteger(requestId)
    if (validCodexThreadId(threadId) && validRequestId) {
      const correlation = codexDesktopRequestCorrelation({ requestId })
      codexEnsureDesktopBridge().resolveServerRequest(threadId, correlation)
    } else if (validCodexThreadId(threadId)) {
      codexEnsureDesktopBridge().scheduleWaitingEdgeRefresh(threadId)
    }
    return true
  }
  if (method === 'thread/goal/updated' || method === 'thread/goal/cleared') {
    const threadId = typeof params.threadId === 'string' ? params.threadId : ''
    if (!validCodexThreadId(threadId)) return true
    codexThreadGoalRpcAvailable = true
    if (method === 'thread/goal/cleared') {
      codexSetThreadGoalEvidence(threadId, {
        goalStatus: 'none',
        goalFreshness: 'fresh'
      }, {
        sequence: codexNextLiveEvidenceSequence(),
        publish: true
      })
      return true
    }
    const goal = sanitizeCodexThreadGoal(params.goal)
    if (goal) {
      codexSetThreadGoalEvidence(threadId, goal, {
        sequence: codexNextLiveEvidenceSequence(),
        publish: true
      })
    } else {
      codexMarkThreadGoalVerifying(threadId)
      codexPublishThreadGoalEvidence(threadId)
      void refreshCodexThreadGoal(threadId, { force: true, publish: true })
    }
    return true
  }
  if (method === 'thread/status/changed') {
    const evidenceThreadId = typeof params.threadId === 'string' ? params.threadId : ''
    const bridge = codexEnsureDesktopBridge()
    const threadId = bridge.parentThreadIdFor(evidenceThreadId)
    const known = codexActivityInventory.get(threadId)
    const activity = sanitizeCodexActivityStatus(params.status)
    if (known && activity) {
      // Opening/hydrating an already terminal thread can emit a transient
      // App Server `active` before any real Turn exists. Preserve the exact
      // terminal and wait for turn/started (or another live authority).
      if (codexShouldDeferHydrationActive(bridge, known, threadId, evidenceThreadId, activity)) {
        codexDeferHydrationActive(bridge, known, threadId, evidenceThreadId)
        return true
      }
      if (evidenceThreadId !== threadId) {
        if (activity.status === 'active') {
          codexForgetPrivateBranchTerminal(threadId, evidenceThreadId)
          bridge.cancelWaitingEdgeRefresh(evidenceThreadId)
          const waitingEdge = codexReduceWaitingEdge({
            flags: activity.activeFlags,
            previousFlags: known.activeFlags,
            previousWaitingSince: known.waitingSince
          })
          const sequence = codexMarkAppServerLiveActive(
            known,
            undefined,
            evidenceThreadId,
            JSON.stringify(waitingEdge.flags) !== JSON.stringify(known.activeFlags || [])
          )
          if (!waitingEdge.waiting) {
            bridge.clearWaitingEvidence(
              evidenceThreadId,
              ['waitingOnUserInput', 'waitingOnApproval'],
              { sequence }
            )
          }
          known.status = 'active'
          known.activeFlags = waitingEdge.flags
          known.planImplementationOnly = false
          if (waitingEdge.waitingSince) known.waitingSince = waitingEdge.waitingSince
          else delete known.waitingSince
          known.statusAuthority = 'app-server-live'
          known.activityEvidence = 'activity-event'
          known.activityRevision = codexActivityGeneration
          known.lastTurnStatus = 'inProgress'
          delete known.lastTurnId
          delete known.lastTurnCompletedAt
          delete known.lastTurnEvidence
          delete known.terminalEvidenceSequence
          bridge.cancelLatestTurnRefresh(threadId)
          bridge.cancelCompletionUnreadRefresh(threadId)
          delete known.desktopActiveSince
          if (!bridge.publishCurrentShadow(evidenceThreadId)) emitCodexActivityDelta([known], false)
          return true
        }
        markCodexThreadTurnStatusDirty(evidenceThreadId)
        emitCodexActivityDelta([], true, 'urgent')
        return true
      }
      bridge.cancelWaitingEdgeRefresh(threadId)
      const exitedActive = known.connectorStatus === 'active' && activity.status !== 'active'
      const waitingEdge = codexReduceWaitingEdge({
        active: activity.status === 'active',
        flags: activity.activeFlags,
        previousFlags: known.connectorActiveFlags,
        previousWaitingSince: known.connectorWaitingSince
      })
      known.connectorStatus = activity.status
      known.connectorActiveFlags = activity.activeFlags
      known.connectorStatusAuthority = 'connector'
      known.rolloutFallbackStatus = activity.status
      known.rolloutFallbackActiveFlags = [...activity.activeFlags]
      if (waitingEdge.waitingSince) known.connectorWaitingSince = waitingEdge.waitingSince
      else delete known.connectorWaitingSince
      if (activity.status === 'active') {
        codexForgetPrivateBranchTerminal(threadId, threadId)
        bridge.clearOrphanedPending(threadId)
        codexClearDesktopOpenedRead(bridge, threadId)
        delete known.pendingCompletedPlanItem
        known.connectorPlanImplementationOnly = false
        const sequence = codexMarkAppServerLiveActive(
          known,
          undefined,
          threadId,
          JSON.stringify(activity.activeFlags) !== JSON.stringify(known.activeFlags || [])
        )
        if (!waitingEdge.waiting) {
          bridge.clearWaitingEvidence(
            threadId,
            ['waitingOnUserInput', 'waitingOnApproval'],
            { sequence }
          )
        }
        known.status = 'active'
        known.activeFlags = activity.activeFlags
        known.planImplementationOnly = false
        if (waitingEdge.waitingSince) known.waitingSince = waitingEdge.waitingSince
        else delete known.waitingSince
        known.statusAuthority = 'app-server-live'
        known.activityEvidence = 'activity-event'
        known.activityRevision = codexActivityGeneration
        known.lastTurnStatus = 'inProgress'
        delete known.lastTurnId
        delete known.lastTurnCompletedAt
        delete known.lastTurnEvidence
        delete known.terminalEvidenceSequence
        codexThreadTurnStatusCache.delete(threadId)
        bridge.cancelLatestTurnRefresh(threadId)
        bridge.cancelCompletionUnreadRefresh(threadId)
        delete known.desktopActiveSince
      } else {
        codexClearAppServerLiveActive(known)
        if (known.statusAuthority !== 'desktop-live') {
          known.status = activity.status
          known.activeFlags = activity.activeFlags
          known.planImplementationOnly = known.connectorPlanImplementationOnly === true
          if (waitingEdge.waitingSince) known.waitingSince = waitingEdge.waitingSince
          else delete known.waitingSince
          known.statusAuthority = 'connector'
          known.activityEvidence = 'connector'
          known.activityRevision = codexActivityGeneration
          delete known.desktopActiveSince
        }
      }
      if (exitedActive) markCodexThreadTurnStatusDirty(threadId)
      emitCodexActivityDelta([known], exitedActive, exitedActive ? 'urgent' : 'normal')
    } else {
      markCodexThreadTurnStatusDirty(threadId)
      emitCodexActivityDelta([], true, 'urgent')
    }
    return true
  }
  if (['turn/started', 'turn/completed', 'thread/started'].includes(method)) {
    const startedThread = method === 'thread/started' ? codexRecord(params.thread) : null
    const threadId = typeof params.threadId === 'string'
      ? params.threadId
      : typeof startedThread?.id === 'string' ? startedThread.id : ''
    if ((method === 'turn/started' || method === 'turn/completed') && validCodexThreadId(threadId)) {
      const bridge = codexEnsureDesktopBridge()
      const activityThreadId = method === 'turn/started' ? bridge.parentThreadIdFor(threadId) : threadId
      const known = codexActivityInventory.get(activityThreadId)
      if (known && method === 'turn/started'
        && codexApplyStartedTurnNotification(bridge, known, activityThreadId, params.turn, threadId)) return true
      if (known && method === 'turn/completed' && codexApplyCompletedTurnNotification(bridge, known, threadId, params.turn)) return true
      if (method === 'turn/completed') {
        const parentThreadId = bridge.parentThreadIdFor(threadId)
        const parent = codexActivityInventory.get(parentThreadId)
        if (parent) {
          bridge.scheduleLatestTurnRefresh(parentThreadId, {
            confirmCompletionEvent: true,
            queryThreadId: threadId,
            restart: true
          })
          return true
        }
      }
    }
    if (method === 'thread/started' && validCodexThreadId(threadId)) {
      let registry = null
      let native = null
      let metadataErrorCode = ''
      try {
        registry = readCodexNativeRegistry()
        native = codexThreadNativeProject({ ...startedThread, id: threadId }, registry)
      } catch {
        metadataErrorCode = 'native-project-unavailable'
      }
      const observedAt = Date.now()
      const project = native?.project || { key: 'chats', name: 'Chats', kind: 'chats' }
      const sourceFingerprint = registry?.fingerprint || codexActivitySourceFingerprint || ''
      const action = codexThreadAlias(threadId, observedAt, {
        projectKey: project.key,
        sourceFingerprint,
        cwd: codexNormalizeNativeRoot(startedThread.cwd)
      })
      const known = {
        key: action.key,
        actionAlias: action.alias,
        displayName: '新 Codex 任务',
        minimalMembership: true,
        projectKey: project.key,
        projectName: project.name,
        projectKind: project.kind === 'chats' ? 'chats' : 'project',
        status: 'active',
        activeFlags: [],
        connectorStatus: 'active',
        connectorActiveFlags: [],
        connectorStatusAuthority: 'connector',
        connectorPlanImplementationOnly: false,
        rolloutFallbackStatus: 'active',
        rolloutFallbackActiveFlags: [],
        statusAuthority: 'app-server-live',
        activityEvidence: 'activity-event',
        activityRevision: codexActivityGeneration + 1,
        planImplementationOnly: false,
        hasUnreadTurn: false,
        unreadAuthority: 'unavailable',
        lastTurnStatus: 'inProgress',
        lastTurnEvidence: 'turn-started',
        updatedAt: observedAt
      }
      codexMarkAppServerLiveActive(known, undefined, threadId, true)
      codexActivityInventory.set(threadId, known)
      markCodexThreadTurnStatusDirty(threadId)
      runtimeDiagnostics.record({
        level: metadataErrorCode || !native ? 'debug' : 'info',
        scope: 'task-evidence',
        event: 'codex-membership-minimal',
        outcome: metadataErrorCode || !native ? 'metadata-pending' : 'admitted',
        provider: 'codex',
        taskRef: companionDiagnosticTaskRef('codex', threadId),
        code: metadataErrorCode || undefined,
        observationGeneration: known.activityRevision,
        cache: 'process-package',
        details: { projectFallback: !native, metadataTargetedReadQueued: true }
      })
      emitCodexActivityDelta([known], true, 'urgent', [], { allowWithoutFingerprint: true })
      if (!codexThreadGoalCache.has(threadId) && codexThreadGoalRpcAvailable !== false) {
        void refreshCodexThreadGoal(threadId, { publish: true })
      }
      return true
    }
    markCodexThreadTurnStatusDirty(threadId)
    emitCodexActivityDelta([], true, 'urgent')
    return true
  }
  if (method === 'item/completed') {
    const threadId = typeof params.threadId === 'string' ? params.threadId : ''
    const known = codexActivityInventory.get(threadId)
    const item = codexRecord(params.item)
    if (known && String(item.type || '').toLowerCase() === 'plan') {
      known.pendingCompletedPlanItem = true
    }
    return true
  }
  if (method === 'thread/archived') {
    const threadId = typeof params.threadId === 'string' ? params.threadId : typeof params.conversationId === 'string' ? params.conversationId : ''
    if (validCodexThreadId(threadId) && (codexArchiveBridge?.observeNativeAck(threadId, 'app-server') ?? false)) return true
    if (validCodexThreadId(threadId)) codexClearDesktopOpenedRead(codexDesktopBridge, threadId)
    const archivedKey = validCodexThreadId(threadId) ? codexArchivedActivityKey(threadId) : ''
    emitCodexActivityDelta([], true, archivedKey ? 'urgent' : 'normal', archivedKey ? [archivedKey] : [])
    return true
  }
  if (['thread/unarchived', 'thread/deleted'].includes(method)) {
    const threadId = typeof params.threadId === 'string' ? params.threadId : typeof params.conversationId === 'string' ? params.conversationId : ''
    if (method === 'thread/deleted' && validCodexThreadId(threadId)) {
      codexClearDesktopOpenedRead(codexDesktopBridge, threadId)
      codexThreadGoalCache.delete(threadId)
      codexThreadGoalRefreshes.delete(threadId)
    }
    emitCodexActivityDelta([], true, 'normal')
    return true
  }
  // Server-initiated approval/input requests are deliberately not answered by
  // this read-only companion. They belong to the client that owns the turn.
  return true
}

function onCodexProcessEnd(processRef = codexProcess, reason = null) {
  if (processRef && processRef !== codexProcess) return
  rejectCodexPending(codexProcessEndError(reason))
  codexProcess = null
  codexLaunchKey = ''
  codexStartupHint = ''
  codexReadyPromise = null
  codexRpcBuffer = ''
  codexNativePlanExecutionCapabilityPromise = null
  codexNativePlanExecutionCapability = null
  resetCodexThreadSessionState({ preserveDesktopActivity: true })
}

function handleCodexStdout(chunk) {
  codexRpcBuffer += String(chunk || '')
  if (codexRpcBuffer.length > 1_000_000) {
    codexRpcBuffer = ''
    rejectCodexPending(codexError('protocol-error', 'Codex App Server frame overflow'))
    return
  }
  for (;;) {
    const newline = codexRpcBuffer.indexOf('\n')
    if (newline < 0) break
    const line = codexRpcBuffer.slice(0, newline).trim()
    codexRpcBuffer = codexRpcBuffer.slice(newline + 1)
    if (!line) continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      continue
    }
    if (!message || typeof message !== 'object') continue
    if (typeof message.method === 'string') {
      handleCodexServerMessage(message)
      continue
    }
    if (!Number.isInteger(message.id)) continue
    const pending = codexRpcPending.get(message.id)
    if (!pending) continue
    codexRpcPending.delete(message.id)
    clearTimeout(pending.timeoutId)
    if (message.error) {
      const error = codexError('protocol-error', 'Codex App Server request failed')
      const rpcCode = Number(codexRecord(message.error).code)
      if (Number.isFinite(rpcCode)) error.rpcCode = rpcCode
      pending.reject(error)
    } else pending.resolve(codexRecord(message.result))
  }
}

function sendCodexRpc(method, params, timeoutMs = CODEX_RPC_TIMEOUT_MS) {
  if (!codexProcess || !codexProcess.stdin || typeof codexProcess.stdin.write !== 'function') {
    return Promise.reject(codexError('process-exited', 'Codex App Server is unavailable'))
  }
  const id = ++codexRpcId
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      codexRpcPending.delete(id)
      reject(codexError('timeout', 'Codex App Server request timed out'))
    }, timeoutMs)
    codexRpcPending.set(id, { resolve, reject, timeoutId })
    try {
      codexProcess.stdin.write(`${JSON.stringify({ method, id, params: params || {} })}\n`)
    } catch {
      clearTimeout(timeoutId)
      codexRpcPending.delete(id)
      reject(codexError('process-exited', 'Codex App Server write failed'))
    }
  })
}

function notifyCodexRpc(method, params) {
  try {
    codexProcess?.stdin?.write(`${JSON.stringify({ method, params: params || {} })}\n`)
  } catch {}
}

function codexProcessAlive() {
  return Boolean(codexProcess && codexProcess.exitCode == null && codexProcess.killed !== true)
}

async function startCodexServer() {
  if (typeof spawn !== 'function') throw codexError('unavailable', 'Codex process bridge is unavailable')
  const launch = resolveCodexLaunchPlan()
  if (!launch.detected) throw codexError('runtime-unavailable', 'Codex runtime unavailable')
  if (codexReadyPromise && codexLaunchKey === launch.key) return codexReadyPromise
  if (codexProcessAlive()) throw codexError('unavailable', 'Previous Codex App Server session is still exiting')
  codexLaunchKey = launch.key
  codexStartupHint = ''
  const readyPromise = (async () => {
    const proxyEnvironment = await resolveCodexProxyEnvironment()
    if (codexReadyPromise !== readyPromise) throw codexError('process-exited', 'Codex App Server session closed')
    codexProcess = spawn(launch.command, [...launch.argsPrefix, 'app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: codexSpawnEnvironment(launch.command, proxyEnvironment),
      cwd: os.homedir()
    })
    if (!codexProcess || !codexProcess.stdin || !codexProcess.stdout) {
      onCodexProcessEnd()
      throw codexError('unavailable', 'Codex App Server pipes unavailable')
    }
    const processRef = codexProcess
    const processEnd = (reason) => onCodexProcessEnd(processRef, reason)
    codexProcess.stdout.on('data', handleCodexStdout)
    codexProcess.stderr?.on('data', inspectCodexStderr)
    codexProcess.once?.('error', processEnd)
    codexProcess.once?.('exit', (code) => processEnd({ exitCode: code }))
    await sendCodexRpc('initialize', {
      clientInfo: { name: 'eypc_codex_quota', title: 'EyPc Codex Quota', version: '0.1.0' },
      capabilities: { experimentalApi: true }
    })
    notifyCodexRpc('initialized', {})
    return true
  })()
  codexReadyPromise = readyPromise
  return readyPromise.catch((error) => {
    if (codexReadyPromise === readyPromise) closeCodexServer()
    throw error
  })
}

async function requestCodexRpc(method, params, timeoutMs = CODEX_RPC_TIMEOUT_MS) {
  await startCodexServer()
  return sendCodexRpc(method, params, timeoutMs)
}

async function inspectCodexNativePlanExecutionCapability() {
  if (codexNativePlanExecutionCapability) return codexNativePlanExecutionCapability
  if (codexNativePlanExecutionCapabilityPromise) return codexNativePlanExecutionCapabilityPromise
  const operation = Promise.resolve().then(async () => {
    try {
      const result = codexRecord(await requestCodexRpc('collaborationMode/list', {}, CODEX_PLAN_CAPABILITY_TIMEOUT_MS))
      const rows = [result.data, result.modes, result.collaborationModes]
        .find((value) => Array.isArray(value)) || []
      const defaultSupported = rows.some((value) => {
        const row = codexRecord(value)
        return row.mode === 'default' || row.name === 'default' || row.id === 'default'
      })
      codexNativePlanExecutionCapability = defaultSupported
        ? { available: true, reason: 'ready' }
        : { available: false, reason: 'default-mode-unavailable' }
    } catch {
      codexNativePlanExecutionCapability = { available: false, reason: 'protocol-unavailable' }
    }
    return codexNativePlanExecutionCapability
  }).finally(() => {
    if (codexNativePlanExecutionCapabilityPromise === operation) codexNativePlanExecutionCapabilityPromise = null
  })
  codexNativePlanExecutionCapabilityPromise = operation
  return operation
}

function closeCodexServer() {
  const processRef = codexProcess
  rejectCodexPending(codexError('process-exited', 'Codex App Server session closed'))
  codexProcess = null
  codexLaunchKey = ''
  codexStartupHint = ''
  codexReadyPromise = null
  codexRpcBuffer = ''
  codexNativePlanExecutionCapabilityPromise = null
  codexNativePlanExecutionCapability = null
  try { processRef?.stdout?.off?.('data', handleCodexStdout) } catch {}
  try { processRef?.stderr?.off?.('data', inspectCodexStderr) } catch {}
  try { processRef?.stdin?.end() } catch {}
  try { processRef?.stdout?.destroy?.() } catch {}
  try { processRef?.stderr?.destroy?.() } catch {}
  resetCodexThreadSessionState({ preserveDesktopActivity: true })
}

function closeCodexConnections(options = {}) {
  if (options.preserveDesktop !== true) closeCodexInventoryMembershipWatchers()
  if (options.preserveDesktop !== true) closeCodexDesktopBridge()
  if (options.force !== true && shouldDeferCodexActionServerClose()) {
    codexActionDeferredServerClose = true
    return
  }
  codexActionDeferredServerClose = false
  closeCodexServer()
}

// A failed load leaves quota unreadable rather than misread: every window
// comes back empty instead of guessing at a partial shape.
function sanitizeCodexQuota(rateResult, accountResult) {
  return codexQuotaSanitizer
    ? codexQuotaSanitizer.sanitizeCodexQuota(rateResult, accountResult)
    : { plan: '', short: null, weekly: null, normal: { limitId: 'codex', limitName: 'Codex', family: 'normal', short: null, weekly: null }, spark: [] }
}

function sanitizeCodexModelList(value) {
  const source = codexRecord(value)
  const rows = Array.isArray(source.data) ? source.data : Array.isArray(source.models) ? source.models : []
  const seen = new Set()
  const models = rows.flatMap((value) => {
    const row = codexRecord(value)
    const idCandidate = typeof row.id === 'string' ? row.id : typeof row.model === 'string' ? row.model : typeof row.slug === 'string' ? row.slug : ''
    const id = /^[A-Za-z0-9._:-]{1,120}$/.test(idCandidate) ? idCandidate : ''
    if (!id || seen.has(id) || row.hidden === true || row.visibility === 'hidden' || row.visibility === 'hide') return []
    const modalities = Array.isArray(row.inputModalities) ? row.inputModalities : Array.isArray(row.supportedInputModalities) ? row.supportedInputModalities : null
    const supportsText = !modalities || modalities.includes('text')
    if (!supportsText) return []
    seen.add(id)
    return [{
      id,
      displayName: typeof row.displayName === 'string' && row.displayName.trim()
        ? row.displayName.trim().slice(0, 160)
        : typeof row.name === 'string' && row.name.trim() ? row.name.trim().slice(0, 160) : id,
      description: typeof row.description === 'string' ? row.description.trim().slice(0, 240) : '',
      family: /(?:^|[-_.])spark(?:$|[-_.])/i.test(id) ? 'spark' : 'normal',
      isDefault: row.isDefault === true || row.default === true,
      supportsText: true
    }]
  }).sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.displayName.localeCompare(right.displayName)).slice(0, 80)
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(models)).digest('hex')
  return { models, fingerprint }
}

function codexNewThreadContextFingerprint(quota, modelCatalogFingerprint, projectFingerprint) {
  const stableQuota = {
    normal: codexRecord(quota).normal || null,
    spark: Array.isArray(codexRecord(quota).spark) ? codexRecord(quota).spark : []
  }
  return crypto.createHash('sha256').update(JSON.stringify({ quota: stableQuota, modelCatalogFingerprint, projectFingerprint })).digest('hex')
}

function sanitizeCodexConfig(value) {
  const config = codexRecord(codexRecord(value).config)
  return {
    model: typeof config.model === 'string' ? config.model.slice(0, 120) : '',
    reasoningEffort: typeof config.model_reasoning_effort === 'string' ? config.model_reasoning_effort.slice(0, 80) : '',
    serviceTier: typeof config.service_tier === 'string' ? config.service_tier.slice(0, 80) : ''
  }
}

function validCodexThreadId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function codexThreadKey(threadId) {
  return crypto.createHash('sha256').update(threadId).digest('hex').slice(0, 32)
}

function codexPrivateBranchRef(parentThreadId, branchThreadId) {
  return crypto.createHash('sha256')
    // Authority may move connector -> Desktop -> App Server within one Turn.
    // The ref identifies the branch, not the transport lane, so the Kernel can
    // causally merge those observations instead of treating them as siblings.
    .update(`codex-branch\0${parentThreadId}\0${branchThreadId}`)
    .digest('hex')
    .slice(0, 32)
}

// A failed load leaves every thread isolated rather than guessing at a fork
// relationship: downstream side-chat merging simply finds nothing to merge.
function codexInventoryThreadTopology(rows) {
  return codexInventoryThreadTopologyModule
    ? codexInventoryThreadTopologyModule.codexInventoryThreadTopology(rows)
    : { rowById: new Map(), relations: new Map(), depths: new Map(), isolated: new Set() }
}

function codexRecordSideTopologyDecision(sourceCount, relations, depths, orphanCount, recoveredLiveByParent = new Map()) {
  const byParent = new Map()
  for (const [threadId, parentThreadId] of relations) {
    const current = byParent.get(parentThreadId) || { sideCount: 0, nestedSideCount: 0 }
    current.sideCount += 1
    if ((depths.get(threadId) || 0) > 1) current.nestedSideCount += 1
    const recoveredLiveCount = recoveredLiveByParent.get(parentThreadId) || 0
    if (recoveredLiveCount > 0) current.recoveredLiveCount = recoveredLiveCount
    byParent.set(parentThreadId, current)
  }
  const recoveredLiveTotal = [...recoveredLiveByParent.values()].reduce((sum, count) => sum + count, 0)
  const nextFingerprints = new Map()
  const aggregateDetails = {
    rootCount: Math.max(0, sourceCount - relations.size),
    sideCount: relations.size,
    orphanCount: Math.max(0, orphanCount),
    nestedSideCount: [...depths.entries()].filter(([threadId, depth]) => relations.has(threadId) && depth > 1).length,
    mergedParentCount: byParent.size,
    ...(recoveredLiveTotal > 0 ? { recoveredLiveCount: recoveredLiveTotal } : {})
  }
  const aggregateSignature = JSON.stringify(aggregateDetails)
  nextFingerprints.set('aggregate', aggregateSignature)
  if (codexSideTopologyDiagnosticFingerprints.get('aggregate') !== aggregateSignature) {
    recordCompanionDiagnosticEvent({
      level: 'info',
      scope: 'task-topology',
      event: 'side-topology-decision',
      outcome: relations.size ? 'merged' : orphanCount ? 'standalone' : 'root-only',
      provider: 'codex',
      details: aggregateDetails
    })
  }
  for (const [parentThreadId, details] of byParent) {
    const key = `parent:${codexThreadKey(parentThreadId)}`
    const signature = JSON.stringify(details)
    nextFingerprints.set(key, signature)
    if (codexSideTopologyDiagnosticFingerprints.get(key) === signature) continue
    recordCompanionDiagnosticEvent({
      level: 'info',
      scope: 'task-topology',
      event: 'side-topology-decision',
      outcome: 'merged-parent',
      provider: 'codex',
      taskRef: codexThreadKey(parentThreadId),
      details: { rootCount: 1, orphanCount: 0, ...details }
    })
  }
  codexSideTopologyDiagnosticFingerprints.clear()
  for (const [key, signature] of nextFingerprints) codexSideTopologyDiagnosticFingerprints.set(key, signature)
}

function codexSyncInventorySideTopology(relations, depths, rowById, turns, unreadIds, orphanCount = 0) {
  codexCompleteInventoryThreadIds = new Set(rowById.keys())
  for (const [threadId, parentThreadId] of [...codexInventorySideRelations]) {
    if (relations.get(threadId) === parentThreadId) continue
    codexForgetInventorySideRelation(threadId)
  }
  const nextEvidence = new Map()
  const recoveredLiveByParent = new Map()
  for (const [threadId, parentThreadId] of relations) {
    // A row that was previously standalone may already have a public action
    // alias. Once verified as a Side Chat it must not remain a direct-open
    // target while the new root-only package replaces an older Renderer row.
    for (const [alias, action] of codexThreadActions) {
      if (action.threadId === threadId) codexThreadActions.delete(alias)
    }
    const row = codexRecord(rowById.get(threadId))
    const statusSource = codexRecord(row.status)
    const connectorStatus = ['active', 'idle', 'notLoaded', 'systemError'].includes(statusSource.type)
      ? statusSource.type
      : 'notLoaded'
    const activeFlags = connectorStatus === 'active' && Array.isArray(statusSource.activeFlags)
      ? statusSource.activeFlags.filter((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput')
      : []
    const turn = turns.latest.get(threadId)
    codexReconcileInventorySideOpenedReadWithTurn(threadId, parentThreadId, turn)
    const previous = codexInventorySideBranchEvidence.get(threadId)
    const sameTurn = turn
      && previous?.parentThreadId === parentThreadId
      && codexTimestampMs(previous.turnStartedAt) === codexTimestampMs(turn.startedAt)
      && (!turn.id || !previous.turnId || turn.id === previous.turnId)
    // A connector row can lag behind a turn actually running in another
    // process. The fresh targeted latest-Turn read this cycle is itself the
    // verification, so fresh inProgress opens live even on an idle/notLoaded
    // row; a cached inProgress never does (RAW-181#4).
    const turnLive = turn?.status === 'inProgress'
      && (connectorStatus === 'active' || turns.readSucceededIds?.has(threadId) === true)
    if (turnLive && connectorStatus !== 'active') {
      recoveredLiveByParent.set(parentThreadId, (recoveredLiveByParent.get(parentThreadId) || 0) + 1)
    }
    const persistedWaiting = connectorStatus === 'active' && activeFlags.length > 0 && turn?.status !== 'inProgress'
    const activeEvidenceSequence = turnLive
      ? sameTurn && Number(previous?.activeEvidenceSequence) > 0
        ? previous.activeEvidenceSequence
        : codexNextLiveEvidenceSequence()
      : 0
    codexInventorySideRelations.set(threadId, parentThreadId)
    if (turnLive) codexForgetPrivateBranchTerminal(parentThreadId, threadId)
    const terminal = codexReadPrivateBranchTerminal(parentThreadId, threadId)
    const openedRead = codexDesktopOpenedReadAcknowledgements.has(threadId)
    // A machine sub-run (subagent/guardian review) is never user-read, so its
    // permanent desktop unread entry must not pin the parent completed-unread.
    const machineRun = codexSubagentDiscovery?.codexIsMachineRunThread?.(threadId) === true
    const unreadKnown = machineRun || openedRead || unreadIds instanceof Set
    const evidence = {
      parentThreadId,
      status: turnLive || persistedWaiting ? 'active' : connectorStatus,
      activeFlags,
      statusAuthority: turnLive ? 'app-server-live' : persistedWaiting ? 'persisted-decision' : 'connector',
      activityEvidence: turnLive ? 'activity-event' : 'initial-snapshot',
      activeEvidenceSequence,
      unreadKnown,
      hasUnreadTurn: machineRun || openedRead ? false : unreadKnown && unreadIds.has(threadId),
      turnId: typeof turn?.id === 'string' ? turn.id : '',
      turnStartedAt: codexTimestampMs(turn?.startedAt),
      lastTurnStatus: turn?.status || terminal?.lastTurnStatus || '',
      lastTurnEvidence: turnLive ? 'turn-started' : terminal?.lastTurnEvidence || 'inventory',
      terminalEvidenceSequence: Number(terminal?.terminalEvidenceSequence) || 0,
      terminalAt: Number(terminal?.terminalAt) || 0,
      idleConfirmed: terminal?.idleConfirmed === true,
      observedAt: Math.max(
        activeEvidenceSequence,
        Number(terminal?.terminalEvidenceSequence) || 0,
        Number(codexPrivateThreadGoalEvidence(threadId).goalEvidenceSequence) || 0
      )
    }
    nextEvidence.set(threadId, evidence)
  }
  codexInventorySideBranchEvidence.clear()
  for (const [threadId, evidence] of nextEvidence) codexInventorySideBranchEvidence.set(threadId, evidence)
  codexRecordSideTopologyDecision(rowById.size, relations, depths, orphanCount, recoveredLiveByParent)
}

function codexPrivateBranchEvidence(parentThreadId, known) {
  if (!validCodexThreadId(parentThreadId) || !known || typeof known.key !== 'string') return null
  const bridge = codexDesktopBridge
  const ownShadow = bridge?.shadows?.get(parentThreadId)
  const childEntries = bridge?.sideShadows
    ? [...bridge.sideShadows.entries()].filter(([, shadow]) => shadow.parentThreadId === parentThreadId)
    : []
  for (const [threadId, relatedParentThreadId] of codexAllSideRelations()) {
    if (relatedParentThreadId === parentThreadId && !childEntries.some(([candidate]) => candidate === threadId)) {
      childEntries.push([threadId, null])
    }
  }
  const ownDesktopActivity = honorHostExternalProjection(
    parentThreadId,
    known,
    codexDesktopShadowActivity(ownShadow)
  )
  const appServerLive = known.appServerLiveActive === true
    && Number(known.appServerLiveSequence) > 0
    && known.activityEvidence === 'activity-event'
  const appServerBranchThreadId = appServerLive && validCodexThreadId(known.appServerLiveBranchThreadId)
    ? known.appServerLiveBranchThreadId
    : parentThreadId
  const appServerOwn = appServerLive && appServerBranchThreadId === parentThreadId
  const ownActivity = appServerOwn
    ? {
        status: known.status,
        activeFlags: [...(known.activeFlags || [])],
        waitingSince: known.waitingSince,
        planImplementationOnly: known.planImplementationOnly === true
      }
    : ownDesktopActivity || {
        status: known.connectorStatus || 'notLoaded',
        activeFlags: [...(known.connectorActiveFlags || [])],
        waitingSince: known.connectorWaitingSince,
        planImplementationOnly: known.connectorPlanImplementationOnly === true
      }
  const rows = [{
    threadId: parentThreadId,
    activity: ownActivity,
    shadow: ownShadow,
    authority: appServerOwn
      ? 'app-server-live'
      : ownDesktopActivity
        ? 'desktop-live'
        : known.connectorStatusAuthority || 'connector',
    lane: appServerOwn ? 'app-server' : ownDesktopActivity ? 'desktop' : 'connector'
  }, ...childEntries.map(([threadId, shadow]) => {
    const appServerChild = appServerLive && appServerBranchThreadId === threadId
    const inventoryEvidence = codexInventorySideBranchEvidence.get(threadId)
    const desktopActivity = codexDesktopShadowActivity(shadow)
    return {
      threadId,
      activity: appServerChild
        ? {
            status: known.status,
            activeFlags: [...(known.activeFlags || [])],
            waitingSince: known.waitingSince,
            planImplementationOnly: known.planImplementationOnly === true
          }
        : desktopActivity || (inventoryEvidence
          ? {
              status: inventoryEvidence.status,
              activeFlags: [...(inventoryEvidence.activeFlags || [])],
              waitingSince: inventoryEvidence.waitingSince,
              planImplementationOnly: inventoryEvidence.planImplementationOnly === true
            }
          : { status: 'notLoaded', activeFlags: [] }),
      shadow,
      inventoryEvidence,
      authority: appServerChild
        ? 'app-server-live'
        : desktopActivity ? 'desktop-live' : inventoryEvidence?.statusAuthority || 'unavailable',
      lane: appServerChild ? 'app-server' : 'desktop'
    }
  })]
  const branchIsLive = (row) => row.activity?.status === 'active' && (
    (row.authority === 'desktop-live'
      && (row.shadow?.activityEvidence === 'activity-event'
        || (row.activity?.activeFlags || []).length > 0
        || codexInventorySnapshotLiveSequence(parentThreadId, row.threadId, known, row.shadow) > 0))
    || (row.authority === 'app-server-live'
      && (appServerLive || row.inventoryEvidence?.activityEvidence === 'activity-event'))
    || (row.authority === 'persisted-decision'
      && ((row.activity?.activeFlags || []).length > 0 || row.activity?.planImplementationOnly === true))
    || row.activity?.planImplementationOnly === true
    // Host extra-process connector-active is live before Desktop follow. The
    // official follow of these ids is notLoaded, which must not strip flags.
    || codexhostDiscovery?.isExternalThreadId?.(row.threadId) === true
  )
  const exactParentTerminal = ['completed', 'interrupted', 'failed'].includes(known.lastTurnStatus)
    && ['turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(known.lastTurnEvidence)
  const hasRecordedTerminal = rows.some((row) => codexReadPrivateBranchTerminal(parentThreadId, row.threadId))
  const branches = rows.map((row) => {
    const live = branchIsLive(row)
    const desktopUnread = codexDesktopUnreadObservation(
      bridge,
      row.threadId === parentThreadId ? known : null,
      row.threadId,
      row.shadow
    )
    // The machine-run guard must sit above the desktop observation: the
    // parsed native unread set answers for any id, and a subagent/guardian
    // child the user never opens stays in it forever.
    const unread = codexSubagentDiscovery?.codexIsMachineRunThread?.(row.threadId) === true
      ? { hasUnreadTurn: false, unreadAuthority: 'desktop-persisted' }
      : desktopUnread.unreadAuthority !== 'unavailable'
      ? desktopUnread
      : codexDesktopOpenedReadAcknowledgements.has(row.threadId)
        ? { hasUnreadTurn: false, unreadAuthority: 'desktop-live' }
      : row.inventoryEvidence?.unreadKnown === true
        ? {
            hasUnreadTurn: row.inventoryEvidence.hasUnreadTurn === true,
            unreadAuthority: 'desktop-persisted'
          }
        : desktopUnread
    const activeSequence = row.lane === 'app-server'
      ? Number(known.appServerLiveSequence) || Number(known.activeEvidenceSequence) || 0
      : Math.max(
          Number(row.shadow?.activityEventSequence) || 0,
          codexInventorySnapshotLiveSequence(parentThreadId, row.threadId, known, row.shadow),
          Number(row.inventoryEvidence?.activeEvidenceSequence) || 0
        )
    let terminal = codexReadPrivateBranchTerminal(parentThreadId, row.threadId)
    if (live && activeSequence > 0 && activeSequence >= Number(terminal?.terminalEvidenceSequence || Number.MAX_SAFE_INTEGER)) {
      codexForgetPrivateBranchTerminal(parentThreadId, row.threadId)
      terminal = null
    } else if (!terminal && !hasRecordedTerminal && row.threadId === parentThreadId && exactParentTerminal) {
      terminal = {
        lastTurnStatus: known.lastTurnStatus,
        lastTurnEvidence: known.lastTurnEvidence,
        terminalEvidenceSequence: Number(known.terminalEvidenceSequence) || 0,
        activeEvidenceSequence: activeSequence,
        idleConfirmed: known.idleConfirmed === true,
        turnStartedAt: Number(known.lastTurnStartedAt) || 0,
        terminalAt: Number(known.lastTurnCompletedAt) || Number(known.lastTurnStartedAt) || 0,
        observedAt: Number(known.terminalEvidenceSequence) || 0
      }
    }
    const idleConfirmed = Boolean(terminal) && (
      terminal.idleConfirmed === true
      || row.activity?.status === 'idle'
      || row.threadId === parentThreadId && known.idleConfirmed === true
    )
    const terminalStrictlyNewer = Boolean(terminal)
      && Number(terminal.terminalEvidenceSequence) > 0
      && activeSequence > 0
      && Number(terminal.terminalEvidenceSequence) > activeSequence
    const goalEvidence = codexPrivateThreadGoalEvidence(row.threadId)
    const openedRead = codexDesktopOpenedReadAcknowledgements.has(row.threadId)
    return {
      ref: codexPrivateBranchRef(parentThreadId, row.threadId),
      branchKind: row.threadId === parentThreadId ? 'main' : 'side',
      topologyExact: row.threadId === parentThreadId
        || codexInventorySideRelations.get(row.threadId) === parentThreadId,
      unreadKnown: openedRead || unread.unreadAuthority !== 'unavailable',
      hasUnreadTurn: openedRead ? false : unread.hasUnreadTurn === true,
      status: row.activity?.status || 'notLoaded',
      statusAuthority: row.authority,
      activityEvidence: row.shadow?.activityEvidence === 'activity-event'
        || row.lane === 'app-server'
        || row.inventoryEvidence?.activityEvidence === 'activity-event'
        ? 'activity-event'
        : 'initial-snapshot',
      activeFlags: live ? [...(row.activity?.activeFlags || [])] : [],
      planImplementationOnly: row.activity?.planImplementationOnly === true,
      planReady: known.planReady === true || row.activity?.planImplementationOnly === true,
      planLifecycleState: known.planLifecycleState === 'cleared'
        ? 'cleared'
        : known.planReady === true || row.activity?.planImplementationOnly === true ? 'ready' : 'unknown',
      planLifecycleRevision: Number(known.planLifecycleRevision) || 0,
      ...(['cancel', 'execution-start', 'archive', 'removal'].includes(known.planClearReason)
        ? { planClearReason: known.planClearReason }
        : {}),
      ...goalEvidence,
      ...(live && !terminalStrictlyNewer
        ? {
            lastTurnStatus: 'inProgress',
            lastTurnEvidence: 'turn-started',
            activeEvidenceSequence: activeSequence || Number(known.activeEvidenceSequence) || 0,
            idleConfirmed: false
          }
        : terminal
          ? {
              lastTurnStatus: terminal.lastTurnStatus,
              lastTurnEvidence: terminal.lastTurnEvidence,
              terminalEvidenceSequence: Number(terminal.terminalEvidenceSequence) || 0,
              activeEvidenceSequence: Number(terminal.activeEvidenceSequence) || activeSequence,
              idleConfirmed
            }
          : (row.inventoryEvidence?.lastTurnStatus
              || row.threadId === parentThreadId && (known.connectorLastTurnStatus || known.lastTurnStatus))
            ? {
                // Inventory contributes cold baseline topology/status only. It
                // deliberately carries no terminal sequence and therefore
                // cannot close a newer real-time branch in the Kernel.
                lastTurnStatus: row.inventoryEvidence?.lastTurnStatus
                  || known.connectorLastTurnStatus
                  || known.lastTurnStatus,
                lastTurnEvidence: 'inventory',
                terminalEvidenceSequence: 0,
                activeEvidenceSequence: activeSequence,
                idleConfirmed: false
              }
          : {}),
      waitingSince: Number(row.activity?.waitingSince) || 0,
      turnStartedAt: Number(terminal?.turnStartedAt)
        || Number(row.inventoryEvidence?.turnStartedAt)
        || (row.threadId === parentThreadId && !live ? Number(known.connectorLastTurnStartedAt) || 0 : 0)
        || Number(known.lastTurnStartedAt)
        || 0,
      terminalAt: Number(terminal?.terminalAt)
        || (terminal?.lastTurnStatus === 'completed' ? Number(known.lastTurnCompletedAt) || 0 : Number(terminal?.turnStartedAt) || 0),
      transitionAt: live
        ? Math.max(
            Number(row.activity?.waitingSince) || 0,
            Number(row.activity?.desktopActiveSince) || 0,
            Number(row.inventoryEvidence?.turnStartedAt) || 0,
            Number(known.lastTurnStartedAt) || 0
          )
        : Math.max(Number(terminal?.terminalAt) || 0, Number(terminal?.turnStartedAt) || 0),
      observedAt: Math.max(
        Number(row.shadow?.activityRevision) || 0,
        activeSequence,
        Number(terminal?.terminalEvidenceSequence) || 0,
        Number(terminal?.observedAt) || 0,
        Number(row.inventoryEvidence?.observedAt) || 0,
        Number(known.terminalEvidenceSequence) || 0,
        Number(known.activityRevision) || 0,
        Number(goalEvidence.goalEvidenceSequence) || 0
      )
    }
  })
  return {
    key: known.key,
    complete: true,
    observedAt: Math.max(0, ...branches.map((branch) => Number(branch.observedAt) || 0)),
    branches
  }
}

function codexThreadAlias(threadId, now, metadata = {}) {
  const key = codexThreadKey(threadId)
  for (const [alias, entry] of codexThreadActions) {
    if (entry.expiresAt <= now) codexThreadActions.delete(alias)
    else if (entry.key === key && entry.threadId === threadId) {
      entry.expiresAt = now + CODEX_THREAD_ALIAS_TTL_MS
      entry.projectKey = metadata.projectKey || entry.projectKey || ''
      entry.sourceFingerprint = metadata.sourceFingerprint || entry.sourceFingerprint || ''
      entry.cwd = metadata.cwd || entry.cwd || ''
      return { key, alias }
    }
  }
  const alias = `ct_${crypto.randomBytes(18).toString('base64url')}`
  codexThreadActions.set(alias, {
    key,
    threadId,
    expiresAt: now + CODEX_THREAD_ALIAS_TTL_MS,
    projectKey: metadata.projectKey || '',
    sourceFingerprint: metadata.sourceFingerprint || '',
    cwd: metadata.cwd || ''
  })
  return { key, alias }
}

function codexNativeString(value, maximum = 240) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f]/.test(value) ? value : ''
}

function codexNormalizeNativeRoot(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const pathApi = process.platform === 'win32' ? path.win32 : path
  if (!pathApi.isAbsolute(value)) return ''
  let normalized = pathApi.normalize(value)
  try {
    if (fs.existsSync(normalized)) normalized = fs.realpathSync(normalized)
  } catch {}
  normalized = pathApi.normalize(normalized).replace(/[\\/]+$/, '') || pathApi.parse(normalized).root
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function codexNativeStatePaths() {
  return codexNativeStatePathsModule
    ? codexNativeStatePathsModule.codexNativeStatePaths()
    : { codexHome: '', primary: '', backup: '' }
}

function readCodexNativeRegistry() {
  const { primary } = codexNativeStatePaths()
  const candidates = [primary, `${primary}.bak`]
  let lastError = null
  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate)
      if (!stat || typeof stat.size !== 'number' || stat.size <= 0 || stat.size > CODEX_NATIVE_STATE_MAX_BYTES) throw codexError('protocol-error', 'Codex native project state is invalid')
      return parseCodexNativeRegistryText(fs.readFileSync(candidate, 'utf8'))
    } catch (error) {
      lastError = error
    }
  }
  if (lastError && codexRecord(lastError).code === 'protocol-error') throw lastError
  throw codexError('protocol-error', 'Codex native project state is unavailable')
}

/** The desktop unread set flips whole groups when its read outcome flips, so
 * transitions (ok<->failed, size changes) are logged; steady reads are not. */
let codexDesktopUnreadReadLastLine = ''
function codexNoteDesktopUnreadRead(outcome, size) {
  const line = `${outcome}:${size}`
  if (line === codexDesktopUnreadReadLastLine) return
  codexDesktopUnreadReadLastLine = line
  runtimeDiagnostics.record({
    level: outcome === 'ok' ? 'info' : 'error',
    scope: 'task-evidence',
    event: 'desktop-unread-read',
    outcome,
    provider: 'codex',
    details: { size }
  })
}

function readCodexDesktopUnreadIds() {
  try {
    const result = readCodexDesktopUnreadIdsInner()
    codexNoteDesktopUnreadRead('ok', result.size)
    return result
  } catch (error) {
    codexNoteDesktopUnreadRead('failed', -1)
    throw error
  }
}

function readCodexDesktopUnreadIdsInner() {
  const { primary } = codexNativeStatePaths()
  const stat = fs.statSync(primary)
  if (!stat || typeof stat.size !== 'number' || stat.size <= 0 || stat.size > CODEX_NATIVE_STATE_MAX_BYTES) {
    throw codexError('protocol-error', 'Codex desktop unread state is invalid')
  }
  let parsed
  try { parsed = JSON.parse(fs.readFileSync(primary, 'utf8')) } catch {
    throw codexError('protocol-error', 'Codex desktop unread state is invalid')
  }
  const atomsValue = codexRecord(parsed)['electron-persisted-atom-state']
  let atoms
  try { atoms = typeof atomsValue === 'string' ? codexRecord(JSON.parse(atomsValue)) : codexRecord(atomsValue) } catch {
    throw codexError('protocol-error', 'Codex desktop unread state is invalid')
  }
  const byHostValue = atoms['unread-thread-ids-by-host-v1']
  let byHost
  try { byHost = typeof byHostValue === 'string' ? codexRecord(JSON.parse(byHostValue)) : codexRecord(byHostValue) } catch {
    throw codexError('protocol-error', 'Codex desktop unread state is invalid')
  }
  const local = byHost.local
  if (!Array.isArray(local) || local.length > 100_000 || local.some((threadId) => !validCodexThreadId(threadId))) {
    throw codexError('protocol-error', 'Codex desktop unread state is invalid')
  }
  return new Set(local)
}

// A failed load leaves the runtime phase unknown rather than misread: the
// caller already widens its evidence search on an unknown result.
function codexRolloutRuntimeStateText(text) {
  return codexRolloutRuntimeState
    ? codexRolloutRuntimeState.codexRolloutRuntimeStateText(text)
    : { known: false, phase: 'unknown', edge: 'none', startedAt: 0, edgeAt: 0 }
}

function codexPathInside(root, candidate) {
  return codexNativeStatePathsModule ? codexNativeStatePathsModule.codexPathInside(root, candidate) : false
}

function codexThreadRolloutCandidate(thread) {
  return codexNativeStatePathsModule ? codexNativeStatePathsModule.codexThreadRolloutCandidate(thread) : null
}

function codexReadRolloutTail(candidate, stat, maximumBytes) {
  let descriptor = null
  try {
    const length = Math.min(stat.size, maximumBytes)
    const buffer = Buffer.alloc(length)
    descriptor = fs.openSync(candidate, 'r')
    const bytesRead = fs.readSync(descriptor, buffer, 0, length, stat.size - length)
    let text = buffer.subarray(0, bytesRead).toString('utf8')
    if (stat.size > length) {
      const firstNewline = text.indexOf('\n')
      text = firstNewline >= 0 ? text.slice(firstNewline + 1) : ''
    }
    return text
  } catch {
    return ''
  } finally {
    try { if (descriptor !== null) fs.closeSync(descriptor) } catch {}
  }
}

function codexThreadHasPersistedPendingInput(thread, lastTurn) {
  if (!thread || typeof thread.path !== 'string' || !lastTurn
    || !['interrupted', 'failed', 'inProgress'].includes(lastTurn.status)) return false
  const rollout = codexThreadRolloutCandidate(thread)
  if (!rollout) return false
  const { candidate, stat } = rollout
  const cached = codexThreadPendingInputCache.get(candidate)
  const mtimeMs = codexTimestampMs(stat.mtimeMs)
  if (cached && cached.size === stat.size && cached.mtimeMs === mtimeMs) return cached.pending === true
  const text = codexReadRolloutTail(candidate, stat, CODEX_ROLLOUT_PENDING_INPUT_TAIL_BYTES)
  const state = codexRolloutPendingUserInputStateText(text)
  codexThreadPendingInputCache.set(candidate, {
    size: stat.size,
    mtimeMs,
    pending: state.pending,
    correlations: state.correlations
  })
  return state.pending
}

function codexThreadHasPersistedPendingPlan(thread, lastTurn) {
  if (!lastTurn || lastTurn.status !== 'completed') return false
  return codexThreadPersistedPlanLifecycle(thread, lastTurn).planReady === true
}

function codexThreadPersistedPlanLifecycle(thread, lastTurn) {
  const empty = { known: false, planReady: false, planLifecycleState: 'unknown', planLifecycleRevision: 0, planClearReason: '', turnMode: 'unknown' }
  if (!lastTurn) return empty
  const rollout = codexThreadRolloutCandidate(thread)
  if (!rollout) return empty
  const { candidate, stat } = rollout
  const mtimeMs = codexTimestampMs(stat.mtimeMs)
  const cached = codexThreadPendingPlanCache.get(candidate)
  if (cached && cached.size === stat.size && cached.mtimeMs === mtimeMs) {
    return codexRolloutEvidence?.codexRolloutNormalizedPlanLifecycle(cached, lastTurn) || empty
  }
  let state = empty
  for (const maximumBytes of CODEX_ROLLOUT_PENDING_PLAN_TAIL_BYTES) {
    state = codexRolloutPendingPlanStateText(codexReadRolloutTail(candidate, stat, maximumBytes))
    if (state.known || maximumBytes >= stat.size) break
  }
  const normalized = codexRolloutEvidence?.codexRolloutNormalizedPlanLifecycle(state, lastTurn) || empty
  codexThreadPendingPlanCache.set(candidate, {
    size: stat.size,
    mtimeMs,
    pending: normalized.planReady,
    ...normalized
  })
  return normalized
}

function codexCloseRolloutDecisionTracker(tracker) {
  if (!tracker) return
  try { tracker.watcher?.close() } catch {}
  tracker.watcher = null
  if (tracker.statWatcherActive && typeof fs.unwatchFile === 'function') {
    try { fs.unwatchFile(tracker.candidate) } catch {}
  }
  tracker.statWatcherActive = false
}

function codexClearRolloutDecisionTrackers() {
  if (codexRolloutProcessProbeTimer) clearTimeout(codexRolloutProcessProbeTimer)
  codexRolloutProcessProbeTimer = null
  codexRolloutProcessProbeGeneration += 1
  codexRolloutProcessProbeInFlight = false
  codexRolloutProcessProbePending = false
  for (const tracker of codexRolloutDecisionTrackers.values()) codexCloseRolloutDecisionTracker(tracker)
  codexRolloutDecisionTrackers.clear()
}

function codexRolloutDecisionState(candidate, stat, initialCorrelations) {
  const inputText = codexReadRolloutTail(candidate, stat, CODEX_ROLLOUT_PENDING_INPUT_TAIL_BYTES)
  const input = codexRolloutPendingUserInputStateText(inputText, initialCorrelations)
  const runtime = codexRolloutRuntimeStateText(inputText)
  let plan = { known: false, pending: false, planReady: false, planLifecycleState: 'unknown', planLifecycleRevision: 0, planClearReason: '', turnMode: 'unknown' }
  for (const maximumBytes of CODEX_ROLLOUT_PENDING_PLAN_TAIL_BYTES) {
    plan = codexRolloutPendingPlanStateText(codexReadRolloutTail(candidate, stat, maximumBytes))
    if (plan.known || maximumBytes >= stat.size) break
  }
  const mtimeMs = codexTimestampMs(stat.mtimeMs)
  codexThreadPendingInputCache.set(candidate, {
    size: stat.size,
    mtimeMs,
    pending: input.pending,
    correlations: input.correlations
  })
  const normalizedPlan = codexRolloutEvidence?.codexRolloutNormalizedPlanLifecycle(plan, {}) || plan
  codexThreadPendingPlanCache.set(candidate, {
    size: stat.size,
    mtimeMs,
    pending: normalizedPlan.planReady === true,
    ...normalizedPlan
  })
  return { input, plan, runtime }
}

function codexApplyRolloutLiveActive(tracker, known, runtime) {
  const bridge = codexEnsureDesktopBridge()
  if (tracker.rolloutLiveSequence
    && tracker.rolloutLiveSequence === known.appServerLiveSequence
    && known.appServerLiveActive === true) return false
  codexForgetPrivateBranchTerminal(tracker.threadId, tracker.threadId)
  bridge.cancelWaitingEdgeRefresh(tracker.threadId)
  bridge.clearOrphanedPending(tracker.threadId)
  codexClearDesktopOpenedRead(bridge, tracker.threadId)
  const sequence = codexMarkAppServerLiveActive(
    known,
    undefined,
    tracker.threadId,
    tracker.rolloutLiveSequence !== known.appServerLiveSequence
  )
  tracker.rolloutLiveSequence = sequence
  bridge.clearWaitingEvidence(
    tracker.threadId,
    ['waitingOnUserInput', 'waitingOnApproval'],
    { sequence }
  )
  known.status = 'active'
  known.activeFlags = []
  known.planImplementationOnly = false
  delete known.waitingSince
  known.statusAuthority = 'app-server-live'
  known.activityEvidence = 'activity-event'
  known.activityRevision = Math.max(Number(known.activityRevision) || 0, sequence)
  known.lastTurnStatus = 'inProgress'
  if (codexTimestampMs(runtime.startedAt)) {
    known.lastTurnStartedAt = codexTimestampMs(runtime.startedAt)
    known.lastTurnEvidence = 'turn-started'
  } else delete known.lastTurnEvidence
  delete known.lastTurnId
  delete known.lastTurnCompletedAt
  delete known.terminalEvidenceSequence
  known.idleConfirmed = false
  delete known.desktopActiveSince
  codexThreadTurnStatusCache.delete(tracker.threadId)
  bridge.cancelLatestTurnRefresh(tracker.threadId)
  bridge.cancelCompletionUnreadRefresh(tracker.threadId)
  return true
}

function codexApplyRolloutTerminal(tracker, known, runtime) {
  const status = runtime.phase === 'completed'
    ? 'completed'
    : runtime.phase === 'interrupted' ? 'interrupted' : ''
  const startedAt = codexTimestampMs(runtime.startedAt)
    || codexTimestampMs(known.lastTurnStartedAt)
    || codexTimestampMs(tracker.lastTurnStartedAt)
  if (!status || !startedAt) return false
  tracker.rolloutLiveSequence = 0
  return codexApplyCompletedTurnNotification(
    codexEnsureDesktopBridge(),
    known,
    tracker.threadId,
    {
      status,
      startedAt,
      ...(status === 'completed' && codexTimestampMs(runtime.edgeAt)
        ? { completedAt: codexTimestampMs(runtime.edgeAt) }
        : {})
    },
    { deferPublish: true }
  )
}

function codexRestoreRolloutFallback(tracker) {
  const known = codexActivityInventory.get(tracker.threadId)
  if (!known || !tracker.rolloutLiveSequence
    || known.appServerLiveSequence !== tracker.rolloutLiveSequence) return false
  const before = JSON.stringify(codexActivityPublicEntry(known))
  tracker.rolloutLiveSequence = 0
  codexClearAppServerLiveActive(known)
  codexRestoreConnectorActivity(known)
  known.activityEvidence = 'connector'
  const lastTurnStatus = ['completed', 'interrupted', 'failed', 'inProgress'].includes(known.connectorLastTurnStatus)
    ? known.connectorLastTurnStatus
    : tracker.lastTurnStatus
  const lastTurnStartedAt = codexTimestampMs(known.connectorLastTurnStartedAt)
    || codexTimestampMs(tracker.lastTurnStartedAt)
  if (lastTurnStatus && lastTurnStartedAt) {
    known.lastTurnStatus = lastTurnStatus
    known.lastTurnStartedAt = lastTurnStartedAt
    if (lastTurnStatus === 'completed' && codexTimestampMs(tracker.lastTurnCompletedAt)) {
      known.lastTurnCompletedAt = codexTimestampMs(tracker.lastTurnCompletedAt)
    } else delete known.lastTurnCompletedAt
    if (codexIsConfirmedTurnEvidence(tracker.lastTurnEvidence)) {
      const terminalEvidenceSequence = codexMarkConfirmedTerminalEvidence(known, tracker.lastTurnEvidence)
      codexRememberPrivateBranchTerminal(
        tracker.threadId,
        tracker.threadId,
        { status: lastTurnStatus, startedAt: lastTurnStartedAt, completedAt: tracker.lastTurnCompletedAt },
        tracker.lastTurnEvidence,
        { terminalEvidenceSequence, idleConfirmed: tracker.idleConfirmed === true }
      )
    } else delete known.lastTurnEvidence
  }
  const changed = before !== JSON.stringify(codexActivityPublicEntry(known))
  if (changed) emitCodexActivityDelta([known], false)
  return changed
}

function codexApplyRolloutDecisionState(tracker, state, emit = true, options = {}) {
  const known = codexActivityInventory.get(tracker.threadId)
  if (!known) return false
  const bridge = codexEnsureDesktopBridge()
  const before = JSON.stringify(codexActivityPublicEntry(known))
  let completedRuntime = false
  if (options.observeRuntime === true && state.runtime?.phase === 'active') {
    codexApplyRolloutLiveActive(tracker, known, state.runtime)
  } else if (options.observeRuntime === true
    && (state.runtime?.phase === 'completed' || state.runtime?.phase === 'interrupted')) {
    completedRuntime = state.runtime.phase === 'completed'
    codexApplyRolloutTerminal(tracker, known, state.runtime)
  }
  const planClearPatch = codexRolloutEvidence?.codexRolloutPlanClearPatch(known, state.plan)
  if (planClearPatch) Object.assign(known, planClearPatch)
  const lastTurnStatus = known.lastTurnStatus || known.connectorLastTurnStatus || tracker.lastTurnStatus
  const pendingInput = ['interrupted', 'failed', 'inProgress'].includes(lastTurnStatus)
    && state.input.pending === true
  const pendingPlan = lastTurnStatus === 'completed' && state.plan.pending === true
  const pending = pendingInput || pendingPlan
  const mainShadow = bridge.shadows.get(tracker.threadId)
  const hasCurrentLiveOwner = mainShadow && !mainShadow.ownerDisconnectedAt
  const hadCurrentLiveWaiting = hasCurrentLiveOwner && codexDesktopHasStickyPendingRequest(mainShadow)
  bridge.cancelWaitingEdgeRefresh(tracker.threadId)

  if (pending) {
    const waitingEdge = codexReduceWaitingEdge({
      flags: ['waitingOnUserInput'],
      previousFlags: known.connectorActiveFlags,
      previousWaitingSince: known.connectorWaitingSince,
      evidenceAt: codexTimestampMs(known.lastTurnCompletedAt)
        || codexTimestampMs(known.lastTurnStartedAt)
    })
    known.connectorStatus = 'active'
    known.connectorActiveFlags = waitingEdge.flags
    known.connectorStatusAuthority = 'persisted-decision'
    known.connectorPlanImplementationOnly = pendingPlan && !pendingInput
    known.connectorWaitingSince = waitingEdge.waitingSince
    if (tracker.rolloutLiveSequence && known.appServerLiveSequence === tracker.rolloutLiveSequence) {
      known.status = 'active'
      known.activeFlags = [...waitingEdge.flags]
      known.planImplementationOnly = pendingPlan && !pendingInput
      known.waitingSince = waitingEdge.waitingSince
      known.statusAuthority = 'persisted-decision'
      known.activityEvidence = 'activity-event'
    } else if (!hasCurrentLiveOwner && known.statusAuthority !== 'app-server-live') {
      codexRestoreConnectorActivity(known)
      known.activityEvidence = 'connector'
    } else if (!codexDesktopHasStickyPendingRequest(mainShadow)) {
      bridge.scheduleWaitingEdgeRefresh(tracker.threadId)
    }
  } else if (known.connectorStatusAuthority === 'persisted-decision') {
    const resumed = state.input.edge === 'resume'
    known.connectorStatus = resumed
      ? 'active'
      : ['active', 'idle', 'notLoaded', 'systemError'].includes(known.rolloutFallbackStatus)
        ? known.rolloutFallbackStatus
        : 'notLoaded'
    known.connectorActiveFlags = resumed
      ? []
      : known.connectorStatus === 'active'
        ? [...(known.rolloutFallbackActiveFlags || [])]
        : []
    known.connectorStatusAuthority = 'connector'
    known.connectorPlanImplementationOnly = false
    delete known.connectorWaitingSince
    if (mainShadow?.ownerDisconnectedAt) bridge.clearOrphanedPending(tracker.threadId)
    if (resumed) {
      const sameRolloutEpoch = tracker.rolloutLiveSequence
        && tracker.rolloutLiveSequence === known.appServerLiveSequence
        && known.appServerLiveActive === true
      const sequence = sameRolloutEpoch
        ? tracker.rolloutLiveSequence
        : codexMarkAppServerLiveActive(known, undefined, tracker.threadId, true)
      tracker.rolloutLiveSequence = sequence
      bridge.clearWaitingEvidence(
        tracker.threadId,
        ['waitingOnUserInput'],
        { sequence }
      )
      const remainingWaitingFlags = known.activeFlags
        .filter((flag) => flag === 'waitingOnApproval')
      known.status = 'active'
      known.activeFlags = remainingWaitingFlags
      known.planImplementationOnly = false
      if (!remainingWaitingFlags.length) delete known.waitingSince
      delete known.desktopActiveSince
      known.statusAuthority = remainingWaitingFlags.length && hasCurrentLiveOwner
        ? 'desktop-live'
        : 'app-server-live'
      known.activityEvidence = 'activity-event'
    } else if (known.statusAuthority !== 'desktop-live' && known.statusAuthority !== 'app-server-live') {
      codexRestoreConnectorActivity(known)
      known.activityEvidence = 'connector'
    }
    if (hadCurrentLiveWaiting) {
      bridge.scheduleWaitingEdgeRefresh(tracker.threadId)
    }
  }

  const changed = before !== JSON.stringify(codexActivityPublicEntry(known))
  if (changed && emit) {
    emitCodexActivityDelta([known], false)
    if (completedRuntime
      && known.hasUnreadTurn !== true
      && !codexDesktopOpenedReadCoversCompletion(tracker.threadId, known)) {
      bridge.scheduleCompletionUnreadRefresh(tracker.threadId)
    }
  }
  return changed
}

function codexRefreshRolloutDecisionTracker(threadId, options = {}) {
  const tracker = codexRolloutDecisionTrackers.get(threadId)
  if (!tracker) return false
  let rollout
  let appended = false
  try {
    const stat = fs.statSync(tracker.candidate)
    if (!stat?.isFile?.() || !Number.isFinite(stat.size) || stat.size <= 0) return false
    const signature = `${stat.size}:${codexTimestampMs(stat.mtimeMs)}`
    if (signature === tracker.signature && options.force !== true) return false
    appended = Number.isFinite(tracker.size) && stat.size > tracker.size
    tracker.signature = signature
    tracker.size = stat.size
    rollout = { stat, state: codexRolloutDecisionState(tracker.candidate, stat, tracker.inputCorrelations) }
  } catch {
    return false
  }
  tracker.inputCorrelations = rollout.state.input.correlations
  return codexApplyRolloutDecisionState(
    tracker,
    rollout.state,
    options.emit !== false,
    { observeRuntime: options.observeRuntime === true || appended }
  )
}

function codexRefreshRolloutDecisionTrackers(options = {}) {
  let changed = false
  for (const threadId of codexRolloutDecisionTrackers.keys()) {
    changed = codexRefreshRolloutDecisionTracker(threadId, options) || changed
  }
  return changed
}

function codexProbeExternalRolloutProcesses(candidates) {
  if (process.platform !== 'darwin' || typeof execFile !== 'function') return Promise.resolve(null)
  const paths = [...new Set((Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => typeof candidate === 'string' && candidate && !/[\r\n]/.test(candidate)))]
  if (!paths.length) return Promise.resolve(new Set())
  return new Promise((resolve) => {
    execFile('/usr/sbin/lsof', ['-n', '-Fpcn', '--', ...paths], {
      windowsHide: true,
      timeout: 3_000,
      maxBuffer: 256 * 1024
    }, (error, stdout) => {
      const code = codexRecord(error).code
      if (error && code !== 1 && String(code) !== '1') {
        resolve(null)
        return
      }
      const exact = new Set(paths)
      const opened = new Set()
      const ownPid = Number(codexProcess?.pid) || 0
      let pid = 0
      let command = ''
      for (const line of String(stdout || '').split(/\r?\n/)) {
        if (!line) continue
        if (line[0] === 'p') {
          pid = Number(line.slice(1)) || 0
          command = ''
        } else if (line[0] === 'c') command = line.slice(1).toLowerCase()
        else if (line[0] === 'n') {
          const candidate = line.slice(1)
          if (pid > 0 && pid !== ownPid && command.startsWith('codex') && exact.has(candidate)) {
            opened.add(candidate)
          }
        }
      }
      resolve(opened)
    })
  })
}

function codexScheduleRolloutProcessProbe(delay = 0) {
  if (!codexRolloutDecisionTrackers.size) return
  if (codexRolloutProcessProbeInFlight) {
    codexRolloutProcessProbePending = true
    return
  }
  if (codexRolloutProcessProbeTimer) {
    if (delay > 0) return
    clearTimeout(codexRolloutProcessProbeTimer)
  }
  const generation = codexRolloutProcessProbeGeneration
  const fullProbe = Math.max(0, Number(delay) || 0) === 0
  codexRolloutProcessProbeTimer = setTimeout(async () => {
    codexRolloutProcessProbeTimer = null
    if (generation !== codexRolloutProcessProbeGeneration || !codexRolloutDecisionTrackers.size) return
    const trackers = [...codexRolloutDecisionTrackers.values()]
      .filter((tracker) => fullProbe || tracker.externalOpen === true || Number(tracker.rolloutLiveSequence) > 0)
    if (!trackers.length) return
    codexRolloutProcessProbeInFlight = true
    const signatures = new Map(trackers.map((tracker) => [tracker.threadId, tracker.signature]))
    let opened = null
    try {
      opened = await codexProbeExternalRolloutProcesses(trackers.map((tracker) => tracker.candidate))
    } catch {}
    const probeAvailable = opened instanceof Set
    if (generation === codexRolloutProcessProbeGeneration && probeAvailable) {
      for (const tracker of trackers) {
        if (codexRolloutDecisionTrackers.get(tracker.threadId) !== tracker) continue
        const externalOpen = opened.has(tracker.candidate)
        tracker.externalOpen = externalOpen
        if (externalOpen) {
          codexRefreshRolloutDecisionTracker(tracker.threadId, {
            force: true,
            observeRuntime: true
          })
        } else if (tracker.signature === signatures.get(tracker.threadId)) {
          codexRestoreRolloutFallback(tracker)
        } else codexRolloutProcessProbePending = true
      }
    }
    if (generation !== codexRolloutProcessProbeGeneration) return
    codexRolloutProcessProbeInFlight = false
    const pending = codexRolloutProcessProbePending
    codexRolloutProcessProbePending = false
    const hasLiveRollout = [...codexRolloutDecisionTrackers.values()]
      .some((tracker) => Number(tracker.rolloutLiveSequence) > 0)
    if (probeAvailable && pending) codexScheduleRolloutProcessProbe(0)
    else if (probeAvailable && hasLiveRollout) codexScheduleRolloutProcessProbe(CODEX_ROLLOUT_PROCESS_PROBE_MS)
  }, Math.max(0, Number(delay) || 0))
  codexRolloutProcessProbeTimer.unref?.()
}

function codexArmRolloutDecisionWatcher(tracker) {
  const refresh = () => {
    if (codexRolloutDecisionTrackers.get(tracker.threadId) !== tracker) return
    codexRefreshRolloutDecisionTracker(tracker.threadId)
  }
  if (!tracker.statWatcherActive && typeof fs.watchFile === 'function') {
    try {
      fs.watchFile(tracker.candidate, {
        persistent: false,
        interval: CODEX_NATIVE_STATE_RECOVERY_INTERVAL_MS
      }, () => {
        refresh()
        if (!tracker.watcher) {
          tracker.watcherRetryAvailable = true
          codexArmRolloutDecisionWatcher(tracker)
        }
      })
      tracker.statWatcherActive = true
    } catch {
      tracker.statWatcherActive = false
    }
  }
  if (!tracker.watcher && typeof fs.watch === 'function') {
    try {
      tracker.watcher = fs.watch(path.dirname(tracker.candidate), { persistent: false }, (_event, filename) => {
        if (filename && String(filename) !== path.basename(tracker.candidate)) return
        tracker.watcherRetryAvailable = true
        refresh()
      })
      tracker.watcher.unref?.()
      const watcher = tracker.watcher
      watcher.on?.('error', () => {
        if (tracker.watcher !== watcher) return
        try { watcher.close() } catch {}
        tracker.watcher = null
        if (!tracker.watcherRetryAvailable) return
        tracker.watcherRetryAvailable = false
        queueMicrotask(() => {
          if (codexRolloutDecisionTrackers.get(tracker.threadId) === tracker) codexArmRolloutDecisionWatcher(tracker)
        })
      })
    } catch {
      tracker.watcher = null
    }
  }
}

function codexSyncRolloutDecisionTrackers(rows, turnStatuses) {
  const retained = new Set()
  for (const raw of rows) {
    const thread = codexRecord(raw)
    const lastTurn = turnStatuses.get(thread.id)
    if (!validCodexThreadId(thread.id) || !lastTurn
      || !['interrupted', 'failed', 'inProgress', 'completed'].includes(lastTurn.status)) continue
    const rollout = codexThreadRolloutCandidate(thread)
    if (!rollout) continue
    retained.add(thread.id)
    const signature = `${rollout.stat.size}:${codexTimestampMs(rollout.stat.mtimeMs)}`
    let tracker = codexRolloutDecisionTrackers.get(thread.id)
    if (tracker && tracker.candidate !== rollout.candidate) {
      codexCloseRolloutDecisionTracker(tracker)
      tracker = null
    }
    if (tracker) {
      // Inventory refreshes and fs.watch callbacks race on the same rollout.
      // Reduce an unseen append before advancing the tracker's baseline, or the
      // refresh can consume the only live edge and leave stale terminal state.
      codexRefreshRolloutDecisionTracker(thread.id, { emit: false })
    }
    if (!tracker) {
      tracker = {
        threadId: thread.id,
        candidate: rollout.candidate,
        signature,
        size: rollout.stat.size,
        lastTurnStatus: lastTurn.status,
        lastTurnStartedAt: lastTurn.startedAt,
        lastTurnCompletedAt: lastTurn.completedAt,
        lastTurnEvidence: lastTurn.status === 'interrupted' || lastTurn.status === 'failed'
          ? 'targeted-after-exit'
          : 'inventory',
        idleConfirmed: lastTurn.status === 'interrupted' || lastTurn.status === 'failed',
        inputCorrelations: new Set(),
        externalOpen: false,
        rolloutLiveSequence: 0,
        watcher: null,
        statWatcherActive: false,
        watcherRetryAvailable: true
      }
      codexRolloutDecisionTrackers.set(thread.id, tracker)
    } else {
      tracker.lastTurnStatus = lastTurn.status
      tracker.lastTurnStartedAt = lastTurn.startedAt
      tracker.lastTurnCompletedAt = lastTurn.completedAt
      tracker.lastTurnEvidence = lastTurn.status === 'interrupted' || lastTurn.status === 'failed'
        ? 'targeted-after-exit'
        : 'inventory'
      tracker.idleConfirmed = lastTurn.status === 'interrupted' || lastTurn.status === 'failed'
    }
    const inputCache = codexThreadPendingInputCache.get(rollout.candidate)
    if (inputCache?.size === rollout.stat.size
      && inputCache.mtimeMs === codexTimestampMs(rollout.stat.mtimeMs)
      && inputCache.correlations instanceof Set) {
      tracker.inputCorrelations = new Set(inputCache.correlations)
    }
    codexArmRolloutDecisionWatcher(tracker)
  }
  for (const [threadId, tracker] of [...codexRolloutDecisionTrackers]) {
    if (retained.has(threadId)) continue
    codexCloseRolloutDecisionTracker(tracker)
    codexRolloutDecisionTrackers.delete(threadId)
  }
  codexScheduleRolloutProcessProbe(0)
}

function readCodexNativePrimaryState() {
  const paths = codexNativeStatePaths()
  const stat = fs.statSync(paths.primary)
  if (!stat || typeof stat.size !== 'number' || stat.size <= 0 || stat.size > CODEX_NATIVE_STATE_MAX_BYTES) {
    throw codexError('protocol-error', 'Codex native project state is invalid')
  }
  const buffer = fs.readFileSync(paths.primary)
  const text = buffer.toString('utf8')
  let value
  try { value = JSON.parse(text) } catch { throw codexError('protocol-error', 'Codex native project state is invalid') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw codexError('protocol-error', 'Codex native project state is invalid')
  return { paths, stat, buffer, value, registry: parseCodexNativeRegistryText(text) }
}

function codexProbeExactProcess(command, args, noMatchCode = 1) {
  return codexDesktopProcessProbe
    ? codexDesktopProcessProbe.codexProbeExactProcess(command, args, noMatchCode)
    : Promise.resolve(false)
}

async function codexDesktopIsRunning() {
  return codexDesktopProcessProbe ? codexDesktopProcessProbe.codexDesktopIsRunning() : false
}

function codexWriteSyncedTemp(target, data, mode) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.tmp-${Date.now()}-${crypto.randomUUID()}`)
  const descriptor = fs.openSync(temporary, 'wx', mode)
  try {
    fs.writeFileSync(descriptor, data)
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
  return temporary
}

function codexSyncDirectory(directory) {
  let descriptor = null
  try {
    descriptor = fs.openSync(directory, 'r')
    fs.fsyncSync(descriptor)
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor)
  }
}

function codexRestoreAtomicFile(target, previous, mode) {
  if (previous === null) {
    if (fs.existsSync(target)) fs.unlinkSync(target)
    return
  }
  const temporary = codexWriteSyncedTemp(target, previous, mode)
  fs.renameSync(temporary, target)
}

function codexRemoveTemporaryFile(target) {
  try {
    if (target && fs.existsSync(target)) fs.unlinkSync(target)
  } catch {}
}

function codexProjectActionAlias(project, sourceFingerprint, now) {
  for (const [alias, entry] of codexProjectActions) {
    if (entry.expiresAt <= now) codexProjectActions.delete(alias)
    else if (entry.projectKey === project.key) {
      entry.expiresAt = now + CODEX_THREAD_ALIAS_TTL_MS
      entry.sourceFingerprint = sourceFingerprint
      entry.projectId = project.id || ''
      entry.kind = project.kind || 'project'
      return alias
    }
  }
  const alias = `cp_${crypto.randomBytes(18).toString('base64url')}`
  codexProjectActions.set(alias, {
    projectKey: project.key,
    projectId: project.id || '',
    kind: project.kind || 'project',
    sourceFingerprint,
    expiresAt: now + CODEX_THREAD_ALIAS_TTL_MS
  })
  return alias
}

function codexThreadNativeProject(thread, registry) {
  const threadId = thread.id
  if (registry.assignments.has(threadId)) {
    const project = registry.projectById.get(registry.assignments.get(threadId))
    return project ? { project, reason: 'assignment' } : null
  }
  if (registry.projectlessThreadIds.has(threadId)) {
    return { project: { id: '', key: 'chats', name: 'Chats', roots: [], kind: 'chats' }, reason: 'projectless' }
  }
  const cwd = codexNormalizeNativeRoot(thread.cwd)
  if (!cwd) return null
  const pathApi = process.platform === 'win32' ? path.win32 : path
  const matches = []
  for (const project of registry.projects) {
    for (const root of project.roots) {
      if (cwd === root || cwd.startsWith(`${root}${pathApi.sep}`)) matches.push({ project, depth: root.length })
    }
  }
  matches.sort((left, right) => right.depth - left.depth || left.project.insertionOrder - right.project.insertionOrder)
  if (matches.length > 1 && matches[0].depth === matches[1].depth && matches[0].project.key !== matches[1].project.key) throw codexError('protocol-error', 'Codex native project roots are ambiguous')
  return matches[0] ? { project: matches[0].project, reason: 'cwd' } : null
}

function sanitizeCodexTurnStatus(value) {
  const turn = codexRecord(value)
  const status = ['completed', 'interrupted', 'failed', 'inProgress'].includes(turn.status) ? turn.status : ''
  if (!status) return null
  const id = typeof turn.id === 'string' && turn.id.length > 0 && turn.id.length <= 200 ? turn.id : ''
  const completedAt = status === 'completed' ? codexTimestampMs(turn.completedAt) : 0
  const startedAt = codexTimestampMs(turn.startedAt)
  return {
    status,
    ...(id ? { id } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {})
  }
}

function sanitizeCodexTurnStatusPage(value) {
  const source = codexRecord(value)
  const turns = Array.isArray(source.data) ? source.data : []
  return sanitizeCodexTurnStatus(turns[0])
}

function scheduleCodexFirstPromptScan(value) {
  if (codexThreadFirstPromptScanRunning || codexThreadTurnStatusRpcAvailable === false) return
  const source = codexRecord(value)
  const rows = Array.isArray(source.data) ? source.data : []
  const currentIds = new Set(rows.map((row) => codexRecord(row).id).filter(validCodexThreadId))
  for (const threadId of codexThreadFirstPromptCache.keys()) {
    if (!currentIds.has(threadId)) codexThreadFirstPromptCache.delete(threadId)
  }
  const candidates = rows.map((row) => codexRecord(row)).filter((thread) => validCodexThreadId(thread.id))
  if (!candidates.some((thread) => !codexThreadFirstPromptCache.get(thread.id)?.done)) return
  codexThreadFirstPromptScanRunning = true
  const generation = codexThreadFirstPromptScanGeneration
  Promise.resolve().then(async () => {
    let budget = CODEX_THREAD_FIRST_PROMPT_PAGE_BUDGET
    for (const thread of candidates) {
      if (budget <= 0) break
      let entry = codexThreadFirstPromptCache.get(thread.id) || { cursor: null, oldestStartedAt: 0, firstPromptAt: 0, done: false, retryAt: 0 }
      if (entry.done || entry.retryAt > Date.now()) continue
      while (!entry.done && budget > 0) {
        if (generation !== codexThreadFirstPromptScanGeneration) return
        try {
          const params = {
            threadId: thread.id,
            limit: CODEX_THREAD_FIRST_PROMPT_PAGE_LIMIT,
            sortDirection: 'desc',
            itemsView: 'notLoaded',
            ...(entry.cursor ? { cursor: entry.cursor } : {})
          }
          const page = await requestCodexRpc('thread/turns/list', params, CODEX_THREAD_TURN_STATUS_TIMEOUT_MS)
          if (generation !== codexThreadFirstPromptScanGeneration) return
          const pageSource = codexRecord(page)
          const turns = Array.isArray(pageSource.data) ? pageSource.data : []
          for (const row of turns) {
            const startedAt = codexTimestampMs(codexRecord(row).startedAt)
            if (startedAt && (!entry.oldestStartedAt || startedAt < entry.oldestStartedAt)) entry.oldestStartedAt = startedAt
          }
          entry.cursor = typeof pageSource.nextCursor === 'string' && pageSource.nextCursor ? pageSource.nextCursor : null
          entry.done = !entry.cursor
          if (entry.done && entry.oldestStartedAt) entry.firstPromptAt = entry.oldestStartedAt
          entry.retryAt = 0
          codexThreadFirstPromptCache.set(thread.id, { ...entry })
          budget -= 1
        } catch {
          if (generation !== codexThreadFirstPromptScanGeneration) return
          entry.retryAt = Date.now() + CODEX_THREAD_TURN_STATUS_RETRY_MS
          codexThreadFirstPromptCache.set(thread.id, { ...entry })
          break
        }
      }
    }
  }).finally(() => {
    if (generation === codexThreadFirstPromptScanGeneration) codexThreadFirstPromptScanRunning = false
  })
}

async function listAllCodexThreads(archived) {
  const rows = []
  const seenThreadIds = new Set()
  const seenCursors = new Set()
  let cursor = ''
  for (;;) {
    const page = codexRecord(await requestCodexRpc('thread/list', {
      limit: CODEX_THREAD_PAGE_SIZE,
      archived: archived === true,
      sortKey: 'recency_at',
      sortDirection: 'desc',
      ...(cursor ? { cursor } : {})
    }))
    if (!Array.isArray(page.data)) throw codexError('protocol-error', 'Codex thread pagination is invalid')
    for (const value of page.data) {
      const thread = codexRecord(value)
      if (!validCodexThreadId(thread.id)) throw codexError('protocol-error', 'Codex thread identity is invalid')
      if (seenThreadIds.has(thread.id)) continue
      seenThreadIds.add(thread.id)
      rows.push(thread)
    }
    const nextCursor = page.nextCursor == null || page.nextCursor === '' ? '' : typeof page.nextCursor === 'string' ? page.nextCursor : null
    if (nextCursor === null) throw codexError('protocol-error', 'Codex thread cursor is invalid')
    if (!nextCursor) return rows
    if (seenCursors.has(nextCursor)) throw codexError('protocol-error', 'Codex thread cursor loop detected')
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }
}

async function recoverDirtyCodexThreadsMissingFromInventory(rows, dirtyThreadIds, archivedThreadIds = new Set()) {
  const knownIds = new Set(rows.map((row) => codexRecord(row).id).filter(validCodexThreadId))
  const candidateIds = [...dirtyThreadIds]
    .filter((threadId) => validCodexThreadId(threadId)
      && !knownIds.has(threadId)
      && !archivedThreadIds.has(threadId))
  if (!candidateIds.length) return rows

  const queue = [...candidateIds]
  const recovered = new Map()
  const workers = Array.from(
    { length: Math.min(CODEX_THREAD_TURN_STATUS_CONCURRENCY, queue.length) },
    async () => {
      for (;;) {
        const threadId = queue.shift()
        if (!threadId) return
        try {
          const response = codexRecord(await requestCodexRpc(
            'thread/read',
            { threadId, includeTurns: false },
            CODEX_THREAD_TURN_STATUS_TIMEOUT_MS
          ))
          const thread = codexRecord(response.thread)
          const status = codexRecord(thread.status).type
          if (thread.id !== threadId || !['active', 'idle', 'notLoaded', 'systemError'].includes(status)) continue
          recovered.set(threadId, thread)
        } catch {}
      }
    }
  )
  await Promise.all(workers)
  return recovered.size
    ? [...rows, ...candidateIds.map((threadId) => recovered.get(threadId)).filter(Boolean)]
    : rows
}

function markCodexThreadTurnStatusDirty(threadId) {
  if (!validCodexThreadId(threadId)) return
  codexThreadTurnStatusDirtyGeneration += 1
  codexThreadTurnStatusDirty.set(threadId, codexThreadTurnStatusDirtyGeneration)
}

async function readCodexThreadTurnStatuses(rows, dirtyThreadIds = new Set()) {
  const candidates = rows.map(codexRecord)
  const latest = new Map()
  const nonConversationIds = new Set()
  const readSucceededIds = new Set()
  const useEventFastPath = dirtyThreadIds.size > 0
  const queue = []

  for (const thread of candidates) {
    const cached = codexThreadTurnStatusCache.get(thread.id)
    // A cached inProgress turn on a row whose connector status is not active
    // is contradictory evidence, not a fast-path hit: only a fresh targeted
    // read may decide whether that turn is still running (RAW-181#4).
    const contradictoryCachedLive = cached?.turn?.status === 'inProgress'
      && codexRecord(thread.status).type !== 'active'
    if (!useEventFastPath || dirtyThreadIds.has(thread.id) || !cached || contradictoryCachedLive) {
      queue.push(thread)
      continue
    }
    if (cached.nonConversation === true) nonConversationIds.add(thread.id)
    else if (cached.turn) latest.set(thread.id, { ...cached.turn })
    else queue.push(thread)
  }

  const readOne = async (thread) => {
    const page = await requestCodexRpc(
      'thread/turns/list',
      {
        threadId: thread.id,
        limit: 1,
        sortDirection: 'desc',
        itemsView: 'notLoaded'
      },
      CODEX_THREAD_TURN_STATUS_TIMEOUT_MS
    )
    const pageSource = codexRecord(page)
    if (!Array.isArray(pageSource.data)) throw codexError('protocol-error', 'Codex latest Turn response is invalid')
    if (pageSource.data.length === 0) {
      nonConversationIds.add(thread.id)
      readSucceededIds.add(thread.id)
      codexThreadTurnStatusCache.set(thread.id, { nonConversation: true })
      return
    }
    const turn = sanitizeCodexTurnStatusPage(page)
    if (!turn || !turn.startedAt) throw codexError('protocol-error', 'Codex latest Turn is missing startedAt')
    latest.set(thread.id, turn)
    readSucceededIds.add(thread.id)
    codexThreadTurnStatusCache.set(thread.id, { turn: { ...turn } })
  }

  const workers = Array.from(
    { length: Math.min(CODEX_THREAD_TURN_STATUS_CONCURRENCY, queue.length) },
    async () => {
      for (;;) {
        const thread = queue.shift()
        if (!thread) return
        await readOne(thread)
      }
    }
  )
  await Promise.all(workers)
  return { latest, nonConversationIds, readSucceededIds }
}

function sanitizeCodexThreads(rows, registry, assignments, turnStatuses = new Map(), unreadIds = null) {
  const now = Date.now()
  const threads = []
  for (const row of rows) {
    const thread = codexRecord(row)
    const native = assignments.get(thread.id)
    if (!native) continue
    const statusSource = codexRecord(thread.status)
    const connectorStatus = ['active', 'idle', 'notLoaded', 'systemError'].includes(statusSource.type) ? statusSource.type : 'notLoaded'
    const lastTurn = turnStatuses.get(thread.id)
    if (!lastTurn || !lastTurn.startedAt) continue
    const planLifecycle = codexThreadPersistedPlanLifecycle(thread, lastTurn)
    const persistedPendingInput = connectorStatus !== 'active'
      && codexThreadHasPersistedPendingInput(thread, lastTurn)
    const persistedDecision = persistedPendingInput
    const status = persistedDecision ? 'active' : connectorStatus
    const activeFlags = persistedDecision
      ? ['waitingOnUserInput']
      : status === 'active' && Array.isArray(statusSource.activeFlags)
      ? statusSource.activeFlags.filter((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput')
      : []
    const project = native.project
    const action = codexThreadAlias(thread.id, now, { projectKey: project.key, sourceFingerprint: registry.fingerprint, cwd: codexNormalizeNativeRoot(thread.cwd) })
    threads.push({
      key: action.key,
      actionAlias: action.alias,
      name: typeof thread.name === 'string' && thread.name.trim() ? thread.name.trim().slice(0, 120) : '未命名任务',
      status,
      activeFlags,
      ...(activeFlags.length
        ? { waitingSince: codexTimestampMs(lastTurn.completedAt) || codexTimestampMs(lastTurn.startedAt) || now }
        : {}),
      ...(['ready', 'cleared'].includes(planLifecycle.planLifecycleState) ? {
        planReady: planLifecycle.planReady,
        planLifecycleState: planLifecycle.planLifecycleState,
        planLifecycleRevision: planLifecycle.planLifecycleRevision || lastTurn.startedAt,
        ...(planLifecycle.planClearReason ? { planClearReason: planLifecycle.planClearReason } : {})
      } : {}),
      turnMode: planLifecycle.turnMode,
      statusAuthority: persistedDecision ? 'persisted-decision' : 'connector',
      // Which Harness runs this row; shape and validation live in discovery.
      ...(codexhostDiscovery ? codexhostDiscovery.codexhostExternalIdentity(thread) : {}),
      // Extra-process unread is Host-owned; the Host-silent fallback to Desktop
      // evidence lives with it in the discovery owner.
      ...(thread.codexhostExternal === true && codexhostDiscovery
        ? codexhostDiscovery.codexhostExternalUnreadFields(
          thread.codexhostHasUnreadTurn,
          unreadIds ? unreadIds.has(thread.id) : null,
          lastTurn.status === 'completed',
          codexDesktopOpenedReadCoversCompletion(thread.id, { lastTurnStartedAt: lastTurn.startedAt, lastTurnCompletedAt: lastTurn.completedAt }))
        : {
          hasUnreadTurn: unreadIds ? unreadIds.has(thread.id) : false,
          unreadAuthority: unreadIds ? 'desktop-persisted' : 'unavailable'
        }),
      updatedAt: codexTimestampMs(thread.recencyAt) || codexTimestampMs(thread.updatedAt) || lastTurn.startedAt,
      ...(codexTimestampMs(thread.createdAt) ? { createdAt: codexTimestampMs(thread.createdAt) } : {}),
      ...(codexThreadFirstPromptCache.get(thread.id)?.firstPromptAt ? { firstPromptAt: codexThreadFirstPromptCache.get(thread.id).firstPromptAt } : {}),
      lastTurnStatus: lastTurn.status,
      lastTurnStartedAt: lastTurn.startedAt,
      ...(lastTurn.completedAt ? { lastTurnCompletedAt: lastTurn.completedAt } : {}),
      ...(lastTurn.status === 'interrupted' || lastTurn.status === 'failed'
        ? { lastTurnEvidence: 'targeted-after-exit', idleConfirmed: connectorStatus !== 'active' }
        : thread.codexhostExternal === true && lastTurn.status === 'completed'
          ? { lastTurnEvidence: 'snapshot-corroborated', idleConfirmed: connectorStatus !== 'active' }
          : {}),
      projectKey: project.key,
      projectName: project.name,
      projectKind: project.kind === 'chats' ? 'chats' : 'project',
      nativePinned: registry.pinnedThreadOrder.has(thread.id),
      ...(registry.pinnedThreadOrder.has(thread.id) ? { nativePinnedOrder: registry.pinnedThreadOrder.get(thread.id) } : {})
    })
  }
  return threads
}

function sanitizeCodexProjects(registry) {
  const now = Date.now()
  const projects = registry.projects
    .slice()
    .sort((left, right) => (left.nativeOrder ?? Number.MAX_SAFE_INTEGER) - (right.nativeOrder ?? Number.MAX_SAFE_INTEGER))
    .map((project) => ({
      key: project.key,
      actionAlias: codexProjectActionAlias(project, registry.fingerprint, now),
      name: project.name,
      kind: 'project',
      nativePinned: typeof project.nativePinnedOrder === 'number',
      selected: registry.selectedProjectId === project.id,
      ...(typeof project.nativePinnedOrder === 'number' ? { nativePinnedOrder: project.nativePinnedOrder } : {}),
      ...(typeof project.nativeOrder === 'number' ? { nativeOrder: project.nativeOrder } : {})
    }))
  const chats = { id: '', key: 'chats', name: 'Chats', kind: 'chats' }
  projects.push({
    key: 'chats',
    actionAlias: codexProjectActionAlias(chats, registry.fingerprint, now),
    name: 'Chats',
    kind: 'chats',
    nativePinned: false
  })
  return projects
}

// A failed load merges nothing: every field on the returned object is
// `undefined`, which callers already treat as "no new turn evidence" rather
// than as a distinct case.
function codexMergedInventoryTurnFields(projection, previousActivity) {
  return codexInventoryTurnFieldsModule
    ? codexInventoryTurnFieldsModule.codexMergedInventoryTurnFields(projection, previousActivity)
    : {}
}

async function scanVerifiedCodexInventory() {
  // The queued inventory signal has now been consumed. A new signal arriving
  // during this scan may schedule one more scan; identical repeats do not.
  codexInventoryRefreshPending = false
  codexRestoreDesktopSideRelationHints()
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const previousInventoryFingerprint = codexActivityInventorySemanticFingerprint()
    const previousActivityInventory = codexActivityInventory
    const dirtySnapshot = new Map(codexThreadTurnStatusDirty)
    const registry = readCodexNativeRegistry()
    const listedRows = await listAllCodexThreads(false)
    const listedThreadIds = new Set(listedRows.map((row) => codexRecord(row).id).filter(validCodexThreadId))
    const missingDirtyThread = [...dirtySnapshot.keys()]
      .some((threadId) => validCodexThreadId(threadId) && !listedThreadIds.has(threadId))
    const archivedRows = missingDirtyThread ? await listAllCodexThreads(true) : []
    const archivedThreadIds = new Set(archivedRows.map((row) => codexRecord(row).id).filter(validCodexThreadId))
    const recoveredRows = await recoverDirtyCodexThreadsMissingFromInventory(listedRows, dirtySnapshot.keys(), archivedThreadIds)
    // `thread/list` omits subagent runs; rollout-file discovery hands back
    // `thread/read`-verified rows so the ordinary pipeline can member them.
    const subagentRows = codexSubagentDiscovery
      ? await codexSubagentDiscovery.codexDiscoverSubagentThreadRows({
          root: codexInventoryMembershipRoots()[0] || '',
          rows: recoveredRows
        })
      : []
    // CodexHost external Harness conversations are invisible to the official
    // app-server; the codexhost CLI is their contract surface. Their turn
    // evidence is synthesized because thread/turns/list cannot answer them.
    // A lane that failed to load contributes zero rows and looks exactly like
    // one with no extra processes; say so instead of disappearing silently.
    if (!codexhostDiscovery) runtimeDiagnostics.record({ level: 'error', scope: 'task-recovery', event: 'codexhost-discovery', outcome: 'unloaded', provider: 'codex', count: 0, details: {} })
    const codexhost = codexhostDiscovery
      ? await codexhostDiscovery.codexhostRowsForScan({
          roots: [...new Set([
            ...listedRows.map((row) => codexNormalizeNativeRoot(codexRecord(row).cwd)),
            ...registry.projects.flatMap((project) => Array.isArray(project.roots) ? project.roots : [])
          ].filter(Boolean))],
          threadKey: codexThreadKey
        })
      : { rows: [], turns: new Map() }
    const rows = subagentRows.length || codexhost.rows.length
      ? [...recoveredRows, ...subagentRows, ...codexhost.rows]
      : recoveredRows
    const topology = codexInventoryThreadTopology(rows)
    const assignments = new Map()
    const chatsAssignment = {
      project: { id: '', key: 'chats', name: 'Chats', roots: [], kind: 'chats' },
      reason: 'projectless'
    }
    for (const thread of rows) {
      const native = codexThreadNativeProject(thread, registry)
      if (native) assignments.set(thread.id, native)
      else if (codexRecord(thread).codexhostExternal === true) assignments.set(thread.id, chatsAssignment)
    }
    const sideRelations = new Map()
    for (const [threadId, parentThreadId] of topology.relations) {
      const parentAssignment = assignments.get(parentThreadId)
      if (!parentAssignment) continue
      assignments.set(threadId, parentAssignment)
      sideRelations.set(threadId, parentThreadId)
    }
    const eligibleRows = rows.filter((thread) => assignments.has(thread.id))
    const publicRows = eligibleRows.filter((thread) => !sideRelations.has(thread.id))
    const eligibleRowById = new Map(eligibleRows.map((thread) => [thread.id, codexRecord(thread)]))
    const eligibleDepths = new Map([...topology.depths].filter(([threadId]) => sideRelations.has(threadId)))
    const orphanCount = eligibleRows.filter((thread) => topology.isolated.has(thread.id)
      || topology.relations.has(thread.id) && !sideRelations.has(thread.id)).length
    const excludedSourceCount = rows.length - eligibleRows.length
    const officialEligibleRows = codexhost.rows.length
      ? eligibleRows.filter((thread) => !codexhostDiscovery.isExternalThreadId(codexRecord(thread).id))
      : eligibleRows
    const turns = await readCodexThreadTurnStatuses(officialEligibleRows, new Set(dirtySnapshot.keys()))
    for (const [threadId, turn] of codexhost.turns) turns.latest.set(threadId, turn)
    await readCodexThreadGoals(officialEligibleRows)
    const endingRegistry = readCodexNativeRegistry()
    if (endingRegistry.fingerprint !== registry.fingerprint) {
      if (attempt === 0) continue
      throw codexError('protocol-error', 'Codex native project state changed during the scan')
    }
    let unreadIds = null
    try { unreadIds = readCodexDesktopUnreadIds() } catch {}
    codexSyncInventorySideTopology(
      sideRelations,
      eligibleDepths,
      eligibleRowById,
      turns,
      unreadIds,
      orphanCount
    )
    const threads = sanitizeCodexThreads(publicRows, registry, assignments, turns.latest, unreadIds)
    // How many extra processes survived into the published set. A lane that
    // discovers nine and publishes none is otherwise completely invisible.
    if (codexhost.rows.length) runtimeDiagnostics.record({ level: 'info', scope: 'task-recovery', event: 'codexhost-published', outcome: 'projected', provider: 'codex', count: threads.filter((thread) => thread.codexhostHarnessId).length, details: { discovered: codexhost.rows.length, publicRows: publicRows.length } })
    const eligibleIds = new Set(eligibleRows.map((thread) => thread.id))
    for (const threadId of codexThreadTurnStatusCache.keys()) {
      if (!eligibleIds.has(threadId)) codexThreadTurnStatusCache.delete(threadId)
    }
    const retainedGoalIds = new Set([...eligibleIds, ...codexAllSideRelations().keys()])
    for (const threadId of codexThreadGoalCache.keys()) {
      if (!retainedGoalIds.has(threadId)) codexThreadGoalCache.delete(threadId)
    }
    const validKeys = new Set(threads.map((thread) => thread.key))
    const threadByKey = new Map(threads.map((thread) => [thread.key, thread]))
    const activityInventory = new Map()
    for (const row of publicRows) {
      const thread = codexRecord(row)
      const key = validCodexThreadId(thread.id) ? codexThreadKey(thread.id) : ''
      if (!key || !validKeys.has(key)) continue
      const projection = threadByKey.get(key)
      const activity = sanitizeCodexActivityStatus({
        type: projection?.status,
        activeFlags: projection?.activeFlags
      })
      if (!activity) throw codexError('protocol-error', 'Codex thread activity status is invalid')
      const rolloutFallback = sanitizeCodexActivityStatus(thread.status)
      if (!rolloutFallback) throw codexError('protocol-error', 'Codex thread connector status is invalid')
      const previousActivity = previousActivityInventory.get(thread.id)
      const preserveAppServerActive = previousActivity?.appServerLiveActive === true
      const turnFields = codexMergedInventoryTurnFields(projection, previousActivity)
      const connectorStatusAuthority = projection?.statusAuthority === 'persisted-decision'
        ? 'persisted-decision'
        : 'connector'
      const latestTurn = turns.latest.get(thread.id)
      const latestTurnMatchesProjection = latestTurn?.startedAt === turnFields.lastTurnStartedAt
        && latestTurn?.status === turnFields.lastTurnStatus
      const previousTurnMatchesProjection = previousActivity?.lastTurnStartedAt === turnFields.lastTurnStartedAt
        && previousActivity?.lastTurnStatus === turnFields.lastTurnStatus
      const lastTurnId = latestTurnMatchesProjection && latestTurn?.id
        ? latestTurn.id
        : previousTurnMatchesProjection ? previousActivity?.lastTurnId || '' : ''
      const inventoryReadSucceeded = turns.readSucceededIds?.has(thread.id) === true
      const inventoryInProgress = latestTurn?.status === 'inProgress' && codexTimestampMs(latestTurn.startedAt) > 0
      const previousInventoryTurnSequence = Number(previousActivity?.inventoryTurnEvidenceSequence) || 0
      const sameInventoryTurn = inventoryInProgress
        && codexTimestampMs(previousActivity?.inventoryTurnStartedAt) === codexTimestampMs(latestTurn.startedAt)
        && (!latestTurn.id || !previousActivity?.inventoryTurnId || latestTurn.id === previousActivity.inventoryTurnId)
      const inventoryTurnEvidenceSequence = inventoryInProgress
        ? sameInventoryTurn && previousInventoryTurnSequence > 0
          ? previousInventoryTurnSequence
          : inventoryReadSucceeded ? codexNextLiveEvidenceSequence() : 0
        : 0
      const exactTerminal = !preserveAppServerActive && codexIsConfirmedTurnEvidence(turnFields.lastTurnEvidence)
      const terminalEvidenceSequence = exactTerminal
        ? previousTurnMatchesProjection
          && previousActivity?.lastTurnEvidence === turnFields.lastTurnEvidence
          && Number.isInteger(previousActivity?.terminalEvidenceSequence)
            ? previousActivity.terminalEvidenceSequence
            : codexNextLiveEvidenceSequence()
        : 0
      codexReconcileDesktopOpenedReadWithTurn(codexDesktopBridge, thread.id, {
        ...turnFields,
        ...(lastTurnId ? { lastTurnId } : {})
      })
      if (turnFields.lastTurnStatus && turnFields.lastTurnStartedAt) {
        codexThreadTurnStatusCache.set(thread.id, {
          turn: {
            ...(lastTurnId ? { id: lastTurnId } : {}),
            status: turnFields.lastTurnStatus,
            startedAt: turnFields.lastTurnStartedAt,
            ...(turnFields.lastTurnCompletedAt ? { completedAt: turnFields.lastTurnCompletedAt } : {})
          }
        })
      }
      const planLifecycle = codexRolloutEvidence?.codexMergeProjectedPlanLifecycle(projection, previousActivity)
        || { planReady: projection?.planReady === true || previousActivity?.planReady === true,
          planLifecycleState: projection?.planReady === true || previousActivity?.planReady === true ? 'ready' : 'unknown',
          planLifecycleRevision: Number(projection?.planLifecycleRevision) || Number(previousActivity?.planLifecycleRevision) || 0,
          planClearReason: '' }
      activityInventory.set(thread.id, {
        key,
        ...(typeof projection?.actionAlias === 'string' ? { actionAlias: projection.actionAlias } : {}),
        ...(typeof projection?.name === 'string' ? { displayName: projection.name } : {}),
        ...(typeof projection?.projectKey === 'string' ? { projectKey: projection.projectKey } : {}),
        ...(typeof projection?.projectName === 'string' ? { projectName: projection.projectName } : {}),
        ...(projection?.projectKind === 'project' || projection?.projectKind === 'chats' ? { projectKind: projection.projectKind } : {}),
        ...activity,
        connectorStatus: activity.status,
        connectorActiveFlags: activity.activeFlags,
        rolloutFallbackStatus: rolloutFallback.status,
        rolloutFallbackActiveFlags: rolloutFallback.activeFlags,
        ...(codexTimestampMs(projection?.waitingSince)
          ? { connectorWaitingSince: codexTimestampMs(projection.waitingSince) }
          : {}),
        connectorPlanImplementationOnly: projection?.planImplementationOnly === true,
        connectorPlanReady: projection?.planReady === true,
        connectorPlanLifecycleRevision: Number(projection?.planLifecycleRevision) || 0,
        connectorTurnMode: projection?.turnMode === 'plan' || projection?.turnMode === 'default' ? projection.turnMode : 'unknown',
        connectorStatusAuthority,
        connectorUpdatedAt: projection?.updatedAt,
        connectorLastTurnStatus: projection?.lastTurnStatus,
        connectorLastTurnStartedAt: projection?.lastTurnStartedAt,
        ...(preserveAppServerActive ? { status: 'active', activeFlags: [...(previousActivity.activeFlags || [])] } : {}),
        statusAuthority: preserveAppServerActive ? 'app-server-live' : connectorStatusAuthority,
        activityEvidence: preserveAppServerActive ? 'activity-event' : 'connector',
        activityRevision: 0,
        planImplementationOnly: projection?.planImplementationOnly === true,
        planReady: planLifecycle.planReady,
        planLifecycleState: planLifecycle.planLifecycleState,
        planLifecycleRevision: planLifecycle.planLifecycleRevision,
        ...(planLifecycle.planClearReason ? { planClearReason: planLifecycle.planClearReason } : {}),
        turnMode: projection?.turnMode === 'plan' || projection?.turnMode === 'default'
          ? projection.turnMode
          : previousActivity?.turnMode || 'unknown',
        idleConfirmed: preserveAppServerActive ? false : projection?.idleConfirmed === true,
        ...((preserveAppServerActive
          ? codexTimestampMs(previousActivity.waitingSince) || codexTimestampMs(previousActivity.connectorWaitingSince)
          : codexTimestampMs(projection?.waitingSince))
          ? { waitingSince: preserveAppServerActive
              ? codexTimestampMs(previousActivity.waitingSince) || codexTimestampMs(previousActivity.connectorWaitingSince)
              : codexTimestampMs(projection.waitingSince) }
          : {}),
        ...(preserveAppServerActive ? {
          appServerLiveActive: true,
          ...(Number.isInteger(previousActivity.appServerLiveSequence)
            ? { appServerLiveSequence: previousActivity.appServerLiveSequence }
            : {}),
          ...(validCodexThreadId(previousActivity.appServerLiveBranchThreadId)
            ? { appServerLiveBranchThreadId: previousActivity.appServerLiveBranchThreadId }
            : {})
        } : {}),
        ...(Number.isInteger(previousActivity?.activeEvidenceSequence)
          ? { activeEvidenceSequence: previousActivity.activeEvidenceSequence }
          : {}),
        ...(inventoryTurnEvidenceSequence ? {
          inventoryTurnEvidenceSequence,
          inventoryTurnStartedAt: latestTurn.startedAt,
          ...(latestTurn.id ? { inventoryTurnId: latestTurn.id } : {})
        } : {}),
        ...(terminalEvidenceSequence ? { terminalEvidenceSequence } : {}),
        hasUnreadTurn: projection?.hasUnreadTurn === true,
        connectorHasUnreadTurn: projection?.hasUnreadTurn === true,
        connectorUnreadAuthority: projection?.unreadAuthority || 'unavailable',
        unreadAuthority: projection?.unreadAuthority || 'unavailable',
        ...(lastTurnId ? { lastTurnId } : {}),
        ...turnFields
      })
    }
    const retainedAt = Date.now()
    const retainMissingMappings = codexActivitySourceFingerprint === registry.fingerprint
    for (const [threadId, previousActivity] of retainMissingMappings ? previousActivityInventory : []) {
      if (activityInventory.has(threadId)
        || sideRelations.has(threadId)
        || !validCodexThreadId(threadId)
        || archivedThreadIds.has(threadId)) continue
      const missingSince = codexTimestampMs(previousActivity.inventoryMissingSince) || retainedAt
      if (retainedAt - missingSince > CODEX_MISSING_ACTIVITY_MAPPING_RETENTION_MS) continue
      activityInventory.set(threadId, {
        ...previousActivity,
        inventoryMissingSince: missingSince
      })
      codexNoteActivityDecision('missingMappingRetained')
    }
    codexActivityInventory = activityInventory
    codexActivitySourceFingerprint = registry.fingerprint
    codexSyncRolloutDecisionTrackers(eligibleRows, turns.latest)
    // Official thread/follow cannot answer extra-process ids; following them
    // plants notLoaded shadows that later hide Host running/completed rows.
    codexEnsureDesktopBridge().updateInventory(
      [...activityInventory.keys()].filter((threadId) => !codexhostDiscovery?.isExternalThreadId?.(threadId))
    )
    const inventoryChanged = previousInventoryFingerprint !== codexActivityInventorySemanticFingerprint()
    if (inventoryChanged) codexActivityGeneration += 1
    codexPrimeActivitySemanticFingerprints()
    const activityByKey = new Map([...activityInventory.values()].map((entry) => [entry.key, entry]))
    for (const thread of threads) applyCodexActivityEvidenceToThreadV7(thread, activityByKey.get(thread.key))
    for (const [threadId, generation] of dirtySnapshot) {
      if (codexThreadTurnStatusDirty.get(threadId) === generation) codexThreadTurnStatusDirty.delete(threadId)
    }
    if (codexThreadTurnStatusDirty.size > 0) {
      queueMicrotask(() => emitCodexActivityDelta([], true, 'urgent'))
    }
    return {
      threads,
      projects: sanitizeCodexProjects(registry),
      activityGeneration: codexActivityGeneration,
      sourceFingerprint: registry.fingerprint,
      rawSourceCount: rows.length,
      eligibleSourceCount: eligibleRows.length,
      excludedSourceCount,
      nonConversationCount: turns.nonConversationIds.size
    }
  }
  throw codexError('protocol-error', 'Codex native project state changed during the scan')
}

async function readCodexActivitySnapshot(options) {
  try {
    if (!codexActivitySourceFingerprint) throw codexError('protocol-error', 'Codex activity baseline is unavailable')
    const input = codexRecord(options)
    const bridge = codexEnsureDesktopBridge()
    if (input.phaseOnly === true) codexRefreshRolloutDecisionTrackers({ emit: false })
    else bridge.refreshPersistedUnread(false)
    const receivedAt = Date.now()
    return {
      ok: true,
      value: codexActivityDelta([...codexActivityInventory.values()], false, receivedAt),
      receivedAt
    }
  } catch (error) {
    return codexErrorResult(error)
  }
}

let companionCodexVerifiedSnapshotCacheV7 = null

function applyCodexActivityEvidenceToThreadV7(thread, activity) {
  if (!thread || !activity) return thread
  thread.status = activity.status
  thread.activeFlags = [...(Array.isArray(activity.activeFlags) ? activity.activeFlags : [])]
  thread.planImplementationOnly = activity.planImplementationOnly === true
  thread.planReady = activity.planReady === true
  thread.planLifecycleState = activity.planLifecycleState === 'cleared'
    ? 'cleared'
    : activity.planReady === true ? 'ready' : 'unknown'
  thread.planLifecycleRevision = Number(activity.planLifecycleRevision) || 0
  if (thread.planLifecycleState === 'cleared' && activity.planClearReason) thread.planClearReason = activity.planClearReason
  else delete thread.planClearReason
  thread.turnMode = activity.turnMode === 'plan' || activity.turnMode === 'default' ? activity.turnMode : 'unknown'
  thread.idleConfirmed = activity.idleConfirmed === true
  thread.statusAuthority = activity.statusAuthority
  thread.activityEvidence = activity.activityEvidence
  thread.activityRevision = activity.activityRevision
  if (activity.waitingSince) thread.waitingSince = activity.waitingSince
  else delete thread.waitingSince
  if (activity.desktopActiveSince) thread.desktopActiveSince = activity.desktopActiveSince
  else delete thread.desktopActiveSince
  thread.hasUnreadTurn = activity.hasUnreadTurn === true
  thread.unreadAuthority = activity.unreadAuthority
  if (activity.lastTurnStatus && activity.lastTurnStartedAt) {
    thread.lastTurnStatus = activity.lastTurnStatus
    thread.lastTurnStartedAt = activity.lastTurnStartedAt
    if (activity.lastTurnStatus === 'completed' && activity.lastTurnCompletedAt) thread.lastTurnCompletedAt = activity.lastTurnCompletedAt
    else delete thread.lastTurnCompletedAt
  }
  if (activity.lastTurnEvidence) thread.lastTurnEvidence = activity.lastTurnEvidence
  else delete thread.lastTurnEvidence
  if (activity.activeEvidenceSequence) thread.activeEvidenceSequence = activity.activeEvidenceSequence
  else delete thread.activeEvidenceSequence
  if (activity.terminalEvidenceSequence) thread.terminalEvidenceSequence = activity.terminalEvidenceSequence
  else delete thread.terminalEvidenceSequence
  return thread
}

async function readCodexSnapshot(options) {
  const input = codexRecord(options)
  const includeQuota = input.includeQuota !== false
  const includeConfig = input.includeConfig !== false
  const includeThreads = input.includeThreads !== false
  try {
    if (includeThreads) ensureCodexInventoryMembershipWatchers({ reconcile: false })
    const value = { version: 2, receivedAt: Date.now() }
    if (includeQuota) {
      const [rateResult, accountResult] = await Promise.all([
        requestCodexRpc('account/rateLimits/read', {}),
        requestCodexRpc('account/read', { refreshToken: false })
      ])
      if (codexRecord(accountResult).requiresOpenaiAuth === true && !codexRecord(accountResult).account) throw codexError('not-authenticated', 'Codex authentication required')
      value.quota = sanitizeCodexQuota(rateResult, accountResult)
    }
    if (includeConfig) {
      value.config = sanitizeCodexConfig(await requestCodexRpc('config/read', { includeLayers: false }))
      try {
        const catalog = sanitizeCodexModelList(await requestCodexRpc('model/list', {}))
        value.models = catalog.models
        value.modelCatalogFingerprint = catalog.fingerprint
      } catch (error) {
        value.modelCatalogErrorCode = typeof codexRecord(error).code === 'string' ? codexRecord(error).code.slice(0, 80) : 'model-list-failed'
      }
    }
    if (includeThreads) {
      const inventory = await scanVerifiedCodexInventory()
      Object.assign(value, inventory, {
        completeness: 'verified',
        threadsPartial: false,
        taskAuthority: inventory.threads.length > 0 && inventory.threads.every((thread) => thread.status === 'notLoaded') ? 'inventory-only' : 'mixed'
      })
    }
    if (value.quota && value.modelCatalogFingerprint) {
      try {
        const projectFingerprint = value.sourceFingerprint || readCodexNativeRegistry().fingerprint
        value.newThreadContextFingerprint = codexNewThreadContextFingerprint(value.quota, value.modelCatalogFingerprint, projectFingerprint)
      } catch {}
    }
    value.receivedAt = Date.now()
    const result = { ok: true, value, receivedAt: value.receivedAt }
    if (includeThreads && value.completeness === 'verified') {
      companionCodexVerifiedSnapshotCacheV7 = {
        result,
        cachedAt: value.receivedAt,
        activityGeneration: Number(value.activityGeneration) || 0,
        sourceFingerprint: typeof value.sourceFingerprint === 'string' ? value.sourceFingerprint : ''
      }
    }
    return result
  } catch (error) {
    return codexErrorResult(error)
  }
}

function readCompanionCodexPreflightSnapshotV7() {
  const cached = companionCodexVerifiedSnapshotCacheV7
  const currentFingerprint = typeof codexActivitySourceFingerprint === 'string' ? codexActivitySourceFingerprint : ''
  const currentKeys = [...codexActivityInventory.values()]
    .map((entry) => entry?.key)
    .filter((key) => typeof key === 'string')
    .sort()
  const cachedThreads = Array.isArray(cached?.result?.value?.threads) ? cached.result.value.threads : []
  const cachedKeys = cachedThreads.map((thread) => thread?.key)
    .filter((key) => typeof key === 'string')
    .sort()
  if (cached
    && Date.now() - cached.cachedAt <= 500
    && cached.sourceFingerprint === currentFingerprint
    && currentKeys.length === cachedKeys.length
    && currentKeys.every((key, index) => key === cachedKeys[index])) {
    const activityByKey = new Map([...codexActivityInventory.values()].map((entry) => [entry.key, entry]))
    const receivedAt = Date.now()
    const value = {
      ...cached.result.value,
      threads: cachedThreads.map((thread) => applyCodexActivityEvidenceToThreadV7({ ...thread }, activityByKey.get(thread.key))),
      activityGeneration: codexActivityGeneration,
      receivedAt
    }
    const result = { ok: true, value, receivedAt }
    companionCodexVerifiedSnapshotCacheV7 = {
      result,
      cachedAt: receivedAt,
      activityGeneration: Number(codexActivityGeneration) || 0,
      sourceFingerprint: currentFingerprint
    }
    return Promise.resolve(result)
  }
  return readCodexSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
}

async function removeCodexProject(actionAlias, request) {
  const input = codexRecord(request)
  const expectedSourceFingerprint = typeof input.expectedSourceFingerprint === 'string' && /^[a-f0-9]{64}$/.test(input.expectedSourceFingerprint)
    ? input.expectedSourceFingerprint
    : ''
  const failed = (status, message) => ({ status, message })
  if (typeof actionAlias !== 'string' || !/^cp_[A-Za-z0-9_-]{16,80}$/.test(actionAlias) || !expectedSourceFingerprint) {
    return failed('stale-source', '项目移除请求已失效，请刷新后重试')
  }

  let desktopRunning
  try {
    desktopRunning = await codexDesktopIsRunning()
  } catch {
    return failed('write-failed', '无法可靠确认 Codex 桌面进程状态，未修改项目')
  }
  if (desktopRunning) return failed('codex-running', 'Codex 正在运行；请先完全退出 Codex，再次执行移除')

  const action = codexProjectActions.get(actionAlias)
  if (!action || action.expiresAt <= Date.now() || action.kind !== 'project') {
    codexProjectActions.delete(actionAlias)
    return failed('stale-source', '项目动作已过期，请刷新后重试')
  }

  let primaryState
  try {
    primaryState = readCodexNativePrimaryState()
  } catch {
    return failed('unsupported-schema', 'Codex 主项目状态缺失、无效或结构不受支持，未执行移除')
  }
  const { paths, stat, buffer: previousPrimary, value, registry } = primaryState
  if (registry.fingerprint !== expectedSourceFingerprint || action.sourceFingerprint !== expectedSourceFingerprint) {
    return failed('stale-source', 'Codex 项目状态已更新，未执行移除')
  }
  const project = registry.projectById.get(action.projectId)
  if (!project || project.key !== action.projectKey || action.projectId !== project.id) {
    return failed('stale-source', '目标项目已变化或不再存在，未执行移除')
  }

  const source = codexRecord(value)
  const localProjects = source['local-projects']
  const selectedProject = source['selected-project']
  const selectedProjectRecord = codexRecord(selectedProject)
  const selectedProjectSupported = selectedProject === undefined || selectedProject === null || typeof selectedProject === 'string'
    || (selectedProjectRecord.type === 'local' && typeof selectedProjectRecord.projectId === 'string')
  if (!localProjects || typeof localProjects !== 'object' || Array.isArray(localProjects)
    || !Object.prototype.hasOwnProperty.call(localProjects, project.id)
    || !Array.isArray(source['project-order'])
    || !Array.isArray(source['pinned-project-ids'])
    || !selectedProjectSupported) {
    return failed('unsupported-schema', 'Codex 项目状态结构不受支持，未执行移除')
  }

  const backupExists = fs.existsSync(paths.backup)
  let previousBackup = null
  let backupMode = stat.mode
  try {
    if (backupExists) {
      const backupStat = fs.statSync(paths.backup)
      if (!backupStat || backupStat.size > CODEX_NATIVE_STATE_MAX_BYTES) throw new Error('backup too large')
      previousBackup = fs.readFileSync(paths.backup)
      backupMode = backupStat.mode
    }
  } catch {
    return failed('write-failed', '无法建立 Codex 状态回滚点，未执行移除')
  }

  delete localProjects[project.id]
  source['project-order'] = source['project-order'].filter((id) => id !== project.id)
  source['pinned-project-ids'] = source['pinned-project-ids'].filter((id) => id !== project.id)
  if (selectedProject === project.id || selectedProjectRecord.projectId === project.id) source['selected-project'] = null
  const serialized = Buffer.from(JSON.stringify(source), 'utf8')
  if (!serialized.length || serialized.length > CODEX_NATIVE_STATE_MAX_BYTES) {
    return failed('unsupported-schema', 'Codex 项目状态无法安全序列化，未执行移除')
  }

  let primaryTemporary = ''
  let backupTemporary = ''
  let commitStarted = false
  try {
    if (!fs.readFileSync(paths.primary).equals(previousPrimary)) return failed('stale-source', 'Codex 项目状态在操作期间发生变化，未执行移除')
    primaryTemporary = codexWriteSyncedTemp(paths.primary, serialized, stat.mode)
    backupTemporary = codexWriteSyncedTemp(paths.backup, serialized, backupMode)
    if (await codexDesktopIsRunning()) {
      codexRemoveTemporaryFile(primaryTemporary)
      codexRemoveTemporaryFile(backupTemporary)
      return failed('codex-running', 'Codex 已在操作期间启动；未修改项目，请退出后重试')
    }
    closeCodexServer()
    commitStarted = true
    fs.renameSync(backupTemporary, paths.backup)
    backupTemporary = ''
    fs.renameSync(primaryTemporary, paths.primary)
    primaryTemporary = ''
    codexSyncDirectory(paths.codexHome)

    const verifiedPrimaryText = fs.readFileSync(paths.primary, 'utf8')
    const verifiedBackupText = fs.readFileSync(paths.backup, 'utf8')
    const verifiedPrimary = parseCodexNativeRegistryText(verifiedPrimaryText)
    const verifiedBackup = parseCodexNativeRegistryText(verifiedBackupText)
    if (verifiedPrimary.projectById.has(project.id)
      || verifiedBackup.projectById.has(project.id)
      || verifiedPrimaryText !== serialized.toString('utf8')
      || verifiedBackupText !== serialized.toString('utf8')) {
      throw new Error('Codex project removal verification failed')
    }
  } catch {
    codexRemoveTemporaryFile(primaryTemporary)
    codexRemoveTemporaryFile(backupTemporary)
    if (commitStarted) {
      try {
        codexRestoreAtomicFile(paths.primary, previousPrimary, stat.mode)
        codexRestoreAtomicFile(paths.backup, previousBackup, backupMode)
        codexSyncDirectory(paths.codexHome)
      } catch {
        return failed('write-failed', 'Codex 项目状态写入失败，且自动回滚未能完整确认；请勿启动 Codex，先检查全局状态文件')
      }
    }
    return failed('write-failed', 'Codex 项目状态写入或核验失败，已恢复原状态')
  }

  for (const [alias, entry] of codexProjectActions) {
    if (entry.projectKey === action.projectKey) codexProjectActions.delete(alias)
  }
  return { status: 'verified', message: 'Codex 项目已移出侧栏；项目目录和既有会话均未删除' }
}

function codexOpenHandoff(handoffId, stage) {
  const confirmed = stage === 'native-confirmed' || stage === 'applied'
  return {
    revision: 'companion-open-handoff-v1',
    handoffId,
    stage,
    sourceRelease: 'unknown',
    nativeVisible: confirmed,
    controlOwner: confirmed ? 'target-native' : 'unknown',
    confirmsRead: false
  }
}

async function openCodexThread(actionAlias) {
  if (typeof actionAlias !== 'string' || !/^ct_[A-Za-z0-9_-]{16,80}$/.test(actionAlias)) return { outcome: 'failed', errorCode: 'invalid-alias', message: '线程动作已失效' }
  const entry = codexThreadActions.get(actionAlias)
  if (!entry || entry.expiresAt <= Date.now() || !validCodexThreadId(entry.threadId)) {
    codexThreadActions.delete(actionAlias)
    return { outcome: 'failed', errorCode: 'expired-alias', message: '线程动作已过期，请刷新后重试' }
  }
  const handoffId = `coh_${crypto.randomBytes(12).toString('base64url')}`
  const target = `codex://threads/${encodeURIComponent(entry.threadId)}`
  const shell = electronShell()
  if (shell && typeof shell.openExternal === 'function') {
    try {
      await withFileActionTimeout(shell.openExternal(target))
      return honorHostExternalOpenRead(entry.threadId, {
        outcome: 'dispatched',
        confirmsRead: false,
        handoff: codexOpenHandoff(handoffId, 'dispatched'),
        message: '已发送打开请求，等待 Codex 原生确认'
      })
    } catch {
      return {
        outcome: 'failed',
        confirmsRead: false,
        handoff: codexOpenHandoff(handoffId, 'failed'),
        errorCode: 'open-failed',
        message: 'Codex 线程打开请求失败'
      }
    }
  }
  try {
    if (globalThis.utools && typeof globalThis.utools.shellOpenExternal === 'function') {
      const dispatched = globalThis.utools.shellOpenExternal(target)
      if (dispatched === false) throw new Error('shellOpenExternal rejected')
      return honorHostExternalOpenRead(entry.threadId, {
        outcome: 'dispatched',
        confirmsRead: false,
        handoff: codexOpenHandoff(handoffId, 'dispatched'),
        message: '已发送打开请求，等待 Codex 原生确认'
      })
    }
  } catch {}
  return {
    outcome: 'failed',
    confirmsRead: false,
    handoff: codexOpenHandoff(handoffId, 'failed'),
    errorCode: 'unsupported',
    message: '当前宿主不支持打开 Codex 线程'
  }
}

async function openCodexBlank() {
  const target = 'codex://new'
  const shell = electronShell()
  if (shell && typeof shell.openExternal === 'function') {
    try {
      await withFileActionTimeout(shell.openExternal(target))
      return {
        outcome: 'dispatched',
        message: 'Codex 空白页打开请求已发送，等待 Codex 原生界面确认'
      }
    } catch {
      return { outcome: 'failed', errorCode: 'open-failed', message: 'Codex 空白页打开失败' }
    }
  }
  try {
    if (globalThis.utools && typeof globalThis.utools.shellOpenExternal === 'function') {
      globalThis.utools.shellOpenExternal(target)
      return { outcome: 'dispatched' }
    }
  } catch {}
  return { outcome: 'failed', errorCode: 'unsupported', message: '当前宿主不支持打开 Codex 空白页' }
}

async function freshCodexNewThreadContext() {
  const [rateResult, accountResult, modelResult] = await Promise.all([
    requestCodexRpc('account/rateLimits/read', {}),
    requestCodexRpc('account/read', { refreshToken: false }),
    requestCodexRpc('model/list', {})
  ])
  if (codexRecord(accountResult).requiresOpenaiAuth === true && !codexRecord(accountResult).account) throw codexError('not-authenticated', 'Codex authentication required')
  const quota = sanitizeCodexQuota(rateResult, accountResult)
  const catalog = sanitizeCodexModelList(modelResult)
  const registry = readCodexNativeRegistry()
  const receivedAt = Date.now()
  return {
    quota: { version: 2, status: 'ok', ...quota, updatedAt: receivedAt },
    modelCatalog: { version: 1, status: 'ok', models: catalog.models, fingerprint: catalog.fingerprint, updatedAt: receivedAt },
    contextFingerprint: codexNewThreadContextFingerprint(quota, catalog.fingerprint, registry.fingerprint),
    projectFingerprint: registry.fingerprint,
    receivedAt,
    registry
  }
}

async function cleanupCodexZeroTurn(threadId) {
  try {
    await requestCodexRpc('thread/archive', { threadId })
    return true
  } catch {
    return false
  }
}

function safeCodexNewThreadContext(context) {
  return {
    quota: context.quota,
    modelCatalog: context.modelCatalog,
    contextFingerprint: context.contextFingerprint,
    projectFingerprint: context.projectFingerprint,
    receivedAt: context.receivedAt
  }
}

function refreshedCodexNewThreadTarget(projectKey, context) {
  if (projectKey === 'chats') {
    const project = { id: '', key: 'chats', name: 'Chats', kind: 'chats' }
    return {
      projectKey: 'chats',
      projectAlias: codexProjectActionAlias(project, context.projectFingerprint, Date.now()),
      projectName: 'Chats',
      projectKind: 'chats',
      projectFingerprint: context.projectFingerprint
    }
  }
  const project = context.registry.projects.find((item) => item.key === projectKey)
  if (!project) return undefined
  return {
    projectKey: project.key,
    projectAlias: codexProjectActionAlias({ ...project, kind: 'project' }, context.projectFingerprint, Date.now()),
    projectName: project.name,
    projectKind: 'project',
    projectFingerprint: context.projectFingerprint
  }
}

async function createCodexThread(request) {
  const input = codexRecord(request)
  const target = codexRecord(input.target)
  const projectKey = typeof target.projectKey === 'string' && /^(?:[a-f0-9]{16,64}|chats)$/.test(target.projectKey) ? target.projectKey : ''
  const projectAlias = typeof target.projectAlias === 'string' && /^cp_[A-Za-z0-9_-]{16,80}$/.test(target.projectAlias) ? target.projectAlias : ''
  const projectFingerprint = typeof target.projectFingerprint === 'string' && /^[a-f0-9]{64}$/.test(target.projectFingerprint) ? target.projectFingerprint : ''
  const contextFingerprint = typeof input.contextFingerprint === 'string' && /^[a-f0-9]{64}$/.test(input.contextFingerprint) ? input.contextFingerprint : ''
  const modelId = typeof input.modelId === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(input.modelId) ? input.modelId : ''
  const mode = input.mode === 'send-and-open' || input.mode === 'create-empty' ? input.mode : ''
  const prompt = typeof input.prompt === 'string' && input.prompt.length <= 50_000 ? input.prompt : ''
  if (!projectKey || !projectAlias || !projectFingerprint || !contextFingerprint || !modelId || !mode || (mode === 'send-and-open' && !prompt.trim())) {
    return { outcome: 'failed', errorCode: 'invalid-request', message: '新会话请求已失效，请重新打开编辑器', retryAllowed: true }
  }

  try {
    const context = await freshCodexNewThreadContext()
    const refreshedTarget = refreshedCodexNewThreadTarget(projectKey, context)
    if (context.contextFingerprint !== contextFingerprint || context.projectFingerprint !== projectFingerprint) {
      return { outcome: 'stale-selection', errorCode: 'selection-stale', message: '额度、模型目录或项目状态已更新，请确认刷新后的模型后再次提交', retryAllowed: true, context: safeCodexNewThreadContext(context), ...(refreshedTarget ? { target: refreshedTarget } : {}) }
    }
    const projectAction = codexProjectActions.get(projectAlias)
    if (!projectAction || projectAction.expiresAt <= Date.now() || projectAction.projectKey !== projectKey || projectAction.sourceFingerprint !== projectFingerprint) {
      return { outcome: 'stale-selection', errorCode: 'project-stale', message: '目标项目已更新，请重新确认后提交', retryAllowed: true, context: safeCodexNewThreadContext(context), ...(refreshedTarget ? { target: refreshedTarget } : {}) }
    }
    const model = context.modelCatalog.models.find((item) => item.id === modelId && item.supportsText === true)
    if (!model) {
      return { outcome: 'stale-selection', errorCode: 'model-unavailable', message: '所选模型已不在可用目录中，请重新选择', retryAllowed: true, context: safeCodexNewThreadContext(context), ...(refreshedTarget ? { target: refreshedTarget } : {}) }
    }

    let cwd
    if (projectKey !== 'chats') {
      const project = context.registry.projectById.get(projectAction.projectId)
      if (!project || project.key !== projectKey || !project.roots[0]) {
        return { outcome: 'stale-selection', errorCode: 'project-stale', message: '目标项目根目录已更新，请重新确认后提交', retryAllowed: true, context: safeCodexNewThreadContext(context), ...(refreshedTarget ? { target: refreshedTarget } : {}) }
      }
      cwd = project.roots[0]
    }

    const started = codexRecord(await requestCodexRpc('thread/start', {
      ...(cwd ? { cwd } : {}),
      model: modelId,
      allowProviderModelFallback: false,
      ephemeral: false
    }))
    const thread = codexRecord(started.thread)
    const threadId = validCodexThreadId(thread.id) ? thread.id : ''
    if (!threadId) return { outcome: 'failed', errorCode: 'thread-start-invalid', message: 'Codex 未返回有效的新会话', retryAllowed: true }
    const actualModel = typeof started.model === 'string' ? started.model : ''
    const actualCwd = codexNormalizeNativeRoot(started.cwd)
    if (actualModel !== modelId || (cwd && actualCwd !== cwd)) {
      const cleaned = await cleanupCodexZeroTurn(threadId)
      return cleaned
        ? { outcome: 'failed', errorCode: actualModel !== modelId ? 'model-mismatch' : 'project-mismatch', message: 'Codex 未按指定模型或项目创建会话，已清理本次空会话', retryAllowed: true }
        : { outcome: 'failed', errorCode: 'cleanup-failed', message: '新会话校验失败且清理未确认，已停止自动重试', retryAllowed: false }
    }

    const alias = codexThreadAlias(threadId, Date.now(), { projectKey, sourceFingerprint: projectFingerprint }).alias
    if (mode === 'send-and-open') {
      try {
        const turnResult = codexRecord(await requestCodexRpc('turn/start', { threadId, input: [{ type: 'text', text: prompt }] }))
        const turn = codexRecord(turnResult.turn)
        if (typeof turn.id !== 'string' || !turn.id) throw codexError('protocol-error', 'Codex did not return a Turn identity')
      } catch {
        const cleaned = await cleanupCodexZeroTurn(threadId)
        return cleaned
          ? { outcome: 'failed', errorCode: 'turn-start-failed', message: '首轮发送失败，空会话已清理；提示词仍保留，可重试', retryAllowed: true }
          : { outcome: 'failed', errorCode: 'cleanup-failed', message: '首轮发送失败且空会话清理未确认，已停止自动重试', retryAllowed: false }
      }
    }

    const opened = await openCodexThread(alias)
    if (opened.outcome === 'opened' || opened.outcome === 'dispatched') {
      return {
        outcome: opened.outcome === 'opened' ? 'opened' : 'created',
        modelId,
        retryAllowed: false,
        ...(opened.handoff ? { handoff: opened.handoff } : {}),
        ...(opened.message ? { message: opened.message } : {})
      }
    }
    if (mode === 'send-and-open') {
      return { outcome: 'reopen-available', modelId, reopenAlias: alias, errorCode: opened.errorCode || 'open-failed', message: '首轮已启动，但 Codex 页面未打开；可在短时间内重试打开', retryAllowed: true }
    }
    const cleaned = await cleanupCodexZeroTurn(threadId)
    return cleaned
      ? { outcome: 'failed', errorCode: 'open-failed', message: '空会话未能打开，已清理本次零轮会话', retryAllowed: true }
      : { outcome: 'failed', errorCode: 'cleanup-failed', message: '空会话未能打开且清理未确认，已停止自动重试', retryAllowed: false }
  } catch (error) {
    const code = typeof codexRecord(error).code === 'string' ? codexRecord(error).code : 'unavailable'
    if (['unavailable', 'runtime-unavailable', 'process-exited', 'not-authenticated', 'timeout'].includes(code)) {
      return { outcome: 'manual-only', errorCode: code, message: 'Codex App Server 当前不可用；不会复制或写入提示词，可显式打开 Codex 空白页手动创建', retryAllowed: true }
    }
    return { outcome: 'failed', errorCode: code, message: '新会话创建失败，请刷新后重试', retryAllowed: true }
  }
}

function electronIpcRenderer() {
  try {
    const electron = require('electron')
    return electron.ipcRenderer || null
  } catch {
    return null
  }
}

const companionCodexOpenResolutionInFlight = new Map()

function companionCodexActionForKey(key, excludedAlias = '') {
  if (typeof key !== 'string' || !key) return null
  const matches = [...codexThreadActions.entries()].filter(([alias, entry]) => (
    alias !== excludedAlias
    && entry?.key === key && entry.expiresAt > Date.now() && validCodexThreadId(entry.threadId)
  ))
  return matches.length === 1 ? { alias: matches[0][0], entry: matches[0][1] } : null
}

function companionCodexActionForHint(key, actionAlias) {
  if (typeof key !== 'string' || !key || typeof actionAlias !== 'string' || !actionAlias) return null
  const entry = codexThreadActions.get(actionAlias)
  if (!entry || entry.key !== key || entry.expiresAt <= Date.now() || !validCodexThreadId(entry.threadId)) return null
  return { alias: actionAlias, entry }
}

function renewCompanionCodexAliasFromPrivateInventory(key) {
  const matches = [...codexActivityInventory.entries()].filter(([, known]) => known?.key === key)
  if (matches.length !== 1 || !validCodexThreadId(matches[0][0])) return null
  const [threadId, known] = matches[0]
  const action = codexThreadAlias(threadId, Date.now(), {
    projectKey: typeof known.projectKey === 'string' ? known.projectKey : '',
    sourceFingerprint: codexActivitySourceFingerprint
  })
  return action.key === key ? companionCodexActionForKey(key) : null
}

function publishCompanionCodexAlias(key, actionAlias, fallbackTarget = null, metadata = null) {
  const current = companionTaskKernel?.getLatest?.() || companionTaskKernel?.getPackage?.()
  const task = current?.tasks?.find((candidate) => candidate.key === key && candidate.provider === 'codex')
  if (!current || typeof actionAlias !== 'string' || !actionAlias) return false
  if (task?.actionAlias === actionAlias && task.capabilities?.open === true) return true
  // Alias renewal is Host-private and open commands resolve by stable key. It
  // must not trigger an otherwise unnecessary Provider cold reconciliation.
  return true
}

async function readCompanionCodexOpenTarget(key) {
  if (typeof key !== 'string' || !/^[a-f0-9]{32}$/.test(key)) return null
  const registry = readCodexNativeRegistry()
  const rows = await listAllCodexThreads(false)
  const matches = rows.filter((value) => {
    const thread = codexRecord(value)
    return validCodexThreadId(thread.id)
      && codexThreadKey(thread.id) === key
      && Boolean(codexThreadNativeProject(thread, registry))
  })
  if (matches.length !== 1) return null
  const thread = codexRecord(matches[0])
  const native = codexThreadNativeProject(thread, registry)
  if (!native) return null
  const action = codexThreadAlias(thread.id, Date.now(), {
    projectKey: native.project.key,
    sourceFingerprint: registry.fingerprint,
    cwd: codexNormalizeNativeRoot(thread.cwd)
  })
  const resolved = action.key === key ? companionCodexActionForHint(key, action.alias) : null
  return resolved ? {
    ...resolved,
    metadata: {
      displayName: typeof thread.name === 'string' && thread.name ? thread.name : '新 Codex 任务',
      projectKey: native.project.key,
      projectName: native.project.name,
      projectKind: native.project.kind === 'chats' ? 'chats' : 'project'
    }
  } : null
}

function resolveCompanionCodexOpenTarget(key, excludedAlias = '') {
  const privateTarget = companionCodexActionForKey(key, excludedAlias)
    || renewCompanionCodexAliasFromPrivateInventory(key)
  if (privateTarget && privateTarget.alias !== excludedAlias) return Promise.resolve(privateTarget)
  const existing = companionCodexOpenResolutionInFlight.get(key)
  if (existing) return existing
  const operation = Promise.resolve()
    .then(() => readCompanionCodexOpenTarget(key))
    .finally(() => {
      if (companionCodexOpenResolutionInFlight.get(key) === operation) {
        companionCodexOpenResolutionInFlight.delete(key)
      }
    })
  companionCodexOpenResolutionInFlight.set(key, operation)
  return operation
}

async function openCompanionCodexTarget(target) {
  const key = typeof target?.key === 'string' ? target.key : ''
  if (!/^[a-f0-9]{32}$/.test(key)) {
    return { outcome: 'failed', errorCode: 'invalid-target', message: '线程身份无效' }
  }
  let resolved = companionCodexActionForHint(key, target.actionAlias)
  if (!resolved) {
    try { resolved = await resolveCompanionCodexOpenTarget(key, target.actionAlias) } catch {}
  }
  if (!resolved) return { outcome: 'failed', errorCode: 'target-missing', message: '未找到同一任务，未跳转到其它任务' }
  publishCompanionCodexAlias(key, resolved.alias, target, resolved.metadata)
  let result = await openCodexThread(resolved.alias)
  if (!['expired-alias', 'invalid-alias', 'stale-alias'].includes(result?.errorCode || '')) return result
  if (codexThreadActions.get(resolved.alias)?.key === key) codexThreadActions.delete(resolved.alias)
  let refreshed = null
  try { refreshed = await resolveCompanionCodexOpenTarget(key, resolved.alias) } catch {}
  if (!refreshed) return result
  publishCompanionCodexAlias(key, refreshed.alias, target, refreshed.metadata)
  result = await openCodexThread(refreshed.alias)
  return result
}

async function openCompanionClaudeTarget(target) {
  const exactAlias = typeof target?.key === 'string' && target.key.startsWith('claude:')
    ? target.key.slice('claude:'.length)
    : ''
  const result = await (claudeBridge
    ? claudeBridge.openTask(exactAlias || target.actionAlias)
    : claudeUnavailable('open'))
  if (result?.outcome === 'opened' || result?.outcome === 'dispatched') {
    queueMicrotask(() => queueCompanionHostReconciliation('claude'))
  }
  return result
}

async function openCompanionCursorTarget(target) {
  const exactAlias = typeof target?.key === 'string' && target.key.startsWith('cursor:')
    ? target.key.slice('cursor:'.length)
    : ''
  const result = cursorBridge
    ? await cursorBridge.openTask(String(exactAlias || target.actionAlias || ''))
    : cursorUnavailable('open')
  if (result?.outcome === 'opened' || result?.outcome === 'dispatched') {
    queueMicrotask(() => queueCompanionHostReconciliation('cursor'))
  }
  return result
}

function codexPrivateThreadSettings(...values) {
  for (const value of values) {
    const source = codexRecord(value)
    const thread = codexRecord(source.thread)
    const model = [source.model, thread.model, source.modelId, thread.modelId]
      .find((candidate) => typeof candidate === 'string' && candidate.trim())
    if (!model) continue
    const effort = [
      source.reasoningEffort,
      source.reasoning_effort,
      thread.reasoningEffort,
      thread.reasoning_effort,
      source.model_reasoning_effort,
      thread.model_reasoning_effort
    ].find((candidate) => typeof candidate === 'string' && candidate.trim())
    return { model: model.trim().slice(0, 120), reasoningEffort: effort ? effort.trim().slice(0, 80) : null }
  }
  return { model: '', reasoningEffort: null }
}

function markCodexPlanExecutionStarted(threadId, turnValue) {
  const known = codexActivityInventory.get(threadId)
  if (!known) return
  known.planReady = false
  known.planLifecycleRevision = 0
  known.planImplementationOnly = false
  known.connectorPlanReady = false
  known.connectorPlanLifecycleRevision = 0
  known.connectorPlanImplementationOnly = false
  known.turnMode = 'default'
  known.connectorTurnMode = 'default'
  const bridge = codexEnsureDesktopBridge()
  if (!codexApplyStartedTurnNotification(bridge, known, threadId, turnValue)) {
    known.status = 'active'
    known.activeFlags = []
    known.statusAuthority = 'app-server-live'
    known.activityEvidence = 'activity-event'
    known.lastTurnStatus = 'inProgress'
    known.lastTurnEvidence = 'turn-started'
    known.activityRevision = codexActivityGeneration + 1
    codexMarkAppServerLiveActive(known, undefined, threadId, true)
    emitCodexActivityDelta([known], false, 'urgent')
  }
}

async function confirmCodexPlanExecutionStarted(threadId, beforeTurn) {
  try {
    const reread = sanitizeCodexTurnStatusPage(await requestCodexRpc('thread/turns/list', {
      threadId,
      limit: 1,
      sortDirection: 'desc',
      itemsView: 'notLoaded'
    }, CODEX_THREAD_TURN_STATUS_TIMEOUT_MS))
    const newTurn = reread && (reread.id && reread.id !== beforeTurn?.id
      || reread.startedAt > Number(beforeTurn?.startedAt || 0))
    if (!newTurn || reread.status !== 'inProgress') return false
    markCodexPlanExecutionStarted(threadId, reread)
    return true
  } catch {
    return false
  }
}

async function executeCompanionCodexPlan(target, request = {}) {
  const key = typeof target?.key === 'string' ? target.key : ''
  if (!/^[a-f0-9]{32}$/.test(key)) {
    return { outcome: 'failed', errorCode: 'invalid-target', message: '线程身份无效' }
  }
  let resolved = companionCodexActionForHint(key, target.actionAlias)
  if (!resolved) {
    try { resolved = await resolveCompanionCodexOpenTarget(key, target.actionAlias) } catch {}
  }
  if (!resolved) {
    return { outcome: 'failed', errorCode: 'target-missing', message: '未找到同一任务，未执行其它任务' }
  }
  publishCompanionCodexAlias(key, resolved.alias, target, resolved.metadata)
  const latestPackageTask = companionTaskKernel?.getLatest?.().tasks?.find((task) => task.key === target.key)
    || companionTaskKernel?.getPackage?.().tasks?.find((task) => task.key === target.key)
  if (!latestPackageTask
    || latestPackageTask.planReady !== true
    || latestPackageTask.planLifecycleRevision !== target.planLifecycleRevision
    || latestPackageTask.capabilities?.executePlan !== true
    || !isSettledTaskPhase(latestPackageTask.phase)) {
    return { outcome: 'failed', errorCode: 'state-changed', message: 'Plan 生命周期已变化，未启动执行' }
  }

  let stage = 'preflight'
  let beforeTurn = null
  const threadId = resolved.entry.threadId
  try {
    const capabilityPromise = inspectCodexNativePlanExecutionCapability()
    const [threadResult, turnPage] = await Promise.all([
      requestCodexRpc('thread/read', { threadId, includeTurns: false }),
      requestCodexRpc('thread/turns/list', {
        threadId,
        limit: 1,
        sortDirection: 'desc',
        itemsView: 'notLoaded'
      }, CODEX_THREAD_TURN_STATUS_TIMEOUT_MS)
    ])
    const thread = codexRecord(codexRecord(threadResult).thread)
    beforeTurn = sanitizeCodexTurnStatusPage(turnPage)
    const known = codexActivityInventory.get(threadId)
    const hasOtherPending = known?.activeFlags?.includes('waitingOnApproval')
      || known?.activeFlags?.includes('waitingOnUserInput') && known.planImplementationOnly !== true
    const realWorkActive = beforeTurn?.status === 'inProgress'
      || known?.status === 'active' && (!known.activeFlags?.length || hasOtherPending)
    if (thread.id !== threadId || !beforeTurn || realWorkActive || hasOtherPending) {
      return { outcome: 'failed', errorCode: 'state-changed', message: '目标任务已有更新活动或其它待决请求' }
    }

    stage = 'open'
    const opened = await openCompanionCodexTarget({ ...target, actionAlias: resolved.alias })
    if (!opened || !['opened', 'dispatched'].includes(opened.outcome)) {
      return { outcome: 'failed', errorCode: opened?.errorCode || 'open-failed', message: opened?.message || '原 Codex 对话未能打开，未发送执行指令' }
    }

    stage = 'resume'
    const resumed = codexRecord(await requestCodexRpc('thread/resume', {
      threadId,
      excludeTurns: true
    }))
    const settings = codexPrivateThreadSettings(resumed, threadResult)
    const capability = await capabilityPromise
    const useNativeDefaultMode = capability.available === true && Boolean(settings.model)

    stage = 'turn-start'
    const turnStartParams = {
      threadId,
      input: [{ type: 'text', text: EXECUTE_PLAN_PROMPT_V1 }],
      ...(useNativeDefaultMode ? { collaborationMode: {
        mode: 'default',
        settings: {
          model: settings.model,
          reasoning_effort: settings.reasoningEffort,
          developer_instructions: null
        }
      } } : {})
    }
    const started = codexRecord(await requestCodexRpc('turn/start', turnStartParams))
    const turn = codexRecord(started.turn)
    if (typeof turn.id !== 'string' || !turn.id) {
      if (await confirmCodexPlanExecutionStarted(threadId, beforeTurn)) {
        return { outcome: 'executed', operationId: request.operationId, message: '已通过定向复读确认 Plan 正在执行' }
      }
      return { outcome: 'indeterminate', errorCode: 'turn-start-invalid', message: 'Codex 未返回可确认的新 Turn；未自动重发' }
    }
    markCodexPlanExecutionStarted(threadId, turn)
    return {
      outcome: 'executed',
      operationId: request.operationId,
      message: useNativeDefaultMode ? '已按原 Plan 启动执行' : '已向原任务发送执行 Plan 指令'
    }
  } catch (error) {
    const code = typeof codexRecord(error).code === 'string' ? codexRecord(error).code : 'execute-failed'
    if (code !== 'timeout' && code !== 'process-exited') {
      return { outcome: 'failed', errorCode: `${stage}-${code}`.slice(0, 80), message: `Plan 执行在 ${stage} 阶段失败` }
    }
    if (await confirmCodexPlanExecutionStarted(threadId, beforeTurn)) {
      return { outcome: 'executed', operationId: request.operationId, message: '已通过定向复读确认 Plan 正在执行' }
    }
    return { outcome: 'indeterminate', errorCode: `${stage}-indeterminate`, message: '执行结果未能确认；未自动重发，可核验状态后重新确认' }
  }
}

function companionTaskConfiguration() {
  const state = codexRecord(readState())
  const appSettings = codexRecord(state.settings)
  const featureConfigs = Array.isArray(appSettings.featureConfigs) ? appSettings.featureConfigs : []
  const feature = featureConfigs.map(codexRecord).find((item) => item.id === 'codex')
  const settings = codexRecord(codexRecord(state.codex).settings)
  const providerSource = codexRecord(settings.providers)
  return {
    enabled: feature?.enabled !== false && settings.conversationInboxEnabled !== false,
    dynamicTaskWindowHours: Number.isFinite(settings.dynamicTaskWindowHours)
      ? Math.max(1, Math.min(24 * 30, Math.trunc(settings.dynamicTaskWindowHours)))
      : 48,
    providers: {
      codex: providerSource.codex === undefined ? true : providerSource.codex === true,
      claude: providerSource.claude === true,
      cursor: providerSource.cursor === true
    }
  }
}

function companionPersistedTaskState() {
  const codex = codexRecord(codexRecord(readState()).codex)
  const aliases = new Map(
    (Array.isArray(codex.taskAliases) ? codex.taskAliases : [])
      .map(codexRecord)
      .filter((entry) => typeof entry.key === 'string' && typeof entry.alias === 'string' && entry.alias.trim())
      .map((entry) => [entry.key, entry.alias.trim().slice(0, 120)])
  )
  const taskPins = (Array.isArray(codex.localPins) ? codex.localPins : [])
      .map(codexRecord)
      .filter((pin) => pin.kind === 'task' && typeof pin.key === 'string')
  const pins = new Set(taskPins.map((pin) => pin.key))
  const pinOrder = new Map(taskPins.map((pin, index) => [pin.key, index]))
  const manualPhases = new Map(
    (Array.isArray(codex.manualPhases) ? codex.manualPhases : [])
      .map(codexRecord)
      .filter((entry) => typeof entry.key === 'string' && isManualTaskPhase(entry.phase)
        && Number.isFinite(entry.setAt) && entry.setAt > 0)
      .map((entry) => [entry.key, { phase: entry.phase, setAt: entry.setAt }])
  )
  const receipts = new Map(
    (Array.isArray(codex.receipts) ? codex.receipts : [])
      .map(codexRecord)
      .filter((receipt) => typeof receipt.key === 'string')
      .map((receipt) => [receipt.key, receipt])
  )
  const collapsed = new Set(
    (Array.isArray(codex.collapsedTaskKeys) ? codex.collapsedTaskKeys : [])
      .filter((key) => typeof key === 'string' && key)
  )
  return { aliases, pins, pinOrder, receipts, collapsed }
}

/** Derived from the bound vocabulary so the entry adds no second phase list. */
function isManualTaskPhase(phase) {
  return phase !== 'unknown' && typeof isKnownTaskPhase === 'function' && isKnownTaskPhase(phase)
}

function persistCompanionPreference(input = {}) {
  const command = typeof input.command === 'string' ? input.command : ''
  const key = typeof input.key === 'string' && input.key.length <= 256 ? input.key : ''
  if (!key || (command !== 'set-alias' && command !== 'set-collapse' && command !== 'set-manual-phase')) return false
  const state = readState()
  if (!state || typeof state !== 'object') return false
  const codex = codexRecord(state.codex)
  const nextCodex = { ...codex }
  if (command === 'set-alias') {
    const alias = typeof input.payload?.alias === 'string' ? input.payload.alias.trim().slice(0, 120) : ''
    const entries = (Array.isArray(codex.taskAliases) ? codex.taskAliases : [])
      .map(codexRecord)
      .filter((entry) => typeof entry.key === 'string' && entry.key !== key
        && typeof entry.alias === 'string' && entry.alias.trim())
      .map((entry) => ({ key: entry.key, alias: entry.alias.trim().slice(0, 120) }))
    nextCodex.taskAliases = [...entries, ...(alias ? [{ key, alias }] : [])].slice(-500)
  } else if (command === 'set-manual-phase') {
    // An empty/invalid phase is the retire signal, so one command covers both
    // setting the stand-in and clearing it once real evidence arrives.
    const phase = isManualTaskPhase(input.payload?.phase) ? input.payload.phase : ''
    const entries = (Array.isArray(codex.manualPhases) ? codex.manualPhases : [])
      .map(codexRecord)
      .filter((entry) => typeof entry.key === 'string' && entry.key !== key && isManualTaskPhase(entry.phase)
        && Number.isFinite(entry.setAt) && entry.setAt > 0)
      .map((entry) => ({ key: entry.key, phase: entry.phase, setAt: entry.setAt }))
    nextCodex.manualPhases = [...entries, ...(phase ? [{ key, phase, setAt: Date.now() }] : [])].slice(-500)
  } else {
    const collapsed = new Set((Array.isArray(codex.collapsedTaskKeys) ? codex.collapsedTaskKeys : [])
      .filter((value) => typeof value === 'string' && value))
    if (input.payload?.collapsed === true) collapsed.add(key)
    else collapsed.delete(key)
    nextCodex.collapsedTaskKeys = [...collapsed].slice(-500)
  }
  return writeState({ ...state, codex: nextCodex, updatedAt: Date.now() })
}

function migrateHiddenCompanionPlan(input = {}) {
  const key = typeof input.key === 'string' ? input.key : ''
  if (!key) return false
  const state = readState()
  const source = codexRecord(state)
  const codex = codexRecord(source.codex)
  if (!Array.isArray(codex.receipts)) return true
  const receipts = codex.receipts.filter((value) => codexRecord(value).key !== key)
  if (receipts.length === codex.receipts.length) return true
  return writeState({ ...source, codex: { ...codex, receipts } })
}

function companionPrivateChildKey(provider, parentKey, childId) {
  return `${provider}-child:${crypto.createHash('sha256')
    .update(String(provider))
    .update('\0')
    .update(String(parentKey))
    .update('\0')
    .update(String(childId))
    .digest('hex')
    .slice(0, 32)}`
}

function companionCausalKey(provider, taskKey, identity) {
  if (typeof identity !== 'string' && !Number.isFinite(Number(identity))) return ''
  const value = String(identity || '')
  if (!value) return ''
  return crypto.createHash('sha256')
    .update('companion-causal-v1')
    .update('\0')
    .update(String(provider || 'unknown'))
    .update('\0')
    .update(String(taskKey || ''))
    .update('\0')
    .update(value)
    .digest('hex')
    .slice(0, 32)
}

function companionDiagnosticTaskRef(provider, taskRef) {
  if (typeof taskRef !== 'string' || !taskRef) return ''
  const digest = crypto.createHash('sha256')
    .update(COMPANION_DIAGNOSTIC_TASK_SALT)
    .update(String(provider || 'unknown'))
    .update(taskRef)
    .digest('hex')
    .slice(0, 16)
  return `h:${digest}`
}

function recordCompanionDiagnosticEvent(event) {
  const source = codexRecord(event)
  return runtimeDiagnostics.record({
    ...source,
    level: source.level,
    ...(source.taskRef ? { taskRef: companionDiagnosticTaskRef(source.provider, source.taskRef) } : {})
  })
}

function recordCompanionStateDecision(provider, key, decision, evidence, previous = null, next = null, generation = 0, packageRevision = 0) {
  runtimeDiagnostics.record({
    level: 'info',
    scope: 'task-push',
    // This is the Evidence Adapter's bounded proposal. Only the provider-level
    // event emitted after Kernel publication may say accepted/superseded.
    event: 'state-proposal',
    outcome: 'proposed',
    provider,
    phase: decision.phase,
    reason: decision.reason,
    evidence: evidence || 'none',
    taskRef: companionDiagnosticTaskRef(provider, key),
    ...(previous?.phase ? { beforePhase: previous.phase } : {}),
    ...(next?.phase || decision.phase ? { afterPhase: next?.phase || decision.phase } : {}),
    ...(typeof previous?.unread === 'boolean' ? { beforeUnread: previous.unread } : {}),
    ...(typeof next?.unread === 'boolean' ? { afterUnread: next.unread } : {}),
    turnStartedAt: Number(next?.turnStartedAt || decision.details?.lastTurnStartedAt) || 0,
    statusEnteredAt: Number(next?.statusEnteredAt) || 0,
    terminalAt: Number(next?.terminalAt || decision.details?.lastTurnCompletedAt) || 0,
    observationGeneration: Number(generation || next?.observationGeneration) || 0,
    semanticRevision: Number(next?.semanticRevision || previous?.semanticRevision) || 0,
    packageRevision: Number(packageRevision) || 0,
    cache: 'process-package',
    details: decision.details
  })
}

function recordCompanionProbeGate(event, outcome, details = {}) {
  runtimeDiagnostics.record({
    level: 'debug',
    scope: 'task-probe',
    event,
    outcome,
    details
  })
}

function companionEvidenceSequenceV7(...values) {
  return Math.max(0, ...values.flat().map((value) => {
    const numeric = Math.trunc(Number(value))
    return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : 0
  }))
}

function companionSyntheticInteractionRefV7(input = {}) {
  const source = codexRecord(input)
  return crypto.createHash('sha256')
    .update('companion-interaction-v7')
    .update('\0')
    .update(String(source.provider || 'unknown'))
    .update('\0')
    .update(String(source.taskKey || ''))
    .update('\0')
    .update(String(source.branchRef || 'root'))
    .update('\0')
    .update(String(source.kind || 'user-input'))
    .update('\0')
    .update(String(source.turnEpoch || 0))
    .update('\0')
    .update(String(source.sequence || 0))
    .digest('hex')
    .slice(0, 32)
}

function companionSyntheticInteractionBundleV7(input = {}) {
  const source = codexRecord(input)
  const sequence = companionEvidenceSequenceV7(source.sequence)
  const requestSetRevision = companionEvidenceSequenceV7(source.requestSetRevision, sequence)
  if (!requestSetRevision || typeof source.taskKey !== 'string' || !source.taskKey) {
    return { interactions: [], interactionSets: [] }
  }
  const interaction = source.kind
    ? createCompanionInteractionEvidenceV7({
        provider: source.provider,
        taskKey: source.taskKey,
        branchRef: source.branchRef || 'root',
        interactionRef: companionSyntheticInteractionRefV7({ ...source, sequence }),
        kind: source.kind,
        state: source.state || 'opened',
        sequence,
        turnEpoch: companionEvidenceSequenceV7(source.turnEpoch),
        requestSetRevision,
        authority: source.authority || 'provider-live',
        exact: source.exact === true
      })
    : null
  const interactionSet = source.complete === false
    ? null
    : createCompanionInteractionSetV7({
        provider: source.provider,
        taskKey: source.taskKey,
        requestSetRevision,
        complete: true
      })
  return {
    interactions: interaction ? [interaction] : [],
    interactionSets: interactionSet ? [interactionSet] : []
  }
}

function companionProviderMetadataV7(input = {}) {
  const source = codexRecord(input)
  const revisionAt = companionEvidenceSequenceV7(source.revisionAt, 1)
  return {
    kind: source.kind,
    actionAlias: typeof source.actionAlias === 'string' ? source.actionAlias : '',
    capabilityToken: typeof source.capabilityToken === 'string' ? source.capabilityToken : source.actionAlias || '',
    revisionAt,
    membershipRevision: companionEvidenceSequenceV7(source.membershipRevision, revisionAt),
    visibilityRevision: companionEvidenceSequenceV7(source.visibilityRevision, revisionAt),
    metadataRevision: companionEvidenceSequenceV7(source.metadataRevision, revisionAt),
    lastQuestionAt: companionEvidenceSequenceV7(source.lastQuestionAt),
    createdAt: companionEvidenceSequenceV7(source.createdAt),
    displayOrder: companionEvidenceSequenceV7(source.displayOrder),
    cycleOrder: companionEvidenceSequenceV7(source.cycleOrder),
    attentionOrder: companionEvidenceSequenceV7(source.attentionOrder),
    hidden: source.hidden === true,
    paused: false,
    turnMode: source.turnMode === 'plan' || source.turnMode === 'default' ? source.turnMode : 'unknown',
    idleConfirmed: source.idleConfirmed === true,
    localPin: source.localPin === true,
    manualPhase: isManualTaskPhase(source.manualPhase) ? source.manualPhase : '',
    manualPhaseSetAt: companionEvidenceSequenceV7(source.manualPhaseSetAt),
    dynamicEligible: source.dynamicEligible === true,
    ...(typeof source.displayName === 'string' ? { displayName: source.displayName.slice(0, 240) } : {}),
    ...(typeof source.originalTitle === 'string' ? { originalTitle: source.originalTitle.slice(0, 240) } : {}),
    alias: typeof source.alias === 'string' ? source.alias.slice(0, 120) : '',
    ...(typeof source.projectKey === 'string' ? { projectKey: source.projectKey.slice(0, 256) } : {}),
    ...(typeof source.projectName === 'string' ? { projectName: source.projectName.slice(0, 240) } : {}),
    ...(source.projectKind === 'project' || source.projectKind === 'chats' ? { projectKind: source.projectKind } : {}),
    ...(source.archiveRequest && typeof source.archiveRequest === 'object' ? { archiveRequest: source.archiveRequest } : {})
  }
}

function companionUnknownObservationV7(input = {}) {
  const source = codexRecord(input)
  return {
    kind: 'unknown',
    exact: false,
    candidates: [{
      kind: 'unknown',
      exact: false,
      sequence: companionEvidenceSequenceV7(source.activitySequence),
      observedAt: companionEvidenceSequenceV7(source.observedAt),
      statusEnteredAt: 0,
      turnStartedAt: 0,
      terminalAt: 0
    }],
    sequence: companionEvidenceSequenceV7(source.activitySequence),
    statusEnteredAt: 0,
    turnStartedAt: 0,
    terminalAt: 0,
    unreadKnown: source.unreadKnown === true,
    unread: source.unreadKnown === true && source.unread === true,
    unreadSequence: companionEvidenceSequenceV7(source.unreadSequence),
    interactionKind: '',
    interactionSequence: 0,
    planState: source.planState || 'unknown',
    planSequence: companionEvidenceSequenceV7(source.planSequence),
    planActionable: source.planActionable === true,
    planReason: source.planReason || ''
  }
}

function companionCodexInventoryMatchV7(key) {
  if (typeof key !== 'string' || !key) return null
  for (const [threadId, known] of codexActivityInventory) {
    if (known?.key === key) return { threadId, known }
  }
  return null
}

/** The completed-unread badge oscillated because two evidence builders kept
 * publishing different root unread values for the same tasks. Logging only
 * per-key transitions of that value names both sides of the tug-of-war. */
const codexRootUnreadEvidenceLines = new Map()
function noteCodexRootUnreadEvidence(key, details) {
  const line = JSON.stringify(details)
  if (codexRootUnreadEvidenceLines.get(key) === line) return
  codexRootUnreadEvidenceLines.set(key, line)
  runtimeDiagnostics.record({
    level: 'info',
    scope: 'task-evidence',
    event: 'root-unread-evidence',
    outcome: details.observationUnread ? 'unread' : details.observationKnown ? 'read' : 'unknown',
    provider: 'codex',
    taskRef: key,
    details
  })
}

function companionCodexFallbackBranchV7(threadValue) {
  const thread = codexRecord(threadValue)
  return {
    ref: 'root',
    branchKind: 'main',
    topologyExact: true,
    unreadKnown: thread.unreadAuthority !== 'unavailable' && typeof thread.hasUnreadTurn === 'boolean',
    hasUnreadTurn: thread.hasUnreadTurn === true,
    status: thread.status,
    statusAuthority: thread.statusAuthority,
    activityEvidence: thread.activityEvidence,
    activeFlags: Array.isArray(thread.activeFlags) ? thread.activeFlags : [],
    planImplementationOnly: thread.planImplementationOnly === true,
    planReady: thread.planReady === true || thread.planImplementationOnly === true,
    planLifecycleState: thread.planLifecycleState,
    planLifecycleRevision: Number(thread.planLifecycleRevision) || 0,
    planClearReason: thread.planClearReason,
    goalStatus: thread.goalStatus,
    goalFreshness: thread.goalFreshness,
    goalUpdatedAt: Number(thread.goalUpdatedAt) || 0,
    goalEvidenceSequence: Number(thread.goalEvidenceSequence) || 0,
    lastTurnStatus: thread.lastTurnStatus,
    lastTurnEvidence: thread.lastTurnEvidence,
    activeEvidenceSequence: Number(thread.activeEvidenceSequence) || Number(thread.activityRevision) || 0,
    terminalEvidenceSequence: Number(thread.terminalEvidenceSequence) || 0,
    idleConfirmed: thread.idleConfirmed === true,
    waitingSince: Number(thread.waitingSince) || 0,
    turnStartedAt: Number(thread.lastTurnStartedAt) || 0,
    terminalAt: Number(thread.lastTurnCompletedAt) || 0,
    transitionAt: Number(thread.waitingSince)
      || Number(thread.lastTurnCompletedAt)
      || Number(thread.lastTurnStartedAt)
      || 0,
    observedAt: companionEvidenceSequenceV7(
      thread.activityRevision,
      thread.activeEvidenceSequence,
      thread.terminalEvidenceSequence,
      thread.updatedAt
    )
  }
}

function companionCodexEvidenceV7(threadValue, input = {}) {
  const thread = codexRecord(threadValue)
  const key = typeof thread.key === 'string' ? thread.key : ''
  if (!key) return { nodes: [], interactions: [], interactionSets: [], relations: [], maxima: {} }
  const persisted = input.persisted || companionPersistedTaskState()
  const match = companionCodexInventoryMatchV7(key)
  const privateEvidence = match ? codexPrivateBranchEvidence(match.threadId, match.known) : null
  const hostExternal = match?.threadId
    && codexhostDiscovery?.isExternalThreadId?.(match.threadId) === true
  const branches = (Array.isArray(privateEvidence?.branches) && privateEvidence.branches.length
    ? privateEvidence.branches
    : [companionCodexFallbackBranchV7({ ...(match?.known || {}), ...thread })])
    .map((branch) => hostExternal ? { ...codexRecord(branch), hostExternal: true } : branch)
  const family = `codex:${key}`
  const dynamicCutoff = Number(input.dynamicCutoff) || 0
  const nodes = []
  const relations = []
  const syntheticInteractions = []
  let syntheticRequestSetRevision = 0
  let order = Number(input.order) || 0
  const rootSource = { ...(match?.known || {}), ...thread }
  const rootActionAlias = typeof rootSource.actionAlias === 'string' ? rootSource.actionAlias : ''
  const originalTitle = typeof rootSource.displayName === 'string' && rootSource.displayName
    ? rootSource.displayName.slice(0, 240)
    : typeof rootSource.name === 'string' && rootSource.name
      ? rootSource.name.slice(0, 240)
      : 'Codex 任务'
  const alias = persisted.aliases.get(key) || ''
  for (const branchValue of branches) {
    const branch = codexRecord(branchValue)
    const isRoot = branch.branchKind !== 'side'
    const branchRef = isRoot ? 'root' : branch.ref
    const nodeKey = isRoot ? key : `codex-child:${branch.ref}`
    const observation = codexBranchObservationV7(branch)
    const hydrationOnlyActive = isRoot
      && input.authority === 'provider-live'
      && thread.status === 'active'
      && thread.activityEvidence !== 'activity-event'
      && Number(thread.activeEvidenceSequence) <= 0
      && (!Array.isArray(thread.activeFlags) || thread.activeFlags.length === 0)
      && hostExternal !== true
    if (hydrationOnlyActive) {
      // A hydration row is membership evidence, not proof of a running or
      // terminal Turn. Conflicting private history therefore enters the V7
      // unknown state until an exact Turn/Goal event arrives.
      observation.candidates = [{
        kind: 'unknown',
        authority: 'unknown',
        exact: false,
        sequence: observation.sequence,
        observedAt: observation.sequence,
        statusEnteredAt: 0,
        turnStartedAt: 0,
        terminalAt: 0
      }]
    }
    if (isRoot && typeof thread.hasUnreadTurn === 'boolean' && thread.unreadAuthority !== 'unavailable') {
      observation.unreadKnown = true
      observation.unread = thread.hasUnreadTurn === true
    }
    if (isRoot) noteCodexRootUnreadEvidence(key, {
      entryUnread: typeof thread.hasUnreadTurn === 'boolean' ? thread.hasUnreadTurn : null,
      entryAuthority: typeof thread.unreadAuthority === 'string' ? thread.unreadAuthority : '',
      observationUnread: observation.unread === true,
      observationKnown: observation.unreadKnown === true,
      branchSource: privateEvidence ? 'private' : 'fallback',
      authority: typeof input.authority === 'string' ? input.authority : '',
      // A rebuilt node overwrites kernel-local pin state with this value, so
      // its transitions are the other half of any pin-flash forensics.
      localPin: persisted.pins.has(key),
      persistedPinCount: persisted.pins.size
    })
    if (observation.unreadKnown === true && input.unreadSequence) {
      observation.unreadSequence = Math.max(
        companionEvidenceSequenceV7(observation.unreadSequence),
        companionEvidenceSequenceV7(input.unreadSequence)
      )
    }
    if (!isRoot) {
      observation.planState = 'unknown'
      observation.planSequence = 0
      observation.planActionable = false
      observation.planReason = ''
    }
    const revisionAt = companionEvidenceSequenceV7(
      observation.sequence,
      rootSource.updatedAt,
      rootSource.lastTurnStartedAt,
      rootSource.lastTurnCompletedAt,
      1
    )
    const localPin = isRoot && persisted.pins.has(key)
    const manualPhaseEntry = persisted.manualPhases?.get(key)
    const hidden = isRoot && Number(persisted.receipts.get(key)?.dismissedActivityRecency) >= revisionAt
    const terminalCandidate = (observation.candidates || []).some((candidate) => (
      candidate.exact === true && ['turn-completed', 'turn-interrupted', 'turn-failed'].includes(candidate.kind)
    ))
    const archiveRequest = isRoot && terminalCandidate
      && Number(rootSource.updatedAt) > 0
      && Number(rootSource.lastTurnStartedAt) > 0
      && typeof input.sourceFingerprint === 'string' && input.sourceFingerprint
      ? {
          expectedUpdatedAt: Number(rootSource.updatedAt),
          expectedRevisionAt: Number(rootSource.lastTurnCompletedAt) || Number(rootSource.lastTurnStartedAt),
          ...(Number(rootSource.lastTurnCompletedAt) ? { expectedCompletionAt: Number(rootSource.lastTurnCompletedAt) } : {}),
          expectedLastTurnStartedAt: Number(rootSource.lastTurnStartedAt),
          expectedSourceFingerprint: input.sourceFingerprint,
          evidence: rootSource.lastTurnStatus === 'completed' ? 'completed' : 'stopped'
        }
      : undefined
    const capabilities = isRoot
      ? [
          ...(rootActionAlias ? ['open'] : []),
          ...(terminalCandidate ? ['archive'] : []),
          ...(observation.planState === 'available' ? ['pause', 'resume', 'execute-plan'] : [])
        ]
      : []
    const metadata = companionProviderMetadataV7({
      kind: isRoot ? localPin ? 'local-pin' : 'codex-thread' : 'topology-child',
      actionAlias: isRoot ? rootActionAlias : '',
      capabilityToken: isRoot ? rootActionAlias : '',
      revisionAt,
      membershipRevision: companionEvidenceSequenceV7(rootSource.updatedAt, revisionAt),
      visibilityRevision: companionEvidenceSequenceV7(rootSource.updatedAt, revisionAt),
      metadataRevision: companionEvidenceSequenceV7(rootSource.updatedAt, revisionAt),
      lastQuestionAt: isRoot ? companionEvidenceSequenceV7(rootSource.lastQuestionAt, rootSource.lastTurnStartedAt) : observation.turnStartedAt,
      createdAt: isRoot ? companionEvidenceSequenceV7(rootSource.createdAt) : observation.turnStartedAt,
      displayOrder: isRoot && localPin ? persisted.pinOrder?.get(key) ?? order : order,
      cycleOrder: order,
      attentionOrder: order++,
      hidden,
      turnMode: isRoot ? rootSource.turnMode : 'unknown',
      idleConfirmed: !(observation.candidates || []).some((candidate) => candidate.kind === 'turn-running'),
      localPin,
      // Only a root row carries a hand-set phase: a topology child has its own
      // evidence and must not inherit the parent's stand-in.
      manualPhase: isRoot ? manualPhaseEntry?.phase || '' : '',
      manualPhaseSetAt: isRoot ? manualPhaseEntry?.setAt || 0 : 0,
      dynamicEligible: !isRoot || dynamicCutoff === 0 || companionEvidenceSequenceV7(
        rootSource.lastQuestionAt,
        rootSource.lastTurnStartedAt,
        rootSource.waitingSince,
        rootSource.lastTurnCompletedAt,
        rootSource.createdAt
      ) >= dynamicCutoff,
      ...(isRoot ? {
        displayName: alias || originalTitle,
        originalTitle,
        alias,
        projectKey: rootSource.projectKey,
        projectName: rootSource.projectName,
        projectKind: rootSource.projectKind,
        archiveRequest
      } : {})
    })
    const node = createCompanionEvidenceNodeV7({
      provider: 'codex',
      key: nodeKey,
      family,
      role: isRoot ? 'root' : 'child',
      observation,
      causalKey: companionCausalKey('codex', nodeKey, observation.turnStartedAt || observation.sequence),
      observedAt: observation.sequence,
      metadata,
      capabilities,
      standaloneEligible: isRoot
    })
    if (node) nodes.push(node)
    if (!isRoot) {
      relations.push({
        childKey: nodeKey,
        parentKey: key,
        provider: 'codex',
        family,
        relation: 'side-thread',
        authority: 'codex-app-server-inventory',
        exact: branch.topologyExact === true,
        generation: companionEvidenceSequenceV7(input.topologyGeneration, observation.sequence)
      })
    }
    if (observation.interactionKind) {
      const bundle = companionSyntheticInteractionBundleV7({
        provider: 'codex',
        taskKey: key,
        branchRef,
        kind: observation.interactionKind,
        sequence: observation.interactionSequence,
        turnEpoch: observation.turnStartedAt,
        requestSetRevision: observation.interactionSequence,
        authority: input.authority || 'provider-snapshot',
        exact: true,
        complete: false
      })
      syntheticInteractions.push(...bundle.interactions)
      syntheticRequestSetRevision = Math.max(syntheticRequestSetRevision, observation.interactionSequence)
    }
  }
  const nativeInteraction = match ? codexDesktopBridge?.companionInteractionEvidenceForParent?.(match.threadId) : null
  const interactions = Array.isArray(nativeInteraction?.interactions)
    ? nativeInteraction.interactions.map((value) => createCompanionInteractionEvidenceV7(value)).filter(Boolean)
    : syntheticInteractions
  const interactionSets = Array.isArray(nativeInteraction?.interactionSets)
    ? nativeInteraction.interactionSets.map((value) => createCompanionInteractionSetV7(value)).filter(Boolean)
    : syntheticRequestSetRevision
      ? [createCompanionInteractionSetV7({
          provider: 'codex',
          taskKey: key,
          requestSetRevision: syntheticRequestSetRevision,
          complete: privateEvidence?.complete === true
        })].filter(Boolean)
      : []
  return {
    nodes,
    interactions,
    interactionSets,
    relations,
    maxima: {
      activity: Math.max(0, ...nodes.map((node) => companionEvidenceSequenceV7(node.activity?.sequence))),
      interaction: companionEvidenceSequenceV7(
        nativeInteraction?.requestSetRevision,
        syntheticRequestSetRevision,
        ...interactions.map((value) => value.sequence)
      ),
      unread: Math.max(0, ...nodes.map((node) => companionEvidenceSequenceV7(node.unread?.sequence))),
      planArtifact: Math.max(0, ...nodes.map((node) => companionEvidenceSequenceV7(node.planArtifact?.sequence))),
      topology: Math.max(0, ...relations.map((relation) => companionEvidenceSequenceV7(relation.generation)))
    }
  }
}

function companionClaudeEvidenceV7(sessionValue, unread, input = {}) {
  const session = codexRecord(sessionValue)
  const sessionId = typeof session.sessionId === 'string' ? session.sessionId : ''
  if (!sessionId || session.isArchived === true) return { nodes: [], interactions: [], interactionSets: [], relations: [], maxima: {} }
  const key = `claude:${sessionId}`
  const family = key
  const persisted = input.persisted || companionPersistedTaskState()
  const unreadKnown = input.unreadKnown === true && typeof unread === 'boolean'
  const metadataOnly = input.metadataOnly === true
  const observation = metadataOnly
    ? companionUnknownObservationV7({
        unreadKnown,
        unread: unread === true,
        unreadSequence: input.unreadSequence
      })
    : claudeSessionObservationV7(session, unread === true)
  // Claude phase snapshots and inventory mutations may reuse the last exact
  // unread set, but they do not own its clock. Keep the boolean unknown until
  // that set exists and bind its per-node revision to the unread lane rather
  // than to an unrelated phase/metadata timestamp.
  observation.unreadKnown = unreadKnown
  observation.unread = unreadKnown && unread === true
  observation.unreadSequence = unreadKnown
    ? companionEvidenceSequenceV7(input.unreadSequence)
    : 0
  const revisionAt = metadataOnly
    ? companionEvidenceSequenceV7(
        session.lastActivityAt,
        session.lastFocusedAt,
        session.metadataUpdatedAt,
        input.acceptedAt,
        1
      )
    : companionEvidenceSequenceV7(
        session.stateGeneration,
        session.phaseUpdatedAt,
        session.turnStartedAt,
        session.lastStopAt,
        session.lastActivityAt,
        session.metadataUpdatedAt,
        input.acceptedAt,
        1
      )
  const localPin = persisted.pins.has(key)
  const manualPhaseEntry = persisted.manualPhases?.get(key)
  const originalTitle = typeof session.title === 'string' && session.title.trim()
    ? session.title.trim().slice(0, 240)
    : 'Claude 任务'
  const alias = persisted.aliases.get(key) || ''
  const terminal = ['turn-completed', 'turn-interrupted', 'turn-failed'].includes(observation.kind)
  const compatible = session.stateCompatibility === 'compatible' || session.compatibility === 'compatible'
  const capabilities = Array.isArray(input.capabilities)
    ? input.capabilities.filter((value) => typeof value === 'string')
    : ['open', ...(terminal && compatible ? ['archive'] : [])]
  const root = createCompanionEvidenceNodeV7({
    provider: 'claude',
    key,
    family,
    role: 'root',
    observation,
    causalKey: companionCausalKey('claude', key, observation.turnStartedAt || observation.sequence),
    observedAt: observation.sequence,
    metadata: companionProviderMetadataV7({
      kind: localPin ? 'local-pin' : 'claude-session',
      actionAlias: sessionId,
      revisionAt,
      membershipRevision: companionEvidenceSequenceV7(session.lastActivityAt, session.metadataUpdatedAt, input.acceptedAt, revisionAt),
      visibilityRevision: companionEvidenceSequenceV7(session.metadataUpdatedAt, input.acceptedAt, revisionAt),
      metadataRevision: companionEvidenceSequenceV7(session.metadataUpdatedAt, input.acceptedAt, revisionAt),
      lastQuestionAt: metadataOnly ? session.lastActivityAt : session.turnStartedAt,
      createdAt: session.createdAt,
      displayOrder: localPin ? persisted.pinOrder?.get(key) ?? input.order : input.order,
      cycleOrder: input.order,
      attentionOrder: input.order,
      hidden: Number(persisted.receipts.get(key)?.dismissedActivityRecency) >= revisionAt,
      idleConfirmed: terminal,
      localPin,
      manualPhase: manualPhaseEntry?.phase || '',
      manualPhaseSetAt: manualPhaseEntry?.setAt || 0,
      dynamicEligible: !input.dynamicCutoff || companionEvidenceSequenceV7(session.turnStartedAt, session.lastActivityAt) >= input.dynamicCutoff,
      displayName: alias || originalTitle,
      originalTitle,
      alias
    }),
    capabilities,
    standaloneEligible: true
  })
  const nodes = root ? [root] : []
  const relations = []
  let childOrder = Number(input.order) || 0
  for (const childValue of metadataOnly ? [] : Array.isArray(session.subagents) ? session.subagents : []) {
    const child = codexRecord(childValue)
    const agentId = typeof child.agentId === 'string' ? child.agentId : ''
    const childRevision = companionEvidenceSequenceV7(child.startedAt, child.stoppedAt)
    if (!agentId || !childRevision) continue
    const childKey = companionPrivateChildKey('claude', key, agentId)
    const childRunning = child.active === true
    const childObservation = companionUnknownObservationV7({ activitySequence: childRevision })
    childObservation.kind = childRunning ? 'turn-running' : 'turn-completed'
    childObservation.exact = true
    childObservation.candidates = [{
      kind: childObservation.kind,
      exact: true,
      sequence: childRevision,
      observedAt: childRevision,
      statusEnteredAt: childRevision,
      turnStartedAt: companionEvidenceSequenceV7(child.startedAt),
      terminalAt: childRunning ? 0 : companionEvidenceSequenceV7(child.stoppedAt, childRevision)
    }]
    childObservation.sequence = childRevision
    childObservation.statusEnteredAt = childRevision
    childObservation.turnStartedAt = companionEvidenceSequenceV7(child.startedAt)
    childObservation.terminalAt = childRunning ? 0 : companionEvidenceSequenceV7(child.stoppedAt, childRevision)
    const node = createCompanionEvidenceNodeV7({
      provider: 'claude',
      key: childKey,
      family,
      role: 'child',
      observation: childObservation,
      causalKey: companionCausalKey('claude', childKey, child.startedAt || childRevision),
      metadata: companionProviderMetadataV7({
        kind: 'topology-child',
        revisionAt: childRevision,
        membershipRevision: childRevision,
        visibilityRevision: childRevision,
        metadataRevision: childRevision,
        lastQuestionAt: child.startedAt,
        createdAt: child.startedAt,
        displayOrder: ++childOrder,
        cycleOrder: childOrder,
        attentionOrder: childOrder,
        idleConfirmed: !childRunning,
        dynamicEligible: true
      }),
      capabilities: [],
      standaloneEligible: false
    })
    if (node) nodes.push(node)
    relations.push({
      childKey,
      parentKey: key,
      provider: 'claude',
      family,
      relation: 'subagent',
      authority: 'claude-hook',
      exact: true,
      generation: companionEvidenceSequenceV7(input.topologyGeneration, childRevision)
    })
  }
  const interactionBundle = metadataOnly
    ? { interactions: [], interactionSets: [] }
    : companionSyntheticInteractionBundleV7({
        provider: 'claude',
        taskKey: key,
        branchRef: 'root',
        kind: observation.interactionKind,
        sequence: observation.interactionSequence || observation.sequence,
        turnEpoch: observation.turnStartedAt,
        requestSetRevision: observation.interactionSequence || observation.sequence,
        authority: input.authority || 'provider-snapshot',
        exact: observation.exact === true,
        complete: true
      })
  return {
    nodes,
    interactions: interactionBundle.interactions,
    interactionSets: interactionBundle.interactionSets,
    relations,
    maxima: {
      activity: observation.sequence,
      interaction: companionEvidenceSequenceV7(observation.interactionSequence, observation.sequence),
      unread: observation.unreadSequence,
      planArtifact: 0,
      topology: Math.max(0, ...relations.map((relation) => companionEvidenceSequenceV7(relation.generation)))
    }
  }
}

function companionCursorEvidenceV7(sessionValue, hookValue, input = {}) {
  const session = codexRecord(sessionValue)
  const hook = codexRecord(hookValue)
  const composerId = typeof session.composerId === 'string' ? session.composerId.toLowerCase() : ''
  if (!composerId) return { nodes: [], interactions: [], interactionSets: [], relations: [], maxima: {} }
  const key = `cursor:${composerId}`
  const family = key
  const persisted = input.persisted || companionPersistedTaskState()
  const observation = cursorSessionObservationV7(session, hook)
  const revisionAt = companionEvidenceSequenceV7(
    hook.lastEventAt,
    session.lastUpdatedAt,
    session.unfinishedRunAt,
    session.createdAt,
    input.acceptedAt,
    1
  )
  const localPin = persisted.pins.has(key)
  const originalTitle = typeof session.name === 'string' && session.name.trim()
    ? session.name.trim().slice(0, 240)
    : typeof session.subtitle === 'string' && session.subtitle.trim()
      ? session.subtitle.trim().slice(0, 240)
      : 'Cursor Agent'
  const alias = persisted.aliases.get(key) || ''
  const terminal = ['turn-completed', 'turn-interrupted', 'turn-failed'].includes(observation.kind)
  const root = createCompanionEvidenceNodeV7({
    provider: 'cursor',
    key,
    family,
    role: 'root',
    observation,
    causalKey: companionCausalKey('cursor', key, hook.generationId || observation.turnStartedAt || observation.sequence),
    observedAt: observation.sequence,
    metadata: companionProviderMetadataV7({
      kind: localPin ? 'local-pin' : 'cursor-session',
      actionAlias: composerId,
      revisionAt,
      membershipRevision: companionEvidenceSequenceV7(input.acceptedAt, revisionAt),
      visibilityRevision: revisionAt,
      metadataRevision: companionEvidenceSequenceV7(session.lastUpdatedAt, input.acceptedAt, revisionAt),
      lastQuestionAt: companionEvidenceSequenceV7(session.unfinishedRunAt, hook.turnStartedAt),
      createdAt: session.createdAt,
      displayOrder: localPin ? persisted.pinOrder?.get(key) ?? input.order : input.order,
      cycleOrder: input.order,
      attentionOrder: input.order,
      hidden: Number(persisted.receipts.get(key)?.dismissedActivityRecency) >= revisionAt,
      idleConfirmed: terminal,
      localPin,
      dynamicEligible: !input.dynamicCutoff || companionEvidenceSequenceV7(session.lastUpdatedAt, session.unfinishedRunAt) >= input.dynamicCutoff,
      displayName: alias || originalTitle,
      originalTitle,
      alias
    }),
    capabilities: ['open', ...(terminal ? ['archive'] : []), ...(observation.planState === 'available' ? ['execute-plan'] : [])],
    standaloneEligible: true
  })
  const nodes = root ? [root] : []
  const relations = []
  let childOrder = Number(input.order) || 0
  for (const childValue of Array.isArray(session.subagents) ? session.subagents : []) {
    const child = codexRecord(childValue)
    const childId = typeof child.composerId === 'string' ? child.composerId : ''
    if (!childId) continue
    const hotChild = (Array.isArray(hook.subagents) ? hook.subagents : [])
      .map(codexRecord)
      .find((candidate) => candidate.subagentId === childId
        && (!candidate.parentConversationId || String(candidate.parentConversationId).toLowerCase() === composerId))
    const childKey = companionPrivateChildKey('cursor', key, childId)
    const childRevision = companionEvidenceSequenceV7(
      hotChild?.lastEventAt,
      child.unfinishedRunAt,
      child.lastUpdatedAt,
      child.createdAt,
      revisionAt
    )
    const hotCurrent = Number(hotChild?.lastEventAt) > 0
      && Number(hotChild.lastEventAt) >= Number(child.unfinishedRunAt || 0)
    const childRunning = hotCurrent ? hotChild.active === true : Number(child.unfinishedRunAt) > 0
    const childObservation = companionUnknownObservationV7({ activitySequence: childRevision })
    childObservation.kind = childRunning ? 'turn-running' : 'turn-completed'
    childObservation.exact = true
    childObservation.candidates = [{
      kind: childObservation.kind,
      exact: true,
      sequence: childRevision,
      observedAt: childRevision,
      statusEnteredAt: childRevision,
      turnStartedAt: companionEvidenceSequenceV7(hotChild?.startedAt, child.unfinishedRunAt),
      terminalAt: childRunning ? 0 : companionEvidenceSequenceV7(hotChild?.stoppedAt, childRevision)
    }]
    childObservation.sequence = childRevision
    childObservation.statusEnteredAt = childRevision
    childObservation.turnStartedAt = companionEvidenceSequenceV7(hotChild?.startedAt, child.unfinishedRunAt)
    childObservation.terminalAt = childRunning ? 0 : companionEvidenceSequenceV7(hotChild?.stoppedAt, childRevision)
    const node = createCompanionEvidenceNodeV7({
      provider: 'cursor',
      key: childKey,
      family,
      role: 'child',
      observation: childObservation,
      causalKey: companionCausalKey('cursor', childKey, hotChild?.generationId || childObservation.turnStartedAt || childRevision),
      metadata: companionProviderMetadataV7({
        kind: 'topology-child',
        revisionAt: childRevision,
        membershipRevision: childRevision,
        visibilityRevision: childRevision,
        metadataRevision: childRevision,
        lastQuestionAt: child.unfinishedRunAt,
        createdAt: child.createdAt,
        displayOrder: ++childOrder,
        cycleOrder: childOrder,
        attentionOrder: childOrder,
        idleConfirmed: !childRunning,
        dynamicEligible: true
      }),
      capabilities: [],
      standaloneEligible: false
    })
    if (node) nodes.push(node)
    relations.push({
      childKey,
      parentKey: key,
      provider: 'cursor',
      family,
      relation: 'subagent',
      authority: 'cursor-inventory',
      exact: true,
      generation: companionEvidenceSequenceV7(input.topologyGeneration, childRevision)
    })
  }
  const interactionBundle = companionSyntheticInteractionBundleV7({
    provider: 'cursor',
    taskKey: key,
    sequence: observation.sequence,
    requestSetRevision: observation.sequence,
    authority: input.authority || 'provider-snapshot',
    exact: observation.exact === true,
    complete: true
  })
  return {
    nodes,
    interactions: interactionBundle.interactions,
    interactionSets: interactionBundle.interactionSets,
    relations,
    maxima: {
      activity: observation.sequence,
      interaction: observation.sequence,
      unread: observation.unreadSequence,
      planArtifact: observation.planSequence,
      topology: Math.max(0, ...relations.map((relation) => companionEvidenceSequenceV7(relation.generation)))
    }
  }
}

let companionPreflightDraftSequence = 0

async function preflightCompanionTaskPackageV7(input = {}) {
  const startedAt = Date.now()
  const configuration = companionTaskConfiguration()
  const requested = codexRecord(input.providers)
  const providers = {
    codex: requested.codex === true && configuration.providers.codex,
    claude: requested.claude === true && configuration.providers.claude,
    cursor: requested.cursor === true && configuration.providers.cursor
  }
  if (!configuration.enabled) throw new Error('companion-disabled')
  const reads = []
  if (providers.codex) {
    reads.push(Promise.resolve(readCompanionCodexPreflightSnapshotV7())
      .then((result) => result?.ok && Array.isArray(result.value?.threads) && result.value.completeness === 'verified'
        ? { provider: 'codex', status: 'ready', value: result.value }
        : { provider: 'codex', status: 'unavailable', errorCode: 'codex-task-preflight-failed' })
      .catch(() => ({ provider: 'codex', status: 'unavailable', errorCode: 'codex-task-preflight-failed' })))
  }
  if (providers.claude) {
    reads.push(Promise.all([
      Promise.resolve(claudeBridge?.readCodeSnapshot({ now: Date.now() })),
      Promise.resolve(claudeBridge?.readCodeUnread())
    ]).then(([value, unread]) => {
      if (!claudeBridge || !value || !Array.isArray(value.sessions) || value.truncated === true) {
        return { provider: 'claude', status: 'unavailable', errorCode: 'claude-task-preflight-failed' }
      }
      if (!unread || !Array.isArray(unread.ids)) {
        return { provider: 'claude', status: 'degraded', errorCode: 'claude-unread-preflight-failed', value, unread: null }
      }
      return { provider: 'claude', status: 'ready', value, unread }
    }).catch(() => ({ provider: 'claude', status: 'unavailable', errorCode: 'claude-task-preflight-failed' })))
  }
  if (providers.cursor) {
    reads.push(Promise.resolve().then(() => ({
      inventory: cursorBridge?.readInventory?.(),
      hooks: cursorBridge?.readHookState?.() || []
    })).then(({ inventory, hooks }) => inventory?.available === true
      && Array.isArray(inventory.sessions) && inventory.truncated !== true
      ? { provider: 'cursor', status: 'ready', value: inventory, hooks: Array.isArray(hooks) ? hooks : [] }
      : { provider: 'cursor', status: 'unavailable', errorCode: `cursor-${inventory?.reason || 'task-preflight-failed'}`.slice(0, 80) })
      .catch(() => ({ provider: 'cursor', status: 'unavailable', errorCode: 'cursor-task-preflight-failed' })))
  }
  if (!reads.length) throw new Error('no-enabled-provider')
  const rows = await Promise.all(reads)
  const persisted = companionPersistedTaskState()
  const dynamicCutoff = Date.now() - configuration.dynamicTaskWindowHours * 60 * 60 * 1_000
  const sourceLaneGenerations = Object.fromEntries(['codex', 'claude', 'cursor'].map((provider) => [
    provider,
    Object.fromEntries(companionEvidenceChannelsV7.map((lane) => [lane, 0]))
  ]))
  const providerHealth = Object.fromEntries(['codex', 'claude', 'cursor'].map((provider) => [provider, {
    status: providers[provider] ? 'unavailable' : 'disabled',
    generation: 0,
    errorCode: ''
  }]))
  const evidenceBatches = Object.fromEntries(['codex', 'claude', 'cursor'].map((provider) => [provider, null]))
  let taskCount = 0
  for (const result of rows) {
    const provider = result.provider
    const available = result.status !== 'unavailable' && result.value
    const readAt = companionEvidenceSequenceV7(result.value?.readAt, Date.now())
    providerHealth[provider] = {
      status: result.status,
      generation: available ? readAt : 0,
      errorCode: result.errorCode || ''
    }
    if (!available) continue
    const nodes = []
    const interactions = []
    const interactionSets = []
    const relations = []
    let order = 0
    let topologyComplete = false
    let completeLanes = [...companionEvidenceChannelsV7]
    if (provider === 'codex') {
      const providerGeneration = companionEvidenceSequenceV7(result.value.activityGeneration, codexActivityGeneration)
      Object.assign(sourceLaneGenerations.codex, {
        membership: readAt,
        activity: providerGeneration,
        interaction: providerGeneration,
        unread: providerGeneration,
        planArtifact: providerGeneration,
        metadata: readAt,
        topology: providerGeneration
      })
      topologyComplete = true
      const seen = new Set()
      for (const thread of result.value.threads) {
        const key = typeof thread?.key === 'string' ? thread.key : ''
        if (!key || seen.has(key)) continue
        seen.add(key)
        const evidence = companionCodexEvidenceV7(thread, {
          persisted,
          dynamicCutoff,
          order,
          sourceFingerprint: String(result.value.sourceFingerprint || '').slice(0, 80),
          topologyGeneration: providerGeneration,
          unreadSequence: providerGeneration,
          authority: 'provider-snapshot'
        })
        nodes.push(...evidence.nodes)
        interactions.push(...evidence.interactions)
        interactionSets.push(...evidence.interactionSets)
        relations.push(...evidence.relations)
        order += evidence.nodes.length
      }
    } else if (provider === 'claude') {
      const unreadIds = result.unread
        ? new Set(result.unread.ids.filter((value) => typeof value === 'string'))
        : companionClaudeUnreadSnapshot.available ? new Set(companionClaudeUnreadSnapshot.ids) : new Set()
      if (result.unread) {
        companionClaudeUnreadSnapshot = {
          ids: unreadIds,
          generation: Number(result.unread.generation) || 0,
          readAt: companionEvidenceSequenceV7(result.unread.readAt, readAt),
          available: true
        }
      }
      const activityGeneration = companionEvidenceSequenceV7(result.value.generation, result.value.stateGeneration)
      const unreadGeneration = result.unread
        ? companionEvidenceSequenceV7(result.unread.generation, result.unread.readAt)
        : 0
      const topologyGeneration = companionEvidenceSequenceV7(activityGeneration, result.value.readAt)
      Object.assign(sourceLaneGenerations.claude, {
        membership: readAt,
        activity: activityGeneration,
        interaction: activityGeneration,
        unread: unreadGeneration,
        planArtifact: activityGeneration,
        metadata: readAt,
        topology: topologyGeneration
      })
      topologyComplete = result.value.topologyComplete === true
      if (!result.unread) completeLanes = completeLanes.filter((lane) => lane !== 'unread')
      for (const session of result.value.sessions) {
        const evidence = companionClaudeEvidenceV7(session, unreadIds.has(session?.sessionId), {
          persisted,
          dynamicCutoff,
          order,
          acceptedAt: readAt,
          topologyGeneration,
          unreadKnown: Boolean(result.unread),
          unreadSequence: unreadGeneration,
          authority: 'provider-snapshot'
        })
        nodes.push(...evidence.nodes)
        interactions.push(...evidence.interactions)
        interactionSets.push(...evidence.interactionSets)
        relations.push(...evidence.relations)
        order += evidence.nodes.length
      }
    } else {
      const hooks = new Map((Array.isArray(result.hooks) ? result.hooks : [])
        .filter((value) => value && typeof value.sessionId === 'string')
        .map((value) => [String(value.sessionId).toLowerCase(), codexRecord(value)]))
      const generation = readAt
      Object.assign(sourceLaneGenerations.cursor, {
        membership: generation,
        activity: generation,
        interaction: generation,
        unread: generation,
        planArtifact: generation,
        metadata: generation,
        topology: generation
      })
      topologyComplete = result.value.topologyComplete === true
      for (const session of result.value.sessions) {
        const composerId = typeof session?.composerId === 'string' ? session.composerId.toLowerCase() : ''
        const evidence = companionCursorEvidenceV7(session, hooks.get(composerId), {
          persisted,
          dynamicCutoff,
          order,
          acceptedAt: readAt,
          topologyGeneration: generation,
          authority: 'provider-snapshot'
        })
        nodes.push(...evidence.nodes)
        interactions.push(...evidence.interactions)
        interactionSets.push(...evidence.interactionSets)
        relations.push(...evidence.relations)
        order += evidence.nodes.length
      }
    }
    taskCount += nodes.filter((node) => node.role === 'root').length
    const snapshotLanes = completeLanes.filter((lane) => lane !== 'topology')
    if (topologyComplete) snapshotLanes.push('topology')
    evidenceBatches[provider] = createCompanionEvidenceBatchV7({
      provider,
      nodes,
      interactions,
      interactionSets,
      relations,
      laneGenerations: sourceLaneGenerations[provider],
      snapshotLanes,
      completeLanes: topologyComplete ? completeLanes : completeLanes.filter((lane) => lane !== 'topology'),
      relationsComplete: topologyComplete,
      health: result.status
    })
  }
  for (const provider of ['codex', 'claude', 'cursor']) {
    if (evidenceBatches[provider]) continue
    evidenceBatches[provider] = createCompanionEvidenceBatchV7({
      provider,
      laneGenerations: sourceLaneGenerations[provider],
      health: providerHealth[provider].status
    })
  }
  const sourceGenerations = Object.fromEntries(['codex', 'claude', 'cursor'].map((provider) => [
    provider,
    companionCounterAggregate(sourceLaneGenerations[provider])
  ]))
  runtimeDiagnostics.record({
    level: 'info',
    scope: 'task-recovery',
    event: 'cold-preflight-v7',
    outcome: 'accepted',
    durationMs: Date.now() - startedAt,
    slowMs: 500,
    count: taskCount,
    details: { providers, sourceGenerations, sourceLaneGenerations, taskCount }
  })
  return {
    schema: companionV7Revisions.draft,
    producer: 'host-preflight',
    sourceTaskStateRevision: `${companionV7Revisions.taskState}:cold-preflight-v7`,
    draftRevision: ++companionPreflightDraftSequence,
    acceptedAt: Date.now(),
    enabled: true,
    providers,
    complete: true,
    focusedKey: '',
    sourceGenerations,
    sourceLaneGenerations,
    providerHealth,
    evidenceBatches
  }
}

const companionHostRegistry = createCompanionHostRegistry?.({
  codex: {
    inspect: inspectCodexEnvironment,
    open: openCompanionCodexTarget,
    executePlan: executeCompanionCodexPlan,
    // `codexArchiveBridge` is constructed further below, after the Kernel --
    // a genuine bidirectional dependency (the bridge's own
    // `commitVerifiedCodexArchive` calls back into
    // `companionTaskKernel.commitArchived`). This adapter is an arrow
    // evaluated per call, so it reads the binding only once a real archive
    // request fires, by which time construction has completed. V7 owns the
    // adapter here in the Host Registry rather than inline in the Kernel.
    archive: (target, request) => codexArchiveBridge ? codexArchiveBridge.archiveCodexThread(target.actionAlias, {
      ...(target.archiveRequest || {}),
      operationId: request?.operationId,
      source: request?.source,
      requestedRevisionAt: request?.revisionAt,
      intentRecorded: request?.intentRecorded === true,
      confirmationRecorded: request?.confirmationRecorded === true
    }) : Promise.resolve({ outcome: 'failed', errorCode: 'archive-unavailable', message: '归档服务不可用，任务已保留' }),
    close: () => undefined
  },
  claude: {
    inspect: () => claudeBridge ? claudeBridge.inspect() : claudeUnavailable('environment'),
    open: openCompanionClaudeTarget,
    archive: (target) => claudeBridge
      ? claudeBridge.archiveCodeSession(target.actionAlias)
      : Promise.resolve(claudeUnavailable('archive')),
    close: () => undefined
  },
  cursor: {
    inspect: () => cursorBridge ? cursorBridge.inspect() : cursorUnavailable('environment'),
    open: openCompanionCursorTarget,
    archive: (target) => cursorBridge
      ? cursorBridge.archiveTask(String(target.actionAlias
        || (typeof target.key === 'string' && target.key.startsWith('cursor:') ? target.key.slice('cursor:'.length) : '')))
      : Promise.resolve(cursorUnavailable('archive')),
    close: () => undefined
  }
})

const companionInitialPlanPauseReceipts = readCompanionPlanPauseReceipts()

companionTaskKernel = typeof createCompanionTaskKernel === 'function' && companionHostRegistry && companionPersistedSideState.planPauseStorageReady()
  ? createCompanionTaskKernel({
      initialConfiguration: companionTaskConfiguration(),
      initialPauseReceipts: companionInitialPlanPauseReceipts,
      initialInteractionTombstones: readCompanionInteractionTombstones(),
      persistPlanPause: persistCompanionPlanPause,
      persistInteractionTombstones: persistCompanionInteractionTombstones,
      migrateHiddenPlan: migrateHiddenCompanionPlan,
      applyPreference: persistCompanionPreference,
      preflight: preflightCompanionTaskPackageV7,
      hostRegistry: companionHostRegistry,
      notify: (message) => {
        try { globalThis.utools?.showNotification?.(String(message || '')) } catch {}
      },
      record: (event) => recordCompanionDiagnosticEvent(event)
    })
  : null

if (!companionPersistedSideState.planPauseStorageReady()) {
  runtimeDiagnostics.record({
    level: 'error',
    scope: 'companion-storage',
    event: 'v7-plan-pause-migration',
    outcome: 'blocked',
    details: { namespace: 'v7', legacyPreserved: true }
  })
}

// route-3 (RAW-169) closure rewrite. Constructed here, right after
// `companionTaskKernel`, because of a genuine bidirectional dependency: the
// kernel's own `adapters.codex.archive` (above) calls into this bridge, and
// this bridge's `commitVerifiedCodexArchive` calls back into
// `companionTaskKernel.commitArchived`. `codexArchivedActivityKey`,
// `codexThreadActions`/`codexProjectActions`/`codexActivityInventory`/
// `codexLocalArchiveRecoverySuppressions` stay in the entry and are injected
// by reference -- they are genuinely shared with Desktop Bridge, the App
// Server message router, inventory reconciliation and session-lifecycle
// code, not archive-private. A failed load degrades every method to the
// shape documented at the `window.eypcPlatform.codex.archiveThread`/
// `archiveProject` wiring and the two `observeNativeAck` call sites below.
let codexArchiveBridge = null
try {
  let archiveBridgeModule = null
  try {
    archiveBridgeModule = require('./codex/archive-bridge.cjs')
  } catch {}
  if (!archiveBridgeModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        archiveBridgeModule = require(path.join(base, 'codex', 'archive-bridge.cjs'))
        break
      } catch {}
    }
  }
  if (typeof archiveBridgeModule?.createCodexArchiveBridge === 'function') {
    codexArchiveBridge = archiveBridgeModule.createCodexArchiveBridge({
      utools: globalThis.utools,
      record: codexRecord,
      timestampMs: codexTimestampMs,
      error: codexError,
      threadKey: codexThreadKey,
      validThreadId: validCodexThreadId,
      crypto,
      runtimeDiagnostics,
      requestCodexRpc,
      readCodexNativeRegistry,
      codexDesktopIsRunning,
      sanitizeCodexTurnStatusPage,
      codexIsConfirmedTurnEvidence,
      codexThreadNativeProject,
      codexNormalizeNativeRoot,
      codexThreadAlias,
      listAllCodexThreads,
      codexEnsureDesktopBridge,
      desktopBridgeClientId: () => codexDesktopBridge?.clientId,
      companionDiagnosticTaskRef,
      emitCodexActivityDelta,
      threadTurnStatusTimeoutMs: CODEX_THREAD_TURN_STATUS_TIMEOUT_MS,
      threadActions: codexThreadActions,
      projectActions: codexProjectActions,
      activityInventory: () => codexActivityInventory,
      localArchiveRecoverySuppressions: codexLocalArchiveRecoverySuppressions,
      activityKeyForArchivedThread: codexArchivedActivityKey,
      companionTaskKernel
    })
  }
} catch { codexArchiveBridge = null }


// route-3 (RAW-169) closure rewrite: the entire Float subsystem lives behind
// this one factory now, constructed here (not in the early module-handle
// region) because it needs the already-built `companionTaskKernel` instance
// -- the same "already-built instance as dependency" composition
// `preload/claude/index.cjs` uses for `archive`. A failed load degrades
// every public method to the shape documented at the `window.eypcPlatform.float`
// wiring below; the plugin-lifecycle handlers null-check `codexFloatBridge`
// directly.
let codexFloatBridge = null
try {
  let floatBridgeModule = null
  try {
    floatBridgeModule = require('./codex/float-bridge.cjs')
  } catch {}
  if (!floatBridgeModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        floatBridgeModule = require(path.join(base, 'codex', 'float-bridge.cjs'))
        break
      } catch {}
    }
  }
  if (typeof floatBridgeModule?.createCodexFloatBridge === 'function') {
    codexFloatBridge = floatBridgeModule.createCodexFloatBridge({
      utools: globalThis.utools,
      record: codexRecord,
      runtimeDiagnostics,
      process,
      electronIpcRenderer,
      createCodexThread,
      openCodexBlank,
      copyText,
      openCodexThread,
      companionTaskKernel,
      displayForPoint: floatDisplayForPoint,
      displayForPosition: floatDisplayForPosition,
      validResizeCorner: validCodexResizeCorner
    })
  }
} catch { codexFloatBridge = null }

let companionHostDraftSequence = 0
let companionHostReconcileInFlight = null
const companionHostReconcilePendingProviders = new Set()
let companionClaudeStateDispose = null
let companionClaudeInventoryDispose = null
let companionClaudeUnreadDispose = null
let companionCursorEventDispose = null
let companionCursorInventoryDispose = null
let companionClaudeUnreadSnapshot = { ids: new Set(), generation: 0, readAt: 0, available: false }

/**
 * Single rule for lane units. Activity, interaction, unread and Plan artifact are monotonic provider
 * counters; `membership` is an observation timestamp that is only ever compared
 * against itself. Mixing them is not a rounding error but a permanent failure:
 * a counter can never overtake a wall-clock value, so any lane that inherits a
 * timestamp rejects every later real generation as stale. The aggregate
 * therefore spans counters only, and no lane may seed another across units.
 */
function companionCounterAggregate(lanes) {
  return Math.max(
    Number(lanes?.activity) || Number(lanes?.phase) || 0,
    Number(lanes?.interaction) || 0,
    Number(lanes?.unread) || 0,
    Number(lanes?.planArtifact) || 0
  )
}

function companionActivityEvidenceKind(task) {
  const source = codexRecord(task)
  if (source.phase === 'running') return 'turn-running'
  // Waiting is an interaction lane, never an activity phase. Provider adapters
  // that already know the underlying activity may pass it explicitly; otherwise
  // a blocked Turn is treated as settled until a newer Turn-start proves running.
  if (source.phase === 'waiting-input' || source.phase === 'waiting-approval') {
    return source.activityPhase === 'running' ? 'turn-running' : 'turn-completed'
  }
  if (source.phase === 'completed') return 'turn-completed'
  if (source.phase === 'stopped') return 'turn-interrupted'
  return 'unknown'
}

/** Converts one provider-specific observation into the only Host -> Kernel
 * evidence shape. It deliberately does not emit canonical phase/groups/views. */
function companionTaskEvidenceNodeV3(task) {
  const source = codexRecord(task)
  const capabilities = codexRecord(source.capabilities)
  const planLifecycleState = source.planLifecycleState === 'cleared'
    ? 'cleared'
    : source.planReady === true || source.planImplementation === true ? 'ready' : 'unknown'
  const planClearReason = ['cancel', 'execution-start', 'archive', 'removal'].includes(source.planClearReason)
    ? source.planClearReason
    : ''
  const planArtifactState = ['unknown', 'available', 'executing', 'consumed', 'cancelled', 'removed'].includes(source.planArtifactState)
    ? source.planArtifactState
    : planLifecycleState === 'ready'
      ? 'available'
      : planClearReason === 'execution-start'
        ? 'executing'
        : planClearReason === 'cancel'
          ? 'cancelled'
          : planClearReason === 'archive' || planClearReason === 'removal'
            ? 'removed'
            : planLifecycleState === 'cleared' ? 'consumed' : 'unknown'
  const activitySequence = Math.max(
    Number(source.phaseRevision) || 0,
    Number(source.statusEnteredAt) || 0,
    Number(source.turnStartedAt) || 0,
    Number(source.terminalAt) || 0,
    Number(source.revisionAt) || 0
  )
  return {
    key: source.key,
    provider: source.provider,
    family: source.family || `${source.provider}:${source.key}`,
    role: source.role === 'child' ? 'child' : 'root',
    membership: 'present',
    activity: {
      kind: companionActivityEvidenceKind(source),
      causalKey: typeof source.causalKey === 'string' ? source.causalKey : '',
      sequence: activitySequence,
      exact: source.causalReliable === true || source.freshness === 'fresh',
      observedAt: Number(source.observedAt) || 0,
      statusEnteredAt: Number(source.statusEnteredAt) || 0,
      turnStartedAt: Number(source.turnStartedAt) || 0,
      terminalAt: Number(source.terminalAt) || 0
    },
    unread: {
      known: source.unreadKnown === true,
      value: source.unread === true,
      sequence: Number(source.unreadRevision) || 0
    },
    planArtifact: {
      revision: companionV7Revisions.planArtifact,
      state: planArtifactState,
      sequence: Number(source.planLifecycleRevision) || 0,
      actionable: planArtifactState === 'available' && source.planArtifactActionable !== false,
      reason: planClearReason
    },
    metadata: {
      partial: !Object.prototype.hasOwnProperty.call(source, 'actionAlias'),
      kind: source.kind,
      actionAlias: source.actionAlias,
      revisionAt: Number(source.revisionAt) || activitySequence || 1,
      membershipRevision: Number(source.membershipRevision) || Number(source.revisionAt) || 1,
      visibilityRevision: Number(source.visibilityRevision) || Number(source.revisionAt) || 1,
      metadataRevision: Number(source.metadataRevision) || Number(source.revisionAt) || 1,
      capabilityToken: source.capabilityToken,
      lastQuestionAt: Number(source.lastQuestionAt) || 0,
      createdAt: Number(source.createdAt) || 0,
      displayOrder: Number(source.displayOrder) || 0,
      cycleOrder: Number(source.cycleOrder) || 0,
      attentionOrder: Number(source.attentionOrder) || 0,
      hidden: source.hidden === true,
      paused: source.paused === true,
      turnMode: source.turnMode,
      idleConfirmed: source.idleConfirmed === true,
      localPin: source.localPin === true,
      dynamicEligible: source.dynamicEligible === true,
      displayName: source.displayName,
      originalTitle: source.originalTitle,
      alias: source.alias,
      projectKey: source.projectKey,
      projectName: source.projectName,
      projectKind: source.projectKind,
      archiveRequest: source.archiveRequest
    },
    capabilities: Object.entries(capabilities)
      .filter(([, enabled]) => enabled === true)
      .map(([name]) => name === 'executePlan' ? 'execute-plan' : name),
    standaloneEligible: source.standaloneEligible !== false,
    error: source.error === true
  }
}

function companionInteractionEvidenceV1(task, authority = 'provider-live') {
  const source = codexRecord(task)
  if (source.phase !== 'waiting-input' && source.phase !== 'waiting-approval') return []
  const kind = source.phase === 'waiting-approval'
    ? 'approval'
    : source.planImplementation === true ? 'plan-implementation' : 'user-input'
  const sequence = Math.max(
    Number(source.phaseRevision) || 0,
    Number(source.statusEnteredAt) || 0,
    Number(source.turnStartedAt) || 0,
    Number(source.revisionAt) || 0
  )
  if (!sequence || typeof source.key !== 'string' || typeof source.provider !== 'string') return []
  const interactionRef = crypto.createHash('sha256')
    .update('companion-interaction-v1')
    .update('\0')
    .update(source.provider)
    .update('\0')
    .update(source.key)
    .update('\0')
    .update(kind)
    .update('\0')
    .update(typeof source.causalKey === 'string' ? source.causalKey : '')
    .update('\0')
    .update(String(sequence))
    .digest('hex')
    .slice(0, 32)
  return [{
    revision: companionV7Revisions.interaction,
    provider: source.provider,
    taskKey: source.key,
    branchRef: source.role === 'child' ? 'child' : 'root',
    interactionRef,
    kind,
    state: 'opened',
    sequence,
    turnEpoch: Number(source.turnStartedAt) || 0,
    requestSetRevision: sequence,
    authority,
    exact: source.causalReliable === true || source.freshness === 'fresh'
  }]
}

function publishCompanionEvidenceBatchesV3(input = {}) {
  const current = companionTaskKernel?.getPackage?.()
  if (!current?.complete || !companionTaskKernel?.publishEvidence) return false
  const providers = ['codex', 'claude', 'cursor']
  const requestedBatches = codexRecord(input.evidenceBatches)
  const requestedLanes = codexRecord(input.sourceLaneGenerations)
  const sourceLaneGenerations = Object.fromEntries(providers.map((provider) => {
    const currentProvider = codexRecord(current.sourceLaneGenerations?.[provider])
    const requestedProvider = codexRecord(requestedLanes[provider])
    const explicitBatch = codexRecord(requestedBatches[provider])
    return [provider, Object.fromEntries(companionEvidenceChannelsV7.map((lane) => {
      const explicitChannel = codexRecord(explicitBatch.channels?.[lane])
      const hasRequested = Object.prototype.hasOwnProperty.call(requestedProvider, lane)
      const hasBatchGeneration = Number.isSafeInteger(explicitChannel.generation)
      return [lane, hasRequested
        ? companionEvidenceSequenceV7(requestedProvider[lane])
        : hasBatchGeneration
          ? Math.max(0, explicitChannel.generation)
          : companionEvidenceSequenceV7(currentProvider[lane])]
    }))]
  }))
  const providerHealth = {
    ...current.providerHealth,
    ...(input.providerHealth && typeof input.providerHealth === 'object' ? input.providerHealth : {})
  }
  const evidenceBatches = Object.fromEntries(providers.map((provider) => {
    const explicit = requestedBatches[provider]
    if (explicit?.revision === companionV7Revisions.providerEvidenceBatch && explicit.provider === provider) {
      return [provider, explicit]
    }
    return [provider, createCompanionEvidenceBatchV7({
      provider,
      laneGenerations: sourceLaneGenerations[provider],
      health: providerHealth[provider]?.status
    })]
  }))
  const result = companionTaskKernel.publishEvidence({
    schema: companionV7Revisions.draft,
    producer: 'host-evidence',
    sourceTaskStateRevision: `${companionV7Revisions.taskState}:provider-evidence-v7`,
    draftRevision: ++companionHostDraftSequence,
    acceptedAt: companionEvidenceSequenceV7(input.acceptedAt, Date.now()),
    enabled: current.enabled,
    providers: current.providers,
    complete: true,
    focusedKey: current.focusedKey,
    sourceGenerations: Object.fromEntries(providers.map((provider) => [
      provider,
      Math.max(
        companionEvidenceSequenceV7(current.sourceGenerations?.[provider]),
        companionCounterAggregate(sourceLaneGenerations[provider])
      )
    ])),
    sourceLaneGenerations,
    providerHealth,
    evidenceBatches
  })
  return Boolean(result)
}

function applyCodexActivityToCompanionKernel(delta) {
  const startedAt = Date.now()
  const source = codexRecord(delta)
  const current = companionTaskKernel?.getPackage?.()
  const generation = companionEvidenceSequenceV7(source.generation)
  const entries = Array.isArray(source.entries) ? source.entries.map(codexRecord) : []
  const archivedKeys = [...new Set((Array.isArray(source.archivedKeys) ? source.archivedKeys : [])
    .filter((key) => typeof key === 'string' && key))]
  if (!current?.complete || current.providers?.codex !== true || !generation) {
    recordCompanionProbeGate('codex-activity-v7-gate', 'prerequisite-missing', {
      packageComplete: current?.complete === true,
      providerEnabled: current?.providers?.codex === true,
      generation
    })
    return false
  }
  if (source.inventoryChanged === true) queueCompanionHostReconciliation('codex')
  const persisted = companionPersistedTaskState()
  const dynamicCutoff = Date.now() - companionTaskConfiguration().dynamicTaskWindowHours * 60 * 60 * 1_000
  const nodesByKey = new Map()
  const relationsByKey = new Map()
  let order = 0
  for (const entry of entries) {
    const evidence = companionCodexEvidenceV7(entry, {
      persisted,
      dynamicCutoff,
      order,
      sourceFingerprint: String(source.sourceFingerprint || codexActivitySourceFingerprint || '').slice(0, 80),
      topologyGeneration: generation,
      unreadSequence: generation,
      authority: 'provider-live'
    })
    for (const node of evidence.nodes) nodesByKey.set(node.key, node)
    for (const relation of evidence.relations) {
      relationsByKey.set(`${relation.provider}\0${relation.childKey}\0${relation.authority}\0${relation.relation}`, relation)
    }
    order += evidence.nodes.length
  }
  const explicitInteractions = (Array.isArray(source.interactions) ? source.interactions : [])
    .map((value) => createCompanionInteractionEvidenceV7(value))
    .filter(Boolean)
  const explicitInteractionSets = (Array.isArray(source.interactionSets) ? source.interactionSets : [])
    .map((value) => createCompanionInteractionSetV7(value))
    .filter(Boolean)
  const currentLanes = codexRecord(current.sourceLaneGenerations?.codex)
  const hasActivity = entries.some((entry) => entry.readStateOnly !== true)
  const hasUnread = entries.some((entry) => typeof entry.hasUnreadTurn === 'boolean' && entry.unreadAuthority !== 'unavailable')
  const hasInteraction = explicitInteractions.length > 0 || explicitInteractionSets.length > 0
  const hasPlanArtifact = entries.some((entry) => entry.readStateOnly !== true
    && (entry.planReady === true
      || entry.planImplementationOnly === true
      || entry.planLifecycleState === 'cleared'
      || Number(entry.planLifecycleRevision) > 0))
  const hasTopology = hasActivity && nodesByKey.size > 0
  const membershipGeneration = archivedKeys.length
    ? Math.max(companionEvidenceSequenceV7(currentLanes.membership) + 1, companionEvidenceSequenceV7(source.receivedAt, Date.now()))
    : companionEvidenceSequenceV7(currentLanes.membership)
  const laneGenerations = {
    membership: membershipGeneration,
    activity: hasActivity ? generation : companionEvidenceSequenceV7(currentLanes.activity),
    interaction: hasInteraction ? generation : companionEvidenceSequenceV7(currentLanes.interaction),
    unread: hasUnread ? generation : companionEvidenceSequenceV7(currentLanes.unread),
    planArtifact: hasPlanArtifact ? generation : companionEvidenceSequenceV7(currentLanes.planArtifact),
    metadata: companionEvidenceSequenceV7(currentLanes.metadata),
    topology: hasTopology ? generation : companionEvidenceSequenceV7(currentLanes.topology)
  }
  const batch = createCompanionEvidenceBatchV7({
    provider: 'codex',
    nodes: [...nodesByKey.values()],
    interactions: explicitInteractions,
    interactionSets: explicitInteractionSets,
    relations: [...relationsByKey.values()],
    laneGenerations,
    removedKeys: { membership: archivedKeys },
    health: current.providerHealth?.codex?.status
  })
  if (!batch || (!entries.length && !archivedKeys.length && !hasInteraction)) {
    recordCompanionProbeGate('codex-activity-v7-gate', 'empty-delta', {
      generation,
      inventoryChanged: source.inventoryChanged === true
    })
    return source.inventoryChanged === true
  }
  const beforeRevision = current.packageRevision
  const published = publishCompanionEvidenceBatchesV3({
    acceptedAt: source.receivedAt,
    sourceLaneGenerations: { codex: laneGenerations },
    evidenceBatches: { codex: batch }
  })
  const canonical = companionTaskKernel?.getPackage?.()
  const changed = Boolean(published && canonical?.packageRevision !== beforeRevision)
  runtimeDiagnostics.record({
    level: changed ? 'info' : 'debug',
    scope: 'task-push',
    event: 'codex-evidence-v7',
    outcome: published ? changed ? 'accepted' : 'semantic-noop' : 'rejected',
    durationMs: Date.now() - startedAt,
    slowMs: 50,
    count: nodesByKey.size,
    cache: 'provider-direct',
    details: {
      generation,
      entryCount: entries.length,
      interactionCount: explicitInteractions.length,
      archivedCount: archivedKeys.length,
      packageRevision: canonical?.packageRevision || beforeRevision
    }
  })
  return changed || source.inventoryChanged === true
}

function applyClaudeStateToCompanionKernel() {
  const startedAt = Date.now()
  const current = companionTaskKernel?.getPackage?.()
  if (!current?.complete || current.providers?.claude !== true || !claudeBridge?.readCodeStateSnapshot) {
    recordCompanionProbeGate('claude-state-v7-gate', 'prerequisite-missing', {
      packageComplete: current?.complete === true,
      providerEnabled: current?.providers?.claude === true,
      readerAvailable: Boolean(claudeBridge?.readCodeStateSnapshot)
    })
    return false
  }
  let snapshot
  try { snapshot = claudeBridge.readCodeStateSnapshot({ now: Date.now() }) } catch {
    runtimeDiagnostics.record({
      level: 'error',
      scope: 'task-push',
      event: 'claude-evidence-v7',
      outcome: 'failed',
      code: 'provider-read-failed',
      durationMs: Date.now() - startedAt,
      slowMs: 50,
      cache: 'provider-direct'
    })
    return false
  }
  const source = codexRecord(snapshot)
  const generation = companionEvidenceSequenceV7(source.generation, source.stateGeneration)
  const currentLanes = codexRecord(current.sourceLaneGenerations?.claude)
  if (!generation || generation <= companionEvidenceSequenceV7(currentLanes.activity) || !Array.isArray(source.sessions)) {
    recordCompanionProbeGate('claude-state-v7-gate', 'stale-or-invalid', {
      generation,
      currentGeneration: companionEvidenceSequenceV7(currentLanes.activity),
      sessionsAvailable: Array.isArray(source.sessions)
    })
    return false
  }
  const persisted = companionPersistedTaskState()
  const dynamicCutoff = Date.now() - companionTaskConfiguration().dynamicTaskWindowHours * 60 * 60 * 1_000
  const nodes = []
  const interactions = []
  const interactionSets = []
  const relations = []
  const topologyGeneration = Math.max(
    companionEvidenceSequenceV7(currentLanes.topology) + 1,
    generation
  )
  let order = 0
  const hostSuppressedKeys = []
  for (const session of source.sessions) {
    const sessionId = typeof session?.sessionId === 'string' ? session.sessionId : ''
    // A session running as a CodexHost harness child is the same conversation
    // as its Host thread. While the Host roster carries that thread, the Host
    // status is the sole authority: retire the native row instead of letting
    // two lanes publish contradictory phases. Roster gone → native row returns.
    if (codexhostDiscovery?.isExternalThreadId?.(session?.codexhostThreadId) === true) {
      hostSuppressedKeys.push(`claude:${sessionId}`)
      continue
    }
    const unreadKnown = companionClaudeUnreadSnapshot.available === true
    const unread = unreadKnown && companionClaudeUnreadSnapshot.ids.has(sessionId)
    const evidence = companionClaudeEvidenceV7(session, unread, {
      persisted,
      dynamicCutoff,
      order,
      acceptedAt: source.readAt,
      topologyGeneration,
      unreadKnown,
      unreadSequence: companionEvidenceSequenceV7(
        companionClaudeUnreadSnapshot.generation,
        companionClaudeUnreadSnapshot.readAt
      ),
      authority: 'provider-live'
    })
    nodes.push(...evidence.nodes)
    interactions.push(...evidence.interactions)
    interactionSets.push(...evidence.interactionSets)
    relations.push(...evidence.relations)
    order += evidence.nodes.length
  }
  // A retirement only lands on an advancing membership lane; bump it exactly
  // when a Host-suppressed session still has a live native task to retire.
  const hostRemovalKeys = hostSuppressedKeys.filter((key) =>
    (Array.isArray(current.tasks) ? current.tasks : []).some((task) => task?.key === key && task?.provider === 'claude'))
  const laneGenerations = {
    membership: hostRemovalKeys.length
      ? Math.max(companionEvidenceSequenceV7(currentLanes.membership) + 1, generation)
      : companionEvidenceSequenceV7(currentLanes.membership),
    activity: generation,
    interaction: generation,
    unread: companionEvidenceSequenceV7(currentLanes.unread),
    planArtifact: companionEvidenceSequenceV7(currentLanes.planArtifact),
    metadata: companionEvidenceSequenceV7(currentLanes.metadata),
    topology: topologyGeneration
  }
  const batch = createCompanionEvidenceBatchV7({
    provider: 'claude',
    nodes,
    interactions,
    interactionSets,
    relations,
    laneGenerations,
    ...(hostRemovalKeys.length ? { removedKeys: { membership: hostRemovalKeys } } : {}),
    health: current.providerHealth?.claude?.status
  })
  const beforeRevision = current.packageRevision
  const published = publishCompanionEvidenceBatchesV3({
    acceptedAt: source.readAt,
    sourceLaneGenerations: { claude: laneGenerations },
    evidenceBatches: { claude: batch }
  })
  const canonical = companionTaskKernel?.getPackage?.()
  const changed = Boolean(published && canonical?.packageRevision !== beforeRevision)
  runtimeDiagnostics.record({
    level: changed ? 'info' : 'debug',
    scope: 'task-push',
    event: 'claude-evidence-v7',
    outcome: published ? changed ? 'accepted' : 'semantic-noop' : 'rejected',
    durationMs: Date.now() - startedAt,
    slowMs: 50,
    count: nodes.length,
    cache: 'provider-direct',
    details: {
      generation,
      topologyGeneration,
      sessionCount: source.sessions.length,
      packageRevision: canonical?.packageRevision || beforeRevision
    }
  })
  return changed
}

async function applyClaudeUnreadToCompanionKernel() {
  const startedAt = Date.now()
  const current = companionTaskKernel?.getPackage?.()
  if (!current?.complete || current.providers?.claude !== true || !claudeBridge?.readCodeUnread) {
    recordCompanionProbeGate('claude-unread-v7-gate', 'prerequisite-missing', {
      packageComplete: current?.complete === true,
      providerEnabled: current?.providers?.claude === true,
      readerAvailable: Boolean(claudeBridge?.readCodeUnread)
    })
    return false
  }
  let snapshot
  try { snapshot = await Promise.resolve(claudeBridge.readCodeUnread()) } catch {
    runtimeDiagnostics.record({
      level: 'error',
      scope: 'task-push',
      event: 'claude-unread-v7',
      outcome: 'failed',
      code: 'provider-read-failed',
      durationMs: Date.now() - startedAt,
      slowMs: 50,
      cache: 'provider-direct'
    })
    return false
  }
  const source = codexRecord(snapshot)
  if (!Array.isArray(source.ids)) return false
  const generation = companionEvidenceSequenceV7(source.generation, source.readAt)
  const currentLanes = codexRecord(current.sourceLaneGenerations?.claude)
  if (!generation || generation <= companionEvidenceSequenceV7(currentLanes.unread)) return false
  const previousIds = companionClaudeUnreadSnapshot.available
    ? new Set(companionClaudeUnreadSnapshot.ids)
    : new Set()
  const ids = new Set(source.ids.filter((value) => typeof value === 'string'))
  // The unread file is a complete set. Canonical membership supplies only the
  // identities that must receive an explicit false; no phase or UI state is
  // read back into Provider evidence.
  const canonicalSessionIds = (Array.isArray(current.tasks) ? current.tasks : [])
    .filter((task) => task?.provider === 'claude' && task?.role !== 'child' && typeof task.key === 'string' && task.key.startsWith('claude:'))
    .map((task) => task.key.slice('claude:'.length))
  const affected = new Set([...previousIds, ...ids, ...canonicalSessionIds])
  companionClaudeUnreadSnapshot = {
    ids,
    generation: Number(source.generation) || 0,
    readAt: companionEvidenceSequenceV7(source.readAt, Date.now()),
    available: true
  }
  const nodes = [...affected].map((sessionId) => createCompanionEvidenceNodeV7({
    provider: 'claude',
    key: `claude:${sessionId}`,
    family: `claude:${sessionId}`,
    role: 'root',
    observation: companionUnknownObservationV7({
      unreadKnown: true,
      unread: ids.has(sessionId),
      unreadSequence: generation
    }),
    metadata: companionProviderMetadataV7({
      kind: 'claude-session',
      actionAlias: sessionId,
      revisionAt: 1,
      membershipRevision: 1,
      visibilityRevision: 1,
      metadataRevision: 1
    }),
    metadataPartial: true,
    capabilities: [],
    standaloneEligible: true
  })).filter(Boolean)
  const laneGenerations = {
    membership: companionEvidenceSequenceV7(currentLanes.membership),
    activity: companionEvidenceSequenceV7(currentLanes.activity),
    interaction: companionEvidenceSequenceV7(currentLanes.interaction),
    unread: generation,
    planArtifact: companionEvidenceSequenceV7(currentLanes.planArtifact),
    metadata: companionEvidenceSequenceV7(currentLanes.metadata),
    topology: companionEvidenceSequenceV7(currentLanes.topology)
  }
  const batch = createCompanionEvidenceBatchV7({
    provider: 'claude',
    nodes,
    laneGenerations,
    health: current.providerHealth?.claude?.status
  })
  const beforeRevision = current.packageRevision
  const published = publishCompanionEvidenceBatchesV3({
    acceptedAt: source.readAt,
    sourceLaneGenerations: { claude: laneGenerations },
    evidenceBatches: { claude: batch }
  })
  const canonical = companionTaskKernel?.getPackage?.()
  const changed = Boolean(published && canonical?.packageRevision !== beforeRevision)
  runtimeDiagnostics.record({
    level: changed ? 'info' : 'debug',
    scope: 'task-push',
    event: 'claude-unread-v7',
    outcome: published ? changed ? 'accepted' : 'semantic-noop' : 'rejected',
    durationMs: Date.now() - startedAt,
    slowMs: 50,
    count: ids.size,
    cache: 'provider-direct',
    details: { generation, affectedCount: affected.size, packageRevision: canonical?.packageRevision || beforeRevision }
  })
  return changed
}

function applyClaudeInventoryDeltaToCompanionKernel(delta) {
  const startedAt = Date.now()
  const source = codexRecord(delta)
  const current = companionTaskKernel?.getPackage?.()
  if (!current?.complete || current.providers?.claude !== true || !Array.isArray(source.mutations)) {
    queueCompanionHostReconciliation('claude')
    return false
  }
  const currentLanes = codexRecord(current.sourceLaneGenerations?.claude)
  const membershipGeneration = Math.max(
    companionEvidenceSequenceV7(currentLanes.membership) + 1,
    companionEvidenceSequenceV7(source.acceptedAt, Date.now())
  )
  const topologyGeneration = companionEvidenceSequenceV7(currentLanes.topology)
  const persisted = companionPersistedTaskState()
  const dynamicCutoff = Date.now() - companionTaskConfiguration().dynamicTaskWindowHours * 60 * 60 * 1_000
  const nodes = []
  const interactions = []
  const interactionSets = []
  const relations = []
  const removedKeys = []
  let exact = true
  let order = 0
  for (const value of source.mutations) {
    const mutation = codexRecord(value)
    const key = typeof mutation.key === 'string' ? mutation.key : ''
    if (!key.startsWith('claude:')) { exact = false; continue }
    if (mutation.mutation === 'remove' || mutation.mutation === 'archived') {
      removedKeys.push(key)
      continue
    }
    if (mutation.mutation !== 'upsert' || !mutation.session) { exact = false; continue }
    // Host-suppressed conversation: the CodexHost lane owns this row while the
    // Host roster carries its thread; a metadata upsert must not resurrect it.
    if (codexhostDiscovery?.isExternalThreadId?.(mutation.session?.codexhostThreadId) === true) {
      removedKeys.push(key)
      continue
    }
    const sessionId = typeof mutation.session.sessionId === 'string' ? mutation.session.sessionId : key.slice('claude:'.length)
    const unreadKnown = companionClaudeUnreadSnapshot.available === true
    const unread = unreadKnown && companionClaudeUnreadSnapshot.ids.has(sessionId)
    const existingTask = (Array.isArray(current.tasks) ? current.tasks : [])
      .find((task) => task?.key === key && task?.provider === 'claude')
    const evidence = companionClaudeEvidenceV7(mutation.session, unread, {
      persisted,
      dynamicCutoff,
      order,
      acceptedAt: membershipGeneration,
      topologyGeneration,
      unreadKnown,
      unreadSequence: companionEvidenceSequenceV7(
        companionClaudeUnreadSnapshot.generation,
        companionClaudeUnreadSnapshot.readAt
      ),
      metadataOnly: true,
      capabilities: [
        'open',
        ...(existingTask?.providerCapabilities?.archive === true || existingTask?.capabilities?.archive === true
          ? ['archive']
          : [])
      ],
      authority: 'provider-live'
    })
    nodes.push(...evidence.nodes)
    interactions.push(...evidence.interactions)
    interactionSets.push(...evidence.interactionSets)
    relations.push(...evidence.relations)
    order += evidence.nodes.length
  }
  if (!exact) {
    queueCompanionHostReconciliation('claude')
    return false
  }
  const laneGenerations = {
    membership: membershipGeneration,
    // Older senders may still attach state-shaped fields to a metadata callback,
    // but this adapter treats the row as metadata-only. Its mutation generation
    // must never move activity/interaction/unread/topology waterlines: doing so
    // can make the next real state generation permanently stale.
    activity: companionEvidenceSequenceV7(currentLanes.activity),
    interaction: companionEvidenceSequenceV7(currentLanes.interaction),
    unread: companionEvidenceSequenceV7(currentLanes.unread),
    planArtifact: companionEvidenceSequenceV7(currentLanes.planArtifact),
    metadata: membershipGeneration,
    topology: companionEvidenceSequenceV7(currentLanes.topology)
  }
  const batch = createCompanionEvidenceBatchV7({
    provider: 'claude',
    nodes,
    interactions,
    interactionSets,
    relations,
    laneGenerations,
    removedKeys: { membership: removedKeys },
    health: current.providerHealth?.claude?.status
  })
  const beforeRevision = current.packageRevision
  const published = publishCompanionEvidenceBatchesV3({
    acceptedAt: source.acceptedAt,
    sourceLaneGenerations: { claude: laneGenerations },
    evidenceBatches: { claude: batch }
  })
  const canonical = companionTaskKernel?.getPackage?.()
  const changed = Boolean(published && canonical?.packageRevision !== beforeRevision)
  runtimeDiagnostics.record({
    level: changed ? 'info' : 'debug',
    scope: 'task-push',
    event: 'claude-inventory-v7',
    outcome: published ? changed ? 'accepted' : 'semantic-noop' : 'rejected',
    durationMs: Date.now() - startedAt,
    slowMs: 50,
    count: source.mutations.length,
    cache: 'provider-direct',
    details: {
      mutationGeneration: companionEvidenceSequenceV7(source.generation),
      membershipGeneration,
      topologyGeneration: laneGenerations.topology,
      activityGeneration: laneGenerations.activity,
      interactionGeneration: laneGenerations.interaction,
      unreadGeneration: laneGenerations.unread,
      removedCount: removedKeys.length,
      packageRevision: canonical?.packageRevision || beforeRevision
    }
  })
  return changed
}

function queueCompanionHostReconciliation(provider = '') {
  if (!companionTaskKernel) return
  const requestedProvider = provider === 'codex' || provider === 'claude' || provider === 'cursor' ? provider : ''
  if (companionHostReconcileInFlight) {
    companionHostReconcilePendingProviders.add(requestedProvider)
    recordCompanionProbeGate('reconciliation-gate', 'coalesced', {
      requestedProvider: requestedProvider || 'all',
      pendingProviders: [...companionHostReconcilePendingProviders]
    })
    return
  }
  const startedAt = Date.now()
  companionHostReconcileInFlight = Promise.resolve()
    .then(() => {
      const current = companionTaskKernel.getPackage()
      const requestedProviders = requestedProvider
        ? {
            codex: requestedProvider === 'codex',
            claude: requestedProvider === 'claude',
            cursor: requestedProvider === 'cursor'
          }
        : current.providers
      return preflightCompanionTaskPackageV7({ providers: requestedProviders }).then((draft) => {
        if (!requestedProvider) return draft
        return {
          ...draft,
          providers: current.providers,
          sourceGenerations: {
            ...current.sourceGenerations,
            [requestedProvider]: draft.sourceGenerations[requestedProvider]
          },
          sourceLaneGenerations: {
            ...current.sourceLaneGenerations,
            [requestedProvider]: draft.sourceLaneGenerations[requestedProvider]
          },
          providerHealth: {
            ...current.providerHealth,
            [requestedProvider]: draft.providerHealth[requestedProvider]
          },
          evidenceBatches: Object.fromEntries(['codex', 'claude', 'cursor'].map((providerId) => [
            providerId,
            providerId === requestedProvider
              ? draft.evidenceBatches[providerId]
              : {
                  revision: companionV7Revisions.providerEvidenceBatch,
                  provider: providerId,
                  channels: Object.fromEntries(companionEvidenceChannelsV7.map((channel) => [channel, {
                    mode: 'delta',
                    complete: false,
                    generation: Number(current.sourceLaneGenerations?.[providerId]?.[channel]) || 0,
                    removedKeys: []
                  }])),
                  nodes: [],
                  interactions: [],
                  interactionSets: [],
                  relations: [],
                  relationMode: 'delta',
                  relationsComplete: false,
                  removedRelationChildKeys: [],
                  health: current.providerHealth?.[providerId]?.status === 'ready' || current.providerHealth?.[providerId]?.status === 'degraded'
                    ? current.providerHealth[providerId].status
                    : 'unavailable'
                }
          ]))
        }
      })
    })
    .then((draft) => {
      const result = companionTaskKernel.publishEvidence?.({
        ...draft,
        sourceTaskStateRevision: companionTaskKernel.getPackage().sourceTaskStateRevision
      })
      runtimeDiagnostics.record({
        level: result ? 'info' : 'error',
        scope: 'task-recovery',
        event: 'reconciliation',
        outcome: result ? 'accepted' : 'rejected',
        durationMs: Date.now() - startedAt,
        slowMs: 500,
        count: Object.values(draft.evidenceBatches || {}).reduce((total, batch) => total + (Array.isArray(batch?.nodes) ? batch.nodes.length : 0), 0),
        cache: 'cold-read',
        details: {
          requestedProvider: requestedProvider || 'all',
          taskCount: Object.values(draft.evidenceBatches || {}).reduce((total, batch) => total + (Array.isArray(batch?.nodes) ? batch.nodes.length : 0), 0)
        }
      })
      return result
    })
    .catch(() => {
      runtimeDiagnostics.record({
        scope: 'task-recovery',
        event: 'reconciliation',
        outcome: 'failed',
        code: 'provider-read-failed',
        durationMs: Date.now() - startedAt,
        slowMs: 500,
        level: 'error',
        cache: 'cold-read'
      })
      return undefined
    })
    .finally(() => {
      companionHostReconcileInFlight = null
      if (companionHostReconcilePendingProviders.size) {
        const nextProvider = companionHostReconcilePendingProviders.has('')
          ? ''
          : companionHostReconcilePendingProviders.values().next().value
        companionHostReconcilePendingProviders.delete(nextProvider)
        if (!nextProvider) companionHostReconcilePendingProviders.clear()
        queueMicrotask(() => queueCompanionHostReconciliation(nextProvider))
      }
    })
}

if (companionTaskKernel) {
  codexActivityListeners.add(applyCodexActivityToCompanionKernel)
  try { companionClaudeStateDispose = claudeBridge?.watchCodeState?.(() => applyClaudeStateToCompanionKernel()) || null } catch {}
  try {
    companionClaudeInventoryDispose = claudeBridge?.watchCodeSessions?.((delta) => {
      applyClaudeInventoryDeltaToCompanionKernel(delta)
      // Membership publishes synchronously above. A separate microtask lets
      // the state lane correlate the newly indexed member without coupling the
      // mutation result or its generation to phase/interaction/topology.
      queueMicrotask(() => applyClaudeStateToCompanionKernel())
    }) || null
  } catch {}
  try { companionClaudeUnreadDispose = claudeBridge?.watchCodeUnread?.(() => { void applyClaudeUnreadToCompanionKernel() }) || null } catch {}
  try { companionCursorEventDispose = cursorBridge?.watchEvents?.(() => queueCompanionHostReconciliation('cursor')) || null } catch {}
  try { companionCursorInventoryDispose = cursorBridge?.watchInventory?.(() => queueCompanionHostReconciliation('cursor')) || null } catch {}
}

function runtimeIdentityHandshake(input = {}) {
  const expected = input && typeof input === 'object' ? input : {}
  const actual = {
    hostAssetId: typeof runtimeIdentityArtifact?.hostAssetId === 'string' ? runtimeIdentityArtifact.hostAssetId : '',
    rendererAssetId: typeof runtimeIdentityArtifact?.rendererAssetId === 'string' ? runtimeIdentityArtifact.rendererAssetId : '',
    kernelRevision: companionTaskKernel?.revision || '',
    registryRevision: companionTaskKernel?.registryRevision || '',
    topologyRevision: companionTaskKernel?.topologyRevision || '',
    taskPackageRevision: companionTaskKernel?.packageRevision || '',
    commandRevision: companionTaskKernel?.commandRevision || '',
    subscribeRevision: companionTaskKernel?.subscribeRevision || '',
    ackRevision: companionTaskKernel?.ackRevision || ''
  }
  const expectation = {
    hostAssetId: typeof expected.hostAssetId === 'string' ? expected.hostAssetId : '',
    rendererAssetId: typeof expected.rendererAssetId === 'string' ? expected.rendererAssetId : '',
    kernelRevision: typeof expected.kernelRevision === 'string' ? expected.kernelRevision : '',
    registryRevision: typeof expected.registryRevision === 'string' ? expected.registryRevision : '',
    topologyRevision: typeof expected.topologyRevision === 'string' ? expected.topologyRevision : '',
    taskPackageRevision: typeof expected.taskPackageRevision === 'string' ? expected.taskPackageRevision : '',
    commandRevision: typeof expected.commandRevision === 'string' ? expected.commandRevision : '',
    subscribeRevision: typeof expected.subscribeRevision === 'string' ? expected.subscribeRevision : '',
    ackRevision: typeof expected.ackRevision === 'string' ? expected.ackRevision : ''
  }
  runtimeIdentityCompatible = runtimeIdentityArtifact?.revision === RUNTIME_IDENTITY_REVISION
    && runtimeIdentityArtifact?.artifactState === 'artifact-ready'
    && Object.keys(actual).every((key) => actual[key] && actual[key] === expectation[key])
    && typeof companionTaskKernel?.dispatchCommand === 'function'
    && typeof companionTaskKernel?.subscribe === 'function'
    && typeof companionTaskKernel?.acknowledge === 'function'
  const result = {
    revision: RUNTIME_IDENTITY_REVISION,
    status: runtimeIdentityCompatible ? 'host-loaded' : 'reload-required',
    expected: expectation,
    actual, artifactState: runtimeIdentityArtifact?.artifactState === 'artifact-ready' ? 'artifact-ready' : 'missing', builtAt: typeof runtimeIdentityArtifact?.builtAt === 'string' ? runtimeIdentityArtifact.builtAt : '', builtAtLocal: typeof runtimeIdentityArtifact?.builtAtLocal === 'string' ? runtimeIdentityArtifact.builtAtLocal : '', packageVersion: typeof runtimeIdentityArtifact?.packageVersion === 'string' ? runtimeIdentityArtifact.packageVersion : '',
    kernelRevision: actual.kernelRevision,
    taskPackageRevision: actual.taskPackageRevision,
    message: runtimeIdentityCompatible
      ? 'uTools 主机已加载当前构建'
      : `Preload ${actual.hostAssetId || 'unknown'} / UI ${expectation.hostAssetId || 'unknown'}，需要重新接入或重载`,
    ...(runtimeIdentityLoadError ? { errorCode: 'identity-missing' } : {})
  }
  const diagnosticFingerprint = JSON.stringify({
    status: result.status,
    actual,
    expectation,
    artifactState: runtimeIdentityArtifact?.artifactState || 'missing'
  })
  if (diagnosticFingerprint !== runtimeIdentityDiagnosticFingerprint) {
    runtimeIdentityDiagnosticFingerprint = diagnosticFingerprint
    recordCompanionDiagnosticEvent({
      level: 'info',
      scope: 'runtime-identity',
      event: 'runtime-identity-handshake',
      outcome: result.status,
      details: {
        actualHostAssetId: actual.hostAssetId,
        actualRendererAssetId: actual.rendererAssetId,
        expectedHostAssetId: expectation.hostAssetId,
        expectedRendererAssetId: expectation.rendererAssetId,
        actualKernelRevision: actual.kernelRevision,
        expectedKernelRevision: expectation.kernelRevision,
        actualRegistryRevision: actual.registryRevision,
        expectedRegistryRevision: expectation.registryRevision,
        actualTopologyRevision: actual.topologyRevision,
        expectedTopologyRevision: expectation.topologyRevision,
        actualTaskPackageRevision: actual.taskPackageRevision,
        expectedTaskPackageRevision: expectation.taskPackageRevision,
        actualCommandRevision: actual.commandRevision,
        expectedCommandRevision: expectation.commandRevision,
        actualSubscribeRevision: actual.subscribeRevision,
        expectedSubscribeRevision: expectation.subscribeRevision,
        actualAckRevision: actual.ackRevision,
        expectedAckRevision: expectation.ackRevision,
        artifactState: runtimeIdentityArtifact?.artifactState || 'missing'
      }
    })
  }
  return result
}

function runtimeIdentityTaskFailure(outcome = 'failed') {
  return {
    outcome,
    errorCode: 'reload-required',
    message: 'Preload 与 UI 运行身份不一致，需要重新接入或重载'
  }
}

if (globalThis.utools && typeof globalThis.utools.onPluginEnter === 'function') {
  globalThis.utools.onPluginEnter((action) => {
    ensureCodexInventoryMembershipWatchers({ reconcile: false })
    requestCodexInventoryMembershipReconciliation('plugin-enter', { forceTasksOnly: true })
    // 快速任务查看的载体是宿主自己拥有的悬浮子窗口，不依赖 Renderer 挂载。
    // 冷启动直接激活，避免"全局快捷键第一次按没反应、第二次才生效"。
    const quickEntryConsumed = (action && action.code === 'eypc-companion-quick')
      ? Boolean(codexFloatBridge?.activate({ command: 'quick' }))
      : false
    const consumedByKernel = quickEntryConsumed || Boolean(companionTaskKernel?.handleEnter(action))
    runtimeDiagnostics.record({
      level: 'info',
      scope: 'plugin-lifecycle',
      event: 'plugin-enter',
      outcome: consumedByKernel ? 'kernel-consumed' : 'renderer-dispatched',
      details: {
        consumedByKernel,
        quickEntryConsumed,
        hasAction: Boolean(action),
        // Plugin feature code only (a fixed identifier from plugin.json), so a
        // log reader can tell which silent entry was pressed.
        featureCode: typeof action?.code === 'string' ? action.code.slice(0, 80) : ''
      }
    })
    if (consumedByKernel) {
      // Task intents are consumed by the process-owned Kernel even while its
      // shared preflight is still in flight. A later Alt+Tab mount therefore
      // cannot replay the same silent shortcut.
      lastEnterPayload = null
      return
    }
    lastEnterPayload = action || null
    for (const listener of enterPayloadListeners) {
      try {
        listener(lastEnterPayload)
      } catch {}
    }
  })
}

if (globalThis.utools && typeof globalThis.utools.onPluginOut === 'function') {
  globalThis.utools.onPluginOut((isKill) => {
    runtimeDiagnostics.record({
      level: 'info',
      scope: 'plugin-lifecycle',
      event: 'plugin-out',
      outcome: isKill ? 'process-exit' : 'background-hidden',
      details: { isKill: Boolean(isKill), floatPersistent: Boolean(codexFloatBridge?.diagnostics()?.health?.persistent) }
    })
    // Float's own kill-vs-hide decision (health timer, desired-visibility flag,
    // window teardown) lives behind `handleHostVisibility` now -- this handler
    // forwards the raw host signal rather than reaching into Float internals.
    codexFloatBridge?.handleHostVisibility(isKill)
    if (isKill) {
      codexActivityListeners.delete(applyCodexActivityToCompanionKernel)
      try { companionClaudeStateDispose?.() } catch {}
      try { companionClaudeInventoryDispose?.() } catch {}
      try { companionClaudeUnreadDispose?.() } catch {}
      try { companionCursorEventDispose?.() } catch {}
      try { companionCursorInventoryDispose?.() } catch {}
      companionClaudeStateDispose = null
      companionClaudeInventoryDispose = null
      companionClaudeUnreadDispose = null
      companionCursorEventDispose = null
      companionCursorInventoryDispose = null
      closeCodexInventoryMembershipWatchers()
      companionTaskKernel?.close()
      codexEnvironmentBridge?.shutdownCodexEnvironmentActions()
      closeCodexActionRunner()
      closeCodexConnections({ force: true })
      return
    }
    // mainHide/background exit is a visibility transition, not a process
    // boundary. Keep the App Server session, aliases and latest-Turn cache hot
    // for the next global shortcut. Feature disable and onPluginOut(true) still
    // own session teardown; Renderer disposal only detaches its navigation lease.
  })
}

const CODEX_ACTION_HOST_RUNTIME_REVISION = 'action-host-v2-exact-argv-target'
const codexEnvironmentActionSessions = new Map()
let codexActionDeferredServerClose = false
let codexEnvironmentShuttingDown = false

// route-3 (RAW-169) closure rewrite. Constructed here, right after its own
// session/lifecycle state, because construction has no cross-domain ordering
// requirement (unlike archive/float, this domain never touches
// `companionTaskKernel`). `codexEnvironmentActionSessions` (Map) is injected
// by reference -- the entry's own `shouldDeferCodexActionServerClose` and
// `codexActionRunnerCatalogProjection` (Action Runner panel domain) read it
// directly too. `codexEnvironmentShuttingDown` (primitive `let`) needs both
// read and write across the boundary, so it is injected as a getter/setter
// pair instead. `resolveCodexEnvironmentTargetCwd` and
// `codexEnvironmentSessionKey` stay in the entry (both used directly by
// `codexActionRunnerCatalogProjection`) and are injected as function
// dependencies, same as `pushCodexActionRunnerSnapshot` and
// `flushCodexActionDeferredServerClose`. A failed load degrades every public
// method to the shape documented at the `window.eypcPlatform.codex` wiring
// below and the `onPluginOut` call site.
let codexEnvironmentBridge = null
try {
  let environmentBridgeModule = null
  try {
    environmentBridgeModule = require('./codex/environment-bridge.cjs')
  } catch {}
  if (!environmentBridgeModule) {
    const bases = [
      typeof __dirname === 'string' ? __dirname : '',
      typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
    ].filter(Boolean)
    for (const base of Array.from(new Set(bases))) {
      try {
        environmentBridgeModule = require(path.join(base, 'codex', 'environment-bridge.cjs'))
        break
      } catch {}
    }
  }
  if (typeof environmentBridgeModule?.createCodexEnvironmentBridge === 'function') {
    codexEnvironmentBridge = environmentBridgeModule.createCodexEnvironmentBridge({
      fs,
      path,
      os,
      process,
      crypto,
      spawn,
      run,
      codexEnvironmentToml,
      codexCommandValidation,
      codexActionAuthorization,
      codexRunDatabase,
      ensureCodexActionRunDatabase,
      persistCodexActionRun,
      codexActionRunMemorySnapshot,
      codexActionLogStream,
      codexActionConsumeDecodedLog,
      codexActionFlushLog,
      codexActionUsableFile,
      codexActionPackageManagerEntry,
      codexActionRuntimeProjection,
      pushCodexActionRunnerSnapshot,
      flushCodexActionDeferredServerClose,
      isShuttingDown: () => codexEnvironmentShuttingDown,
      setShuttingDown: (value) => { codexEnvironmentShuttingDown = value },
      codexEnvironmentActionSessions,
      actionHostRuntimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
      resolveCodexEnvironmentTargetCwd,
      codexEnvironmentSessionKey
    })
  }
} catch { codexEnvironmentBridge = null }

function codexEnvironmentTargetId(input) {
  const projectKey = String(input?.projectKey || '')
  if (!projectKey) return ''
  if (input?.kind === 'project') return projectKey
  const executionCwd = path.resolve(String(input?.executionCwd || ''))
  return `cat_${crypto.createHash('sha256').update(`codex-action-target\0${projectKey}\0${executionCwd}`).digest('hex').slice(0, 32)}`
}

function resolveCodexEnvironmentTargetCwd(targetAlias) {
  const now = Date.now()
  if (typeof targetAlias !== 'string') return { errorCode: 'invalid-request', message: '目标别名无效' }
  if (/^ct_[A-Za-z0-9_-]{16,80}$/.test(targetAlias)) {
    const entry = codexThreadActions.get(targetAlias)
    if (!entry || entry.expiresAt <= now) return { errorCode: 'stale-alias', message: '会话动作已失效，请刷新后重试' }
    try {
      const registry = readCodexNativeRegistry()
      if (!entry.sourceFingerprint || entry.sourceFingerprint !== registry.fingerprint) {
        return { errorCode: 'stale-alias', message: '会话动作已失效，请刷新后重试' }
      }
      const byKey = entry.projectKey && entry.projectKey !== 'chats'
        ? registry.projects.find((item) => item.key === entry.projectKey)
        : null
      const byAssignment = registry.projectById.get(registry.assignments.get(entry.threadId)) || null
      const project = byKey || byAssignment
      const roots = (project?.roots || []).filter((root) => {
        try { return fs.statSync(path.join(root, '.codex', 'environments')).isDirectory() } catch { return false }
      })
      if (roots.length !== 1) {
        return roots.length > 1
          ? { errorCode: 'ambiguous-root', message: '项目存在多个 Environment 根目录，请先消除歧义' }
          : { errorCode: 'cwd-missing', message: '项目未配置 Environment 根目录' }
      }
      const executionCwd = codexNormalizeNativeRoot(entry.cwd)
      if (!executionCwd) return { errorCode: 'cwd-missing', message: '会话缺少精确工作目录，请刷新后重试' }
      try {
        if (!fs.statSync(executionCwd).isDirectory()) return { errorCode: 'cwd-missing', message: '会话工作目录已失效，请刷新后重试' }
      } catch {
        return { errorCode: 'cwd-missing', message: '会话工作目录已失效，请刷新后重试' }
      }
      const target = { configRoot: roots[0], executionCwd, projectKey: project.key, kind: 'task' }
      return { ...target, targetId: codexEnvironmentTargetId(target) }
    } catch {}
    return { errorCode: 'cwd-missing', message: '无法解析会话工作目录' }
  }
  if (/^cp_[A-Za-z0-9_-]{16,80}$/.test(targetAlias)) {
    const entry = codexProjectActions.get(targetAlias)
    if (!entry || entry.expiresAt <= now) return { errorCode: 'stale-alias', message: '项目动作已失效，请刷新后重试' }
    if (entry.kind === 'chats' || entry.projectKey === 'chats') return { errorCode: 'unsupported-target', message: 'Chats 分组没有项目根目录' }
    try {
      const registry = readCodexNativeRegistry()
      if (!entry.sourceFingerprint || entry.sourceFingerprint !== registry.fingerprint) {
        return { errorCode: 'stale-alias', message: '项目动作已失效，请刷新后重试' }
      }
      const project = registry.projectById.get(entry.projectId) || registry.projects.find((item) => item.key === entry.projectKey)
      const roots = (project?.roots || []).filter((root) => {
        try { return fs.statSync(path.join(root, '.codex', 'environments')).isDirectory() } catch { return false }
      })
      if (roots.length === 1) {
        const target = { configRoot: roots[0], executionCwd: roots[0], projectKey: project.key, kind: 'project' }
        return { ...target, targetId: codexEnvironmentTargetId(target) }
      }
      if (roots.length > 1) return { errorCode: 'ambiguous-root', message: '项目存在多个 Environment 根目录，请先消除歧义' }
    } catch {}
    return { errorCode: 'cwd-missing', message: '无法解析项目根目录' }
  }
  return { errorCode: 'invalid-request', message: '目标别名无效' }
}

function codexEnvironmentSessionKey(targetId, environmentId, actionId) {
  return `${targetId}\0${environmentId}\0${actionId}`
}

function shouldDeferCodexActionServerClose() {
  if (codexEnvironmentShuttingDown) return false
  if (codexActionRunnerVisible) return true
  if (codexActionRunnerCatalog?.loading === true) return true
  return [...codexEnvironmentActionSessions.values()].some((session) => session?.state === 'running' || session?.state === 'stopping')
}

function flushCodexActionDeferredServerClose() {
  if (!codexActionDeferredServerClose || shouldDeferCodexActionServerClose()) return false
  codexActionDeferredServerClose = false
  closeCodexServer()
  return true
}

function codexActionRunnerPreferences() {
  const stored = globalThis.utools?.dbStorage?.getItem?.(CODEX_ACTION_RUNNER_STORAGE_KEY)
  const source = codexRecord(stored)
  const runtimeByProject = {}
  for (const [projectKey, value] of Object.entries(codexRecord(source.runtimeByProject)).slice(0, 100)) {
    const preference = codexRecord(value)
    if (!projectKey || projectKey.length > 160 || preference.mode !== 'manual' || typeof preference.candidateId !== 'string' || !preference.candidateId) continue
    runtimeByProject[projectKey] = { mode: 'manual', candidateId: preference.candidateId.slice(0, 120) }
  }
  return {
    pinned: source.pinned === true,
    view: source.view === 'archived' ? 'archived' : 'records',
    selectedLaneId: typeof source.selectedLaneId === 'string' ? source.selectedLaneId.slice(0, 300) : '',
    bounds: codexRecord(source.bounds),
    runtimeByProject
  }
}

function ensureCodexActionRunnerPreferencesLoaded() {
  if (codexActionRunnerPreferenceLoaded) return
  codexActionRunnerPreference = { ...codexActionRunnerPreference, ...codexActionRunnerPreferences() }
  codexActionRunnerPreferenceLoaded = true
}

function writeCodexActionRunnerPreferences() {
  const payload = { version: 1, ...codexActionRunnerPreference }
  try {
    if (codexActionRunnerAlive() && typeof codexActionRunnerWindow.getBounds === 'function') payload.bounds = codexActionRunnerWindow.getBounds()
    return globalThis.utools?.dbStorage?.setItem?.(CODEX_ACTION_RUNNER_STORAGE_KEY, payload) !== false
  } catch { return false }
}

function codexActionRunnerAlive() {
  if (!codexActionRunnerWindow) return false
  try { return typeof codexActionRunnerWindow.isDestroyed !== 'function' || !codexActionRunnerWindow.isDestroyed() } catch { return false }
}

function codexActionRunDatabasePath() {
  return codexRunDatabase ? codexRunDatabase.codexActionRunDatabasePath() : ''
}

function enforceCodexActionRunRetention(database) {
  if (codexRunDatabase) codexRunDatabase.enforceCodexActionRunRetention(database)
}

function ensureCodexActionRunDatabase() {
  return codexRunDatabase ? codexRunDatabase.ensureCodexActionRunDatabase() : null
}

function persistCodexActionRun(run) {
  if (codexRunDatabase) codexRunDatabase.persistCodexActionRun(run)
}

function codexActionRunMemorySnapshot() {
  return codexRunDatabase ? codexRunDatabase.codexActionRunMemorySnapshot() : []
}

function sanitizeCodexActionLogText(text, privatePaths = []) {
  return codexLogRedaction ? codexLogRedaction.sanitizeCodexActionLogText(text, privatePaths) : ''
}

function codexActionFlushLog(run) {
  if (codexLogStream) codexLogStream.codexActionFlushLog(run)
}

function codexActionQueueSafeLog(run, stream, text) {
  if (codexLogStream) codexLogStream.codexActionQueueSafeLog(run, stream, text)
}

function codexActionLogStream(run, stream, privatePaths) {
  return codexLogStream ? codexLogStream.codexActionLogStream(run, stream, privatePaths) : null
}

function codexActionConsumeDecodedLog(run, stream, state, decoded, final = false) {
  if (codexLogStream) codexLogStream.codexActionConsumeDecodedLog(run, stream, state, decoded, final)
}

function codexActionUsableFile(candidate) {
  return codexNodeRuntimeHelpers ? codexNodeRuntimeHelpers.usableFile(candidate) : ''
}

function codexActionProbeNodeVersion(candidate) {
  return codexNodeRuntimeHelpers ? codexNodeRuntimeHelpers.probeNodeVersion(candidate) : ''
}

function codexActionSemverParts(version) {
  return codexNodeRuntimeHelpers ? codexNodeRuntimeHelpers.semverParts(version) : [0, 0, 0]
}

function codexActionCompareNodeCandidates(left, right) {
  return codexNodeRuntimeHelpers ? codexNodeRuntimeHelpers.compareNodeCandidates(left, right) : 0
}

function codexActionNvmRoots() {
  return codexNodeRuntimeHelpers ? codexNodeRuntimeHelpers.nvmRoots() : []
}

function codexActionNodeRuntimeCandidates(force = false) {
  return codexNodeRuntimeHelpers ? codexNodeRuntimeHelpers.nodeRuntimeCandidates(force) : []
}

function codexActionReadVersionToken(filePath, nvmrc = false) {
  return codexNodeRuntimeHelpers ? codexNodeRuntimeHelpers.readVersionToken(filePath, nvmrc) : { present: false, token: '' }
}

function codexActionProjectNodeHint(projectRoot) {
  return codexNodeRuntimeHelpers ? codexNodeRuntimeHelpers.projectNodeHint(projectRoot) : { present: false, token: '', source: '' }
}

function codexActionReadNvmAlias(root, token) {
  return codexNodeRuntimeHelpers ? codexNodeRuntimeHelpers.readNvmAlias(root, token) : ''
}

function codexActionResolveNodeToken(token, candidates, roots, depth = 0) {
  return codexNodeRuntimeHelpers ? codexNodeRuntimeHelpers.resolveNodeToken(token, candidates, roots, depth) : null
}

function codexActionRuntimePreference(projectKey) {
  ensureCodexActionRunnerPreferencesLoaded()
  const source = codexRecord(codexActionRunnerPreference.runtimeByProject)[projectKey]
  const preference = codexRecord(source)
  return preference.mode === 'manual' && typeof preference.candidateId === 'string' && preference.candidateId
    ? { mode: 'manual', candidateId: preference.candidateId.slice(0, 120) }
    : { mode: 'auto', candidateId: '' }
}

function codexActionRuntimeProjection(projectKey, projectRoot, force = false) {
  if (codexActionRuntimeProjectionModule) {
    return codexActionRuntimeProjectionModule.codexActionRuntimeProjection(projectKey, projectRoot, force)
  }
  const preference = codexActionRuntimePreference(projectKey)
  return {
    preference,
    resolved: null,
    public: {
      mode: preference.mode,
      state: 'unavailable',
      selectedCandidateId: preference.candidateId || undefined,
      candidates: [],
      message: '未检测到可用的 NVM 或系统 Node'
    }
  }
}

function codexActionPackageManagerEntry(runtime, name) {
  return codexNodeRuntimeHelpers ? codexNodeRuntimeHelpers.packageManagerEntry(runtime, name) : ''
}

function codexActionRunnerCatalogProjection() {
  return {
    ...codexActionRunnerCatalog,
    capabilities: ['node-runtime-selection-v1', 'log-cursor-v1', 'explicit-window-geometry-v1'],
    projects: (codexActionRunnerCatalog.projects || []).map((project) => {
      const { targetAlias, targetId, ...publicProject } = project
      const resolved = typeof targetAlias === 'string' && targetAlias ? resolveCodexEnvironmentTargetCwd(targetAlias) : null
      const nodeRuntime = resolved && !resolved.errorCode
        ? codexActionRuntimeProjection(project.key, resolved.executionCwd).public
        : { mode: codexActionRuntimePreference(project.key).mode, state: 'unavailable', candidates: codexActionNodeRuntimeCandidates().map((candidate) => ({ id: candidate.id, label: candidate.label, version: candidate.version, source: candidate.source })), message: '项目工作目录不可用' }
      return {
        ...publicProject,
        nodeRuntime,
        environments: (project.environments || []).map((environment) => ({
          ...environment,
          actions: (environment.actions || []).map((action) => {
            const session = codexEnvironmentActionSessions.get(codexEnvironmentSessionKey(targetId || project.key, environment.id, action.id))
            const state = session?.state === 'running' || session?.state === 'stopping' ? session.state : action.state === 'confirm-required' ? 'confirm-required' : 'idle'
            return { ...action, state }
          })
        }))
      }
    })
  }
}

function pushCodexActionRunnerSnapshot(message = '') {
  ensureCodexActionRunDatabase()
  if (!codexActionRunnerAlive()) return false
  const catalog = codexActionRunnerCatalogProjection()
  const selectedLaneId = typeof catalog.selectedLaneId === 'string' ? catalog.selectedLaneId : ''
  const snapshot = {
    version: 1,
    catalog,
    capabilities: ['node-runtime-selection-v1', 'log-cursor-v1', 'explicit-window-geometry-v1'],
    runs: codexActionRunMemorySnapshot().map((run) => ({
      version: 1,
      runId: run.runId,
      laneId: run.laneId,
      projectKey: run.projectKey,
      projectName: run.projectName,
      environmentId: run.environmentId,
      environmentName: run.environmentName,
      actionId: run.actionId,
      actionName: run.actionName,
      risk: run.risk,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      exitCode: run.exitCode,
      archivedAt: run.archivedAt,
      // Logs are cursor-hydrated through the dedicated log channel. Repeated
      // state/catalog snapshots must stay bounded and never resend full output.
      logText: '',
      logBytes: run.logBytes,
      logLines: run.logLines,
      message: run.message,
      cursor: run.cursor || 0,
      runtimeMode: run.runtimeMode,
      runtimeSource: run.runtimeSource,
      runtimeVersion: run.runtimeVersion,
      runtimeLabel: run.runtimeLabel
    })),
    selectedLaneId,
    view: codexActionRunnerPreference.view,
    pinned: codexActionRunnerPreference.pinned,
    loading: catalog.loading === true,
    message: message || catalog.message || '',
    generatedAt: Date.now()
  }
  try { codexActionRunnerWindow.webContents.send(CODEX_ACTION_RUNNER_CHANNELS.snapshot, snapshot); return true } catch { return false }
}

function codexActionRunnerDevelopmentEntry() {
  const href = typeof globalThis.location?.href === 'string' ? globalThis.location.href : ''
  return /^http:\/\/127\.0\.0\.1:8092(?:\/|$)/.test(href) ? 'http://127.0.0.1:8092/action.html' : ''
}

// Shared with the Float bridge (injected into it as a dependency): resolving
// "which display is this point/position on" and validating a resize-corner
// token are generic window-geometry concerns, not Action Runner- or
// Float-specific, so they stay here rather than living inside either domain.
function floatDisplayForPoint(point) {
  const utools = globalThis.utools
  try {
    if (utools && typeof utools.getDisplayNearestPoint === 'function') {
      const display = utools.getDisplayNearestPoint(point)
      if (display) return display
    }
  } catch {}
  return { id: 'primary', workArea: { x: 0, y: 0, width: 1440, height: 900 }, bounds: { x: 0, y: 0, width: 1440, height: 900 } }
}

function floatDisplayForPosition(position) {
  const utools = globalThis.utools
  if (position && position.displayId && utools && typeof utools.getAllDisplays === 'function') {
    try {
      const match = utools.getAllDisplays().find((display) => String(display.id) === String(position.displayId))
      if (match) return match
    } catch {}
  }
  let point = { x: 720, y: 450 }
  try {
    if (utools && typeof utools.getCursorScreenPoint === 'function') point = utools.getCursorScreenPoint()
  } catch {}
  return floatDisplayForPoint(point)
}

function validCodexResizeCorner(value) {
  return value === 'top-left' || value === 'top-right' || value === 'bottom-left' || value === 'bottom-right'
}

function clampCodexActionRunnerBounds(bounds, display) {
  return codexRunnerBounds ? codexRunnerBounds.clampCodexActionRunnerBounds(bounds, display) : { x: 0, y: 0, width: 980, height: 640 }
}

function resizeCodexActionRunnerBounds(start, screenX, screenY) {
  return codexRunnerBounds ? codexRunnerBounds.resizeCodexActionRunnerBounds(start, screenX, screenY) : start.bounds
}

function createCodexActionRunner() {
  const utools = globalThis.utools
  if (!utools || typeof utools.createBrowserWindow !== 'function') return false
  ensureCodexActionRunnerPreferencesLoaded()
  const bounds = codexRecord(codexActionRunnerPreference.bounds)
  const validBounds = Number.isFinite(bounds.x) && Number.isFinite(bounds.y) && Number.isFinite(bounds.width) && Number.isFinite(bounds.height)
  const initialDisplay = validBounds ? floatDisplayForPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }) : floatDisplayForPosition(null)
  const initialBounds = clampCodexActionRunnerBounds(validBounds ? bounds : { width: 980, height: 640 }, initialDisplay)
  const developmentEntry = codexActionRunnerDevelopmentEntry()
  let redirected = false
  const ready = () => {
    try {
      codexActionRunnerWindow.setAlwaysOnTop(codexActionRunnerPreference.pinned === true, 'floating')
      codexActionRunnerWindow.show()
      codexActionRunnerWindow.focus?.()
      codexActionRunnerVisible = true
    } catch {}
    pushCodexActionRunnerSnapshot()
  }
  try {
    codexActionRunnerWindow = utools.createBrowserWindow('action.html', {
      show: false,
      title: 'EyPc Action Runner',
      ...initialBounds,
      minWidth: CODEX_ACTION_RUNNER_MIN_WIDTH,
      minHeight: CODEX_ACTION_RUNNER_MIN_HEIGHT,
      backgroundColor: '#080d19',
      frame: false,
      transparent: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      closable: false,
      alwaysOnTop: codexActionRunnerPreference.pinned === true,
      skipTaskbar: false,
      autoHideMenuBar: true,
      webPreferences: { preload: 'action-preload.js' }
    }, () => {
      if (developmentEntry && !redirected && typeof codexActionRunnerWindow?.loadURL === 'function') {
        redirected = true
        try {
          const loading = codexActionRunnerWindow.loadURL(developmentEntry)
          if (loading && typeof loading.then === 'function') loading.then(ready).catch(ready)
          return
        } catch {}
      }
      ready()
    })
    return true
  } catch {
    codexActionRunnerWindow = null
    return false
  }
}

function activateCodexActionRunner(payload) {
  const source = codexRecord(payload)
  if (typeof source.laneId === 'string' && source.laneId) codexActionRunnerCatalog = { ...codexActionRunnerCatalog, selectedLaneId: source.laneId }
  if (!codexActionRunnerAlive() && !createCodexActionRunner()) return false
  try {
    codexActionRunnerWindow.show()
    codexActionRunnerWindow.focus?.()
    codexActionRunnerWindow.restore?.()
    codexActionRunnerVisible = true
  } catch { return false }
  pushCodexActionRunnerSnapshot()
  return true
}

function syncCodexActionRunnerCatalog(catalog) {
  const source = codexRecord(catalog)
  if (source.version !== 1 || !Array.isArray(source.projects)) return false
  codexActionRunnerCatalog = { ...source, version: 1, projects: source.projects.slice(0, 100) }
  pushCodexActionRunnerSnapshot()
  flushCodexActionDeferredServerClose()
  return true
}

function readCodexActionRunnerPreference() {
  ensureCodexActionRunnerPreferencesLoaded()
  return {
    selectedLaneId: typeof codexActionRunnerPreference.selectedLaneId === 'string'
      ? codexActionRunnerPreference.selectedLaneId.slice(0, 300)
      : ''
  }
}

function updateCodexActionRunnerPreference(payload) {
  const source = codexRecord(payload)
  if (typeof source.pinned === 'boolean') codexActionRunnerPreference.pinned = source.pinned
  if (source.view === 'records' || source.view === 'archived') codexActionRunnerPreference.view = source.view
  if (typeof source.selectedLaneId === 'string' && source.selectedLaneId) {
    codexActionRunnerPreference.selectedLaneId = source.selectedLaneId.slice(0, 300)
    codexActionRunnerCatalog = { ...codexActionRunnerCatalog, selectedLaneId: codexActionRunnerPreference.selectedLaneId }
  }
  const runtime = codexRecord(source.runtime)
  if (typeof runtime.projectKey === 'string' && runtime.projectKey && (codexActionRunnerCatalog.projects || []).some((project) => project.key === runtime.projectKey)) {
    const runtimeByProject = { ...codexRecord(codexActionRunnerPreference.runtimeByProject) }
    if (runtime.mode === 'auto') {
      delete runtimeByProject[runtime.projectKey]
    } else if (runtime.mode === 'manual' && typeof runtime.candidateId === 'string') {
      const candidate = codexActionNodeRuntimeCandidates(true).find((item) => item.id === runtime.candidateId)
      if (!candidate) return false
      runtimeByProject[runtime.projectKey] = { mode: 'manual', candidateId: candidate.id }
    }
    codexActionRunnerPreference.runtimeByProject = runtimeByProject
  }
  try { codexActionRunnerWindow?.setAlwaysOnTop?.(codexActionRunnerPreference.pinned, 'floating') } catch {}
  writeCodexActionRunnerPreferences()
  pushCodexActionRunnerSnapshot()
  return true
}

function setCodexActionRunArchived(input) {
  ensureCodexActionRunDatabase()
  const runId = typeof input?.runId === 'string' ? input.runId : ''
  const run = codexRunDatabase ? codexRunDatabase.findCodexActionRun(runId) : undefined
  if (!run) return Promise.resolve({ ok: false, message: '未找到执行记录' })
  if (!['completed', 'failed', 'stopped', 'interrupted'].includes(run.status)) return Promise.resolve({ ok: false, message: '仅已结束记录可归档' })
  run.archivedAt = input?.archived === true ? Date.now() : undefined
  persistCodexActionRun(run)
  pushCodexActionRunnerSnapshot(run.archivedAt ? '已归档' : '已恢复')
  return Promise.resolve({ ok: true })
}

function closeCodexActionRunner() {
  writeCodexActionRunnerPreferences()
  codexActionRunnerDrag = null
  codexActionRunnerResize = null
  if (codexActionRunnerAlive()) {
    codexActionRunnerForceClose = true
    try { codexActionRunnerWindow.close() } catch {}
  }
  codexActionRunnerWindow = null
  codexActionRunnerVisible = false
  codexActionRunnerForceClose = false
  flushCodexActionDeferredServerClose()
}

function validCodexActionRunnerSender(event) {
  if (!codexActionRunnerAlive()) return false
  const expected = codexActionRunnerWindow?.webContents?.id
  const actual = event && Number.isFinite(event.senderId) ? event.senderId : event?.sender?.id
  return Number.isFinite(expected) && Number.isFinite(actual) && expected === actual
}

function installCodexActionRunnerIpc() {
  const ipc = electronIpcRenderer()
  if (!ipc || typeof ipc.on !== 'function') return
  const allowed = new Set([
    'codex.actionRunner.run',
    'codex.actionRunner.stop',
    'codex.actionRunner.run.archive',
    'codex.actionRunner.run.restore',
    'codex.actionRunner.preference.update',
    'codex.actionRunner.runtime.update',
    'codex.actionRunner.project.reorder',
    'codex.actionRunner.hotkey.configure'
  ])
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.action, (event, payload) => {
    if (!validCodexActionRunnerSender(event)) return
    const source = codexRecord(payload)
    const actionId = typeof source.actionId === 'string' ? source.actionId : ''
    if (!allowed.has(actionId)) return
    const args = codexRecord(source.args)
    for (const listener of codexActionRunnerActionListeners) {
      try { listener({ actionId, args }) } catch {}
    }
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.snapshotRequest, (event) => {
    if (validCodexActionRunnerSender(event)) pushCodexActionRunnerSnapshot()
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.logRequest, (event, payload) => {
    if (!validCodexActionRunnerSender(event) || !codexActionRunnerAlive()) return
    const requestEnvelope = normalizeHostChildEnvelopeV7(payload, 'action', CODEX_ACTION_RUNNER_CHANNELS.logRequest)
    if (!requestEnvelope) return
    const source = codexRecord(requestEnvelope.payload)
    const runId = typeof source.runId === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(source.runId)
      ? source.runId
      : ''
    const requestedCursor = Number.isSafeInteger(source.cursor) && source.cursor >= 0 ? source.cursor : 0
    if (!runId) return
    const run = codexActionRunMemorySnapshot().find((candidate) => candidate.runId === runId)
    if (!run || requestedCursor === Number(run.cursor || 0)) return
    const logPayload = {
        version: 1,
        runId,
        cursor: Number(run.cursor || 0),
        baseCursor: requestedCursor,
        reset: true,
        stream: 'system',
        text: String(run.logText || ''),
        receivedAt: Date.now()
    }
    const responseEnvelope = createHostChildEnvelopeV7('action', CODEX_ACTION_RUNNER_CHANNELS.log, logPayload, {
      requestId: requestEnvelope.requestId,
      payloadRevision: Number(run.cursor || 0),
      logCursor: Number(run.cursor || 0)
    })
    if (!responseEnvelope) return
    try { codexActionRunnerWindow.webContents.send(CODEX_ACTION_RUNNER_CHANNELS.log, responseEnvelope) } catch {}
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.hide, (event) => {
    if (!validCodexActionRunnerSender(event) || !codexActionRunnerAlive()) return
    codexActionRunnerDrag = null
    codexActionRunnerResize = null
    writeCodexActionRunnerPreferences()
    try { codexActionRunnerWindow.hide() } catch {}
    codexActionRunnerVisible = false
    flushCodexActionDeferredServerClose()
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.dragStart, (event, payload) => {
    if (!validCodexActionRunnerSender(event) || codexActionRunnerResize || !codexActionRunnerAlive() || typeof codexActionRunnerWindow.getBounds !== 'function') return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return
    codexActionRunnerDrag = { pointerX: point.screenX, pointerY: point.screenY, bounds: codexActionRunnerWindow.getBounds() }
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.dragMove, (event, payload) => {
    if (!validCodexActionRunnerSender(event) || !codexActionRunnerDrag || !codexActionRunnerAlive()) return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return
    const candidate = {
      ...codexActionRunnerDrag.bounds,
      x: codexActionRunnerDrag.bounds.x + point.screenX - codexActionRunnerDrag.pointerX,
      y: codexActionRunnerDrag.bounds.y + point.screenY - codexActionRunnerDrag.pointerY
    }
    const display = floatDisplayForPoint({ x: candidate.x + candidate.width / 2, y: candidate.y + candidate.height / 2 })
    try { codexActionRunnerWindow.setBounds(clampCodexActionRunnerBounds(candidate, display)) } catch {}
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.dragEnd, (event) => {
    if (!validCodexActionRunnerSender(event) || !codexActionRunnerDrag) return
    codexActionRunnerDrag = null
    writeCodexActionRunnerPreferences()
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.resizeStart, (event, payload) => {
    if (!validCodexActionRunnerSender(event) || codexActionRunnerDrag || codexActionRunnerResize || !codexActionRunnerAlive() || typeof codexActionRunnerWindow.getBounds !== 'function') return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY) || !validCodexResizeCorner(point.corner)) return
    const bounds = codexActionRunnerWindow.getBounds()
    const display = floatDisplayForPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
    codexActionRunnerResize = { pointerX: point.screenX, pointerY: point.screenY, bounds: { ...bounds }, display, corner: point.corner }
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.resizeMove, (event, payload) => {
    if (!validCodexActionRunnerSender(event) || !codexActionRunnerResize || !codexActionRunnerAlive()) return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return
    try { codexActionRunnerWindow.setBounds(resizeCodexActionRunnerBounds(codexActionRunnerResize, point.screenX, point.screenY)) } catch {}
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.resizeEnd, (event) => {
    if (!validCodexActionRunnerSender(event) || !codexActionRunnerResize) return
    codexActionRunnerResize = null
    writeCodexActionRunnerPreferences()
  })
  ipc.on(CODEX_ACTION_RUNNER_CHANNELS.resizeCancel, (event) => {
    if (!validCodexActionRunnerSender(event) || !codexActionRunnerResize || !codexActionRunnerAlive()) return
    const bounds = codexActionRunnerResize.bounds
    codexActionRunnerResize = null
    try { codexActionRunnerWindow.setBounds(bounds) } catch {}
  })
}

installCodexActionRunnerIpc()

function publicClaudeTaskSnapshot(value) {
  if (!value || typeof value !== 'object') return value
  const { topologyComplete: _topologyComplete, ...snapshot } = value
  return {
    ...snapshot,
    sessions: (Array.isArray(value.sessions) ? value.sessions : []).map((session) => {
      if (!session || typeof session !== 'object') return session
      const { subagents: _subagents, topologyComplete: _sessionTopologyComplete, ...publicSession } = session
      return publicSession
    })
  }
}

function publicClaudeMutationDelta(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.mutations)) return value
  return {
    ...value,
    mutations: value.mutations.map((mutation) => mutation && typeof mutation === 'object' && mutation.session
      ? { ...mutation, session: publicClaudeTaskSnapshot({ sessions: [mutation.session] })?.sessions?.[0] }
      : mutation)
  }
}

function publicCursorTaskSnapshot(value) {
  if (!value || typeof value !== 'object') return value
  const { topologyComplete: _topologyComplete, ...snapshot } = value
  return {
    ...snapshot,
    sessions: (Array.isArray(value.sessions) ? value.sessions : []).map((session) => {
      if (!session || typeof session !== 'object') return session
      const { subagents: _subagents, ...publicSession } = session
      return publicSession
    })
  }
}

window.eypcPlatform = {
  diagnostics: {
    revision: runtimeDiagnostics.revision,
    snapshot: () => runtimeDiagnostics.snapshot(),
    record: (event) => recordCompanionDiagnosticEvent(event),
    configure: (settings) => runtimeDiagnostics.configure(settings),
    openDirectory: () => openRuntimeDiagnosticsDirectory(),
    openFile: () => openRuntimeDiagnosticsFile(),
    clear: () => clearRuntimeDiagnosticsFiles()
  },
  runtimeIdentity: {
    revision: RUNTIME_IDENTITY_REVISION,
    get: () => ({
      revision: RUNTIME_IDENTITY_REVISION,
      status: 'artifact-ready',
      hostAssetId: runtimeIdentityArtifact?.hostAssetId || '',
      rendererAssetId: runtimeIdentityArtifact?.rendererAssetId || '', artifactState: runtimeIdentityArtifact?.artifactState === 'artifact-ready' ? 'artifact-ready' : 'missing', builtAt: typeof runtimeIdentityArtifact?.builtAt === 'string' ? runtimeIdentityArtifact.builtAt : '', builtAtLocal: typeof runtimeIdentityArtifact?.builtAtLocal === 'string' ? runtimeIdentityArtifact.builtAtLocal : '', packageVersion: typeof runtimeIdentityArtifact?.packageVersion === 'string' ? runtimeIdentityArtifact.packageVersion : '',
      kernelRevision: companionTaskKernel?.revision || '',
      registryRevision: companionTaskKernel?.registryRevision || '',
      topologyRevision: companionTaskKernel?.topologyRevision || '',
      taskPackageRevision: companionTaskKernel?.packageRevision || '',
      commandRevision: companionTaskKernel?.commandRevision || '',
      subscribeRevision: companionTaskKernel?.subscribeRevision || '',
      ackRevision: companionTaskKernel?.ackRevision || '',
      loadError: runtimeIdentityLoadError
    }),
    handshake: runtimeIdentityHandshake
  },
  storage: {
    getState: readState,
    setState: writeState,
    getMqttArchive: readMqttArchive,
    setMqttArchive: writeMqttArchive,
    mutateMqttArchive,
    getMqttStorageStatus,
    getMqttSecrets: readMqttSecrets,
    setMqttSecrets: writeMqttSecrets
  },
  ports: {
    scan: scanPorts,
    kill: killProcess
  },
  windows: {
    capabilities: (...args) => windowSubsystem
      ? windowSubsystem.capabilities(...args)
      : Promise.resolve(unavailableWindowCapability(`窗口子系统未加载：${windowSubsystemLoadError || 'unknown error'}`)),
    list: (...args) => windowSubsystem
      ? windowSubsystem.list(...args)
      : Promise.resolve({ capability: unavailableWindowCapability('窗口子系统未加载'), windows: [], completeness: 'partial' }),
    probeInstance: (...args) => windowSubsystem
      ? windowSubsystem.probeInstance(...args)
      : Promise.resolve({ status: 'indeterminate', instanceId: String(args[0] && args[0].instanceId || ''), liveness: 'indeterminate', reason: 'unsupported' }),
    activate: (...args) => windowSubsystem ? windowSubsystem.activate(...args) : Promise.resolve({ outcome: 'unsupported', message: '窗口桥接实现不可用' }),
    alwaysOnTop: (...args) => windowSubsystem ? windowSubsystem.alwaysOnTop(...args) : Promise.resolve({ outcome: 'unsupported', message: '窗口桥接实现不可用' }),
    close: (...args) => windowSubsystem ? windowSubsystem.close(...args) : Promise.resolve({ outcome: 'unsupported', message: '窗口桥接实现不可用' }),
    terminate: (...args) => windowSubsystem ? windowSubsystem.terminate(...args) : Promise.resolve({ outcome: 'unsupported', message: '窗口桥接实现不可用' }),
    openPermissionSettings: (...args) => windowSubsystem ? windowSubsystem.openPermissionSettings(...args) : Promise.resolve(false)
  },
  claude: {
    inspect: () => claudeBridge ? claudeBridge.inspect() : claudeUnavailable('environment'),
    readSnapshot: (...args) => claudeBridge ? claudeBridge.readSnapshot(...args) : claudeUnavailable('snapshot'),
    // Explicitly authorized App quota authority. The Controller feature-detects
    // this method so an older preload degrades the quota lane alone.
    readQuotaFallback: (...args) => claudeBridge ? claudeBridge.readQuotaFallback(...args) : Promise.resolve(null),
    // Exact App Code-mode inventory. Older mixed Desktop/CLI ports are not
    // exposed: a long-lived stale preload degrades this lane instead of
    // reintroducing Cowork or CLI-only cards.
    readCodeSnapshot: (...args) => claudeBridge
      ? Promise.resolve(claudeBridge.readCodeSnapshot(...args)).then(publicClaudeTaskSnapshot)
      : { version: 2, revision: '', sessions: [], truncated: false, readAt: Date.now() },
    readCodeStateSnapshot: (...args) => claudeBridge
      ? Promise.resolve(claudeBridge.readCodeStateSnapshot(...args)).then(publicClaudeTaskSnapshot)
      : {
          version: 2,
          revision: '',
          sessions: [],
          truncated: false,
          readAt: Date.now(),
          generation: 0,
          source: 'none',
          freshness: { readAt: Date.now(), newestEvidenceAt: 0 },
          compatibility: 'unsupported',
          stateGeneration: 0,
          stateCompatibility: 'unsupported'
        },
    // Null when the app has never written a usage sample, which the Controller
    // treats as "no freshness source", not as an error.
    readPlanUsage: (...args) => claudeBridge ? claudeBridge.readPlanUsage(...args) : null,
    readCodeUnread: (...args) => claudeBridge ? claudeBridge.readCodeUnread(...args) : Promise.resolve(null),
    watchCodeSessions: (listener) => claudeBridge
      ? claudeBridge.watchCodeSessions((delta) => listener?.(publicClaudeMutationDelta(delta)))
      : (() => {}),
    watchCodeState: (...args) => claudeBridge ? claudeBridge.watchCodeState(...args) : (() => {}),
    watchCodeUnread: (...args) => claudeBridge ? claudeBridge.watchCodeUnread(...args) : (() => {}),
    // Push lane for hook-queue appends. Returns a disposer in every case, so a
    // caller never has to branch on whether the bridge loaded.
    watchEvents: (...args) => claudeBridge ? claudeBridge.watchEvents(...args) : (() => {}),
    readAppPresence: () => claudeBridge
      ? claudeBridge.readAppPresence()
      : Promise.resolve({ status: 'unknown', pid: 0, appId: '', instanceId: '', startToken: '', verifiedAt: 0 }),
    install: (...args) => claudeBridge ? claudeBridge.install(...args) : claudeUnavailable('result'),
    uninstall: (...args) => claudeBridge ? claudeBridge.uninstall(...args) : claudeUnavailable('result'),
    openTask: (...args) => runtimeIdentityCompatible
      ? claudeBridge ? claudeBridge.openTask(...args) : Promise.resolve(claudeUnavailable('open'))
      : Promise.resolve({ ...runtimeIdentityTaskFailure(), confirmsRead: false }),
    archiveCodeSession: (...args) => runtimeIdentityCompatible
      ? claudeBridge ? claudeBridge.archiveCodeSession(...args) : Promise.resolve(claudeUnavailable('archive'))
      : Promise.resolve(runtimeIdentityTaskFailure()),
    diagnostics: () => ({
      ...(claudeBridge && typeof claudeBridge.diagnostics === 'function' ? claudeBridge.diagnostics() : {}),
      revision: claudeBridge ? claudeBridge.revision : '',
      loaded: Boolean(claudeBridge),
      loadError: claudeBridgeLoadError
    }),
    close: () => { if (claudeBridge) claudeBridge.close() }
  },
  cursor: {
    inspect: () => cursorBridge ? cursorBridge.inspect() : cursorUnavailable('environment'),
    readInventory: () => cursorBridge
      ? Promise.resolve(cursorBridge.readInventory()).then(publicCursorTaskSnapshot)
      : cursorUnavailable('inventory'),
    readHookState: () => cursorBridge && typeof cursorBridge.readHookState === 'function'
      ? cursorBridge.readHookState().map((value) => ({
          sessionId: typeof value?.sessionId === 'string' ? value.sessionId : '',
          phase: typeof value?.phase === 'string' ? value.phase : '',
          turnOpen: value?.turnOpen === true,
          lastEventAt: Number(value?.lastEventAt) || 0
        })).filter((value) => value.sessionId)
      : [],
    watchEvents: (...args) => cursorBridge && typeof cursorBridge.watchEvents === 'function'
      ? cursorBridge.watchEvents(...args)
      : () => {},
    watchInventory: (...args) => cursorBridge && typeof cursorBridge.watchInventory === 'function'
      ? cursorBridge.watchInventory(...args)
      : () => {},
    install: (...args) => cursorBridge && typeof cursorBridge.install === 'function'
      ? cursorBridge.install(...args)
      : cursorUnavailable('register'),
    uninstall: (...args) => cursorBridge && typeof cursorBridge.uninstall === 'function'
      ? cursorBridge.uninstall(...args)
      : cursorUnavailable('register'),
    openTask: (...args) => cursorBridge
      ? cursorBridge.openTask(...args)
      : Promise.resolve(cursorUnavailable('open')),
    diagnostics: () => ({
      ...(cursorBridge && typeof cursorBridge.diagnostics === 'function' ? cursorBridge.diagnostics() : {}),
      revision: cursorBridge ? cursorBridge.revision : '',
      loaded: Boolean(cursorBridge),
      loadError: cursorBridgeLoadError
    }),
    close: () => { if (cursorBridge) cursorBridge.close() }
  },
  companionKernel: companionTaskKernel
      ? {
        revision: companionTaskKernel.revision,
        packageRevision: companionTaskKernel.packageRevision,
        registryRevision: companionTaskKernel.registryRevision,
        topologyRevision: companionTaskKernel.topologyRevision,
        commandRevision: companionTaskKernel.commandRevision,
        subscribeRevision: companionTaskKernel.subscribeRevision,
        ackRevision: companionTaskKernel.ackRevision,
        attach: (...args) => runtimeIdentityCompatible
          ? companionTaskKernel.attach(...args)
          : {
              revision: companionTaskKernel.revision,
              packageRevision: companionTaskKernel.packageRevision,
              registryRevision: companionTaskKernel.registryRevision,
              topologyRevision: companionTaskKernel.topologyRevision,
              commandRevision: companionTaskKernel.commandRevision,
              subscribeRevision: companionTaskKernel.subscribeRevision,
              ackRevision: companionTaskKernel.ackRevision,
              lease: 0,
              retained: false,
              ready: false,
              package: companionTaskKernel.getLatest(),
              errorCode: 'reload-required'
            },
        configure: (...args) => runtimeIdentityCompatible ? companionTaskKernel.configure(...args) : null,
        detach: (...args) => runtimeIdentityCompatible && companionTaskKernel.detach(...args),
        dispatchCommand: (...args) => runtimeIdentityCompatible
          ? companionTaskKernel.dispatchCommand(...args)
          : Promise.resolve(runtimeIdentityTaskFailure('unavailable')),
        getLatest: companionTaskKernel.getLatest,
        subscribe: (...args) => runtimeIdentityCompatible ? companionTaskKernel.subscribe(...args) : (() => {}),
        acknowledge: (...args) => runtimeIdentityCompatible && companionTaskKernel.acknowledge(...args),
        diagnostics: companionTaskKernel.diagnostics
      }
    : undefined,
  files: {
    capabilities: favoriteFileCapabilities(),
    open: openFavoritePath,
    reveal: revealFavoritePath,
    copyPath: copyFavoritePath,
    copyItems: copyFavoriteItems,
    inspectPaths: inspectFavoritePaths,
    run: runFavorite,
    listRuns: listFavoriteRuns,
    watchRuns: watchFavoriteRuns,
    pickFavorite: pickFavoritePath,
    pickFavorites: pickFavoritePaths,
    listDirectory: listFavoriteDirectory,
    saveTextFile
  },
  clipboard: {
    copyText
  },
  codex: {
    taskStateRevision: CODEX_TASK_STATE_REVISION,
    actionRuntimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
    inspectEnvironment: inspectCodexEnvironment,
    setLaunchPath: setCodexLaunchPath,
    clearLaunchPath: clearCodexLaunchPath,
    readSnapshot: readCodexSnapshot,
    readActivitySnapshot: readCodexActivitySnapshot,
    onActivityChanged(listener) {
      if (typeof listener !== 'function') return () => {}
      codexActivityListeners.add(listener)
      return () => codexActivityListeners.delete(listener)
    },
    openThread: (...args) => runtimeIdentityCompatible ? openCodexThread(...args) : Promise.resolve(runtimeIdentityTaskFailure()),
    createThread: (...args) => runtimeIdentityCompatible ? createCodexThread(...args) : Promise.resolve(runtimeIdentityTaskFailure()),
    openBlank: (...args) => runtimeIdentityCompatible ? openCodexBlank(...args) : Promise.resolve(runtimeIdentityTaskFailure()),
    archiveThread: (...args) => runtimeIdentityCompatible
      ? (codexArchiveBridge ? codexArchiveBridge.archiveCodexThread(...args) : Promise.resolve({ outcome: 'failed', errorCode: 'archive-unavailable', message: '归档服务不可用，任务已保留' }))
      : Promise.resolve(runtimeIdentityTaskFailure()),
    archiveProject: (...args) => runtimeIdentityCompatible
      ? (codexArchiveBridge ? codexArchiveBridge.archiveCodexProject(...args) : Promise.resolve({ outcome: 'failed', archivedKeys: [], skippedActiveKeys: [], failed: [], desktopSyncedKeys: [], desktopSyncFailedKeys: [], errorCode: 'archive-unavailable', message: '归档服务不可用，请稍后重试' }))
      : Promise.resolve(runtimeIdentityTaskFailure()),
    removeProject: (...args) => runtimeIdentityCompatible ? removeCodexProject(...args) : Promise.resolve(runtimeIdentityTaskFailure()),
    listProjectEnvironments: (...args) => codexEnvironmentBridge
      ? codexEnvironmentBridge.listCodexProjectEnvironments(...args)
      : { outcome: 'failed', runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION, errorCode: 'environment-unavailable', message: 'Environment 服务不可用', environments: [] },
    runProjectAction: (...args) => codexEnvironmentBridge
      ? codexEnvironmentBridge.runCodexProjectEnvironmentAction(...args)
      : Promise.resolve({ outcome: 'failed', errorCode: 'environment-unavailable', message: 'Environment 服务不可用' }),
    listActionSessions: (...args) => codexEnvironmentBridge ? codexEnvironmentBridge.listCodexEnvironmentActionSessions(...args) : [],
    stopActionSession: (...args) => codexEnvironmentBridge
      ? codexEnvironmentBridge.stopCodexEnvironmentActionSession(...args)
      : { outcome: 'failed', errorCode: 'environment-unavailable', message: 'Environment 服务不可用' },
    setActionRunArchived: setCodexActionRunArchived,
    close: closeCodexConnections
  },
  float: {
    // A failed load degrades to the same "not yet created" shape the real
    // bridge already produces before its first window exists -- sync/activate
    // read as `false` (matches the real early-return branches),
    // resetGeometry reads as `true` (the real function already treats "no
    // window" as vacuously reset), diagnostics reads the static not-checked
    // shape, and onAction hands back an inert unsubscribe. No caller learns
    // a new case.
    sync: (payload) => codexFloatBridge ? codexFloatBridge.sync(payload) : false,
    activate: (payload) => codexFloatBridge ? codexFloatBridge.activate(payload) : false,
    diagnostics: () => codexFloatBridge ? codexFloatBridge.diagnostics() : {
      supported: process.platform === 'darwin',
      alwaysOnTop: false,
      allWorkspaces: false,
      visibleOnFullScreen: false,
      checkedAt: 0,
      errorCode: process.platform === 'darwin' ? 'not-checked' : 'unsupported',
      health: { alive: false, persistent: false, lastHeartbeatAt: 0, lastRecreateAt: 0, recoveryDeadline: 0, interaction: 'idle' }
    },
    resetGeometry: (payload) => codexFloatBridge ? codexFloatBridge.resetGeometry(payload) : true,
    close() {
      codexFloatBridge?.close()
    },
    onAction(listener) {
      return codexFloatBridge ? codexFloatBridge.onAction(listener) : () => {}
    }
  },
  actionRunner: {
    syncCatalog: syncCodexActionRunnerCatalog,
    activate: activateCodexActionRunner,
    readPreference: readCodexActionRunnerPreference,
    updatePreference: updateCodexActionRunnerPreference,
    close: closeCodexActionRunner,
    onAction(listener) {
      if (typeof listener !== 'function') return () => {}
      codexActionRunnerActionListeners.add(listener)
      return () => codexActionRunnerActionListeners.delete(listener)
    }
  },
  app: {
    show() {
      try {
        if (globalThis.utools && typeof globalThis.utools.showMainWindow === 'function') {
          globalThis.utools.showMainWindow()
          return true
        }
      } catch {}
      return false
    },
    hide: async () => {
      try {
        if (globalThis.utools && typeof globalThis.utools.hideMainWindow === 'function') {
          return Boolean(globalThis.utools.hideMainWindow(true))
        }
      } catch {}
      return false
    },
    configureHotkey(commandLabel) {
      try {
        if (globalThis.utools && typeof globalThis.utools.redirectHotKeySetting === 'function') {
          globalThis.utools.redirectHotKeySetting(String(commandLabel || '').slice(0, 80))
          return true
        }
      } catch {}
      return false
    }
  },
  getEnterPayload() {
    return lastEnterPayload
  },
  clearEnterPayload() {
    lastEnterPayload = null
  },
  onEnterPayload(listener) {
    if (typeof listener !== 'function') return () => {}
    enterPayloadListeners.add(listener)
    return () => {
      enterPayloadListeners.delete(listener)
    }
  }
}
