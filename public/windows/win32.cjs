'use strict'

const WINDOWS_ENUM_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public sealed class EypcWindowInfo {
  public string instanceId { get; set; }
  public string nativeRef { get; set; }
  public int pid { get; set; }
  public string rootInstanceId { get; set; }
  public string rootNativeRef { get; set; }
  public int rootPid { get; set; }
  public string appId { get; set; }
  public string appName { get; set; }
  public string title { get; set; }
  public bool minimized { get; set; }
  public bool focused { get; set; }
  public string relationship { get; set; }
  public string relationEvidence { get; set; }
  public bool userVisible { get; set; }
  public bool canActivate { get; set; }
  public bool canClose { get; set; }
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
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [StructLayout(LayoutKind.Sequential)] public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  const int GWL_STYLE = -16;
  const int GWL_EXSTYLE = -20;
  const uint GA_ROOT = 2;
  const uint GA_ROOTOWNER = 3;
  const uint WS_EX_TOOLWINDOW = 0x00000080;
  const uint WS_EX_APPWINDOW = 0x00040000;
  const uint WS_EX_NOACTIVATE = 0x08000000;
  const uint WS_EX_TRANSPARENT = 0x00000020;
  const uint WS_CHILD = 0x40000000;

  static bool IsCloaked(IntPtr hWnd) {
    try {
      int cloaked = 0;
      if (DwmGetWindowAttribute(hWnd, 14, out cloaked, 4) != 0) return false;
      return cloaked != 0;
    } catch { return false; }
  }

  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);

  static bool HasUserBounds(IntPtr hWnd) {
    RECT rect;
    return GetWindowRect(hWnd, out rect) && rect.Right - rect.Left > 1 && rect.Bottom - rect.Top > 1;
  }

  static bool IsSystemHelperProcess(string appName) {
    return String.Equals(appName, "dwm", StringComparison.OrdinalIgnoreCase)
      || String.Equals(appName, "ShellExperienceHost", StringComparison.OrdinalIgnoreCase)
      || String.Equals(appName, "StartMenuExperienceHost", StringComparison.OrdinalIgnoreCase)
      || String.Equals(appName, "SearchHost", StringComparison.OrdinalIgnoreCase)
      || String.Equals(appName, "TextInputHost", StringComparison.OrdinalIgnoreCase)
      || String.Equals(appName, "LockApp", StringComparison.OrdinalIgnoreCase);
  }

  static bool IsActionableWindow(IntPtr hWnd) {
    if (!IsWindow(hWnd) || !IsWindowVisible(hWnd) || IsCloaked(hWnd)) return false;
    if (!HasUserBounds(hWnd)) return false;
    if ((unchecked((uint)GetWindowLong(hWnd, GWL_STYLE)) & WS_CHILD) != 0) return false;
    var exStyle = unchecked((uint)GetWindowLong(hWnd, GWL_EXSTYLE));
    var appWindow = (exStyle & WS_EX_APPWINDOW) != 0;
    if ((exStyle & WS_EX_TOOLWINDOW) != 0 && !appWindow) return false;
    if ((exStyle & WS_EX_NOACTIVATE) != 0) return false;
    if ((exStyle & WS_EX_TRANSPARENT) != 0) return false;
    if (GetAncestor(hWnd, GA_ROOT) != hWnd) return false;
    return true;
  }

  static bool IsVisibleMemberWindow(IntPtr hWnd) {
    if (!IsWindow(hWnd) || !IsWindowVisible(hWnd) || IsCloaked(hWnd) || !HasUserBounds(hWnd)) return false;
    if (GetAncestor(hWnd, GA_ROOT) != hWnd) return false;
    if ((unchecked((uint)GetWindowLong(hWnd, GWL_STYLE)) & WS_CHILD) != 0) return false;
    var exStyle = unchecked((uint)GetWindowLong(hWnd, GWL_EXSTYLE));
    if ((exStyle & WS_EX_NOACTIVATE) != 0 || (exStyle & WS_EX_TRANSPARENT) != 0) return false;
    return true;
  }

  public static List<EypcWindowInfo> ListWindows() {
    var rows = new List<EypcWindowInfo>();
    var foreground = GetForegroundWindow();
    var excludedPid = __EYPC_HOST_PID__;
    var excludedParentPid = __EYPC_PARENT_PID__;
    EnumWindows(delegate(IntPtr hWnd, IntPtr ignored) {
      // Observe visible owned members as family evidence. Product eligibility is
      // decided on the resolved root, so an active dialog cannot split the root.
      if (!IsVisibleMemberWindow(hWnd)) return true;
      var length = GetWindowTextLength(hWnd);
      var titleBuilder = new StringBuilder(Math.Min(Math.Max(length + 1, 2), 8192));
      GetWindowText(hWnd, titleBuilder, titleBuilder.Capacity);
      var title = titleBuilder.ToString().Trim();
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
      if (IsSystemHelperProcess(appName)) return true;
      var root = GetAncestor(hWnd, GA_ROOTOWNER);
      if (root == IntPtr.Zero || !IsWindow(root)) root = hWnd;
      uint rawRootPid;
      GetWindowThreadProcessId(root, out rawRootPid);
      var rootPid = unchecked((int)rawRootPid);
      if (rootPid <= 0 || rootPid == excludedPid || rootPid == excludedParentPid) return true;
      string rootAppName;
      try {
        using (var rootProcess = Process.GetProcessById(rootPid)) {
          if (rootProcess.HasExited) return true;
          rootAppName = rootProcess.ProcessName;
        }
      } catch { return true; }
      // Owner relationships across applications are not a safe product-family proof.
      if (!String.Equals(rootAppName, appName, StringComparison.OrdinalIgnoreCase)) {
        if (!IsActionableWindow(hWnd)) return true;
        root = hWnd;
        rootPid = pid;
        rootAppName = appName;
      } else if (!IsActionableWindow(root)) {
        return true;
      }
      rows.Add(new EypcWindowInfo {
        instanceId = "win32:" + pid.ToString() + ":" + hWnd.ToInt64().ToString(),
        nativeRef = hWnd.ToInt64().ToString(),
        pid = pid,
        rootInstanceId = "win32:" + rootPid.ToString() + ":" + root.ToInt64().ToString(),
        rootNativeRef = root.ToInt64().ToString(),
        rootPid = rootPid,
        appId = rootAppName,
        appName = rootAppName,
        title = String.IsNullOrWhiteSpace(title) ? rootAppName : title,
        minimized = IsIconic(root),
        focused = foreground == hWnd,
        relationship = root == hWnd ? "root" : "child",
        relationEvidence = root == hWnd ? "root-self" : "win32-root-owner",
        userVisible = true,
        canActivate = true,
        canClose = true
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
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetLastActivePopup(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  static bool HasUserBounds(IntPtr hWnd) {
    RECT rect;
    return GetWindowRect(hWnd, out rect) && rect.Right - rect.Left > 1 && rect.Bottom - rect.Top > 1;
  }
  public static bool IsActionableMember(IntPtr hWnd) {
    if (!IsWindow(hWnd) || !IsWindowVisible(hWnd) || GetAncestor(hWnd, 2) != hWnd || !HasUserBounds(hWnd)) return false;
    try { int cloaked = 0; if (DwmGetWindowAttribute(hWnd, 14, out cloaked, 4) == 0 && cloaked != 0) return false; } catch {}
    var exStyle = unchecked((uint)GetWindowLong(hWnd, -20));
    return (exStyle & 0x08000000) == 0 && (exStyle & 0x00000020) == 0;
  }
  public static bool IsActionableTopLevel(IntPtr hWnd) {
    if (!IsActionableMember(hWnd)) return false;
    var exStyle = unchecked((uint)GetWindowLong(hWnd, -20));
    var appWindow = (exStyle & 0x00040000) != 0;
    if ((exStyle & 0x00000080) != 0 && !appWindow) return false;
    return true;
  }
  public static IntPtr ResolveActivationTarget(IntPtr root) {
    var candidate = root;
    for (var depth = 0; depth < 32; depth += 1) {
      var popup = GetLastActivePopup(candidate);
      if (popup == IntPtr.Zero || popup == candidate) break;
      candidate = popup;
      if (IsWindowVisible(candidate)) break;
    }
    return IsWindow(candidate) && IsWindowVisible(candidate) ? candidate : root;
  }
}
'@
$debugTrace = [string]::Equals([Environment]::GetEnvironmentVariable('EYPC_WINDOW_DEBUG_TRACE'), '1', [System.StringComparison]::Ordinal)
$expectedInstanceId = [Environment]::GetEnvironmentVariable('EYPC_WINDOW_INSTANCE_ID')
$expectedAppId = [Environment]::GetEnvironmentVariable('EYPC_WINDOW_TARGET_APP_ID')
$trace = New-Object System.Collections.Generic.List[object]
function Add-EypcTrace([string] $stage, [string] $outcome, [string] $detail = '') {
  if ($debugTrace -and $trace.Count -lt 16) {
    $entry = @{ stage = $stage; outcome = $outcome }
    if ($detail) { $entry.detail = $detail }
    [void]$trace.Add([pscustomobject]$entry)
  }
}
function Write-EypcOutcome([string] $outcome, [string] $reasonCode = '', [string] $instanceId = '') {
  $payload = @{ outcome = $outcome }
  if ($reasonCode) { $payload.reasonCode = $reasonCode }
  if ($instanceId) { $payload.instanceId = $instanceId }
  if ($debugTrace) { $payload.trace = @($trace.ToArray()) }
  $payload | ConvertTo-Json -Compress -Depth 4
}
$handle = [IntPtr]::new(__EYPC_WINDOW_HANDLE__)
if (-not [EypcWindowActivator]::IsActionableTopLevel($handle)) {
  Add-EypcTrace 'target' 'not-found'
  Write-EypcOutcome 'not-found'
  exit 0
}
[uint32]$ownerPid = 0
if ([EypcWindowActivator]::GetWindowThreadProcessId($handle, [ref]$ownerPid) -eq 0 -or $ownerPid -le 0) {
  Add-EypcTrace 'target' 'unavailable' 'instance-mismatch'
  Write-EypcOutcome 'not-found' 'identity-unavailable'
  exit 0
}
try { $ownerAppId = (Get-Process -Id $ownerPid -ErrorAction Stop).ProcessName } catch {
  Add-EypcTrace 'process' 'not-found'
  Write-EypcOutcome 'not-found'
  exit 0
}
$instanceId = 'win32:' + [string]$ownerPid + ':' + [string]$handle.ToInt64()
$appMatches = -not $expectedAppId -or [string]::Equals($expectedAppId, $ownerAppId, [System.StringComparison]::OrdinalIgnoreCase)
$instanceMatches = -not $expectedInstanceId -or [string]::Equals($expectedInstanceId, $instanceId, [System.StringComparison]::Ordinal)
if (-not $appMatches -or -not $instanceMatches) {
  Add-EypcTrace 'target' 'not-found' 'instance-mismatch'
  Write-EypcOutcome 'not-found' 'instance-mismatch'
  exit 0
}
Add-EypcTrace 'target' 'ok' 'instance-match'
$activationHandle = [EypcWindowActivator]::ResolveActivationTarget($handle)
if (-not [EypcWindowActivator]::IsActionableMember($activationHandle)) {
  Add-EypcTrace 'target' 'not-found'
  Write-EypcOutcome 'not-found' 'instance-mismatch'
  exit 0
}
$activationRoot = [EypcWindowActivator]::GetAncestor($activationHandle, 3)
if ($activationRoot -eq [IntPtr]::Zero) { $activationRoot = $activationHandle }
[uint32]$activationPid = 0
[void][EypcWindowActivator]::GetWindowThreadProcessId($activationHandle, [ref]$activationPid)
try { $activationAppId = (Get-Process -Id $activationPid -ErrorAction Stop).ProcessName } catch {
  Write-EypcOutcome 'not-found' 'identity-unavailable'
  exit 0
}
if ($activationRoot -ne $handle -or -not [string]::Equals($ownerAppId, $activationAppId, [System.StringComparison]::OrdinalIgnoreCase)) {
  Add-EypcTrace 'target' 'not-found' 'instance-mismatch'
  Write-EypcOutcome 'not-found' 'instance-mismatch'
  exit 0
}
if ([EypcWindowActivator]::IsIconic($activationHandle)) {
  [void][EypcWindowActivator]::ShowWindow($activationHandle, 9)
  if ([EypcWindowActivator]::IsIconic($activationHandle)) {
    Add-EypcTrace 'restore' 'failed'
    Write-EypcOutcome 'failed'
    exit 0
  }
  Add-EypcTrace 'restore' 'ok'
} else {
  Add-EypcTrace 'restore' 'skipped'
}
if ([EypcWindowActivator]::SetForegroundWindow($activationHandle)) {
  [System.Threading.Thread]::Sleep(20)
  $foreground = [EypcWindowActivator]::GetForegroundWindow()
  $foregroundRoot = if ($foreground -eq [IntPtr]::Zero) { [IntPtr]::Zero } else { [EypcWindowActivator]::GetAncestor($foreground, 3) }
  if ($foregroundRoot -eq [IntPtr]::Zero) { $foregroundRoot = $foreground }
  if ($foregroundRoot -eq $handle) {
    Add-EypcTrace 'foreground' 'ok' 'root-family-match'
    Write-EypcOutcome 'activated' '' $instanceId
  } else {
    Add-EypcTrace 'verify' 'failed' 'instance-mismatch'
    Write-EypcOutcome 'focus-denied' 'instance-mismatch'
  }
} else {
  Add-EypcTrace 'foreground' 'denied'
  Write-EypcOutcome 'focus-denied'
}
`

const WINDOWS_ACTIVATE_MEMBER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EypcWindowMemberActivator {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  public static bool IsVisibleActionable(IntPtr hWnd) {
    RECT rect;
    if (!IsWindow(hWnd) || !IsWindowVisible(hWnd) || GetAncestor(hWnd, 2) != hWnd || !GetWindowRect(hWnd, out rect) || rect.Right - rect.Left <= 1 || rect.Bottom - rect.Top <= 1) return false;
    try { int cloaked = 0; if (DwmGetWindowAttribute(hWnd, 14, out cloaked, 4) == 0 && cloaked != 0) return false; } catch {}
    var exStyle = unchecked((uint)GetWindowLong(hWnd, -20));
    return (exStyle & 0x08000000) == 0 && (exStyle & 0x00000020) == 0;
  }
  public static bool IsActionableRoot(IntPtr hWnd) {
    if (!IsVisibleActionable(hWnd)) return false;
    var exStyle = unchecked((uint)GetWindowLong(hWnd, -20));
    var appWindow = (exStyle & 0x00040000) != 0;
    return (exStyle & 0x00000080) == 0 || appWindow;
  }
}
'@
$debugTrace = [string]::Equals([Environment]::GetEnvironmentVariable('EYPC_WINDOW_DEBUG_TRACE'), '1', [System.StringComparison]::Ordinal)
$expectedAppId = [Environment]::GetEnvironmentVariable('EYPC_WINDOW_TARGET_APP_ID')
$expectedRootInstanceId = [Environment]::GetEnvironmentVariable('EYPC_WINDOW_INSTANCE_ID')
$expectedMemberInstanceId = [Environment]::GetEnvironmentVariable('EYPC_WINDOW_MEMBER_INSTANCE_ID')
$trace = New-Object System.Collections.Generic.List[object]
function Add-EypcTrace([string] $stage, [string] $outcome, [string] $detail = '') {
  if ($debugTrace -and $trace.Count -lt 16) {
    $entry = @{ stage = $stage; outcome = $outcome }
    if ($detail) { $entry.detail = $detail }
    [void]$trace.Add([pscustomobject]$entry)
  }
}
function Write-EypcOutcome([string] $outcome, [string] $reasonCode = '', [string] $rootInstanceId = '', [string] $memberInstanceId = '') {
  $payload = @{ outcome = $outcome }
  if ($reasonCode) { $payload.reasonCode = $reasonCode }
  if ($rootInstanceId) { $payload.instanceId = $rootInstanceId }
  if ($memberInstanceId) { $payload.memberInstanceId = $memberInstanceId }
  if ($debugTrace) { $payload.trace = @($trace.ToArray()) }
  $payload | ConvertTo-Json -Compress -Depth 4
}
$root = [IntPtr]::new(__EYPC_WINDOW_HANDLE__)
$member = [IntPtr]::new(__EYPC_WINDOW_MEMBER_HANDLE__)
if (-not [EypcWindowMemberActivator]::IsActionableRoot($root) -or -not [EypcWindowMemberActivator]::IsVisibleActionable($member)) {
  Add-EypcTrace 'target' 'not-found'
  Write-EypcOutcome 'not-found' 'member-mismatch'
  exit 0
}
$verifiedRoot = [EypcWindowMemberActivator]::GetAncestor($member, 3)
if ($verifiedRoot -eq [IntPtr]::Zero) { $verifiedRoot = $member }
if ($verifiedRoot -ne $root) {
  Add-EypcTrace 'target' 'not-found' 'instance-mismatch'
  Write-EypcOutcome 'not-found' 'member-mismatch'
  exit 0
}
[uint32]$rootPid = 0
[uint32]$memberPid = 0
[void][EypcWindowMemberActivator]::GetWindowThreadProcessId($root, [ref]$rootPid)
[void][EypcWindowMemberActivator]::GetWindowThreadProcessId($member, [ref]$memberPid)
try {
  $rootAppId = (Get-Process -Id $rootPid -ErrorAction Stop).ProcessName
  $memberAppId = (Get-Process -Id $memberPid -ErrorAction Stop).ProcessName
} catch {
  Write-EypcOutcome 'not-found' 'identity-unavailable'
  exit 0
}
$rootInstanceId = 'win32:' + [string]$rootPid + ':' + [string]$root.ToInt64()
$memberInstanceId = 'win32:' + [string]$memberPid + ':' + [string]$member.ToInt64()
$identityMatches = [string]::Equals($rootAppId, $memberAppId, [System.StringComparison]::OrdinalIgnoreCase) -and
  (-not $expectedAppId -or [string]::Equals($expectedAppId, $rootAppId, [System.StringComparison]::OrdinalIgnoreCase)) -and
  (-not $expectedRootInstanceId -or [string]::Equals($expectedRootInstanceId, $rootInstanceId, [System.StringComparison]::Ordinal)) -and
  (-not $expectedMemberInstanceId -or [string]::Equals($expectedMemberInstanceId, $memberInstanceId, [System.StringComparison]::Ordinal))
if (-not $identityMatches) {
  Add-EypcTrace 'target' 'not-found' 'instance-mismatch'
  Write-EypcOutcome 'not-found' 'member-mismatch'
  exit 0
}
Add-EypcTrace 'target' 'ok' 'root-family-match'
if ([EypcWindowMemberActivator]::IsIconic($member)) { [void][EypcWindowMemberActivator]::ShowWindow($member, 9) }
if (-not [EypcWindowMemberActivator]::SetForegroundWindow($member)) {
  Add-EypcTrace 'foreground' 'denied'
  Write-EypcOutcome 'focus-denied'
  exit 0
}
[System.Threading.Thread]::Sleep(20)
$foreground = [EypcWindowMemberActivator]::GetForegroundWindow()
$foregroundRoot = if ($foreground -eq [IntPtr]::Zero) { [IntPtr]::Zero } else { [EypcWindowMemberActivator]::GetAncestor($foreground, 3) }
if ($foregroundRoot -eq [IntPtr]::Zero) { $foregroundRoot = $foreground }
if ($foreground -eq $member -and $foregroundRoot -eq $root) {
  Add-EypcTrace 'verify' 'ok' 'root-family-match'
  Write-EypcOutcome 'activated' '' $rootInstanceId $memberInstanceId
} else {
  Add-EypcTrace 'verify' 'failed' 'focus-state-mismatch'
  Write-EypcOutcome 'focus-denied' 'member-mismatch'
}
`

const WINDOWS_TOPMOST_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EypcWindowTopmost {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetLastActivePopup(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  public static bool IsActionableTopLevel(IntPtr hWnd) {
    RECT rect;
    if (!IsWindow(hWnd) || !IsWindowVisible(hWnd) || GetAncestor(hWnd, 2) != hWnd || !GetWindowRect(hWnd, out rect) || rect.Right - rect.Left <= 1 || rect.Bottom - rect.Top <= 1) return false;
    try { int cloaked = 0; if (DwmGetWindowAttribute(hWnd, 14, out cloaked, 4) == 0 && cloaked != 0) return false; } catch {}
    var exStyle = unchecked((uint)GetWindowLong(hWnd, -20));
    var appWindow = (exStyle & 0x00040000) != 0;
    if ((exStyle & 0x00000080) != 0 && !appWindow) return false;
    if ((exStyle & 0x08000000) != 0 || (exStyle & 0x00000020) != 0) return false;
    return true;
  }
  public static IntPtr ResolveActivationTarget(IntPtr root) {
    var candidate = root;
    for (var depth = 0; depth < 32; depth += 1) {
      var popup = GetLastActivePopup(candidate);
      if (popup == IntPtr.Zero || popup == candidate) break;
      candidate = popup;
      if (IsWindowVisible(candidate)) break;
    }
    return IsWindow(candidate) && IsWindowVisible(candidate) ? candidate : root;
  }
}
'@
$debugTrace = [string]::Equals([Environment]::GetEnvironmentVariable('EYPC_WINDOW_DEBUG_TRACE'), '1', [System.StringComparison]::Ordinal)
$expectedInstanceId = [Environment]::GetEnvironmentVariable('EYPC_WINDOW_INSTANCE_ID')
$expectedAppId = [Environment]::GetEnvironmentVariable('EYPC_WINDOW_TARGET_APP_ID')
$trace = New-Object System.Collections.Generic.List[object]
function Add-EypcTrace([string] $stage, [string] $outcome, [string] $detail = '') {
  if ($debugTrace -and $trace.Count -lt 16) {
    $entry = @{ stage = $stage; outcome = $outcome }
    if ($detail) { $entry.detail = $detail }
    [void]$trace.Add([pscustomobject]$entry)
  }
}
function Write-EypcOutcome([string] $outcome, [string] $reasonCode = '', [string] $instanceId = '') {
  $payload = @{ outcome = $outcome }
  if ($reasonCode) { $payload.reasonCode = $reasonCode }
  if ($instanceId) { $payload.instanceId = $instanceId }
  if ($debugTrace) { $payload.trace = @($trace.ToArray()) }
  $payload | ConvertTo-Json -Compress -Depth 4
}
$handle = [IntPtr]::new(__EYPC_WINDOW_HANDLE__)
if (-not [EypcWindowTopmost]::IsActionableTopLevel($handle)) {
  Add-EypcTrace 'target' 'not-found'
  Write-EypcOutcome 'not-found'
  exit 0
}
[uint32]$ownerPid = 0
if ([EypcWindowTopmost]::GetWindowThreadProcessId($handle, [ref]$ownerPid) -eq 0 -or $ownerPid -le 0) {
  Add-EypcTrace 'target' 'unavailable' 'instance-mismatch'
  Write-EypcOutcome 'not-found' 'identity-unavailable'
  exit 0
}
try { $ownerAppId = (Get-Process -Id $ownerPid -ErrorAction Stop).ProcessName } catch {
  Add-EypcTrace 'process' 'not-found'
  Write-EypcOutcome 'not-found'
  exit 0
}
$instanceId = 'win32:' + [string]$ownerPid + ':' + [string]$handle.ToInt64()
$appMatches = -not $expectedAppId -or [string]::Equals($expectedAppId, $ownerAppId, [System.StringComparison]::OrdinalIgnoreCase)
$instanceMatches = -not $expectedInstanceId -or [string]::Equals($expectedInstanceId, $instanceId, [System.StringComparison]::Ordinal)
if (-not $appMatches -or -not $instanceMatches) {
  Add-EypcTrace 'target' 'not-found' 'instance-mismatch'
  Write-EypcOutcome 'not-found' 'instance-mismatch'
  exit 0
}
Add-EypcTrace 'target' 'ok' 'instance-match'
$activationHandle = [EypcWindowTopmost]::ResolveActivationTarget($handle)
if ([EypcWindowTopmost]::IsIconic($activationHandle)) {
  [void][EypcWindowTopmost]::ShowWindow($activationHandle, 9)
  if ([EypcWindowTopmost]::IsIconic($activationHandle)) {
    Add-EypcTrace 'restore' 'failed'
    Write-EypcOutcome 'failed'
    exit 0
  }
  Add-EypcTrace 'restore' 'ok'
} else {
  Add-EypcTrace 'restore' 'skipped'
}
# SWP_NOSIZE | SWP_NOMOVE | SWP_SHOWWINDOW; HWND_TOPMOST is -1.
if (-not [EypcWindowTopmost]::SetWindowPos($activationHandle, [IntPtr]::new(-1), 0, 0, 0, 0, 0x0043)) {
  Add-EypcTrace 'topmost' 'failed'
  Write-EypcOutcome 'failed'
  exit 0
}
Add-EypcTrace 'topmost' 'ok'
if ([EypcWindowTopmost]::SetForegroundWindow($activationHandle)) {
  [System.Threading.Thread]::Sleep(20)
  $foreground = [EypcWindowTopmost]::GetForegroundWindow()
  $foregroundRoot = if ($foreground -eq [IntPtr]::Zero) { [IntPtr]::Zero } else { [EypcWindowTopmost]::GetAncestor($foreground, 3) }
  if ($foregroundRoot -eq [IntPtr]::Zero) { $foregroundRoot = $foreground }
  if ($foregroundRoot -eq $handle) {
    Add-EypcTrace 'foreground' 'ok' 'root-family-match'
    Write-EypcOutcome 'activated' '' $instanceId
  } else {
    Add-EypcTrace 'verify' 'failed' 'instance-mismatch'
    Write-EypcOutcome 'focus-denied' 'instance-mismatch'
  }
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
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  public static bool IsAdmittedWindow(IntPtr hWnd) {
    RECT rect;
    if (!IsWindow(hWnd) || !IsWindowVisible(hWnd) || GetAncestor(hWnd, 2) != hWnd || !GetWindowRect(hWnd, out rect) || rect.Right - rect.Left <= 1 || rect.Bottom - rect.Top <= 1) return false;
    try { int cloaked = 0; if (DwmGetWindowAttribute(hWnd, 14, out cloaked, 4) == 0 && cloaked != 0) return false; } catch {}
    var exStyle = unchecked((uint)GetWindowLong(hWnd, -20));
    return (exStyle & 0x08000000) == 0 && (exStyle & 0x00000020) == 0;
  }
  public static bool IsAdmittedRoot(IntPtr hWnd) {
    if (!IsAdmittedWindow(hWnd)) return false;
    var exStyle = unchecked((uint)GetWindowLong(hWnd, -20));
    var appWindow = (exStyle & 0x00040000) != 0;
    return (exStyle & 0x00000080) == 0 || appWindow;
  }
}
'@
$expectedInstanceId = [Environment]::GetEnvironmentVariable('EYPC_WINDOW_INSTANCE_ID')
$expectedAppId = [Environment]::GetEnvironmentVariable('EYPC_WINDOW_TARGET_APP_ID')
$expectedRootRef = [Environment]::GetEnvironmentVariable('EYPC_WINDOW_ROOT_REF')
$handle = [IntPtr]::new(__EYPC_WINDOW_HANDLE__)
if (-not [EypcWindowCloser]::IsAdmittedWindow($handle)) {
  @{ outcome = 'not-found' } | ConvertTo-Json -Compress
  exit 0
}
$rootHandle = [EypcWindowCloser]::GetAncestor($handle, 3)
if ($rootHandle -eq [IntPtr]::Zero) { $rootHandle = $handle }
if ($expectedRootRef) {
  $expectedRootHandle = [IntPtr]::new([long]$expectedRootRef)
  if ($rootHandle -ne $expectedRootHandle) {
    @{ outcome = 'not-found' } | ConvertTo-Json -Compress
    exit 0
  }
} elseif ($rootHandle -ne $handle) {
  @{ outcome = 'not-found' } | ConvertTo-Json -Compress
  exit 0
}
if (-not [EypcWindowCloser]::IsAdmittedRoot($rootHandle)) {
  @{ outcome = 'not-found' } | ConvertTo-Json -Compress
  exit 0
}
[uint32]$ownerPid = 0
if ([EypcWindowCloser]::GetWindowThreadProcessId($handle, [ref]$ownerPid) -eq 0 -or $ownerPid -le 0) {
  @{ outcome = 'not-found' } | ConvertTo-Json -Compress
  exit 0
}
try { $ownerAppId = (Get-Process -Id $ownerPid -ErrorAction Stop).ProcessName } catch {
  @{ outcome = 'not-found' } | ConvertTo-Json -Compress
  exit 0
}
[uint32]$rootOwnerPid = 0
[void][EypcWindowCloser]::GetWindowThreadProcessId($rootHandle, [ref]$rootOwnerPid)
try { $rootOwnerAppId = (Get-Process -Id $rootOwnerPid -ErrorAction Stop).ProcessName } catch {
  @{ outcome = 'not-found' } | ConvertTo-Json -Compress
  exit 0
}
$instanceId = 'win32:' + [string]$ownerPid + ':' + [string]$handle.ToInt64()
if (($expectedInstanceId -and -not [string]::Equals($expectedInstanceId, $instanceId, [System.StringComparison]::Ordinal)) -or
    -not [string]::Equals($rootOwnerAppId, $ownerAppId, [System.StringComparison]::OrdinalIgnoreCase) -or
    ($expectedAppId -and -not [string]::Equals($expectedAppId, $ownerAppId, [System.StringComparison]::OrdinalIgnoreCase))) {
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

/** AX-first inventory. Core Graphics only corroborates exact identity and user-visible bounds. */

const PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EypcWindowProbe {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
$handle = [IntPtr][Int64]::Parse($env:EYPC_WINDOW_HANDLE)
$expectedPid = [UInt32]::Parse($env:EYPC_WINDOW_PID)
$ownerAlive = $null -ne (Get-Process -Id $expectedPid -ErrorAction SilentlyContinue)
$isWindow = [EypcWindowProbe]::IsWindow($handle)
[UInt32]$actualPid = 0
if ($isWindow) { [void][EypcWindowProbe]::GetWindowThreadProcessId($handle, [ref]$actualPid) }
@{ ownerAlive = $ownerAlive; isWindow = $isWindow; actualPid = [UInt64]$actualPid } | ConvertTo-Json -Compress
`

function parseWindow(window) {
  const handle = String(window && window.nativeRef || '').trim()
  const instanceId = String(window && window.instanceId || '').trim()
  const parts = /^win32:(\d{1,12}):(\d{1,20})$/.exec(instanceId)
  if (!/^\d{1,20}$/.test(handle) || !parts || parts[2] !== handle) return null
  return { handle, pid: Number(parts[1]), instanceId }
}

function createWin32WindowPlatform(options = {}) {
  const run = options.run
  const cache = options.cache
  const processApi = options.process && typeof options.process === 'object' ? options.process : process
  const protocol = options.protocol
  if (typeof run !== 'function' || !cache || !protocol) throw new TypeError('run, cache and protocol are required')

  function observeInventory(windows) {
    cache.observeInventory('win32', windows)
  }

  function markActivation(window) {
    if (window && window.platform === 'win32') cache.observe(window, 'native-window')
  }

  async function capabilities() {
    return protocol.capability()
  }

  async function list() {
    const systemRoot = processApi.env && processApi.env.SystemRoot || 'C:\\Windows'
    const script = WINDOWS_ENUM_SCRIPT
      .replace('__EYPC_HOST_PID__', String(processApi.pid || 0))
      .replace('__EYPC_PARENT_PID__', String(processApi.ppid || 0))
    const result = await run(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script])
    if (!result.ok) return { capability: protocol.capability('unknown', '无法读取 Windows 桌面窗口'), windows: [], completeness: 'partial', message: '无法读取 Windows 桌面窗口' }
    const parsed = protocol.parseWindowJson(result.stdout, 'win32')
    observeInventory(parsed.windows)
    return { capability: protocol.capability('granted'), windows: parsed.windows, completeness: 'complete' }
  }

  async function probeInstance(window) {
    const parsed = parseWindow(window)
    const instanceId = parsed ? parsed.instanceId : String(window && window.instanceId || '')
    if (!parsed) return { status: 'indeterminate', instanceId, liveness: 'indeterminate', reason: 'identity-unavailable' }
    const systemRoot = processApi.env && processApi.env.SystemRoot || 'C:\\Windows'
    const result = await run(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PROBE_SCRIPT], false, {
      EYPC_WINDOW_HANDLE: parsed.handle,
      EYPC_WINDOW_PID: String(parsed.pid)
    })
    if (!result.ok) {
      cache.markIndeterminate(window, 'native-query-failed')
      return { status: 'indeterminate', instanceId, liveness: 'indeterminate', reason: 'native-query-failed' }
    }
    let value
    try { value = JSON.parse(String(result.stdout || '').trim() || '{}') } catch {
      cache.markIndeterminate(window, 'native-query-failed')
      return { status: 'indeterminate', instanceId, liveness: 'indeterminate', reason: 'native-query-failed' }
    }
    if (value.ownerAlive !== true) {
      cache.markGone(window, 'owner-exited')
      return { status: 'gone', instanceId, liveness: 'verified-gone', reason: 'owner-exited' }
    }
    if (value.isWindow === true && Number(value.actualPid) === parsed.pid) {
      cache.observe(window, 'native-owner')
      return { status: 'live', instanceId, liveness: 'verified-live', evidence: 'native-owner' }
    }
    if (value.isWindow === true) {
      cache.markGone(window, 'owner-mismatch')
      return { status: 'gone', instanceId, liveness: 'verified-gone', reason: 'owner-mismatch' }
    }
    cache.markGone(window, 'native-window-absent')
    return { status: 'gone', instanceId, liveness: 'verified-gone', reason: 'native-window-absent' }
  }

  async function activate(request, activationOptions = {}) {
    const debugTrace = protocol.debugTraceRequested(activationOptions)
    const payload = request && typeof request === 'object' ? request : {}
    const mode = payload.mode === 'member-exact' ? 'member-exact' : 'root-current'
    const source = payload.root && typeof payload.root === 'object' ? payload.root : payload
    const member = mode === 'member-exact' && payload.member && typeof payload.member === 'object' ? payload.member : null
    const nativeRef = String(source.nativeRef || '').trim()
    if (!/^\d{1,20}$/.test(nativeRef)) {
      return { outcome: 'not-found', message: '窗口句柄无效', ...protocol.optionalTrace(debugTrace, [{ stage: 'target', outcome: 'not-found' }]) }
    }
    const memberNativeRef = String(member && member.nativeRef || '').trim()
    if (mode === 'member-exact' && !/^\d{1,20}$/.test(memberNativeRef)) {
      return { outcome: 'not-found', reasonCode: 'member-mismatch', message: '指定子窗口句柄已失效', ...protocol.optionalTrace(debugTrace, [{ stage: 'target', outcome: 'not-found' }]) }
    }
    const script = (mode === 'member-exact' ? WINDOWS_ACTIVATE_MEMBER_SCRIPT : WINDOWS_ACTIVATE_SCRIPT)
      .replace('__EYPC_WINDOW_HANDLE__', nativeRef)
      .replace('__EYPC_WINDOW_MEMBER_HANDLE__', memberNativeRef || nativeRef)
    const appId = String(source.appId || source.appName || '').replace(/\u0000/g, '').slice(0, 512)
    const sourceInstanceId = String(source.instanceId || '').replace(/\u0000/g, '').slice(0, 512)
    const instanceId = sourceInstanceId.includes(':legacy:') ? '' : sourceInstanceId
    const memberInstanceId = String(member && member.instanceId || '').replace(/\u0000/g, '').slice(0, 512)
    const systemRoot = processApi.env && processApi.env.SystemRoot || 'C:\\Windows'
    const result = await run(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], debugTrace, {
      EYPC_WINDOW_TARGET_APP_ID: appId,
      ...(instanceId ? { EYPC_WINDOW_INSTANCE_ID: instanceId } : {}),
      ...(mode === 'member-exact' && memberInstanceId ? { EYPC_WINDOW_MEMBER_INSTANCE_ID: memberInstanceId } : {})
    })
    if (!result.ok) return { outcome: 'failed', message: 'Windows 无法执行窗口激活', ...protocol.optionalTrace(debugTrace, [{ stage: 'bridge', outcome: 'failed' }]) }
    const activation = protocol.parseActivationResult(result.stdout)
    if (activation.outcome === 'activated') markActivation(source)
    return activation.outcome === 'focus-denied'
      ? { ...activation, message: '系统拒绝聚焦该窗口；EyPc 未尝试绕过前台保护' }
      : activation
  }

  async function alwaysOnTop(window, activationOptions = {}) {
    const debugTrace = protocol.debugTraceRequested(activationOptions)
    const source = window && typeof window === 'object' ? window : {}
    const nativeRef = String(source.nativeRef || '').trim()
    if (!/^\d{1,20}$/.test(nativeRef)) {
      return { outcome: 'not-found', message: '窗口句柄无效', ...protocol.optionalTrace(debugTrace, [{ stage: 'target', outcome: 'not-found' }]) }
    }
    const script = WINDOWS_TOPMOST_SCRIPT.replace('__EYPC_WINDOW_HANDLE__', nativeRef)
    const appId = String(source.appId || source.appName || '').replace(/\u0000/g, '').slice(0, 512)
    const sourceInstanceId = String(source.instanceId || '').replace(/\u0000/g, '').slice(0, 512)
    const instanceId = sourceInstanceId.includes(':legacy:') ? '' : sourceInstanceId
    const systemRoot = processApi.env && processApi.env.SystemRoot || 'C:\\Windows'
    const result = await run(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], debugTrace, {
      EYPC_WINDOW_TARGET_APP_ID: appId,
      ...(instanceId ? { EYPC_WINDOW_INSTANCE_ID: instanceId } : {})
    })
    if (!result.ok) return { outcome: 'failed', message: 'Windows 无法执行页面置顶', ...protocol.optionalTrace(debugTrace, [{ stage: 'bridge', outcome: 'failed' }]) }
    const activation = protocol.parseActivationResult(result.stdout)
    return activation.outcome === 'focus-denied'
      ? { ...activation, message: '系统拒绝聚焦该窗口；EyPc 未尝试绕过前台保护' }
      : activation
  }

  async function close(window) {
    const source = window && typeof window === 'object' ? window : {}
    const nativeRef = String(source.nativeRef || '').trim()
    if (!/^\d{1,20}$/.test(nativeRef)) return { outcome: 'not-found', message: '窗口句柄无效' }
    const script = WINDOWS_CLOSE_SCRIPT.replace('__EYPC_WINDOW_HANDLE__', nativeRef)
    const appId = String(source.appId || source.appName || '').replace(/\u0000/g, '').slice(0, 512)
    const sourceInstanceId = String(source.instanceId || '').replace(/\u0000/g, '').slice(0, 512)
    const instanceId = sourceInstanceId.includes(':legacy:') ? '' : sourceInstanceId
    const rootNativeRef = String(source.rootNativeRef || '').trim()
    const systemRoot = processApi.env && processApi.env.SystemRoot || 'C:\\Windows'
    const result = await run(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], false, {
      EYPC_WINDOW_TARGET_APP_ID: appId,
      ...(instanceId ? { EYPC_WINDOW_INSTANCE_ID: instanceId } : {}),
      ...(rootNativeRef && rootNativeRef !== nativeRef ? { EYPC_WINDOW_ROOT_REF: rootNativeRef } : {})
    })
    if (!result.ok) return { outcome: 'failed', message: 'Windows 无法关闭该窗口' }
    return protocol.parseLifecycleResult(result.stdout)
  }

  async function terminate(window) {
    const pid = Math.trunc(Number(window && window.pid))
    if (!Number.isInteger(pid) || pid <= 0) return { outcome: 'not-found', message: '进程引用已失效或不属于当前系统' }
    const systemRoot = processApi.env && processApi.env.SystemRoot || 'C:\\Windows'
    const script = WINDOWS_TERMINATE_SCRIPT.replace('__EYPC_WINDOW_PID__', String(pid))
    const result = await run(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script])
    if (!result.ok) return { outcome: 'failed', message: 'Windows 无法强制终止该进程' }
    return protocol.parseLifecycleResult(result.stdout, 'failed')
  }

  async function openPermissionSettings() {
    return false
  }

  return { capabilities, list, observeInventory, markActivation, probeInstance, activate, alwaysOnTop, close, terminate, openPermissionSettings }
}

module.exports = { createWin32WindowPlatform }
