import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'

const confirmationFlag = '--create-temp-task'
if (!process.argv.includes(confirmationFlag)) {
  console.error(`Refusing to create a real Codex task without ${confirmationFlag}`)
  process.exit(2)
}

const projectRoot = resolve(import.meta.dirname, '..')
const taskName = `EyPc archive lifecycle check ${new Date().toISOString()}`
const child = spawn(process.env.EYPC_CODEX_BIN || 'codex', ['app-server', '--listen', 'stdio://'], {
  cwd: projectRoot,
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true
})
const lines = createInterface({ input: child.stdout })
const pending = new Map()
let nextId = 0
let stderr = ''
let createdThreadId = ''
let createdThreadArchived = false
let createdTurnId = ''
let createdTurnTerminal = false

child.stderr.on('data', (chunk) => {
  stderr = `${stderr}${String(chunk)}`.slice(-16 * 1024)
})

lines.on('line', (line) => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (!Number.isInteger(message?.id)) return
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  clearTimeout(request.timeout)
  if (message.error) {
    request.reject(new Error(`${request.method} failed (${message.error.code ?? 'unknown'})`))
    return
  }
  request.resolve(message.result || {})
})

child.once('exit', (code) => {
  for (const request of pending.values()) {
    clearTimeout(request.timeout)
    request.reject(new Error(`Codex App Server exited before ${request.method} completed (${code ?? 'unknown'})`))
  }
  pending.clear()
})

function request(method, params = {}, timeoutMs = 15_000) {
  const id = ++nextId
  return new Promise((resolveRequest, rejectRequest) => {
    const timeout = setTimeout(() => {
      pending.delete(id)
      rejectRequest(new Error(`${method} timed out`))
    }, timeoutMs)
    pending.set(id, { method, resolve: resolveRequest, reject: rejectRequest, timeout })
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
  })
}

function notify(method, params = {}) {
  child.stdin.write(`${JSON.stringify({ method, params })}\n`)
}

async function listAll(archived) {
  const rows = []
  const seenCursors = new Set()
  let cursor = ''
  for (let page = 0; page < 500; page += 1) {
    const result = await request('thread/list', {
      archived,
      limit: 100,
      sortKey: 'recency_at',
      sortDirection: 'desc',
      ...(cursor ? { cursor } : {})
    })
    if (!Array.isArray(result.data)) throw new Error('thread/list returned an invalid data page')
    rows.push(...result.data)
    const nextCursor = result.nextCursor || ''
    if (typeof nextCursor !== 'string') throw new Error('thread/list returned an invalid cursor')
    if (!nextCursor) return rows
    if (seenCursors.has(nextCursor)) throw new Error('thread/list cursor loop detected')
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }
  throw new Error('thread/list exceeded the pagination safety bound')
}

async function presence() {
  const [unarchived, archived] = await Promise.all([listAll(false), listAll(true)])
  return {
    unarchived: unarchived.some((thread) => thread?.id === createdThreadId),
    archived: archived.some((thread) => thread?.id === createdThreadId)
  }
}

function assertPresence(actual, expected, phase) {
  if (actual.unarchived !== expected.unarchived || actual.archived !== expected.archived) {
    throw new Error(`${phase} presence mismatch: unarchived=${actual.unarchived}, archived=${actual.archived}`)
  }
}

async function waitForTurnTerminal(threadId, turnId, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await request('thread/turns/list', {
      threadId,
      limit: 1,
      sortDirection: 'desc',
      itemsView: 'notLoaded'
    })
    if (!Array.isArray(result.data)) throw new Error('thread/turns/list returned invalid data')
    const turn = result.data.find((candidate) => candidate?.id === turnId) || result.data[0]
    if (turn?.status === 'completed') return
    if (turn && ['failed', 'interrupted'].includes(turn.status)) {
      throw new Error(`temporary validation Turn ended as ${turn.status}`)
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500))
  }
  throw new Error('temporary validation Turn did not complete in time')
}

async function closeServer() {
  try { child.stdin.end() } catch {}
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 3_000))
  ])
  lines.close()
  child.stdout.destroy()
  child.stderr.destroy()
  child.unref()
}

try {
  await request('initialize', {
    clientInfo: { name: 'eypc_archive_lifecycle_check', title: 'EyPc Archive Lifecycle Check', version: '1.0.0' },
    capabilities: { experimentalApi: true }
  })
  notify('initialized')

  const started = await request('thread/start', {
    cwd: projectRoot,
    ephemeral: false,
    approvalPolicy: 'never',
    sandbox: 'read-only',
    developerInstructions: 'This is an EyPc archive lifecycle check. Do not call tools. Reply with exactly: EyPc archive lifecycle check complete.'
  })
  createdThreadId = started?.thread?.id || ''
  if (!createdThreadId) throw new Error('thread/start did not return a thread identity')
  await request('thread/name/set', { threadId: createdThreadId, name: taskName })

  const turnStarted = await request('turn/start', {
    threadId: createdThreadId,
    input: [{ type: 'text', text: 'Reply with exactly: EyPc archive lifecycle check complete.' }]
  })
  createdTurnId = turnStarted?.turn?.id || ''
  if (!createdTurnId) throw new Error('turn/start did not return a Turn identity')
  await waitForTurnTerminal(createdThreadId, createdTurnId)
  createdTurnTerminal = true

  assertPresence(await presence(), { unarchived: true, archived: false }, 'created')

  await request('thread/archive', { threadId: createdThreadId })
  createdThreadArchived = true
  assertPresence(await presence(), { unarchived: false, archived: true }, 'archived')

  await request('thread/unarchive', { threadId: createdThreadId })
  createdThreadArchived = false
  assertPresence(await presence(), { unarchived: true, archived: false }, 'restored')

  // Leave the dedicated validation task archived so it does not pollute the user's active task list.
  await request('thread/archive', { threadId: createdThreadId })
  createdThreadArchived = true
  assertPresence(await presence(), { unarchived: false, archived: true }, 'cleanup')

  console.log(JSON.stringify({
    ok: true,
    taskName,
    checks: ['created:false/true', 'archive:false/true', 'unarchive:true/false', 'cleanup:false/true'],
    finalState: 'archived'
  }, null, 2))
} catch (error) {
  if (createdThreadId && createdTurnId && !createdTurnTerminal) {
    try {
      await request('turn/interrupt', { threadId: createdThreadId, turnId: createdTurnId })
      createdTurnTerminal = true
    } catch {}
  }
  if (createdThreadId && !createdThreadArchived) {
    try {
      await request('thread/archive', { threadId: createdThreadId })
      createdThreadArchived = true
    } catch {}
  }
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    cleanupAttempted: Boolean(createdThreadId),
    finalState: createdThreadArchived ? 'archived' : 'unknown',
    serverHint: stderr ? 'Codex App Server emitted diagnostics' : 'none'
  }, null, 2))
  process.exitCode = 1
} finally {
  await closeServer()
}
