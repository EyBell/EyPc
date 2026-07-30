const { Buffer } = require('node:buffer')
const { execFile, spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')

const STORAGE_KEY = 'eypc/state/v1'
const CODEX_LAUNCH_PATH_STORAGE_KEY = 'eypc/codex/launch-path/v1'
const MQTT_ARCHIVE_STORAGE_KEY = 'eypc/mqtt/archive/v1'
const MQTT_SECRETS_LOCAL_STORAGE_KEY = 'eypc/mqtt/secrets-local/v1'
const MQTT_SECRETS_FILE_NAME = 'mqtt-secrets-local.json'
const MQTT_SECRETS_KEY_FILE_NAME = 'mqtt-secrets-local.key'
const MQTT_SECRETS_ENCRYPTION_VERSION = 2
const MQTT_SECRETS_AES_ALGORITHM = 'aes-256-gcm'
const CODEX_RPC_TIMEOUT_MS = 12_000
const CODEX_PROXY_OUTPUT_LIMIT = 16 * 1024
const CODEX_PROCESS_OUTPUT_LIMIT = 256 * 1024
const CODEX_THREAD_ALIAS_TTL_MS = 10 * 60_000
const CODEX_THREAD_LIMIT = 100
const CODEX_THREAD_PAGE_LIMIT = 500
const CODEX_NATIVE_STATE_MAX_BYTES = 4 * 1024 * 1024
const CODEX_THREAD_TURN_STATUS_CONCURRENCY = 10
const CODEX_THREAD_TURN_STATUS_TIMEOUT_MS = 5_000
const CODEX_THREAD_TURN_STATUS_RETRY_MS = 30_000
const CODEX_DESKTOP_TURN_REFRESH_DEADLINE_MS = 3_000
const CODEX_DESKTOP_TURN_REFRESH_DELAYS_MS = [0, 300, 1_000]
const CODEX_THREAD_FIRST_PROMPT_PAGE_LIMIT = 50
const CODEX_THREAD_FIRST_PROMPT_PAGE_BUDGET = 4
const CODEX_DESKTOP_IPC_FRAME_MAX_BYTES = 256 * 1024 * 1024
const CODEX_DESKTOP_IPC_RECONNECT_MAX_MS = 5_000
// Keep synchronized with src/domain/codex.ts. This value crosses the context
// boundary so a newer renderer can mark long-lived preload evidence degraded.
const CODEX_TASK_STATE_REVISION = 'task-state-v3'
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
const CODEX_FLOAT_WATER_SIZE = { width: 104, height: 104 }
const CODEX_FLOAT_CARD_SIZE = { width: 166, height: 92 }
const CODEX_FLOAT_EXPANDED_WIDTH = 360
const CODEX_FLOAT_EXPANDED_MIN_WIDTH = 340
const CODEX_FLOAT_EXPANDED_MIN_HEIGHT = 280
const CODEX_FLOAT_EXPANDED_MAX_HEIGHT = 460
const CODEX_FLOAT_MARGIN = 12
const WINDOW_BRIDGE_TIMEOUT_MS = 5_000
const WINDOW_BRIDGE_OUTPUT_LIMIT = 1024 * 1024
const CODEX_FLOAT_CHANNELS = {
  snapshot: 'eypc-float:snapshot',
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
  environmentList: 'eypc-float:environment-list',
  environmentListResult: 'eypc-float:environment-list-result',
  environmentRun: 'eypc-float:environment-run',
  environmentRunResult: 'eypc-float:environment-run-result',
  environmentSession: 'eypc-float:environment-session',
  environmentSessionResult: 'eypc-float:environment-session-result'
}
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
const codexRpcPending = new Map()
const codexThreadActions = new Map()
const codexProjectActions = new Map()
const codexActivityListeners = new Set()
let codexActivityInventory = new Map()
let codexActivitySourceFingerprint = ''
let codexActivityGeneration = 0
let codexDesktopBridge = null
const codexThreadTurnStatusCache = new Map()
const codexThreadTurnStatusDirty = new Map()
let codexThreadTurnStatusDirtyGeneration = 0
const codexThreadFirstPromptCache = new Map()
let codexThreadTurnStatusRpcAvailable = null
let codexThreadFirstPromptScanRunning = false
let codexThreadFirstPromptScanGeneration = 0
let codexFloatWindow = null
let codexFloatExpanded = false
let codexFloatPinned = false
let codexFloatEdge = 'right'
let codexFloatSnapshot = null
let codexFloatDrag = null
let codexFloatResize = null
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

const WINDOWS_ENUM_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public sealed class EypcWindowInfo {
  public string nativeRef { get; set; }
  public int pid { get; set; }
  public string appId { get; set; }
  public string appName { get; set; }
  public string title { get; set; }
  public bool minimized { get; set; }
  public bool focused { get; set; }
}

public static class EypcWindowApi {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetLastActivePopup(IntPtr hWnd);

  const int GWL_EXSTYLE = -20;
  const uint GA_ROOT = 2;
  const uint GA_ROOTOWNER = 3;
  const uint WS_EX_TOOLWINDOW = 0x00000080;
  const uint WS_EX_APPWINDOW = 0x00040000;
  const uint WS_EX_NOACTIVATE = 0x08000000;

  static bool IsNoiseTitle(string title, string appName) {
    var normalized = (title ?? "").Trim().ToLowerInvariant();
    if (String.IsNullOrWhiteSpace(normalized)) return true;
    if (normalized == "program manager" || normalized == "default ime" || normalized == "msctfime ui" || normalized == "gdi+ window" || normalized == "olemainthreadwndname" || normalized == "cicerouiwndframe") return true;
    var app = (appName ?? "").Trim().ToLowerInvariant();
    var chromium = app.Contains("edge") || app.Contains("chrome") || app.Contains("chromium") || app.Contains("brave") || app.Contains("opera") || app.Contains("vivaldi");
    if (chromium && normalized == "window") return true;
    return false;
  }

  static bool IsCloaked(IntPtr hWnd) {
    try {
      int cloaked = 0;
      if (DwmGetWindowAttribute(hWnd, 14, out cloaked, 4) != 0) return false;
      return cloaked != 0;
    } catch { return false; }
  }

  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);

  static bool IsActionableWindow(IntPtr hWnd) {
    if (!IsWindow(hWnd) || !IsWindowVisible(hWnd) || IsCloaked(hWnd)) return false;
    var exStyle = unchecked((uint)GetWindowLong(hWnd, GWL_EXSTYLE));
    var appWindow = (exStyle & WS_EX_APPWINDOW) != 0;
    if ((exStyle & WS_EX_TOOLWINDOW) != 0 && !appWindow) return false;
    if ((exStyle & WS_EX_NOACTIVATE) != 0 && !appWindow) return false;
    if (GetAncestor(hWnd, GA_ROOT) != hWnd) return false;
    if (appWindow) return true;

    var candidate = GetAncestor(hWnd, GA_ROOTOWNER);
    if (candidate == IntPtr.Zero) candidate = hWnd;
    for (var depth = 0; depth < 32; depth += 1) {
      var popup = GetLastActivePopup(candidate);
      if (popup == IntPtr.Zero || popup == candidate) break;
      candidate = popup;
      if (IsWindowVisible(candidate)) break;
    }
    return candidate == hWnd;
  }

  public static List<EypcWindowInfo> ListWindows() {
    var rows = new List<EypcWindowInfo>();
    var foreground = GetForegroundWindow();
    var excludedPid = __EYPC_HOST_PID__;
    var excludedParentPid = __EYPC_PARENT_PID__;
    EnumWindows(delegate(IntPtr hWnd, IntPtr ignored) {
      if (!IsActionableWindow(hWnd)) return true;
      var length = GetWindowTextLength(hWnd);
      if (length <= 0) return true;
      var titleBuilder = new StringBuilder(Math.Min(length + 1, 8192));
      GetWindowText(hWnd, titleBuilder, titleBuilder.Capacity);
      var title = titleBuilder.ToString().Trim();
      if (String.IsNullOrWhiteSpace(title)) return true;
      uint rawPid;
      GetWindowThreadProcessId(hWnd, out rawPid);
      var pid = unchecked((int)rawPid);
      if (pid <= 0 || pid == excludedPid || pid == excludedParentPid) return true;
      string appName;
      try {
        using (var appProcess = Process.GetProcessById(pid)) {
          if (appProcess.HasExited) return true;
          appName = appProcess.ProcessName;
        }
      } catch { return true; }
      if (IsNoiseTitle(title, appName)) return true;
      rows.Add(new EypcWindowInfo {
        nativeRef = hWnd.ToInt64().ToString(),
        pid = pid,
        appId = appName,
        appName = appName,
        title = title,
        minimized = IsIconic(hWnd),
        focused = hWnd == foreground
      });
      return true;
    }, IntPtr.Zero);
    return rows;
  }
}
'@
[EypcWindowApi]::ListWindows() | ConvertTo-Json -Compress -Depth 4
`

const WINDOWS_ACTIVATE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EypcWindowActivator {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
$debugTrace = [string]::Equals([Environment]::GetEnvironmentVariable('EYPC_WINDOW_DEBUG_TRACE'), '1', [System.StringComparison]::Ordinal)
$trace = New-Object System.Collections.Generic.List[object]
function Add-EypcTrace([string] $stage, [string] $outcome) {
  if ($debugTrace -and $trace.Count -lt 16) {
    [void]$trace.Add([pscustomobject]@{ stage = $stage; outcome = $outcome })
  }
}
function Write-EypcOutcome([string] $outcome) {
  $payload = @{ outcome = $outcome }
  if ($debugTrace) { $payload.trace = @($trace.ToArray()) }
  $payload | ConvertTo-Json -Compress -Depth 4
}
$handle = [IntPtr]::new(__EYPC_WINDOW_HANDLE__)
if (-not [EypcWindowActivator]::IsWindow($handle)) {
  Add-EypcTrace 'target' 'not-found'
  Write-EypcOutcome 'not-found'
  exit 0
}
Add-EypcTrace 'target' 'ok'
if ([EypcWindowActivator]::IsIconic($handle)) {
  [void][EypcWindowActivator]::ShowWindow($handle, 9)
  if ([EypcWindowActivator]::IsIconic($handle)) {
    Add-EypcTrace 'restore' 'failed'
    Write-EypcOutcome 'failed'
    exit 0
  }
  Add-EypcTrace 'restore' 'ok'
} else {
  Add-EypcTrace 'restore' 'skipped'
}
if ([EypcWindowActivator]::SetForegroundWindow($handle)) {
  Add-EypcTrace 'foreground' 'ok'
  Write-EypcOutcome 'activated'
} else {
  Add-EypcTrace 'foreground' 'denied'
  Write-EypcOutcome 'focus-denied'
}
`

const WINDOWS_TOPMOST_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EypcWindowTopmost {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
}
'@
$debugTrace = [string]::Equals([Environment]::GetEnvironmentVariable('EYPC_WINDOW_DEBUG_TRACE'), '1', [System.StringComparison]::Ordinal)
$trace = New-Object System.Collections.Generic.List[object]
function Add-EypcTrace([string] $stage, [string] $outcome) {
  if ($debugTrace -and $trace.Count -lt 16) {
    [void]$trace.Add([pscustomobject]@{ stage = $stage; outcome = $outcome })
  }
}
function Write-EypcOutcome([string] $outcome) {
  $payload = @{ outcome = $outcome }
  if ($debugTrace) { $payload.trace = @($trace.ToArray()) }
  $payload | ConvertTo-Json -Compress -Depth 4
}
$handle = [IntPtr]::new(__EYPC_WINDOW_HANDLE__)
if (-not [EypcWindowTopmost]::IsWindow($handle)) {
  Add-EypcTrace 'target' 'not-found'
  Write-EypcOutcome 'not-found'
  exit 0
}
Add-EypcTrace 'target' 'ok'
if ([EypcWindowTopmost]::IsIconic($handle)) {
  [void][EypcWindowTopmost]::ShowWindow($handle, 9)
  if ([EypcWindowTopmost]::IsIconic($handle)) {
    Add-EypcTrace 'restore' 'failed'
    Write-EypcOutcome 'failed'
    exit 0
  }
  Add-EypcTrace 'restore' 'ok'
} else {
  Add-EypcTrace 'restore' 'skipped'
}
# SWP_NOSIZE | SWP_NOMOVE | SWP_SHOWWINDOW; HWND_TOPMOST is -1.
if (-not [EypcWindowTopmost]::SetWindowPos($handle, [IntPtr]::new(-1), 0, 0, 0, 0, 0x0043)) {
  Add-EypcTrace 'topmost' 'failed'
  Write-EypcOutcome 'failed'
  exit 0
}
Add-EypcTrace 'topmost' 'ok'
if ([EypcWindowTopmost]::SetForegroundWindow($handle)) {
  Add-EypcTrace 'foreground' 'ok'
  Write-EypcOutcome 'activated'
} else {
  Add-EypcTrace 'foreground' 'denied'
  Write-EypcOutcome 'focus-denied'
}
`

const WINDOWS_CLOSE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EypcWindowCloser {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
}
'@
$handle = [IntPtr]::new(__EYPC_WINDOW_HANDLE__)
if (-not [EypcWindowCloser]::IsWindow($handle)) {
  @{ outcome = 'not-found' } | ConvertTo-Json -Compress
  exit 0
}
if ([EypcWindowCloser]::PostMessage($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) {
  @{ outcome = 'closed' } | ConvertTo-Json -Compress
} else {
  @{ outcome = 'close-denied' } | ConvertTo-Json -Compress
}
`

const WINDOWS_TERMINATE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$pidValue = __EYPC_WINDOW_PID__
try {
  $proc = Get-Process -Id $pidValue -ErrorAction Stop
  Stop-Process -Id $pidValue -Force -ErrorAction Stop
  @{ outcome = 'terminated' } | ConvertTo-Json -Compress
} catch {
  @{ outcome = 'not-found' } | ConvertTo-Json -Compress
}
`

const MACOS_WINDOW_LIST_SCRIPT = String.raw`
ObjC.import('Foundation')
ObjC.import('CoreGraphics')
ObjC.import('AppKit')
function attempt(callback, fallback) {
  try { return callback() } catch (error) { return fallback }
}
function asText(value) { return String(value || '').trim() }
function normalizeTitle(value) { return asText(value).toLowerCase().replace(/\s+/g, ' ') }
function isChromiumFamily(appName, appId) {
  const text = normalizeTitle(appName + ' ' + appId)
  return /microsoft edge|google chrome|chromium|brave|vivaldi|opera|\barc\b|com\.microsoft\.edgemac|com\.google\.chrome|com\.brave\.browser/.test(text)
}
function isNoiseTitle(title, appName, appId) {
  const normalized = normalizeTitle(title)
  if (!normalized) return true
  if (['program manager', 'default ime', 'msctfime ui', 'gdi+ window', 'olemainthreadwndname', 'cicerouiwndframe', 'cicero ui wnd frame'].indexOf(normalized) >= 0) return true
  if (normalized === 'window' && isChromiumFamily(appName, appId)) return true
  return false
}
const excludedPid = __EYPC_HOST_PID__
const excludedParentPid = __EYPC_PARENT_PID__
const raw = attempt(() => ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll, $.kCGNullWindowID))), [])
const list = Array.isArray(raw) ? raw : []
const rows = []
const seen = {}
let namedOwnerWindows = 0
let unnamedOwnerWindows = 0
for (const item of list) {
  if (!item || typeof item !== 'object') continue
  const layer = Math.trunc(Number(item.kCGWindowLayer || 0))
  if (layer !== 0) continue
  const pid = Math.trunc(Number(item.kCGWindowOwnerPID || 0))
  const windowNumber = Math.trunc(Number(item.kCGWindowNumber || 0))
  const title = asText(item.kCGWindowName)
  const appName = asText(item.kCGWindowOwnerName)
  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(windowNumber) || windowNumber <= 0 || !appName) continue
  const alpha = Number(item.kCGWindowAlpha)
  if (Number.isFinite(alpha) && alpha <= 0) continue
  if (pid === excludedPid || pid === excludedParentPid || pid === $.NSProcessInfo.processInfo.processIdentifier) continue
  if (!title) {
    unnamedOwnerWindows += 1
    continue
  }
  namedOwnerWindows += 1
  const running = attempt(() => $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid), null)
  if (!running || attempt(() => running.terminated === true, false) || Number(attempt(() => running.activationPolicy, -1)) !== 0) continue
  const appId = asText(attempt(() => running && running.bundleIdentifier && ObjC.unwrap(running.bundleIdentifier), appName)) || appName
  if (isNoiseTitle(title, appName, appId)) continue
  const key = String(pid) + ':' + String(windowNumber)
  if (seen[key]) continue
  seen[key] = true
  rows.push({
    nativeRef: String(pid) + ':0:' + String(windowNumber),
    pid,
    appId,
    appName,
    title,
    // kCGWindowIsOnscreen is also false for a normal window on another Space; it is not a minimize flag.
    minimized: false,
    focused: false,
    screenRecordingHint: false
  })
}
const screenRecordingLikelyMissing = namedOwnerWindows === 0 && unnamedOwnerWindows > 0
JSON.stringify({ windows: rows, screenRecordingLikelyMissing: screenRecordingLikelyMissing })
`

/** Current-Space inventory via System Events AX; used when CGWindowList yields no titled windows. */
const MACOS_AX_WINDOW_LIST_SCRIPT = String.raw`
ObjC.import('Foundation')
ObjC.import('AppKit')
function attempt(callback, fallback) {
  try { return callback() } catch (error) { return fallback }
}
function asText(value) { return String(value || '').trim() }
function normalizeTitle(value) { return asText(value).toLowerCase().replace(/\s+/g, ' ') }
function isChromiumFamily(appName, appId) {
  const text = normalizeTitle(appName + ' ' + appId)
  return /microsoft edge|google chrome|chromium|brave|vivaldi|opera|\barc\b|com\.microsoft\.edgemac|com\.google\.chrome|com\.brave\.browser/.test(text)
}
function isNoiseTitle(title, appName, appId) {
  const normalized = normalizeTitle(title)
  if (!normalized) return true
  if (['program manager', 'default ime', 'msctfime ui', 'gdi+ window', 'olemainthreadwndname', 'cicerouiwndframe', 'cicero ui wnd frame'].indexOf(normalized) >= 0) return true
  if (normalized === 'window' && isChromiumFamily(appName, appId)) return true
  return false
}
const systemEvents = Application('System Events')
const selfPid = $.NSProcessInfo.processInfo.processIdentifier
const excludedPid = __EYPC_HOST_PID__
const excludedParentPid = __EYPC_PARENT_PID__
const processes = attempt(() => systemEvents.applicationProcesses.whose({ backgroundOnly: false })(), [])
const rows = []
const seen = {}
for (let p = 0; p < processes.length; p += 1) {
  const proc = processes[p]
  const pid = Math.trunc(Number(attempt(() => proc.unixId(), 0)))
  if (!Number.isInteger(pid) || pid <= 0 || pid === selfPid || pid === excludedPid || pid === excludedParentPid) continue
  const appName = asText(attempt(() => proc.name(), ''))
  if (!appName) continue
  const running = attempt(() => $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid), null)
  if (!running || attempt(() => running.terminated === true, false) || Number(attempt(() => running.activationPolicy, -1)) !== 0) continue
  const appId = asText(attempt(() => running && running.bundleIdentifier && ObjC.unwrap(running.bundleIdentifier), appName)) || appName
  const windows = attempt(() => proc.windows(), [])
  if (!windows || !windows.length) continue
  for (let index = 0; index < windows.length; index += 1) {
    const win = windows[index]
    let title = asText(attempt(() => win.name(), ''))
    if (!title) title = asText(attempt(() => win.attributes.byName('AXTitle').value(), ''))
    if (isNoiseTitle(title, appName, appId)) continue
    let windowNumber = 0
    try { windowNumber = Math.trunc(Number(win.attributes.byName('AXWindowNumber').value())) } catch (error) {}
    const minimized = attempt(() => win.attributes.byName('AXMinimized').value() === true, false)
    const nativeRef = windowNumber > 0
      ? String(pid) + ':0:' + String(windowNumber)
      : String(pid) + ':' + String(index + 1) + ':0'
    if (seen[nativeRef]) continue
    seen[nativeRef] = true
    rows.push({
      nativeRef,
      pid,
      appId,
      appName,
      title,
      minimized: minimized === true,
      focused: false
    })
  }
}
JSON.stringify({ windows: rows, screenRecordingLikelyMissing: false })
`

const MACOS_ENV_SNAPSHOT_SCRIPT = String.raw`
ObjC.import('Foundation')
ObjC.import('CoreGraphics')
ObjC.import('AppKit')
function attempt(callback, fallback) {
  try { return callback() } catch (error) { return fallback }
}
function asText(value) { return String(value || '').trim() }
function normalizeTitle(value) { return asText(value).toLowerCase().replace(/\s+/g, ' ') }
function environmentValue(name) {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey(name)
  return value ? String(ObjC.unwrap(value) || '') : ''
}
const processId = __EYPC_TARGET_PID__
const cgWindowNumber = __EYPC_CG_WINDOW_NUMBER__
const targetTitle = normalizeTitle(environmentValue('EYPC_WINDOW_TARGET_TITLE'))
const targetApp = normalizeTitle(environmentValue('EYPC_WINDOW_TARGET_APP_ID'))
const running = attempt(() => $.NSRunningApplication.runningApplicationWithProcessIdentifier(processId), null)
const runningBundle = normalizeTitle(attempt(() => running && running.bundleIdentifier && ObjC.unwrap(running.bundleIdentifier), ''))
const runningName = normalizeTitle(attempt(() => running && running.localizedName && ObjC.unwrap(running.localizedName), ''))
const appMatches = Boolean(running && (!targetApp || targetApp === runningBundle || targetApp === runningName))
const raw = attempt(() => ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll, $.kCGNullWindowID))), [])
const cgList = Array.isArray(raw) ? raw : []
let cgTargetMatches = 0
let cgWindowIdMatches = 0
let ownerCgWindowCount = 0
for (const item of cgList) {
  if (!item || typeof item !== 'object') continue
  const layer = Math.trunc(Number(item.kCGWindowLayer || 0))
  if (layer !== 0) continue
  const pid = Math.trunc(Number(item.kCGWindowOwnerPID || 0))
  if (pid !== processId) continue
  const wid = Math.trunc(Number(item.kCGWindowNumber || 0))
  const title = normalizeTitle(item.kCGWindowName)
  const alpha = Number(item.kCGWindowAlpha)
  if (!title || (Number.isFinite(alpha) && alpha <= 0)) continue
  ownerCgWindowCount += 1
  if (cgWindowNumber > 0 && wid === cgWindowNumber) {
    cgWindowIdMatches += 1
    if (appMatches && (!targetTitle || title === targetTitle)) cgTargetMatches += 1
    continue
  }
  if (cgWindowNumber <= 0 && appMatches && targetTitle && title === targetTitle) cgTargetMatches += 1
}
const systemEvents = Application('System Events')
let axTargetMatches = 0
let axWindowCount = 0
try {
  const processes = systemEvents.applicationProcesses.whose({ unixId: processId })()
  if (processes.length) {
    const windows = processes[0].windows()
    axWindowCount = windows.length
    for (let i = 0; i < windows.length; i += 1) {
      let title = ''
      try { title = String(windows[i].name() || '') } catch (e) {}
      if (!title) { try { title = String(windows[i].attributes.byName('AXTitle').value() || '') } catch (e) {} }
      if (targetTitle && normalizeTitle(title) === targetTitle) axTargetMatches += 1
    }
  }
} catch (error) {}
JSON.stringify({ appMatches, cgTargetMatches, cgWindowIdMatches, ownerCgWindowCount, axTargetMatches, axWindowCount })
`

/**
 * Runs SkyLight in a fresh osascript process. uTools' Electron renderer can expose a valid
 * SkyLight connection while returning empty per-Space collections; the isolated process avoids
 * that host-context coupling without walking or fronting unrelated windows.
 */
function macosIsolatedSpaceBridgeScript(pid, cgWindowNumber, switchRequested) {
  return String.raw`
ObjC.import('Foundation')
ObjC.import('CoreGraphics')
ObjC.import('AppKit')
const processId = ${pid}
const cgWindowNumber = ${cgWindowNumber}
const shouldSwitch = ${switchRequested ? 'true' : 'false'}
function attempt(callback, fallback) {
  try { return callback() } catch (error) { return fallback }
}
function environmentValue(name) {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey(name)
  return value ? String(ObjC.unwrap(value) || '') : ''
}
function normalizeTitle(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}
function numberList(value) {
  const rows = attempt(() => ObjC.deepUnwrap(value), [])
  return Array.isArray(rows) ? rows.map((item) => Math.trunc(Number(item || 0))).filter((item) => item > 0) : []
}
function executeSpaceBridge() {
  ObjC.bindFunction('calloc', ['void *', ['unsigned long', 'unsigned long']])
  ObjC.bindFunction('free', ['void', ['void *']])
  ObjC.bindFunction('SLSMainConnectionID', ['int', []])
  ObjC.bindFunction('SLSCopyManagedDisplaySpaces', ['id', ['int']])
  ObjC.bindFunction('SLSCopySpacesForWindows', ['id', ['int', 'int', 'id']])
  ObjC.bindFunction('SLSCopyWindowsWithOptionsAndTags', ['id', ['int', 'uint32_t', 'id', 'uint32_t', 'void *', 'void *']])
  ObjC.bindFunction('SLSManagedDisplaySetCurrentSpace', ['void', ['int', 'id', 'uint64_t']])
  const cid = $.SLSMainConnectionID()
  const expectedTitle = normalizeTitle(environmentValue('EYPC_WINDOW_TARGET_TITLE'))
  const expectedApp = normalizeTitle(environmentValue('EYPC_WINDOW_TARGET_APP_ID'))
  const running = attempt(() => $.NSRunningApplication.runningApplicationWithProcessIdentifier(processId), null)
  const runningBundle = normalizeTitle(attempt(() => running && running.bundleIdentifier && ObjC.unwrap(running.bundleIdentifier), ''))
  const runningName = normalizeTitle(attempt(() => running && running.localizedName && ObjC.unwrap(running.localizedName), ''))
  const appMatches = Boolean(running && (!expectedApp || expectedApp === runningBundle || expectedApp === runningName))
  const rawWindows = attempt(() => ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll, $.kCGNullWindowID))), [])
  const windows = Array.isArray(rawWindows) ? rawWindows : []
  const targets = windows.filter((item) => {
    if (!item || typeof item !== 'object') return false
    if (Math.trunc(Number(item.kCGWindowLayer || 0)) !== 0) return false
    if (Math.trunc(Number(item.kCGWindowOwnerPID || 0)) !== processId) return false
    if (Math.trunc(Number(item.kCGWindowNumber || 0)) !== cgWindowNumber) return false
    const alpha = Number(item.kCGWindowAlpha)
    return !Number.isFinite(alpha) || alpha > 0
  })
  if (targets.length !== 1 || !appMatches) {
    return { bridge: 'isolated-jxa', detail: 'bad-ref', bindingCount: 0, bindingSource: 'none', sameSpace: false, managedSpaceCount: 0, directBindingCount: 0, reverseBindingCount: 0 }
  }
  if (expectedTitle && normalizeTitle(targets[0].kCGWindowName) !== expectedTitle) {
    return { bridge: 'isolated-jxa', detail: 'title-mismatch', bindingCount: 0, bindingSource: 'none', sameSpace: false, managedSpaceCount: 0, directBindingCount: 0, reverseBindingCount: 0 }
  }
  function managedRows() {
    const rows = attempt(() => ObjC.deepUnwrap($.SLSCopyManagedDisplaySpaces(cid)), [])
    return Array.isArray(rows) ? rows : []
  }
  const managed = managedRows()
  const entries = []
  for (const display of managed) {
    if (!display || typeof display !== 'object') continue
    const displayUuid = String(display['Display Identifier'] || '').trim()
    const currentSpaceId = Math.trunc(Number(display['Current Space'] && display['Current Space'].id64 || 0))
    if (!displayUuid) continue
    for (const space of Array.isArray(display.Spaces) ? display.Spaces : []) {
      const spaceId = Math.trunc(Number(space && space.id64 || 0))
      if (spaceId > 0) entries.push({ displayUuid, spaceId, currentSpaceId })
    }
  }
  const windowIds = $.NSArray.arrayWithObject($.NSNumber.numberWithUnsignedInt(cgWindowNumber))
  const directIds = []
  for (const mask of [0x7, 0x7fffffff]) {
    for (const spaceId of numberList(attempt(() => $.SLSCopySpacesForWindows(cid, mask, windowIds), null))) {
      if (directIds.indexOf(spaceId) < 0) directIds.push(spaceId)
    }
  }
  const direct = entries.filter((entry) => directIds.indexOf(entry.spaceId) >= 0)
  const reverse = []
  const setTags = $.calloc(1, 8)
  const clearTags = $.calloc(1, 8)
  try {
    for (const entry of entries) {
      const spaces = $.NSArray.arrayWithObject($.NSNumber.numberWithUnsignedLongLong(entry.spaceId))
      const ids = numberList(attempt(() => $.SLSCopyWindowsWithOptionsAndTags(cid, 0, spaces, 0x7, setTags, clearTags), null))
      if (ids.indexOf(cgWindowNumber) >= 0) reverse.push(entry)
    }
  } finally {
    $.free(setTags)
    $.free(clearTags)
  }
  const bindings = []
  const seen = {}
  for (const entry of direct.concat(reverse)) {
    const key = entry.displayUuid + ':' + String(entry.spaceId)
    if (seen[key]) continue
    seen[key] = true
    bindings.push(entry)
  }
  const source = direct.length && reverse.length
    ? 'isolated-direct+reverse'
    : direct.length
      ? 'isolated-direct'
      : reverse.length
        ? 'isolated-reverse'
        : 'none'
  const base = {
    bridge: 'isolated-jxa',
    bindingCount: bindings.length,
    bindingSource: source,
    bindings: bindings.slice(0, 16).map((binding) => ({
      spaceId: String(binding.spaceId),
      displayUuid: String(binding.displayUuid || '')
    })),
    managedSpaceCount: entries.length,
    directBindingCount: direct.length,
    reverseBindingCount: reverse.length
  }
  if (!bindings.length) return Object.assign(base, { detail: 'empty-spaces', sameSpace: false })
  const current = bindings.filter((binding) => binding.currentSpaceId === binding.spaceId)
  if (current.length) return Object.assign(base, { detail: 'current', sameSpace: true, switched: false, confirmed: true })
  if (bindings.length !== 1) return Object.assign(base, { detail: 'ambiguous-spaces', sameSpace: false, switched: false, confirmed: false })
  if (!shouldSwitch) return Object.assign(base, { detail: 'remote', sameSpace: false, switched: false, confirmed: false })
  const binding = bindings[0]
  const display = $.NSString.stringWithString(binding.displayUuid)
  $.SLSManagedDisplaySetCurrentSpace(cid, display, binding.spaceId)
  const deadline = Date.now() + 2000
  while (Date.now() <= deadline) {
    const confirmed = managedRows().some((item) => String(item && item['Display Identifier'] || '') === binding.displayUuid
      && Math.trunc(Number(item && item['Current Space'] && item['Current Space'].id64 || 0)) === binding.spaceId)
    if (confirmed) return Object.assign(base, { detail: 'switch-confirmed', sameSpace: false, switched: true, confirmed: true })
    $.NSThread.sleepForTimeInterval(0.05)
  }
  return Object.assign(base, { detail: 'switch-timeout', sameSpace: false, switched: false, confirmed: false })
}
let payload
try {
  payload = executeSpaceBridge()
} catch (error) {
  payload = { bridge: 'isolated-jxa', detail: 'error', bindingCount: 0, bindingSource: 'none', sameSpace: false, managedSpaceCount: 0, directBindingCount: 0, reverseBindingCount: 0 }
}
JSON.stringify(payload)
`
}

function macosActivateWindowScript(pid, ordinal, cgWindowNumber) {
  return String.raw`
ObjC.import('Foundation')
ObjC.import('CoreGraphics')
ObjC.import('ApplicationServices')
ObjC.import('AppKit')
const systemEvents = Application('System Events')
const processId = ${pid}
const ordinal = ${ordinal}
const cgWindowNumber = ${cgWindowNumber}
let exactAxApiAvailable = false
try {
  ObjC.bindFunction('AXUIElementCreateApplication', ['id', ['int']])
  ObjC.bindFunction('AXUIElementCopyAttributeValue', ['int', ['id', 'id', 'id *']])
  ObjC.bindFunction('AXUIElementSetAttributeValue', ['int', ['id', 'id', 'id']])
  ObjC.bindFunction('AXUIElementPerformAction', ['int', ['id', 'id']])
  ObjC.bindFunction('_AXUIElementGetWindow', ['int', ['id', 'uint32_t *']])
  exactAxApiAvailable = true
} catch (error) {}
function environmentValue(name) {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey(name)
  return value ? String(ObjC.unwrap(value) || '') : ''
}
const debugTrace = environmentValue('EYPC_WINDOW_DEBUG_TRACE') === '1'
const trace = []
let activationReasonCode = ''
function addTrace(stage, outcome, detail) {
  if (!debugTrace || trace.length >= 16) return
  trace.push(detail ? { stage, outcome, detail } : { stage, outcome })
}
function emit(outcome) {
  const payload = { outcome }
  if (activationReasonCode) payload.reasonCode = activationReasonCode
  if (debugTrace) payload.trace = trace
  return JSON.stringify(payload)
}
function expectedTargetTitle() {
  return environmentValue('EYPC_WINDOW_TARGET_TITLE')
}
const expectedTitle = expectedTargetTitle()
const expectedApp = normalizeTitle(environmentValue('EYPC_WINDOW_TARGET_APP_ID'))
const requireExactAx = environmentValue('EYPC_WINDOW_REQUIRE_EXACT_AX') === '1'
const allowProcessSpaceFallback = environmentValue('EYPC_WINDOW_ALLOW_PROCESS_SPACE_FALLBACK') === '1'
function axAttributeName(name) {
  return $.NSString.stringWithString(name)
}
function copyAxAttribute(element, name) {
  if (!exactAxApiAvailable || !element) return { error: -1, value: null }
  try {
    const output = Ref()
    const error = Number($.AXUIElementCopyAttributeValue(element, axAttributeName(name), output))
    return { error, value: error === 0 ? output[0] : null }
  } catch (error) {
    return { error: -1, value: null }
  }
}
function setAxAttribute(element, name, value) {
  if (!exactAxApiAvailable || !element) return false
  try { return Number($.AXUIElementSetAttributeValue(element, axAttributeName(name), value)) === 0 } catch (error) { return false }
}
function performAxAction(element, name) {
  if (!exactAxApiAvailable || !element) return false
  try { return Number($.AXUIElementPerformAction(element, axAttributeName(name))) === 0 } catch (error) { return false }
}
function exactCgWindowNumber(element) {
  if (!exactAxApiAvailable || !element) return 0
  try {
    const output = Ref()
    if (Number($._AXUIElementGetWindow(element, output)) !== 0) return 0
    return Math.trunc(Number(output[0] || 0))
  } catch (error) {
    return 0
  }
}
function resolveExactAxTarget() {
  if (!exactAxApiAvailable || cgWindowNumber <= 0) return { outcome: 'unavailable' }
  let app = null
  try { app = $.AXUIElementCreateApplication(processId) } catch (error) {}
  if (!app) return { outcome: 'unavailable' }
  const copied = copyAxAttribute(app, 'AXWindows')
  if (copied.error !== 0 || !copied.value) return { outcome: 'unavailable' }
  const matches = []
  const count = Math.max(0, Math.trunc(Number(copied.value.count || 0)))
  for (let index = 0; index < count; index += 1) {
    let candidate = null
    try { candidate = copied.value.objectAtIndex(index) } catch (error) {}
    if (candidate && exactCgWindowNumber(candidate) === cgWindowNumber) matches.push(candidate)
  }
  if (matches.length === 1) return { outcome: 'matched', app, target: matches[0] }
  if (matches.length > 1) return { outcome: 'ambiguous' }
  return { outcome: 'not-found' }
}
function exactAxFocused(app) {
  const focused = copyAxAttribute(app, 'AXFocusedWindow')
  return focused.error === 0 && focused.value && exactCgWindowNumber(focused.value) === cgWindowNumber
}
function validateExactCgTarget() {
  if (cgWindowNumber <= 0) return { outcome: 'unavailable' }
  try {
    const raw = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll, $.kCGNullWindowID)))
    const cgList = Array.isArray(raw) ? raw : []
    const matches = cgList.filter((item) => {
      if (!item || typeof item !== 'object') return false
      if (Math.trunc(Number(item.kCGWindowLayer || 0)) !== 0) return false
      if (Math.trunc(Number(item.kCGWindowOwnerPID || 0)) !== processId) return false
      if (Math.trunc(Number(item.kCGWindowNumber || 0)) !== cgWindowNumber) return false
      const alpha = Number(item.kCGWindowAlpha)
      return !Number.isFinite(alpha) || alpha > 0
    })
    if (matches.length !== 1) return { outcome: matches.length > 1 ? 'ambiguous' : 'not-found' }
    const actualTitle = normalizeTitle(matches[0].kCGWindowName)
    if (!actualTitle) return { outcome: 'unavailable' }
    if (expectedTitle && actualTitle !== normalizeTitle(expectedTitle)) return { outcome: 'title-mismatch' }
    return { outcome: 'matched' }
  } catch (error) {
    return { outcome: 'unavailable' }
  }
}
function activateExactAxTarget(resolved) {
  addTrace('process', 'ok')
  addTrace('target', 'ok', 'ax-cg-id-match')
  const target = resolved.target
  const app = resolved.app
  const running = (() => {
    try { return $.NSRunningApplication.runningApplicationWithProcessIdentifier(processId) } catch (error) { return null }
  })()
  if (!running || Boolean(running.terminated)) {
    addTrace('process', 'not-found')
    return 'not-found'
  }
  const runningBundle = normalizeTitle((() => {
    try { return running.bundleIdentifier ? ObjC.unwrap(running.bundleIdentifier) : '' } catch (error) { return '' }
  })())
  const runningName = normalizeTitle((() => {
    try { return running.localizedName ? ObjC.unwrap(running.localizedName) : '' } catch (error) { return '' }
  })())
  if (expectedApp && expectedApp !== runningBundle && expectedApp !== runningName) {
    activationReasonCode = 'target-title-changed'
    addTrace('target', 'not-found', 'title-mismatch')
    return 'not-found'
  }
  const minimized = copyAxAttribute(target, 'AXMinimized')
  if (minimized.error === 0 && Boolean(ObjC.unwrap(minimized.value))) {
    if (!setAxAttribute(target, 'AXMinimized', $.NSNumber.numberWithBool(false))) {
      addTrace('restore', 'failed')
      return 'failed'
    }
    addTrace('restore', 'ok')
  } else {
    addTrace('restore', minimized.error === 0 ? 'skipped' : 'unavailable')
  }
  let raised = performAxAction(target, 'AXRaise')
  setAxAttribute(target, 'AXMain', $.NSNumber.numberWithBool(true))
  let foreground = false
  try { foreground = Boolean(running.activateWithOptions($.NSApplicationActivateIgnoringOtherApps)) } catch (error) {}
  $.NSThread.sleepForTimeInterval(0.05)
  for (let retry = 0; retry < 4; retry += 1) {
    // Chromium advertises AXFocusedWindow as read-only, but accepts this exact AX element and
    // otherwise keeps the previously focused sibling window in a multi-window process.
    setAxAttribute(app, 'AXFocusedWindow', target)
    setAxAttribute(app, 'AXMainWindow', target)
    setAxAttribute(target, 'AXMain', $.NSNumber.numberWithBool(true))
    setAxAttribute(target, 'AXFocused', $.NSNumber.numberWithBool(true))
    raised = performAxAction(target, 'AXRaise') || raised
    try { foreground = Boolean(running.activateWithOptions($.NSApplicationActivateIgnoringOtherApps)) || foreground } catch (error) {}
    $.NSThread.sleepForTimeInterval(0.06)
    if (exactAxFocused(app)) {
      addTrace('foreground', foreground ? 'ok' : 'unavailable')
      addTrace('raise', raised ? 'ok' : 'unavailable')
      addTrace('verify', 'ok', 'ax-focused-window')
      return 'activated'
    }
  }
  addTrace('foreground', foreground ? 'ok' : 'unavailable')
  addTrace('raise', raised ? 'ok' : 'failed')
  addTrace('verify', 'failed', 'focus-state-mismatch')
  return 'failed'
}
function normalizeTitle(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}
function currentWindowTitle(window) {
  let title = ''
  try { title = String(window.name() || '') } catch (error) {}
  if (!title) {
    try { title = String(window.attributes.byName('AXTitle').value() || '') } catch (error) {}
  }
  return normalizeTitle(title)
}
function resolveTargetWindow(windows, targetOrdinal, targetTitle) {
  const normalizedTargetTitle = normalizeTitle(targetTitle)
  const titleMatches = []
  let ordinalMatch = null
  for (let index = 0; index < windows.length; index += 1) {
    const current = windows[index]
    const title = currentWindowTitle(current)
    if (targetOrdinal > 0 && index + 1 === targetOrdinal) ordinalMatch = { current, title }
    if (normalizedTargetTitle && title === normalizedTargetTitle) titleMatches.push(current)
  }
  if (titleMatches.length === 1) return { target: titleMatches[0] }
  if (titleMatches.length > 1) {
    if (ordinalMatch && ordinalMatch.title === normalizedTargetTitle) return { target: ordinalMatch.current }
    return { outcome: 'ambiguous' }
  }
  if (!normalizedTargetTitle && ordinalMatch) return { target: ordinalMatch.current }
  return { outcome: 'not-found' }
}
function resolveCgOrdinal() {
  if (cgWindowNumber <= 0) return 0
  try {
    const raw = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll, $.kCGNullWindowID)))
    const cgList = Array.isArray(raw) ? raw : []
    let index = 0
    for (const item of cgList) {
      if (!item || typeof item !== 'object') continue
      const layer = Math.trunc(Number(item.kCGWindowLayer || 0))
      if (layer !== 0) continue
      const itemPid = Math.trunc(Number(item.kCGWindowOwnerPID || 0))
      if (itemPid !== processId) continue
      const wid = Math.trunc(Number(item.kCGWindowNumber || 0))
      const title = normalizeTitle(item.kCGWindowName)
      const alpha = Number(item.kCGWindowAlpha)
      if (!title || (Number.isFinite(alpha) && alpha <= 0)) continue
      index += 1
      if (wid === cgWindowNumber) return index
    }
  } catch (error) {}
  return 0
}
function booleanAttribute(target, name) {
  try { return { known: true, value: target.attributes.byName(name).value() === true } } catch (error) { return { known: false, value: false } }
}
function activate() {
  if (cgWindowNumber > 0) {
    const cgIdentity = validateExactCgTarget()
    if (cgIdentity.outcome === 'title-mismatch') {
      activationReasonCode = 'target-title-changed'
      addTrace('target', 'not-found', 'title-mismatch')
      return 'not-found'
    }
    if (cgIdentity.outcome === 'ambiguous') {
      addTrace('target', 'ambiguous')
      return 'ambiguous'
    }
    if (cgIdentity.outcome === 'not-found') {
      addTrace('target', 'not-found')
      return 'not-found'
    }
    if (cgIdentity.outcome !== 'matched') {
      addTrace('target', 'unavailable', 'title-match')
      return 'failed'
    }
    addTrace('target', 'ok', 'title-match')
  }
  const exact = resolveExactAxTarget()
  if (exact.outcome === 'matched') return activateExactAxTarget(exact)
  if (exact.outcome === 'ambiguous') {
    addTrace('target', 'ambiguous', 'ax-cg-id-match')
    return 'ambiguous'
  }
  if (requireExactAx) {
    addTrace('target', exact.outcome === 'not-found' ? 'not-found' : 'unavailable', 'ax-cg-id-match')
    return exact.outcome === 'not-found' ? 'not-found' : 'failed'
  }
  let processes = []
  try { processes = systemEvents.applicationProcesses.whose({ unixId: processId })() } catch (error) {
    addTrace('process', 'denied')
    return 'permission-required'
  }
  if (!processes.length) {
    addTrace('process', 'not-found')
    return 'not-found'
  }
  addTrace('process', 'ok')
  const targetProcess = processes[0]
  let windows = []
  try { windows = targetProcess.windows() } catch (error) {
    addTrace('target', 'denied')
    return 'permission-required'
  }
  let resolved = resolveTargetWindow(windows, ordinal, expectedTitle)
  let resolvedByCgOrdinal = false
  if (!resolved.target && resolved.outcome !== 'ambiguous' && allowProcessSpaceFallback) {
    try {
      targetProcess.frontmost = true
      addTrace('space', 'ok', 'single-window-frontmost')
      windows = targetProcess.windows()
      resolved = resolveTargetWindow(windows, ordinal, expectedTitle)
    } catch (error) {}
  }
  if (!resolved.target && resolved.outcome !== 'ambiguous' && cgWindowNumber > 0) {
    const cgOrdinal = resolveCgOrdinal()
    if (cgOrdinal > 0) {
      resolved = resolveTargetWindow(windows, cgOrdinal, '')
      if (resolved.target) resolvedByCgOrdinal = true
    }
  }
  if (resolved.outcome === 'ambiguous') {
    addTrace('target', 'ambiguous')
    return 'ambiguous'
  }
  if (!resolved.target) {
    addTrace('target', 'not-found')
    return 'not-found'
  }
  addTrace('target', 'ok', resolvedByCgOrdinal ? 'cg-ordinal-fallback' : 'title-match')
  const target = resolved.target
  const minimized = booleanAttribute(target, 'AXMinimized')
  if (minimized.known && minimized.value) {
    try { target.attributes.byName('AXMinimized').set({ value: false }) } catch (error) {
      addTrace('restore', 'failed')
      return 'failed'
    }
    const restored = booleanAttribute(target, 'AXMinimized')
    if (restored.known && restored.value) {
      addTrace('restore', 'failed')
      return 'failed'
    }
    addTrace('restore', 'ok')
  } else {
    addTrace('restore', minimized.known ? 'skipped' : 'unavailable')
  }
  try { targetProcess.frontmost = true } catch (error) {
    addTrace('foreground', 'denied')
    return 'focus-denied'
  }
  try { target.attributes.byName('AXFocused').set({ value: true }) } catch (error) {}
  addTrace('foreground', 'ok')
  try { target.actions.byName('AXRaise').perform() } catch (error) {
    addTrace('raise', 'failed')
    return 'failed'
  }
  addTrace('raise', 'ok')
  const minimizedAfterRaise = booleanAttribute(target, 'AXMinimized')
  if (minimizedAfterRaise.known && minimizedAfterRaise.value) {
    addTrace('verify', 'failed')
    return 'failed'
  }
  const focusedAfterRaise = booleanAttribute(target, 'AXFocused')
  if (focusedAfterRaise.known && !focusedAfterRaise.value) {
    addTrace('verify', 'unavailable', 'focus-state-mismatch')
    return 'activated'
  }
  addTrace('verify', minimizedAfterRaise.known || focusedAfterRaise.known ? 'ok' : 'unavailable')
  return 'activated'
}
emit(activate())
`
}

function macosCloseWindowScript(pid, ordinal) {
  return String.raw`
ObjC.import('Foundation')
const systemEvents = Application('System Events')
const processId = ${pid}
const ordinal = ${ordinal}
function expectedTargetTitle() {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey('EYPC_WINDOW_TARGET_TITLE')
  return value ? String(ObjC.unwrap(value) || '') : ''
}
function normalizeTitle(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}
function currentWindowTitle(window) {
  let title = ''
  try { title = String(window.name() || '') } catch (error) {}
  if (!title) {
    try { title = String(window.attributes.byName('AXTitle').value() || '') } catch (error) {}
  }
  return normalizeTitle(title)
}
function resolveTargetWindow(windows, targetOrdinal, targetTitle) {
  const normalizedTargetTitle = normalizeTitle(targetTitle)
  const titleMatches = []
  let ordinalMatch = null
  for (let index = 0; index < windows.length; index += 1) {
    const current = windows[index]
    const title = currentWindowTitle(current)
    if (targetOrdinal > 0 && index + 1 === targetOrdinal) ordinalMatch = { current, title }
    if (normalizedTargetTitle && title === normalizedTargetTitle) titleMatches.push(current)
  }
  if (titleMatches.length === 1) return { target: titleMatches[0] }
  if (titleMatches.length > 1) {
    if (ordinalMatch && ordinalMatch.title === normalizedTargetTitle) return { target: ordinalMatch.current }
    return { outcome: 'ambiguous' }
  }
  if (!normalizedTargetTitle && ordinalMatch) return { target: ordinalMatch.current }
  return { outcome: 'not-found' }
}
const expectedTitle = expectedTargetTitle()
const processes = systemEvents.applicationProcesses.whose({ unixId: processId })()
if (!processes.length) {
  JSON.stringify({ outcome: 'not-found' })
} else {
  const targetProcess = processes[0]
  const windows = targetProcess.windows()
  const resolved = resolveTargetWindow(windows, ordinal, expectedTitle)
  if (resolved.outcome === 'ambiguous') {
    JSON.stringify({ outcome: 'ambiguous' })
  } else if (!resolved.target) {
    JSON.stringify({ outcome: 'not-found' })
  } else {
    const target = resolved.target
    try {
      const closeButton = target.attributes.byName('AXCloseButton').value()
      closeButton.actions.byName('AXPress').perform()
      JSON.stringify({ outcome: 'closed' })
    } catch (error) {
      try {
        target.actions.byName('AXPress').perform()
        JSON.stringify({ outcome: 'closed' })
      } catch (inner) {
        JSON.stringify({ outcome: 'close-denied', message: String(inner) })
      }
    }
  }
}
`
}

// Private SkyLight CGS: resolve a concrete CGWindowNumber against the current managed-Space map.
// Direct per-window queries are authoritative; per-Space tag scans only corroborate/fill a direct miss.
// Bindings stay preload-session-only because CG window IDs, PIDs, titles and Space IDs are recyclable.
const WINDOW_BRIDGE_REVISION = 'wj18-cg-title-source'
const MACOS_CGS_WINDOW_TAG_MASK = 0x7
const MACOS_CGS_SPACE_QUERY_MASKS = [0x7, 0x7fffffff]
const MACOS_CGS_SPACE_SETTLE_MS = 120
const MACOS_CGS_SPACE_CONFIRM_TIMEOUT_MS = 2_000
const MACOS_CGS_SPACE_CONFIRM_INTERVAL_MS = 50
const MACOS_WINDOW_IDENTITY_CACHE_TTL_MS = 5 * 60 * 1_000
const MACOS_CF_STRING_ENCODING_UTF8 = 0x08000100
let macosCgsApi = null
/** @type {Map<number, Array<{ spaceId: bigint, displayUuid: string }>>} */
let macosWindowSpaceCache = new Map()
/** @type {{ entries: Array<{ spaceId: bigint, displayUuid: string }>, displayBySpace: Map<string, string>, currentByDisplay: Map<string, string> } | null} */
let macosManagedSpaceSnapshot = null
/** @type {Map<string, { checkedAt: number, snapshot: object }>} */
let macosWindowIdentityCache = new Map()
const MACOS_WINDOW_SPACE_LEARNED_KEY = 'eypc/macos-window-spaces/v1'
let macosLegacySpaceBindingMigrationAttempted = false

function loadMacosCgsApi() {
  if (macosCgsApi !== null) return macosCgsApi
  macosCgsApi = false
  if (process.platform !== 'darwin') return false
  try {
    let koffi = null
    const candidates = ['koffi', path.join(__dirname, 'node_modules', 'koffi'), path.join(__dirname, '..', 'node_modules', 'koffi')]
    for (const id of candidates) {
      try {
        koffi = require(id)
        break
      } catch {}
    }
    if (!koffi) return false
    const sky = koffi.load('/System/Library/PrivateFrameworks/SkyLight.framework/Versions/A/SkyLight')
    const cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
    macosCgsApi = {
      koffi,
      SLSMainConnectionID: sky.func('SLSMainConnectionID', 'int', []),
      SLSCopySpacesForWindows: sky.func('SLSCopySpacesForWindows', 'void *', ['int', 'int', 'void *']),
      SLSCopyManagedDisplaySpaces: sky.func('SLSCopyManagedDisplaySpaces', 'void *', ['int']),
      SLSCopyWindowsWithOptionsAndTags: sky.func('SLSCopyWindowsWithOptionsAndTags', 'void *', ['int', 'uint32', 'void *', 'uint32', 'void *', 'void *']),
      SLSManagedDisplaySetCurrentSpace: sky.func('SLSManagedDisplaySetCurrentSpace', 'void', ['int', 'void *', 'uint64']),
      CFNumberCreate: cf.func('CFNumberCreate', 'void *', ['void *', 'int', 'void *']),
      CFArrayCreate: cf.func('CFArrayCreate', 'void *', ['void *', 'void *', 'long', 'void *']),
      CFArrayGetCount: cf.func('CFArrayGetCount', 'long', ['void *']),
      CFArrayGetValueAtIndex: cf.func('CFArrayGetValueAtIndex', 'void *', ['void *', 'long']),
      CFNumberGetValue: cf.func('CFNumberGetValue', 'bool', ['void *', 'int', 'void *']),
      CFStringCreateWithCString: cf.func('CFStringCreateWithCString', 'void *', ['void *', 'str', 'uint32']),
      CFStringGetLength: cf.func('CFStringGetLength', 'long', ['void *']),
      CFStringGetMaximumSizeForEncoding: cf.func('CFStringGetMaximumSizeForEncoding', 'long', ['long', 'uint32']),
      CFStringGetCString: cf.func('CFStringGetCString', 'bool', ['void *', 'void *', 'long', 'uint32']),
      CFDictionaryGetValue: cf.func('CFDictionaryGetValue', 'void *', ['void *', 'void *']),
      CFRelease: cf.func('CFRelease', 'void', ['void *'])
    }
    return macosCgsApi
  } catch {
    macosCgsApi = false
    return false
  }
}

function macosCreateCfNumber(api, value, bits) {
  if (bits === 64) {
    const buf = Buffer.alloc(8)
    buf.writeBigUInt64LE(BigInt(value), 0)
    return api.CFNumberCreate(null, 4, buf)
  }
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(Number(value) >>> 0, 0)
  return api.CFNumberCreate(null, 3, buf)
}

function macosCreateCfArrayOne(api, cfValue) {
  const ptrArray = Buffer.alloc(8)
  ptrArray.writeBigUInt64LE(BigInt(api.koffi.address(cfValue)), 0)
  return api.CFArrayCreate(null, ptrArray, 1, null)
}

function macosReadCfU64(api, cfNum) {
  if (!cfNum) return null
  const out = Buffer.alloc(8)
  if (!api.CFNumberGetValue(cfNum, 4, out)) return null
  return out.readBigUInt64LE(0)
}

function macosReadCfWindowId(api, cfNum) {
  if (!cfNum) return null
  const as64 = macosReadCfU64(api, cfNum)
  if (as64 != null) return Number(as64)
  const out = Buffer.alloc(4)
  if (!api.CFNumberGetValue(cfNum, 3, out)) return null
  return out.readUInt32LE(0)
}

function macosReadCfString(api, cfString) {
  if (!cfString) return ''
  const length = Number(api.CFStringGetLength(cfString))
  const max = Number(api.CFStringGetMaximumSizeForEncoding(length, MACOS_CF_STRING_ENCODING_UTF8)) + 1
  if (!Number.isFinite(max) || max <= 1) return ''
  const buf = Buffer.alloc(max)
  if (!api.CFStringGetCString(cfString, buf, buf.length, MACOS_CF_STRING_ENCODING_UTF8)) return ''
  const end = buf.indexOf(0)
  return buf.toString('utf8', 0, end < 0 ? buf.length : end).trim()
}

function macosCreateCfKey(api, name) {
  return api.CFStringCreateWithCString(null, name, MACOS_CF_STRING_ENCODING_UTF8)
}

/** Native CF walk of every managed display → Spaces id64 + current Space + Display Identifier. */
function macosLoadDisplayBySpaceMap(api, cid) {
  const displayBySpace = new Map()
  const currentByDisplay = new Map()
  const entries = []
  const managed = api.SLSCopyManagedDisplaySpaces(cid)
  if (!managed) return { displayBySpace, currentByDisplay, entries }
  const keyDisplay = macosCreateCfKey(api, 'Display Identifier')
  const keySpaces = macosCreateCfKey(api, 'Spaces')
  const keyCurrent = macosCreateCfKey(api, 'Current Space')
  const keyId = macosCreateCfKey(api, 'id64')
  try {
    if (!keyDisplay || !keySpaces || !keyCurrent || !keyId) return { displayBySpace, currentByDisplay, entries }
    const displayCount = Number(api.CFArrayGetCount(managed))
    for (let i = 0; i < displayCount; i++) {
      const displayDict = api.CFArrayGetValueAtIndex(managed, i)
      if (!displayDict) continue
      const displayUuid = macosReadCfString(api, api.CFDictionaryGetValue(displayDict, keyDisplay))
      if (!displayUuid) continue
      const currentDict = api.CFDictionaryGetValue(displayDict, keyCurrent)
      if (currentDict) {
        const currentId = macosReadCfU64(api, api.CFDictionaryGetValue(currentDict, keyId))
        if (currentId != null && currentId > 0n) currentByDisplay.set(displayUuid, currentId.toString())
      }
      const spaces = api.CFDictionaryGetValue(displayDict, keySpaces)
      if (!spaces) continue
      const spaceCount = Number(api.CFArrayGetCount(spaces))
      for (let j = 0; j < spaceCount; j++) {
        const spaceDict = api.CFArrayGetValueAtIndex(spaces, j)
        if (!spaceDict) continue
        const spaceId = macosReadCfU64(api, api.CFDictionaryGetValue(spaceDict, keyId))
        if (spaceId == null || spaceId <= 0n) continue
        const raw = spaceId.toString()
        entries.push({ spaceId, displayUuid })
        displayBySpace.set(raw, displayUuid)
      }
    }
  } finally {
    if (keyDisplay) api.CFRelease(keyDisplay)
    if (keySpaces) api.CFRelease(keySpaces)
    if (keyCurrent) api.CFRelease(keyCurrent)
    if (keyId) api.CFRelease(keyId)
    api.CFRelease(managed)
  }
  return { displayBySpace, currentByDisplay, entries }
}

function macosRemoveLegacySpaceBindingCache() {
  if (macosLegacySpaceBindingMigrationAttempted) return
  macosLegacySpaceBindingMigrationAttempted = true
  try {
    const storage = globalThis.utools && globalThis.utools.dbStorage
    if (storage && typeof storage.removeItem === 'function') storage.removeItem(MACOS_WINDOW_SPACE_LEARNED_KEY)
  } catch {}
}

function macosSpaceBindingKey(binding) {
  if (!binding || !binding.spaceId || !binding.displayUuid) return ''
  return `${binding.spaceId.toString()}:${String(binding.displayUuid)}`
}

function macosDedupeSpaceBindings(bindings) {
  const result = []
  const seen = new Set()
  for (const binding of Array.isArray(bindings) ? bindings : []) {
    const key = macosSpaceBindingKey(binding)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push({ spaceId: binding.spaceId, displayUuid: String(binding.displayUuid) })
  }
  return result
}

function macosCacheSpaceBindings(cache, cgWindowNumber, bindings) {
  const wid = cgWindowNumber >>> 0
  if (!wid) return
  const normalized = macosDedupeSpaceBindings(bindings)
  if (normalized.length) cache.set(wid, normalized)
  else cache.delete(wid)
}

/** Reads only a previously verified/prewarmed binding and refreshes current-Space state. */
function macosCachedWindowSpaceResolution(api, cid, cgWindowNumber) {
  const want = cgWindowNumber >>> 0
  const cached = macosDedupeSpaceBindings(macosWindowSpaceCache.get(want) || [])
  if (!want || !cached.length) return null
  const managed = macosLoadDisplayBySpaceMap(api, cid)
  macosManagedSpaceSnapshot = managed
  const bindings = cached.filter((binding) => managed.displayBySpace.get(binding.spaceId.toString()) === binding.displayUuid)
  if (!bindings.length) {
    macosWindowSpaceCache.delete(want)
    return null
  }
  macosCacheSpaceBindings(macosWindowSpaceCache, want, bindings)
  return {
    bindings,
    source: 'session-cache',
    currentByDisplay: managed.currentByDisplay,
    managedSpaceCount: managed.entries.length,
    directBindingCount: 0,
    reverseBindingCount: 0,
    cacheHit: true
  }
}

function macosSpacesForWindow(api, cid, cgWindowNumber, mask) {
  const cfNum = macosCreateCfNumber(api, cgWindowNumber, 32)
  if (!cfNum) return []
  const cfArr = macosCreateCfArrayOne(api, cfNum)
  if (!cfArr) {
    api.CFRelease(cfNum)
    return []
  }
  const spaceIds = []
  const spaces = api.SLSCopySpacesForWindows(cid, mask, cfArr)
  if (spaces) {
    const count = Number(api.CFArrayGetCount(spaces))
    for (let i = 0; i < count; i++) {
      const spaceId = macosReadCfU64(api, api.CFArrayGetValueAtIndex(spaces, i))
      if (spaceId != null && spaceId > 0n) spaceIds.push(spaceId)
    }
    api.CFRelease(spaces)
  }
  api.CFRelease(cfArr)
  api.CFRelease(cfNum)
  return spaceIds
}

function macosWindowNumbersOnSpace(api, cid, spaceId) {
  const spaceNum = macosCreateCfNumber(api, spaceId, 64)
  if (!spaceNum) return []
  const spaceArr = macosCreateCfArrayOne(api, spaceNum)
  if (!spaceArr) {
    api.CFRelease(spaceNum)
    return []
  }
  const ids = []
  const setTags = Buffer.alloc(8)
  const clearTags = Buffer.alloc(8)
  const windows = api.SLSCopyWindowsWithOptionsAndTags(cid, 0, spaceArr, MACOS_CGS_WINDOW_TAG_MASK, setTags, clearTags)
  if (windows) {
    const count = Number(api.CFArrayGetCount(windows))
    const seen = new Set()
    for (let i = 0; i < count; i++) {
      const wid = macosReadCfWindowId(api, api.CFArrayGetValueAtIndex(windows, i))
      if (!Number.isInteger(wid) || wid <= 0 || seen.has(wid)) continue
      seen.add(wid)
      ids.push(wid)
    }
    api.CFRelease(windows)
  }
  api.CFRelease(spaceArr)
  api.CFRelease(spaceNum)
  return ids
}

function macosBindingsFromSpaceIds(spaceIds, displayBySpace) {
  const bindings = []
  for (const spaceId of spaceIds) {
    const displayUuid = displayBySpace.get(spaceId.toString())
    if (displayUuid) bindings.push({ spaceId, displayUuid })
  }
  return macosDedupeSpaceBindings(bindings)
}

function macosResolveBindingsByReverseScan(api, cid, cgWindowNumber, displayBySpace, entries) {
  const want = cgWindowNumber >>> 0
  const bindings = []
  for (const entry of entries) {
    const ids = macosWindowNumbersOnSpace(api, cid, entry.spaceId)
    if (!ids.includes(want)) continue
    const displayUuid = displayBySpace.get(entry.spaceId.toString()) || entry.displayUuid
    if (!displayUuid) continue
    bindings.push({ spaceId: entry.spaceId, displayUuid })
  }
  return macosDedupeSpaceBindings(bindings)
}

function macosDirectBindingsForWindow(api, cid, cgWindowNumber, displayBySpace) {
  const spaceIds = []
  const seen = new Set()
  for (const mask of MACOS_CGS_SPACE_QUERY_MASKS) {
    for (const spaceId of macosSpacesForWindow(api, cid, cgWindowNumber, mask)) {
      const raw = spaceId.toString()
      if (seen.has(raw)) continue
      seen.add(raw)
      spaceIds.push(spaceId)
    }
  }
  return macosBindingsFromSpaceIds(spaceIds, displayBySpace)
}

/**
 * Full reload: cache session-only bindings from managed-Space tags, then corroborate inventory
 * CG refs with direct per-window queries. No binding crosses a preload lifetime.
 */
function macosRebuildWindowSpaceCache(api, cid, inventoryWindows) {
  const { displayBySpace, currentByDisplay, entries } = macosLoadDisplayBySpaceMap(api, cid)
  macosManagedSpaceSnapshot = { entries, displayBySpace, currentByDisplay }
  const next = new Map()
  for (const entry of entries) {
    for (const wid of macosWindowNumbersOnSpace(api, cid, entry.spaceId)) {
      const existing = next.get(wid) || []
      macosCacheSpaceBindings(next, wid, [...existing, { spaceId: entry.spaceId, displayUuid: entry.displayUuid }])
    }
  }
  for (const item of Array.isArray(inventoryWindows) ? inventoryWindows : []) {
    const parts = /^(\d{1,12}):(\d{1,6}):(\d{1,12})$/.exec(String(item && item.nativeRef || '').trim())
    if (!parts || Number(parts[2]) !== 0) continue
    const wid = Number(parts[3])
    if (!Number.isInteger(wid) || wid <= 0) continue
    const direct = macosDirectBindingsForWindow(api, cid, wid, displayBySpace)
    if (direct.length) macosCacheSpaceBindings(next, wid, [...(next.get(wid) || []), ...direct])
  }
  macosWindowSpaceCache = next
  return { cache: next, displayBySpace, currentByDisplay, entries, windowNumbers: next.size }
}

function macosLookupOrResolveWindowSpaceBinding(api, cid, cgWindowNumber) {
  const want = cgWindowNumber >>> 0
  const cached = macosCachedWindowSpaceResolution(api, cid, want)
  if (cached) return cached
  const managed = macosLoadDisplayBySpaceMap(api, cid)
  macosManagedSpaceSnapshot = managed
  const direct = macosDirectBindingsForWindow(api, cid, want, managed.displayBySpace)
  const reverse = macosResolveBindingsByReverseScan(api, cid, want, managed.displayBySpace, managed.entries)
  const bindings = macosDedupeSpaceBindings([...direct, ...reverse])
  macosCacheSpaceBindings(macosWindowSpaceCache, want, bindings)
  const source = direct.length && reverse.length ? 'direct+reverse' : direct.length ? 'direct' : reverse.length ? 'reverse' : 'none'
  return {
    bindings,
    source,
    currentByDisplay: managed.currentByDisplay,
    managedSpaceCount: managed.entries.length,
    directBindingCount: direct.length,
    reverseBindingCount: reverse.length
  }
}

function trySwitchMacosSpaceFromSessionCache(nativeRef) {
  try {
    const parts = /^(\d{1,12}):(\d{1,6}):(\d{1,12})$/.exec(String(nativeRef || '').trim())
    if (!parts || Number(parts[2]) !== 0) return null
    const cgWindowNumber = Number(parts[3])
    if (!Number.isInteger(cgWindowNumber) || cgWindowNumber <= 0) return null
    const api = loadMacosCgsApi()
    if (!api) return null
    const cid = api.SLSMainConnectionID()
    const resolved = macosCachedWindowSpaceResolution(api, cid, cgWindowNumber)
    if (!resolved) return null
    const probe = {
      bridge: 'in-process',
      managedSpaceCount: resolved.managedSpaceCount,
      directBindingCount: 0,
      reverseBindingCount: 0,
      bindingCount: resolved.bindings.length,
      bindingSource: 'session-cache'
    }
    const currentBindings = resolved.bindings.filter((binding) => resolved.currentByDisplay.get(binding.displayUuid) === binding.spaceId.toString())
    if (currentBindings.length) {
      return { ...probe, switched: false, detail: 'current', binding: currentBindings[0], sameSpace: true, cacheHit: true }
    }
    if (resolved.bindings.length !== 1) {
      return { ...probe, switched: false, detail: 'ambiguous-spaces', sameSpace: false, cacheHit: true }
    }
    const binding = resolved.bindings[0]
    const switched = macosSwitchToCachedSpace(api, cid, binding, resolved.currentByDisplay)
    if (['no-display', 'no-space-id'].includes(switched.detail)) {
      macosWindowSpaceCache.delete(cgWindowNumber >>> 0)
      return null
    }
    return { ...probe, ...switched, binding, sameSpace: false, cacheHit: true }
  } catch {
    return null
  }
}

function macosSwitchToCachedSpace(api, cid, binding, currentByDisplay) {
  if (!binding || !binding.spaceId || binding.spaceId <= 0n || !binding.displayUuid) {
    return { switched: false, detail: binding && binding.spaceId ? 'no-display' : 'no-space-id' }
  }
  const currentId = currentByDisplay && currentByDisplay.get(String(binding.displayUuid))
  if (currentId && currentId === binding.spaceId.toString()) {
    return { switched: false, detail: 'current' }
  }
  const display = api.CFStringCreateWithCString(null, String(binding.displayUuid), MACOS_CF_STRING_ENCODING_UTF8)
  if (!display) return { switched: false, detail: 'no-display' }
  try {
    api.SLSManagedDisplaySetCurrentSpace(cid, display, binding.spaceId)
    return { switched: true, detail: 'switched' }
  } finally {
    api.CFRelease(display)
  }
}

function trySwitchMacosSpaceByCGSInProcess(nativeRef) {
  try {
    const parts = /^(\d{1,12}):(\d{1,6}):(\d{1,12})$/.exec(String(nativeRef || '').trim())
    if (!parts) return { switched: false, detail: 'bad-ref', bridge: 'in-process' }
    const ordinal = Number(parts[2])
    const cgWindowNumber = Number(parts[3])
    // CG inventory refs are pid:0:cgWindowNumber; AX-fallback refs use a non-zero ordinal and zero window number.
    if (ordinal !== 0 || !Number.isInteger(cgWindowNumber) || cgWindowNumber <= 0) return { switched: false, detail: 'ax-fallback', bridge: 'in-process' }
    const api = loadMacosCgsApi()
    if (!api) return { switched: false, detail: 'no-api', bridge: 'in-process', managedSpaceCount: 0, directBindingCount: 0, reverseBindingCount: 0 }
    const cid = api.SLSMainConnectionID()
    const resolved = macosLookupOrResolveWindowSpaceBinding(api, cid, cgWindowNumber)
    const probe = {
      bridge: 'in-process',
      managedSpaceCount: resolved.managedSpaceCount,
      directBindingCount: resolved.directBindingCount,
      reverseBindingCount: resolved.reverseBindingCount
    }
    if (!resolved.bindings.length) return { ...probe, switched: false, detail: 'empty-spaces', bindingCount: 0, bindingSource: resolved.source, sameSpace: false }
    const currentBindings = resolved.bindings.filter((binding) => resolved.currentByDisplay.get(binding.displayUuid) === binding.spaceId.toString())
    if (currentBindings.length) {
      return { ...probe, switched: false, detail: 'current', binding: currentBindings[0], bindingCount: resolved.bindings.length, bindingSource: resolved.source, sameSpace: true }
    }
    if (resolved.bindings.length !== 1) {
      return { ...probe, switched: false, detail: 'ambiguous-spaces', bindingCount: resolved.bindings.length, bindingSource: resolved.source, sameSpace: false }
    }
    const binding = resolved.bindings[0]
    const switched = macosSwitchToCachedSpace(api, cid, binding, resolved.currentByDisplay)
    return { ...probe, ...switched, binding, bindingCount: 1, bindingSource: resolved.source, sameSpace: false }
  } catch {
    return { switched: false, detail: 'error', bridge: 'in-process', managedSpaceCount: 0, directBindingCount: 0, reverseBindingCount: 0 }
  }
}

async function macosConfirmManagedSpace(binding) {
  if (!binding || !binding.spaceId || !binding.displayUuid) return false
  const api = loadMacosCgsApi()
  if (!api) return false
  const cid = api.SLSMainConnectionID()
  const expected = binding.spaceId.toString()
  const deadline = Date.now() + MACOS_CGS_SPACE_CONFIRM_TIMEOUT_MS
  while (Date.now() <= deadline) {
    try {
      const current = macosLoadDisplayBySpaceMap(api, cid).currentByDisplay.get(String(binding.displayUuid))
      if (current === expected) return true
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, MACOS_CGS_SPACE_CONFIRM_INTERVAL_MS))
  }
  return false
}

/** Refresh-owned full reload of Space bindings for every CG window (all displays / all desktops). */
function macosWarmWindowSpaceCacheFromInventory(windows) {
  if (process.platform !== 'darwin') return
  try {
    macosRemoveLegacySpaceBindingCache()
    const api = loadMacosCgsApi()
    if (!api) return
    macosRebuildWindowSpaceCache(api, api.SLSMainConnectionID(), windows)
  } catch {}
}

function runWindowCommand(command, args, targetWindowTitle = null, debugTrace = false, allowProcessSpaceFallback = false, extraEnvironment = null) {
  return new Promise((resolve) => {
    const options = {
      windowsHide: true,
      timeout: WINDOW_BRIDGE_TIMEOUT_MS,
      maxBuffer: WINDOW_BRIDGE_OUTPUT_LIMIT
    }
    if (targetWindowTitle !== null || debugTrace || allowProcessSpaceFallback || (extraEnvironment && typeof extraEnvironment === 'object')) {
      options.env = {
        ...process.env,
        ...(targetWindowTitle !== null ? { EYPC_WINDOW_TARGET_TITLE: targetWindowTitle } : {}),
        ...(debugTrace ? { EYPC_WINDOW_DEBUG_TRACE: '1' } : {}),
        ...(allowProcessSpaceFallback ? { EYPC_WINDOW_ALLOW_PROCESS_SPACE_FALLBACK: '1' } : {}),
        ...(extraEnvironment && typeof extraEnvironment === 'object' ? extraEnvironment : {})
      }
    }
    execFile(command, args, {
      ...options
    }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout || ''), stderr: String(stderr || ''), error: error ? String(error.message || error) : '' })
    })
  })
}

function parseMacosIsolatedSpaceBridge(output) {
  try {
    const value = JSON.parse(String(output || '').trim() || '{}')
    const detail = String(value && value.detail || '')
    if (!['current', 'remote', 'switch-confirmed', 'switch-timeout', 'ambiguous-spaces', 'empty-spaces', 'bad-ref', 'title-mismatch', 'error'].includes(detail)) return null
    const source = String(value && value.bindingSource || '')
    const bindingSource = ['isolated-direct', 'isolated-reverse', 'isolated-direct+reverse', 'none'].includes(source) ? source : 'none'
    const bindings = Array.isArray(value && value.bindings) ? value.bindings.slice(0, 16).flatMap((item) => {
      const spaceId = String(item && item.spaceId || '').trim()
      const displayUuid = String(item && item.displayUuid || '').trim()
      if (!/^\d{1,20}$/.test(spaceId) || !displayUuid) return []
      try {
        const parsed = BigInt(spaceId)
        return parsed > 0n ? [{ spaceId: parsed, displayUuid }] : []
      } catch {
        return []
      }
    }) : []
    return {
      bridge: 'isolated-jxa',
      detail,
      switched: value && value.switched === true,
      confirmed: value && value.confirmed === true,
      sameSpace: value && value.sameSpace === true,
      bindingCount: Math.max(0, Math.trunc(Number(value && value.bindingCount || 0))),
      bindingSource,
      bindings: macosDedupeSpaceBindings(bindings),
      managedSpaceCount: Math.max(0, Math.trunc(Number(value && value.managedSpaceCount || 0))),
      directBindingCount: Math.max(0, Math.trunc(Number(value && value.directBindingCount || 0))),
      reverseBindingCount: Math.max(0, Math.trunc(Number(value && value.reverseBindingCount || 0)))
    }
  } catch {
    return null
  }
}

async function runMacosIsolatedSpaceBridge(target, switchRequested) {
  const source = target && typeof target === 'object' ? target : {}
  const nativeRef = String(source.nativeRef || '').trim()
  const parts = /^(\d{1,12}):(\d{1,6}):(\d{1,12})$/.exec(nativeRef)
  if (!parts) return { switched: false, detail: 'bad-ref', bridge: 'isolated-jxa', bindingCount: 0, bindingSource: 'none' }
  const pid = Number(parts[1])
  const ordinal = Number(parts[2])
  const cgWindowNumber = Number(parts[3])
  if (ordinal !== 0 || !Number.isInteger(cgWindowNumber) || cgWindowNumber <= 0) {
    return { switched: false, detail: 'ax-fallback', bridge: 'isolated-jxa', bindingCount: 0, bindingSource: 'none' }
  }
  const title = String(source.title || '').replace(/\u0000/g, '').slice(0, 4096)
  const appId = String(source.appId || source.appName || '').replace(/\u0000/g, '').slice(0, 512)
  const script = macosIsolatedSpaceBridgeScript(pid, cgWindowNumber, switchRequested === true)
  const result = await runWindowCommand(
    '/usr/bin/osascript',
    ['-l', 'JavaScript', '-e', script],
    title,
    false,
    false,
    { EYPC_WINDOW_TARGET_APP_ID: appId }
  )
  if (!result.ok) {
    return { switched: false, detail: 'error', bridge: 'isolated-jxa', bindingCount: 0, bindingSource: 'none', managedSpaceCount: 0, directBindingCount: 0, reverseBindingCount: 0 }
  }
  const parsed = parseMacosIsolatedSpaceBridge(result.stdout)
  if (parsed && parsed.bindings.length) macosCacheSpaceBindings(macosWindowSpaceCache, cgWindowNumber, parsed.bindings)
  return parsed
    || { switched: false, detail: 'error', bridge: 'isolated-jxa', bindingCount: 0, bindingSource: 'none', managedSpaceCount: 0, directBindingCount: 0, reverseBindingCount: 0 }
}

async function trySwitchMacosSpace(target) {
  const nativeRef = String(target && target.nativeRef || '').trim()
  const inProcess = trySwitchMacosSpaceByCGSInProcess(nativeRef)
  if (!['empty-spaces', 'no-api', 'no-space-id', 'no-display', 'error'].includes(inProcess.detail)) return inProcess
  return runMacosIsolatedSpaceBridge(target, true)
}

function unavailableWindowEnvironment(platform = 'unsupported') {
  return {
    platform,
    bridgeRevision: WINDOW_BRIDGE_REVISION,
    identityAvailable: false,
    appMatches: false,
    cgTargetMatches: 0,
    cgWindowIdMatches: 0,
    ownerCgWindowCount: 0,
    axTargetMatches: 0,
    axWindowCount: 0,
    spaceBinding: 'unavailable',
    spaceBindingCount: 0,
    spaceBindingSource: 'unavailable',
    spaceBridge: 'unavailable',
    managedSpaceCount: 0,
    directSpaceBindingCount: 0,
    reverseSpaceBindingCount: 0,
    sameSpace: null
  }
}

function macosWindowIdentityCacheKey(target) {
  const source = target && typeof target === 'object' ? target : {}
  const nativeRef = String(source.nativeRef || '').trim()
  const appId = String(source.appId || source.appName || '').trim().toLowerCase()
  const title = String(source.title || '').trim().replace(/\s+/g, ' ').toLowerCase()
  return nativeRef && appId && title ? `${nativeRef}\u0000${appId}\u0000${title}` : ''
}

function invalidateMacosWindowIdentity(target) {
  const key = macosWindowIdentityCacheKey(target)
  if (key) macosWindowIdentityCache.delete(key)
}

async function readMacosWindowIdentity(target) {
  const source = target && typeof target === 'object' ? target : {}
  const cacheKey = macosWindowIdentityCacheKey(source)
  const cached = cacheKey ? macosWindowIdentityCache.get(cacheKey) : null
  if (cached && Date.now() - cached.checkedAt <= MACOS_WINDOW_IDENTITY_CACHE_TTL_MS) {
    return { ...cached.snapshot }
  }
  if (cached) macosWindowIdentityCache.delete(cacheKey)
  const nativeRef = String(source.nativeRef || '').trim()
  const parts = /^(\d{1,12}):(\d{1,6}):(\d{1,12})$/.exec(nativeRef)
  if (!parts) return unavailableWindowEnvironment('darwin')
  const pid = Number(parts[1])
  const cgWindowNumber = Number(parts[3])
  const title = String(source.title || '').slice(0, 4096)
  const appId = String(source.appId || source.appName || '').slice(0, 512)
  const script = MACOS_ENV_SNAPSHOT_SCRIPT
    .replace('__EYPC_TARGET_PID__', String(pid))
    .replace('__EYPC_CG_WINDOW_NUMBER__', String(cgWindowNumber))
  const result = await runWindowCommand(
    '/usr/bin/osascript',
    ['-l', 'JavaScript', '-e', script],
    title,
    false,
    false,
    { EYPC_WINDOW_TARGET_APP_ID: appId }
  )
  const snapshot = unavailableWindowEnvironment('darwin')
  if (result.ok) {
    try {
      const parsed = JSON.parse(String(result.stdout || '').trim() || '{}')
      snapshot.identityAvailable = true
      snapshot.appMatches = parsed.appMatches === true
      snapshot.cgTargetMatches = Math.max(0, Math.trunc(Number(parsed.cgTargetMatches || 0)))
      snapshot.cgWindowIdMatches = Math.max(0, Math.trunc(Number(parsed.cgWindowIdMatches || 0)))
      snapshot.ownerCgWindowCount = Math.max(0, Math.trunc(Number(parsed.ownerCgWindowCount || 0)))
      snapshot.axTargetMatches = Math.max(0, Math.trunc(Number(parsed.axTargetMatches || 0)))
      snapshot.axWindowCount = Math.max(0, Math.trunc(Number(parsed.axWindowCount || 0)))
      if (cacheKey) macosWindowIdentityCache.set(cacheKey, { checkedAt: Date.now(), snapshot: { ...snapshot } })
    } catch {}
  }
  return snapshot
}

async function inspectWindowEnvironment(target) {
  if (process.platform !== 'darwin') return unavailableWindowEnvironment('unsupported')
  const source = target && typeof target === 'object' ? target : {}
  const snapshot = await readMacosWindowIdentity(source)
  const nativeRef = String(source.nativeRef || '').trim()
  const parts = /^(\d{1,12}):(\d{1,6}):(\d{1,12})$/.exec(nativeRef)
  if (!parts) return snapshot
  const ordinal = Number(parts[2])
  const cgWindowNumber = Number(parts[3])
  if (ordinal !== 0 || !Number.isInteger(cgWindowNumber) || cgWindowNumber <= 0) return snapshot
  let probe = null
  try {
    const api = loadMacosCgsApi()
    if (api) {
      const cid = api.SLSMainConnectionID()
      const resolved = macosLookupOrResolveWindowSpaceBinding(api, cid, cgWindowNumber)
      probe = {
        bridge: 'in-process',
        bindingCount: resolved.bindings.length,
        bindingSource: resolved.source,
        sameSpace: resolved.bindings.length
          ? resolved.bindings.some((binding) => resolved.currentByDisplay.get(binding.displayUuid) === binding.spaceId.toString())
          : false,
        managedSpaceCount: resolved.managedSpaceCount,
        directBindingCount: resolved.directBindingCount,
        reverseBindingCount: resolved.reverseBindingCount
      }
    }
  } catch {}
  if (!probe || !probe.bindingCount) probe = await runMacosIsolatedSpaceBridge(source, false)
  snapshot.spaceBinding = probe.bindingCount ? 'bound' : 'unbound'
  snapshot.spaceBindingCount = probe.bindingCount
  snapshot.spaceBindingSource = probe.bindingSource
  snapshot.spaceBridge = probe.bridge
  snapshot.managedSpaceCount = probe.managedSpaceCount
  snapshot.directSpaceBindingCount = probe.directBindingCount
  snapshot.reverseSpaceBindingCount = probe.reverseBindingCount
  snapshot.sameSpace = probe.bindingCount ? probe.sameSpace === true : false
  return snapshot
}

function windowCapability(permission = 'unknown', reason = '', extras = {}) {
  if (process.platform === 'win32') {
    return { platform: 'win32', bridgeRevision: WINDOW_BRIDGE_REVISION, supported: true, permission: 'granted', canList: true, canActivate: true, canClose: true, canAlwaysOnTop: true, ...(reason ? { reason } : {}), ...extras }
  }
  if (process.platform === 'darwin') {
    return { platform: 'darwin', bridgeRevision: WINDOW_BRIDGE_REVISION, supported: true, permission, canList: permission !== 'required', canActivate: permission !== 'required', canClose: permission !== 'required', canAlwaysOnTop: false, ...(reason ? { reason } : {}), ...extras }
  }
  return { platform: 'unsupported', bridgeRevision: WINDOW_BRIDGE_REVISION, supported: false, permission: 'unsupported', canList: false, canActivate: false, canClose: false, canAlwaysOnTop: false, reason: reason || '当前系统不支持窗口跳转', ...extras }
}

function isMacWindowPermissionError(value) {
  return /not authorized|not permitted|accessibility|assistive access|automation|screen recording|-1743/i.test(String(value || ''))
}

function parseWindowJson(output, platform) {
  let parsed
  try { parsed = JSON.parse(String(output || '').trim() || '[]') } catch { return { windows: [], screenRecordingLikelyMissing: false } }
  const envelope = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.windows)
    ? parsed
    : { windows: Array.isArray(parsed) ? parsed : [parsed], screenRecordingLikelyMissing: false }
  const rows = Array.isArray(envelope.windows) ? envelope.windows : []
  const seen = new Set()
  const windows = rows.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const nativeRef = String(item.nativeRef || '').trim()
    const pid = Math.trunc(Number(item.pid))
    const appId = String(item.appId || item.appName || '').trim()
    const appName = String(item.appName || appId || '').trim()
    const title = String(item.title || '').trim()
    const id = `${platform}:${nativeRef}`
    if (!nativeRef || !Number.isInteger(pid) || pid <= 0 || !appId || !title || seen.has(id)) return []
    seen.add(id)
    return [{ id, platform, nativeRef, appId, appName, pid, title, minimized: item.minimized === true, focused: item.focused === true }]
  })
  return { windows, screenRecordingLikelyMissing: envelope.screenRecordingLikelyMissing === true }
}

async function windowCapabilities() {
  if (process.platform === 'darwin') macosRemoveLegacySpaceBindingCache()
  return windowCapability()
}

async function listWindows() {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    const windowScript = WINDOWS_ENUM_SCRIPT
      .replace('__EYPC_HOST_PID__', String(process.pid))
      .replace('__EYPC_PARENT_PID__', String(process.ppid || 0))
    const result = await runWindowCommand(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', windowScript])
    if (!result.ok) return { capability: windowCapability('unknown', '无法读取 Windows 桌面窗口'), windows: [], completeness: 'partial', message: '无法读取 Windows 桌面窗口' }
    const parsed = parseWindowJson(result.stdout, 'win32')
    return { capability: windowCapability('granted'), windows: parsed.windows, completeness: 'complete' }
  }
  if (process.platform === 'darwin') {
    const cgScript = MACOS_WINDOW_LIST_SCRIPT
      .replace('__EYPC_HOST_PID__', String(process.pid))
      .replace('__EYPC_PARENT_PID__', String(process.ppid || 0))
    const cgResult = await runWindowCommand('/usr/bin/osascript', ['-l', 'JavaScript', '-e', cgScript])
    let cgParsed = { windows: [], screenRecordingLikelyMissing: false }
    let preferAx = false
    if (!cgResult.ok) {
      // Never treat CG failure as a final empty granted list; try AX current-Space inventory.
      preferAx = true
    } else {
      cgParsed = parseWindowJson(cgResult.stdout, 'darwin')
      if (cgParsed.windows.length > 0) {
        macosWarmWindowSpaceCacheFromInventory(cgParsed.windows)
        return {
          capability: windowCapability('granted', cgParsed.screenRecordingLikelyMissing ? '部分窗口标题可能因屏幕录制权限受限' : ''),
          windows: cgParsed.windows,
          completeness: cgParsed.screenRecordingLikelyMissing ? 'partial' : 'complete',
          ...(cgParsed.screenRecordingLikelyMissing ? { message: '部分窗口缺少标题；请确认屏幕录制权限以覆盖全部 Space' } : {})
        }
      }
      // Empty CG result (unwrap failure, no titles, or screen-recording gap) must fall back to AX.
      preferAx = true
    }
    if (preferAx) {
      const axScript = MACOS_AX_WINDOW_LIST_SCRIPT
        .replace('__EYPC_HOST_PID__', String(process.pid))
        .replace('__EYPC_PARENT_PID__', String(process.ppid || 0))
      const axResult = await runWindowCommand('/usr/bin/osascript', ['-l', 'JavaScript', '-e', axScript])
      if (!axResult.ok) {
        const detail = `${axResult.error}\n${axResult.stderr}\n${cgResult.error}\n${cgResult.stderr}`
        if (isMacWindowPermissionError(detail) || cgParsed.screenRecordingLikelyMissing) {
          const needsScreen = cgParsed.screenRecordingLikelyMissing || /screen recording/i.test(detail)
          return {
            capability: windowCapability('required', needsScreen
              ? '需要屏幕录制权限以枚举全部 Space / 显示器；当前桌面列表也需要辅助功能'
              : '需要辅助功能或自动化权限'),
            windows: [],
            completeness: 'partial',
            message: needsScreen
              ? '需要在系统设置中允许 EyPc 的屏幕录制与辅助功能权限'
              : '需要在系统设置中允许 EyPc 控制 System Events 以读取当前桌面窗口'
          }
        }
        return { capability: windowCapability('unknown', '无法读取 macOS 窗口'), windows: [], completeness: 'partial', message: '无法读取 macOS 窗口；请确认屏幕录制与辅助功能授权' }
      }
      const axParsed = parseWindowJson(axResult.stdout, 'darwin')
      if (axParsed.windows.length > 0) {
        return {
          capability: windowCapability('granted', '当前为辅助功能列表（当前 Space）；授权屏幕录制可覆盖全部桌面'),
          windows: axParsed.windows,
          completeness: 'partial',
          message: '已回退到当前桌面窗口列表；授权屏幕录制后可列出其他 Space / 显示器'
        }
      }
      if (cgParsed.screenRecordingLikelyMissing) {
        return {
          capability: windowCapability('required', '需要屏幕录制权限以枚举全部 Space / 显示器'),
          windows: [],
          completeness: 'partial',
          message: '需要在系统设置中允许 EyPc 的屏幕录制权限，才能列出全部桌面与显示器上的窗口'
        }
      }
      return { capability: windowCapability('granted'), windows: [], completeness: cgResult.ok ? 'complete' : 'partial' }
    }
  }
  return { capability: windowCapability('unsupported'), windows: [], completeness: 'partial', message: '当前系统不支持窗口跳转' }
}

const WINDOW_OPERATION_TRACE_STAGES = new Set(['bridge', 'space', 'target', 'process', 'restore', 'foreground', 'raise', 'verify', 'topmost'])
const WINDOW_OPERATION_TRACE_OUTCOMES = new Set(['ok', 'skipped', 'not-found', 'ambiguous', 'failed', 'denied', 'unsupported', 'unavailable'])
const WINDOW_OPERATION_TRACE_DETAILS = new Set([
  'switched', 'switch-confirmed', 'switch-timeout', 'current', 'walked', 'direct-unique', 'direct-multiple', 'reverse-unique', 'session-cache',
  'ambiguous-spaces', 'ax-fallback', 'bad-ref', 'no-api', 'empty-spaces', 'no-space-id', 'no-display',
  'process-frontmost', 'single-window-frontmost', 'multiwindow-blocked', 'current-space-inferred', 'cg-ordinal-fallback', 'title-match', 'title-mismatch', 'focus-state-mismatch', 'error',
  'isolated-space-bridge', 'ax-cg-id-match', 'ax-focused-window'
])
const WINDOW_ACTIVATION_REASON_CODES = new Set([
  'space-unbound', 'space-unbound-multiwindow', 'space-ambiguous', 'space-switch-timeout', 'target-title-changed'
])

function debugTraceRequested(options) {
  return Boolean(options && typeof options === 'object' && options.debugTrace === true)
}

function optionalWindowOperationTrace(debugTrace, steps) {
  return debugTrace ? { trace: { steps } } : {}
}

function macosSpaceTraceStep(spaceAttempt) {
  const detail = WINDOW_OPERATION_TRACE_DETAILS.has(spaceAttempt.detail) ? spaceAttempt.detail : 'error'
  const outcome = detail === 'switched' || detail === 'switch-confirmed'
    ? 'ok'
    : (detail === 'bad-ref' || detail === 'ax-fallback' || detail === 'current' || detail === 'current-space-inferred' ? 'skipped' : detail === 'ambiguous-spaces' ? 'ambiguous' : 'failed')
  return { stage: 'space', outcome, detail }
}

function macosBindingTraceStep(spaceAttempt) {
  const count = Math.max(0, Math.trunc(Number(spaceAttempt && spaceAttempt.bindingCount || 0)))
  const source = String(spaceAttempt && spaceAttempt.bindingSource || '')
  if (!count) return null
  const detail = count > 1
    ? 'direct-multiple'
    : source === 'session-cache'
      ? 'session-cache'
    : source.includes('direct')
      ? 'direct-unique'
      : 'reverse-unique'
  return { stage: 'space', outcome: count > 1 ? 'ambiguous' : 'ok', detail }
}

function macosSpaceBridgeTraceStep(spaceAttempt) {
  return spaceAttempt && spaceAttempt.bridge === 'isolated-jxa'
    ? { stage: 'bridge', outcome: 'ok', detail: 'isolated-space-bridge' }
    : null
}

function mergeDebugTraceSteps(prefixSteps, result) {
  const existing = result && result.trace && Array.isArray(result.trace.steps) ? result.trace.steps : []
  const steps = [...prefixSteps, ...existing].slice(0, 16)
  return { ...result, ...(steps.length ? { trace: { steps } } : {}) }
}

function parseWindowOperationTrace(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.trace)) return undefined
  const steps = []
  for (const step of value.trace.slice(0, 16)) {
    const stage = step && typeof step === 'object' ? String(step.stage || '') : ''
    const outcome = step && typeof step === 'object' ? String(step.outcome || '') : ''
    const detail = step && typeof step === 'object' ? String(step.detail || '') : ''
    if (!WINDOW_OPERATION_TRACE_STAGES.has(stage) || !WINDOW_OPERATION_TRACE_OUTCOMES.has(outcome)) continue
    steps.push(WINDOW_OPERATION_TRACE_DETAILS.has(detail) ? { stage, outcome, detail } : { stage, outcome })
  }
  return steps.length ? { steps } : undefined
}

function parseWindowActivationResult(output, fallback = 'failed') {
  try {
    const value = JSON.parse(String(output || '').trim() || '{}')
    const outcome = String(value && value.outcome || '')
    if (['activated', 'not-found', 'ambiguous', 'focus-denied', 'permission-required', 'unsupported', 'failed'].includes(outcome)) {
      const trace = parseWindowOperationTrace(value)
      const reasonCode = String(value && value.reasonCode || '')
      return { outcome, ...(WINDOW_ACTIVATION_REASON_CODES.has(reasonCode) ? { reasonCode } : {}), ...(trace ? { trace } : {}) }
    }
  } catch {}
  return { outcome: fallback }
}

async function activateWindow(target, options = {}) {
  const debugTrace = debugTraceRequested(options)
  const source = target && typeof target === 'object' ? target : {}
  const platform = source.platform === 'win32' || source.platform === 'darwin' ? source.platform : ''
  const nativeRef = String(source.nativeRef || '').trim()
  if (!platform || !nativeRef || platform !== process.platform) {
    return { outcome: 'not-found', message: '窗口引用已失效或不属于当前系统', ...optionalWindowOperationTrace(debugTrace, [{ stage: 'target', outcome: 'not-found' }]) }
  }
  if (platform === 'win32') {
    if (!/^\d{1,20}$/.test(nativeRef)) {
      return { outcome: 'not-found', message: '窗口句柄无效', ...optionalWindowOperationTrace(debugTrace, [{ stage: 'target', outcome: 'not-found' }]) }
    }
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    const script = WINDOWS_ACTIVATE_SCRIPT.replace('__EYPC_WINDOW_HANDLE__', nativeRef)
    const result = await runWindowCommand(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], null, debugTrace)
    if (!result.ok) return { outcome: 'failed', message: 'Windows 无法执行窗口激活', ...optionalWindowOperationTrace(debugTrace, [{ stage: 'bridge', outcome: 'failed' }]) }
    const activation = parseWindowActivationResult(result.stdout)
    return activation.outcome === 'focus-denied'
      ? { ...activation, message: '系统拒绝聚焦该窗口；EyPc 未尝试绕过前台保护' }
      : activation
  }
  const parts = /^(\d{1,12}):(\d{1,6}):(\d{1,12})$/.exec(nativeRef)
  if (!parts) return { outcome: 'not-found', message: 'macOS 窗口引用已失效', ...optionalWindowOperationTrace(debugTrace, [{ stage: 'target', outcome: 'not-found' }]) }
  const title = String(source.title || '').replace(/\u0000/g, '').slice(0, 4096)
  const appId = String(source.appId || source.appName || '').replace(/\u0000/g, '').slice(0, 512)
  const pid = Number(parts[1])
  const ordinal = Number(parts[2])
  const cgWindowNumber = Number(parts[3])
  let identity = unavailableWindowEnvironment('darwin')
  let spaceAttempt = ordinal === 0 && cgWindowNumber > 0 ? trySwitchMacosSpaceFromSessionCache(nativeRef) : null
  const sessionCacheFastPath = Boolean(spaceAttempt)
  if (!spaceAttempt) {
    identity = await readMacosWindowIdentity(source)
    if (ordinal === 0 && cgWindowNumber > 0 && !identity.identityAvailable) {
      return {
        outcome: 'failed',
        message: '无法重新验证 macOS 窗口身份',
        ...optionalWindowOperationTrace(debugTrace, [{ stage: 'bridge', outcome: 'failed' }])
      }
    }
    if (ordinal === 0 && cgWindowNumber > 0) {
      if (identity.cgWindowIdMatches !== 1) {
        invalidateMacosWindowIdentity(source)
        return {
          outcome: 'not-found',
          message: 'macOS 窗口引用已失效',
          ...optionalWindowOperationTrace(debugTrace, [{ stage: 'target', outcome: 'not-found' }])
        }
      }
      if (!identity.appMatches || identity.cgTargetMatches !== 1) {
        invalidateMacosWindowIdentity(source)
        return {
          outcome: 'not-found',
          reasonCode: 'target-title-changed',
          message: '目标窗口标题或所属应用已变化，需要重新确认',
          ...optionalWindowOperationTrace(debugTrace, [{ stage: 'target', outcome: 'not-found', detail: 'title-mismatch' }])
        }
      }
    }
    spaceAttempt = await trySwitchMacosSpace(source)
  }

  const bridgeStep = debugTrace ? macosSpaceBridgeTraceStep(spaceAttempt) : null
  const bindingStep = debugTrace ? macosBindingTraceStep(spaceAttempt) : null
  const spacePrefix = debugTrace
    ? [...(bridgeStep ? [bridgeStep] : []), ...(bindingStep ? [bindingStep] : []), macosSpaceTraceStep(spaceAttempt)]
    : []
  if (spaceAttempt.detail === 'bad-ref' || spaceAttempt.detail === 'title-mismatch') {
    const failure = {
      outcome: 'not-found',
      ...(spaceAttempt.detail === 'title-mismatch' ? { reasonCode: 'target-title-changed' } : {}),
      message: spaceAttempt.detail === 'title-mismatch' ? '目标窗口标题或所属应用已变化，需要重新确认' : 'macOS 窗口引用已失效'
    }
    return debugTrace ? mergeDebugTraceSteps(spacePrefix, failure) : failure
  }
  if (spaceAttempt.detail === 'ambiguous-spaces') {
    const failure = { outcome: 'ambiguous', reasonCode: 'space-ambiguous', message: '目标窗口同时绑定到多个非当前桌面，EyPc 未任意选择' }
    return debugTrace ? mergeDebugTraceSteps(spacePrefix, failure) : failure
  }
  if (spaceAttempt.detail === 'switch-timeout') {
    const failure = { outcome: 'failed', reasonCode: 'space-switch-timeout', message: '目标桌面切换未在时限内确认' }
    return debugTrace ? mergeDebugTraceSteps(spacePrefix, failure) : failure
  }
  if (spaceAttempt.switched && !spaceAttempt.confirmed) {
    const confirmed = await macosConfirmManagedSpace(spaceAttempt.binding)
    if (!confirmed) {
      const failedAttempt = { ...spaceAttempt, detail: 'switch-timeout' }
      const failedPrefix = debugTrace
        ? [...(bridgeStep ? [bridgeStep] : []), ...(bindingStep ? [bindingStep] : []), macosSpaceTraceStep(failedAttempt)]
        : []
      const failure = { outcome: 'failed', reasonCode: 'space-switch-timeout', message: '目标桌面切换未在时限内确认' }
      return debugTrace ? mergeDebugTraceSteps(failedPrefix, failure) : failure
    }
    spaceAttempt.detail = 'switch-confirmed'
  }
  if (spaceAttempt.switched) await new Promise((resolve) => setTimeout(resolve, MACOS_CGS_SPACE_SETTLE_MS))

  const spaceUnavailable = ['empty-spaces', 'no-api', 'no-space-id', 'no-display', 'error'].includes(spaceAttempt.detail)
  const allowSingleWindowFallback = spaceUnavailable && identity.identityAvailable && identity.ownerCgWindowCount === 1
  const allowCurrentSpaceInferred = spaceUnavailable && identity.identityAvailable && identity.ownerCgWindowCount > 1
    && identity.axWindowCount > 0 && identity.axWindowCount === identity.ownerCgWindowCount
  if (spaceUnavailable && !allowSingleWindowFallback && !allowCurrentSpaceInferred) {
    const multiple = identity.identityAvailable && identity.ownerCgWindowCount > 1
    const reasonCode = multiple ? 'space-unbound-multiwindow' : 'space-unbound'
    const detail = multiple ? 'multiwindow-blocked' : spaceAttempt.detail
    const failurePrefix = debugTrace
      ? [...(bridgeStep ? [bridgeStep] : []), ...(bindingStep ? [bindingStep] : []), { stage: 'space', outcome: 'failed', detail }]
      : []
    const failure = {
      outcome: 'not-found',
      reasonCode,
      message: multiple ? '无法唯一绑定目标桌面；多窗口进程未执行任意前置' : '无法绑定目标窗口所在桌面'
    }
    return debugTrace ? mergeDebugTraceSteps(failurePrefix, failure) : failure
  }
  if (allowCurrentSpaceInferred) {
    spaceAttempt.detail = 'current-space-inferred'
  }

  const finalSpacePrefix = debugTrace
    ? [...(bridgeStep ? [bridgeStep] : []), ...(bindingStep ? [bindingStep] : []), macosSpaceTraceStep(spaceAttempt)]
    : []
  const result = await runWindowCommand(
    '/usr/bin/osascript',
    ['-l', 'JavaScript', '-e', macosActivateWindowScript(pid, ordinal, cgWindowNumber)],
    title,
    debugTrace,
    allowSingleWindowFallback,
    {
      EYPC_WINDOW_TARGET_APP_ID: appId,
      ...(sessionCacheFastPath ? { EYPC_WINDOW_REQUIRE_EXACT_AX: '1' } : {})
    }
  )
  if (!result.ok) {
    const detail = `${result.error}\n${result.stderr}`
    const failure = isMacWindowPermissionError(detail)
      ? { outcome: 'permission-required', message: '需要在系统设置中允许 EyPc 控制 System Events', ...optionalWindowOperationTrace(debugTrace, [{ stage: 'bridge', outcome: 'denied' }]) }
      : { outcome: 'failed', message: 'macOS 无法激活该窗口', ...optionalWindowOperationTrace(debugTrace, [{ stage: 'bridge', outcome: 'failed' }]) }
    return debugTrace ? mergeDebugTraceSteps(finalSpacePrefix, failure) : failure
  }
  const activation = parseWindowActivationResult(result.stdout)
  if (activation.outcome === 'not-found') {
    invalidateMacosWindowIdentity(source)
    if (cgWindowNumber > 0) macosWindowSpaceCache.delete(cgWindowNumber >>> 0)
  }
  const classified = activation.outcome === 'not-found' && allowSingleWindowFallback && !activation.reasonCode
    ? { ...activation, reasonCode: 'space-unbound' }
    : activation
  return debugTrace ? mergeDebugTraceSteps(finalSpacePrefix, classified) : classified
}

async function alwaysOnTopWindow(target, options = {}) {
  const debugTrace = debugTraceRequested(options)
  const source = target && typeof target === 'object' ? target : {}
  const platform = source.platform === 'win32' || source.platform === 'darwin' ? source.platform : ''
  const nativeRef = String(source.nativeRef || '').trim()
  if (!platform || !nativeRef || platform !== process.platform) {
    return { outcome: 'not-found', message: '窗口引用已失效或不属于当前系统', ...optionalWindowOperationTrace(debugTrace, [{ stage: 'target', outcome: 'not-found' }]) }
  }
  if (platform !== 'win32') {
    return { outcome: 'unsupported', message: 'macOS 只能展开并前置第三方窗口，不能将其保持在最上层', ...optionalWindowOperationTrace(debugTrace, [{ stage: 'topmost', outcome: 'unsupported' }]) }
  }
  if (!/^\d{1,20}$/.test(nativeRef)) {
    return { outcome: 'not-found', message: '窗口句柄无效', ...optionalWindowOperationTrace(debugTrace, [{ stage: 'target', outcome: 'not-found' }]) }
  }
  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  const script = WINDOWS_TOPMOST_SCRIPT.replace('__EYPC_WINDOW_HANDLE__', nativeRef)
  const result = await runWindowCommand(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], null, debugTrace)
  if (!result.ok) return { outcome: 'failed', message: 'Windows 无法执行页面置顶', ...optionalWindowOperationTrace(debugTrace, [{ stage: 'bridge', outcome: 'failed' }]) }
  const activation = parseWindowActivationResult(result.stdout)
  return activation.outcome === 'focus-denied'
    ? { ...activation, message: '系统拒绝聚焦该窗口；EyPc 未尝试绕过前台保护' }
    : activation
}

function parseWindowLifecycleResult(output, fallback = 'failed') {
  try {
    const value = JSON.parse(String(output || '').trim() || '{}')
    const outcome = String(value && value.outcome || '')
    if (['closed', 'terminated', 'close-denied', 'not-found', 'ambiguous', 'permission-required', 'unsupported', 'failed'].includes(outcome)) {
      return { outcome, ...(typeof value.message === 'string' && value.message ? { message: value.message } : {}) }
    }
  } catch {}
  return { outcome: fallback }
}

async function closeWindow(target) {
  const source = target && typeof target === 'object' ? target : {}
  const platform = source.platform === 'win32' || source.platform === 'darwin' ? source.platform : ''
  const nativeRef = String(source.nativeRef || '').trim()
  if (!platform || !nativeRef || platform !== process.platform) return { outcome: 'not-found', message: '窗口引用已失效或不属于当前系统' }
  if (platform === 'win32') {
    if (!/^\d{1,20}$/.test(nativeRef)) return { outcome: 'not-found', message: '窗口句柄无效' }
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    const script = WINDOWS_CLOSE_SCRIPT.replace('__EYPC_WINDOW_HANDLE__', nativeRef)
    const result = await runWindowCommand(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script])
    if (!result.ok) return { outcome: 'failed', message: 'Windows 无法关闭该窗口' }
    return parseWindowLifecycleResult(result.stdout)
  }
  const parts = /^(\d{1,12}):(\d{1,6}):(\d{1,12})$/.exec(nativeRef)
  if (!parts) return { outcome: 'not-found', message: 'macOS 窗口引用已失效' }
  const title = String(source.title || '').replace(/\u0000/g, '').slice(0, 4096)
  const result = await runWindowCommand('/usr/bin/osascript', ['-l', 'JavaScript', '-e', macosCloseWindowScript(Number(parts[1]), Number(parts[2]))], title)
  if (!result.ok) {
    const detail = `${result.error}\n${result.stderr}`
    return isMacWindowPermissionError(detail)
      ? { outcome: 'permission-required', message: '需要在系统设置中允许 EyPc 控制 System Events' }
      : { outcome: 'failed', message: 'macOS 无法关闭该窗口' }
  }
  return parseWindowLifecycleResult(result.stdout)
}

async function terminateWindow(target) {
  const source = target && typeof target === 'object' ? target : {}
  const platform = source.platform === 'win32' || source.platform === 'darwin' ? source.platform : ''
  const pid = Math.trunc(Number(source.pid))
  if (!platform || platform !== process.platform || !Number.isInteger(pid) || pid <= 0) {
    return { outcome: 'not-found', message: '进程引用已失效或不属于当前系统' }
  }
  if (platform === 'win32') {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    const script = WINDOWS_TERMINATE_SCRIPT.replace('__EYPC_WINDOW_PID__', String(pid))
    const result = await runWindowCommand(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script])
    if (!result.ok) return { outcome: 'failed', message: 'Windows 无法强制终止该进程' }
    return parseWindowLifecycleResult(result.stdout, 'failed')
  }
  try {
    process.kill(pid, 'SIGKILL')
    return { outcome: 'terminated' }
  } catch (error) {
    const code = error && typeof error === 'object' ? error.code : ''
    if (code === 'ESRCH') return { outcome: 'not-found', message: '进程已不存在' }
    return { outcome: 'failed', message: 'macOS 无法强制终止该进程' }
  }
}

async function openWindowPermissionSettings() {
  if (process.platform !== 'darwin') return false
  try {
    if (globalThis.utools && typeof globalThis.utools.shellOpenExternal === 'function') {
      globalThis.utools.shellOpenExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
      globalThis.utools.shellOpenExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
      return true
    }
  } catch {}
  return false
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
  try {
    if (!globalThis.utools || !globalThis.utools.dbStorage) return false
    globalThis.utools.dbStorage.setItem(STORAGE_KEY, state)
    return true
  } catch {
    return false
  }
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
    open: Boolean((shell && typeof shell.openPath === 'function') || process.platform === 'darwin' || typeof utools.shellOpenPath === 'function'),
    reveal: Boolean(process.platform === 'darwin' || (shell && typeof shell.showItemInFolder === 'function') || typeof utools.shellShowItemInFolder === 'function'),
    copyPath: typeof utools.copyText === 'function',
    copyItems: typeof utools.copyFile === 'function',
    pickFiles: canPick,
    pickFolders: canPick,
    listDirectory: true,
    inspectPaths: true
  }
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

function codexNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function codexTimestampMs(value) {
  const parsed = codexNumber(value)
  if (parsed <= 0) return 0
  return parsed < 10_000_000_000 ? parsed * 1000 : parsed
}

function codexPercent(value) {
  return Math.max(0, Math.min(100, Math.round(codexNumber(value))))
}

function codexPlatformPath() {
  return process.platform === 'win32' ? path.win32 : path
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

function codexBundledBinary(jsEntry) {
  const platformPath = codexPlatformPath()
  const target = process.platform === 'win32'
    ? process.arch === 'arm64' ? ['codex-win32-arm64', 'aarch64-pc-windows-msvc', 'codex.exe'] : ['codex-win32-x64', 'x86_64-pc-windows-msvc', 'codex.exe']
    : process.platform === 'darwin'
      ? process.arch === 'x64' ? ['codex-darwin-x64', 'x86_64-apple-darwin', 'codex'] : ['codex-darwin-arm64', 'aarch64-apple-darwin', 'codex']
      : null
  if (!target || !jsEntry) return ''
  const packageRoot = platformPath.dirname(platformPath.dirname(jsEntry))
  const packageName = target[0]
  const vendorTail = ['vendor', target[1], 'bin', target[2]]
  const candidates = [
    platformPath.join(packageRoot, 'node_modules', '@openai', packageName, ...vendorTail),
    platformPath.join(platformPath.dirname(packageRoot), packageName, ...vendorTail),
    platformPath.join(packageRoot, ...vendorTail)
  ]
  return candidates.find((candidate) => {
    try { return fs.existsSync(candidate) } catch { return false }
  }) || ''
}

function codexJavascriptEntry(candidate, resolved) {
  const platformPath = codexPlatformPath()
  if (/\.[cm]?js$/i.test(resolved || '')) return resolved
  if (!/\.(?:cmd|bat)$/i.test(candidate || '')) return ''
  const npmEntry = platformPath.join(platformPath.dirname(candidate), 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
  try { return fs.existsSync(npmEntry) ? npmEntry : '' } catch { return '' }
}

function codexNodeRuntime(candidate) {
  const platformPath = codexPlatformPath()
  const env = process.env || {}
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path')
  const pathValue = pathKey && typeof env[pathKey] === 'string' ? env[pathKey] : ''
  const candidates = [platformPath.join(platformPath.dirname(candidate), process.platform === 'win32' ? 'node.exe' : 'node')]
  if (process.platform === 'win32') {
    if (typeof env.NVM_SYMLINK === 'string') candidates.push(platformPath.join(env.NVM_SYMLINK, 'node.exe'))
    if (typeof env.VOLTA_HOME === 'string') candidates.push(platformPath.join(env.VOLTA_HOME, 'bin', 'node.exe'))
    if (typeof env.ProgramFiles === 'string') candidates.push(platformPath.join(env.ProgramFiles, 'nodejs', 'node.exe'))
  }
  for (const directory of pathValue.split(platformPath.delimiter).filter(Boolean)) {
    candidates.push(platformPath.join(directory, process.platform === 'win32' ? 'node.exe' : 'node'))
  }
  return candidates.find((nodePath) => {
    try { return fs.existsSync(nodePath) } catch { return false }
  }) || ''
}

function codexLaunchPlan(candidate, source = 'unknown', detected = false) {
  const platformPath = codexPlatformPath()
  const command = candidate || 'codex'
  const argsPrefix = []
  if (platformPath.isAbsolute(command)) {
    try {
      const resolved = fs.realpathSync(command)
      const jsEntry = codexJavascriptEntry(command, resolved)
      const bundledBinary = codexBundledBinary(jsEntry)
      if (bundledBinary) {
        return { command: bundledBinary, argsPrefix: [], key: bundledBinary, source, detected: true }
      }
      const nodeRuntime = codexNodeRuntime(command)
      if (jsEntry && nodeRuntime) {
        return { command: nodeRuntime, argsPrefix: [jsEntry], key: `${nodeRuntime}\u0000${jsEntry}`, source, detected: true }
      }
      if (jsEntry || /\.(?:cmd|bat)$/i.test(command)) {
        return { command, argsPrefix: [], key: command, source, detected: false, invalid: true }
      }
    } catch {}
  }
  return { command, argsPrefix, key: command, source, detected }
}

function readCodexProbe(command, args, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(guard)
      resolve(value)
    }
    const guard = setTimeout(() => finish(''), timeoutMs + 250)
    try {
      execFile(command, args, {
        encoding: 'utf8',
        maxBuffer: CODEX_PROXY_OUTPUT_LIMIT,
        timeout: timeoutMs,
        windowsHide: true
      }, (error, stdout) => finish(error ? '' : String(stdout || '')))
    } catch {
      finish('')
    }
  })
}

function codexScutilValue(output, key) {
  const prefix = `${key} :`
  const line = String(output || '').split(/\r?\n/).find((candidate) => candidate.trim().startsWith(prefix))
  return line ? line.trim().slice(prefix.length).trim() : ''
}

function codexLoopbackPacUrl(value) {
  const match = String(value || '').trim().match(/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})(\/\S*)?$/i)
  if (!match) return ''
  const port = Number(match[2])
  return port > 0 && port <= 65_535 ? match[0] : ''
}

function codexStaticPacProxy(value) {
  const source = String(value || '').replace(/^\uFEFF/, '').trim()
  if (!source || Buffer.byteLength(source, 'utf8') > CODEX_PROXY_OUTPUT_LIMIT) return ''
  const match = source.match(/^function\s+FindProxyForURL\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*[A-Za-z_$][\w$]*\s*\)\s*\{\s*return\s+(["'])([^"'\\\r\n]*)\1\s*;\s*\}\s*;?$/i)
  if (!match) return ''
  const firstDirective = match[2].split(';').map((item) => item.trim()).filter(Boolean)[0] || ''
  const proxy = firstDirective.match(/^PROXY\s+(127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})$/i)
  if (!proxy) return ''
  const port = Number(proxy[2])
  if (port <= 0 || port > 65_535) return ''
  return `http://${proxy[1].toLowerCase()}:${port}`
}

function codexHasExplicitProxyEnvironment(env) {
  const proxyKeys = new Set(['http_proxy', 'https_proxy', 'all_proxy'])
  return Object.entries(env || {}).some(([key, value]) => proxyKeys.has(key.toLowerCase()) && typeof value === 'string' && value.trim())
}

async function resolveCodexProxyEnvironment() {
  const inherited = process.env || {}
  if (process.platform !== 'darwin' || codexHasExplicitProxyEnvironment(inherited)) return {}
  const systemProxy = await readCodexProbe('/usr/sbin/scutil', ['--proxy'], 1_000)
  if (codexScutilValue(systemProxy, 'ProxyAutoConfigEnable') !== '1') return {}
  const pacUrl = codexLoopbackPacUrl(codexScutilValue(systemProxy, 'ProxyAutoConfigURLString'))
  if (!pacUrl) return {}
  const pac = await readCodexProbe('/usr/bin/curl', [
    '--fail',
    '--silent',
    '--show-error',
    '--noproxy',
    '*',
    '--proto',
    '=http',
    '--connect-timeout',
    '1',
    '--max-time',
    '2',
    pacUrl
  ], 2_500)
  const proxy = codexStaticPacProxy(pac)
  if (!proxy) return {}
  return {
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    http_proxy: proxy,
    https_proxy: proxy
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

function codexDesktopProjectedRequest(value) {
  const source = codexRecord(value)
  return {
    type: typeof source.type === 'string' ? source.type.slice(0, 80) : '',
    method: typeof source.method === 'string' ? source.method.slice(0, 120) : ''
  }
}

function codexDesktopRequestFlag(request) {
  const type = String(request?.type || '').toLowerCase()
  const method = String(request?.method || '').toLowerCase()
  const identifier = `${type}:${method}`.replace(/[^a-z0-9]/g, '')
  if (method === 'item/plan/requestimplementation'
    || identifier.includes('userinput')
    || identifier.includes('optionpicker')
    || identifier.includes('setupcodex')) return 'waitingOnUserInput'
  if (identifier.includes('approval')
    || identifier.includes('elicitation')
    || identifier.includes('permissionrequest')) return 'waitingOnApproval'
  return ''
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

function codexDesktopUnreadObservation(bridge, known, threadId, shadow, persistedUnreadIds) {
  const liveUnread = bridge?.state === 'connected' ? bridge.liveUnread.get(threadId) : null
  const exact = shadow?.unreadEvidence === 'event'
    ? shadow
    : liveUnread?.unreadEvidence === 'event' ? liveUnread : null
  if (exact && typeof exact.hasUnreadTurn === 'boolean') {
    return { hasUnreadTurn: exact.hasUnreadTurn === true, unreadAuthority: 'desktop-live' }
  }
  if (liveUnread?.hasUnreadTurn === true || shadow?.hasUnreadTurn === true) {
    return { hasUnreadTurn: true, unreadAuthority: 'desktop-live' }
  }
  if (persistedUnreadIds instanceof Set) {
    return { hasUnreadTurn: persistedUnreadIds.has(threadId), unreadAuthority: 'desktop-persisted' }
  }
  const fallback = codexDesktopPersistedUnread(known)
  if (fallback.unreadAuthority === 'desktop-persisted') return fallback
  if (typeof liveUnread?.hasUnreadTurn === 'boolean' || typeof shadow?.hasUnreadTurn === 'boolean') {
    return { hasUnreadTurn: false, unreadAuthority: 'desktop-live' }
  }
  return fallback
}

function codexDesktopRuntimeProjection(value) {
  const activity = sanitizeCodexActivityStatus(value)
  return activity ? { type: activity.status, activeFlags: activity.activeFlags } : null
}

function codexDesktopShadowFromSnapshot(change) {
  const state = codexRecord(change.conversationState)
  const revision = Number.isInteger(change.revision) && change.revision >= 0 ? change.revision : -1
  const runtime = codexDesktopRuntimeProjection(state.threadRuntimeStatus)
  const requests = Array.isArray(state.requests) && state.requests.length <= 10_000
    ? state.requests.map(codexDesktopProjectedRequest)
    : null
  if (revision < 0 || !runtime || requests === null) return null
  const shadow = {
    revision,
    activityRevision: revision,
    activityEvidence: 'initial-snapshot',
    runtime,
    sideConversation: state.sideConversation === true,
    parentThreadId: validCodexThreadId(state.forkedFromId)
      ? state.forkedFromId
      : typeof state.sideConversationParentNavigationPath === 'string'
        ? (state.sideConversationParentNavigationPath.match(/^\/local\/([0-9a-f-]{36})$/i)?.[1] || '')
        : '',
    resumeState: typeof state.resumeState === 'string' ? state.resumeState.slice(0, 40) : '',
    hasUnreadTurn: typeof state.hasUnreadTurn === 'boolean' ? state.hasUnreadTurn : undefined,
    unreadEvidence: typeof state.hasUnreadTurn === 'boolean' ? 'snapshot' : '',
    requests
  }
  if (codexDesktopShadowActivity(shadow)?.status === 'active') shadow.desktopActiveSince = Date.now()
  return shadow
}

function codexDesktopShadowActivity(shadow) {
  if (!shadow?.runtime) return null
  const activeFlags = new Set(shadow.runtime.activeFlags || [])
  for (const request of shadow.requests || []) {
    const flag = codexDesktopRequestFlag(request)
    if (flag) activeFlags.add(flag)
  }
  // Desktop keeps unresolved requests in conversationState.requests. A plan
  // implementation request is created only after the Plan turn is complete,
  // so it is authoritative user-waiting evidence even if runtime status has
  // already moved to idle in the same patch batch.
  const status = activeFlags.size > 0
    ? 'active'
    : shadow.suppressUncorroboratedActive === true && shadow.runtime.type === 'active'
      ? 'idle'
      : shadow.runtime.type
  const desktopActiveSince = status === 'active' ? codexTimestampMs(shadow.desktopActiveSince) : 0
  return {
    status,
    activeFlags: status === 'active' ? [...activeFlags] : [],
    ...(desktopActiveSince ? { desktopActiveSince } : {})
  }
}

function codexDesktopPatchIndex(value, length, allowEnd = false) {
  const index = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : -1
  const maximum = allowEnd ? length : length - 1
  return Number.isInteger(index) && index >= 0 && index <= maximum ? index : -1
}

function codexApplyDesktopShadowPatch(shadow, patch) {
  const source = codexRecord(patch)
  const operation = source.op
  const patchPath = Array.isArray(source.path) ? source.path : null
  if (!['add', 'replace', 'remove'].includes(operation) || !patchPath || patchPath.length === 0 || patchPath.length > 64) return false
  const root = patchPath[0]
  // Desktop streams the whole private conversation state. The Companion keeps
  // only the finite runtime/request/read subset; unrelated well-formed patches
  // still advance the stream revision and must not tear down live authority.
  // A malformed patch inside the observed subset remains a resubscribe signal.
  if (!['hasUnreadTurn', 'resumeState', 'threadRuntimeStatus', 'requests'].includes(root)) return true
  if (patchPath.length > 8) return false
  if (root === 'hasUnreadTurn') {
    if (patchPath.length !== 1) return false
    if (operation === 'remove') {
      shadow.hasUnreadTurn = undefined
      shadow.unreadEvidence = ''
    } else if (typeof source.value === 'boolean') {
      shadow.hasUnreadTurn = source.value
      shadow.unreadEvidence = 'event'
    }
    else return false
    return true
  }
  if (root === 'resumeState') {
    if (patchPath.length !== 1) return false
    if (operation === 'remove') shadow.resumeState = ''
    else if (typeof source.value === 'string') shadow.resumeState = source.value.slice(0, 40)
    else return false
    return true
  }
  if (root === 'threadRuntimeStatus') {
    if (patchPath.length === 1) {
      if (operation === 'remove') return false
      const runtime = codexDesktopRuntimeProjection(source.value)
      if (!runtime) return false
      shadow.runtime = runtime
      return true
    }
    if (patchPath[1] === 'type') {
      if (patchPath.length !== 2 || operation === 'remove' || !['active', 'idle', 'notLoaded', 'systemError'].includes(source.value)) return false
      shadow.runtime.type = source.value
      if (source.value !== 'active') shadow.runtime.activeFlags = []
      return true
    }
    if (patchPath[1] !== 'activeFlags') return false
    if (patchPath.length === 2) {
      if (operation === 'remove') shadow.runtime.activeFlags = []
      else if (Array.isArray(source.value)) {
        shadow.runtime.activeFlags = [...new Set(source.value.filter((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput'))]
      } else return false
      return true
    }
    if (patchPath.length !== 3) return false
    const flags = shadow.runtime.activeFlags || []
    const index = codexDesktopPatchIndex(patchPath[2], flags.length, operation === 'add')
    if (index < 0) return false
    if (operation === 'remove') flags.splice(index, 1)
    else if (source.value === 'waitingOnApproval' || source.value === 'waitingOnUserInput') {
      if (operation === 'add') flags.splice(index, 0, source.value)
      else flags[index] = source.value
    } else return false
    shadow.runtime.activeFlags = [...new Set(flags)]
    return true
  }
  if (root !== 'requests') return false
  if (patchPath.length === 1) {
    if (operation === 'remove') shadow.requests = []
    else if (Array.isArray(source.value) && source.value.length <= 10_000) shadow.requests = source.value.map(codexDesktopProjectedRequest)
    else return false
    return true
  }
  const requests = shadow.requests || []
  const index = codexDesktopPatchIndex(patchPath[1], requests.length, operation === 'add')
  if (index < 0) return false
  if (patchPath.length === 2) {
    if (operation === 'remove') requests.splice(index, 1)
    else if (operation === 'add') requests.splice(index, 0, codexDesktopProjectedRequest(source.value))
    else requests[index] = codexDesktopProjectedRequest(source.value)
    shadow.requests = requests
    return true
  }
  if (patchPath.length !== 3 || (patchPath[2] !== 'type' && patchPath[2] !== 'method')) return false
  if (operation === 'remove') requests[index][patchPath[2]] = ''
  else if (typeof source.value === 'string') requests[index][patchPath[2]] = source.value.slice(0, patchPath[2] === 'type' ? 80 : 120)
  else return false
  return true
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
  if (turn.completedAt) known.lastTurnCompletedAt = turn.completedAt
  else delete known.lastTurnCompletedAt
  known.lastTurnEvidence = 'targeted-after-exit'
  known.appServerLiveActive = false
  return true
}

function codexApplyCompletedTurnNotification(bridge, known, threadId, value) {
  if (!bridge || !known || !validCodexThreadId(threadId)) return false
  const turn = sanitizeCodexTurnStatus(value)
  if (turn?.status !== 'completed' || !turn.startedAt) return false
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
    && known.lastTurnStatus !== 'completed'
  const freshCompleted = turn.startedAt > previousStartedAt
    || recoveredTerminalRevision
    || known.lastTurnStatus === 'completed'
      && turn.startedAt === previousStartedAt
      && turn.completedAt > previousCompletedAt
  if (!freshCompleted) return false

  codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
  known.lastTurnStatus = 'completed'
  known.lastTurnStartedAt = turn.startedAt
  if (turn.completedAt) known.lastTurnCompletedAt = turn.completedAt
  else delete known.lastTurnCompletedAt
  known.lastTurnEvidence = 'turn-completed'
  known.appServerLiveActive = false
  bridge.cancelLatestTurnRefresh(threadId)
  // Any false already present when the exact completion arrives belongs to
  // the pre-completion epoch, even when an unresolved request flag is still
  // draining. Clear it through the shared completion publisher; a genuinely
  // later read-state event can immediately reassert explicit false.
  bridge.publishTargetedCompletion(known, threadId, 'turn-completed')
  return true
}

function codexApplyStartedTurnNotification(bridge, known, threadId, value) {
  if (!bridge || !known || !validCodexThreadId(threadId)) return false
  const turn = sanitizeCodexTurnStatus(value)
  if (turn?.status !== 'inProgress' || !turn.startedAt) return false
  const previousStartedAt = codexTimestampMs(known.lastTurnStartedAt)
  const alreadyDesktopActive = known.statusAuthority === 'desktop-live' && known.status === 'active'
  const restoreAppServerActive = () => {
    known.appServerLiveActive = true
    if (alreadyDesktopActive) return
    known.status = 'active'
    known.activeFlags = []
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
    return true
  }
  // App Server notifications are ordered on one stream. A same-second
  // completed/interrupted → started transition is therefore a real restart,
  // not a timestamp regression. Only an actually older startedAt is stale.
  if (turn.startedAt < previousStartedAt) return false

  codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
  known.lastTurnStatus = 'inProgress'
  known.lastTurnStartedAt = turn.startedAt
  delete known.lastTurnCompletedAt
  known.lastTurnEvidence = 'turn-started'
  restoreAppServerActive()
  bridge.cancelLatestTurnRefresh(threadId)
  bridge.cancelCompletionUnreadRefresh(threadId)
  if (!bridge.restoreSuppressedActive(threadId)) emitCodexActivityDelta([known], false)
  return true
}

function codexClearStalePreCompletionLiveUnread(bridge, threadId) {
  if (!bridge || !validCodexThreadId(threadId)) return
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
    this.liveUnread = new Map()
    this.turnRefreshes = new Map()
    this.unreadRefreshes = new Map()
    this.unreadStateWatcher = null
    this.unreadStateWatchTimer = null
    this.lastSocketError = ''
  }

  cancelLatestTurnRefresh(threadId) {
    const refresh = this.turnRefreshes.get(threadId)
    if (!refresh) return
    refresh.cancelled = true
    if (refresh.timer) clearTimeout(refresh.timer)
    this.turnRefreshes.delete(threadId)
  }

  cancelCompletionUnreadRefresh(threadId) {
    const refresh = this.unreadRefreshes.get(threadId)
    if (!refresh) return
    refresh.cancelled = true
    if (refresh.timer) clearTimeout(refresh.timer)
    this.unreadRefreshes.delete(threadId)
  }

  clearLatestTurnRefreshes() {
    for (const threadId of this.turnRefreshes.keys()) this.cancelLatestTurnRefresh(threadId)
    for (const threadId of this.unreadRefreshes.keys()) this.cancelCompletionUnreadRefresh(threadId)
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

  publishTargetedCompletion(known, threadId, evidence = 'targeted-after-exit') {
    known.appServerLiveActive = false
    this.applyFreshCompletionUnread(known, threadId, { clearStaleLiveFalse: true })
    emitCodexActivityDelta([{ ...known, lastTurnEvidence: evidence }], false)
    if (known.hasUnreadTurn !== true) this.scheduleCompletionUnreadRefresh(threadId)
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

  verifyTerminalActiveSnapshot(threadId, shadow) {
    if (!validCodexThreadId(threadId) || !shadow) return
    const parentThreadId = shadow.sideConversation ? shadow.parentThreadId : threadId
    const known = codexActivityInventory.get(parentThreadId)
    const activity = codexDesktopShadowActivity(shadow)
    const terminalTurn = known?.lastTurnStatus === 'completed'
      || known?.lastTurnStatus === 'failed'
      || known?.lastTurnStatus === 'interrupted'
    if (!known || !validCodexThreadId(parentThreadId) || !terminalTurn || !known.lastTurnStartedAt) return
    if (activity?.status !== 'active' || activity.activeFlags.length > 0) return
    this.cancelLatestTurnRefresh(parentThreadId)
    this.scheduleLatestTurnRefresh(parentThreadId, {
      verifyStaleActive: true,
      settleSnapshotTerminal: true,
      snapshotThreadId: threadId,
      snapshotActivityRevision: shadow.activityRevision
    })
  }

  settleTerminalActiveSnapshot(threadId, refresh, known, turn) {
    const shadow = this.shadows.get(refresh.snapshotThreadId) || this.sideShadows.get(refresh.snapshotThreadId)
    if (!shadow || shadow.activityRevision !== refresh.snapshotActivityRevision) return false
    const activity = codexDesktopShadowActivity(shadow)
    if (activity?.status !== 'active' || activity.activeFlags.length > 0) return false
    const parentThreadId = shadow.sideConversation ? shadow.parentThreadId : refresh.snapshotThreadId
    if (parentThreadId !== threadId || codexActivityInventory.get(threadId) !== known) return false

    codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
    known.lastTurnStatus = turn.status
    known.lastTurnStartedAt = turn.startedAt
    if (turn.status === 'completed' && turn.completedAt) known.lastTurnCompletedAt = turn.completedAt
    else delete known.lastTurnCompletedAt
    known.appServerLiveActive = false
    shadow.suppressUncorroboratedActive = true
    delete shadow.desktopActiveSince
    this.emitParentActivity(threadId)
    const settled = codexActivityInventory.get(threadId)
    if (settled?.status !== 'active') {
      if (turn.status === 'completed') {
        // The first idle delta intentionally preserves the exact shadow
        // transition. Always follow it with targeted completion evidence so
        // Controller cannot guard a recovered same-revision completion back
        // to inProgress.
        this.publishTargetedCompletion(settled, threadId, 'snapshot-corroborated')
      } else {
        emitCodexActivityDelta([{ ...settled, lastTurnEvidence: 'targeted-after-exit' }], false)
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
    if (!validCodexThreadId(threadId) || this.turnRefreshes.has(threadId)) return
    const verifyStaleActive = options.verifyStaleActive === true
    const settleSnapshotTerminal = verifyStaleActive && options.settleSnapshotTerminal === true
    const refresh = {
      cancelled: false,
      timer: null,
      attempt: 0,
      verifyStaleActive,
      settleSnapshotTerminal,
      snapshotThreadId: settleSnapshotTerminal && validCodexThreadId(options.snapshotThreadId) ? options.snapshotThreadId : '',
      snapshotActivityRevision: settleSnapshotTerminal && Number.isInteger(options.snapshotActivityRevision) ? options.snapshotActivityRevision : -1,
      deadlineAt: Date.now() + CODEX_DESKTOP_TURN_REFRESH_DEADLINE_MS,
      baselineTurnStatus: codexActivityInventory.get(threadId)?.lastTurnStatus,
      baselineTurnStartedAt: codexTimestampMs(codexActivityInventory.get(threadId)?.lastTurnStartedAt)
    }
    this.turnRefreshes.set(threadId, refresh)

    const finish = (inventoryChanged = false) => {
      if (refresh.timer) clearTimeout(refresh.timer)
      refresh.timer = null
      if (this.turnRefreshes.get(threadId) === refresh) this.turnRefreshes.delete(threadId)
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
      if (known.status === 'active' && !refresh.verifyStaleActive) {
        finish(false)
        return
      }
      if (refresh.verifyStaleActive) {
        if (known.status !== 'active' || waitingLive) {
          finish(false)
          return
        }
      }
      if (!refresh.verifyStaleActive && codexApplyCachedCompletedTurnEvidence(known, threadId)) {
        finish(false)
        this.publishTargetedCompletion(known, threadId)
        return
      }
      const remaining = refresh.deadlineAt - Date.now()
      if (remaining <= 0 || refresh.attempt >= CODEX_DESKTOP_TURN_REFRESH_DELAYS_MS.length) {
        finish(true)
        return
      }
      refresh.attempt += 1
      try {
        const page = await requestCodexRpc('thread/turns/list', {
          threadId,
          limit: 1,
          sortDirection: 'desc',
          itemsView: 'notLoaded'
        }, Math.max(250, Math.min(1_000, remaining)))
        const latestKnown = codexActivityInventory.get(threadId)
        if (refresh.cancelled || latestKnown !== known) {
          finish(false)
          return
        }
        if (!refresh.verifyStaleActive && known.status === 'active') {
          finish(false)
          return
        }
        if (refresh.verifyStaleActive && (known.status !== 'active' || waitingLive)) {
          finish(false)
          return
        }
        const turn = sanitizeCodexTurnStatusPage(page)
        const terminalTurn = turn?.status === 'completed' || turn?.status === 'failed' || turn?.status === 'interrupted'
        const terminalShape = terminalTurn && turn.startedAt > 0 && (turn.status !== 'completed' || turn.completedAt > 0)
        const finalAttempt = refresh.attempt >= CODEX_DESKTOP_TURN_REFRESH_DELAYS_MS.length
        if (refresh.settleSnapshotTerminal
          && terminalShape
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
          && (turn.startedAt > refresh.baselineTurnStartedAt || resumedTerminalRevision)) {
          codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
          known.lastTurnStatus = 'inProgress'
          known.lastTurnStartedAt = turn.startedAt
          delete known.lastTurnCompletedAt
          delete known.lastTurnEvidence
          finish(false)
          emitCodexActivityDelta([known], false)
          return
        }
        const freshTerminalTurn = turn?.startedAt > refresh.baselineTurnStartedAt
          || turn?.startedAt === refresh.baselineTurnStartedAt
            && (refresh.baselineTurnStatus === 'inProgress' || turn.status !== refresh.baselineTurnStatus)
        if (turn?.startedAt && turn.status !== 'inProgress' && freshTerminalTurn) {
          codexThreadTurnStatusCache.set(threadId, { turn: { ...turn } })
          known.lastTurnStatus = turn.status
          known.lastTurnStartedAt = turn.startedAt
          if (turn.status === 'completed' && turn.completedAt) known.lastTurnCompletedAt = turn.completedAt
          else delete known.lastTurnCompletedAt
          known.appServerLiveActive = false
          finish(false)
          if (turn.status === 'completed') this.publishTargetedCompletion(known, threadId)
          else emitCodexActivityDelta([{ ...known, lastTurnEvidence: 'targeted-after-exit' }], false)
          return
        }
      } catch {}

      const nextDelay = CODEX_DESKTOP_TURN_REFRESH_DELAYS_MS[refresh.attempt]
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
      return
    }
    if (message.type !== 'broadcast' || typeof message.method !== 'string') return
    if (Array.isArray(message.targetClientIds) && !message.targetClientIds.includes(this.clientId)) return
    const expectedVersion = CODEX_DESKTOP_IPC_VERSIONS[message.method]
    if (Number.isInteger(expectedVersion) && message.version !== expectedVersion) {
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
        this.follow(params.conversationId, true, targetClientIds)
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
          if (known && activity?.status === 'active' && !waitingLive) {
            this.scheduleLatestTurnRefresh(parentThreadId, { verifyStaleActive: true })
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
              known.status = known.connectorStatus
              known.activeFlags = [...known.connectorActiveFlags]
              known.statusAuthority = 'connector'
              delete known.desktopActiveSince
            }
          }
          this.refreshPersistedUnread(false)
          emitCodexActivityDelta([known], false)
        }
      }
      if (params.hostId === 'local' && params.following === true && ownerClientId && validCodexThreadId(threadId)) {
        this.followAny(threadId, true, [ownerClientId])
      }
      return
    }
    if (message.method === 'thread-stream-state-changed') {
      this.handleStreamState(params, message.sourceClientId)
      return
    }
    if (message.method === 'thread-read-state-changed') {
      this.handleReadState(params, message.sourceClientId)
      return
    }
    if (message.method === 'thread-archived' || message.method === 'thread-unarchived') {
      if (params.hostId === 'local' && validCodexThreadId(params.conversationId)) {
        const archivedKey = message.method === 'thread-archived'
          ? codexArchivedActivityKey(params.conversationId)
          : ''
        const sideShadow = this.sideShadows.get(params.conversationId)
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

  handleStreamState(params, ownerClientId) {
    if (params.hostId !== 'local' || !validCodexThreadId(params.conversationId)) return
    const change = codexRecord(params.change)
    if (change.type === 'snapshot') {
      const shadow = codexDesktopShadowFromSnapshot(change)
      if (!shadow) {
        this.resubscribe(params.conversationId)
        return
      }
      shadow.ownerClientId = ownerClientId
      const previousShadow = this.shadows.get(params.conversationId) || this.sideShadows.get(params.conversationId)
      if (shadow.desktopActiveSince && previousShadow && codexTimestampMs(previousShadow.desktopActiveSince)) {
        shadow.desktopActiveSince = previousShadow.desktopActiveSince
      }
      if (this.inventory.has(params.conversationId)) {
        this.shadows.set(params.conversationId, shadow)
        this.publishShadow(params.conversationId, shadow)
        this.verifyTerminalActiveSnapshot(params.conversationId, shadow)
      } else if (shadow.sideConversation && validCodexThreadId(shadow.parentThreadId)) {
        this.sideShadows.set(params.conversationId, shadow)
        this.publishSideShadow(params.conversationId, shadow)
        this.verifyTerminalActiveSnapshot(params.conversationId, shadow)
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
    if (!shadow
      || shadow.ownerClientId !== ownerClientId
      || !Number.isInteger(change.baseRevision)
      || change.baseRevision !== shadow.revision
      || !Number.isInteger(change.revision)
      || change.revision <= shadow.revision
      || !Array.isArray(change.patches)
      || change.patches.length > 50_000) {
      this.resubscribe(params.conversationId)
      return
    }
    const wasActive = codexDesktopShadowActivity(shadow)?.status === 'active'
    let containsReadStatePatch = false
    let containsActivityPatch = false
    for (const patch of change.patches) {
      const patchSource = codexRecord(patch)
      const patchPath = Array.isArray(patchSource.path) ? patchSource.path : []
      if (patchPath[0] === 'hasUnreadTurn') containsReadStatePatch = true
      if (patchPath[0] === 'threadRuntimeStatus' || patchPath[0] === 'requests') containsActivityPatch = true
      if (!codexApplyDesktopShadowPatch(shadow, patch)) {
        this.resubscribe(params.conversationId)
        return
      }
    }
    shadow.revision = change.revision
    if (containsActivityPatch) {
      shadow.activityRevision = change.revision
      shadow.activityEvidence = 'activity-event'
      delete shadow.suppressUncorroboratedActive
    }
    const isActive = codexDesktopShadowActivity(shadow)?.status === 'active'
    if (containsActivityPatch && isActive && !wasActive) {
      const evidenceThreadId = shadow.sideConversation ? shadow.parentThreadId : params.conversationId
      const known = codexActivityInventory.get(evidenceThreadId)
      if (known) {
        known.lastTurnStatus = 'inProgress'
        delete known.lastTurnCompletedAt
        delete known.lastTurnEvidence
        codexThreadTurnStatusCache.delete(evidenceThreadId)
        this.cancelLatestTurnRefresh(evidenceThreadId)
        this.cancelCompletionUnreadRefresh(evidenceThreadId)
      }
    }
    if (isActive) {
      if (!wasActive || !codexTimestampMs(shadow.desktopActiveSince)) shadow.desktopActiveSince = Date.now()
    } else {
      delete shadow.desktopActiveSince
    }
    const readStateOnly = containsReadStatePatch && !containsActivityPatch
    if (this.sideShadows.has(params.conversationId)) this.publishSideShadow(params.conversationId, shadow, readStateOnly)
    else this.publishShadow(params.conversationId, shadow, readStateOnly)
  }

  publishShadow(threadId, shadow, readStateOnly = false) {
    const known = codexActivityInventory.get(threadId)
    const activity = codexDesktopShadowActivity(shadow)
    if (!known || !activity) return
    const previousStatus = known.status
    const desktopEvidence = shadow.activityEvidence === 'activity-event' ? 'activity-event' : 'initial-snapshot'
    if (desktopEvidence === 'activity-event' && activity.status !== 'active') known.appServerLiveActive = false
    const appServerActive = known.appServerLiveActive === true && desktopEvidence !== 'activity-event' && activity.status !== 'active'
    known.status = appServerActive ? 'active' : activity.status
    known.activeFlags = appServerActive ? [...known.connectorActiveFlags] : activity.activeFlags
    known.statusAuthority = appServerActive ? 'app-server-live' : 'desktop-live'
    known.activityEvidence = appServerActive ? 'activity-event' : desktopEvidence
    known.activityRevision = shadow.activityRevision
    if (activity.desktopActiveSince) known.desktopActiveSince = activity.desktopActiveSince
    else delete known.desktopActiveSince
    let unreadIds = null
    try { unreadIds = readCodexDesktopUnreadIds() } catch {}
    const unread = codexDesktopUnreadObservation(this, known, threadId, shadow, unreadIds)
    known.hasUnreadTurn = unread.hasUnreadTurn
    known.unreadAuthority = unread.unreadAuthority
    this.emitParentActivity(threadId, previousStatus, readStateOnly)
  }

  emitParentActivity(parentThreadId, previousStatus, readStateOnly = false) {
    const known = codexActivityInventory.get(parentThreadId)
    if (!known) return
    const priorStatus = previousStatus || known.status
    const own = codexDesktopShadowActivity(this.shadows.get(parentThreadId)) || {
      status: known.connectorStatus,
      activeFlags: [...known.connectorActiveFlags]
    }
    const childEntries = [...this.sideShadows.entries()].filter(([, shadow]) => shadow.parentThreadId === parentThreadId)
    const children = childEntries.map(([, shadow]) => shadow)
    const activities = [own, ...children.map(codexDesktopShadowActivity).filter(Boolean)]
    const activeFlags = [...new Set(activities.flatMap((activity) => activity.activeFlags || []))]
    const hasInput = activeFlags.includes('waitingOnUserInput')
    const hasApproval = activeFlags.includes('waitingOnApproval')
    const hasActive = activities.some((activity) => activity.status === 'active')
    const hasSystemError = activities.some((activity) => activity.status === 'systemError')
    const desktopActivityEvent = [this.shadows.get(parentThreadId), ...children]
      .filter(Boolean)
      .some((shadow) => shadow.activityEvidence === 'activity-event')
    if (desktopActivityEvent && !hasActive && !hasInput && !hasApproval) known.appServerLiveActive = false
    const appServerActive = known.appServerLiveActive === true && !desktopActivityEvent && !hasActive && !hasInput && !hasApproval
    const status = hasInput || hasApproval || hasActive || appServerActive
      ? 'active'
      : hasSystemError ? 'systemError' : own.status
    const desktopActiveSince = status === 'active'
      ? Math.max(0, ...activities
        .filter((activity) => activity.status === 'active')
        .map((activity) => codexTimestampMs(activity.desktopActiveSince)))
      : 0
    known.status = status
    known.activeFlags = status === 'active'
      ? (appServerActive ? [...known.connectorActiveFlags] : activeFlags)
      : []
    known.statusAuthority = appServerActive ? 'app-server-live' : 'desktop-live'
    const evidenceShadows = [this.shadows.get(parentThreadId), ...children].filter(Boolean)
    known.activityEvidence = appServerActive || evidenceShadows.some((shadow) => shadow.activityEvidence === 'activity-event')
      ? 'activity-event'
      : 'initial-snapshot'
    known.activityRevision = Math.max(0, ...evidenceShadows.map((shadow) => Number.isInteger(shadow.activityRevision) ? shadow.activityRevision : 0))
    if (desktopActiveSince) known.desktopActiveSince = desktopActiveSince
    else delete known.desktopActiveSince
    const ownShadow = this.shadows.get(parentThreadId)
    let unreadIds = null
    try { unreadIds = readCodexDesktopUnreadIds() } catch {}
    const ownUnread = codexDesktopUnreadObservation(this, known, parentThreadId, ownShadow, unreadIds)
    const childUnread = childEntries.map(([threadId, shadow]) => {
      return codexDesktopUnreadObservation(this, known, threadId, shadow, unreadIds)
    })
    const unread = ownUnread.hasUnreadTurn || childUnread.some((child) => child.hasUnreadTurn)
    const liveAuthority = ownUnread.unreadAuthority === 'desktop-live'
      || childUnread.some((child) => child.unreadAuthority === 'desktop-live')
    if (liveAuthority) {
      known.hasUnreadTurn = unread
      known.unreadAuthority = 'desktop-live'
    } else {
      known.hasUnreadTurn = unread
      known.unreadAuthority = ownUnread.unreadAuthority === 'desktop-persisted'
        || childUnread.some((child) => child.unreadAuthority === 'desktop-persisted')
        ? 'desktop-persisted'
        : 'unavailable'
    }
    emitCodexActivityDelta([readStateOnly ? { ...known, readStateOnly: true } : known], false)
    if (status === 'active') {
      const waitingLive = activeFlags.includes('waitingOnUserInput') || activeFlags.includes('waitingOnApproval')
      if (!waitingLive && (known.lastTurnStatus === 'completed'
        || priorStatus !== 'active' && known.lastTurnStatus !== 'inProgress')) {
        this.scheduleLatestTurnRefresh(parentThreadId, { verifyStaleActive: true })
      } else if (waitingLive) {
        this.cancelLatestTurnRefresh(parentThreadId)
      }
    } else if (priorStatus === 'active') {
      codexApplyCachedCompletedTurnEvidence(known, parentThreadId)
      if (known.lastTurnStatus === 'completed') this.publishTargetedCompletion(known, parentThreadId)
      else this.scheduleLatestTurnRefresh(parentThreadId)
    }
  }

  publishSideShadow(threadId, shadow, readStateOnly = false) {
    if (!shadow?.parentThreadId || !this.sideShadows.has(threadId)) return
    this.emitParentActivity(shadow.parentThreadId, undefined, readStateOnly)
  }

  handleReadState(params, ownerClientId) {
    if (params.hostId !== 'local' || !validCodexThreadId(params.conversationId) || typeof params.hasUnreadTurn !== 'boolean') return
    const known = codexActivityInventory.get(params.conversationId)
    const sideShadow = this.sideShadows.get(params.conversationId)
    if (!known && !sideShadow) return
    if (sideShadow) {
      sideShadow.hasUnreadTurn = params.hasUnreadTurn
      this.liveUnread.set(params.conversationId, {
        ownerClientId: typeof ownerClientId === 'string' && ownerClientId ? ownerClientId : 'desktop-live',
        hasUnreadTurn: params.hasUnreadTurn,
        unreadEvidence: 'event'
      })
      this.emitParentActivity(sideShadow.parentThreadId, undefined, true)
      this.reconcileLateUnread(sideShadow.parentThreadId, params.hasUnreadTurn)
      return
    }
    known.hasUnreadTurn = params.hasUnreadTurn
    known.unreadAuthority = 'desktop-live'
    this.liveUnread.set(params.conversationId, {
      ownerClientId: typeof ownerClientId === 'string' && ownerClientId ? ownerClientId : 'desktop-live',
      hasUnreadTurn: params.hasUnreadTurn,
      unreadEvidence: 'event'
    })
    const shadow = this.shadows.get(params.conversationId)
    if (shadow) {
      shadow.hasUnreadTurn = params.hasUnreadTurn
      shadow.unreadEvidence = 'event'
    }
    emitCodexActivityDelta([{ ...known, readStateOnly: true }], false)
    this.reconcileLateUnread(params.conversationId, params.hasUnreadTurn)
  }

  reconcileLateUnread(threadId, hasUnreadTurn) {
    if (hasUnreadTurn !== true || !validCodexThreadId(threadId)) return
    const known = codexActivityInventory.get(threadId)
    if (!known || known.status === 'active' || known.lastTurnStatus === 'completed') return
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
  }

  resubscribe(threadId) {
    const sideShadow = this.sideShadows.get(threadId)
    this.shadows.delete(threadId)
    this.sideShadows.delete(threadId)
    this.liveUnread.delete(threadId)
    this.refreshPersistedUnread(false)
    if (sideShadow?.parentThreadId) this.emitParentActivity(sideShadow.parentThreadId)
    else this.restoreConnectorAuthority(threadId)
    this.followAny(threadId, false)
    this.followAny(threadId, true)
  }

  dropOwner(clientId) {
    const affected = new Set()
    const affectedParents = new Set()
    for (const [threadId, shadow] of this.shadows) {
      if (shadow.ownerClientId !== clientId) continue
      this.shadows.delete(threadId)
      const known = codexActivityInventory.get(threadId)
      if (!known) continue
      known.status = known.connectorStatus
      known.activeFlags = [...known.connectorActiveFlags]
      known.statusAuthority = 'connector'
      delete known.desktopActiveSince
      affected.add(threadId)
    }
    for (const [threadId, shadow] of this.sideShadows) {
      if (shadow.ownerClientId !== clientId) continue
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
    if (!affected.size && !affectedParents.size) return
    this.refreshPersistedUnread(false)
    emitCodexActivityDelta([...affected].map((threadId) => codexActivityInventory.get(threadId)).filter(Boolean), false)
    for (const parentThreadId of affectedParents) this.emitParentActivity(parentThreadId)
  }

  restoreConnectorAuthority(threadId) {
    const known = codexActivityInventory.get(threadId)
    if (!known) return
    known.status = known.connectorStatus
    known.activeFlags = [...known.connectorActiveFlags]
    known.statusAuthority = 'connector'
    delete known.desktopActiveSince
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
      const connectorHasUnreadTurn = unreadIds ? unreadIds.has(threadId) : false
      const connectorAuthority = unreadIds ? 'desktop-persisted' : 'unavailable'
      known.connectorHasUnreadTurn = connectorHasUnreadTurn
      known.connectorUnreadAuthority = connectorAuthority
      const observation = codexDesktopUnreadObservation(this, known, threadId, shadow, unreadIds)
      if (known.hasUnreadTurn === observation.hasUnreadTurn && known.unreadAuthority === observation.unreadAuthority) {
        this.reconcileLateUnread(threadId, observation.hasUnreadTurn)
        continue
      }
      known.hasUnreadTurn = observation.hasUnreadTurn
      known.unreadAuthority = observation.unreadAuthority
      changed.push(codexActivityPublicEntry({ ...known, readStateOnly: true }))
      this.reconcileLateUnread(threadId, observation.hasUnreadTurn)
    }
    if (emit && changed.length) emitCodexActivityDelta(changed, false)
  }

  ensureUnreadStateWatcher() {
    if (this.unreadStateWatcher || !this.inventory.size || typeof fs.watch !== 'function') return
    const { primary } = codexNativeStatePaths()
    try {
      this.unreadStateWatcher = fs.watch(path.dirname(primary), { persistent: false }, (_event, filename) => {
        if (filename && String(filename) !== path.basename(primary)) return
        if (this.unreadStateWatchTimer) clearTimeout(this.unreadStateWatchTimer)
        this.unreadStateWatchTimer = setTimeout(() => {
          this.unreadStateWatchTimer = null
          if (!this.closed) this.refreshPersistedUnread(true)
        }, 25)
        this.unreadStateWatchTimer.unref?.()
      })
      this.unreadStateWatcher.unref?.()
      this.unreadStateWatcher.on?.('error', () => this.closeUnreadStateWatcher())
    } catch {
      this.unreadStateWatcher = null
    }
  }

  closeUnreadStateWatcher() {
    if (this.unreadStateWatchTimer) clearTimeout(this.unreadStateWatchTimer)
    this.unreadStateWatchTimer = null
    try { this.unreadStateWatcher?.close() } catch {}
    this.unreadStateWatcher = null
  }

  resetLiveAuthority() {
    this.clearLatestTurnRefreshes()
    this.shadows.clear()
    this.sideShadows.clear()
    this.liveUnread.clear()
    for (const threadId of this.inventory) {
      const known = codexActivityInventory.get(threadId)
      if (!known) continue
      known.status = known.connectorStatus
      known.activeFlags = [...known.connectorActiveFlags]
      known.statusAuthority = 'connector'
      delete known.desktopActiveSince
    }
    this.refreshPersistedUnread(false)
    emitCodexActivityDelta([...codexActivityInventory.values()].map(codexActivityPublicEntry), false)
  }

  updateInventory(threadIds) {
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
    for (const threadId of this.turnRefreshes.keys()) if (!next.has(threadId)) this.cancelLatestTurnRefresh(threadId)
    for (const threadId of this.unreadRefreshes.keys()) if (!next.has(threadId)) this.cancelCompletionUnreadRefresh(threadId)
    for (const [threadId, shadow] of this.sideShadows) {
      if (next.has(shadow.parentThreadId)) continue
      this.sideShadows.delete(threadId)
      if (this.state === 'connected') this.followAny(threadId, false)
    }
    this.inventory = next
    this.refreshPersistedUnread(false)
    if (next.size) this.ensureUnreadStateWatcher()
    else this.closeUnreadStateWatcher()
    this.ensure()
    for (const [threadId, shadow] of this.shadows) {
      if (next.has(threadId)) {
        this.publishShadow(threadId, shadow)
        this.verifyTerminalActiveSnapshot(threadId, shadow)
      }
    }
    if (this.state === 'connected') {
      for (const threadId of next) if (!previous.has(threadId)) this.follow(threadId, true)
    }
  }

  activityForThread(threadId) {
    if (this.state !== 'connected') return null
    const shadow = this.shadows.get(threadId)
    return shadow ? codexDesktopShadowActivity(shadow) : null
  }

  navigationTargetForThread(threadId) {
    if (!validCodexThreadId(threadId)) return threadId
    const priority = (shadow) => {
      const activity = codexDesktopShadowActivity(shadow)
      if (!activity) return 0
      if (activity.activeFlags.includes('waitingOnUserInput')) return 3
      if (activity.activeFlags.includes('waitingOnApproval')) return 2
      return activity.status === 'active' ? 1 : 0
    }
    const candidates = [...this.sideShadows.entries()]
      .filter(([, shadow]) => shadow.parentThreadId === threadId && priority(shadow) > 0)
      .sort((left, right) => priority(right[1]) - priority(left[1]) || right[1].revision - left[1].revision)
    return candidates[0]?.[0] || threadId
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
        if (value === 'dispatched') {
          this.follow(threadId, false)
          this.shadows.delete(threadId)
          this.liveUnread.delete(threadId)
          emitCodexActivityDelta([], true)
        }
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
    this.closeUnreadStateWatcher()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.initializeTimer) clearTimeout(this.initializeTimer)
    this.reconnectTimer = null
    this.initializeTimer = null
    if (this.state === 'connected') this.followAll(false)
    try { this.socket?.destroy() } catch {}
    this.socket = null
    this.shadows.clear()
    this.liveUnread.clear()
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

function resetCodexThreadSessionState() {
  codexThreadActions.clear()
  codexProjectActions.clear()
  codexActivityInventory = new Map()
  codexActivitySourceFingerprint = ''
  codexActivityGeneration += 1
  codexDesktopBridge?.updateInventory(new Set())
  codexThreadTurnStatusCache.clear()
  codexThreadTurnStatusDirty.clear()
  codexThreadTurnStatusDirtyGeneration += 1
  codexThreadFirstPromptCache.clear()
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
  const readStateOnly = source.readStateOnly === true
  const status = ['active', 'idle', 'notLoaded', 'systemError'].includes(source.status) ? source.status : undefined
  const activeFlags = status === 'active' && Array.isArray(source.activeFlags)
    ? [...new Set(source.activeFlags.filter((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput'))]
    : []
  const statusAuthority = ['desktop-live', 'app-server-live', 'connector', 'unavailable'].includes(source.statusAuthority)
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
  const lastTurnEvidence = ['inventory', 'turn-started', 'turn-completed', 'targeted-after-exit', 'snapshot-corroborated'].includes(source.lastTurnEvidence)
    ? source.lastTurnEvidence
    : undefined
  return {
    key: typeof source.key === 'string' ? source.key : '',
    ...(readStateOnly
      ? { readStateOnly: true }
      : {
          ...(status ? { status } : {}),
          activeFlags,
          statusAuthority,
          ...(activityEvidence ? { activityEvidence } : {}),
          ...(activityRevision !== undefined ? { activityRevision } : {}),
          ...(desktopActiveSince ? { desktopActiveSince } : {}),
          ...(lastTurnStatus ? { lastTurnStatus } : {}),
          ...(lastTurnStartedAt ? { lastTurnStartedAt } : {}),
          ...(lastTurnCompletedAt ? { lastTurnCompletedAt } : {}),
          ...(lastTurnEvidence ? { lastTurnEvidence } : {})
        }),
    ...(typeof source.hasUnreadTurn === 'boolean' ? { hasUnreadTurn: source.hasUnreadTurn } : {}),
    unreadAuthority
  }
}

function codexArchivedActivityKey(threadId) {
  const known = codexActivityInventory.get(threadId)
  if (!known || typeof known.key !== 'string' || !/^[a-f0-9]{32}$/.test(known.key)) return ''
  for (const [alias, action] of codexThreadActions) {
    if (action.threadId === threadId) codexThreadActions.delete(alias)
  }
  codexThreadTurnStatusCache.delete(threadId)
  codexThreadTurnStatusDirty.delete(threadId)
  codexThreadFirstPromptCache.delete(threadId)
  return known.key
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
    receivedAt
  }
}

function emitCodexActivityDelta(entries, inventoryChanged, inventoryRefreshPriority = 'normal', archivedKeys = []) {
  if (!codexActivitySourceFingerprint) return
  const delta = codexActivityDelta(entries, inventoryChanged, Date.now(), inventoryRefreshPriority, archivedKeys)
  for (const listener of codexActivityListeners) {
    try { listener(delta) } catch {}
  }
}

function handleCodexServerMessage(message) {
  if (!message || typeof message !== 'object' || typeof message.method !== 'string') return false
  const method = message.method
  const params = codexRecord(message.params)
  if (method === 'thread/status/changed') {
    const threadId = typeof params.threadId === 'string' ? params.threadId : ''
    const known = codexActivityInventory.get(threadId)
    const activity = sanitizeCodexActivityStatus(params.status)
    if (known && activity) {
      const exitedActive = known.connectorStatus === 'active' && activity.status !== 'active'
      known.connectorStatus = activity.status
      known.connectorActiveFlags = activity.activeFlags
      known.appServerLiveActive = activity.status === 'active'
      if (activity.status === 'active') {
        const bridge = codexEnsureDesktopBridge()
        known.status = 'active'
        known.activeFlags = activity.activeFlags
        known.statusAuthority = 'app-server-live'
        known.activityEvidence = 'activity-event'
        known.activityRevision = codexActivityGeneration
        known.lastTurnStatus = 'inProgress'
        delete known.lastTurnCompletedAt
        delete known.lastTurnEvidence
        codexThreadTurnStatusCache.delete(threadId)
        bridge.cancelLatestTurnRefresh(threadId)
        bridge.cancelCompletionUnreadRefresh(threadId)
        delete known.desktopActiveSince
      } else if (known.statusAuthority !== 'desktop-live') {
        known.status = activity.status
        known.activeFlags = activity.activeFlags
        known.statusAuthority = 'connector'
        known.activityEvidence = 'connector'
        known.activityRevision = codexActivityGeneration
        delete known.desktopActiveSince
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
      const known = codexActivityInventory.get(threadId)
      if (known && method === 'turn/started' && codexApplyStartedTurnNotification(bridge, known, threadId, params.turn)) return true
      if (known && method === 'turn/completed' && codexApplyCompletedTurnNotification(bridge, known, threadId, params.turn)) return true
    }
    markCodexThreadTurnStatusDirty(threadId)
    emitCodexActivityDelta([], true, 'urgent')
    if (method === 'turn/completed' && validCodexThreadId(threadId)) {
      const bridge = codexEnsureDesktopBridge()
      const known = codexActivityInventory.get(threadId)
      if (known) {
        const waitingLive = Array.isArray(known.activeFlags)
          && known.activeFlags.some((flag) => flag === 'waitingOnUserInput' || flag === 'waitingOnApproval')
        if (known.status === 'active' && !waitingLive) {
          bridge.scheduleLatestTurnRefresh(threadId, { verifyStaleActive: true })
        }
        bridge.scheduleCompletionUnreadRefresh(threadId)
      }
    }
    return true
  }
  if (method === 'thread/archived') {
    const threadId = typeof params.threadId === 'string' ? params.threadId : typeof params.conversationId === 'string' ? params.conversationId : ''
    const archivedKey = validCodexThreadId(threadId) ? codexArchivedActivityKey(threadId) : ''
    emitCodexActivityDelta([], true, archivedKey ? 'urgent' : 'normal', archivedKey ? [archivedKey] : [])
    return true
  }
  if (['thread/unarchived', 'thread/deleted'].includes(method)) {
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
  resetCodexThreadSessionState()
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

function closeCodexServer() {
  const processRef = codexProcess
  rejectCodexPending(codexError('process-exited', 'Codex App Server session closed'))
  codexProcess = null
  codexLaunchKey = ''
  codexStartupHint = ''
  codexReadyPromise = null
  codexRpcBuffer = ''
  try { processRef?.stdout?.off?.('data', handleCodexStdout) } catch {}
  try { processRef?.stderr?.off?.('data', inspectCodexStderr) } catch {}
  try { processRef?.stdin?.end() } catch {}
  try { processRef?.stdout?.destroy?.() } catch {}
  try { processRef?.stderr?.destroy?.() } catch {}
  resetCodexThreadSessionState()
}

function closeCodexConnections() {
  try {
    for (const session of codexEnvironmentActionSessions.values()) {
      if (!session || session.state === 'idle') continue
      try {
        session.state = 'stopping'
        session.message = '正在停止 Serve'
        if (process.platform !== 'win32' && typeof session.childPid === 'number') process.kill(-session.childPid, 'SIGTERM')
        else session.child?.kill?.('SIGTERM')
      } catch {}
    }
  } catch {}
  codexEnvironmentActionSessions.clear()
  codexEnvironmentConfirmTokens.clear()
  codexEnvironmentCommandVault.clear()
  closeCodexServer()
  closeCodexDesktopBridge()
}

function sanitizeCodexQuotaWindow(value) {
  const source = codexRecord(value)
  if (!Object.keys(source).length || typeof source.usedPercent !== 'number') return null
  return {
    remainingPercent: codexPercent(100 - source.usedPercent),
    resetAt: codexTimestampMs(source.resetsAt) || null,
    windowMinutes: codexNumber(source.windowDurationMins) || null
  }
}

function sanitizeCodexQuota(rateResult, accountResult) {
  const rateSource = codexRecord(rateResult)
  const byLimit = codexRecord(rateSource.rateLimitsByLimitId)
  const pools = Object.entries(byLimit).flatMap(([key, value]) => {
    const source = codexRecord(value)
    const limitId = typeof source.limitId === 'string' && source.limitId ? source.limitId.slice(0, 120) : String(key || '').slice(0, 120)
    if (!limitId) return []
    const limitName = typeof source.limitName === 'string' && source.limitName ? source.limitName.slice(0, 160) : limitId
    const family = /spark/i.test(`${limitId} ${limitName}`) || limitId === 'codex_bengalfox' ? 'spark' : 'normal'
    const windows = [sanitizeCodexQuotaWindow(source.primary), sanitizeCodexQuotaWindow(source.secondary)].filter(Boolean)
      .sort((left, right) => (left.windowMinutes || Number.MAX_SAFE_INTEGER) - (right.windowMinutes || Number.MAX_SAFE_INTEGER))
    return [{
      limitId,
      limitName,
      family,
      short: windows.find((window) => window.windowMinutes && window.windowMinutes <= 24 * 60) || null,
      weekly: [...windows].reverse().find((window) => window.windowMinutes && window.windowMinutes > 24 * 60) || null,
      planType: typeof source.planType === 'string' ? source.planType : ''
    }]
  })
  if (!pools.length && Object.keys(codexRecord(rateSource.rateLimits)).length) {
    const source = codexRecord(rateSource.rateLimits)
    const windows = [sanitizeCodexQuotaWindow(source.primary), sanitizeCodexQuotaWindow(source.secondary)].filter(Boolean)
      .sort((left, right) => (left.windowMinutes || Number.MAX_SAFE_INTEGER) - (right.windowMinutes || Number.MAX_SAFE_INTEGER))
    pools.push({
      limitId: 'codex',
      limitName: 'Codex',
      family: 'normal',
      short: windows.find((window) => window.windowMinutes && window.windowMinutes <= 24 * 60) || null,
      weekly: [...windows].reverse().find((window) => window.windowMinutes && window.windowMinutes > 24 * 60) || null,
      planType: typeof source.planType === 'string' ? source.planType : ''
    })
  }
  const selected = pools.find((pool) => pool.limitId === 'codex') || pools.find((pool) => pool.family === 'normal') || {
    limitId: 'codex', limitName: 'Codex', family: 'normal', short: null, weekly: null, planType: ''
  }
  const normal = { limitId: selected.limitId, limitName: selected.limitName, family: 'normal', short: selected.short, weekly: selected.weekly }
  const spark = pools.filter((pool) => pool.family === 'spark').map((pool) => ({
    limitId: pool.limitId,
    limitName: pool.limitName,
    family: 'spark',
    short: pool.short,
    weekly: pool.weekly
  })).sort((left, right) => Math.max(right.short?.remainingPercent ?? -1, right.weekly?.remainingPercent ?? -1)
    - Math.max(left.short?.remainingPercent ?? -1, left.weekly?.remainingPercent ?? -1) || left.limitId.localeCompare(right.limitId))
  const account = codexRecord(codexRecord(accountResult).account)
  const plan = typeof selected.planType === 'string' && selected.planType
    ? selected.planType
    : typeof account.planType === 'string'
      ? account.planType
      : ''
  return { plan: plan.slice(0, 64), short: normal.short, weekly: normal.weekly, normal, spark }
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

function codexNativeStringList(value, maximum = 100_000) {
  if (!Array.isArray(value) || value.length > maximum) throw codexError('protocol-error', 'Codex native project state is invalid')
  const result = []
  for (const item of value) {
    const normalized = codexNativeString(item)
    if (!normalized) throw codexError('protocol-error', 'Codex native project state is invalid')
    if (!result.includes(normalized)) result.push(normalized)
  }
  return result
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

function codexProjectKey(roots) {
  return crypto.createHash('sha256').update(`codex-project\0${[...roots].sort().join('\0')}`).digest('hex').slice(0, 32)
}

function codexStableNativeProjection(value) {
  if (Array.isArray(value)) return value.map(codexStableNativeProjection)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, codexStableNativeProjection(value[key])]))
}

function parseCodexNativeRegistryText(text) {
  let parsed
  try { parsed = JSON.parse(text) } catch { throw codexError('protocol-error', 'Codex native project state is invalid') }
  const source = codexRecord(parsed)
  const localProjectsSource = source['local-projects']
  const assignmentsSource = source['thread-project-assignments']
  if (!localProjectsSource || typeof localProjectsSource !== 'object' || Array.isArray(localProjectsSource)) throw codexError('protocol-error', 'Codex native project state is invalid')
  if (!assignmentsSource || typeof assignmentsSource !== 'object' || Array.isArray(assignmentsSource)) throw codexError('protocol-error', 'Codex native project state is invalid')
  const projectOrder = codexNativeStringList(source['project-order'])
  const pinnedProjectIds = codexNativeStringList(source['pinned-project-ids'])
  const pinnedThreadIds = codexNativeStringList(source['pinned-thread-ids']).filter(validCodexThreadId)
  const projectlessThreadIds = codexNativeStringList(source['projectless-thread-ids']).filter(validCodexThreadId)
  const projects = []
  const projectById = new Map()
  const projectKeySet = new Set()
  const localProjectEntries = Object.entries(localProjectsSource)
  if (localProjectEntries.length > 10_000) throw codexError('protocol-error', 'Codex native project state is invalid')
  for (let insertionOrder = 0; insertionOrder < localProjectEntries.length; insertionOrder += 1) {
    const [storageId, rawValue] = localProjectEntries[insertionOrder]
    const project = codexRecord(rawValue)
    const id = codexNativeString(project.id)
    const name = codexNativeString(project.name, 160)
    if (!id || id !== storageId || !name || !Array.isArray(project.rootPaths) || project.rootPaths.length < 1 || project.rootPaths.length > 32) throw codexError('protocol-error', 'Codex native project state is invalid')
    const roots = [...new Set(project.rootPaths.map(codexNormalizeNativeRoot))]
    if (roots.some((root) => !root) || roots.length < 1) throw codexError('protocol-error', 'Codex native project state is invalid')
    const key = codexProjectKey(roots)
    if (projectKeySet.has(key)) throw codexError('protocol-error', 'Codex native project roots are ambiguous')
    projectKeySet.add(key)
    const normalized = { id, key, name, roots, insertionOrder }
    projects.push(normalized)
    projectById.set(id, normalized)
  }
  const assignments = new Map()
  const assignmentEntries = Object.entries(assignmentsSource)
  if (assignmentEntries.length > 100_000) throw codexError('protocol-error', 'Codex native project state is invalid')
  for (const [threadId, rawValue] of assignmentEntries) {
    if (!validCodexThreadId(threadId)) throw codexError('protocol-error', 'Codex native project state is invalid')
    const assignment = codexRecord(rawValue)
    const projectId = codexNativeString(assignment.projectId)
    if (!projectId) throw codexError('protocol-error', 'Codex native project state is invalid')
    assignments.set(threadId, projectId)
  }
  const nativeProjection = {
    projects: projects.map((project) => ({ id: project.id, name: project.name, roots: [...project.roots].sort() })),
    projectOrder,
    pinnedProjectIds,
    pinnedThreadIds,
    assignments: [...assignments.entries()].sort(([left], [right]) => left.localeCompare(right)),
    projectlessThreadIds: [...projectlessThreadIds].sort()
  }
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(codexStableNativeProjection(nativeProjection))).digest('hex')
  const orderById = new Map(projectOrder.map((id, index) => [id, index]))
  const pinnedOrderById = new Map(pinnedProjectIds.map((id, index) => [id, index]))
  for (const project of projects) {
    project.nativePinnedOrder = pinnedOrderById.get(project.id)
    project.nativeOrder = orderById.has(project.id) ? orderById.get(project.id) : projectOrder.length + project.insertionOrder
  }
  return {
    projects,
    projectById,
    assignments,
    projectlessThreadIds: new Set(projectlessThreadIds),
    pinnedThreadOrder: new Map(pinnedThreadIds.map((id, index) => [id, index])),
    fingerprint
  }
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
  const completedAt = status === 'completed' ? codexTimestampMs(turn.completedAt) : 0
  const startedAt = codexTimestampMs(turn.startedAt)
  return {
    status,
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
  for (let pageIndex = 0; pageIndex < CODEX_THREAD_PAGE_LIMIT; pageIndex += 1) {
    const page = codexRecord(await requestCodexRpc('thread/list', {
      limit: CODEX_THREAD_LIMIT,
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
  throw codexError('protocol-error', 'Codex thread pagination exceeded the safety bound')
}

async function recoverDirtyCodexThreadsMissingFromInventory(rows, dirtyThreadIds) {
  const knownIds = new Set(rows.map((row) => codexRecord(row).id).filter(validCodexThreadId))
  const candidateIds = [...dirtyThreadIds]
    .filter((threadId) => validCodexThreadId(threadId) && !knownIds.has(threadId))
    .slice(0, CODEX_THREAD_TURN_STATUS_CONCURRENCY)
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
      codexThreadTurnStatusCache.set(thread.id, { nonConversation: true })
      return
    }
    const turn = sanitizeCodexTurnStatusPage(page)
    if (!turn || !turn.startedAt) throw codexError('protocol-error', 'Codex latest Turn is missing startedAt')
    latest.set(thread.id, turn)
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
  return { latest, nonConversationIds }
}

function sanitizeCodexThreads(rows, registry, assignments, turnStatuses = new Map(), unreadIds = null) {
  const now = Date.now()
  const threads = []
  for (const row of rows) {
    const thread = codexRecord(row)
    const native = assignments.get(thread.id)
    if (!native) continue
    const statusSource = codexRecord(thread.status)
    const status = ['active', 'idle', 'notLoaded', 'systemError'].includes(statusSource.type) ? statusSource.type : 'notLoaded'
    const activeFlags = status === 'active' && Array.isArray(statusSource.activeFlags)
      ? statusSource.activeFlags.filter((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput')
      : []
    const project = native.project
    const action = codexThreadAlias(thread.id, now, { projectKey: project.key, sourceFingerprint: registry.fingerprint, cwd: codexNormalizeNativeRoot(thread.cwd) })
    const lastTurn = turnStatuses.get(thread.id)
    if (!lastTurn || !lastTurn.startedAt) continue
    threads.push({
      key: action.key,
      actionAlias: action.alias,
      name: typeof thread.name === 'string' && thread.name.trim() ? thread.name.trim().slice(0, 120) : '未命名任务',
      status,
      activeFlags,
      statusAuthority: 'connector',
      hasUnreadTurn: unreadIds ? unreadIds.has(thread.id) : false,
      unreadAuthority: unreadIds ? 'desktop-persisted' : 'unavailable',
      updatedAt: codexTimestampMs(thread.recencyAt) || codexTimestampMs(thread.updatedAt) || lastTurn.startedAt,
      ...(codexTimestampMs(thread.createdAt) ? { createdAt: codexTimestampMs(thread.createdAt) } : {}),
      ...(codexThreadFirstPromptCache.get(thread.id)?.firstPromptAt ? { firstPromptAt: codexThreadFirstPromptCache.get(thread.id).firstPromptAt } : {}),
      lastTurnStatus: lastTurn.status,
      lastTurnStartedAt: lastTurn.startedAt,
      ...(lastTurn.completedAt ? { lastTurnCompletedAt: lastTurn.completedAt } : {}),
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

async function scanVerifiedCodexInventory() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const previousActivityInventory = codexActivityInventory
    const dirtySnapshot = new Map(codexThreadTurnStatusDirty)
    const registry = readCodexNativeRegistry()
    const listedRows = await listAllCodexThreads(false)
    const rows = await recoverDirtyCodexThreadsMissingFromInventory(listedRows, dirtySnapshot.keys())
    const assignments = new Map()
    let excludedSourceCount = 0
    for (const thread of rows) {
      const native = codexThreadNativeProject(thread, registry)
      if (native) assignments.set(thread.id, native)
      else excludedSourceCount += 1
    }
    const eligibleRows = rows.filter((thread) => assignments.has(thread.id))
    const turns = await readCodexThreadTurnStatuses(eligibleRows, new Set(dirtySnapshot.keys()))
    const endingRegistry = readCodexNativeRegistry()
    if (endingRegistry.fingerprint !== registry.fingerprint) {
      if (attempt === 0) continue
      throw codexError('protocol-error', 'Codex native project state changed during the scan')
    }
    let unreadIds = null
    try { unreadIds = readCodexDesktopUnreadIds() } catch {}
    const threads = sanitizeCodexThreads(eligibleRows, registry, assignments, turns.latest, unreadIds)
    const eligibleIds = new Set(eligibleRows.map((thread) => thread.id))
    for (const threadId of codexThreadTurnStatusCache.keys()) {
      if (!eligibleIds.has(threadId)) codexThreadTurnStatusCache.delete(threadId)
    }
    const validKeys = new Set(threads.map((thread) => thread.key))
    const threadByKey = new Map(threads.map((thread) => [thread.key, thread]))
    const activityInventory = new Map()
    for (const row of eligibleRows) {
      const thread = codexRecord(row)
      const key = validCodexThreadId(thread.id) ? codexThreadKey(thread.id) : ''
      if (!key || !validKeys.has(key)) continue
      const activity = sanitizeCodexActivityStatus(thread.status)
      if (!activity) throw codexError('protocol-error', 'Codex thread activity status is invalid')
      const projection = threadByKey.get(key)
      const previousActivity = previousActivityInventory.get(thread.id)
      const preserveAppServerActive = previousActivity?.appServerLiveActive === true
      activityInventory.set(thread.id, {
        key,
        ...activity,
        connectorStatus: activity.status,
        connectorActiveFlags: activity.activeFlags,
        ...(preserveAppServerActive ? { status: 'active', activeFlags: [...(previousActivity.activeFlags || [])] } : {}),
        statusAuthority: preserveAppServerActive ? 'app-server-live' : 'connector',
        activityEvidence: preserveAppServerActive ? 'activity-event' : 'connector',
        activityRevision: 0,
        ...(preserveAppServerActive ? { appServerLiveActive: true } : {}),
        hasUnreadTurn: projection?.hasUnreadTurn === true,
        connectorHasUnreadTurn: projection?.hasUnreadTurn === true,
        connectorUnreadAuthority: projection?.unreadAuthority || 'unavailable',
        unreadAuthority: projection?.unreadAuthority || 'unavailable',
        ...(projection?.lastTurnStatus ? { lastTurnStatus: projection.lastTurnStatus, lastTurnEvidence: 'inventory' } : {}),
        ...(projection?.lastTurnStartedAt ? { lastTurnStartedAt: projection.lastTurnStartedAt } : {}),
        ...(projection?.lastTurnCompletedAt ? { lastTurnCompletedAt: projection.lastTurnCompletedAt } : {})
      })
    }
    codexActivityInventory = activityInventory
    codexActivitySourceFingerprint = registry.fingerprint
    codexActivityGeneration += 1
    codexEnsureDesktopBridge().updateInventory(activityInventory.keys())
    const activityByKey = new Map([...activityInventory.values()].map((entry) => [entry.key, entry]))
    for (const thread of threads) {
      const activity = activityByKey.get(thread.key)
      if (!activity) continue
      thread.status = activity.status
      thread.activeFlags = [...activity.activeFlags]
      thread.statusAuthority = activity.statusAuthority
      thread.activityEvidence = activity.activityEvidence
      thread.activityRevision = activity.activityRevision
      if (activity.desktopActiveSince) thread.desktopActiveSince = activity.desktopActiveSince
      else delete thread.desktopActiveSince
      thread.hasUnreadTurn = activity.hasUnreadTurn === true
      thread.unreadAuthority = activity.unreadAuthority
      if (activity.lastTurnEvidence) thread.lastTurnEvidence = activity.lastTurnEvidence
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
      sourceFingerprint: registry.fingerprint,
      rawSourceCount: rows.length,
      eligibleSourceCount: eligibleRows.length,
      excludedSourceCount,
      nonConversationCount: turns.nonConversationIds.size
    }
  }
  throw codexError('protocol-error', 'Codex native project state changed during the scan')
}

async function readCodexActivitySnapshot() {
  try {
    if (!codexActivitySourceFingerprint) throw codexError('protocol-error', 'Codex activity baseline is unavailable')
    const bridge = codexEnsureDesktopBridge()
    bridge.refreshPersistedUnread(false)
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

async function archiveCodexThread(actionAlias, request) {
  const input = codexRecord(request)
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
    && (
      evidence === 'completed'
        ? expectedRevisionAt === (expectedCompletionAt || expectedLastTurnStartedAt)
        : expectedRevisionAt === expectedLastTurnStartedAt && expectedCompletionAt === 0
    )
  if (!requestIsValid) {
    return { outcome: 'failed', errorCode: 'invalid-request', message: '归档请求已失效，请刷新后重试' }
  }
  const entry = codexThreadActions.get(actionAlias)
  if (!entry || entry.expiresAt <= Date.now() || !validCodexThreadId(entry.threadId)) {
    codexThreadActions.delete(actionAlias)
    return { outcome: 'failed', errorCode: 'expired-alias', message: '任务动作已过期，请刷新后重试' }
  }
  try {
    const registry = readCodexNativeRegistry()
    if (registry.fingerprint !== expectedSourceFingerprint || entry.sourceFingerprint !== expectedSourceFingerprint) {
      return { outcome: 'failed', errorCode: 'source-changed', message: 'Codex 项目状态已更新，未执行归档' }
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
    if (thread.id !== entry.threadId || !validStatus || recencyAt <= 0 || recencyAt !== expectedUpdatedAt || !validTurnShape || !native || native.project.key !== entry.projectKey) {
      return { outcome: 'failed', errorCode: 'state-changed', message: '任务状态已更新，未执行归档' }
    }
    if (!turn || turn.startedAt !== expectedLastTurnStartedAt) {
      return { outcome: 'failed', errorCode: 'turn-changed', message: '任务最新提问已更新，未执行归档' }
    }
    const desktopActivity = codexEnsureDesktopBridge().activityForThread(entry.threadId)
    if (desktopActivity?.status === 'active' || status === 'active' || turn?.status === 'inProgress') {
      return { outcome: 'failed', errorCode: 'active-task', message: '任务已恢复进行中，未执行归档' }
    }
    if (evidence === 'completed') {
      if (!turn || turn.status !== 'completed' || (turn.completedAt || turn.startedAt) !== expectedRevisionAt || (expectedCompletionAt > 0 && turn.completedAt !== expectedCompletionAt)) {
        return { outcome: 'failed', errorCode: 'completion-changed', message: '任务完成版本已更新，未执行归档' }
      }
    } else if (!turn || (turn.status !== 'failed' && turn.status !== 'interrupted') || turn.startedAt !== expectedRevisionAt) {
      return { outcome: 'failed', errorCode: 'completion-changed', message: '任务停止版本已更新，未执行归档' }
    }
    await requestCodexRpc('thread/archive', { threadId: entry.threadId })
    const [unarchivedRows, archivedRows] = await Promise.all([
      listAllCodexThreads(false),
      listAllCodexThreads(true)
    ])
    const remainsUnarchived = unarchivedRows.some((row) => row.id === entry.threadId)
    const appearsArchived = archivedRows.some((row) => row.id === entry.threadId)
    if (remainsUnarchived || !appearsArchived) {
      return { outcome: 'failed', errorCode: 'archive-not-verified', message: 'Codex 未确认归档结果，请刷新后核验' }
    }
    for (const [alias, action] of codexThreadActions) {
      if (action.threadId === entry.threadId) codexThreadActions.delete(alias)
    }
    codexThreadTurnStatusCache.delete(entry.threadId)
    codexThreadFirstPromptCache.delete(entry.threadId)
    const desktopSync = await codexEnsureDesktopBridge().notifyThreadArchived(
      entry.threadId,
      typeof thread.cwd === 'string' ? thread.cwd : ''
    )
    return { outcome: 'archived', desktopSync }
  } catch (error) {
    const source = codexRecord(error)
    return { outcome: 'failed', errorCode: typeof source.code === 'string' ? source.code : 'archive-failed', message: 'Codex 任务归档失败，请刷新后重试' }
  }
}

async function archiveCodexProject(actionAlias, request) {
  const input = codexRecord(request)
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
      const staged = []
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
            await requestCodexRpc('thread/archive', { threadId: listedThread.id })
            staged.push({ id: listedThread.id, key, cwd: typeof thread.cwd === 'string' ? thread.cwd : '' })
          } catch (error) {
            failed.push({ key, errorCode: typeof codexRecord(error).code === 'string' ? codexRecord(error).code : 'archive-failed' })
          }
        }
      })
      await Promise.all(workers)
      if (staged.length) {
        const [remainingRows, archivedRows] = await Promise.all([listAllCodexThreads(false), listAllCodexThreads(true)])
        const remainingIds = new Set(remainingRows.map((thread) => thread.id))
        const archivedIds = new Set(archivedRows.map((thread) => thread.id))
        const verified = []
        for (const item of staged) {
          if (!remainingIds.has(item.id) && archivedIds.has(item.id)) {
            archivedKeys.push(item.key)
            verified.push(item)
          }
          else failed.push({ key: item.key, errorCode: 'archive-not-verified' })
        }
        const syncResults = await Promise.all(verified.map(async (item) => {
          try {
            return { key: item.key, result: await codexEnsureDesktopBridge().notifyThreadArchived(item.id, item.cwd) }
          } catch {
            return { key: item.key, result: 'failed' }
          }
        }))
        for (const sync of syncResults) {
          if (sync.result === 'dispatched') desktopSyncedKeys.push(sync.key)
          else desktopSyncFailedKeys.push(sync.key)
        }
      }
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
  const selectedProjectSupported = selectedProject === undefined || selectedProject === null || typeof selectedProject === 'string'
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
  if (selectedProject === project.id) source['selected-project'] = null
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
  const targetThreadId = codexDesktopBridge?.navigationTargetForThread(entry.threadId) || entry.threadId
  const target = `codex://threads/${encodeURIComponent(targetThreadId)}`
  const shell = electronShell()
  if (shell && typeof shell.openExternal === 'function') {
    try {
      await withFileActionTimeout(shell.openExternal(target))
      return { outcome: 'opened' }
    } catch {
      if (targetThreadId !== entry.threadId) {
        try {
          await withFileActionTimeout(shell.openExternal(`codex://threads/${encodeURIComponent(entry.threadId)}`))
          return { outcome: 'opened', message: 'Side Chat 无法直达，已回到主对话' }
        } catch {}
      }
      return { outcome: 'failed', errorCode: 'open-failed', message: 'Codex 线程打开失败' }
    }
  }
  try {
    if (globalThis.utools && typeof globalThis.utools.shellOpenExternal === 'function') {
      globalThis.utools.shellOpenExternal(target)
      return { outcome: 'dispatched', message: '已交给系统打开，请查看后手动确认' }
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
  return { ...codexFloatWorkspaceDiagnostics }
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

function pushCodexFloatSnapshot() {
  if (!codexFloatAlive() || !codexFloatSnapshot) return false
  try {
    codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.snapshot, codexFloatSnapshot)
    pushCodexFloatState()
    return true
  } catch {
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
    applyCodexFloatWorkspaceVisibility()
    return true
  } catch {
    codexFloatWindow = null
    return false
  }
}

function closeCodexFloat() {
  if (codexFloatAlive()) {
    try { codexFloatWindow.close() } catch {}
  }
  codexFloatWindow = null
  codexFloatExpanded = false
  codexFloatPinned = false
  codexFloatEdge = 'right'
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
    const command = codexRecord(payload).command === 'new-thread' ? 'new-thread' : undefined
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
  codexFloatSnapshot = source.snapshot && typeof source.snapshot === 'object' ? source.snapshot : null
  codexFloatExpandedSizes = normalizeCodexExpandedSizes(source.expandedSizes || codexRecord(source.snapshot).expandedSizes)
  const position = codexRecord(source.position)
  codexFloatPositionDisplayId = typeof position.displayId === 'string' ? position.displayId : ''
  if (!codexFloatAlive() && !createCodexFloat(position)) return false
  applyCodexFloatWorkspaceVisibility()
  if (!codexFloatResize) resizeCodexFloat(codexFloatExpanded, false)
  return pushCodexFloatSnapshot()
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
  ipc.on(CODEX_FLOAT_CHANNELS.environmentList, async (_event, payload) => {
    const source = codexRecord(payload)
    const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
    const targetAlias = typeof source.targetAlias === 'string' ? source.targetAlias : ''
    if (!requestId) return
    const result = listCodexProjectEnvironments(targetAlias)
    if (!codexFloatAlive()) return
    try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.environmentListResult, { requestId, result }) } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.environmentRun, async (_event, payload) => {
    const source = codexRecord(payload)
    const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
    if (!requestId) return
    const result = await runCodexProjectEnvironmentAction(source.request || source)
    if (!codexFloatAlive()) return
    try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.environmentRunResult, { requestId, result }) } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.environmentSession, async (_event, payload) => {
    const source = codexRecord(payload)
    const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
    if (!requestId) return
    const mode = source.mode === 'stop' ? 'stop' : 'list'
    const result = mode === 'stop'
      ? stopCodexEnvironmentActionSession(source.request || source)
      : { outcome: 'ok', sessions: listCodexEnvironmentActionSessions() }
    if (!codexFloatAlive()) return
    try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.environmentSessionResult, { requestId, result }) } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.dragStart, (_event, payload) => {
    if (codexFloatResize || !codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return
    codexFloatDrag = { pointerX: point.screenX, pointerY: point.screenY, bounds: codexFloatWindow.getBounds() }
  })
  ipc.on(CODEX_FLOAT_CHANNELS.dragMove, (_event, payload) => {
    if (!codexFloatDrag || !codexFloatAlive()) return
    const point = codexRecord(payload)
    if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return
    const candidate = {
      ...codexFloatDrag.bounds,
      x: codexFloatDrag.bounds.x + point.screenX - codexFloatDrag.pointerX,
      y: codexFloatDrag.bounds.y + point.screenY - codexFloatDrag.pointerY
    }
    const display = floatDisplayForPoint({ x: candidate.x + candidate.width / 2, y: candidate.y + candidate.height / 2 })
    try { codexFloatWindow.setBounds(clampFloatBounds(candidate, display)) } catch {}
  })
  ipc.on(CODEX_FLOAT_CHANNELS.dragEnd, () => {
    if (!codexFloatDrag || !codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
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
      pointerX: point.screenX,
      pointerY: point.screenY,
      bounds: { ...bounds },
      display,
      displayId: String(display.id || ''),
      edge: codexFloatEdge,
      corner: point.corner
    }
    pushCodexFloatState()
  })
  ipc.on(CODEX_FLOAT_CHANNELS.resizeMove, (_event, payload) => {
    const point = codexRecord(payload)
    moveCodexFloatResize(point.screenX, point.screenY)
  })
  ipc.on(CODEX_FLOAT_CHANNELS.resizeEnd, () => {
    if (!codexFloatResize || !codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
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
  ipc.on(CODEX_FLOAT_CHANNELS.resizeCancel, () => {
    if (!codexFloatResize || !codexFloatAlive()) return
    const bounds = codexFloatResize.bounds
    codexFloatResize = null
    try { codexFloatWindow.setBounds(bounds) } catch {}
    pushCodexFloatState()
  })
}

installCodexFloatIpc()

if (globalThis.utools && typeof globalThis.utools.onPluginEnter === 'function') {
  globalThis.utools.onPluginEnter((action) => {
    lastEnterPayload = action || null
    for (const listener of enterPayloadListeners) {
      try {
        listener(lastEnterPayload)
      } catch {}
    }
  })
}

if (globalThis.utools && typeof globalThis.utools.onPluginOut === 'function') {
  globalThis.utools.onPluginOut(() => {
    if (!codexFloatPersistent) {
      closeCodexFloat()
      closeCodexConnections()
    }
  })
}

const CODEX_ENV_ACTION_CONFIRM_TTL_MS = 30_000
const codexEnvironmentCommandVault = new Map()
const codexEnvironmentActionSessions = new Map()
const codexEnvironmentConfirmTokens = new Map()

function codexEnvUnquoteTomlString(raw) {
  const value = String(raw || '').trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return value
}

function parseCodexEnvironmentTomlText(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  if (text.includes('"""') || text.includes("'''")) return null
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  let section = 'root'
  let version = 0
  let versionPresent = false
  let name = ''
  let setupScript = ''
  const actions = []
  let currentAction = null
  let parseError = false

  const stripTomlComment = (rawLine) => {
    let inSingle = false
    let inDouble = false
    let escaped = false
    for (let i = 0; i < rawLine.length; i += 1) {
      const ch = rawLine[i]
      if (escaped) {
        escaped = false
        continue
      }
      if (inDouble && ch === '\\') {
        escaped = true
        continue
      }
      if (!inDouble && ch === '\'') {
        inSingle = !inSingle
        continue
      }
      if (!inSingle && ch === '"') {
        inDouble = !inDouble
        continue
      }
      if (ch === '#' && !inSingle && !inDouble) return rawLine.slice(0, i)
    }
    return rawLine
  }
  const flushAction = () => {
    if (!currentAction) return
    if (currentAction.name && currentAction.command) actions.push({ ...currentAction })
    else parseError = true
    currentAction = null
  }
  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim()
    if (!line) continue
    if (line === '[setup]') { flushAction(); section = 'setup'; continue }
    if (line === '[[actions]]') {
      flushAction()
      section = 'action'
      currentAction = { name: '', icon: 'run', command: '' }
      continue
    }
    if (line.startsWith('[')) { flushAction(); section = 'root'; continue }
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const value = codexEnvUnquoteTomlString(line.slice(eq + 1))
    if (section === 'root') {
      if (key === 'version') {
        versionPresent = true
        const parsed = Number(value)
        version = Number.isFinite(parsed) ? parsed : NaN
      }
      else if (key === 'name') name = value.slice(0, 120)
    } else if (section === 'setup') {
      if (key === 'script') setupScript = value.slice(0, 4_000)
    } else if (section === 'action' && currentAction) {
      if (key === 'name') currentAction.name = value.slice(0, 80)
      else if (key === 'icon') currentAction.icon = value.slice(0, 40) || 'run'
      else if (key === 'command') currentAction.command = value.slice(0, 4_000)
    }
  }
  flushAction()
  if (!name && !actions.length && !setupScript) return null
  if (parseError) return null
  if (!versionPresent || version !== 1) return null
  return { version: 1, name: name || 'Environment', setupScript, actions }
}

function codexEnvironmentActionIdFromName(name, index) {
  const slug = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return slug || `action-${index + 1}`
}

function classifyCodexEnvironmentActionRiskHost(name, command) {
  const normalizedName = String(name || '').trim().toLowerCase()
  const normalizedCommand = String(command || '').trim().toLowerCase()
  if (normalizedName === 'git push' || /\bgit\s+push\b/.test(normalizedCommand)) return 'external-write'
  if (normalizedName === 'serve' || /\b(pnpm|npm|yarn|bun)\s+run\s+serve\b/.test(normalizedCommand) || /\bvite\b/.test(normalizedCommand) && /\bserve\b/.test(normalizedCommand)) return 'long-running'
  if (normalizedName === 'build' || /\b(pnpm|npm|yarn|bun)\s+run\s+build\b/.test(normalizedCommand) || /\bvite\b/.test(normalizedCommand) && /\bbuild\b/.test(normalizedCommand)) return 'normal'
  return 'rejected'
}

function codexEnvironmentIdFromFileName(fileName) {
  const base = String(fileName || '').replace(/\.toml$/i, '').trim().toLowerCase()
  const slug = base.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return slug || 'environment'
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
      const cwd = typeof entry.cwd === 'string' && entry.cwd ? entry.cwd : ''
      const pathApi = process.platform === 'win32' ? path.win32 : path
      if (!project?.roots?.length || !cwd) return { errorCode: 'cwd-missing', message: '无法解析会话工作目录' }
      const configRoot = project.roots[0]
      if (!configRoot) return { errorCode: 'cwd-missing', message: '无法解析会话工作目录' }
      if (!pathApi.isAbsolute(cwd)) return { errorCode: 'cwd-missing', message: '无法解析会话工作目录' }
      return { configRoot, executionCwd: cwd, projectKey: project.key, kind: 'task' }
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
      if (project?.roots?.[0]) {
        const configRoot = project.roots[0]
        return { configRoot, executionCwd: configRoot, projectKey: project.key, kind: 'project' }
      }
    } catch {}
    return { errorCode: 'cwd-missing', message: '无法解析项目根目录' }
  }
  return { errorCode: 'invalid-request', message: '目标别名无效' }
}

function rememberCodexEnvironmentCommands(vaultKey, environments) {
  const key = String(vaultKey || '')
  if (!key) return
  const map = new Map()
  for (const environment of environments) {
    const actionMap = new Map()
    for (const action of environment._hostActions || []) actionMap.set(action.id, action)
    map.set(environment.id, actionMap)
  }
  codexEnvironmentCommandVault.set(key, map)
}

function listCodexProjectEnvironments(targetAlias) {
  const resolved = resolveCodexEnvironmentTargetCwd(targetAlias)
  if (resolved.errorCode) {
    return { outcome: 'failed', errorCode: resolved.errorCode, message: resolved.message, environments: [] }
  }
  const envDir = path.join(resolved.configRoot, '.codex', 'environments')
  let entries = []
  try {
    entries = fs.readdirSync(envDir, { withFileTypes: true })
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (code === 'ENOENT') {
      return { outcome: 'ok', projectKey: resolved.projectKey, environments: [], message: '未发现 Environment 配置' }
    }
    return { outcome: 'failed', errorCode: 'unreadable', message: '无法读取 Environment 配置', environments: [] }
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
      return { outcome: 'failed', errorCode: 'environment-id-collision', message: 'Environment 标识冲突，请检查文件名', environments: [] }
    }
    seenEnvironmentIds.add(id)
    const seen = new Set()
    const hostActions = []
    const actions = []
    parsed.actions.forEach((action, index) => {
      let actionId = codexEnvironmentActionIdFromName(action.name, index)
      if (seen.has(actionId)) actionId = `${actionId}-${index + 1}`
      seen.add(actionId)
      const risk = classifyCodexEnvironmentActionRiskHost(action.name, action.command)
      if (risk === 'rejected') return
      const commandFingerprint = crypto.createHash('sha256').update(String(action.command || '')).digest('hex')
      hostActions.push({ id: actionId, name: action.name, icon: action.icon || 'run', command: action.command, risk, environmentFileFingerprint, commandFingerprint })
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
  rememberCodexEnvironmentCommands(targetAlias, environments)
  return {
    outcome: 'ok',
    projectKey: resolved.projectKey,
    environments: environments.map((item) => ({
      id: item.id,
      name: item.name,
      setupScriptPresent: item.setupScriptPresent,
      actions: item.actions
    }))
  }
}

function codexEnvironmentSessionKey(targetAlias, environmentId, actionId) {
  return `${targetAlias}\0${environmentId}\0${actionId}`
}

function sanitizeCodexEnvironmentSession(session) {
  if (!session) return null
  return {
    targetAlias: typeof session.targetAlias === 'string' && session.targetAlias ? session.targetAlias : (typeof session.projectKey === 'string' ? session.projectKey : ''),
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
  const targetAlias = typeof input?.targetAlias === 'string'
    ? input.targetAlias
    : (typeof input?.projectKey === 'string' ? input.projectKey : '')
  const environmentId = typeof input?.environmentId === 'string' ? input.environmentId : ''
  const actionId = typeof input?.actionId === 'string' ? input.actionId : ''
  const key = codexEnvironmentSessionKey(targetAlias, environmentId, actionId)
  const session = codexEnvironmentActionSessions.get(key)
  if (!session) return { outcome: 'failed', errorCode: 'not-running', message: '没有运行中的 Action 会话' }
  if (session.state === 'stopping') return { outcome: 'stopping', session: sanitizeCodexEnvironmentSession(session) }
  session.state = 'stopping'
  session.message = '正在停止 Serve'
  try {
    if (process.platform !== 'win32' && typeof session.childPid === 'number') {
      process.kill(-session.childPid, 'SIGTERM')
    } else {
      session.child?.kill?.('SIGTERM')
    }
  } catch {}
  return { outcome: 'stopping', session: sanitizeCodexEnvironmentSession(session) }
}

function issueCodexEnvironmentConfirmToken(targetAlias, environmentId, actionId, environmentFileFingerprint, commandFingerprint) {
  const token = `cet_${crypto.randomBytes(12).toString('base64url')}`
  codexEnvironmentConfirmTokens.set(token, {
    targetAlias,
    environmentId,
    actionId,
    environmentFileFingerprint,
    commandFingerprint,
    expiresAt: Date.now() + CODEX_ENV_ACTION_CONFIRM_TTL_MS
  })
  return token
}

function consumeCodexEnvironmentConfirmToken(token, targetAlias, environmentId, actionId, environmentFileFingerprint, commandFingerprint) {
  const entry = codexEnvironmentConfirmTokens.get(token)
  codexEnvironmentConfirmTokens.delete(token)
  if (!entry || entry.expiresAt <= Date.now()) return false
  return (
    entry.targetAlias === targetAlias &&
    entry.environmentId === environmentId &&
    entry.actionId === actionId &&
    entry.environmentFileFingerprint === environmentFileFingerprint &&
    entry.commandFingerprint === commandFingerprint
  )
}

async function runCodexProjectEnvironmentAction(input) {
  const targetAlias = typeof input?.targetAlias === 'string' ? input.targetAlias : ''
  const environmentId = typeof input?.environmentId === 'string' ? input.environmentId.slice(0, 64) : ''
  const actionId = typeof input?.actionId === 'string' ? input.actionId.slice(0, 80) : ''
  const confirmToken = typeof input?.confirmToken === 'string' ? input.confirmToken : ''
  const stopIfRunning = input?.stopIfRunning === true
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
  let vault = codexEnvironmentCommandVault.get(targetAlias)
  if (!vault) {
    listCodexProjectEnvironments(targetAlias)
    vault = codexEnvironmentCommandVault.get(targetAlias)
  }
  const hostAction = vault?.get(environmentId)?.get(actionId)
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
  const sessionKey = codexEnvironmentSessionKey(targetAlias, environmentId, actionId)
  const existing = codexEnvironmentActionSessions.get(sessionKey)
  if (hostAction.risk === 'long-running') {
    if (existing?.state === 'running') {
      const existingEnvironmentFileFingerprint = typeof existing.environmentFileFingerprint === 'string' ? existing.environmentFileFingerprint : ''
      const existingCommandFingerprint = typeof existing.commandFingerprint === 'string' ? existing.commandFingerprint : ''
      if ((existingEnvironmentFileFingerprint && existingCommandFingerprint) && (existingEnvironmentFileFingerprint !== environmentFileFingerprint || existingCommandFingerprint !== commandFingerprint)) {
        return {
          outcome: 'rejected',
          errorCode: 'session-fingerprint-mismatch',
          message: 'Serve 运行的命令/环境指纹与当前 Action 不一致，请先停止该会话后重试'
        }
      }
      if (stopIfRunning) return stopCodexEnvironmentActionSession({ targetAlias, projectKey: resolved.projectKey, environmentId, actionId })
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
    if (!confirmToken || !consumeCodexEnvironmentConfirmToken(confirmToken, targetAlias, environmentId, actionId, environmentFileFingerprint, commandFingerprint)) {
      const token = issueCodexEnvironmentConfirmToken(targetAlias, environmentId, actionId, environmentFileFingerprint, commandFingerprint)
      return {
        outcome: 'confirm-required',
        errorCode: 'confirm-required',
        message: 'Git Push 会写入远程仓库，请再次确认',
        confirmToken: token,
        risk: 'external-write'
      }
    }
  }
  const normalizedCommand = String(hostAction.command || '').trim().toLowerCase()
  const unsafeShell = /[;\n\r`]|&&|\|\||\|/.test(normalizedCommand)
  if (hostAction.risk === 'normal') {
    if (unsafeShell || (!/^\s*(pnpm|npm|yarn|bun)\s+run\s+build\b/.test(normalizedCommand) && !/^\s*vite\b.*\bbuild\b/.test(normalizedCommand))) {
      return { outcome: 'rejected', errorCode: 'action-not-allowed', message: '该 Action 不在允许列表中' }
    }
  } else if (hostAction.risk === 'long-running') {
    if (unsafeShell || (!/^\s*(pnpm|npm|yarn|bun)\s+run\s+serve\b/.test(normalizedCommand) && !/^\s*vite\b.*\bserve\b/.test(normalizedCommand))) {
      return { outcome: 'rejected', errorCode: 'action-not-allowed', message: '该 Action 不在允许列表中' }
    }
  } else if (hostAction.risk === 'external-write') {
    if (unsafeShell || !/^\s*git\s+push\b/.test(normalizedCommand)) {
      return { outcome: 'rejected', errorCode: 'action-not-allowed', message: '该 Action 不在允许列表中' }
    }
  }
  const tokenizeCodexEnvironmentCommandToArgv = (command) => {
    if (typeof command !== 'string') return []
    const result = []
    let current = ''
    let quote = null
    let escaped = false
    for (let i = 0; i < command.length; i += 1) {
      const ch = command[i]
      if (escaped) {
        current += ch
        escaped = false
        continue
      }
      if (quote) {
        if (ch === '\\' && quote === '"') { escaped = true; continue }
        if (ch === quote) { quote = null; continue }
        current += ch
        continue
      }
      if (ch === '"' || ch === "'") { quote = ch; continue }
      if (ch === '\\') { escaped = true; continue }
      if (/\s/.test(ch)) {
        if (current) { result.push(current); current = '' }
        continue
      }
      current += ch
    }
    if (quote) return []
    if (current) result.push(current)
    return result
  }
  const argv = tokenizeCodexEnvironmentCommandToArgv(hostAction.command)
  if (!argv.length || !argv[0]) return { outcome: 'rejected', errorCode: 'invalid-command', message: '该 Action 不可执行' }
  if (hostAction.risk === 'long-running') {
    let child
    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd: resolved.executionCwd,
        env: process.env,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore']
      })
    } catch {
      return { outcome: 'failed', errorCode: 'spawn-failed', message: '无法启动 Serve' }
    }
    const session = {
      targetAlias,
      projectKey: resolved.projectKey,
      environmentId,
      actionId,
      environmentFileFingerprint,
      commandFingerprint,
      state: 'running',
      startedAt: Date.now(),
      message: 'Serve 已启动',
      child,
      childPid: typeof child?.pid === 'number' ? child.pid : undefined,
    }
    codexEnvironmentActionSessions.set(sessionKey, session)
    child.on?.('exit', (code) => {
      const current = codexEnvironmentActionSessions.get(sessionKey)
      if (!current || current.child !== child) return
      current.state = 'idle'
      current.exitCode = typeof code === 'number' ? code : 0
      current.message = code === 0 ? 'Serve 已结束' : `Serve 已退出（${code}）`
      current.child = null
    })
    child.on?.('error', () => {
      const current = codexEnvironmentActionSessions.get(sessionKey)
      if (!current || current.child !== child) return
      current.state = 'idle'
      current.exitCode = undefined
      current.message = 'Serve 启动失败'
      current.child = null
    })
    return { outcome: 'started', session: sanitizeCodexEnvironmentSession(session) }
  }
  const nonLongTimeoutMs = 10 * 60_000
  const result = await new Promise((resolvePromise) => {
    let done = false
    let graceTimeoutId = null
    let child
    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd: resolved.executionCwd,
        env: process.env,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore']
      })
    } catch {
      resolvePromise({ outcome: 'failed', errorCode: 'spawn-failed', exitCode: undefined, message: '命令启动失败' })
      return
    }
    const timeoutId = setTimeout(() => {
      if (done) return
      try {
        if (process.platform !== 'win32' && typeof child?.pid === 'number') process.kill(-child.pid, 'SIGTERM')
        else child?.kill?.('SIGTERM')
      } catch {}
      graceTimeoutId = setTimeout(() => {
        if (done) return
        done = true
        resolvePromise({ outcome: 'failed', errorCode: 'command-timeout', exitCode: undefined, message: '命令执行超时' })
      }, 2_500)
    }, nonLongTimeoutMs)
    child.on?.('exit', (code) => {
      if (done) return
      done = true
      clearTimeout(timeoutId)
      if (graceTimeoutId) clearTimeout(graceTimeoutId)
      const exitCode = typeof code === 'number' ? code : 0
      resolvePromise({
        outcome: exitCode === 0 ? 'ok' : 'failed',
        errorCode: exitCode === 0 ? undefined : 'command-exit',
        exitCode,
        message: exitCode === 0 ? '已完成' : `命令退出（${exitCode}）`
      })
    })
    child.on?.('error', () => {
      if (done) return
      done = true
      clearTimeout(timeoutId)
      if (graceTimeoutId) clearTimeout(graceTimeoutId)
      resolvePromise({ outcome: 'failed', errorCode: 'spawn-error', exitCode: undefined, message: '命令启动失败' })
    })
  })
  return result
}

window.eypcPlatform = {
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
    capabilities: windowCapabilities,
    list: listWindows,
    activate: activateWindow,
    inspectEnvironment: inspectWindowEnvironment,
    alwaysOnTop: alwaysOnTopWindow,
    close: closeWindow,
    terminate: terminateWindow,
    openPermissionSettings: openWindowPermissionSettings
  },
  files: {
    capabilities: favoriteFileCapabilities(),
    open: openFavoritePath,
    reveal: revealFavoritePath,
    copyPath: copyFavoritePath,
    copyItems: copyFavoriteItems,
    inspectPaths: inspectFavoritePaths,
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
    openThread: openCodexThread,
    createThread: createCodexThread,
    openBlank: openCodexBlank,
    archiveThread: archiveCodexThread,
    archiveProject: archiveCodexProject,
    removeProject: removeCodexProject,
    listProjectEnvironments: listCodexProjectEnvironments,
    runProjectAction: runCodexProjectEnvironmentAction,
    listActionSessions: listCodexEnvironmentActionSessions,
    stopActionSession: stopCodexEnvironmentActionSession,
    close: closeCodexConnections
  },
  float: {
    sync: syncCodexFloat,
    activate: activateCodexFloat,
    diagnostics: getCodexFloatWorkspaceDiagnostics,
    resetGeometry: resetCodexFloatGeometry,
    close() {
      codexFloatPersistent = false
      closeCodexFloat()
    },
    onAction(listener) {
      if (typeof listener !== 'function') return () => {}
      codexFloatActionListeners.add(listener)
      return () => codexFloatActionListeners.delete(listener)
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
