const { execFile } = require('node:child_process')
const path = require('node:path')

const STORAGE_KEY = 'eypc/state/v1'
let lastEnterPayload = null

function run(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: 10_000 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout || ''), stderr: String(stderr || ''), error: error ? String(error.message || error) : '' })
    })
  })
}

function portFromAddress(value) {
  const match = String(value || '').match(/:(\d+)(?:\s|\)|$)/)
  return match ? Number(match[1]) : null
}

function parseLsof(output) {
  return String(output || '')
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
}

function parseNetstat(output) {
  return String(output || '')
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
}

async function scanPorts() {
  if (process.platform === 'win32') {
    const result = await run('netstat', ['-ano', '-p', 'tcp'])
    return result.ok ? parseNetstat(result.stdout) : []
  }
  const result = await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'])
  return result.ok ? parseLsof(result.stdout) : []
}

async function killProcess(request) {
  const pid = Math.max(0, Math.trunc(Number(request && request.pid) || 0))
  const port = Math.max(0, Math.trunc(Number(request && request.port) || 0))
  const force = Boolean(request && request.force)
  const current = await scanPorts()
  if (!current.some((item) => item.pid === pid && item.port === port)) {
    return { ok: false, pid, port, force, error: 'PID no longer owns target port' }
  }
  const command = process.platform === 'win32' ? 'taskkill' : 'kill'
  const args = process.platform === 'win32' ? ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])] : [force ? '-KILL' : '-TERM', String(pid)]
  const result = await run(command, args)
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
  try {
    if (!globalThis.utools || !globalThis.utools.dbStorage) return false
    globalThis.utools.dbStorage.setItem(STORAGE_KEY, state)
    return true
  } catch {
    return false
  }
}

function shellCall(method, target) {
  try {
    if (!target || !globalThis.utools || !globalThis.utools.shellOpenPath) return false
    if (method === 'reveal' && globalThis.utools.shellShowItemInFolder) {
      globalThis.utools.shellShowItemInFolder(target)
      return true
    }
    globalThis.utools.shellOpenPath(target)
    return true
  } catch {
    return false
  }
}

function normalizePickedFavorite(result) {
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
  return {
    kind: explicitKind === 'file' || explicitKind === 'folder' ? explicitKind : 'folder',
    path: target,
    name: path.basename(target) || target,
    parentId: null,
    tags: [],
    color: '#2F80ED'
  }
}

async function pickFavoritePath() {
  try {
    if (globalThis.utools && typeof globalThis.utools.showOpenDialog === 'function') {
      const result = await globalThis.utools.showOpenDialog({
        title: '选择要收藏的文件或文件夹',
        properties: ['openFile', 'openDirectory']
      })
      return normalizePickedFavorite(result)
    }
  } catch {}

  try {
    const electron = require('electron')
    const dialog = electron.dialog || (electron.remote && electron.remote.dialog)
    if (dialog && typeof dialog.showOpenDialogSync === 'function') {
      return normalizePickedFavorite(dialog.showOpenDialogSync({
        title: '选择要收藏的文件或文件夹',
        properties: ['openFile', 'openDirectory']
      }))
    }
    if (dialog && typeof dialog.showOpenDialog === 'function') {
      const result = await dialog.showOpenDialog({
        title: '选择要收藏的文件或文件夹',
        properties: ['openFile', 'openDirectory']
      })
      return normalizePickedFavorite(result)
    }
  } catch {}

  return null
}

if (globalThis.utools && typeof globalThis.utools.onPluginEnter === 'function') {
  globalThis.utools.onPluginEnter((action) => {
    lastEnterPayload = action || null
  })
}

window.eypcPlatform = {
  storage: {
    getState: readState,
    setState: writeState
  },
  ports: {
    scan: scanPorts,
    kill: killProcess
  },
  files: {
    open: async (target) => shellCall('open', target),
    reveal: async (target) => shellCall('reveal', target),
    copyPath: async (target) => {
      try {
        if (globalThis.utools && typeof globalThis.utools.copyText === 'function') {
          globalThis.utools.copyText(String(target || ''))
          return true
        }
      } catch {}
      return false
    },
    pickFavorite: pickFavoritePath
  },
  getEnterPayload() {
    return lastEnterPayload
  },
  clearEnterPayload() {
    lastEnterPayload = null
  }
}
