'use strict'

/**
 * Locates the Desktop IPC socket and decides whether it is safe to trust:
 * only on macOS, only when the socket and its directory are both owned by
 * the current user with no group/other permission bits set. A socket this
 * module cannot fully vouch for is one the entry must not connect to.
 *
 * `process`/`fs` are injected on the node-runtime precedent. `path` is
 * injected the same way as `fs` -- both differ in behavior only by platform,
 * never by realm, but are still passed through rather than required
 * separately so this module has exactly one source of truth for "which
 * process/filesystem am I looking at." `nativeStatePaths` is this entry's
 * own delegating stub for an already-extracted module, injected like any
 * other collaborator.
 */

const CODEX_DESKTOP_IPC_ENDPOINT_REVISION = 'codex-desktop-ipc-endpoint-v1'

// A Desktop snapshot can approach the existing 256 MiB protocol ceiling.
// Re-concatenating the received prefix for each socket chunk is quadratic.
// Allocate one bounded body after its header and copy each input byte once.
function createCodexDesktopFrameReader(maximumBytes) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new TypeError('invalid IPC frame limit')
  const header = Buffer.allocUnsafe(4)
  let headerBytes = 0, body = null, bodyBytes = 0, copiedBytes = 0, completedFrames = 0
  return {
    push(chunk, accept) {
      if (!Buffer.isBuffer(chunk) || !chunk.length) return true
      let offset = 0
      while (offset < chunk.length) {
        if (!body) {
          const size = Math.min(4 - headerBytes, chunk.length - offset)
          chunk.copy(header, headerBytes, offset, offset + size)
          headerBytes += size; offset += size; copiedBytes += size
          if (headerBytes < 4) continue
          const length = header.readUInt32LE(0)
          if (!length || length > maximumBytes) return false
          try { body = Buffer.allocUnsafe(length) } catch { return false }
          bodyBytes = 0
        }
        const size = Math.min(body.length - bodyBytes, chunk.length - offset)
        chunk.copy(body, bodyBytes, offset, offset + size)
        bodyBytes += size; offset += size; copiedBytes += size
        if (bodyBytes === body.length) {
          const complete = body
          body = null; bodyBytes = 0; headerBytes = 0; completedFrames += 1
          if (accept(complete) === false) return false
        }
      }
      return true
    },
    reset() { headerBytes = 0; body = null; bodyBytes = 0 },
    stats() { return { copiedBytes, completedFrames, bufferedBytes: bodyBytes, allocatedBytes: body?.length || 0 } }
  }
}

function createCodexDesktopIpcEndpoint(dependencies = {}) {
  const nativeStatePaths = dependencies.nativeStatePaths
  if (typeof nativeStatePaths !== 'function') {
    throw new TypeError('codex desktop ipc endpoint requires nativeStatePaths')
  }
  const fs = dependencies.fs || require('node:fs')
  const path = dependencies.path || require('node:path')
  const host = dependencies.process || process

  function codexDesktopIpcEndpoint() {
    if (host.platform !== 'darwin') return ''
    return path.join(nativeStatePaths().codexHome, 'ipc', 'ipc.sock')
  }

  function codexDesktopIpcEndpointIsSecure(endpoint) {
    if (!endpoint || host.platform !== 'darwin') return false
    const uid = typeof host.getuid === 'function' ? host.getuid() : null
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

  return {
    revision: CODEX_DESKTOP_IPC_ENDPOINT_REVISION,
    codexDesktopIpcEndpoint,
    codexDesktopIpcEndpointIsSecure,
    createFrameReader: createCodexDesktopFrameReader
  }
}

module.exports = {
  CODEX_DESKTOP_IPC_ENDPOINT_REVISION,
  createCodexDesktopFrameReader,
  createCodexDesktopIpcEndpoint
}
