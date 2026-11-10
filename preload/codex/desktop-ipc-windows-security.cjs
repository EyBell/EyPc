'use strict'

const CODEX_DESKTOP_PIPE_SECURITY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$failureReason = 'security-api-unavailable'
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class EyPcDesktopPipeSecurity {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
  public static extern SafeFileHandle CreateFileW(string name, uint access, uint sharing,
    IntPtr attributes, uint creation, uint flags, IntPtr template);
  [DllImport("advapi32.dll", ExactSpelling = true)]
  public static extern uint GetSecurityInfo(SafeFileHandle handle, int type, uint info,
    out IntPtr owner, IntPtr group, out IntPtr dacl, IntPtr sacl, out IntPtr descriptor);
  [DllImport("kernel32.dll")]
  public static extern IntPtr LocalFree(IntPtr memory);
}
'@
  $owner = [IntPtr]::Zero
  $dacl = [IntPtr]::Zero
  $descriptor = [IntPtr]::Zero
  $pipe = $null
  try {
    $pipe = [EyPcDesktopPipeSecurity]::CreateFileW(
      $env:EYPC_DESKTOP_PIPE, 0x20000, 3, [IntPtr]::Zero, 3, 0x110000, [IntPtr]::Zero)
    if ($pipe.IsInvalid) {
      $status = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    } else {
      $status = [EyPcDesktopPipeSecurity]::GetSecurityInfo(
        $pipe, 6, 5, [ref]$owner, [IntPtr]::Zero, [ref]$dacl, [IntPtr]::Zero, [ref]$descriptor)
    }
    if ($status -eq 2 -or $status -eq 3) {
      [Console]::Out.Write('not-running')
    } elseif ($status -eq 231) {
      [Console]::Out.Write('pipe-busy')
    } elseif ($status -eq 5) {
      [Console]::Out.Write('access-denied')
    } elseif ($status -eq 87) {
      [Console]::Out.Write('security-invalid-parameter')
    } elseif ($status -ne 0) {
      [Console]::Out.Write('security-query-failed')
    } elseif ($owner -eq [IntPtr]::Zero -or $descriptor -eq [IntPtr]::Zero) {
      [Console]::Out.Write('security-unavailable')
    } else {
      $failureReason = 'security-owner-check-failed'
      $actualOwner = New-Object System.Security.Principal.SecurityIdentifier($owner)
      $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
      try {
        if (-not $actualOwner.Equals($identity.User)) {
          [Console]::Out.Write('owner-mismatch')
        } elseif ($dacl -eq [IntPtr]::Zero) {
          [Console]::Out.Write('permissions-untrusted')
        } else {
          $failureReason = 'security-acl-check-failed'
          $length = [int][System.Runtime.InteropServices.Marshal]::ReadByte($dacl, 2) +
            256 * [int][System.Runtime.InteropServices.Marshal]::ReadByte($dacl, 3)
          if ($length -lt 8 -or $length -gt 65535) { throw 'descriptor-invalid' }
          $bytes = New-Object byte[] $length
          [System.Runtime.InteropServices.Marshal]::Copy($dacl, $bytes, 0, $length)
          $acl = New-Object System.Security.AccessControl.RawAcl($bytes, 0)
          $allowed = @($identity.User.Value, 'S-1-5-18', 'S-1-5-32-544', 'S-1-3-0', 'S-1-3-4')
          foreach ($group in $identity.Groups) {
            if ($group.Value -match '^S-1-5-5-\d+-\d+$') { $allowed += $group.Value }
          }
          $trusted = $true
          foreach ($ace in $acl) {
            if ([int]$ace.AceFlags -band [int][System.Security.AccessControl.AceFlags]::InheritOnly) { continue }
            if ($ace -isnot [System.Security.AccessControl.CommonAce]) { $trusted = $false; break }
            if ($ace.AceQualifier -eq [System.Security.AccessControl.AceQualifier]::AccessDenied) { continue }
            if ($ace.AceQualifier -ne [System.Security.AccessControl.AceQualifier]::AccessAllowed -or $ace.IsCallback) {
              $trusted = $false; break
            }
            if (($ace.AccessMask -band 0x500D0006) -ne 0 -and $allowed -notcontains $ace.SecurityIdentifier.Value) {
              $trusted = $false; break
            }
          }
          if ($trusted) {
            [Console]::Out.Write('secure')
          } else {
            [Console]::Out.Write('permissions-untrusted')
          }
        }
      } finally {
        $identity.Dispose()
      }
    }
  } finally {
    if ($descriptor -ne [IntPtr]::Zero) {
      [void][EyPcDesktopPipeSecurity]::LocalFree($descriptor)
    }
    if ($null -ne $pipe) { $pipe.Dispose() }
  }
} catch {
  [Console]::Out.Write($failureReason)
}
`

function createCodexDesktopWindowsPipeSecurity(dependencies = {}) {
  const execFile = dependencies.execFile
  const host = dependencies.process || process
  const path = dependencies.path || require('node:path')
  const outcomes = new Set(['secure', 'not-running', 'pipe-busy', 'access-denied', 'security-unavailable',
    'security-invalid-parameter', 'security-query-failed', 'security-api-unavailable',
    'security-owner-check-failed', 'security-acl-check-failed', 'owner-mismatch', 'permissions-untrusted'])

  return function verifyWindowsPipeOwner(endpoint) {
    if (host.platform !== 'win32' || typeof execFile !== 'function'
      || typeof endpoint !== 'string' || !/^\\\\\.\\pipe\\[a-zA-Z0-9._-]{1,240}$/.test(endpoint)) {
      return Promise.resolve({ secure: false, reason: 'security-unavailable' })
    }
    const systemRoot = host.env?.SystemRoot || 'C:\\Windows'
    const command = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    return new Promise((resolve) => {
      let settled = false
      const finish = (reason) => {
        if (settled) return
        settled = true
        resolve({ secure: reason === 'secure', reason })
      }
      try {
        execFile(command, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
          Buffer.from(CODEX_DESKTOP_PIPE_SECURITY_SCRIPT, 'utf16le').toString('base64')], {
          windowsHide: true,
          timeout: 5_000,
          maxBuffer: 1024,
          env: { ...host.env, EYPC_DESKTOP_PIPE: endpoint }
        }, (error, stdout) => {
          if (error) {
            const reason = error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'security-output-invalid'
              : error.killed === true || error.code === 'ETIMEDOUT' ? 'security-check-timeout'
              : ['ENOENT', 'EACCES', 'EPERM'].includes(error.code) ? 'security-launch-failed' : 'security-process-failed'
            finish(reason)
            return
          }
          const reason = typeof stdout === 'string' ? stdout.trim() : ''
          finish(outcomes.has(reason) ? reason : 'security-output-invalid')
        })
      } catch {
        finish('security-launch-failed')
      }
    })
  }
}

module.exports = { createCodexDesktopWindowsPipeSecurity }
