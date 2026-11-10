'use strict'

function createCodexDesktopIpcConnection(dependencies = {}) {
  const host = dependencies.process || process
  const fs = dependencies.fs || require('node:fs')
  const net = dependencies.net || require('node:net')
  const endpoint = dependencies.endpoint
  const isSecure = dependencies.isSecure
  const verify = dependencies.verify
  const record = dependencies.record

  function noteState(bridge, state) {
    const code = ['ENOENT', 'ECONNREFUSED', 'EACCES', 'EPERM', 'EBUSY', 'ETIMEDOUT'].includes(bridge.lastSocketError)
      ? bridge.lastSocketError : bridge.lastSocketError ? 'other' : ''
    const line = `${state}:${bridge.endpointReason}:${code}`
    if (line === bridge.bridgeStateLine) return
    bridge.bridgeStateLine = line
    if (typeof record !== 'function') return
    try {
      record({ level: state === 'failed' || state === 'incompatible' ? 'error' : 'info',
        scope: 'task-evidence', event: 'desktop-bridge-state', outcome: state, provider: 'codex',
        details: { platform: host.platform, reason: bridge.endpointReason || '', socketCode: code,
          bindingKnown: Boolean(bridge.readStateBinding) } })
    } catch {}
  }

  async function ensure(bridge) {
    if (bridge.closed || bridge.socket || bridge.endpointCheck || bridge.reconnectTimer || bridge.state === 'incompatible') return
    if (host.platform !== 'darwin' && host.platform !== 'win32') {
      bridge.endpointReason = 'unsupported-platform'
      bridge.setState('failed')
      return
    }
    const target = endpoint()
    let secure = false
    if (host.platform === 'win32') {
      const check = bridge.endpointCheck = {}
      bridge.endpointReason = 'checking-security'
      bridge.setState('connecting')
      let result
      try { result = await verify(target) } catch {}
      if (bridge.closed || bridge.endpointCheck !== check) return
      bridge.endpointCheck = null
      if (target !== endpoint()) { bridge.scheduleReconnect(); return }
      secure = result?.secure === true
      bridge.endpointReason = result?.reason || 'security-unavailable'
    } else {
      secure = isSecure(target)
      bridge.endpointReason = secure ? '' : target && !fs.existsSync(target) ? 'not-running' : 'endpoint-untrusted'
    }
    if (!secure) {
      bridge.setState(bridge.endpointReason === 'not-running' ? 'not-running' : 'failed')
      bridge.scheduleReconnect()
      return
    }
    bridge.endpointReason = ''
    bridge.lastSocketError = ''
    bridge.setState('connecting')
    let socket
    try { socket = net.connect(target) } catch (error) {
      bridge.lastSocketError = String(error?.code || 'other')
      bridge.setState('failed')
      bridge.scheduleReconnect()
      return
    }
    bridge.socket = socket
    socket.on('connect', () => { if (!bridge.closed && bridge.socket === socket) bridge.initialize() })
    socket.on('data', (chunk) => { if (!bridge.closed && bridge.socket === socket) bridge.handleData(chunk) })
    socket.on('error', (error) => {
      if (!bridge.closed && bridge.socket === socket) bridge.lastSocketError = String(error?.code || '')
    })
    socket.on('close', () => bridge.handleClose(socket))
  }

  return { ensure, noteState }
}

module.exports = { createCodexDesktopIpcConnection }
