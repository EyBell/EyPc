const { Buffer } = require('node:buffer')
const { execFile, execFileSync, spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
let https = null
try { https = require('node:https') } catch { /* older constrained preload harness: quota fallback stays unavailable */ }

const RUNTIME_IDENTITY_REVISION = 'runtime-identity-v1'
let runtimeIdentityArtifact = null
let runtimeIdentityLoadError = ''
let runtimeIdentityCompatible = false
let runtimeIdentityDiagnosticFingerprint = ''
try {
  runtimeIdentityArtifact = require('./runtime-identity.cjs')
} catch (error) {
  runtimeIdentityLoadError = String(error && error.message || error || 'runtime identity unavailable')
}

const STORAGE_KEY = 'eypc/state/v1'
const CODEX_LAUNCH_PATH_STORAGE_KEY = 'eypc/codex/launch-path/v1'
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
const CODEX_TASK_STATE_REVISION = 'task-state-v10'
const COMPANION_PLAN_PAUSE_STORAGE_KEY = 'eypc/companion/plan-pause/v1'
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
const CODEX_FLOAT_WATER_SIZE = { width: 104, height: 104 }
const CODEX_FLOAT_CARD_SIZE = { width: 166, height: 92 }
const CODEX_FLOAT_EXPANDED_WIDTH = 360
const CODEX_FLOAT_EXPANDED_MIN_WIDTH = 340
const CODEX_FLOAT_EXPANDED_MIN_HEIGHT = 280
const CODEX_FLOAT_EXPANDED_MAX_HEIGHT = 460
const CODEX_FLOAT_MARGIN = 12
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

// Process-lifetime companion task authority. Provider adapters only contribute
// raw evidence and capabilities; this Kernel owns the canonical package,
// cursor and dispatch arbitration across mainHide/Renderer remounts.
let createCompanionTaskKernel = null
let reduceCodexTaskEvidenceV4 = null
let reduceClaudeTaskEvidenceV4 = null
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
  reduceCodexTaskEvidenceV4 = typeof kernelModule.reduceCodexTaskEvidenceV4 === 'function'
    ? kernelModule.reduceCodexTaskEvidenceV4
    : null
  reduceClaudeTaskEvidenceV4 = typeof kernelModule.reduceClaudeTaskEvidenceV4 === 'function'
    ? kernelModule.reduceClaudeTaskEvidenceV4
    : null
  if (!reduceCodexTaskEvidenceV4 || !reduceClaudeTaskEvidenceV4) {
    throw new Error('companion task V4 reducers unavailable')
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
          try { codexActionRunnerWindow.webContents.send(CODEX_ACTION_RUNNER_CHANNELS.log, delta) } catch {}
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
    : { known: false, pending: false, planReady: false, planLifecycleRevision: 0, turnMode: 'unknown' }
}
const CODEX_ACTION_RUNNER_MIN_WIDTH = codexRunnerBounds?.CODEX_ACTION_RUNNER_MIN_WIDTH ?? 720
const CODEX_ACTION_RUNNER_MIN_HEIGHT = codexRunnerBounds?.CODEX_ACTION_RUNNER_MIN_HEIGHT ?? 420

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
const CODEX_FLOAT_CHANNELS = {
  snapshot: 'eypc-float:snapshot',
  taskPackage: 'eypc-float:task-package',
  taskPackageAck: 'eypc-float:task-package-ack',
  state: 'eypc-float:state',
  activate: 'eypc-float:activate',
  expansion: 'eypc-float:expansion',
  returnFocus: 'eypc-float:return-focus',
  action: 'eypc-float:action',
  threadCreate: 'eypc-float:thread-create',
  threadCreateResult: 'eypc-float:thread-create-result',
  threadOpen: 'eypc-float:thread-open',
  threadOpenResult: 'eypc-float:thread-open-result',
  blankOpen: 'eypc-float:blank-open',
  blankOpenResult: 'eypc-float:blank-open-result',
  copyText: 'eypc-float:copy-text',
  copyTextResult: 'eypc-float:copy-text-result',
  dragStart: 'eypc-float:drag-start',
  dragMove: 'eypc-float:drag-move',
  dragEnd: 'eypc-float:drag-end',
  resizeStart: 'eypc-float:resize-start',
  resizeMove: 'eypc-float:resize-move',
  resizeEnd: 'eypc-float:resize-end',
  resizeCancel: 'eypc-float:resize-cancel',
  interactionCancel: 'eypc-float:interaction-cancel',
  heartbeat: 'eypc-float:heartbeat',
  heartbeatAck: 'eypc-float:heartbeat-ack'
}
const CODEX_ACTION_RUNNER_CHANNELS = {
  snapshot: 'eypc-action-runner:snapshot',
  log: 'eypc-action-runner:log',
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
const CODEX_ARCHIVE_NATIVE_ACK_TIMEOUT_MS = 2_000
const CODEX_ARCHIVE_VERIFY_DELAY_MS = 300
const codexArchiveNativeAckWaiters = new Map()
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
// Session-only recovery hints intentionally survive Desktop/App Server bridge
// teardown inside this preload process. They carry topology only: never live
// state, unread state, prompts, or Renderer-visible identifiers.
const codexDesktopSideRelations = new Map()
// Verified App Server inventory topology is kept separately from Desktop
// recovery hints. It is process-private and only contributes anonymized branch
// evidence to the parent task; Side Chat IDs never become public rows.
const codexInventorySideRelations = new Map()
const codexInventorySideBranchEvidence = new Map()
const codexSideTopologyDiagnosticFingerprints = new Map()
// Raw branch IDs and exact terminal evidence remain Host-only. Kernel receives
// only session-hashed refs through publishCodexPrivateBranchEvidence().
const codexPrivateBranchTerminals = new Map()
// A successful task deep link is an EyPc-owned read acknowledgement for the
// currently observed completion. It must survive mainHide/pluginOut closing
// and rebuilding the Desktop bridge, but never leaves this preload process.
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
let codexFloatWindow = null
let codexFloatExpanded = false
let codexFloatPinned = false
let codexFloatEdge = 'right'
let codexFloatSnapshot = null
let codexFloatBaseLastSentRevision = 0
let codexFloatTaskLastSentRevision = 0
let codexFloatTaskAppliedRevision = 0
let codexFloatTaskPendingRevision = 0
let codexFloatTaskSendAttempts = 0
let codexFloatTaskPendingStartedAt = 0
let codexFloatTaskAckTimer = null
let codexFloatDrag = null
let codexFloatResize = null
let codexFloatInteractionTimer = null
const CODEX_FLOAT_INTERACTION_IDLE_MS = 10_000
const CODEX_FLOAT_HEARTBEAT_MS = 2_000
const CODEX_FLOAT_STALL_MS = 6_000
const CODEX_FLOAT_RECOVERY_MS = 10_000
const CODEX_FLOAT_RECREATE_COOLDOWN_MS = 60_000
let codexFloatLastHeartbeatAt = 0
let codexFloatLastRecreateAt = 0
let codexFloatLastStallLoggedAt = 0
let codexFloatRecoveryDeadline = 0
let codexFloatRecoveryReported = false
let codexFloatHealthTimer = null
let codexFloatExpandedSizes = []
let codexFloatPositionDisplayId = ''
let codexFloatPersistent = false
let codexFloatWorkspaceDiagnostics = {
  supported: process.platform === 'darwin',
  alwaysOnTop: false,
  allWorkspaces: false,
  visibleOnFullScreen: false,
  checkedAt: 0,
  errorCode: process.platform === 'darwin' ? 'not-checked' : 'unsupported'
}
const codexFloatActionListeners = new Set()
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

function normalizeCodexLaunchPathPreference(value) {
  const candidate = typeof value === 'string' ? value.trim() : ''
  if (!candidate || candidate.length > 4096 || candidate.includes('\u0000')) return ''
  const platformPath = codexPlatformPath()
  if (!platformPath.isAbsolute(candidate)) return ''
  return platformPath.normalize(candidate)
}

function readCodexLaunchPathPreference() {
  try {
    if (!globalThis.utools || !globalThis.utools.dbStorage) return ''
    const saved = globalThis.utools.dbStorage.getItem(CODEX_LAUNCH_PATH_STORAGE_KEY)
    const value = saved && typeof saved === 'object' ? saved.path : saved
    return normalizeCodexLaunchPathPreference(value)
  } catch {
    return ''
  }
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
  try { return fs.statSync(pathValue).isFile() } catch { return false }
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

    const readMeta = db.prepare('SELECT value FROM meta WHERE key = ?')
    const writeMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    const clearConnections = db.prepare('DELETE FROM connection_snapshots')
    const clearSessions = db.prepare('DELETE FROM sessions')
    const clearMessages = db.prepare('DELETE FROM messages')
    const clearTemplates = db.prepare('DELETE FROM publish_templates')
    const clearDraftHistory = db.prepare('DELETE FROM publish_draft_history')
    const insertConnection = db.prepare('INSERT OR REPLACE INTO connection_snapshots (id, updated_at, data_json) VALUES (?, ?, ?)')
    const insertSession = db.prepare('INSERT OR REPLACE INTO sessions (id, connection_id, started_at, data_json) VALUES (?, ?, ?, ?)')
    const insertMessage = db.prepare('INSERT OR REPLACE INTO messages (id, session_id, connection_id, direction, timestamp, data_json) VALUES (?, ?, ?, ?, ?, ?)')
    const insertTemplate = db.prepare('INSERT OR REPLACE INTO publish_templates (id, connection_id, updated_at, data_json) VALUES (?, ?, ?, ?)')
    const insertDraftHistory = db.prepare('INSERT OR REPLACE INTO publish_draft_history (id, connection_id, updated_at, data_json) VALUES (?, ?, ?, ?)')

    function writeArchiveToSqlite(archive) {
      const normalized = normalizeSqliteArchiveInput(archive)
      db.exec('BEGIN IMMEDIATE')
      try {
        clearConnections.run()
        clearSessions.run()
        clearMessages.run()
        clearTemplates.run()
        clearDraftHistory.run()
        for (const snapshot of normalized.connectionSnapshots) {
          if (!snapshot || !snapshot.id) continue
          insertConnection.run(String(snapshot.id), Math.trunc(Number(snapshot.updatedAt) || 0), JSON.stringify(snapshot))
        }
        for (const session of normalized.sessions) {
          if (!session || !session.id) continue
          insertSession.run(String(session.id), String(session.connectionId || ''), Math.trunc(Number(session.startedAt) || 0), JSON.stringify(session))
          const messages = Array.isArray(session.messages) ? session.messages : []
          for (const message of messages) {
            if (!message || !message.id) continue
            insertMessage.run(
              String(message.id),
              String(message.sessionId || session.id),
              String(message.connectionId || session.connectionId || ''),
              String(message.direction || 'event'),
              Math.trunc(Number(message.timestamp) || 0),
              JSON.stringify(message)
            )
          }
        }
        for (const template of normalized.publishTemplates) {
          if (!template || !template.id) continue
          insertTemplate.run(String(template.id), String(template.connectionId || ''), Math.trunc(Number(template.operatedAt || template.updatedAt) || 0), JSON.stringify(template))
        }
        for (const item of normalized.publishDraftHistory) {
          if (!item || !item.id) continue
          insertDraftHistory.run(String(item.id), String(item.connectionId || ''), Math.trunc(Number(item.updatedAt) || 0), JSON.stringify(item))
        }
        writeMeta.run('archive_json', JSON.stringify(normalized))
        writeMeta.run('updated_at', String(Date.now()))
        db.exec('COMMIT')
        return true
      } catch (error) {
        try {
          db.exec('ROLLBACK')
        } catch {}
        throw error
      }
    }

    function readArchiveFromSqlite() {
      const current = readMeta.get('archive_json')
      if (current && typeof current.value === 'string') {
        try {
          return normalizeSqliteArchiveInput(JSON.parse(current.value))
        } catch {}
      }
      const legacy = readLegacyMqttArchive()
      if (archiveHasData(legacy)) {
        writeArchiveToSqlite(legacy)
        mqttMigratedLegacyArchive = true
        writeMeta.run('migrated_legacy_archive_at', String(Date.now()))
        return normalizeSqliteArchiveInput(legacy)
      }
      return defaultMqttArchive()
    }

    return {
      dbPath,
      readArchive: readArchiveFromSqlite,
      writeArchive: writeArchiveToSqlite
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
      const ok = adapter.writeArchive(archive)
      writeLegacyMqttArchive(archive)
      return ok
    } catch (error) {
      mqttStorageLastError = error instanceof Error ? error.message : String(error)
    }
  }
  return writeLegacyMqttArchive(archive)
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
  return Boolean(known)
    && ['completed', 'interrupted', 'failed'].includes(known.lastTurnStatus)
    && codexIsConfirmedTurnEvidence(known.lastTurnEvidence)
}

function codexShouldDeferHydrationActive(bridge, known, parentThreadId, branchThreadId, activity) {
  if (!codexHasConfirmedTerminalEvidence(known) || activity?.status !== 'active' || activity.activeFlags?.length) return false
  if (known.appServerLiveActive === true
    && (!validCodexThreadId(known.appServerLiveBranchThreadId) || known.appServerLiveBranchThreadId === branchThreadId)) return false
  const shadow = branchThreadId === parentThreadId
    ? bridge?.shadows?.get(branchThreadId)
    : bridge?.sideShadows?.get(branchThreadId) || bridge?.shadows?.get(branchThreadId)
  const desktopActivity = codexDesktopShadowActivity(shadow)
  const desktopSequence = Number(shadow?.activityEventSequence) || 0
  const terminalSequence = Number(known.terminalEvidenceSequence) || 0
  return !(desktopActivity?.status === 'active'
    && shadow?.activityEvidence === 'activity-event'
    && desktopSequence > terminalSequence)
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
  if (branchThreadId !== parentThreadId || !known || !shadow) return 0
  const activity = codexDesktopShadowActivity(shadow)
  if (shadow.activityEvidence !== 'initial-snapshot'
    || activity?.status !== 'active'
    || activity.activeFlags.length > 0
    || known.lastTurnStatus !== 'inProgress') return 0
  const sequence = Number(known.inventoryTurnEvidenceSequence) || 0
  const startedAt = codexTimestampMs(known.inventoryTurnStartedAt)
  return sequence > 0
    && startedAt > 0
    && startedAt === codexTimestampMs(known.lastTurnStartedAt)
    ? sequence
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

const CODEX_LAUNCH_SOURCE_LABELS = {
  manual: '手动指定的位置',
  configured: '环境变量指定位置',
  volta: 'Volta 默认位置',
  'npm-global': 'npm 全局目录',
  local: '用户目录默认位置',
  homebrew: 'Homebrew 默认位置',
  nvm: 'NVM 版本目录',
  path: '系统 PATH',
  unknown: '未识别位置'
}

function codexLaunchCandidate(source, state) {
  return {
    source,
    label: CODEX_LAUNCH_SOURCE_LABELS[source] || CODEX_LAUNCH_SOURCE_LABELS.unknown,
    state
  }
}

function codexLaunchResult(plan, launchMode, manualLaunchPathState, launchCandidates) {
  return {
    ...plan,
    launchMode,
    manualLaunchPathState,
    launchCandidates: launchCandidates.slice(0, 8)
  }
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

function resolveCodexLaunchPlan() {
  const platformPath = codexPlatformPath()
  const candidates = []
  const env = process.env || {}
  const manualPath = readCodexLaunchPathPreference()
  if (manualPath) {
    const exists = codexLaunchPathIsFile(manualPath)
    const plan = exists
      ? codexLaunchPlan(manualPath, 'manual', true)
      : { ...codexLaunchPlan(manualPath, 'manual', false), invalid: true }
    return codexLaunchResult(
      plan,
      'manual',
      plan.detected ? 'valid' : 'invalid',
      [codexLaunchCandidate('manual', plan.detected ? 'available' : 'unusable')]
    )
  }
  if (typeof env.CODEX_CLI_PATH === 'string' && env.CODEX_CLI_PATH.trim()) candidates.push({ path: env.CODEX_CLI_PATH.trim(), source: 'configured' })
  const home = os.homedir()
  if (process.platform === 'win32') {
    const appData = typeof env.APPDATA === 'string' ? env.APPDATA : platformPath.join(home, 'AppData', 'Roaming')
    const localAppData = typeof env.LOCALAPPDATA === 'string' ? env.LOCALAPPDATA : platformPath.join(home, 'AppData', 'Local')
    const voltaHomes = [...new Set([
      typeof env.VOLTA_HOME === 'string' && env.VOLTA_HOME.trim() ? env.VOLTA_HOME.trim() : '',
      platformPath.join(localAppData, 'Volta'),
      platformPath.join(home, '.volta')
    ].filter(Boolean))]
    candidates.push(
      { path: platformPath.join(appData, 'npm', 'codex.cmd'), source: 'npm-global' },
      ...voltaHomes.flatMap((voltaHome) => [
        { path: platformPath.join(voltaHome, 'bin', 'codex.exe'), source: 'volta' },
        { path: platformPath.join(voltaHome, 'bin', 'codex.cmd'), source: 'volta' }
      ]),
      ...(typeof env.NVM_SYMLINK === 'string' ? [{ path: platformPath.join(env.NVM_SYMLINK, 'codex.cmd'), source: 'nvm' }] : []),
      { path: platformPath.join(home, '.codex', 'bin', 'codex.exe'), source: 'local' },
      { path: platformPath.join(home, '.local', 'bin', 'codex.exe'), source: 'local' },
      { path: platformPath.join(localAppData, 'Programs', 'Codex', 'codex.exe'), source: 'local' }
    )
  } else {
    candidates.push(
      { path: platformPath.join(home, '.volta', 'bin', 'codex'), source: 'volta' },
      { path: platformPath.join(home, '.local', 'bin', 'codex'), source: 'local' },
      { path: '/opt/homebrew/bin/codex', source: 'homebrew' },
      { path: '/usr/local/bin/codex', source: 'homebrew' }
    )
    try {
      const nvmRoot = platformPath.join(home, '.nvm', 'versions', 'node')
      const versions = fs.readdirSync(nvmRoot, { withFileTypes: true })
        .filter((entry) => entry && typeof entry.isDirectory === 'function' && entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      for (const version of versions) candidates.push({ path: platformPath.join(nvmRoot, version, 'bin', 'codex'), source: 'nvm' })
    } catch {}
  }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path')
  const pathValue = pathKey && typeof env[pathKey] === 'string' ? env[pathKey] : ''
  const executableNames = process.platform === 'win32' ? ['codex.exe', 'codex.cmd', 'codex.bat'] : ['codex']
  for (const directory of pathValue.split(platformPath.delimiter).filter(Boolean)) {
    for (const executable of executableNames) candidates.push({ path: platformPath.join(directory, executable), source: 'path' })
  }
  let detectedPlan = null
  let invalidPlan = null
  const launchCandidates = []
  const recordCandidate = (source, state) => {
    if (!launchCandidates.some((candidate) => candidate.source === source && candidate.state === state)) {
      launchCandidates.push(codexLaunchCandidate(source, state))
    }
  }
  for (const candidate of candidates) {
    if (!candidate.path || !platformPath.isAbsolute(candidate.path)) continue
    try {
      if (fs.existsSync(candidate.path)) {
        const plan = codexLaunchPlan(candidate.path, candidate.source, true)
        recordCandidate(candidate.source, plan.detected ? 'available' : 'unusable')
        if (plan.detected && !detectedPlan) detectedPlan = plan
        if (!invalidPlan) invalidPlan = plan
      }
    } catch {}
  }
  return codexLaunchResult(
    detectedPlan || invalidPlan || codexLaunchPlan('codex', 'unknown', false),
    'automatic',
    'not-configured',
    launchCandidates
  )
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

function codexDesktopIpcEndpoint() {
  if (process.platform !== 'darwin') return ''
  return path.join(codexNativeStatePaths().codexHome, 'ipc', 'ipc.sock')
}

function codexDesktopIpcEndpointIsSecure(endpoint) {
  if (!endpoint || process.platform !== 'darwin') return false
  const uid = typeof process.getuid === 'function' ? process.getuid() : null
  if (uid === null) return false
  try {
    const directory = fs.lstatSync(path.dirname(endpoint))
    const socket = fs.lstatSync(endpoint)
    return directory.isDirectory()
      && socket.isSocket()
      && directory.uid === uid
      && socket.uid === uid
      && (directory.mode & 0o077) === 0
      && (socket.mode & 0o077) === 0
  } catch {
    return false
  }
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
  const active = input.active !== false
  const flags = active
    ? [...new Set((Array.isArray(input.flags) ? input.flags : [])
      .filter((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval'))]
    : []
  const previousFlags = [...new Set((Array.isArray(input.previousFlags) ? input.previousFlags : [])
    .filter((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval'))]
  const signature = flags.slice().sort().join('|')
  const previousSignature = previousFlags.slice().sort().join('|')
  const waiting = flags.length > 0
  const previousWaitingSince = codexTimestampMs(input.previousWaitingSince)
  const evidenceAt = codexTimestampMs(input.evidenceAt)
  const waitingSince = waiting
    ? signature === previousSignature && previousWaitingSince
      ? previousWaitingSince
      : evidenceAt || previousWaitingSince || 0
    : 0
  return {
    flags,
    waiting,
    waitingSince,
    changed: signature !== previousSignature
  }
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

function codexDesktopUnreadObservation(bridge, known, threadId, shadow, persistedUnreadIds) {
  if (codexDesktopOpenedReadAcknowledgements.has(threadId)) {
    return { hasUnreadTurn: false, unreadAuthority: 'desktop-live' }
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

function codexDesktopAggregateUnread(bridge, known, parentThreadId, ownShadow, childEntries, persistedUnreadIds) {
  const observations = [
    codexDesktopUnreadObservation(bridge, known, parentThreadId, ownShadow, persistedUnreadIds),
    ...childEntries.map(([threadId, shadow]) => {
      return codexDesktopUnreadObservation(bridge, known, threadId, shadow, persistedUnreadIds)
    })
  ]
  const positive = observations.filter((observation) => observation.hasUnreadTurn)
  const authorityPool = positive.length ? positive : observations
  const unreadAuthority = authorityPool.some((observation) => observation.unreadAuthority === 'desktop-live')
    ? 'desktop-live'
    : authorityPool.some((observation) => observation.unreadAuthority === 'desktop-persisted')
      ? 'desktop-persisted'
      : 'unavailable'
  return {
    hasUnreadTurn: positive.length > 0,
    unreadAuthority
  }
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
  while (codexDesktopSideRelations.size > CODEX_DESKTOP_SIDE_RELATION_LIMIT) {
    const oldest = codexDesktopSideRelations.keys().next().value
    if (!oldest) break
    const oldestParent = codexDesktopSideRelations.get(oldest)
    if (validCodexThreadId(oldestParent)) codexForgetPrivateBranchTerminal(oldestParent, oldest)
    codexDesktopSideRelations.delete(oldest)
  }
  if (!codexThreadGoalCache.has(threadId) && codexThreadGoalRpcAvailable !== false) {
    void refreshCodexThreadGoal(threadId, { publish: true })
  }
  return true
}

function codexForgetDesktopSideRelation(threadId) {
  const parentThreadId = codexDesktopSideRelations.get(threadId)
  if (validCodexThreadId(parentThreadId)) codexForgetPrivateBranchTerminal(parentThreadId, threadId)
  codexDesktopSideRelations.delete(threadId)
}

function codexForgetDesktopSideRelationsForParent(parentThreadId) {
  codexForgetPrivateBranchTerminal(parentThreadId)
  for (const [threadId, parent] of codexDesktopSideRelations) {
    if (parent === parentThreadId) codexDesktopSideRelations.delete(threadId)
  }
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
  )
  // A process-scope acknowledgement must be bound to a concrete Turn. An
  // unbound false could otherwise suppress every later completion if an open
  // races inventory/bootstrap and no exact started event is observed.
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
  if (!shadow?.runtime) return null
  const waitingState = shadow.waitingState || null
  const activeFlags = new Set()
  const visibleRuntimeFlags = []
  for (const flag of shadow.runtime.activeFlags || []) {
    if (!codexWaitingEvidenceVisible(waitingState, flag, shadow.runtimeWaitingSequences?.[flag])) continue
    activeFlags.add(flag)
    visibleRuntimeFlags.push(flag)
  }
  let hasPlanImplementationRequest = false
  let hasOtherWaitingRequest = false
  let requestWaitingSince = 0
  for (const request of shadow.requests || []) {
    const flag = codexDesktopRequestFlag(request)
    const visible = flag && codexWaitingEvidenceVisible(waitingState, flag, request.observedSequence)
    if (visible) activeFlags.add(flag)
    if (visible) requestWaitingSince = Math.max(
      requestWaitingSince,
      codexTimestampMs(request.startedAt) || codexTimestampMs(request.observedAt)
    )
    if (visible && codexDesktopIsPlanImplementationRequest(request)) hasPlanImplementationRequest = true
    else if (visible) hasOtherWaitingRequest = true
  }
  // Desktop keeps unresolved requests in conversationState.requests. A plan
  // implementation request is created only after the Plan turn is complete,
  // so it is authoritative user-waiting evidence even if runtime status has
  // already moved to idle in the same patch batch.
  const waitingEdge = codexReduceWaitingEdge({
    flags: [...activeFlags],
    previousFlags: visibleRuntimeFlags,
    previousWaitingSince: requestWaitingSince ? 0 : shadow.runtimeWaitingSince,
    evidenceAt: requestWaitingSince
  })
  const status = waitingEdge.waiting
    ? 'active'
    : shadow.suppressUncorroboratedActive === true && shadow.runtime.type === 'active'
      ? 'notLoaded'
      : shadow.runtime.type
  const desktopActiveSince = status === 'active' ? codexTimestampMs(shadow.desktopActiveSince) : 0
  const waitingSince = status === 'active' && waitingEdge.waiting
    ? waitingEdge.waitingSince || desktopActiveSince
    : 0
  const planImplementationOnly = status === 'active'
    && hasPlanImplementationRequest
    && !hasOtherWaitingRequest
    && !activeFlags.has('waitingOnApproval')
  return {
    status,
    activeFlags: status === 'active' ? waitingEdge.flags : [],
    ...(planImplementationOnly ? { planImplementationOnly: true } : {}),
    ...(waitingSince ? { waitingSince } : {}),
    ...(desktopActiveSince ? { desktopActiveSince } : {})
  }
}

function codexDesktopHasStickyPendingRequest(shadow) {
  const activity = codexDesktopShadowActivity(shadow)
  return activity?.status === 'active'
    && activity.activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
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

function codexResolveParentActivity(own, childActivities, options = {}) {
  const activities = [own, ...childActivities].filter(Boolean)
  const activeFlags = [...new Set(activities.flatMap((activity) => activity.activeFlags || []))]
  const hasInput = activeFlags.includes('waitingOnUserInput')
  const hasApproval = activeFlags.includes('waitingOnApproval')
  const hasActive = activities.some((activity) => activity.status === 'active')
  const hasSystemError = activities.some((activity) => activity.status === 'systemError')
  const appServerActive = options.appServerActive === true && !hasInput && !hasApproval
  const status = hasInput || hasApproval || hasActive || appServerActive
    ? 'active'
    : hasSystemError ? 'systemError' : own.status
  const waitingActivities = activities.filter((activity) => (activity.activeFlags || [])
    .some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval'))
  const planImplementationOnly = status === 'active'
    && waitingActivities.length > 0
    && waitingActivities.every((activity) => activity.planImplementationOnly === true)
  const desktopActiveSince = status === 'active'
    ? Math.max(0, ...activities
      .filter((activity) => activity.status === 'active')
      .map((activity) => codexTimestampMs(activity.desktopActiveSince)))
    : 0
  const waitingSince = status === 'active' && (hasInput || hasApproval)
    ? Math.max(0, ...waitingActivities.map((activity) => codexTimestampMs(activity.waitingSince)))
      || codexTimestampMs(options.connectorWaitingSince)
    : 0
  return {
    status,
    activeFlags: status === 'active'
      ? (appServerActive ? [...(options.connectorActiveFlags || [])] : activeFlags)
      : [],
    planImplementationOnly,
    hasInput,
    hasApproval,
    hasActive,
    hasSystemError,
    appServerActive,
    waitingSince,
    desktopActiveSince
  }
}

function codexAppServerActiveDominates(known, shadows) {
  if (known?.appServerLiveActive !== true) return false
  const appServerSequence = Number(known.appServerLiveSequence) || 0
  const desktopSequence = Math.max(0, ...(Array.isArray(shadows) ? shadows : [])
    .filter((shadow) => shadow?.activityEvidence === 'activity-event')
    .map((shadow) => Number(shadow.activityEventSequence) || 0))
  return appServerSequence > 0 && appServerSequence >= desktopSequence
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

function codexPromoteCompletedPlanWait(known) {
  if (!known || known.lastTurnStatus !== 'completed'
    || known.pendingCompletedPlanItem !== true) return false
  delete known.pendingCompletedPlanItem
  known.planReady = true
  known.planLifecycleRevision = codexTimestampMs(known.lastTurnStartedAt)
    || codexTimestampMs(known.lastTurnCompletedAt)
    || Date.now()
  known.turnMode = 'plan'
  const hasOtherWaiting = known.activeFlags.includes('waitingOnApproval')
    || known.activeFlags.includes('waitingOnUserInput')
      && known.planImplementationOnly !== true
  known.connectorPlanImplementationOnly = true
  known.connectorStatus = 'active'
  known.connectorActiveFlags = [...new Set([...known.connectorActiveFlags, 'waitingOnUserInput'])]
  known.connectorStatusAuthority = 'persisted-decision'
  known.connectorWaitingSince = codexTimestampMs(known.lastTurnCompletedAt)
    || codexTimestampMs(known.lastTurnStartedAt)
    || Date.now()
  known.status = 'active'
  known.activeFlags = [...new Set([...known.activeFlags, 'waitingOnUserInput'])]
  known.planImplementationOnly = !hasOtherWaiting
  known.waitingSince = known.connectorWaitingSince
  if (known.statusAuthority !== 'desktop-live') {
    known.statusAuthority = 'persisted-decision'
    known.activityEvidence = 'connector'
    delete known.desktopActiveSince
  }
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
  if (turn.status === 'completed') codexPromoteCompletedPlanWait(known)
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

  resolveWaitingRequestObservations(threadId, requests, sequence = 0) {
    const observations = (Array.isArray(requests) ? requests : [])
      .filter((request) => codexDesktopRequestFlag(request) && Number.isInteger(request?.observedSequence))
    if (!observations.length) return false
    const state = this.waitingStateFor(threadId)
    const resolvedSequence = Number.isInteger(sequence) && sequence > 0
      ? sequence
      : codexNextLiveEvidenceSequence()
    for (const request of observations) {
      state.resolvedRequestSequences.delete(request.observedSequence)
      state.resolvedRequestSequences.set(request.observedSequence, resolvedSequence)
    }
    while (state.resolvedRequestSequences.size > CODEX_DESKTOP_RESOLVED_REQUEST_LIMIT) {
      const oldest = state.resolvedRequestSequences.keys().next().value
      if (!Number.isInteger(oldest)) break
      state.resolvedRequestSequences.delete(oldest)
    }
    return true
  }

  recordRemovedWaitingRequests(threadId, previousRequests, currentRequests) {
    const currentSequences = new Set((Array.isArray(currentRequests) ? currentRequests : [])
      .map((request) => request?.observedSequence)
      .filter(Number.isInteger))
    const removed = (Array.isArray(previousRequests) ? previousRequests : [])
      .filter((request) => !currentSequences.has(request?.observedSequence))
    return this.resolveWaitingRequestObservations(threadId, removed)
  }

  recordRemovedRuntimeWaitingFlags(threadId, previousFlags, currentFlags, currentRequests, sequence = 0) {
    const current = new Set(Array.isArray(currentFlags) ? currentFlags : [])
    const requestFlags = new Set((Array.isArray(currentRequests) ? currentRequests : [])
      .map(codexDesktopRequestFlag)
      .filter(Boolean))
    const removed = [...new Set((Array.isArray(previousFlags) ? previousFlags : [])
      .filter((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval'))]
      .filter((flag) => !current.has(flag) && !requestFlags.has(flag))
    if (!removed.length) return false
    this.clearWaitingEvidence(threadId, removed, {
      sequence: Number.isInteger(sequence) && sequence > 0
        ? sequence
        : codexNextLiveEvidenceSequence()
    })
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
    this.resolveWaitingRequestObservations(threadId, matches)
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
    if (unreadIds) {
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
    codexPromoteCompletedPlanWait(known)
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
    if (shadow.activityEvidence !== 'initial-snapshot' || this.hasExactPositiveActivity(parentThreadId)) return
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
      restart: options.restart === true
    })
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
        const turn = sanitizeCodexTurnStatusPage(page)
        const terminalTurn = turn?.status === 'completed' || turn?.status === 'failed' || turn?.status === 'interrupted'
        const validTerminalTurn = terminalTurn && turn.startedAt > 0
        const finalAttempt = refresh.attempt >= refresh.refreshDelays.length
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
          && observeCodexArchiveNativeAck(params.conversationId, 'desktop', message.sourceClientId)) return
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
      this.recordRemovedWaitingRequests(params.conversationId, previousShadow?.requests, shadow.requests)
      this.attachWaitingState(params.conversationId, shadow)
      this.recordRemovedRuntimeWaitingFlags(
        params.conversationId,
        previousShadow?.runtime?.activeFlags,
        shadow.runtime?.activeFlags,
        shadow.requests
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
    const previousRuntimeFlags = [...(shadow.runtime?.activeFlags || [])]
    const previousRequests = [...(shadow.requests || [])]
    let containsReadStatePatch = false
    let containsActivityPatch = false
    let refreshRuntimeWaitingSequences = false
    for (const patch of change.patches) {
      const patchSource = codexRecord(patch)
      const patchPath = Array.isArray(patchSource.path) ? patchSource.path : []
      if (patchPath[0] === 'hasUnreadTurn') containsReadStatePatch = true
      if (patchPath[0] === 'threadRuntimeStatus' || patchPath[0] === 'requests') containsActivityPatch = true
      if (patchPath[0] === 'threadRuntimeStatus'
        && (patchPath.length === 1 || patchPath[1] === 'activeFlags')) {
        refreshRuntimeWaitingSequences = true
      }
      if (!codexApplyDesktopShadowPatch(shadow, patch)) {
        this.scheduleWaitingEdgeRefresh(params.conversationId)
        return
      }
    }
    this.cancelWaitingEdgeRefresh(params.conversationId)
    shadow.revision = revision
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
    this.recordRemovedWaitingRequests(params.conversationId, previousRequests, shadow.requests)
    this.recordRemovedRuntimeWaitingFlags(
      params.conversationId,
      previousRuntimeFlags,
      shadow.runtime?.activeFlags,
      shadow.requests,
      shadow.activityEventSequence
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
    }
    else this.publishShadow(params.conversationId, shadow, readStateOnly)
  }

  publishShadow(threadId, shadow, readStateOnly = false) {
    const known = codexActivityInventory.get(threadId)
    const activity = codexDesktopShadowActivity(shadow)
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
    const own = codexDesktopShadowActivity(this.shadows.get(parentThreadId)) || {
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
      connectorActiveFlags: known.connectorActiveFlags,
      connectorWaitingSince: known.connectorWaitingSince
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
        connectorActiveFlags: known.connectorActiveFlags,
        connectorWaitingSince: known.connectorWaitingSince
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
    emitCodexActivityDelta([readStateOnly && !openedWaitingEpoch ? { ...known, readStateOnly: true } : known], false)
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
      const connectorHasUnreadTurn = unreadIds instanceof Set
        ? unreadIds.has(threadId)
        : known.connectorHasUnreadTurn === true
      let persistedBecameTrueQuery = Boolean(unreadIds)
        && this.persistedUnread.get(threadId) !== true
        && connectorHasUnreadTurn
        ? threadId
        : ''
      if (unreadIds instanceof Set) {
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
  const source = codexRecord(value)
  const minimalMembership = source.minimalMembership === true
  const readStateOnly = source.readStateOnly === true
  const status = ['active', 'idle', 'notLoaded', 'systemError'].includes(source.status) ? source.status : undefined
  const activeFlags = status === 'active' && Array.isArray(source.activeFlags)
    ? [...new Set(source.activeFlags.filter((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput'))]
    : []
  const statusAuthority = ['desktop-live', 'app-server-live', 'persisted-decision', 'connector', 'unavailable'].includes(source.statusAuthority)
    ? source.statusAuthority
    : 'unavailable'
  const activityEvidence = ['connector', 'initial-snapshot', 'activity-event'].includes(source.activityEvidence)
    ? source.activityEvidence
    : undefined
  const activityRevision = Number.isInteger(source.activityRevision) && source.activityRevision >= 0
    ? source.activityRevision
    : undefined
  const unreadAuthority = ['desktop-live', 'desktop-persisted', 'unavailable'].includes(source.unreadAuthority)
    ? source.unreadAuthority
    : 'unavailable'
  const lastTurnStatus = ['completed', 'interrupted', 'failed', 'inProgress'].includes(source.lastTurnStatus)
    ? source.lastTurnStatus
    : undefined
  const lastTurnStartedAt = codexTimestampMs(source.lastTurnStartedAt)
  const lastTurnCompletedAt = lastTurnStatus === 'completed' ? codexTimestampMs(source.lastTurnCompletedAt) : 0
  const desktopActiveSince = status === 'active' && statusAuthority === 'desktop-live'
    ? codexTimestampMs(source.desktopActiveSince)
    : 0
  const waitingSince = status === 'active'
    && activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
    ? codexTimestampMs(source.waitingSince)
    : 0
  const lastTurnEvidence = ['inventory', 'turn-started', 'turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(source.lastTurnEvidence)
    ? source.lastTurnEvidence
    : undefined
  const activeEvidenceSequence = Number.isInteger(source.activeEvidenceSequence) && source.activeEvidenceSequence > 0
    ? source.activeEvidenceSequence
    : undefined
  const terminalEvidenceSequence = Number.isInteger(source.terminalEvidenceSequence) && source.terminalEvidenceSequence > 0
    ? source.terminalEvidenceSequence
    : undefined
  return {
    key: typeof source.key === 'string' ? source.key : '',
    ...(minimalMembership && typeof source.actionAlias === 'string' ? { actionAlias: source.actionAlias } : {}),
    ...(minimalMembership && typeof source.displayName === 'string' ? { displayName: source.displayName } : {}),
    ...(minimalMembership && codexTimestampMs(source.updatedAt) ? { updatedAt: codexTimestampMs(source.updatedAt) } : {}),
    ...(minimalMembership && typeof source.projectKey === 'string' ? { projectKey: source.projectKey } : {}),
    ...(minimalMembership && typeof source.projectName === 'string' ? { projectName: source.projectName } : {}),
    ...(minimalMembership && (source.projectKind === 'project' || source.projectKind === 'chats') ? { projectKind: source.projectKind } : {}),
    ...(readStateOnly
      ? { readStateOnly: true }
      : {
          ...(status ? { status } : {}),
          activeFlags,
          planImplementationOnly: source.planImplementationOnly === true,
          planReady: source.planReady === true || source.planImplementationOnly === true,
          ...(Number.isFinite(source.planLifecycleRevision) && source.planLifecycleRevision > 0
            ? { planLifecycleRevision: Math.trunc(source.planLifecycleRevision) }
            : {}),
          ...(source.turnMode === 'plan' || source.turnMode === 'default' ? { turnMode: source.turnMode } : {}),
          ...(source.idleConfirmed === true ? { idleConfirmed: true } : {}),
          statusAuthority,
          ...(activityEvidence ? { activityEvidence } : {}),
          ...(activityRevision !== undefined ? { activityRevision } : {}),
          ...(waitingSince ? { waitingSince } : {}),
          ...(desktopActiveSince ? { desktopActiveSince } : {}),
          ...(lastTurnStatus ? { lastTurnStatus } : {}),
          ...(lastTurnStartedAt ? { lastTurnStartedAt } : {}),
          ...(lastTurnCompletedAt ? { lastTurnCompletedAt } : {}),
          ...(lastTurnEvidence ? { lastTurnEvidence } : {}),
          ...(activeEvidenceSequence !== undefined ? { activeEvidenceSequence } : {}),
          ...(terminalEvidenceSequence !== undefined ? { terminalEvidenceSequence } : {})
        }),
    ...(typeof source.hasUnreadTurn === 'boolean' ? { hasUnreadTurn: source.hasUnreadTurn } : {}),
    unreadAuthority
  }
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
  const { codexHome } = codexNativeStatePaths()
  return [
    path.join(codexHome, 'sessions'),
    path.join(codexHome, 'archived_sessions')
  ]
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
    && !archivedKeysInInventory.has(key))
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

function codexActivityDelta(entries, inventoryChanged, receivedAt = Date.now(), inventoryRefreshPriority = 'normal', archivedKeys = []) {
  const normalizedArchivedKeys = [...new Set(archivedKeys.filter((key) => typeof key === 'string' && /^[a-f0-9]{32}$/.test(key)))]
  return {
    version: 2,
    sourceFingerprint: codexActivitySourceFingerprint,
    generation: codexActivityGeneration,
    entries: entries.map(codexActivityPublicEntry).filter((entry) => entry.key),
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
  for (const value of Array.isArray(entries) ? entries : []) {
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
  if (!changedEntries.length && !bridgeChanged && !inventorySignal && !normalizedArchivedKeys.length) return false
  codexActivityBridgeFingerprint = bridgeFingerprint
  if (inventoryChanged === true) codexInventoryRefreshPending = true
  codexActivityGeneration += 1
  // Stage private branch evidence before listeners consume the matching
  // public delta. The Host draft commit applies both lanes atomically, so one
  // provider event cannot publish an intermediate branch-only package.
  publishCodexPrivateBranchEvidence(changedEntries, codexActivityGeneration, { deferPublish: true })
  const delta = codexActivityDelta(
    changedEntries,
    inventoryChanged === true,
    Date.now(),
    inventoryRefreshPriority,
    normalizedArchivedKeys
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
    if (validCodexThreadId(threadId) && observeCodexArchiveNativeAck(threadId, 'app-server')) return true
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

function codexRecordSideTopologyDecision(sourceCount, relations, depths, orphanCount) {
  const byParent = new Map()
  for (const [threadId, parentThreadId] of relations) {
    const current = byParent.get(parentThreadId) || { sideCount: 0, nestedSideCount: 0 }
    current.sideCount += 1
    if ((depths.get(threadId) || 0) > 1) current.nestedSideCount += 1
    byParent.set(parentThreadId, current)
  }
  const nextFingerprints = new Map()
  const aggregateDetails = {
    rootCount: Math.max(0, sourceCount - relations.size),
    sideCount: relations.size,
    orphanCount: Math.max(0, orphanCount),
    nestedSideCount: [...depths.entries()].filter(([threadId, depth]) => relations.has(threadId) && depth > 1).length,
    mergedParentCount: byParent.size
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
  for (const [threadId, parentThreadId] of [...codexInventorySideRelations]) {
    if (relations.get(threadId) === parentThreadId) continue
    codexForgetInventorySideRelation(threadId)
  }
  const nextEvidence = new Map()
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
    const turnLive = connectorStatus === 'active' && turn?.status === 'inProgress'
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
    const unreadKnown = openedRead || unreadIds instanceof Set
    const evidence = {
      parentThreadId,
      status: turnLive || persistedWaiting ? 'active' : connectorStatus,
      activeFlags,
      statusAuthority: turnLive ? 'app-server-live' : persistedWaiting ? 'persisted-decision' : 'connector',
      activityEvidence: turnLive ? 'activity-event' : 'initial-snapshot',
      activeEvidenceSequence,
      unreadKnown,
      hasUnreadTurn: openedRead ? false : unreadKnown && unreadIds.has(threadId),
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
  codexRecordSideTopologyDecision(rowById.size, relations, depths, orphanCount)
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
  const ownDesktopActivity = codexDesktopShadowActivity(ownShadow)
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
    const unread = desktopUnread.unreadAuthority !== 'unavailable'
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

function publishCodexPrivateBranchEvidence(entries, generation = codexActivityGeneration, options = {}) {
  if (!companionTaskKernel?.publishCodexBranchEvidence || !Number.isFinite(generation) || generation <= 0) return false
  const parents = []
  const seen = new Set()
  for (const value of Array.isArray(entries) ? entries : []) {
    const source = codexRecord(value)
    const match = [...codexActivityInventory.entries()].find(([, known]) => known === value || known.key === source.key)
    if (!match || seen.has(match[0])) continue
    seen.add(match[0])
    const evidence = codexPrivateBranchEvidence(match[0], match[1])
    if (evidence) parents.push(evidence)
  }
  if (!parents.length) return false
  companionTaskKernel.publishCodexBranchEvidence({
    generation: Math.trunc(generation),
    parents,
    deferPublish: options.deferPublish === true
  })
  return true
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
  const codexHome = typeof process.env.CODEX_HOME === 'string' && process.env.CODEX_HOME.trim()
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(os.homedir(), '.codex')
  const primary = path.join(codexHome, '.codex-global-state.json')
  return { codexHome, primary, backup: `${primary}.bak` }
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

function readCodexDesktopUnreadIds() {
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

function codexRolloutRuntimeStateText(text) {
  const state = {
    known: false,
    phase: 'unknown',
    edge: 'none',
    startedAt: 0,
    edgeAt: 0
  }
  if (typeof text !== 'string' || !text) return state
  const liveEventTypes = new Set([
    'agent_message',
    'agent_reasoning',
    'mcp_tool_call_begin',
    'mcp_tool_call_end',
    'patch_apply_begin',
    'patch_apply_end',
    'token_count'
  ])
  const liveResponseTypes = new Set([
    'custom_tool_call',
    'custom_tool_call_output',
    'function_call',
    'function_call_output',
    'reasoning'
  ])
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.length > 1_000_000) continue
    let record
    try { record = JSON.parse(line) } catch { continue }
    const source = codexRecord(record)
    const payload = codexRecord(source.payload)
    const observedAt = codexRolloutTimestampMs(
      source.timestamp,
      payload.timestamp,
      payload.started_at,
      payload.completed_at
    )
    if (source.type === 'event_msg' && payload.type === 'task_started') {
      state.known = true
      state.phase = 'active'
      state.edge = 'task-started'
      state.startedAt = observedAt
      state.edgeAt = observedAt
      continue
    }
    if (source.type === 'event_msg' && payload.type === 'task_complete') {
      state.known = true
      state.phase = 'completed'
      state.edge = 'task-complete'
      state.edgeAt = observedAt
      continue
    }
    if (source.type === 'event_msg' && payload.type === 'turn_aborted') {
      state.known = true
      state.phase = 'interrupted'
      state.edge = 'turn-aborted'
      state.edgeAt = observedAt
      continue
    }
    const liveAppend = (source.type === 'event_msg' && liveEventTypes.has(payload.type))
      || (source.type === 'response_item' && liveResponseTypes.has(payload.type))
    if (!liveAppend) continue
    if (state.phase === 'completed' || state.phase === 'interrupted') state.startedAt = 0
    state.known = true
    state.phase = 'active'
    state.edge = 'live-append'
    state.edgeAt = observedAt
  }
  return state
}

function codexPathInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || Boolean(relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function codexThreadRolloutCandidate(thread) {
  if (!thread || typeof thread.path !== 'string') return null
  const { codexHome } = codexNativeStatePaths()
  try {
    const sessionsRoot = fs.realpathSync(path.join(codexHome, 'sessions'))
    const candidate = fs.realpathSync(thread.path)
    if (!codexPathInside(sessionsRoot, candidate)) return null
    const stat = fs.statSync(candidate)
    if (!stat?.isFile?.() || !Number.isFinite(stat.size) || stat.size <= 0) return null
    return { candidate, stat }
  } catch {
    return null
  }
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
  const empty = { known: false, planReady: false, planLifecycleRevision: 0, turnMode: 'unknown' }
  if (!lastTurn) return empty
  const rollout = codexThreadRolloutCandidate(thread)
  if (!rollout) return empty
  const { candidate, stat } = rollout
  const mtimeMs = codexTimestampMs(stat.mtimeMs)
  const cached = codexThreadPendingPlanCache.get(candidate)
  if (cached && cached.size === stat.size && cached.mtimeMs === mtimeMs) {
    return {
      known: cached.known === true,
      planReady: cached.planReady === true || cached.pending === true,
      planLifecycleRevision: Number(cached.planLifecycleRevision) || (cached.pending === true ? Number(lastTurn.startedAt) || 0 : 0),
      turnMode: cached.turnMode === 'plan' || cached.turnMode === 'default' ? cached.turnMode : 'unknown'
    }
  }
  let state = empty
  for (const maximumBytes of CODEX_ROLLOUT_PENDING_PLAN_TAIL_BYTES) {
    state = codexRolloutPendingPlanStateText(codexReadRolloutTail(candidate, stat, maximumBytes))
    if (state.known || maximumBytes >= stat.size) break
  }
  const normalized = {
    known: state.known === true,
    planReady: state.planReady === true,
    planLifecycleRevision: state.planReady
      ? Number(state.planLifecycleRevision) || (lastTurn.status === 'completed' ? Number(lastTurn.startedAt) || 0 : 0)
      : 0,
    turnMode: state.turnMode === 'plan' || state.turnMode === 'default' ? state.turnMode : 'unknown'
  }
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
  let plan = { known: false, pending: false, planReady: false, planLifecycleRevision: 0, turnMode: 'unknown' }
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
  codexThreadPendingPlanCache.set(candidate, {
    size: stat.size,
    mtimeMs,
    pending: plan.planReady === true,
    known: plan.known === true,
    planReady: plan.planReady === true,
    planLifecycleRevision: Number(plan.planLifecycleRevision) || 0,
    turnMode: plan.turnMode
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
  known.planReady = false
  known.planLifecycleRevision = 0
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
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: 3_000 }, (error, stdout) => {
      if (!error) {
        resolve(Boolean(String(stdout || '').trim()))
        return
      }
      const code = codexRecord(error).code
      if (code === noMatchCode || String(code) === String(noMatchCode)) {
        resolve(false)
        return
      }
      reject(error)
    })
  })
}

async function codexDesktopIsRunning() {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    for (const executable of ['Codex', 'ChatGPT']) {
      if (await codexProbeExactProcess('/usr/bin/pgrep', ['-x', executable])) return true
    }
    return false
  }
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    const result = await run(`${systemRoot}\\System32\\tasklist.exe`, ['/NH', '/FO', 'CSV'])
    if (!result.ok && !result.stdout) throw new Error(result.error || 'Codex desktop process check failed')
    return /"(?:ChatGPT|Codex)\.exe"/i.test(result.stdout)
  }
  throw new Error('Codex desktop process check is unsupported')
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
    if (!useEventFastPath || dirtyThreadIds.has(thread.id) || !cached) {
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
    const persistedPendingPlan = connectorStatus !== 'active'
      && lastTurn.status === 'completed'
      && planLifecycle.planReady === true
    const persistedDecision = persistedPendingInput || persistedPendingPlan
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
      ...(persistedPendingPlan ? { planImplementationOnly: true } : {}),
      ...(planLifecycle.planReady ? {
        planReady: true,
        planLifecycleRevision: planLifecycle.planLifecycleRevision || lastTurn.startedAt
      } : {}),
      turnMode: planLifecycle.turnMode,
      statusAuthority: persistedDecision ? 'persisted-decision' : 'connector',
      hasUnreadTurn: unreadIds ? unreadIds.has(thread.id) : false,
      unreadAuthority: unreadIds ? 'desktop-persisted' : 'unavailable',
      updatedAt: codexTimestampMs(thread.recencyAt) || codexTimestampMs(thread.updatedAt) || lastTurn.startedAt,
      ...(codexTimestampMs(thread.createdAt) ? { createdAt: codexTimestampMs(thread.createdAt) } : {}),
      ...(codexThreadFirstPromptCache.get(thread.id)?.firstPromptAt ? { firstPromptAt: codexThreadFirstPromptCache.get(thread.id).firstPromptAt } : {}),
      lastTurnStatus: lastTurn.status,
      lastTurnStartedAt: lastTurn.startedAt,
      ...(lastTurn.completedAt ? { lastTurnCompletedAt: lastTurn.completedAt } : {}),
      ...(lastTurn.status === 'interrupted' || lastTurn.status === 'failed'
        ? { lastTurnEvidence: 'targeted-after-exit', idleConfirmed: connectorStatus !== 'active' }
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
    const rows = await recoverDirtyCodexThreadsMissingFromInventory(listedRows, dirtySnapshot.keys(), archivedThreadIds)
    const topology = codexInventoryThreadTopology(rows)
    const assignments = new Map()
    for (const thread of rows) {
      const native = codexThreadNativeProject(thread, registry)
      if (native) assignments.set(thread.id, native)
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
    const turns = await readCodexThreadTurnStatuses(eligibleRows, new Set(dirtySnapshot.keys()))
    await readCodexThreadGoals(eligibleRows)
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
        planReady: projection?.planReady === true || previousActivity?.planReady === true,
        planLifecycleRevision: Number(projection?.planLifecycleRevision || previousActivity?.planLifecycleRevision) || 0,
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
    codexEnsureDesktopBridge().updateInventory(activityInventory.keys())
    const inventoryChanged = previousInventoryFingerprint !== codexActivityInventorySemanticFingerprint()
    if (inventoryChanged) {
      codexActivityGeneration += 1
      publishCodexPrivateBranchEvidence([...activityInventory.values()], codexActivityGeneration)
    }
    codexPrimeActivitySemanticFingerprints()
    const activityByKey = new Map([...activityInventory.values()].map((entry) => [entry.key, entry]))
    for (const thread of threads) {
      const activity = activityByKey.get(thread.key)
      if (!activity) continue
      thread.status = activity.status
      thread.activeFlags = [...activity.activeFlags]
      thread.planImplementationOnly = activity.planImplementationOnly === true
      thread.planReady = activity.planReady === true
      thread.planLifecycleRevision = Number(activity.planLifecycleRevision) || 0
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
    }
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
    return { ok: true, value, receivedAt: value.receivedAt }
  } catch (error) {
    return codexErrorResult(error)
  }
}

function codexArchiveOperationId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{8,160}$/.test(value)
    ? value
    : `archive-${crypto.randomUUID()}`
}

function codexArchiveShortOperationId(operationId) {
  return String(operationId || '').slice(-8)
}

function recordCodexArchiveStage(event, outcome, context = {}, extra = {}) {
  const abnormal = outcome === 'failed' || outcome === 'indeterminate' || event === 'archive-local-retained'
  runtimeDiagnostics.record({
    level: abnormal ? 'error' : event === 'archive-preflight' || event === 'archive-reconciliation' && outcome === 'started' ? 'debug' : 'info',
    scope: 'archive-transaction',
    event,
    outcome,
    operationId: context.operationId,
    source: context.source,
    provider: 'codex',
    taskRef: companionDiagnosticTaskRef('codex', context.threadId),
    beforePhase: context.beforePhase,
    afterPhase: context.currentPhase,
    terminalAt: context.terminalEpoch,
    semanticRevision: context.currentRevision,
    durationMs: Date.now() - (context.startedAt || Date.now()),
    code: extra.errorCode,
    details: {
      terminalEpoch: Number(context.terminalEpoch) || 0,
      requestedRevision: Number(context.requestedRevision) || 0,
      currentRevision: Number(context.currentRevision) || 0,
      beforePhase: context.beforePhase || '',
      currentPhase: context.currentPhase || '',
      archiveCapability: context.archiveCapability || '',
      providerWriteOutcome: context.providerWriteOutcome || '',
      unarchivedPresent: context.unarchivedPresent,
      archivedPresent: context.archivedPresent,
      desktopBridgeState: context.desktopBridgeState || '',
      desktopSyncOutcome: context.desktopSyncOutcome || '',
      nativeAckOutcome: context.nativeAckOutcome || '',
      verificationAttempt: Number(context.verificationAttempt) || 0,
      finalOutcome: context.finalOutcome || outcome,
      ...extra.details
    }
  })
}

function observeCodexArchiveNativeAck(threadId, source, sourceClientId = '') {
  const pending = codexArchiveNativeAckWaiters.get(threadId)
  if (!pending) return false
  if (source === 'desktop' && sourceClientId && sourceClientId === codexDesktopBridge?.clientId) return true
  if (!pending.ack) pending.ack = { source, observedAt: Date.now() }
  for (const resolve of pending.listeners.splice(0)) resolve(pending.ack)
  return true
}

function waitForCodexArchiveNativeAck(threadId, timeoutMs = CODEX_ARCHIVE_NATIVE_ACK_TIMEOUT_MS) {
  const pending = codexArchiveNativeAckWaiters.get(threadId)
  if (!pending) return Promise.resolve(null)
  if (pending.ack) return Promise.resolve(pending.ack)
  return new Promise((resolve) => {
    const finish = (value) => {
      clearTimeout(timer)
      const index = pending.listeners.indexOf(finish)
      if (index >= 0) pending.listeners.splice(index, 1)
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    timer.unref?.()
    pending.listeners.push(finish)
  })
}

function beginCodexArchiveNativeAck(threadId, operationId) {
  codexLocalArchiveRecoverySuppressions.add(threadId)
  codexArchiveNativeAckWaiters.set(threadId, { operationId, ack: null, listeners: [] })
}

function endCodexArchiveNativeAck(threadId, operationId) {
  const pending = codexArchiveNativeAckWaiters.get(threadId)
  if (!pending || pending.operationId !== operationId) return
  for (const resolve of pending.listeners.splice(0)) resolve(null)
  codexArchiveNativeAckWaiters.delete(threadId)
}

async function verifyCodexArchivePersistence(threadId) {
  const [unarchivedRows, archivedRows] = await Promise.all([
    listAllCodexThreads(false),
    listAllCodexThreads(true)
  ])
  return {
    unarchivedPresent: unarchivedRows.some((row) => row.id === threadId),
    archivedPresent: archivedRows.some((row) => row.id === threadId)
  }
}

function waitCodexArchiveVerificationDelay() {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, CODEX_ARCHIVE_VERIFY_DELAY_MS)
    timer.unref?.()
  })
}

function retainCodexArchiveTask(context, outcome, errorCode, message) {
  context.finalOutcome = outcome
  if (context.lastStage) recordCodexArchiveStage(context.lastStage, outcome, context, { errorCode })
  recordCodexArchiveStage('archive-local-retained', outcome, context, { errorCode })
  try {
    globalThis.utools?.showNotification?.(`${message}（操作 ${codexArchiveShortOperationId(context.operationId)}）`)
  } catch {}
  recordCodexArchiveStage('archive-reconciliation', 'retained', context, { details: { directedVerificationCompleted: context.verificationAttempt > 0 } })
  return { outcome, operationId: context.operationId, errorCode, message: `${message}（操作 ${codexArchiveShortOperationId(context.operationId)}）` }
}

async function commitVerifiedCodexArchive(context) {
  const known = codexActivityInventory.get(context.threadId)
  const archivedKey = typeof known?.key === 'string' ? known.key : ''
  if (!archivedKey) throw codexError('archive-commit-missing', 'Codex archive commit target is missing')
  const committed = companionTaskKernel?.commitArchived?.({
    provider: 'codex',
    key: archivedKey,
    operationId: context.operationId,
    terminalEpoch: context.terminalEpoch,
    membershipRevision: Math.max(Number(context.currentRevision) || 0, Date.now()),
    verified: true
  })
  if (committed?.outcome !== 'archived') throw codexError('archive-kernel-commit-failed', 'Codex archive kernel commit failed')
  const removedKey = codexArchivedActivityKey(context.threadId)
  if (removedKey !== archivedKey) throw codexError('archive-local-cleanup-failed', 'Codex archive local cleanup failed')
  codexLocalArchiveRecoverySuppressions.delete(context.threadId)
  emitCodexActivityDelta([], true, 'urgent', [archivedKey])
  recordCodexArchiveStage('archive-kernel-commit', 'archived', context)
  recordCodexArchiveStage('archive-ui-removal', 'archived', context)
  recordCodexArchiveStage('archive-reconciliation', 'verified', context, { details: { directedVerificationCompleted: true } })
  return archivedKey
}

async function archiveCodexThread(actionAlias, request) {
  const input = codexRecord(request)
  const operationId = codexArchiveOperationId(input.operationId)
  const hintedEntry = typeof actionAlias === 'string' ? codexThreadActions.get(actionAlias) : null
  const context = {
    operationId,
    source: typeof input.source === 'string' ? input.source : 'archive-button',
    threadId: validCodexThreadId(hintedEntry?.threadId) ? hintedEntry.threadId : '',
    startedAt: Date.now(),
    requestedRevision: Number(input.requestedRevisionAt || input.expectedRevisionAt) || 0,
    currentRevision: 0,
    terminalEpoch: Number(input.expectedLastTurnStartedAt) || 0,
    beforePhase: input.evidence === 'stopped' ? 'stopped' : 'completed',
    currentPhase: input.evidence === 'stopped' ? 'stopped' : 'completed',
    archiveCapability: 'requested',
    providerWriteOutcome: 'not-started',
    desktopBridgeState: 'not-checked',
    desktopSyncOutcome: 'not-started',
    nativeAckOutcome: 'not-started',
    verificationAttempt: 0,
    lastStage: 'archive-preflight'
  }
  if (input.intentRecorded !== true) recordCodexArchiveStage('archive-intent', 'started', context)
  if (input.confirmationRecorded !== true) recordCodexArchiveStage('archive-confirmation-confirmed', 'confirmed', context)
  const expectedUpdatedAt = Number.isFinite(input.expectedUpdatedAt) && input.expectedUpdatedAt > 0 ? input.expectedUpdatedAt : 0
  const expectedRevisionAt = Number.isFinite(input.expectedRevisionAt) && input.expectedRevisionAt > 0 ? input.expectedRevisionAt : 0
  const expectedCompletionAt = Number.isFinite(input.expectedCompletionAt) && input.expectedCompletionAt > 0 ? input.expectedCompletionAt : 0
  const expectedLastTurnStartedAt = Number.isFinite(input.expectedLastTurnStartedAt) && input.expectedLastTurnStartedAt > 0 ? input.expectedLastTurnStartedAt : 0
  const expectedSourceFingerprint = typeof input.expectedSourceFingerprint === 'string' && /^[a-f0-9]{64}$/.test(input.expectedSourceFingerprint) ? input.expectedSourceFingerprint : ''
  const evidence = input.evidence === 'completed' || input.evidence === 'stopped' ? input.evidence : ''
  const requestIsValid = typeof actionAlias === 'string'
    && /^ct_[A-Za-z0-9_-]{16,80}$/.test(actionAlias)
    && expectedUpdatedAt > 0
    && expectedRevisionAt > 0
    && expectedLastTurnStartedAt > 0
    && Boolean(expectedSourceFingerprint)
    && Boolean(evidence)
    && (evidence !== 'stopped' || expectedCompletionAt === 0)
    && expectedRevisionAt === (expectedCompletionAt || expectedLastTurnStartedAt)
  if (!requestIsValid) {
    return retainCodexArchiveTask(context, 'failed', 'invalid-request', '归档请求已失效，任务已保留')
  }
  const entry = codexThreadActions.get(actionAlias)
  if (!entry || entry.expiresAt <= Date.now() || !validCodexThreadId(entry.threadId)) {
    codexThreadActions.delete(actionAlias)
    return retainCodexArchiveTask(context, 'failed', 'expired-alias', '任务动作已过期，任务已保留')
  }
  context.threadId = entry.threadId
  context.lastStage = 'archive-preflight'
  try {
    const registry = readCodexNativeRegistry()
    if (registry.fingerprint !== expectedSourceFingerprint || entry.sourceFingerprint !== expectedSourceFingerprint) {
      return retainCodexArchiveTask(context, 'failed', 'source-changed', 'Codex 项目状态已更新，未执行归档')
    }
    const [threadResult, turnPage] = await Promise.all([
      requestCodexRpc('thread/read', { threadId: entry.threadId, includeTurns: false }),
      requestCodexRpc('thread/turns/list', { threadId: entry.threadId, limit: 1, sortDirection: 'desc', itemsView: 'notLoaded' }, CODEX_THREAD_TURN_STATUS_TIMEOUT_MS)
    ])
    const response = codexRecord(threadResult)
    const thread = codexRecord(response.thread)
    const status = codexRecord(thread.status).type
    const recencyAt = codexTimestampMs(thread.recencyAt) || codexTimestampMs(thread.updatedAt) || 0
    const turnPageSource = codexRecord(turnPage)
    const turnRows = Array.isArray(turnPageSource.data) ? turnPageSource.data : null
    const turn = sanitizeCodexTurnStatusPage(turnPage)
    const native = codexThreadNativeProject(thread, registry)
    const validStatus = ['active', 'idle', 'notLoaded', 'systemError'].includes(status)
    const validTurnShape = turnRows !== null && (turnRows.length === 0 || Boolean(turn))
    context.currentRevision = Math.max(recencyAt, Number(turn?.completedAt) || 0, Number(turn?.startedAt) || 0)
    context.terminalEpoch = Number(turn?.startedAt) || context.terminalEpoch
    context.desktopBridgeState = codexEnsureDesktopBridge().state
    recordCodexArchiveStage('archive-preflight', 'observed', context, {
      details: { providerStatus: status, turnStatus: turn?.status || '', projectMatched: native?.project.key === entry.projectKey }
    })
    if (thread.id !== entry.threadId || !validStatus || recencyAt <= 0 || recencyAt !== expectedUpdatedAt || !validTurnShape || !native || native.project.key !== entry.projectKey) {
      return retainCodexArchiveTask(context, 'failed', 'state-changed', '任务状态已更新，未执行归档')
    }
    if (!turn || turn.startedAt !== expectedLastTurnStartedAt) {
      return retainCodexArchiveTask(context, 'failed', 'turn-changed', '任务最新提问已更新，未执行归档')
    }
    const desktopBridge = codexEnsureDesktopBridge()
    const desktopActivity = desktopBridge.activityForThread(entry.threadId)
    const currentActivity = codexActivityInventory.get(entry.threadId)
    const exactInterruptedTerminal = evidence === 'stopped'
      && turn?.status === 'interrupted'
      && currentActivity?.lastTurnStatus === 'interrupted'
      && currentActivity.lastTurnStartedAt === turn.startedAt
      && codexIsConfirmedTurnEvidence(currentActivity.lastTurnEvidence)
      && (!currentActivity.activeEvidenceSequence
        || !currentActivity.terminalEvidenceSequence
        || currentActivity.terminalEvidenceSequence >= currentActivity.activeEvidenceSequence)
      && !currentActivity.activeFlags?.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
    if (!exactInterruptedTerminal
      && (desktopActivity?.status === 'active' || status === 'active' || turn?.status === 'inProgress')) {
      return evidence === 'stopped'
        ? retainCodexArchiveTask(context, 'failed', 'state-changed', '任务已恢复进行中，未执行归档')
        : retainCodexArchiveTask(context, 'failed', 'active-task', '任务已恢复进行中，未执行归档')
    }
    if (evidence === 'completed') {
      if (turn.status !== 'completed' || (turn.completedAt || turn.startedAt) !== expectedRevisionAt || (expectedCompletionAt > 0 && turn.completedAt !== expectedCompletionAt)) {
        return retainCodexArchiveTask(context, 'failed', 'completion-changed', '任务完成版本已更新，未执行归档')
      }
    } else {
      const stoppedBoundary = exactInterruptedTerminal
        || (turn.status === 'failed' || turn.status === 'interrupted')
          && (desktopActivity?.status === 'idle' || desktopBridge.state === 'not-running')
      if (!stoppedBoundary || turn.startedAt !== expectedRevisionAt) {
        return retainCodexArchiveTask(context, 'failed', 'state-changed', '任务已不再满足待继续归档边界，未执行归档')
      }
    }
    context.archiveCapability = 'verified'
    recordCodexArchiveStage('archive-preflight', 'verified', context)
    beginCodexArchiveNativeAck(entry.threadId, operationId)
    context.lastStage = 'archive-provider-write'
    await requestCodexRpc('thread/archive', { threadId: entry.threadId })
    context.providerWriteOutcome = 'completed'
    recordCodexArchiveStage('archive-provider-write', 'completed', context)

    context.lastStage = 'archive-server-verify-1'
    context.verificationAttempt = 1
    const verify1 = await verifyCodexArchivePersistence(entry.threadId)
    Object.assign(context, verify1)
    if (verify1.unarchivedPresent || !verify1.archivedPresent) {
      return retainCodexArchiveTask(context, 'indeterminate', 'archive-verify-1-failed', 'Codex 第一次持久化核验未通过，任务已保留')
    }
    recordCodexArchiveStage('archive-server-verify-1', 'verified', context)

    context.lastStage = 'archive-desktop-sync'
    const desktopRunning = desktopBridge.state === 'connected'
      ? true
      : desktopBridge.state === 'not-running' ? false : await codexDesktopIsRunning()
    context.desktopBridgeState = desktopRunning ? desktopBridge.state : 'not-running'
    if (context.desktopBridgeState === 'connected') {
      context.desktopSyncOutcome = await desktopBridge.notifyThreadArchived(
        entry.threadId,
        typeof thread.cwd === 'string' ? thread.cwd : ''
      )
      if (context.desktopSyncOutcome !== 'dispatched') {
        return retainCodexArchiveTask(context, 'indeterminate', 'archive-desktop-sync-failed', 'Codex 桌面同步未确认，任务已保留')
      }
      recordCodexArchiveStage('archive-desktop-sync', 'dispatched', context)
      context.lastStage = 'archive-native-ack'
      const nativeAck = await waitForCodexArchiveNativeAck(entry.threadId)
      context.nativeAckOutcome = nativeAck ? `acknowledged:${nativeAck.source}` : 'timeout'
      if (!nativeAck) {
        return retainCodexArchiveTask(context, 'indeterminate', 'archive-native-ack-timeout', 'Codex 原生归档确认超时，任务已保留')
      }
      recordCodexArchiveStage('archive-native-ack', 'acknowledged', context)
    } else if (context.desktopBridgeState === 'not-running') {
      context.desktopSyncOutcome = 'not-running'
      context.nativeAckOutcome = 'not-required'
      recordCodexArchiveStage('archive-desktop-sync', 'not-required', context)
    } else {
      context.desktopSyncOutcome = desktopBridge.state || 'failed'
      return retainCodexArchiveTask(context, 'indeterminate', 'archive-desktop-state-indeterminate', 'Codex 桌面连接状态无法确认，任务已保留')
    }

    await waitCodexArchiveVerificationDelay()
    context.lastStage = 'archive-server-verify-2'
    context.verificationAttempt = 2
    const verify2 = await verifyCodexArchivePersistence(entry.threadId)
    Object.assign(context, verify2)
    if (verify2.unarchivedPresent || !verify2.archivedPresent) {
      return retainCodexArchiveTask(context, 'indeterminate', 'archive-verify-2-failed', 'Codex 第二次持久化核验未通过，任务已保留')
    }
    recordCodexArchiveStage('archive-server-verify-2', 'verified', context)

    context.lastStage = 'archive-kernel-commit'
    await commitVerifiedCodexArchive(context)
    context.finalOutcome = 'archived'
    return {
      outcome: 'archived',
      operationId,
      desktopSync: context.desktopSyncOutcome,
      nativeAck: context.nativeAckOutcome,
      message: `已确认原生归档（操作 ${codexArchiveShortOperationId(operationId)}）`
    }
  } catch (error) {
    const source = codexRecord(error)
    return retainCodexArchiveTask(
      context,
      context.providerWriteOutcome === 'completed' ? 'indeterminate' : 'failed',
      typeof source.code === 'string' ? source.code : 'archive-failed',
      'Codex 任务归档失败，任务已保留'
    )
  } finally {
    if (context.threadId) {
      endCodexArchiveNativeAck(context.threadId, operationId)
      // The recovery suppression only protects an archive write whose native
      // result may already be persisted. Once the Provider write never
      // completed, or an authoritative verification still sees the thread in
      // the unarchived inventory, a later real Desktop archive must be allowed
      // through the external-membership recovery lane.
      if (context.providerWriteOutcome !== 'completed' || context.unarchivedPresent === true) {
        codexLocalArchiveRecoverySuppressions.delete(context.threadId)
      }
    }
  }
}

async function archiveCodexProject(actionAlias, request) {
  const input = codexRecord(request)
  const operationId = codexArchiveOperationId(input.operationId)
  const projectArchiveSource = typeof input.source === 'string' ? input.source : 'project-archive'
  if (input.intentRecorded !== true) {
    runtimeDiagnostics.record({
      level: 'info',
      scope: 'archive-transaction',
      event: 'archive-intent',
      outcome: 'started',
      operationId,
      source: projectArchiveSource,
      provider: 'codex',
      details: { mode: 'project' }
    })
  }
  if (input.confirmationRecorded !== true) {
    runtimeDiagnostics.record({
      level: 'info',
      scope: 'archive-transaction',
      event: 'archive-confirmation-confirmed',
      outcome: 'confirmed',
      operationId,
      source: projectArchiveSource,
      provider: 'codex',
      details: { mode: 'project', owner: 'provider-boundary' }
    })
  }
  const expectedSourceFingerprint = typeof input.expectedSourceFingerprint === 'string' && /^[a-f0-9]{64}$/.test(input.expectedSourceFingerprint) ? input.expectedSourceFingerprint : ''
  const emptyResult = (errorCode, message) => ({
    outcome: 'failed',
    archivedKeys: [],
    skippedActiveKeys: [],
    failed: [],
    desktopSyncedKeys: [],
    desktopSyncFailedKeys: [],
    errorCode,
    message
  })
  if (typeof actionAlias !== 'string' || !/^cp_[A-Za-z0-9_-]{16,80}$/.test(actionAlias) || !expectedSourceFingerprint) {
    return emptyResult('invalid-request', '项目归档请求已失效，请刷新后重试')
  }
  const action = codexProjectActions.get(actionAlias)
  if (!action || action.expiresAt <= Date.now()) {
    codexProjectActions.delete(actionAlias)
    return emptyResult('expired-alias', '项目动作已过期，请刷新后重试')
  }
  try {
    const registry = readCodexNativeRegistry()
    if (registry.fingerprint !== expectedSourceFingerprint || action.sourceFingerprint !== expectedSourceFingerprint) {
      return emptyResult('source-changed', 'Codex 项目状态已更新，未执行批量归档')
    }
    const unarchivedRows = await listAllCodexThreads(false)
    const candidates = []
    for (const thread of unarchivedRows) {
      const native = codexThreadNativeProject(thread, registry)
      if (native?.project.key === action.projectKey) candidates.push(thread)
    }
    const archivedKeys = []
    const skippedActiveKeys = []
    const failed = []
    const desktopSyncedKeys = []
    const desktopSyncFailedKeys = []
    for (let batchStart = 0; batchStart < candidates.length; batchStart += 20) {
      if (readCodexNativeRegistry().fingerprint !== expectedSourceFingerprint) {
        for (const thread of candidates.slice(batchStart)) failed.push({ key: codexThreadKey(thread.id), errorCode: 'source-changed' })
        break
      }
      const batch = candidates.slice(batchStart, batchStart + 20)
      const queue = [...batch]
      const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
        for (;;) {
          const listedThread = queue.shift()
          if (!listedThread) return
          const key = codexThreadKey(listedThread.id)
          try {
            const [threadResult, turnPage] = await Promise.all([
              requestCodexRpc('thread/read', { threadId: listedThread.id, includeTurns: false }),
              requestCodexRpc('thread/turns/list', { threadId: listedThread.id, limit: 1, sortDirection: 'desc', itemsView: 'notLoaded' }, CODEX_THREAD_TURN_STATUS_TIMEOUT_MS)
            ])
            const thread = codexRecord(codexRecord(threadResult).thread)
            const turnSource = codexRecord(turnPage)
            if (!Array.isArray(turnSource.data)) throw codexError('protocol-error', 'Codex latest Turn response is invalid')
            const turn = turnSource.data.length ? sanitizeCodexTurnStatusPage(turnPage) : null
            if (turnSource.data.length && (!turn || !turn.startedAt)) throw codexError('protocol-error', 'Codex latest Turn is missing startedAt')
            const status = codexRecord(thread.status).type
            const native = codexThreadNativeProject(thread, registry)
            const listedRecency = codexTimestampMs(listedThread.recencyAt) || codexTimestampMs(listedThread.updatedAt) || 0
            const currentRecency = codexTimestampMs(thread.recencyAt) || codexTimestampMs(thread.updatedAt) || 0
            if (thread.id !== listedThread.id || !native || native.project.key !== action.projectKey || !listedRecency || currentRecency !== listedRecency) {
              failed.push({ key, errorCode: 'state-changed' })
              continue
            }
            const desktopActivity = codexEnsureDesktopBridge().activityForThread(listedThread.id)
            if (desktopActivity?.status === 'active' || status === 'active' || turn?.status !== 'completed') {
              skippedActiveKeys.push(key)
              continue
            }
            const alias = codexThreadAlias(listedThread.id, Date.now(), {
              projectKey: action.projectKey,
              sourceFingerprint: expectedSourceFingerprint,
              cwd: codexNormalizeNativeRoot(thread.cwd)
            })
            const result = await archiveCodexThread(alias.alias, {
              expectedUpdatedAt: currentRecency,
              expectedRevisionAt: turn.completedAt || turn.startedAt,
              ...(turn.completedAt ? { expectedCompletionAt: turn.completedAt } : {}),
              expectedLastTurnStartedAt: turn.startedAt,
              expectedSourceFingerprint,
              evidence: 'completed',
              operationId: `${operationId}:${key.slice(0, 12)}`,
              source: 'project-archive'
            })
            if (result.outcome === 'archived') {
              archivedKeys.push(key)
              if (result.desktopSync === 'dispatched' || result.desktopSync === 'not-running') desktopSyncedKeys.push(key)
            } else {
              failed.push({ key, errorCode: result.errorCode || 'archive-not-verified' })
              desktopSyncFailedKeys.push(key)
            }
          } catch (error) {
            failed.push({ key, errorCode: typeof codexRecord(error).code === 'string' ? codexRecord(error).code : 'archive-failed' })
          }
        }
      })
      await Promise.all(workers)
    }
    const outcome = failed.length ? archivedKeys.length || skippedActiveKeys.length ? 'partial' : 'failed' : 'complete'
    return { outcome, archivedKeys, skippedActiveKeys, failed, desktopSyncedKeys, desktopSyncFailedKeys }
  } catch (error) {
    return emptyResult(typeof codexRecord(error).code === 'string' ? codexRecord(error).code : 'archive-failed', '项目批量归档失败，请刷新后重试')
  }
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

async function openCodexThread(actionAlias) {
  if (typeof actionAlias !== 'string' || !/^ct_[A-Za-z0-9_-]{16,80}$/.test(actionAlias)) return { outcome: 'failed', errorCode: 'invalid-alias', message: '线程动作已失效' }
  const entry = codexThreadActions.get(actionAlias)
  if (!entry || entry.expiresAt <= Date.now() || !validCodexThreadId(entry.threadId)) {
    codexThreadActions.delete(actionAlias)
    return { outcome: 'failed', errorCode: 'expired-alias', message: '线程动作已过期，请刷新后重试' }
  }
  const target = `codex://threads/${encodeURIComponent(entry.threadId)}`
  const shell = electronShell()
  if (shell && typeof shell.openExternal === 'function') {
    try {
      await withFileActionTimeout(shell.openExternal(target))
      codexDesktopBridge?.markThreadOpenedRead(entry.threadId, entry.threadId)
      return { outcome: 'opened' }
    } catch {
      return { outcome: 'failed', errorCode: 'open-failed', message: 'Codex 线程打开失败' }
    }
  }
  try {
    if (globalThis.utools && typeof globalThis.utools.shellOpenExternal === 'function') {
      const dispatched = globalThis.utools.shellOpenExternal(target)
      if (dispatched === false) throw new Error('shellOpenExternal rejected')
      codexDesktopBridge?.markThreadOpenedRead(entry.threadId, entry.threadId)
      return { outcome: 'dispatched', message: '已交给系统打开' }
    }
  } catch {}
  return { outcome: 'failed', errorCode: 'unsupported', message: '当前宿主不支持打开 Codex 线程' }
}

async function openCodexBlank() {
  const target = 'codex://new'
  const shell = electronShell()
  if (shell && typeof shell.openExternal === 'function') {
    try {
      await withFileActionTimeout(shell.openExternal(target))
      return { outcome: 'opened' }
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
    if (opened.outcome === 'opened' || opened.outcome === 'dispatched') return { outcome: 'opened', modelId, retryAllowed: false }
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

function codexFloatAlive() {
  if (!codexFloatWindow) return false
  try {
    return typeof codexFloatWindow.isDestroyed !== 'function' || !codexFloatWindow.isDestroyed()
  } catch {
    return false
  }
}

function applyCodexFloatWorkspaceVisibility() {
  const diagnostics = {
    supported: process.platform === 'darwin',
    alwaysOnTop: false,
    allWorkspaces: false,
    visibleOnFullScreen: false,
    checkedAt: Date.now(),
    errorCode: ''
  }
  if (!codexFloatAlive()) {
    codexFloatWorkspaceDiagnostics = { ...diagnostics, errorCode: 'window-unavailable' }
    return false
  }
  try {
    codexFloatWindow.setAlwaysOnTop(true, 'floating')
    diagnostics.alwaysOnTop = typeof codexFloatWindow.isAlwaysOnTop === 'function' ? codexFloatWindow.isAlwaysOnTop() === true : true
  } catch {
    diagnostics.errorCode = 'always-on-top-failed'
  }
  if (process.platform !== 'darwin') {
    codexFloatWorkspaceDiagnostics = { ...diagnostics, errorCode: diagnostics.errorCode || 'unsupported' }
    return diagnostics.alwaysOnTop
  }
  if (typeof codexFloatWindow.setVisibleOnAllWorkspaces !== 'function') {
    codexFloatWorkspaceDiagnostics = { ...diagnostics, errorCode: diagnostics.errorCode || 'all-workspaces-unavailable' }
    return false
  }
  try {
    codexFloatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    diagnostics.allWorkspaces = true
    diagnostics.visibleOnFullScreen = true
  } catch {
    diagnostics.errorCode = diagnostics.errorCode || 'all-workspaces-failed'
  }
  codexFloatWorkspaceDiagnostics = diagnostics
  return diagnostics.alwaysOnTop && diagnostics.allWorkspaces && diagnostics.visibleOnFullScreen
}

function getCodexFloatWorkspaceDiagnostics() {
  return {
    ...codexFloatWorkspaceDiagnostics,
    health: {
      alive: codexFloatAlive(),
      persistent: codexFloatPersistent,
      lastHeartbeatAt: codexFloatLastHeartbeatAt,
      lastRecreateAt: codexFloatLastRecreateAt,
      recoveryDeadline: codexFloatRecoveryDeadline,
      interaction: codexFloatResize ? 'resize' : codexFloatDrag ? 'drag' : 'idle'
    }
  }
}

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

function clampFloatBounds(bounds, display) {
  const area = display.workArea || display.bounds || { x: 0, y: 0, width: 1440, height: 900 }
  const areaWidth = Math.max(1, Math.round(area.width))
  const areaHeight = Math.max(1, Math.round(area.height))
  const marginX = areaWidth >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
  const marginY = areaHeight >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
  const requestedWidth = Number.isFinite(bounds.width) ? Math.round(bounds.width) : 72
  const requestedHeight = Number.isFinite(bounds.height) ? Math.round(bounds.height) : 72
  const width = Math.max(1, Math.min(Math.max(72, requestedWidth), areaWidth - marginX * 2))
  const height = Math.max(1, Math.min(Math.max(72, requestedHeight), areaHeight - marginY * 2))
  const minX = area.x + marginX
  const minY = area.y + marginY
  const maxX = area.x + areaWidth - width - marginX
  const maxY = area.y + areaHeight - height - marginY
  const requestedX = Number.isFinite(bounds.x) ? Math.round(bounds.x) : minX
  const requestedY = Number.isFinite(bounds.y) ? Math.round(bounds.y) : minY
  return { x: Math.min(maxX, Math.max(minX, requestedX)), y: Math.min(maxY, Math.max(minY, requestedY)), width, height }
}

function nearestFloatEdge(bounds, display) {
  const area = display.workArea || display.bounds
  const distances = [
    ['left', Math.abs(bounds.x - area.x)],
    ['right', Math.abs(area.x + area.width - (bounds.x + bounds.width))],
    ['top', Math.abs(bounds.y - area.y)],
    ['bottom', Math.abs(area.y + area.height - (bounds.y + bounds.height))]
  ]
  distances.sort((a, b) => a[1] - b[1])
  return distances[0][0]
}

function snapFloatBounds(bounds, display) {
  const area = display.workArea || display.bounds
  const next = clampFloatBounds(bounds, display)
  const edge = nearestFloatEdge(next, display)
  const marginX = area.width >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
  const marginY = area.height >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
  if (edge === 'left') next.x = area.x + marginX
  if (edge === 'right') next.x = area.x + area.width - next.width - marginX
  if (edge === 'top') next.y = area.y + marginY
  if (edge === 'bottom') next.y = area.y + area.height - next.height - marginY
  return { bounds: next, edge }
}

function codexFloatCollapsedSize(snapshot) {
  return codexRecord(snapshot).style === 'card'
    ? { ...CODEX_FLOAT_CARD_SIZE }
    : { ...CODEX_FLOAT_WATER_SIZE }
}

function codexFloatExpandedHeight(snapshot) {
  const source = codexRecord(snapshot)
  const quota = codexRecord(source.quota)
  const conversations = codexRecord(source.conversations)
  const expandedFields = new Set(Array.isArray(source.expandedFields) ? source.expandedFields : [])

  // Root padding + header + footer, with a small rendering allowance. Content
  // blocks below mirror the renderer's actual one-row quota grid and compact
  // empty-task treatment so an empty inbox does not create a blank panel.
  let height = 151
  let visibleQuotaBuckets = 0
  const quotaFieldEnabled = expandedFields.has('short') || expandedFields.has('weekly')
  if (expandedFields.has('short') && quota.short && typeof quota.short === 'object') visibleQuotaBuckets += 1
  if (expandedFields.has('weekly') && quota.weekly && typeof quota.weekly === 'object') visibleQuotaBuckets += 1
  if (visibleQuotaBuckets > 0) height += expandedFields.has('reset') ? 82 : 64
  else if (quotaFieldEnabled) height += 64
  if (expandedFields.has('config')) height += 38

  if (source.conversationInboxEnabled === true && expandedFields.has('tasks')) {
    const ongoingCount = Array.isArray(conversations.ongoing) ? conversations.ongoing.length : 0
    const stoppedCount = Array.isArray(conversations.stopped) ? conversations.stopped.length : 0
    const hiddenCount = Array.isArray(conversations.hidden) ? conversations.hidden.length : 0
    const completedUnreadCount = Array.isArray(conversations.completedUnread)
      ? conversations.completedUnread.length
      : Array.isArray(conversations.pending) ? conversations.pending.length : 0
    const completedCount = Array.isArray(conversations.completed) ? conversations.completed.length : 0
    const taskCount = Math.max(ongoingCount + stoppedCount, hiddenCount, completedUnreadCount + completedCount)
    height += 69
    if (taskCount === 0) height += 30
    else height += taskCount * 48 + Math.max(0, taskCount - 1) * 5
  }

  return Math.max(CODEX_FLOAT_EXPANDED_MIN_HEIGHT, Math.min(CODEX_FLOAT_EXPANDED_MAX_HEIGHT, height))
}

function normalizeCodexExpandedSizes(value) {
  if (!Array.isArray(value)) return []
  const byDisplay = new Map()
  for (const item of value) {
    const source = codexRecord(item)
    const displayId = typeof source.displayId === 'string' ? source.displayId.slice(0, 120) : ''
    if (!displayId || !Number.isFinite(source.width) || !Number.isFinite(source.height) || !Number.isFinite(source.updatedAt)) continue
    const entry = {
      displayId,
      width: Math.max(CODEX_FLOAT_EXPANDED_MIN_WIDTH, Math.round(source.width)),
      height: Math.max(CODEX_FLOAT_EXPANDED_MIN_HEIGHT, Math.round(source.height)),
      updatedAt: Math.max(0, Math.round(source.updatedAt))
    }
    const previous = byDisplay.get(displayId)
    if (!previous || entry.updatedAt >= previous.updatedAt) byDisplay.set(displayId, entry)
  }
  return [...byDisplay.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)
}

function clampCodexExpandedSize(size, display) {
  const area = display?.workArea || display?.bounds || { x: 0, y: 0, width: 1440, height: 900 }
  const maxWidth = Math.max(1, Math.round(area.width) - CODEX_FLOAT_MARGIN * 2)
  const maxHeight = Math.max(1, Math.round(area.height) - CODEX_FLOAT_MARGIN * 2)
  return {
    width: Math.min(maxWidth, Math.max(Math.min(CODEX_FLOAT_EXPANDED_MIN_WIDTH, maxWidth), Math.round(size.width))),
    height: Math.min(maxHeight, Math.max(Math.min(CODEX_FLOAT_EXPANDED_MIN_HEIGHT, maxHeight), Math.round(size.height)))
  }
}

function codexFloatExpandedPreference(display) {
  const displayId = String(display?.id || '')
  const exact = codexFloatExpandedSizes.find((entry) => entry.displayId === displayId)
  if (exact) return exact
  if (codexFloatPositionDisplayId && codexFloatPositionDisplayId === displayId) return null
  return codexFloatExpandedSizes[0] || null
}

function codexFloatDesiredSize(snapshot, expanded, display) {
  if (!expanded) return codexFloatCollapsedSize(snapshot)
  const preferred = codexFloatExpandedPreference(display)
  return clampCodexExpandedSize(preferred || { width: CODEX_FLOAT_EXPANDED_WIDTH, height: codexFloatExpandedHeight(snapshot) }, display)
}

function codexFloatResizeCorner(bounds, display, edge) {
  const area = display.workArea || display.bounds
  const vertical = bounds.y + bounds.height / 2 <= area.y + area.height / 2 ? 'bottom' : 'top'
  const horizontal = bounds.x + bounds.width / 2 <= area.x + area.width / 2 ? 'right' : 'left'
  if (edge === 'left') return `${vertical}-right`
  if (edge === 'right') return `${vertical}-left`
  if (edge === 'top') return `bottom-${horizontal}`
  return `top-${horizontal}`
}

function validCodexResizeCorner(value) {
  return value === 'top-left' || value === 'top-right' || value === 'bottom-left' || value === 'bottom-right'
}

function validCodexFloatEdge(edge) {
  return edge === 'left' || edge === 'right' || edge === 'top' || edge === 'bottom'
}

function alignFloatBoundsToEdge(bounds, display, edge) {
  const area = display.workArea || display.bounds
  const next = clampFloatBounds(bounds, display)
  const marginX = area.width >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
  const marginY = area.height >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
  if (edge === 'left') next.x = area.x + marginX
  if (edge === 'right') next.x = area.x + area.width - next.width - marginX
  if (edge === 'top') next.y = area.y + marginY
  if (edge === 'bottom') next.y = area.y + area.height - next.height - marginY
  return clampFloatBounds(next, display)
}

function resizeFloatBounds(current, size, display, preferredEdge) {
  const edge = validCodexFloatEdge(preferredEdge) ? preferredEdge : nearestFloatEdge(current, display)
  const next = { x: current.x, y: current.y, width: size.width, height: size.height }
  if (edge === 'right') next.x = current.x + current.width - size.width
  if (edge === 'bottom') next.y = current.y + current.height - size.height
  return { bounds: alignFloatBoundsToEdge(next, display, edge), edge }
}

function codexFloatTaskPackageRevision(taskPackage) {
  const revision = Number(codexRecord(taskPackage).packageRevision)
  return Number.isInteger(revision) && revision > 0 ? revision : 0
}

function clearCodexFloatTaskAckTimer() {
  if (codexFloatTaskAckTimer) clearTimeout(codexFloatTaskAckTimer)
  codexFloatTaskAckTimer = null
}

function resetCodexFloatTaskLane() {
  clearCodexFloatTaskAckTimer()
  codexFloatBaseLastSentRevision = 0
  codexFloatTaskLastSentRevision = 0
  codexFloatTaskAppliedRevision = 0
  codexFloatTaskPendingRevision = 0
  codexFloatTaskSendAttempts = 0
  codexFloatTaskPendingStartedAt = 0
}

function armCodexFloatTaskAck(taskPackage, revision, attempt) {
  clearCodexFloatTaskAckTimer()
  if (!revision || revision <= codexFloatTaskAppliedRevision) return
  if (revision !== codexFloatTaskPendingRevision) {
    codexFloatTaskPendingRevision = revision
    codexFloatTaskPendingStartedAt = Date.now()
    codexFloatTaskSendAttempts = 0
  }
  codexFloatTaskSendAttempts = Math.max(codexFloatTaskSendAttempts, attempt)
  codexFloatTaskAckTimer = setTimeout(() => {
    codexFloatTaskAckTimer = null
    if (codexFloatTaskAppliedRevision >= revision || codexFloatTaskPendingRevision !== revision) return
    const latest = companionTaskKernel?.getLatest?.() || companionTaskKernel?.getPackage?.() || taskPackage
    const latestRevision = codexFloatTaskPackageRevision(latest)
    if (codexFloatTaskSendAttempts < 2) {
      pushCodexFloatTaskPackage(latest, { force: true })
      return
    }
    const elapsed = Date.now() - codexFloatTaskPendingStartedAt
    const heartbeatHealthy = codexFloatLastHeartbeatAt > 0
      && Date.now() - codexFloatLastHeartbeatAt <= CODEX_FLOAT_HEARTBEAT_MS * 2
    runtimeDiagnostics.record({
      level: 'error',
      scope: 'float-bridge',
      event: 'task-package-ack',
      outcome: 'missing',
      code: heartbeatHealthy ? 'applied-ack-missing' : 'heartbeat-unhealthy',
      durationMs: elapsed,
      count: latestRevision
    })
    if (heartbeatHealthy && elapsed >= 1_000) requestCodexFloatRecreate('task-package-ack-missing')
  }, 500)
  codexFloatTaskAckTimer?.unref?.()
}

function pushCodexFloatTaskPackage(taskPackage, options = {}) {
  if (!codexFloatAlive()) return false
  const revision = codexFloatTaskPackageRevision(taskPackage)
  if (!revision || revision <= codexFloatTaskAppliedRevision) return false
  const force = codexRecord(options).force === true
  if (!force && revision <= codexFloatTaskLastSentRevision) return false
  const attempt = revision === codexFloatTaskPendingRevision ? codexFloatTaskSendAttempts + 1 : 1
  try {
    codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.taskPackage, {
      taskPackage,
      sentRevision: revision,
      sentAt: Date.now()
    })
    codexFloatTaskLastSentRevision = Math.max(codexFloatTaskLastSentRevision, revision)
    armCodexFloatTaskAck(taskPackage, revision, attempt)
    runtimeDiagnostics.record({
      level: 'debug',
      scope: 'float-bridge',
      event: 'task-package-send',
      outcome: force ? 'resent' : 'sent',
      count: revision,
      cache: 'process-package'
    })
    return true
  } catch {
    runtimeDiagnostics.record({ scope: 'float-bridge', event: 'task-package-send', outcome: 'failed', code: 'send-failed', level: 'error', count: revision })
    return false
  }
}

function pushCodexFloatSnapshot(options = {}) {
  if (!codexFloatAlive() || !codexFloatSnapshot) return false
  const baseRevision = Number(codexFloatSnapshot.baseRevision) || 0
  if (codexRecord(options).force !== true
    && baseRevision > 0
    && baseRevision <= codexFloatBaseLastSentRevision) return false
  const startedAt = Date.now()
  try {
    const taskPackage = codexFloatSnapshot.companionTaskPackage
    const revision = codexFloatTaskPackageRevision(taskPackage)
    const outboundSnapshot = codexFloatTaskLastSentRevision > 0
      ? (({ companionTaskPackage: _taskPackage, ...snapshotWithoutTasks }) => snapshotWithoutTasks)(codexFloatSnapshot)
      : codexFloatSnapshot
    codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.snapshot, outboundSnapshot)
    if (baseRevision > 0) codexFloatBaseLastSentRevision = Math.max(codexFloatBaseLastSentRevision, baseRevision)
    if (revision > 0 && codexFloatTaskLastSentRevision === 0) {
      codexFloatTaskLastSentRevision = revision
      armCodexFloatTaskAck(taskPackage, revision, 1)
    }
    pushCodexFloatState()
    runtimeDiagnostics.record({
      level: 'debug',
      scope: 'float-bridge',
      event: 'snapshot-send',
      outcome: 'sent',
      durationMs: Date.now() - startedAt,
      slowMs: 50,
      count: Number(codexFloatSnapshot?.companionTaskPackage?.tasks?.length) || 0,
      cache: 'process-package'
    })
    return true
  } catch {
    runtimeDiagnostics.record({ scope: 'float-bridge', event: 'snapshot-send', outcome: 'failed', code: 'send-failed', durationMs: Date.now() - startedAt, level: 'error' })
    return false
  }
}

function pushCodexFloatState() {
  if (!codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return false
  try {
    const bounds = codexFloatWindow.getBounds()
    const display = floatDisplayForPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
    const preference = codexFloatExpandedPreference(display)
      codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.state, {
        expanded: codexFloatExpanded,
        pinned: codexFloatPinned,
        resizing: Boolean(codexFloatResize),
      resizeCorner: codexFloatExpanded ? codexFloatResizeCorner(bounds, display, codexFloatEdge) : null,
      expandedSize: codexFloatExpanded ? {
        displayId: String(display.id || ''),
        width: bounds.width,
        height: bounds.height,
        manual: Boolean(preference)
      } : null
    })
    return true
  } catch {
    return false
  }
}

function initialCodexFloatBounds(position) {
  const display = floatDisplayForPosition(position)
  const area = display.workArea || display.bounds
  const size = codexFloatDesiredSize(codexFloatSnapshot, false, display)
  const fallback = { x: area.x + area.width - size.width - CODEX_FLOAT_MARGIN, y: area.y + Math.round((area.height - size.height) / 2), ...size }
  const requested = position && Number.isFinite(position.x) && Number.isFinite(position.y)
    ? { x: position.x, y: position.y, ...size }
    : fallback
  const requestedEdge = position && validCodexFloatEdge(position.edge) ? position.edge : 'right'
  return { display, bounds: alignFloatBoundsToEdge(requested, display, requestedEdge), edge: requestedEdge }
}

function codexFloatDevelopmentEntry() {
  const href = typeof globalThis.location?.href === 'string' ? globalThis.location.href : ''
  return /^http:\/\/127\.0\.0\.1:8092(?:\/|$)/.test(href)
    ? 'http://127.0.0.1:8092/float.html'
    : ''
}

function createCodexFloat(position) {
  const utools = globalThis.utools
  if (!utools || typeof utools.createBrowserWindow !== 'function') return false
  const initial = initialCodexFloatBounds(position)
  const developmentEntry = codexFloatDevelopmentEntry()
  let redirectedToDevelopment = false
  const finishCreateCodexFloat = () => {
    applyCodexFloatWorkspaceVisibility()
    try {
      if (typeof codexFloatWindow?.showInactive === 'function') codexFloatWindow.showInactive()
      else codexFloatWindow?.show()
    } catch {}
    pushCodexFloatSnapshot()
  }
  try {
    codexFloatEdge = initial.edge
    codexFloatWindow = utools.createBrowserWindow('float.html', {
      show: false,
      title: 'EyPc Codex',
      x: initial.bounds.x,
      y: initial.bounds.y,
      width: initial.bounds.width,
      height: initial.bounds.height,
      backgroundColor: '#00000000',
      frame: false,
      transparent: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      movable: false,
      closeable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      roundedCorners: false,
      hasShadow: false,
      autoHideMenuBar: true,
      webPreferences: { preload: 'float-preload.js' }
    }, () => {
      if (developmentEntry && !redirectedToDevelopment && typeof codexFloatWindow?.loadURL === 'function') {
        redirectedToDevelopment = true
        try {
          const loading = codexFloatWindow.loadURL(developmentEntry)
          if (loading && typeof loading.then === 'function') loading.then(finishCreateCodexFloat).catch(finishCreateCodexFloat)
          return
        } catch {}
      }
      finishCreateCodexFloat()
    })
    codexFloatLastHeartbeatAt = Date.now()
    try { codexFloatWindow?.on?.('unresponsive', () => requestCodexFloatRecreate('window-unresponsive')) } catch {}
    try { codexFloatWindow?.webContents?.on?.('render-process-gone', () => requestCodexFloatRecreate('render-process-gone')) } catch {}
    try { codexFloatWindow?.webContents?.on?.('did-fail-load', () => requestCodexFloatRecreate('did-fail-load')) } catch {}
    applyCodexFloatWorkspaceVisibility()
    return true
  } catch {
    codexFloatWindow = null
    return false
  }
}

function requestCodexFloatRecreate(code = 'heartbeat-stall') {
  const now = Date.now()
  if (!codexFloatPersistent || (codexFloatLastRecreateAt > 0 && now - codexFloatLastRecreateAt < CODEX_FLOAT_RECREATE_COOLDOWN_MS)) return false
  codexFloatLastRecreateAt = now
  const expanded = codexFloatExpanded
  const edge = codexFloatEdge
  let position = { displayId: codexFloatPositionDisplayId, x: null, y: null, edge }
  if (codexFloatAlive() && typeof codexFloatWindow.getBounds === 'function') {
    try {
      const bounds = codexFloatWindow.getBounds()
      position = { displayId: codexFloatPositionDisplayId, x: bounds.x, y: bounds.y, edge }
    } catch {}
  }
  runtimeDiagnostics.record({ scope: 'float-health', event: 'controlled-recreate', outcome: 'started', code, level: 'info' })
  closeCodexFloat()
  codexFloatExpanded = expanded
  codexFloatEdge = edge
  const created = createCodexFloat(position)
  if (created && expanded) resizeCodexFloat(true, false)
  codexFloatRecoveryDeadline = now + CODEX_FLOAT_RECOVERY_MS
  codexFloatRecoveryReported = false
  runtimeDiagnostics.record({
    level: created ? 'info' : 'error',
    scope: 'float-health',
    event: 'controlled-recreate',
    outcome: created ? 'created' : 'failed',
    code
  })
  return created
}

function scheduleCodexFloatHealthCheck() {
  const setTimer = globalThis.setTimeout
  const clearTimer = globalThis.clearTimeout
  if (typeof setTimer !== 'function') return false
  if (codexFloatHealthTimer && typeof clearTimer === 'function') clearTimer(codexFloatHealthTimer)
  codexFloatHealthTimer = setTimer(() => {
    codexFloatHealthTimer = null
    const now = Date.now()
    if (codexFloatPersistent && codexFloatAlive()) {
      const age = codexFloatLastHeartbeatAt ? now - codexFloatLastHeartbeatAt : Number.POSITIVE_INFINITY
      if (codexFloatRecoveryDeadline && now >= codexFloatRecoveryDeadline && !codexFloatRecoveryReported) {
        codexFloatRecoveryReported = true
        runtimeDiagnostics.record({ scope: 'float-health', event: 'recovery-window', outcome: 'timeout', code: 'heartbeat-missing', level: 'error', durationMs: CODEX_FLOAT_RECOVERY_MS })
      }
      if (age > CODEX_FLOAT_STALL_MS) {
        if (now - codexFloatLastStallLoggedAt >= CODEX_FLOAT_RECREATE_COOLDOWN_MS) {
          codexFloatLastStallLoggedAt = now
          runtimeDiagnostics.record({ scope: 'float-health', event: 'heartbeat', outcome: 'stalled', code: 'heartbeat-timeout', level: 'info', durationMs: age })
        }
        requestCodexFloatRecreate('heartbeat-timeout')
      }
    }
    scheduleCodexFloatHealthCheck()
  }, CODEX_FLOAT_HEARTBEAT_MS)
  codexFloatHealthTimer?.unref?.()
  return true
}

function clearCodexFloatInteractionTimer() {
  if (codexFloatInteractionTimer) clearTimeout(codexFloatInteractionTimer)
  codexFloatInteractionTimer = null
}

function cancelCodexFloatInteraction(restore = true) {
  clearCodexFloatInteractionTimer()
  const bounds = codexFloatResize?.bounds || codexFloatDrag?.bounds || null
  codexFloatDrag = null
  codexFloatResize = null
  if (restore && bounds && codexFloatAlive()) {
    try { codexFloatWindow.setBounds(bounds) } catch {}
  }
  if (codexFloatAlive()) pushCodexFloatState()
}

function armCodexFloatInteractionTimeout() {
  clearCodexFloatInteractionTimer()
  if (!codexFloatDrag && !codexFloatResize) return
  codexFloatInteractionTimer = setTimeout(() => cancelCodexFloatInteraction(true), CODEX_FLOAT_INTERACTION_IDLE_MS)
  codexFloatInteractionTimer?.unref?.()
}

function codexFloatInteractionId(value, fallback) {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{1,100}$/.test(value) ? value : fallback
}

function sameCodexFloatInteraction(active, payload) {
  if (!active) return false
  const requested = codexRecord(payload).interactionId
  return typeof requested !== 'string' || !requested
    ? active.interactionId.startsWith('legacy-')
    : requested === active.interactionId
}

function closeCodexFloat() {
  if (codexFloatAlive()) {
    try { codexFloatWindow.close() } catch {}
  }
  codexFloatWindow = null
  codexFloatExpanded = false
  codexFloatPinned = false
  codexFloatEdge = 'right'
  codexFloatLastHeartbeatAt = 0
  codexFloatRecoveryDeadline = 0
  codexFloatRecoveryReported = false
  resetCodexFloatTaskLane()
  clearCodexFloatInteractionTimer()
  codexFloatDrag = null
  codexFloatResize = null
}

function activateCodexFloat(payload) {
  if (!codexFloatAlive()) return false
  resizeCodexFloat(true, true)
  try {
    if (typeof codexFloatWindow.show === 'function') codexFloatWindow.show()
    else if (typeof codexFloatWindow.showInactive === 'function') codexFloatWindow.showInactive()
    if (typeof codexFloatWindow.focus === 'function') codexFloatWindow.focus()
    const requestedCommand = codexRecord(payload).command
    const command = requestedCommand === 'new-thread' || requestedCommand === 'quick' ? requestedCommand : undefined
    codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.activate, { requestedAt: Date.now(), ...(command ? { command } : {}) })
    return true
  } catch {
    return false
  }
}

function syncCodexFloat(payload) {
  const source = codexRecord(payload)
  codexFloatPersistent = source.visible === true
  if (source.visible !== true) {
    closeCodexFloat()
    return true
  }
  const rendererSnapshot = source.snapshot && typeof source.snapshot === 'object' ? source.snapshot : null
  const hostTaskPackage = companionTaskKernel?.getPackage?.()
  codexFloatSnapshot = rendererSnapshot && hostTaskPackage
    ? { ...rendererSnapshot, companionTaskPackage: hostTaskPackage }
    : rendererSnapshot
  codexFloatExpandedSizes = normalizeCodexExpandedSizes(source.expandedSizes || codexRecord(source.snapshot).expandedSizes)
  const position = codexRecord(source.position)
  codexFloatPositionDisplayId = typeof position.displayId === 'string' ? position.displayId : ''
  if (!codexFloatAlive() && !createCodexFloat(position)) return false
  applyCodexFloatWorkspaceVisibility()
  if (!codexFloatResize) resizeCodexFloat(codexFloatExpanded, false)
  const snapshotSent = pushCodexFloatSnapshot()
  const taskPackage = codexFloatSnapshot?.companionTaskPackage
  if (codexFloatTaskPackageRevision(taskPackage) > codexFloatTaskLastSentRevision) {
    pushCodexFloatTaskPackage(taskPackage)
  }
  return snapshotSent
}

function emitCodexFloatAction(actionId, args) {
  if (typeof actionId !== 'string' || !actionId.startsWith('codex.')) return
  if (actionId === 'codex.settings.open') {
    try {
      if (globalThis.utools && typeof globalThis.utools.showMainWindow === 'function') globalThis.utools.showMainWindow()
    } catch {}
  }
  for (const listener of codexFloatActionListeners) {
    try { listener({ actionId, args: codexRecord(args) }) } catch {}
  }
}

function resizeCodexFloat(expanded, notifyState = true) {
  if (!codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
  const current = codexFloatWindow.getBounds()
  const display = floatDisplayForPoint({ x: current.x + current.width / 2, y: current.y + current.height / 2 })
  const edge = validCodexFloatEdge(codexFloatEdge) ? codexFloatEdge : nearestFloatEdge(current, display)
  const size = codexFloatDesiredSize(codexFloatSnapshot, expanded, display)
  const resized = resizeFloatBounds(current, size, display, edge)
  if (current.x !== resized.bounds.x || current.y !== resized.bounds.y || current.width !== resized.bounds.width || current.height !== resized.bounds.height) {
    try { codexFloatWindow.setBounds(resized.bounds) } catch {}
  }
  codexFloatEdge = resized.edge
  codexFloatExpanded = expanded
  codexFloatPinned = false
  if (notifyState) pushCodexFloatState()
}

function resetCodexFloatGeometry(payload) {
  const source = codexRecord(payload)
  codexFloatExpandedSizes = normalizeCodexExpandedSizes(source.expandedSizes)
  if (!codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return true
  clearCodexFloatInteractionTimer()
  codexFloatDrag = null
  codexFloatResize = null
  const position = codexRecord(source.position)
  codexFloatPositionDisplayId = typeof position.displayId === 'string' ? position.displayId : ''
  const display = floatDisplayForPosition(position)
  const area = display.workArea || display.bounds
  const size = codexFloatDesiredSize(codexFloatSnapshot, codexFloatExpanded, display)
  const edge = validCodexFloatEdge(position.edge) ? position.edge : 'right'
  const requested = Number.isFinite(position.x) && Number.isFinite(position.y)
    ? { x: position.x, y: position.y, ...size }
    : { x: area.x + area.width - size.width - CODEX_FLOAT_MARGIN, y: area.y + Math.round((area.height - size.height) / 2), ...size }
  const bounds = alignFloatBoundsToEdge(requested, display, edge)
  try { codexFloatWindow.setBounds(bounds) } catch { return false }
  applyCodexFloatWorkspaceVisibility()
  codexFloatEdge = edge
  pushCodexFloatState()
  return true
}

function moveCodexFloatResize(screenX, screenY) {
  if (!codexFloatResize || !codexFloatAlive()) return false
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return false
  const start = codexFloatResize
  const dx = screenX - start.pointerX
  const dy = screenY - start.pointerY
  const left = start.corner.endsWith('-left')
  const top = start.corner.startsWith('top-')
  const requested = {
    width: left ? start.bounds.width - dx : start.bounds.width + dx,
    height: top ? start.bounds.height - dy : start.bounds.height + dy
  }
  const size = clampCodexExpandedSize(requested, start.display)
  const candidate = {
    x: left ? start.bounds.x + start.bounds.width - size.width : start.bounds.x,
    y: top ? start.bounds.y + start.bounds.height - size.height : start.bounds.y,
    ...size
  }
  const bounds = alignFloatBoundsToEdge(candidate, start.display, start.edge)
  try { codexFloatWindow.setBounds(bounds) } catch { return false }
  return true
}

function installCodexFloatIpc() {
  const ipc = electronIpcRenderer()
  if (!ipc || typeof ipc.on !== 'function') return
  ipc.on(CODEX_FLOAT_CHANNELS.expansion, (_event, payload) => {
    if (codexFloatResize) return
    const source = codexRecord(payload)
    const expanded = source.expanded === true
    resizeCodexFloat(expanded, true)
  })
  ipc.on(CODEX_FLOAT_CHANNELS.returnFocus, () => {
    if (!codexFloatAlive()) return
    try { codexFloatWindow.hide() } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.action, (_event, payload) => emitCodexFloatAction(codexRecord(payload).actionId, codexRecord(payload).args))
  ipc.on(CODEX_FLOAT_CHANNELS.taskPackageAck, (_event, payload) => {
    const source = codexRecord(payload)
    const sentRevision = Number(source.sentRevision)
    const currentRevision = Number(source.currentRevision)
    const stage = source.stage
    if (!Number.isInteger(sentRevision) || sentRevision <= 0 || !Number.isInteger(currentRevision) || currentRevision < 0) return
    if (stage === 'received') return
    if (stage === 'applied') {
      codexFloatTaskAppliedRevision = Math.max(codexFloatTaskAppliedRevision, currentRevision)
      if (codexFloatTaskAppliedRevision >= codexFloatTaskPendingRevision) {
        const elapsed = codexFloatTaskPendingStartedAt ? Date.now() - codexFloatTaskPendingStartedAt : 0
        clearCodexFloatTaskAckTimer()
        codexFloatTaskPendingRevision = 0
        codexFloatTaskSendAttempts = 0
        codexFloatTaskPendingStartedAt = 0
        runtimeDiagnostics.record({
          level: elapsed > 250 ? 'info' : 'debug',
          scope: 'float-bridge',
          event: 'task-package-ack',
          outcome: 'applied',
          durationMs: elapsed,
          slowMs: 250,
          count: currentRevision
        })
      }
      return
    }
    if (stage !== 'rejected') return
    if (source.reason === 'older-revision' && currentRevision >= sentRevision) {
      codexFloatTaskAppliedRevision = Math.max(codexFloatTaskAppliedRevision, currentRevision)
      if (codexFloatTaskAppliedRevision >= codexFloatTaskPendingRevision) {
        clearCodexFloatTaskAckTimer()
        codexFloatTaskPendingRevision = 0
        codexFloatTaskSendAttempts = 0
        codexFloatTaskPendingStartedAt = 0
      }
      return
    }
    runtimeDiagnostics.record({
      scope: 'float-bridge',
      event: 'task-package-ack',
      outcome: 'rejected',
      code: ['identity-mismatch', 'invalid-payload'].includes(source.reason) ? source.reason : 'invalid-ack',
      level: 'error',
      count: sentRevision
    })
    if (source.reason === 'identity-mismatch' || source.reason === 'invalid-payload') requestCodexFloatRecreate(`task-package-${source.reason}`)
  })
  ipc.on(CODEX_FLOAT_CHANNELS.threadCreate, async (_event, payload) => {
    const source = codexRecord(payload)
    const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
    if (!requestId) return
    const result = await createCodexThread(source.request)
    if (!codexFloatAlive()) return
    try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.threadCreateResult, { requestId, result }) } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.blankOpen, async (_event, payload) => {
    const source = codexRecord(payload)
    const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
    if (!requestId) return
    const result = await openCodexBlank()
    if (!codexFloatAlive()) return
    try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.blankOpenResult, { requestId, result }) } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.copyText, async (_event, payload) => {
    const source = codexRecord(payload)
    const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
    const text = typeof source.text === 'string' && source.text.length <= 50_000 ? source.text : ''
    if (!requestId || !text.trim()) return
    const copied = await copyText(text)
    if (!codexFloatAlive()) return
    try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.copyTextResult, { requestId, result: copied }) } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.threadOpen, async (_event, payload) => {
    const source = codexRecord(payload)
    const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
    const actionAlias = typeof source.actionAlias === 'string' ? source.actionAlias : ''
    if (!requestId) return
    const result = await openCodexThread(actionAlias)
    if (!codexFloatAlive()) return
    try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.threadOpenResult, { requestId, result }) } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.dragStart, (_event, payload) => {
    if (codexFloatResize || !codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return
    codexFloatDrag = {
      interactionId: codexFloatInteractionId(point.interactionId, `legacy-drag-${Date.now()}`),
      pointerX: point.screenX,
      pointerY: point.screenY,
      bounds: codexFloatWindow.getBounds()
    }
    armCodexFloatInteractionTimeout()
  })
  ipc.on(CODEX_FLOAT_CHANNELS.dragMove, (_event, payload) => {
    if (!sameCodexFloatInteraction(codexFloatDrag, payload) || !codexFloatAlive()) return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return
    const candidate = {
      ...codexFloatDrag.bounds,
      x: codexFloatDrag.bounds.x + point.screenX - codexFloatDrag.pointerX,
      y: codexFloatDrag.bounds.y + point.screenY - codexFloatDrag.pointerY
    }
    const display = floatDisplayForPoint({ x: candidate.x + candidate.width / 2, y: candidate.y + candidate.height / 2 })
    try { codexFloatWindow.setBounds(clampFloatBounds(candidate, display)) } catch {}
    armCodexFloatInteractionTimeout()
  })
  ipc.on(CODEX_FLOAT_CHANNELS.dragEnd, (_event, payload) => {
    if (!sameCodexFloatInteraction(codexFloatDrag, payload) || !codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
    clearCodexFloatInteractionTimer()
    const current = codexFloatWindow.getBounds()
    const startBounds = codexFloatDrag.bounds
    if (current.x === startBounds.x && current.y === startBounds.y && current.width === startBounds.width && current.height === startBounds.height) {
      codexFloatDrag = null
      return
    }
    const display = floatDisplayForPoint({ x: current.x + current.width / 2, y: current.y + current.height / 2 })
    const snapped = snapFloatBounds(current, display)
    try { codexFloatWindow.setBounds(snapped.bounds) } catch {}
    applyCodexFloatWorkspaceVisibility()
    codexFloatEdge = snapped.edge
    codexFloatPositionDisplayId = String(display.id || '')
    codexFloatDrag = null
    emitCodexFloatAction('codex.float.position.save', {
      position: { displayId: String(display.id || ''), x: snapped.bounds.x, y: snapped.bounds.y, edge: snapped.edge }
    })
  })
  ipc.on(CODEX_FLOAT_CHANNELS.resizeStart, (_event, payload) => {
    if (!codexFloatExpanded || codexFloatDrag || codexFloatResize || !codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY) || !validCodexResizeCorner(point.corner)) return
    const bounds = codexFloatWindow.getBounds()
    const display = floatDisplayForPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
    const expectedCorner = codexFloatResizeCorner(bounds, display, codexFloatEdge)
    if (point.corner !== expectedCorner) return
    codexFloatResize = {
      interactionId: codexFloatInteractionId(point.interactionId, `legacy-resize-${Date.now()}`),
      pointerX: point.screenX,
      pointerY: point.screenY,
      bounds: { ...bounds },
      display,
      displayId: String(display.id || ''),
      edge: codexFloatEdge,
      corner: point.corner
    }
    armCodexFloatInteractionTimeout()
    pushCodexFloatState()
  })
  ipc.on(CODEX_FLOAT_CHANNELS.resizeMove, (_event, payload) => {
    const point = codexRecord(payload)
    if (!sameCodexFloatInteraction(codexFloatResize, point)) return
    moveCodexFloatResize(point.screenX, point.screenY)
    armCodexFloatInteractionTimeout()
  })
  ipc.on(CODEX_FLOAT_CHANNELS.resizeEnd, (_event, payload) => {
    if (!sameCodexFloatInteraction(codexFloatResize, payload) || !codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
    clearCodexFloatInteractionTimer()
    const resize = codexFloatResize
    const bounds = codexFloatWindow.getBounds()
    codexFloatResize = null
    pushCodexFloatState()
    if (bounds.width === resize.bounds.width && bounds.height === resize.bounds.height) return
    emitCodexFloatAction('codex.float.geometry.save', {
      position: { displayId: resize.displayId, x: bounds.x, y: bounds.y, edge: resize.edge },
      expandedSize: { displayId: resize.displayId, width: bounds.width, height: bounds.height, updatedAt: Date.now() }
    })
  })
  ipc.on(CODEX_FLOAT_CHANNELS.resizeCancel, (_event, payload) => {
    if (!sameCodexFloatInteraction(codexFloatResize, payload) || !codexFloatAlive()) return
    clearCodexFloatInteractionTimer()
    const bounds = codexFloatResize.bounds
    codexFloatResize = null
    try { codexFloatWindow.setBounds(bounds) } catch {}
    pushCodexFloatState()
  })
  ipc.on(CODEX_FLOAT_CHANNELS.interactionCancel, () => cancelCodexFloatInteraction(true))
  ipc.on(CODEX_FLOAT_CHANNELS.heartbeat, (_event, payload) => {
    if (!codexFloatAlive()) return
    const source = codexRecord(payload)
    const sequence = Number.isInteger(source.sequence) && source.sequence > 0 ? source.sequence : 0
    codexFloatLastHeartbeatAt = Date.now()
    if (codexFloatRecoveryDeadline) {
      runtimeDiagnostics.record({
        level: 'info',
        scope: 'float-health',
        event: 'recovery-window',
        outcome: 'recovered',
        durationMs: Math.max(0, CODEX_FLOAT_RECOVERY_MS - Math.max(0, codexFloatRecoveryDeadline - codexFloatLastHeartbeatAt))
      })
      codexFloatRecoveryDeadline = 0
      codexFloatRecoveryReported = false
    }
    try {
      codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.heartbeatAck, { sequence, receivedAt: codexFloatLastHeartbeatAt })
    } catch {}
  })
}

installCodexFloatIpc()
scheduleCodexFloatHealthCheck()

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
  const membershipRevision = Math.max(
    Date.now(),
    Number(task?.membershipRevision) + 1,
    Number(task?.visibilityRevision) + 1
  )
  const nextTasks = task
    ? current.tasks.map((candidate) => candidate.key === key
      ? {
          ...candidate,
          actionAlias,
          capabilityToken: actionAlias,
          membershipRevision,
          visibilityRevision: Math.max(Number(candidate.visibilityRevision) || 0, membershipRevision),
          capabilities: { ...candidate.capabilities, open: true }
        }
      : candidate)
    : [...current.tasks, {
        key,
        provider: 'codex',
        kind: 'codex-thread',
        phase: 'unknown',
        actionAlias,
        capabilityToken: actionAlias,
        revisionAt: Math.max(1, Number(fallbackTarget?.revisionAt) || 0),
        membershipRevision,
        phaseRevision: 0,
        unreadRevision: 0,
        visibilityRevision: membershipRevision,
        statusEnteredAt: 0,
        lastQuestionAt: 0,
        createdAt: 0,
        displayOrder: current.tasks.length,
        cycleOrder: current.tasks.length,
        attentionOrder: current.tasks.length,
        hidden: false,
        unreadKnown: false,
        unread: false,
        planImplementation: false,
        planReady: false,
        planLifecycleRevision: 0,
        paused: false,
        turnMode: 'unknown',
        idleConfirmed: false,
        localPin: false,
        dynamicEligible: false,
        freshness: 'verifying',
        capabilities: { open: true, archive: false, pause: false, resume: false, executePlan: false },
        displayName: typeof metadata?.displayName === 'string' && metadata.displayName
          ? metadata.displayName
          : '新 Codex 任务',
        projectKey: typeof metadata?.projectKey === 'string' ? metadata.projectKey : 'chats',
        projectName: typeof metadata?.projectName === 'string' ? metadata.projectName : 'Chats',
        projectKind: metadata?.projectKind === 'project' ? 'project' : 'chats'
      }]
  if (current.complete) return publishCompanionHostTasks(nextTasks, { acceptedAt: Date.now() })
  if (!companionTaskKernel?.publishEvidence) return false
  const configuration = companionTaskConfiguration()
  const next = companionTaskKernel.publishEvidence({
    schema: 'companion-task-draft-v4',
    producer: 'host-evidence',
    sourceTaskStateRevision: current.sourceTaskStateRevision || 'task-state-v10:exact-open',
    draftRevision: ++companionHostDraftSequence,
    acceptedAt: Date.now(),
    enabled: configuration.enabled,
    providers: configuration.providers,
    complete: false,
    focusedKey: current.focusedKey,
    sourceGenerations: current.sourceGenerations,
    sourceLaneGenerations: current.sourceLaneGenerations,
    tasks: nextTasks
  })
  return Boolean(next)
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
  return claudeBridge
    ? claudeBridge.openTask(exactAlias || target.actionAlias)
    : claudeUnavailable('open')
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
      claude: providerSource.claude === true
    }
  }
}

function companionPersistedTaskState() {
  const codex = codexRecord(codexRecord(readState()).codex)
  const pins = new Set(
    (Array.isArray(codex.localPins) ? codex.localPins : [])
      .map(codexRecord)
      .filter((pin) => pin.kind === 'task' && typeof pin.key === 'string')
      .map((pin) => pin.key)
  )
  const receipts = new Map(
    (Array.isArray(codex.receipts) ? codex.receipts : [])
      .map(codexRecord)
      .filter((receipt) => typeof receipt.key === 'string')
      .map((receipt) => [receipt.key, receipt])
  )
  return { pins, receipts }
}

function readCompanionPlanPauseReceipts() {
  try {
    const stored = globalThis.utools?.dbStorage?.getItem?.(COMPANION_PLAN_PAUSE_STORAGE_KEY)
    const rows = Array.isArray(stored?.receipts) ? stored.receipts : []
    return rows.flatMap((value) => {
      const source = codexRecord(value)
      const key = typeof source.key === 'string' && /^[a-f0-9]{16,64}$/i.test(source.key) ? source.key : ''
      const planLifecycleRevision = Number.isFinite(source.planLifecycleRevision)
        ? Math.max(0, Math.trunc(source.planLifecycleRevision))
        : 0
      if (!key || !planLifecycleRevision || source.paused !== true) return []
      return [{
        key,
        planLifecycleRevision,
        paused: true,
        updatedAt: Number.isFinite(source.updatedAt) ? Math.max(0, Math.trunc(source.updatedAt)) : 0
      }]
    }).sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 2_000)
  } catch {
    return []
  }
}

function persistCompanionPlanPause(receipt) {
  const source = codexRecord(receipt)
  const key = typeof source.key === 'string' && /^[a-f0-9]{16,64}$/i.test(source.key) ? source.key : ''
  const planLifecycleRevision = Number.isFinite(source.planLifecycleRevision)
    ? Math.max(0, Math.trunc(source.planLifecycleRevision))
    : 0
  if (!key || !planLifecycleRevision) return false
  const rows = readCompanionPlanPauseReceipts().filter((value) => value.key !== key)
  if (source.paused === true) rows.unshift({ key, planLifecycleRevision, paused: true, updatedAt: Date.now() })
  try {
    return globalThis.utools?.dbStorage?.setItem?.(COMPANION_PLAN_PAUSE_STORAGE_KEY, {
      version: 1,
      receipts: rows.slice(0, 2_000)
    }) !== false
  } catch {
    return false
  }
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

function companionCodexPhaseDecision(thread) {
  if (typeof reduceCodexTaskEvidenceV4 !== 'function') throw new Error('companion task V4 Codex reducer unavailable')
  return reduceCodexTaskEvidenceV4(thread)
}

function companionPhaseForCodexThread(thread) {
  return companionCodexPhaseDecision(thread).phase
}

function companionClaudePhaseDecision(value, unread) {
  if (typeof reduceClaudeTaskEvidenceV4 !== 'function') throw new Error('companion task V4 Claude reducer unavailable')
  return reduceClaudeTaskEvidenceV4({ phase: value, unread: unread === true })
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

let companionPreflightDraftSequence = 0

async function preflightCompanionTaskPackage(input = {}) {
  const preflightStartedAt = Date.now()
  const configuration = companionTaskConfiguration()
  const requested = codexRecord(input.providers)
  const providers = {
    codex: requested.codex === true && configuration.providers.codex,
    claude: requested.claude === true && configuration.providers.claude
  }
  if (!configuration.enabled) throw new Error('companion-disabled')
  const reads = []
  if (providers.codex) {
    reads.push(Promise.resolve(readCodexSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true }))
      .then((result) => {
        if (!result?.ok || !Array.isArray(result.value?.threads) || result.value.completeness !== 'verified') throw new Error('codex-task-preflight-failed')
        return { provider: 'codex', value: result.value }
      }))
  }
  if (providers.claude) {
    reads.push(Promise.all([
      Promise.resolve(claudeBridge?.readCodeSnapshot({ now: Date.now() })),
      Promise.resolve(claudeBridge?.readCodeUnread())
    ]).then(([value, unread]) => {
        if (!claudeBridge || !value || !Array.isArray(value.sessions) || value.truncated === true) throw new Error('claude-task-preflight-failed')
        if (!unread || !Array.isArray(unread.ids)) throw new Error('claude-unread-preflight-failed')
        return { provider: 'claude', value, unread }
      }))
  }
  if (!reads.length) throw new Error('no-enabled-provider')
  let rows
  try {
    rows = await Promise.all(reads)
  } catch (error) {
    runtimeDiagnostics.record({
      scope: 'task-recovery',
      event: 'cold-preflight',
      outcome: 'failed',
      code: error instanceof Error && /^[a-z0-9-]{1,80}$/i.test(error.message) ? error.message : 'provider-read-failed',
      durationMs: Date.now() - preflightStartedAt,
      slowMs: 500,
      level: 'error'
    })
    throw error
  }
  const persisted = companionPersistedTaskState()
  const dynamicCutoff = Date.now() - configuration.dynamicTaskWindowHours * 60 * 60 * 1_000
  const tasks = []
  const sourceGenerations = { codex: 0, claude: 0 }
  const sourceLaneGenerations = {
    codex: { membership: 0, phase: 0, unread: 0 },
    claude: { membership: 0, phase: 0, unread: 0 }
  }
  let order = 0
  for (const result of rows) {
    if (result.provider === 'codex') {
      sourceGenerations.codex = Number(result.value.activityGeneration) || 0
      sourceLaneGenerations.codex.membership = Number(result.value.readAt) || Date.now()
      sourceLaneGenerations.codex.phase = sourceGenerations.codex
      sourceLaneGenerations.codex.unread = sourceGenerations.codex
      for (const value of result.value.threads) {
        const thread = codexRecord(value)
        const key = typeof thread.key === 'string' ? thread.key : ''
        const actionAlias = typeof thread.actionAlias === 'string' ? thread.actionAlias : ''
        const revisionAt = Math.max(
          Number(thread.activityRevision) || 0,
          Number(thread.waitingSince) || 0,
          Number(thread.lastTurnCompletedAt) || 0,
          Number(thread.lastTurnStartedAt) || 0,
          Number(thread.updatedAt) || 0
        )
        if (!key || !actionAlias || !revisionAt) continue
        const decision = companionCodexPhaseDecision(thread)
        const phase = decision.phase
        const localPin = persisted.pins.has(key)
        const receipt = persisted.receipts.get(key)
        const hidden = Number(receipt?.dismissedActivityRecency) >= revisionAt
        const unread = thread.hasUnreadTurn === true
        const planImplementation = thread.planImplementationOnly === true
        const planReady = thread.planReady === true || planImplementation
        const planLifecycleRevision = planReady
          ? Number(thread.planLifecycleRevision) || Number(thread.lastTurnStartedAt) || revisionAt
          : 0
        const causalStatusAt = Number(thread.waitingSince)
          || Number(thread.lastTurnCompletedAt)
          || Number(thread.lastTurnStartedAt)
          || Number(thread.createdAt)
          || 0
        const dynamicEligible = Math.max(
          Number(thread.lastQuestionAt) || 0,
          Number(thread.lastTurnStartedAt) || 0,
          Number(thread.waitingSince) || 0,
          Number(thread.lastTurnCompletedAt) || 0,
          Number(thread.createdAt) || 0
        ) >= dynamicCutoff
        const executePlanAvailable = planReady
        recordCompanionStateDecision('codex', key, decision, thread.lastTurnEvidence || 'inventory')
        tasks.push({
          key,
          provider: 'codex',
          kind: localPin ? 'local-pin' : 'codex-thread',
          phase,
          cycleTier: 'none',
          dynamicGroup: 'none',
          actionAlias,
          revisionAt,
          semanticRevision: 1,
          observationGeneration: sourceGenerations.codex,
          membershipRevision: revisionAt,
          phaseRevision: causalStatusAt || Number(thread.activityRevision) || revisionAt,
          unreadRevision: Number(thread.lastTurnCompletedAt) || Number(thread.activityRevision) || revisionAt,
          visibilityRevision: revisionAt,
          statusEnteredAt: causalStatusAt,
          turnStartedAt: Number(thread.lastTurnStartedAt) || 0,
          terminalAt: phase === 'completed'
            ? Number(thread.lastTurnCompletedAt) || Number(thread.lastTurnStartedAt) || 0
            : phase === 'stopped' ? Number(thread.lastTurnStartedAt) || 0 : 0,
          metadataRevision: Number(thread.updatedAt) || revisionAt,
          capabilityToken: actionAlias,
          freshness: decision.freshness === 'verifying' ? 'verifying' : 'fresh',
          lastQuestionAt: Number(thread.lastQuestionAt) || Number(thread.lastTurnStartedAt) || 0,
          createdAt: Number(thread.createdAt) || 0,
          displayOrder: order,
          cycleOrder: order,
          attentionOrder: order++,
          hidden,
          unreadKnown: thread.unreadAuthority !== 'unavailable',
          unread,
          planImplementation,
          planReady,
          planLifecycleRevision,
          paused: false,
          turnMode: thread.turnMode === 'plan' || thread.turnMode === 'default' ? thread.turnMode : 'unknown',
          idleConfirmed: thread.idleConfirmed === true,
          localPin,
          dynamicEligible,
          capabilities: {
            open: true,
            archive: phase === 'completed' || phase === 'stopped',
            pause: planReady,
            resume: planReady,
            executePlan: executePlanAvailable
          },
          displayName: typeof thread.displayName === 'string' ? thread.displayName : typeof thread.name === 'string' ? thread.name : 'Codex 任务',
          ...(typeof thread.projectKey === 'string' ? { projectKey: thread.projectKey } : {}),
          ...(typeof thread.projectName === 'string' ? { projectName: thread.projectName } : {}),
          ...(thread.projectKind === 'project' || thread.projectKind === 'chats' ? { projectKind: thread.projectKind } : {}),
          ...(phase === 'completed' || phase === 'stopped' ? {
            archiveRequest: {
              expectedUpdatedAt: Number(thread.updatedAt) || revisionAt,
              expectedRevisionAt: phase === 'completed'
                ? Number(thread.lastTurnCompletedAt) || Number(thread.lastTurnStartedAt) || revisionAt
                : Number(thread.lastTurnStartedAt) || revisionAt,
              ...(phase === 'completed' && Number(thread.lastTurnCompletedAt)
                ? { expectedCompletionAt: Number(thread.lastTurnCompletedAt) }
                : {}),
              expectedLastTurnStartedAt: Number(thread.lastTurnStartedAt) || revisionAt,
              expectedSourceFingerprint: String(result.value.sourceFingerprint || '').slice(0, 80),
              evidence: phase === 'stopped' ? 'stopped' : 'completed'
            }
          } : {})
        })
      }
      continue
    }
    const unreadIds = new Set(result.unread.ids.filter((value) => typeof value === 'string'))
    companionClaudeUnreadSnapshot = {
      ids: unreadIds,
      generation: Number(result.unread.generation) || 0,
      readAt: Number(result.unread.readAt) || Date.now(),
      available: true
    }
    sourceLaneGenerations.claude.membership = Number(result.value.readAt) || Date.now()
    sourceLaneGenerations.claude.phase = Number(result.value.generation || result.value.stateGeneration) || 0
    sourceLaneGenerations.claude.unread = Number(result.unread.generation) || 0
    sourceGenerations.claude = companionCounterAggregate(sourceLaneGenerations.claude)
    for (const value of result.value.sessions) {
      const session = codexRecord(value)
      if (session.isArchived === true) continue
      const sessionId = typeof session.sessionId === 'string' ? session.sessionId : ''
      const key = sessionId ? `claude:${sessionId}` : ''
      const unread = unreadIds.has(sessionId)
      const decision = companionClaudePhaseDecision(session.phase, unread)
      const phase = decision.phase
      const revisionAt = Math.max(
        Number(session.stateGeneration) || 0,
        Number(session.phaseUpdatedAt) || 0,
        Number(session.turnStartedAt) || 0,
        Number(session.lastStopAt) || 0,
        Number(session.lastActivityAt) || 0,
        Number(session.metadataUpdatedAt) || 0
      )
      if (!key || !revisionAt) continue
      recordCompanionStateDecision('claude', key, decision, unread ? 'native-unread' : session.stateSource || 'provider-state')
      const localPin = persisted.pins.has(key)
      // Local visibility is provider-neutral EyPc state. Without this the cold
      // preflight rebuilt every Claude row as visible and silently dropped a
      // hide that the Renderer had already persisted.
      const hidden = Number(persisted.receipts.get(key)?.dismissedActivityRecency) >= revisionAt
      const phaseStatusAt = Number(session.waitingApprovalAt)
        || Number(session.waitingInputAt)
        || Number(session.lastStopAt)
        || Number(session.phaseUpdatedAt)
        || Number(session.turnStartedAt)
        || Number(session.createdAt)
        || 0
      const phaseRevision = phaseStatusAt || Number(session.stateGeneration) || revisionAt
      tasks.push({
        key,
        provider: 'claude',
        kind: localPin ? 'local-pin' : 'claude-session',
        phase,
        cycleTier: 'none',
        dynamicGroup: 'none',
        actionAlias: sessionId,
        revisionAt,
        membershipRevision: Math.max(Number(session.lastActivityAt) || 0, Number(session.metadataUpdatedAt) || 0, revisionAt),
        phaseRevision,
        unreadRevision: sourceLaneGenerations.claude.unread || revisionAt,
        visibilityRevision: Math.max(Number(session.metadataUpdatedAt) || 0, revisionAt),
        statusEnteredAt: phaseStatusAt,
        lastQuestionAt: Number(session.turnStartedAt) || 0,
        createdAt: Number(session.createdAt) || 0,
        displayOrder: order,
        cycleOrder: order,
        attentionOrder: order++,
        hidden,
        unread,
        planImplementation: false,
        planReady: false,
        planLifecycleRevision: 0,
        paused: false,
        turnMode: 'unknown',
        idleConfirmed: false,
        localPin,
        dynamicEligible: Math.max(Number(session.turnStartedAt) || 0, Number(session.lastActivityAt) || 0) >= dynamicCutoff,
        capabilities: {
          open: true,
          archive: (phase === 'completed' || phase === 'stopped')
            && session.stateCompatibility === 'compatible',
          pause: false,
          resume: false,
          executePlan: false
        }
      })
    }
  }
  tasks.sort((left, right) => right.lastQuestionAt - left.lastQuestionAt
    || right.createdAt - left.createdAt
    || left.key.localeCompare(right.key))
  tasks.forEach((task, index) => {
    task.displayOrder = index
    task.cycleOrder = index
    task.attentionOrder = index
  })
  runtimeDiagnostics.record({
    level: 'info',
    scope: 'task-recovery',
    event: 'cold-preflight',
    outcome: 'accepted',
    durationMs: Date.now() - preflightStartedAt,
    slowMs: 500,
    count: tasks.length,
    details: { providers, sourceGenerations, sourceLaneGenerations, taskCount: tasks.length }
  })
  return {
    schema: 'companion-task-draft-v4',
    producer: 'host-preflight',
    sourceTaskStateRevision: 'task-state-v10:cold-preflight',
    draftRevision: ++companionPreflightDraftSequence,
    acceptedAt: Date.now(),
    enabled: true,
    providers,
    complete: true,
    focusedKey: '',
    sourceGenerations,
    sourceLaneGenerations,
    tasks
  }
}

companionTaskKernel = typeof createCompanionTaskKernel === 'function'
  ? createCompanionTaskKernel({
      initialConfiguration: companionTaskConfiguration(),
      initialPauseReceipts: readCompanionPlanPauseReceipts(),
      persistPlanPause: persistCompanionPlanPause,
      migrateHiddenPlan: migrateHiddenCompanionPlan,
      preflight: preflightCompanionTaskPackage,
      adapters: {
        codex: {
          inspect: inspectCodexEnvironment,
          open: openCompanionCodexTarget,
          executePlan: executeCompanionCodexPlan,
          archive: (target, request) => archiveCodexThread(target.actionAlias, {
            ...(target.archiveRequest || {}),
            operationId: request?.operationId,
            source: request?.source,
            requestedRevisionAt: request?.revisionAt,
            intentRecorded: request?.intentRecorded === true,
            confirmationRecorded: request?.confirmationRecorded === true
          }),
          close: () => undefined
        },
        claude: {
          inspect: () => claudeBridge ? claudeBridge.inspect() : claudeUnavailable('environment'),
          open: openCompanionClaudeTarget,
          archive: (target) => claudeBridge
            ? claudeBridge.archiveCodeSession(target.actionAlias)
            : Promise.resolve(claudeUnavailable('archive')),
          close: () => undefined
        }
      },
      notify: (message) => {
        try { globalThis.utools?.showNotification?.(String(message || '')) } catch {}
      },
      record: (event) => recordCompanionDiagnosticEvent(event)
    })
  : null

if (companionTaskKernel?.onPackage) {
  companionTaskKernel.onPackage((taskPackage) => {
    if (!codexFloatSnapshot || typeof codexFloatSnapshot !== 'object') return
    codexFloatSnapshot = { ...codexFloatSnapshot, companionTaskPackage: taskPackage }
    pushCodexFloatTaskPackage(taskPackage)
  })
}

let companionHostDraftSequence = 0
let companionHostReconcileInFlight = null
const companionHostReconcilePendingProviders = new Set()
let companionClaudeStateDispose = null
let companionClaudeInventoryDispose = null
let companionClaudeUnreadDispose = null
let companionClaudeUnreadSnapshot = { ids: new Set(), generation: 0, readAt: 0, available: false }

/**
 * Single rule for lane units. `phase` and `unread` are monotonic provider
 * counters; `membership` is an observation timestamp that is only ever compared
 * against itself. Mixing them is not a rounding error but a permanent failure:
 * a counter can never overtake a wall-clock value, so any lane that inherits a
 * timestamp rejects every later real generation as stale. The aggregate
 * therefore spans counters only, and no lane may seed another across units.
 */
function companionCounterAggregate(lanes) {
  return Math.max(Number(lanes?.phase) || 0, Number(lanes?.unread) || 0)
}

function publishCompanionHostTasks(tasks, input = {}) {
  const current = companionTaskKernel?.getPackage?.()
  if (!current?.complete || !companionTaskKernel?.publishEvidence) return false
  const currentLanes = current.sourceLaneGenerations || {
    codex: { membership: 0, phase: current.sourceGenerations.codex, unread: current.sourceGenerations.codex },
    claude: { membership: 0, phase: current.sourceGenerations.claude, unread: current.sourceGenerations.claude }
  }
  const requestedLanes = codexRecord(input.sourceLaneGenerations)
  const laneGenerations = {
    codex: {
      membership: Number(codexRecord(requestedLanes.codex).membership) || currentLanes.codex.membership,
      phase: Number(codexRecord(requestedLanes.codex).phase) || currentLanes.codex.phase,
      unread: Number(codexRecord(requestedLanes.codex).unread) || currentLanes.codex.unread
    },
    claude: {
      membership: Number(codexRecord(requestedLanes.claude).membership) || currentLanes.claude.membership,
      phase: Number(codexRecord(requestedLanes.claude).phase) || currentLanes.claude.phase,
      unread: Number(codexRecord(requestedLanes.claude).unread) || currentLanes.claude.unread
    }
  }
  const next = companionTaskKernel.publishEvidence({
    schema: 'companion-task-draft-v4',
    producer: 'host-evidence',
    sourceTaskStateRevision: current.sourceTaskStateRevision,
    draftRevision: ++companionHostDraftSequence,
    acceptedAt: Number(input.acceptedAt) || Date.now(),
    enabled: current.enabled,
    providers: current.providers,
    complete: true,
    focusedKey: current.focusedKey,
    sourceGenerations: {
      codex: Math.max(current.sourceGenerations.codex, companionCounterAggregate(laneGenerations.codex)),
      claude: Math.max(current.sourceGenerations.claude, companionCounterAggregate(laneGenerations.claude))
    },
    sourceLaneGenerations: laneGenerations,
    tasks
  })
  return Boolean(next)
}

function companionCanonicalProposalMismatchCount(proposedTasks, canonical, keys, selectors, removedKeys = []) {
  const proposedByKey = new Map((Array.isArray(proposedTasks) ? proposedTasks : []).map((task) => [task.key, task]))
  const canonicalByKey = new Map((Array.isArray(canonical?.tasks) ? canonical.tasks : []).map((task) => [task.key, task]))
  let count = 0
  for (const key of removedKeys) if (canonicalByKey.has(key)) count += 1
  for (const key of keys) {
    const proposed = proposedByKey.get(key)
    const committed = canonicalByKey.get(key)
    if (!proposed || !committed) {
      count += 1
      continue
    }
    for (const selector of selectors) {
      if (selector(proposed) !== selector(committed)) count += 1
    }
  }
  return count
}

/**
 * Single outlet for "was this proposal actually accepted?".
 *
 * RAW-166 §78 states one rule — a proposal counts as accepted only when the
 * committed canonical package matches it — and that rule was implemented four
 * times, once per Provider lane. Four copies of one contract means four places
 * to keep in step, so the decision, its repair trigger and its diagnostic shape
 * live here and each lane supplies only what genuinely differs.
 */
function recordCompanionProposalOutcome(input) {
  const canonicalPublishedAt = Number(input.canonical?.publishedAt) || 0
  const canonicalMismatchCount = Number(input.mismatchCount) || 0
  const outcome = input.queued
    ? 'queued'
    : !input.changed
      ? 'ignored'
      : input.published && canonicalMismatchCount === 0 ? 'accepted' : 'superseded'
  if (!input.queued && input.changed) {
    companionTrackCanonicalMismatch(input.event, input.provider, canonicalMismatchCount, canonicalPublishedAt)
  }
  runtimeDiagnostics.record({
    level: outcome === 'accepted' || outcome === 'superseded' ? 'info' : 'debug',
    scope: 'task-push',
    event: input.event,
    outcome,
    durationMs: Date.now() - input.startedAt,
    slowMs: 50,
    count: input.count,
    cache: input.cache,
    details: { ...input.details, canonicalMismatchCount, canonicalPublishedAt }
  })
  return outcome
}

const companionCanonicalMismatchStreak = new Map()
const COMPANION_MISMATCH_REPAIR_AFTER = 3

/**
 * A proposal the Kernel accepted may still disagree with the published package.
 * Recording that as `superseded` names the symptom but repairs nothing, so a
 * genuinely stuck task stays stuck — observed in a real host for 23 minutes at
 * a constant mismatch of one. Detection must therefore carry an action: a
 * streak of disagreements queues the narrow reconciliation for that provider.
 */
function companionTrackCanonicalMismatch(event, provider, mismatchCount, canonicalPublishedAt) {
  const previous = companionCanonicalMismatchStreak.get(event)
  if (!mismatchCount) {
    companionCanonicalMismatchStreak.delete(event)
    return
  }
  // Only a mismatch that survives a *stationary* canonical package is stuck. If
  // the package advanced between two disagreements the reducer is still making
  // progress, and queueing a repair there would republish identical semantics.
  const stationary = previous && previous.publishedAt === canonicalPublishedAt
  const streak = stationary ? previous.streak + 1 : 1
  if (streak < COMPANION_MISMATCH_REPAIR_AFTER) {
    companionCanonicalMismatchStreak.set(event, { streak, publishedAt: canonicalPublishedAt })
    return
  }
  companionCanonicalMismatchStreak.delete(event)
  runtimeDiagnostics.record({
    level: 'warn',
    scope: 'task-push',
    event: 'canonical-mismatch-repair',
    outcome: 'queued',
    durationMs: 0,
    slowMs: 0,
    count: mismatchCount,
    details: { source: event, provider, streak }
  })
  queueCompanionHostReconciliation(provider)
}

function applyCodexActivityToCompanionKernel(delta) {
  const startedAt = Date.now()
  const source = codexRecord(delta)
  const current = companionTaskKernel?.getPackage?.()
  const generation = Number(source.generation) || 0
  const inventoryChanged = source.inventoryChanged === true
  if (!current?.complete || !current.providers.codex || !generation) {
    recordCompanionProbeGate('codex-activity-gate', 'prerequisite-missing', {
      packageComplete: current?.complete === true,
      providerEnabled: current?.providers?.codex === true,
      generation
    })
    return false
  }
  // Membership signals are recovery triggers, not authoritative inventories.
  // Queue the narrow Codex reconciliation before any phase/unread freshness
  // gate so a same-generation new/archive event cannot be swallowed.
  if (inventoryChanged) queueCompanionHostReconciliation('codex')
  const currentLanes = current?.sourceLaneGenerations?.codex || { phase: current?.sourceGenerations?.codex || 0, unread: current?.sourceGenerations?.codex || 0 }
  const byKey = new Map((Array.isArray(source.entries) ? source.entries : []).map((value) => {
    const entry = codexRecord(value)
    return [typeof entry.key === 'string' ? entry.key : '', entry]
  }))
  const archived = new Set(Array.isArray(source.archivedKeys) ? source.archivedKeys.filter((key) => typeof key === 'string') : [])
  const phaseAccepted = generation > currentLanes.phase
    && [...byKey.values()].some((entry) => entry.readStateOnly !== true)
  const unreadAccepted = generation > currentLanes.unread
    && [...byKey.values()].some((entry) => typeof entry.hasUnreadTurn === 'boolean' && entry.unreadAuthority !== 'unavailable')
  if (!phaseAccepted && !unreadAccepted && archived.size === 0) {
    // An empty delta carries no lane evidence at all, so neither `.some()` can
    // pass. Reporting that as a stale lane hides the real ordering failures in
    // the same counter; reconciliation was already queued above either way.
    recordCompanionProbeGate('codex-activity-gate', byKey.size === 0 ? 'empty-delta' : 'stale-lanes', {
      generation,
      currentLanes,
      inventoryChanged,
      entryCount: byKey.size
    })
    return inventoryChanged
  }
  let changed = archived.size > 0
  let phaseMatched = false
  let unreadMatched = false
  const matchedKeys = new Set()
  const phaseMatchedKeys = new Set()
  const unreadMatchedKeys = new Set()
  const tasks = []
  for (const task of current.tasks) {
    if (task.provider !== 'codex') {
      tasks.push(task)
      continue
    }
    if (archived.has(task.key)) continue
    const entry = byKey.get(task.key)
    if (!entry) {
      tasks.push(task)
      continue
    }
    matchedKeys.add(task.key)
    const readStateOnly = entry.readStateOnly === true
    const acceptPhaseForTask = phaseAccepted && !readStateOnly
    const acceptUnreadForTask = unreadAccepted && typeof entry.hasUnreadTurn === 'boolean' && entry.unreadAuthority !== 'unavailable'
    if (!acceptPhaseForTask && !acceptUnreadForTask) {
      tasks.push(task)
      continue
    }
    if (acceptPhaseForTask) {
      phaseMatched = true
      phaseMatchedKeys.add(task.key)
    }
    if (acceptUnreadForTask) {
      unreadMatched = true
      unreadMatchedKeys.add(task.key)
    }
    const decision = acceptPhaseForTask ? companionCodexPhaseDecision({ ...task, ...entry, previousPhase: task.phase }) : null
    const phase = decision ? decision.phase : task.phase
    const freshness = decision ? decision.freshness : task.freshness
    const unread = acceptUnreadForTask ? entry.hasUnreadTurn : task.unread
    const unreadKnown = acceptUnreadForTask ? true : task.unreadKnown
    const planImplementation = acceptPhaseForTask ? entry.planImplementationOnly === true : task.planImplementation
    const exactDefaultExecution = acceptPhaseForTask && entry.turnMode === 'default' && phase === 'running'
    const planReady = exactDefaultExecution
      ? false
      : acceptPhaseForTask && entry.planReady === true
        ? true
        : task.planReady === true
    const planLifecycleRevision = planReady
      ? Number(entry.planLifecycleRevision) || Number(task.planLifecycleRevision) || Number(entry.lastTurnStartedAt) || Number(task.revisionAt) || 1
      : 0
    const phaseChanged = phase !== task.phase
      || freshness !== task.freshness
      || planImplementation !== task.planImplementation
      || planReady !== task.planReady
      || planLifecycleRevision !== task.planLifecycleRevision
    const unreadChanged = unread !== task.unread || unreadKnown !== task.unreadKnown
    const evidenceRevision = Math.max(
      Number(entry.waitingSince) || 0,
      Number(entry.lastTurnCompletedAt) || 0,
      Number(entry.lastTurnStartedAt) || 0,
      Number(entry.updatedAt) || 0
    )
    const revisionAt = phaseChanged || unreadChanged ? Math.max(task.revisionAt, evidenceRevision) : task.revisionAt
    const phaseEnteredAt = Number(entry.waitingSince)
      || Number(entry.lastTurnCompletedAt)
      || Number(entry.lastTurnStartedAt)
      || task.statusEnteredAt
    const next = {
      ...task,
      phase,
      freshness,
      cycleTier: 'none',
      dynamicGroup: 'none',
      revisionAt,
      observationGeneration: Math.max(Number(task.observationGeneration) || 0, generation),
      phaseRevision: acceptPhaseForTask
        ? Math.max(Number(task.phaseRevision) || 0, generation)
        : task.phaseRevision,
      unreadRevision: acceptUnreadForTask
        ? Math.max(Number(task.unreadRevision) || 0, generation)
        : task.unreadRevision,
      statusEnteredAt: phaseChanged ? phaseEnteredAt : task.statusEnteredAt,
      turnStartedAt: acceptPhaseForTask
        ? Number(entry.lastTurnStartedAt) || task.turnStartedAt
        : task.turnStartedAt,
      terminalAt: acceptPhaseForTask && (phase === 'completed' || phase === 'stopped')
        ? Number(entry.lastTurnCompletedAt) || Number(entry.lastTurnStartedAt) || task.terminalAt
        : phase === 'running' || phase === 'waiting-input' || phase === 'waiting-approval' ? 0 : task.terminalAt,
      unread,
      unreadKnown,
      planImplementation,
      planReady,
      planLifecycleRevision,
      turnMode: acceptPhaseForTask && (entry.turnMode === 'plan' || entry.turnMode === 'default') ? entry.turnMode : task.turnMode,
      idleConfirmed: acceptPhaseForTask ? entry.idleConfirmed === true : task.idleConfirmed,
      // A phase-only event cannot refresh the archive transaction fingerprint.
      // It publishes the status immediately but waits for a verified inventory
      // before enabling a newly terminal archive action.
      capabilities: {
        ...task.capabilities,
        archive: acceptPhaseForTask
          ? task.capabilities.archive && (phase === 'completed' || phase === 'stopped')
          : task.capabilities.archive
      }
    }
    if (phaseChanged || unreadChanged) changed = true
    if (decision && phase !== task.phase) {
      recordCompanionStateDecision(
        'codex',
        task.key,
        decision,
        entry.lastTurnEvidence || 'inventory',
        task,
        next,
        generation,
        current.packageRevision + 1
      )
    }
    tasks.push(next)
  }
  if (phaseAccepted) {
    for (const [key, entry] of byKey) {
      if (!key || matchedKeys.has(key) || archived.has(key) || entry.readStateOnly === true) continue
      const actionAlias = typeof entry.actionAlias === 'string' ? entry.actionAlias : ''
      if (!actionAlias) continue
      // A newly observed row has no prior semantic phase. Hydration/inventory
      // `active` without a real-time Turn/activity witness must therefore stay
      // unknown instead of inheriting a fabricated running baseline.
      const decision = companionCodexPhaseDecision({ ...entry, previousPhase: 'unknown' })
      const phase = decision.phase
      const liveTransitionAt = decision.details?.activeCurrent === true || decision.details?.waitingCurrent === true
        ? Number(source.receivedAt) || 0
        : 0
      const revisionAt = Math.max(
        Number(entry.updatedAt) || 0,
        Number(entry.waitingSince) || 0,
        Number(entry.lastTurnCompletedAt) || 0,
        Number(entry.lastTurnStartedAt) || 0,
        generation
      )
      const unreadKnown = typeof entry.hasUnreadTurn === 'boolean' && entry.unreadAuthority !== 'unavailable'
      const unread = entry.hasUnreadTurn === true
      const statusEnteredAt = Number(entry.waitingSince)
        || Number(entry.lastTurnCompletedAt)
        || Number(entry.lastTurnStartedAt)
        || liveTransitionAt
        || 0
      tasks.push({
        key,
        provider: 'codex',
        kind: 'codex-thread',
        phase,
        cycleTier: 'none',
        dynamicGroup: 'none',
        actionAlias,
        revisionAt,
        semanticRevision: 1,
        observationGeneration: generation,
        membershipRevision: generation,
        phaseRevision: generation,
        unreadRevision: unreadKnown ? generation : 0,
        visibilityRevision: revisionAt,
        statusEnteredAt,
        turnStartedAt: Number(entry.lastTurnStartedAt) || 0,
        terminalAt: phase === 'completed'
          ? Number(entry.lastTurnCompletedAt) || Number(entry.lastTurnStartedAt) || 0
          : phase === 'stopped' ? Number(entry.lastTurnStartedAt) || 0 : 0,
        metadataRevision: Number(entry.updatedAt) || revisionAt,
        capabilityToken: actionAlias,
        freshness: decision.freshness === 'verifying' ? 'verifying' : 'fresh',
        lastQuestionAt: Number(entry.lastTurnStartedAt) || 0,
        createdAt: 0,
        displayOrder: tasks.length,
        cycleOrder: tasks.length,
        attentionOrder: tasks.length,
        hidden: false,
        unreadKnown,
        unread,
        planImplementation: entry.planImplementationOnly === true,
        planReady: entry.planReady === true || entry.planImplementationOnly === true,
        planLifecycleRevision: Number(entry.planLifecycleRevision) || (entry.planReady === true ? Number(entry.lastTurnStartedAt) || revisionAt : 0),
        paused: false,
        turnMode: entry.turnMode === 'plan' || entry.turnMode === 'default' ? entry.turnMode : 'unknown',
        idleConfirmed: entry.idleConfirmed === true,
        localPin: false,
        dynamicEligible: statusEnteredAt > 0,
        capabilities: { open: true, archive: false, pause: true, resume: true, executePlan: false },
        displayName: typeof entry.displayName === 'string' ? entry.displayName : '新 Codex 任务',
        ...(typeof entry.projectKey === 'string' ? { projectKey: entry.projectKey } : {}),
        ...(typeof entry.projectName === 'string' ? { projectName: entry.projectName } : {}),
        ...(entry.projectKind === 'project' || entry.projectKind === 'chats' ? { projectKind: entry.projectKind } : {})
      })
      matchedKeys.add(key)
      phaseMatched = true
      phaseMatchedKeys.add(key)
      if (unreadKnown) unreadMatched = true
      if (unreadKnown) unreadMatchedKeys.add(key)
      changed = true
      recordCompanionStateDecision('codex', key, decision, 'membership-minimal')
    }
  }
  const published = publishCompanionHostTasks(tasks, {
    acceptedAt: source.receivedAt,
    sourceLaneGenerations: {
      codex: {
        ...(phaseMatched ? { phase: generation } : {}),
        ...(unreadMatched ? { unread: generation } : {})
      }
    }
  })
  const canonical = companionTaskKernel?.getPackage?.()
  const canonicalMismatchCount = companionCanonicalProposalMismatchCount(
    tasks,
    canonical,
    phaseMatchedKeys,
    [(task) => task.phase],
    archived
  ) + companionCanonicalProposalMismatchCount(
    tasks,
    canonical,
    unreadMatchedKeys,
    [(task) => task.unread, (task) => task.unreadKnown]
  )
  recordCompanionProposalOutcome({
    event: 'codex-activity',
    provider: 'codex',
    startedAt,
    changed,
    published,
    canonical,
    mismatchCount: canonicalMismatchCount,
    count: byKey.size + archived.size,
    cache: 'process-package',
    details: {
      generation,
      currentLanes,
      phaseAccepted,
      unreadAccepted,
      phaseMatched,
      unreadMatched,
      inventoryChanged,
      archivedCount: archived.size,
      receivedAt: Number(source.receivedAt) || 0,
      hostCommittedAt: Date.now()
    }
  })
  return changed || inventoryChanged
}

function applyClaudeStateToCompanionKernel() {
  const startedAt = Date.now()
  const current = companionTaskKernel?.getPackage?.()
  if (!current?.complete || !current.providers.claude || !claudeBridge?.readCodeStateSnapshot) {
    recordCompanionProbeGate('claude-state-gate', 'prerequisite-missing', {
      packageComplete: current?.complete === true,
      providerEnabled: current?.providers?.claude === true,
      readerAvailable: Boolean(claudeBridge?.readCodeStateSnapshot)
    })
    return false
  }
  let snapshot
  try { snapshot = claudeBridge.readCodeStateSnapshot({ now: Date.now() }) } catch {
    runtimeDiagnostics.record({ scope: 'task-push', event: 'claude-state', outcome: 'failed', code: 'provider-read-failed', durationMs: Date.now() - startedAt, slowMs: 50, level: 'error', cache: 'provider-direct' })
    return false
  }
  const source = codexRecord(snapshot)
  const generation = Number(source.generation || source.stateGeneration) || 0
  const currentPhaseGeneration = Number(current.sourceLaneGenerations?.claude?.phase) || current.sourceGenerations.claude
  if (!generation || generation <= currentPhaseGeneration || !Array.isArray(source.sessions)) {
    recordCompanionProbeGate('claude-state-gate', 'stale-or-invalid', {
      generation,
      currentPhaseGeneration,
      sessionsAvailable: Array.isArray(source.sessions)
    })
    return false
  }
  const byAlias = new Map(source.sessions.map((value) => {
    const session = codexRecord(value)
    return [typeof session.sessionId === 'string' ? session.sessionId : '', session]
  }))
  let changed = false
  const proposalKeys = new Set()
  const tasks = current.tasks.map((task) => {
    if (task.provider !== 'claude') return task
    const session = byAlias.get(task.actionAlias)
    if (!session) return task
    const sourcePhase = isKnownTaskPhase(session.phase)
      ? session.phase
      : task.phase
    const decision = companionClaudePhaseDecision(sourcePhase, task.unread)
    const phase = decision.phase
    const archive = (phase === 'completed' || phase === 'stopped')
      && (session.stateCompatibility === 'compatible' || session.compatibility === 'compatible')
    const semanticChanged = phase !== task.phase || archive !== task.capabilities.archive
    const phaseEvidenceRevision = Number(session.waitingApprovalAt)
      || Number(session.waitingInputAt)
      || Number(session.lastStopAt)
      || Number(session.phaseUpdatedAt)
      || Number(source.readAt)
      || task.phaseRevision
    const revisionAt = Math.max(
      task.revisionAt,
      ...(semanticChanged
        ? [Number(session.phaseUpdatedAt) || 0, Number(session.turnStartedAt) || 0, Number(session.lastStopAt) || 0]
        : [])
    )
    const next = {
      ...task,
      phase,
      cycleTier: 'none',
      dynamicGroup: 'none',
      revisionAt,
      phaseRevision: Math.max(Number(task.phaseRevision) || 0, phaseEvidenceRevision),
      statusEnteredAt: phase !== task.phase ? phaseEvidenceRevision : task.statusEnteredAt,
      planImplementation: false,
      capabilities: {
        ...task.capabilities,
        archive
      }
    }
    if (semanticChanged) {
      changed = true
      proposalKeys.add(task.key)
    }
    if (phase !== task.phase) recordCompanionStateDecision('claude', task.key, decision, task.unread ? 'native-unread' : session.stateSource || 'provider-state')
    return next
  })
  const published = publishCompanionHostTasks(tasks, {
    acceptedAt: source.readAt,
    sourceLaneGenerations: { claude: { phase: generation } }
  })
  const canonical = companionTaskKernel?.getPackage?.()
  const canonicalMismatchCount = companionCanonicalProposalMismatchCount(
    tasks,
    canonical,
    proposalKeys,
    [(task) => task.phase, (task) => task.capabilities?.archive === true]
  )
  recordCompanionProposalOutcome({
    event: 'claude-state',
    provider: 'claude',
    startedAt,
    changed,
    published,
    canonical,
    mismatchCount: canonicalMismatchCount,
    count: source.sessions.length,
    cache: 'provider-direct',
    details: {
      generation,
      previousGeneration: currentPhaseGeneration,
      readAt: Number(source.readAt) || 0,
      sessionCount: source.sessions.length
    }
  })
  return changed
}

async function applyClaudeUnreadToCompanionKernel() {
  const startedAt = Date.now()
  const admitted = companionTaskKernel?.getPackage?.()
  if (!admitted?.complete || !admitted.providers.claude || !claudeBridge?.readCodeUnread) {
    recordCompanionProbeGate('claude-unread-gate', 'prerequisite-missing', {
      packageComplete: admitted?.complete === true,
      providerEnabled: admitted?.providers?.claude === true,
      readerAvailable: Boolean(claudeBridge?.readCodeUnread)
    })
    return false
  }
  let snapshot
  try { snapshot = await Promise.resolve(claudeBridge.readCodeUnread()) } catch {
    runtimeDiagnostics.record({ scope: 'task-push', event: 'claude-unread', outcome: 'failed', code: 'provider-read-failed', durationMs: Date.now() - startedAt, slowMs: 50, level: 'error', cache: 'provider-direct' })
    return false
  }
  const source = codexRecord(snapshot)
  if (!Array.isArray(source.ids)) {
    recordCompanionProbeGate('claude-unread-gate', 'invalid-snapshot', { idsAvailable: false })
    return false
  }
  const generation = Number(source.generation || source.readAt) || 0
  const readAt = Number(source.readAt) || Date.now()
  const ids = new Set(source.ids.filter((value) => typeof value === 'string'))
  // Membership may change while the unread file read is in flight. Rebase the
  // lane patch on the latest package so this partial update cannot delete a
  // newly-created session by replaying an older full task array.
  const current = companionTaskKernel?.getPackage?.()
  if (!current?.complete || !current.providers.claude) {
    recordCompanionProbeGate('claude-unread-gate', 'package-changed-during-read', {
      packageComplete: current?.complete === true,
      providerEnabled: current?.providers?.claude === true,
      generation
    })
    return false
  }
  const currentGeneration = Number(current.sourceLaneGenerations?.claude?.unread) || current.sourceGenerations.claude
  if (!generation || generation <= currentGeneration) {
    recordCompanionProbeGate('claude-unread-gate', 'stale-generation', { generation, currentGeneration, unreadCount: ids.size })
    return false
  }
  companionClaudeUnreadSnapshot = { ids, generation: Number(source.generation) || 0, readAt, available: true }
  let changed = false
  const proposalKeys = new Set()
  const tasks = current.tasks.map((task) => {
    if (task.provider !== 'claude') return task
    const unread = ids.has(task.actionAlias)
    const decision = companionClaudePhaseDecision(task.phase, unread)
    const phase = decision.phase
    const semanticChanged = unread !== task.unread || task.unreadKnown !== true || phase !== task.phase
    if (semanticChanged) {
      changed = true
      proposalKeys.add(task.key)
    }
    if (semanticChanged) {
      recordCompanionStateDecision('claude', task.key, decision, unread ? 'native-unread' : 'provider-state')
    }
    return {
      ...task,
      phase,
      unread,
      unreadKnown: true,
      unreadRevision: Math.max(Number(task.unreadRevision) || 0, readAt),
      revisionAt: semanticChanged ? Math.max(task.revisionAt, readAt) : task.revisionAt,
      phaseRevision: phase !== task.phase ? Math.max(Number(task.phaseRevision) || 0, readAt) : task.phaseRevision,
      statusEnteredAt: phase !== task.phase ? readAt : task.statusEnteredAt,
      cycleTier: 'none',
      dynamicGroup: 'none',
      capabilities: { ...task.capabilities, archive: phase === 'completed' || phase === 'stopped' ? task.capabilities.archive : false }
    }
  })
  const published = publishCompanionHostTasks(tasks, {
    acceptedAt: readAt,
    sourceLaneGenerations: { claude: { unread: generation } }
  })
  const canonical = companionTaskKernel?.getPackage?.()
  const canonicalMismatchCount = companionCanonicalProposalMismatchCount(
    tasks,
    canonical,
    proposalKeys,
    [(task) => task.phase, (task) => task.unread, (task) => task.unreadKnown]
  )
  recordCompanionProposalOutcome({
    event: 'claude-unread',
    provider: 'claude',
    startedAt,
    changed,
    published,
    canonical,
    mismatchCount: canonicalMismatchCount,
    count: ids.size,
    cache: 'provider-direct',
    details: {
      generation,
      previousGeneration: currentGeneration,
      readAt,
      unreadCount: ids.size
    }
  })
  return changed
}

function companionTaskFromClaudeSession(sessionValue, previous, acceptedAt) {
  const session = codexRecord(sessionValue)
  const sessionId = typeof session.sessionId === 'string' ? session.sessionId : ''
  if (!sessionId) return null
  const evidenceRevision = Math.max(
    Number(session.stateGeneration) || 0,
    Number(session.phaseUpdatedAt) || 0,
    Number(session.turnStartedAt) || 0,
    Number(session.lastStopAt) || 0,
    Number(session.lastActivityAt) || 0,
    Number(session.metadataUpdatedAt) || 0,
    Number(acceptedAt) || 0
  )
  if (!evidenceRevision) return null
  const unread = companionClaudeUnreadSnapshot.available
    ? companionClaudeUnreadSnapshot.ids.has(sessionId)
    : previous?.unread === true
  const unreadKnown = companionClaudeUnreadSnapshot.available || previous?.unreadKnown === true
  const sourcePhase = isKnownTaskPhase(session.phase)
    ? session.phase
    : previous?.phase || 'unknown'
  const decision = companionClaudePhaseDecision(sourcePhase, unread)
  const phase = decision.phase
  const localPin = previous?.localPin === true
  const phaseChanged = !previous || phase !== previous.phase
  const phaseStatusAt = Number(session.waitingApprovalAt)
    || Number(session.waitingInputAt)
    || Number(session.lastStopAt)
    || Number(session.phaseUpdatedAt)
    || Number(session.turnStartedAt)
    || Number(session.createdAt)
    || 0
  const phaseEvidenceRevision = phaseStatusAt
    || Number(session.stateGeneration)
    || evidenceRevision
  const compatibility = typeof session.stateCompatibility === 'string'
    ? session.stateCompatibility
    : typeof session.compatibility === 'string' ? session.compatibility : ''
  const archive = (phase === 'completed' || phase === 'stopped')
    && (compatibility === 'compatible' || (!compatibility && previous?.capabilities?.archive === true))
  const dynamicEligible = Math.max(Number(session.turnStartedAt) || 0, Number(session.lastActivityAt) || 0)
    >= Date.now() - companionTaskConfiguration().dynamicTaskWindowHours * 60 * 60 * 1_000
  const semanticChanged = !previous
    || phaseChanged
    || unread !== previous.unread
    || unreadKnown !== previous.unreadKnown
    || archive !== previous.capabilities?.archive
    || dynamicEligible !== previous.dynamicEligible
    || sessionId !== previous.actionAlias
  const revisionAt = semanticChanged ? Math.max(Number(previous?.revisionAt) || 0, evidenceRevision) : previous.revisionAt
  if (!previous || phase !== previous.phase) {
    recordCompanionStateDecision('claude', `claude:${sessionId}`, decision, unread ? 'native-unread' : session.stateSource || 'provider-state')
  }
  return {
    ...(previous || {}),
    key: `claude:${sessionId}`,
    provider: 'claude',
    kind: localPin ? 'local-pin' : 'claude-session',
    phase,
    cycleTier: 'none',
    dynamicGroup: 'none',
    actionAlias: sessionId,
    revisionAt,
    membershipRevision: Math.max(Number(session.lastActivityAt) || 0, Number(session.metadataUpdatedAt) || 0, Number(acceptedAt) || 0),
    phaseRevision: phaseChanged ? phaseEvidenceRevision : previous?.phaseRevision || phaseEvidenceRevision,
    unreadRevision: companionClaudeUnreadSnapshot.available
      ? companionClaudeUnreadSnapshot.readAt || companionClaudeUnreadSnapshot.generation || revisionAt
      : previous?.unreadRevision || revisionAt,
    visibilityRevision: Math.max(Number(session.metadataUpdatedAt) || 0, Number(acceptedAt) || 0),
    statusEnteredAt: phaseChanged ? phaseStatusAt : previous?.statusEnteredAt || phaseStatusAt,
    lastQuestionAt: Number(session.turnStartedAt) || previous?.lastQuestionAt || 0,
    createdAt: Number(session.createdAt) || previous?.createdAt || 0,
    displayOrder: previous?.displayOrder || 0,
    cycleOrder: previous?.cycleOrder || 0,
    attentionOrder: previous?.attentionOrder || 0,
    hidden: false,
    unread,
    unreadKnown,
    planImplementation: false,
    planReady: false,
    planLifecycleRevision: 0,
    paused: false,
    turnMode: 'unknown',
    idleConfirmed: false,
    localPin,
    dynamicEligible,
    capabilities: {
      open: true,
      archive,
      pause: false,
      resume: false,
      executePlan: false
    }
  }
}

function applyClaudeInventoryDeltaToCompanionKernel(delta) {
  const startedAt = Date.now()
  const current = companionTaskKernel?.getPackage?.()
  const source = codexRecord(delta)
  if (!current?.complete || !current.providers.claude || !Array.isArray(source.mutations)) {
    recordCompanionProbeGate('claude-inventory-gate', 'reconciliation-required', {
      packageComplete: current?.complete === true,
      providerEnabled: current?.providers?.claude === true,
      mutationsAvailable: Array.isArray(source.mutations)
    })
    queueCompanionHostReconciliation('claude')
    return false
  }
  const currentMembership = Number(current.sourceLaneGenerations?.claude?.membership) || current.sourceGenerations.claude
  const acceptedAt = Math.max(Number(source.acceptedAt) || Date.now(), currentMembership + 1)
  const byKey = new Map(current.tasks.map((task) => [task.key, task]))
  let changed = false
  let exact = true
  const proposalKeys = new Set()
  const removedKeys = new Set()
  for (const value of source.mutations) {
    const mutation = codexRecord(value)
    const key = typeof mutation.key === 'string' ? mutation.key : ''
    if (!key.startsWith('claude:')) { exact = false; continue }
    if (mutation.mutation === 'remove' || mutation.mutation === 'archived') {
      if (byKey.delete(key)) {
        changed = true
        removedKeys.add(key)
      }
      continue
    }
    if (mutation.mutation !== 'upsert' || !mutation.session) { exact = false; continue }
    const next = companionTaskFromClaudeSession(mutation.session, byKey.get(key), acceptedAt)
    if (!next) { exact = false; continue }
    if (JSON.stringify(next) !== JSON.stringify(byKey.get(key))) {
      changed = true
      proposalKeys.add(key)
    }
    byKey.set(key, next)
  }
  const tasks = [...byKey.values()]
  const published = exact && publishCompanionHostTasks(tasks, {
    acceptedAt,
    sourceLaneGenerations: { claude: { membership: acceptedAt } }
  })
  if (!exact) queueCompanionHostReconciliation('claude')
  const canonical = exact ? companionTaskKernel?.getPackage?.() : null
  const canonicalMismatchCount = exact
    ? companionCanonicalProposalMismatchCount(
        tasks,
        canonical,
        proposalKeys,
        [
          (task) => task.phase,
          (task) => task.unread,
          (task) => task.unreadKnown,
          (task) => task.actionAlias,
          (task) => task.capabilities?.archive === true
        ],
        removedKeys
      )
    : 0
  recordCompanionProposalOutcome({
    event: 'claude-inventory',
    provider: 'claude',
    startedAt,
    queued: !exact,
    changed,
    published,
    canonical,
    mismatchCount: canonicalMismatchCount,
    count: source.mutations.length,
    cache: exact ? 'provider-direct' : 'none',
    details: {
      acceptedAt,
      previousMembershipGeneration: currentMembership,
      exact,
      mutationCount: source.mutations.length
    }
  })
  return changed
}

function queueCompanionHostReconciliation(provider = '') {
  if (!companionTaskKernel) return
  const requestedProvider = provider === 'codex' || provider === 'claude' ? provider : ''
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
        ? { codex: requestedProvider === 'codex', claude: requestedProvider === 'claude' }
        : current.providers
      return preflightCompanionTaskPackage({ providers: requestedProviders }).then((draft) => {
        if (!requestedProvider) return draft
        const otherTasks = current.tasks.filter((task) => task.provider !== requestedProvider)
        const providerTasks = [...draft.tasks]
        if (requestedProvider === 'codex' && codexLocalArchiveRecoverySuppressions.size) {
          const retainedKeys = new Set([...codexLocalArchiveRecoverySuppressions].map(codexThreadKey))
          const nextKeys = new Set(providerTasks.map((task) => task.key))
          for (const task of current.tasks) {
            if (task.provider !== 'codex' || !retainedKeys.has(task.key) || nextKeys.has(task.key)) continue
            providerTasks.push(task)
            nextKeys.add(task.key)
          }
        }
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
          tasks: [...otherTasks, ...providerTasks]
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
        count: draft.tasks.length,
        cache: 'cold-read',
        details: { requestedProvider: requestedProvider || 'all', taskCount: draft.tasks.length }
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
  try { companionClaudeInventoryDispose = claudeBridge?.watchCodeSessions?.((delta) => applyClaudeInventoryDeltaToCompanionKernel(delta)) || null } catch {}
  try { companionClaudeUnreadDispose = claudeBridge?.watchCodeUnread?.(() => { void applyClaudeUnreadToCompanionKernel() }) || null } catch {}
}

function runtimeIdentityHandshake(input = {}) {
  const expected = input && typeof input === 'object' ? input : {}
  const actual = {
    hostAssetId: typeof runtimeIdentityArtifact?.hostAssetId === 'string' ? runtimeIdentityArtifact.hostAssetId : '',
    rendererAssetId: typeof runtimeIdentityArtifact?.rendererAssetId === 'string' ? runtimeIdentityArtifact.rendererAssetId : '',
    kernelRevision: companionTaskKernel?.revision || '',
    taskPackageRevision: companionTaskKernel?.packageRevision || ''
  }
  const expectation = {
    hostAssetId: typeof expected.hostAssetId === 'string' ? expected.hostAssetId : '',
    rendererAssetId: typeof expected.rendererAssetId === 'string' ? expected.rendererAssetId : '',
    kernelRevision: typeof expected.kernelRevision === 'string' ? expected.kernelRevision : '',
    taskPackageRevision: typeof expected.taskPackageRevision === 'string' ? expected.taskPackageRevision : ''
  }
  runtimeIdentityCompatible = runtimeIdentityArtifact?.revision === RUNTIME_IDENTITY_REVISION
    && runtimeIdentityArtifact?.artifactState === 'artifact-ready'
    && Object.keys(actual).every((key) => actual[key] && actual[key] === expectation[key])
  const result = {
    revision: RUNTIME_IDENTITY_REVISION,
    status: runtimeIdentityCompatible ? 'host-loaded' : 'reload-required',
    expected: expectation,
    actual,
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
        actualTaskPackageRevision: actual.taskPackageRevision,
        expectedTaskPackageRevision: expectation.taskPackageRevision,
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
      ? activateCodexFloat({ command: 'quick' })
      : false
    const consumedByKernel = quickEntryConsumed || Boolean(companionTaskKernel?.handleEnter(action))
    runtimeDiagnostics.record({
      level: 'info',
      scope: 'plugin-lifecycle',
      event: 'plugin-enter',
      outcome: consumedByKernel ? 'kernel-consumed' : 'renderer-dispatched',
      details: { consumedByKernel, quickEntryConsumed, hasAction: Boolean(action) }
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
      details: { isKill: Boolean(isKill), floatPersistent: codexFloatPersistent }
    })
    if (isKill) {
      if (codexFloatHealthTimer) clearTimeout(codexFloatHealthTimer)
      codexFloatHealthTimer = null
      codexActivityListeners.delete(applyCodexActivityToCompanionKernel)
      try { companionClaudeStateDispose?.() } catch {}
      try { companionClaudeInventoryDispose?.() } catch {}
      try { companionClaudeUnreadDispose?.() } catch {}
      companionClaudeStateDispose = null
      companionClaudeInventoryDispose = null
      companionClaudeUnreadDispose = null
      closeCodexInventoryMembershipWatchers()
      companionTaskKernel?.close()
      shutdownCodexEnvironmentActions()
      closeCodexActionRunner()
      // Kill is a process boundary: clear desired visibility with the window.
      codexFloatPersistent = false
      closeCodexFloat()
      closeCodexConnections({ force: true })
      return
    }
    // Ordinary mainHide/pluginOut must not tear down a float the last sync asked
    // to keep. Renderer remount may call float.close() without clearing that
    // intent; only sync({ visible:false }) or kill may clear it.
    if (!codexFloatPersistent) closeCodexFloat()
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

// Not a general TOML parser: accepts only the subset Environment files use,
// and a load failure means every environment file reads as unparseable
// rather than partially trusted.
function codexEnvUnquoteTomlString(raw) {
  return codexEnvironmentToml ? codexEnvironmentToml.codexEnvUnquoteTomlString(raw) : String(raw || '').trim()
}

function parseCodexEnvironmentTomlText(text) {
  return codexEnvironmentToml ? codexEnvironmentToml.parseCodexEnvironmentTomlText(text) : null
}

function codexEnvironmentActionIdFromName(name, index) {
  const slug = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return slug || `action-${index + 1}`
}

function tokenizeCodexEnvironmentActionCommandHost(command) {
  return codexCommandValidation ? codexCommandValidation.tokenizeCodexEnvironmentActionCommandHost(command) : null
}

function validateCodexEnvironmentActionCommandHost(command) {
  return codexCommandValidation ? codexCommandValidation.validateCodexEnvironmentActionCommandHost(command) : null
}

function codexEnvironmentIdFromFileName(fileName) {
  const base = String(fileName || '').replace(/\.toml$/i, '').trim().toLowerCase()
  const slug = base.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return slug || 'environment'
}

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

function rememberCodexEnvironmentCommands(vaultKey, environments) {
  codexActionAuthorization?.rememberCodexEnvironmentCommands(vaultKey, environments)
}

function listCodexProjectEnvironments(targetAlias) {
  const resolved = resolveCodexEnvironmentTargetCwd(targetAlias)
  if (resolved.errorCode) {
    return { outcome: 'failed', runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION, errorCode: resolved.errorCode, message: resolved.message, environments: [] }
  }
  const envDir = path.join(resolved.configRoot, '.codex', 'environments')
  let entries = []
  try {
    entries = fs.readdirSync(envDir, { withFileTypes: true })
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (code === 'ENOENT') {
      return { outcome: 'ok', runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION, projectKey: resolved.projectKey, targetId: resolved.targetId, environments: [], message: '未发现 Environment 配置' }
    }
    return { outcome: 'failed', runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION, errorCode: 'unreadable', message: '无法读取 Environment 配置', environments: [] }
  }
  const environments = []
  const seenEnvironmentIds = new Set()
  for (const entry of entries) {
    if (!entry.isFile() || !/\.toml$/i.test(entry.name)) continue
    let text = ''
    try { text = fs.readFileSync(path.join(envDir, entry.name), 'utf8') } catch { continue }
    const parsed = parseCodexEnvironmentTomlText(text)
    if (!parsed) continue
    const environmentFileFingerprint = crypto.createHash('sha256').update(text).digest('hex')
    const id = codexEnvironmentIdFromFileName(entry.name)
    if (seenEnvironmentIds.has(id)) {
      return { outcome: 'failed', runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION, errorCode: 'environment-id-collision', message: 'Environment 标识冲突，请检查文件名', environments: [] }
    }
    seenEnvironmentIds.add(id)
    const seen = new Set()
    const hostActions = []
    const actions = []
    parsed.actions.forEach((action, index) => {
      let actionId = codexEnvironmentActionIdFromName(action.name, index)
      if (seen.has(actionId)) actionId = `${actionId}-${index + 1}`
      seen.add(actionId)
      const validatedCommand = validateCodexEnvironmentActionCommandHost(action.command)
      if (!validatedCommand) return
      const risk = validatedCommand.risk
      const commandFingerprint = crypto.createHash('sha256').update(String(action.command || '')).digest('hex')
      hostActions.push({ id: actionId, name: action.name, icon: action.icon || 'run', validatedCommand, risk, environmentFileFingerprint, commandFingerprint })
      actions.push({
        id: actionId,
        name: String(action.name || '').trim().slice(0, 80) || `Action ${index + 1}`,
        icon: String(action.icon || 'run').trim().slice(0, 40) || 'run',
        risk,
        displayOnly: false,
        slotEligible: true
      })
    })
    environments.push({
      id,
      name: parsed.name || id,
      setupScriptPresent: Boolean(String(parsed.setupScript || '').trim()),
      actions,
      _hostActions: hostActions
    })
  }
  environments.sort((left, right) => left.id.localeCompare(right.id))
  rememberCodexEnvironmentCommands(resolved.targetId, environments)
  return {
    outcome: 'ok',
    runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
    projectKey: resolved.projectKey,
    targetId: resolved.targetId,
    environments: environments.map((item) => ({
      id: item.id,
      name: item.name,
      setupScriptPresent: item.setupScriptPresent,
      actions: item.actions
    }))
  }
}

function codexEnvironmentSessionKey(targetId, environmentId, actionId) {
  return `${targetId}\0${environmentId}\0${actionId}`
}

function sanitizeCodexEnvironmentSession(session) {
  if (!session) return null
  return {
    targetAlias: typeof session.targetAlias === 'string' && session.targetAlias ? session.targetAlias : (typeof session.projectKey === 'string' ? session.projectKey : ''),
    targetId: session.targetId,
    projectKey: session.projectKey,
    environmentId: session.environmentId,
    actionId: session.actionId,
    state: session.state,
    startedAt: session.startedAt,
    exitCode: typeof session.exitCode === 'number' ? session.exitCode : undefined,
    message: session.message || ''
  }
}

function listCodexEnvironmentActionSessions() {
  return [...codexEnvironmentActionSessions.values()].map(sanitizeCodexEnvironmentSession).filter(Boolean)
}

function stopCodexEnvironmentActionSession(input) {
  const requestedTargetId = typeof input?.targetId === 'string' ? input.targetId : ''
  const projectKey = typeof input?.projectKey === 'string' ? input.projectKey : ''
  const targetId = requestedTargetId || projectKey
  const environmentId = typeof input?.environmentId === 'string' ? input.environmentId : ''
  const actionId = typeof input?.actionId === 'string' ? input.actionId : ''
  if (!targetId || !environmentId || !actionId) return { outcome: 'failed', errorCode: 'invalid-request', message: '停止请求无效' }
  const key = codexEnvironmentSessionKey(targetId, environmentId, actionId)
  const session = codexEnvironmentActionSessions.get(key)
  if (!session) return { outcome: 'failed', errorCode: 'not-running', message: '没有运行中的 Action 会话' }
  if (projectKey && session.projectKey !== projectKey) return { outcome: 'failed', errorCode: 'target-mismatch', message: 'Action 目标身份不匹配' }
  if (session.state === 'stopping') return { outcome: 'stopping', session: sanitizeCodexEnvironmentSession(session) }
  session.state = 'stopping'
  session.message = '正在停止 Action'
  if (session.run) {
    session.run.status = 'stopping'
    session.run.message = session.message
    persistCodexActionRun(session.run)
    pushCodexActionRunnerSnapshot(session.message)
  }
  signalCodexEnvironmentSession(session)
  return { outcome: 'stopping', session: sanitizeCodexEnvironmentSession(session) }
}

function signalCodexEnvironmentSession(session) {
  try {
    if (process.platform !== 'win32' && typeof session.childPid === 'number') {
      process.kill(-session.childPid, 'SIGTERM')
      return
    }
    if (process.platform === 'win32' && typeof session.childPid === 'number') {
      const systemRoot = typeof process.env.SystemRoot === 'string' && process.env.SystemRoot.trim()
        ? path.win32.resolve(process.env.SystemRoot.trim())
        : 'C:\\Windows'
      const taskkill = /^[A-Za-z]:\\/.test(systemRoot)
        ? path.win32.join(systemRoot, 'System32', 'taskkill.exe')
        : 'C:\\Windows\\System32\\taskkill.exe'
      void run(taskkill, ['/PID', String(session.childPid), '/T']).then((result) => {
        if (!result.ok) {
          try { session.child?.kill?.('SIGTERM') } catch {}
        }
      })
      return
    }
    session.child?.kill?.('SIGTERM')
  } catch {
    try { session.child?.kill?.('SIGTERM') } catch {}
  }
}

function issueCodexEnvironmentConfirmToken(targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint) {
  return codexActionAuthorization?.issueCodexEnvironmentConfirmToken(targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint) || ''
}

function consumeCodexEnvironmentConfirmToken(token, targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint) {
  return codexActionAuthorization?.consumeCodexEnvironmentConfirmToken(token, targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint) === true
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

function shutdownCodexEnvironmentActions() {
  codexEnvironmentShuttingDown = true
  const sessions = [...codexEnvironmentActionSessions.values()]
  for (const session of sessions) {
    session.pendingRestart = null
    if (session.run && (session.run.status === 'running' || session.run.status === 'stopping')) {
      finishCodexActionRun(session.run, 'interrupted', undefined, '宿主进程结束，运行已中断')
    }
  }
  codexEnvironmentActionSessions.clear()
  codexActionAuthorization?.clearCodexActionAuthorization()
  for (const session of sessions) signalCodexEnvironmentSession(session)
  if (codexRunDatabase) codexRunDatabase.closeCodexActionRunDatabase()
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

function appendCodexActionRunLog(run, stream, chunk, privatePaths) {
  if (!run || !['stdout', 'stderr', 'system'].includes(stream)) return
  const state = codexActionLogStream(run, stream, privatePaths)
  codexActionConsumeDecodedLog(run, stream, state, state.decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ''))))
}

function finalizeCodexActionRunLogs(run) {
  if (!run?._logStreams) {
    codexActionFlushLog(run)
    return
  }
  for (const [stream, state] of run._logStreams) codexActionConsumeDecodedLog(run, stream, state, state.decoder.end(), true)
  codexActionFlushLog(run)
  run._logStreams.clear()
}

function createCodexActionRun(input, resolved, hostAction, launch = null) {
  ensureCodexActionRunDatabase()
  const run = {
    version: 1,
    runId: `car_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('base64url')}`,
    laneId: `${encodeURIComponent(resolved.targetId)}:${encodeURIComponent(input.environmentId)}:${encodeURIComponent(input.actionId)}`,
    projectKey: resolved.projectKey,
    projectName: String(input.projectName || resolved.projectKey).slice(0, 120),
    environmentId: input.environmentId,
    environmentName: String(input.environmentName || input.environmentId).slice(0, 120),
    actionId: input.actionId,
    actionName: String(input.actionName || hostAction.name || input.actionId).slice(0, 120),
    risk: hostAction.risk,
    status: 'running',
    startedAt: Date.now(),
    logText: '',
    logBytes: 0,
    logLines: 0,
    message: '正在执行',
    cursor: 0,
    runtimeMode: launch?.runtime?.mode,
    runtimeSource: launch?.runtime?.source,
    runtimeVersion: launch?.runtime?.version,
    runtimeLabel: launch?.runtime?.label
  }
  if (codexRunDatabase) codexRunDatabase.rememberCodexActionRun(run)
  persistCodexActionRun(run)
  return run
}

function recordCodexActionRestartFailure(input, result) {
  const now = Date.now()
  const run = {
    version: 1,
    runId: `car_${now.toString(36)}_${crypto.randomBytes(6).toString('base64url')}`,
    laneId: `${encodeURIComponent(String(input.targetId || input.projectKey || ''))}:${encodeURIComponent(String(input.environmentId || ''))}:${encodeURIComponent(String(input.actionId || ''))}`,
    projectKey: String(input.projectKey || '').slice(0, 160),
    projectName: String(input.projectName || input.projectKey || '项目').slice(0, 120),
    environmentId: String(input.environmentId || '').slice(0, 64),
    environmentName: String(input.environmentName || input.environmentId || 'Environment').slice(0, 120),
    actionId: String(input.actionId || '').slice(0, 80),
    actionName: String(input.actionName || input.actionId || 'Serve').slice(0, 120),
    risk: 'long-running',
    status: 'failed',
    startedAt: now,
    endedAt: now,
    logText: '',
    logBytes: 0,
    logLines: 0,
    message: String(result?.message || 'Serve 重新执行前校验失败').slice(0, 240),
    cursor: 0
  }
  if (codexRunDatabase) codexRunDatabase.rememberCodexActionRun(run)
  persistCodexActionRun(run)
  pushCodexActionRunnerSnapshot(run.message)
}

// Same membership as `isCodexActionStartAccepted` in
// src/domain/codexEnvironment.ts, which owns the meaning; a CJS preload cannot
// import a TS module, so a test holds the two sets in step. Not
// `outcome !== 'failed'` — `confirm-required` and `rejected` start nothing.
function codexActionStartAccepted(outcome) {
  return outcome === 'ok' || outcome === 'started' || outcome === 'running' || outcome === 'stopping'
}

async function restartCodexEnvironmentActionAfterExit(input) {
  if (codexEnvironmentShuttingDown) return
  const previousRunIds = new Set(codexActionRunMemorySnapshot().map((run) => run.runId))
  const result = await runCodexProjectEnvironmentAction(input)
  const created = codexActionRunMemorySnapshot().some((run) => !previousRunIds.has(run.runId))
  if (!created && !codexActionStartAccepted(result?.outcome)) recordCodexActionRestartFailure(input, result)
}

function finishCodexActionRun(run, status, exitCode, message) {
  if (!run) return
  finalizeCodexActionRunLogs(run)
  run.status = status
  run.endedAt = Date.now()
  if (typeof exitCode === 'number') run.exitCode = exitCode
  run.message = message
  persistCodexActionRun(run)
  if (codexRunDatabase) codexRunDatabase.enforceRetentionIfOpen()
  pushCodexActionRunnerSnapshot(message)
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
  const candidates = codexActionNodeRuntimeCandidates(force)
  const roots = codexActionNvmRoots()
  const preference = codexActionRuntimePreference(projectKey)
  const publicCandidates = candidates.map((candidate) => ({ id: candidate.id, label: candidate.label, version: candidate.version, source: candidate.source }))
  let resolved = null
  let state = 'ready'
  let message = ''
  let hintSource = ''
  if (preference.mode === 'manual') {
    resolved = candidates.find((candidate) => candidate.id === preference.candidateId) || null
    if (!resolved) {
      state = 'unavailable'
      message = '手动选择的 Node 已不可用，请重新选择'
    }
  } else {
    const hint = codexActionProjectNodeHint(projectRoot)
    if (hint.present) {
      hintSource = hint.source
      resolved = hint.invalid ? null : codexActionResolveNodeToken(hint.token, candidates, roots)
      if (!resolved) {
        state = 'invalid-project-version'
        message = `${hint.source} 指定的 Node 未安装或格式无效`
      }
    } else {
      for (const root of roots) {
        const defaultAlias = codexActionReadNvmAlias(root, 'default')
        if (!defaultAlias) continue
        resolved = codexActionResolveNodeToken(defaultAlias, candidates, roots)
        if (resolved) break
      }
      resolved ||= candidates.find((candidate) => candidate.source === 'nvm') || candidates.find((candidate) => candidate.source === 'system') || null
      if (!resolved) {
        state = 'unavailable'
        message = '未检测到可用的 NVM 或系统 Node'
      }
    }
  }
  return {
    preference,
    resolved,
    public: {
      mode: preference.mode,
      state,
      selectedCandidateId: preference.candidateId || undefined,
      resolvedCandidateId: resolved?.id,
      label: resolved?.label,
      version: resolved?.version,
      source: resolved?.source,
      hintSource: hintSource || undefined,
      candidates: publicCandidates,
      message: message || undefined
    }
  }
}

function codexActionPackageManagerEntry(runtime, name) {
  return codexNodeRuntimeHelpers ? codexNodeRuntimeHelpers.packageManagerEntry(runtime, name) : ''
}

function resolveCodexActionLaunchPlan(validatedCommand, projectRoot, projectKey = '') {
  const verified = validateCodexEnvironmentActionCommandHost(Array.isArray(validatedCommand?.argv) ? validatedCommand.argv.join(' ') : '')
  if (!verified || JSON.stringify(verified) !== JSON.stringify(validatedCommand)) return null
  const name = verified.executable
  const args = verified.argv.slice(1)
  if (name === 'vite' || name === 'npm' || name === 'pnpm' || name === 'yarn') {
    const runtimeResult = codexActionRuntimeProjection(projectKey, projectRoot, true)
    if (!runtimeResult.resolved) return { errorCode: 'node-runtime-unavailable', message: runtimeResult.public.message || 'Node 运行时不可用', runtime: runtimeResult.public }
    const script = name === 'vite'
      ? codexActionUsableFile(path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'))
      : codexActionPackageManagerEntry(runtimeResult.resolved, name)
    if (!script) return { errorCode: 'package-manager-unavailable', message: `所选 Node 未提供 ${name} 入口`, runtime: runtimeResult.public }
    return {
      command: runtimeResult.resolved.nodePath,
      args: [script, ...args],
      binDir: runtimeResult.resolved.binDir,
      runtime: runtimeResult.public
    }
  }
  const home = os.homedir()
  const candidatesByName = {
    git: process.platform === 'win32'
      ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd', 'git.exe')]
      : ['/usr/bin/git', '/opt/homebrew/bin/git', '/usr/local/bin/git'],
    pnpm: process.platform === 'win32'
      ? [path.join(process.env.LOCALAPPDATA || '', 'pnpm', 'pnpm.exe')]
      : [path.join(home, 'Library', 'pnpm', 'pnpm'), path.join(home, '.local', 'share', 'pnpm', 'pnpm'), '/opt/homebrew/bin/pnpm', '/usr/local/bin/pnpm'],
    yarn: process.platform === 'win32' ? [] : ['/opt/homebrew/bin/yarn', '/usr/local/bin/yarn'],
    bun: process.platform === 'win32' ? [path.join(home, '.bun', 'bin', 'bun.exe')] : [path.join(home, '.bun', 'bin', 'bun'), '/opt/homebrew/bin/bun']
  }
  const command = (candidatesByName[name] || []).map(codexActionUsableFile).find(Boolean)
  return command ? { command, args } : null
}

async function runCodexProjectEnvironmentAction(input) {
  const targetAlias = typeof input?.targetAlias === 'string' ? input.targetAlias : ''
  const requestedTargetId = typeof input?.targetId === 'string' ? input.targetId : ''
  const compatibilityProjectKey = typeof input?.projectKey === 'string' ? input.projectKey : ''
  const environmentId = typeof input?.environmentId === 'string' ? input.environmentId.slice(0, 64) : ''
  const actionId = typeof input?.actionId === 'string' ? input.actionId.slice(0, 80) : ''
  const confirmToken = typeof input?.confirmToken === 'string' ? input.confirmToken : ''
  const stopIfRunning = input?.stopIfRunning === true
  const restartIfRunning = input?.restartIfRunning === true
  if (!targetAlias || !environmentId || !actionId) {
    return { outcome: 'failed', errorCode: 'invalid-request', message: 'Action 请求无效' }
  }
  if (actionId === 'setup') {
    return { outcome: 'rejected', errorCode: 'display-only', message: 'Setup 仅展示，不会由 EyPc 执行' }
  }
  const resolved = resolveCodexEnvironmentTargetCwd(targetAlias)
  if (resolved.errorCode) {
    return { outcome: 'failed', errorCode: resolved.errorCode, message: resolved.message }
  }
  if (requestedTargetId && requestedTargetId !== resolved.targetId) {
    return { outcome: 'failed', errorCode: 'target-mismatch', message: 'Action 目标身份不匹配' }
  }
  if (!requestedTargetId && (resolved.kind !== 'project' || compatibilityProjectKey !== resolved.projectKey)) {
    return { outcome: 'failed', errorCode: 'runtime-revision-required', message: 'Action Host 已更新，请重载插件后再试' }
  }
  const latestList = listCodexProjectEnvironments(targetAlias)
  if (latestList.outcome !== 'ok') return latestList
  if (latestList.runtimeRevision !== CODEX_ACTION_HOST_RUNTIME_REVISION || latestList.targetId !== resolved.targetId) {
    return { outcome: 'failed', errorCode: 'target-mismatch', message: 'Action 目标刷新结果不一致' }
  }
  const hostAction = codexActionAuthorization?.findCodexEnvironmentCommand(resolved.targetId, environmentId, actionId)
  if (!hostAction) {
    return { outcome: 'failed', errorCode: 'action-missing', message: '未找到对应 Action，请刷新后重试' }
  }
  if (hostAction.risk === 'display-only') {
    return { outcome: 'rejected', errorCode: 'display-only', message: '该 Action 仅展示，不会执行' }
  }
  if (hostAction.risk !== 'normal' && hostAction.risk !== 'external-write' && hostAction.risk !== 'long-running') {
    return { outcome: 'rejected', errorCode: 'action-not-allowed', message: '该 Action 不在允许列表中' }
  }
  const environmentFileFingerprint = typeof hostAction.environmentFileFingerprint === 'string' ? hostAction.environmentFileFingerprint : ''
  const commandFingerprint = typeof hostAction.commandFingerprint === 'string' ? hostAction.commandFingerprint : ''
  const sessionKey = codexEnvironmentSessionKey(resolved.targetId, environmentId, actionId)
  const existing = codexEnvironmentActionSessions.get(sessionKey)
  if (existing?.state === 'running' && hostAction.risk !== 'long-running') {
    return { outcome: 'running', session: sanitizeCodexEnvironmentSession(existing), message: '该 Action 正在运行，已定位到当前记录' }
  }
  if (existing?.state === 'stopping' && hostAction.risk !== 'long-running') {
    return { outcome: 'stopping', session: sanitizeCodexEnvironmentSession(existing), message: '该 Action 正在停止' }
  }
  if (hostAction.risk === 'long-running') {
    if (existing?.state === 'running') {
      const existingEnvironmentFileFingerprint = typeof existing.environmentFileFingerprint === 'string' ? existing.environmentFileFingerprint : ''
      const existingCommandFingerprint = typeof existing.commandFingerprint === 'string' ? existing.commandFingerprint : ''
      if (restartIfRunning) {
        existing.pendingRestart = { ...input, confirmToken: undefined, restartIfRunning: false }
        return stopCodexEnvironmentActionSession({ targetId: resolved.targetId, projectKey: resolved.projectKey, environmentId, actionId })
      }
      if ((existingEnvironmentFileFingerprint && existingCommandFingerprint) && (existingEnvironmentFileFingerprint !== environmentFileFingerprint || existingCommandFingerprint !== commandFingerprint)) {
        return {
          outcome: 'rejected',
          errorCode: 'session-fingerprint-mismatch',
          message: 'Serve 运行的命令/环境指纹与当前 Action 不一致，请先停止该会话后重试'
        }
      }
      if (stopIfRunning) return stopCodexEnvironmentActionSession({ targetId: resolved.targetId, projectKey: resolved.projectKey, environmentId, actionId })
      return { outcome: 'running', session: sanitizeCodexEnvironmentSession(existing), message: 'Serve 仍在运行；再次确认可停止' }
    }
    if (existing?.state === 'stopping') {
      return {
        outcome: 'stopping',
        session: sanitizeCodexEnvironmentSession(existing),
        message: 'Serve 正在停止；请稍后重试'
      }
    }
  }
  if (hostAction.risk === 'external-write') {
    if (!confirmToken || !consumeCodexEnvironmentConfirmToken(confirmToken, resolved.targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint)) {
      const token = issueCodexEnvironmentConfirmToken(resolved.targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint)
      return {
        outcome: 'confirm-required',
        errorCode: 'confirm-required',
        message: 'Git Push 会写入远程仓库，请再次确认',
        confirmToken: token,
        risk: 'external-write'
      }
    }
  }
  const launch = resolveCodexActionLaunchPlan(hostAction.validatedCommand, resolved.executionCwd, resolved.projectKey)
  if (!launch || launch.errorCode) return {
    outcome: 'rejected',
    errorCode: launch?.errorCode || 'executable-unavailable',
    message: launch?.message || '未找到受信任的绝对可执行入口'
  }
  const spawnEnvironment = {
    ...process.env,
    PATH: [
      launch.binDir,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin'
    ].filter(Boolean).join(path.delimiter)
  }
  if (hostAction.risk === 'long-running') {
    const run = createCodexActionRun({ ...input, environmentId, actionId }, resolved, hostAction, launch)
    let child
    try {
      child = spawn(launch.command, launch.args, {
        cwd: resolved.executionCwd,
        env: spawnEnvironment,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      })
    } catch {
      finishCodexActionRun(run, 'failed', undefined, '无法启动 Serve')
      return { outcome: 'failed', errorCode: 'spawn-failed', message: '无法启动 Serve' }
    }
    const session = {
      targetAlias,
      targetId: resolved.targetId,
      projectKey: resolved.projectKey,
      environmentId,
      actionId,
      environmentFileFingerprint,
      commandFingerprint,
      state: 'running',
      startedAt: Date.now(),
      message: 'Serve 已启动',
      run,
      child,
      childPid: typeof child?.pid === 'number' ? child.pid : undefined,
    }
    codexEnvironmentActionSessions.set(sessionKey, session)
    pushCodexActionRunnerSnapshot(session.message)
    child.stdout?.on?.('data', (chunk) => appendCodexActionRunLog(run, 'stdout', chunk, [resolved.executionCwd]))
    child.stderr?.on?.('data', (chunk) => appendCodexActionRunLog(run, 'stderr', chunk, [resolved.executionCwd]))
    child.on?.('exit', (code) => {
      const current = codexEnvironmentActionSessions.get(sessionKey)
      if (!current || current.child !== child) return
      const wasStopping = current.state === 'stopping'
      const pendingRestart = current.pendingRestart
      current.pendingRestart = null
      current.state = 'idle'
      current.exitCode = typeof code === 'number' ? code : 0
      current.message = code === 0 ? 'Serve 已结束' : `Serve 已退出（${code}）`
      current.child = null
      finishCodexActionRun(run, wasStopping ? 'stopped' : (code === 0 ? 'completed' : 'failed'), typeof code === 'number' ? code : undefined, current.message)
      flushCodexActionDeferredServerClose()
      if (pendingRestart && !codexEnvironmentShuttingDown) queueMicrotask(() => { void restartCodexEnvironmentActionAfterExit(pendingRestart) })
    })
    child.on?.('error', () => {
      const current = codexEnvironmentActionSessions.get(sessionKey)
      if (!current || current.child !== child) return
      current.state = 'idle'
      current.exitCode = undefined
      current.message = 'Serve 启动失败'
      current.child = null
      finishCodexActionRun(run, 'failed', undefined, current.message)
      flushCodexActionDeferredServerClose()
    })
    return { outcome: 'started', session: sanitizeCodexEnvironmentSession(session) }
  }
  const nonLongTimeoutMs = 10 * 60_000
  const result = await new Promise((resolvePromise) => {
    let done = false
    let timedOut = false
    let child
    const run = createCodexActionRun({ ...input, environmentId, actionId }, resolved, hostAction, launch)
    try {
      child = spawn(launch.command, launch.args, {
        cwd: resolved.executionCwd,
        env: spawnEnvironment,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      })
    } catch {
      finishCodexActionRun(run, 'failed', undefined, '命令启动失败')
      resolvePromise({ outcome: 'failed', errorCode: 'spawn-failed', exitCode: undefined, message: '命令启动失败' })
      return
    }
    const session = {
      targetAlias,
      targetId: resolved.targetId,
      projectKey: resolved.projectKey,
      environmentId,
      actionId,
      environmentFileFingerprint,
      commandFingerprint,
      state: 'running',
      startedAt: run.startedAt,
      message: '正在执行',
      run,
      child,
      childPid: typeof child?.pid === 'number' ? child.pid : undefined
    }
    codexEnvironmentActionSessions.set(sessionKey, session)
    pushCodexActionRunnerSnapshot(session.message)
    child.stdout?.on?.('data', (chunk) => appendCodexActionRunLog(run, 'stdout', chunk, [resolved.executionCwd]))
    child.stderr?.on?.('data', (chunk) => appendCodexActionRunLog(run, 'stderr', chunk, [resolved.executionCwd]))
    const timeoutId = setTimeout(() => {
      if (done) return
      timedOut = true
      session.state = 'stopping'
      session.message = '执行超时，正在停止'
      run.status = 'stopping'
      run.message = session.message
      persistCodexActionRun(run)
      pushCodexActionRunnerSnapshot(session.message)
      signalCodexEnvironmentSession(session)
    }, nonLongTimeoutMs)
    child.on?.('exit', (code) => {
      if (done) return
      done = true
      clearTimeout(timeoutId)
      const exitCode = typeof code === 'number' ? code : 0
      const explicitlyStopped = session.state === 'stopping' && !timedOut
      const status = timedOut ? 'failed' : explicitlyStopped ? 'stopped' : exitCode === 0 ? 'completed' : 'failed'
      const message = timedOut ? '命令执行超时并已停止' : explicitlyStopped ? '已停止' : exitCode === 0 ? '已完成' : `命令退出（${exitCode}）`
      session.state = 'idle'
      session.child = null
      session.exitCode = exitCode
      session.message = message
      finishCodexActionRun(run, status, exitCode, message)
      flushCodexActionDeferredServerClose()
      resolvePromise({
        outcome: status === 'completed' ? 'ok' : 'failed',
        errorCode: timedOut ? 'command-timeout' : status === 'stopped' ? 'stopped' : exitCode === 0 ? undefined : 'command-exit',
        exitCode,
        message
      })
    })
    child.on?.('error', () => {
      if (done) return
      done = true
      clearTimeout(timeoutId)
      session.state = 'idle'
      session.child = null
      finishCodexActionRun(run, 'failed', undefined, '命令启动失败')
      flushCodexActionDeferredServerClose()
      resolvePromise({ outcome: 'failed', errorCode: 'spawn-error', exitCode: undefined, message: '命令启动失败' })
    })
  })
  return result
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
      logText: run.logText,
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
      rendererAssetId: runtimeIdentityArtifact?.rendererAssetId || '',
      kernelRevision: companionTaskKernel?.revision || '',
      taskPackageRevision: companionTaskKernel?.packageRevision || '',
      loadError: runtimeIdentityLoadError
    }),
    handshake: runtimeIdentityHandshake
  },
  storage: {
    getState: readState,
    setState: writeState,
    getMqttArchive: readMqttArchive,
    setMqttArchive: writeMqttArchive,
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
      ? claudeBridge.readCodeSnapshot(...args)
      : { version: 2, revision: '', sessions: [], truncated: false, readAt: Date.now() },
    readCodeStateSnapshot: (...args) => claudeBridge
      ? claudeBridge.readCodeStateSnapshot(...args)
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
    watchCodeSessions: (...args) => claudeBridge ? claudeBridge.watchCodeSessions(...args) : (() => {}),
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
  companionKernel: companionTaskKernel
    ? {
        revision: companionTaskKernel.revision,
        packageRevision: companionTaskKernel.packageRevision,
        attach: (...args) => runtimeIdentityCompatible
          ? companionTaskKernel.attach(...args)
          : {
              revision: companionTaskKernel.revision,
              packageRevision: companionTaskKernel.packageRevision,
              lease: 0,
              retained: false,
              ready: false,
              package: companionTaskKernel.getPackage(),
              errorCode: 'reload-required'
            },
        configure: (...args) => runtimeIdentityCompatible ? companionTaskKernel.configure(...args) : null,
        setVisibility: (...args) => runtimeIdentityCompatible ? companionTaskKernel.setVisibility(...args) : null,
        setLocalPin: (...args) => runtimeIdentityCompatible ? companionTaskKernel.setLocalPin(...args) : null,
        syncPackage: (...args) => runtimeIdentityCompatible ? companionTaskKernel.syncPackage(...args) : null,
        detach: (...args) => runtimeIdentityCompatible && companionTaskKernel.detach(...args),
        dispatch: (...args) => runtimeIdentityCompatible
          ? companionTaskKernel.dispatch(...args)
          : Promise.resolve(runtimeIdentityTaskFailure('unavailable')),
        getPackage: companionTaskKernel.getPackage,
        getLatest: companionTaskKernel.getLatest,
        subscribe: (...args) => runtimeIdentityCompatible ? companionTaskKernel.subscribe(...args) : (() => {}),
        onPackage: (...args) => runtimeIdentityCompatible ? companionTaskKernel.onPackage(...args) : (() => {}),
        onResult: (...args) => runtimeIdentityCompatible ? companionTaskKernel.onResult(...args) : (() => {}),
        takeResults: (...args) => runtimeIdentityCompatible ? companionTaskKernel.takeResults(...args) : [],
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
    archiveThread: (...args) => runtimeIdentityCompatible ? archiveCodexThread(...args) : Promise.resolve(runtimeIdentityTaskFailure()),
    archiveProject: (...args) => runtimeIdentityCompatible ? archiveCodexProject(...args) : Promise.resolve(runtimeIdentityTaskFailure()),
    removeProject: (...args) => runtimeIdentityCompatible ? removeCodexProject(...args) : Promise.resolve(runtimeIdentityTaskFailure()),
    listProjectEnvironments: listCodexProjectEnvironments,
    runProjectAction: runCodexProjectEnvironmentAction,
    listActionSessions: listCodexEnvironmentActionSessions,
    stopActionSession: stopCodexEnvironmentActionSession,
    setActionRunArchived: setCodexActionRunArchived,
    close: closeCodexConnections
  },
  float: {
    sync: syncCodexFloat,
    activate: activateCodexFloat,
    diagnostics: getCodexFloatWorkspaceDiagnostics,
    resetGeometry: resetCodexFloatGeometry,
    close() {
      // Destroy the child window only. Desired visibility stays owned by
      // sync({ visible }) so a mainHide remount's float.close() cannot make the
      // following pluginOut(false) treat an enabled float as disposable.
      closeCodexFloat()
    },
    onAction(listener) {
      if (typeof listener !== 'function') return () => {}
      codexFloatActionListeners.add(listener)
      return () => codexFloatActionListeners.delete(listener)
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
