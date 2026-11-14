import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { UTOOLS_PRELOAD_ASSETS, UTOOLS_PRELOAD_MODULE_ASSETS } from './utools-preload-assets.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const generated = new Set([
  'public/runtime-identity.cjs', 'public/package.json',
  ...UTOOLS_PRELOAD_ASSETS.map((asset) => asset.public),
  ...UTOOLS_PRELOAD_MODULE_ASSETS.map((asset) => asset.public)
])

function digest(root, names, exclusions = new Set()) {
  const hash = crypto.createHash('sha256')
  function visit(name) {
    if (exclusions.has(name) || name.split('/').includes('node_modules')) return
    const absolute = path.join(root, name)
    let entry
    try { entry = fs.lstatSync(absolute) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      hash.update(`${name}\0missing\0`)
      return
    }
    hash.update(`${name}\0${entry.mode}\0`)
    if (entry.isDirectory()) {
      for (const child of fs.readdirSync(absolute).sort()) visit(`${name}/${child}`)
    } else if (entry.isSymbolicLink()) {
      if (!fs.statSync(absolute).isFile()) throw new Error('build-input-directory-symlink')
      hash.update(fs.readlinkSync(absolute))
      hash.update(fs.readFileSync(absolute))
    } else if (entry.isFile()) {
      hash.update(fs.readFileSync(absolute))
    } else throw new Error('build-input-not-regular')
    hash.update('\0')
  }
  for (const name of names) visit(name)
  return hash.digest('hex')
}

export function inputDigest(root) {
  return digest(root, [
    'src', 'preload', 'contracts', 'public', 'scripts', 'tests',
    'package.json', 'pnpm-lock.yaml', 'package-lock.json', 'tsconfig.json',
    'vite.config.ts', 'index.html', 'float.html', 'action.html'
  ], generated)
}

function artifactDigest(root) {
  if (!fs.existsSync(path.join(root, 'dist/runtime-identity.cjs'))) return null
  return digest(root, ['dist'])
}

function readState(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    return value.version === 1 && Array.isArray(value.failures) ? value : { version: 1, failures: [] }
  } catch { return { version: 1, failures: [] } }
}

function writeState(file, value) {
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, file)
}

function startReceipt(cache, event, source) {
  const directory = path.join(cache, 'receipts')
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const receipt = {
    version: 1, id: crypto.randomUUID(), startedAt: new Date().toISOString(),
    source, sessionHash: crypto.createHash('sha256').update(String(event.session_id || 'unknown')).digest('hex'),
    status: 'running', buildAttempted: false
  }
  const filename = `${receipt.startedAt.replaceAll(':', '-')}-${receipt.id}.json`
  const file = path.join(directory, filename)
  writeState(file, receipt)
  const files = fs.readdirSync(directory).filter((name) => name.endsWith('.json')).sort()
  for (const expired of files.slice(0, Math.max(0, files.length - 100))) {
    if (expired === filename) continue
    try { fs.unlinkSync(path.join(directory, expired)) } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return (fields) => writeState(file, { ...receipt, ...fields })
}

function failureResult(event, reason, followups) {
  return followups < 2 && event.stop_hook_active !== true
    ? { decision: 'block', reason }
    : { systemMessage: `${reason} 自动续接已停止；构建仍未通过，不能报告交付已核验。` }
}

export function runBuild(root, timeoutMs = 600_000) {
  return new Promise((resolve) => {
    let output = ''
    let timedOut = false
    let forceTimer
    const child = spawn('npm', ['run', 'build'], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32'
    })
    const capture = (chunk) => { output = (output + chunk.toString()).slice(-5000) }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    const terminate = (signal) => {
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, signal)
        else child.kill(signal)
      } catch {}
    }
    const timeout = setTimeout(() => {
      timedOut = true
      terminate('SIGTERM')
      forceTimer = setTimeout(() => terminate('SIGKILL'), 5000)
    }, timeoutMs)
    child.on('error', () => {
      clearTimeout(timeout)
      clearTimeout(forceTimer)
      resolve({ code: null, reason: 'npm-unavailable', output: '' })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timeout)
      clearTimeout(forceTimer)
      resolve({ code, reason: timedOut ? 'build-timeout' : signal ? 'build-interrupted' : 'build-exit', output })
    })
  })
}

export async function handleStop(event, options = {}) {
  const root = fs.realpathSync(options.root || projectRoot)
  if (event.hook_event_name !== 'Stop') return {}
  const cwd = typeof event.cwd === 'string' ? fs.realpathSync(event.cwd) : null
  if (!cwd || path.relative(root, cwd).split(path.sep).includes('..') || path.isAbsolute(path.relative(root, cwd))) return {}
  const cache = path.join(root, '.codex/build-hook')
  fs.mkdirSync(cache, { recursive: true, mode: 0o700 })
  const record = startReceipt(cache, event, options.source === 'hook' ? 'hook' : 'manual')
  let buildAttempted = false
  let exitCode = null
  const finish = (status, response, reason, identity) => {
    record({ status, reason, identity, buildAttempted, exitCode, finishedAt: new Date().toISOString() })
    return response
  }
  const lock = path.join(cache, 'lock')
  const stateFile = path.join(cache, 'state.json')
  try { fs.mkdirSync(lock) } catch (error) {
    if (error.code !== 'EEXIST') {
      finish('failed', {}, 'hook-error')
      throw error
    }
    return finish('locked', failureResult(event, 'EyPc 构建锁被占用；不要并行构建或宣称成功。确认原构建结束后再核验。', 0), 'lock-busy')
  }
  try {
    const state = readState(stateFile)
    const session = crypto.createHash('sha256').update(String(event.session_id || 'unknown')).digest('hex')
    const failure = state.failures.find((entry) => entry.session === session)
    const before = inputDigest(root)
    if (state.success?.input === before && state.success.node === process.version
      && state.success.artifact === artifactDigest(root)) return finish('reused', {}, 'successful-cache', state.success.identity)
    if (failure?.input === before) {
      return finish('failed', { systemMessage: 'EyPc 相同输入的构建已失败，未重复运行；修复原因后交回 Hook，由自然 Stop 重新核验，不得报告构建通过。' }, 'unchanged-failed-input')
    }
    buildAttempted = true
    record({ status: 'running', buildAttempted })
    const result = await (options.build || runBuild)(root)
    exitCode = typeof result.code === 'number' ? result.code : null
    const after = inputDigest(root)
    const artifact = artifactDigest(root)
    if (result.code === 0 && before === after && artifact !== null) {
      const source = fs.readFileSync(path.join(root, 'dist/runtime-identity.cjs'), 'utf8')
      const identity = Object.fromEntries(['coreVersion', 'hostAssetId', 'rendererAssetId', 'builtAt'].map((field) => {
        const match = source.match(new RegExp(`"${field}"\\s*:\\s*"([^"\\n]+)"`))
        return [field, match?.[1] || 'unavailable']
      }))
      state.success = { input: after, artifact, node: process.version, identity }
      state.failures = state.failures.filter((entry) => entry.session !== session)
      writeState(stateFile, state)
      return finish('rebuilt', { systemMessage: `EyPc npm run build 已通过：${Object.values(identity).join(' / ')}。安装加载和真实宿主验收未由 Hook 执行。` }, 'build-passed', identity)
    }
    const reason = result.code === 0
      ? before !== after ? '构建期间输入发生变化，产物结果已失效' : '构建未生成完整产物'
      : `npm run build 失败（${result.reason}，exit=${result.code}）`
    const followups = failure?.followups || 0
    const response = failureResult(event,
      `EyPc ${reason}。处理失败原因后交回 Hook，由自然 Stop 重新核验；不要跳过 build 门禁，也不要手动运行 build。${result.output ? `\n构建末尾输出（仅本次回传）：\n${result.output}` : ''}`, followups)
    state.failures = [...state.failures.filter((entry) => entry.session !== session),
      { session, input: before, followups: followups + (response.decision === 'block' ? 1 : 0) }].slice(-16)
    delete state.success
    writeState(stateFile, state)
    return finish('failed', response, result.code === 0
      ? before !== after ? 'inputs-changed' : 'artifact-missing'
      : 'build-failed')
  } catch (error) {
    finish('failed', {}, 'hook-error')
    throw error
  } finally {
    fs.rmdirSync(lock)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let event
  try {
    let input = ''
    for await (const chunk of process.stdin) {
      input += chunk
      if (input.length > 1_000_000) throw new Error('hook-input-too-large')
    }
    event = JSON.parse(input)
    const response = await handleStop(event, { source: 'hook' })
    process.stdout.write(`${JSON.stringify(response)}\n`)
  } catch {
    const reason = 'EyPc 构建 Hook 未完成，不能视为构建通过；请报告接入缺口并等待 Hook 核验，不手动运行 npm run build，也不把直接调用处理器伪装成 Stop。'
    const response = event?.hook_event_name === 'Stop' ? failureResult(event, reason, 0) : { systemMessage: reason }
    process.stdout.write(`${JSON.stringify(response)}\n`)
  }
}
