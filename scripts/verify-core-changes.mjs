import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(import.meta.dirname, '..')
export const mapPath = 'vibe/knowledge/core-verification-map.json'
const unique = values => [...new Set(values)].sort()
const fail = message => { throw new Error(message) }
export function matches(file, pattern) {
  return new RegExp(`^${pattern.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(file)
}
function safePath(file) {
  return typeof file === 'string' && file.length > 0 && !path.isAbsolute(file) && !file.split('/').includes('..') && !file.includes('\\') && !file.includes('\0')
}
function git(repo, args) { return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 8 * 1024 * 1024 }) }
export function changedFiles(repo, { base, staged = false } = {}, readGit = git) {
  // --no-renames emits both old and new names, including deletions. NUL preserves spaces/newlines.
  const diff = args => readGit(repo, ['diff', '--no-renames', '--name-only', '-z', ...args, '--']).split('\0').filter(Boolean)
  if (base) {
    if (base.startsWith('-')) fail('invalid base ref')
    const sha = readGit(repo, ['rev-parse', '--verify', `${base}^{commit}`]).trim()
    return unique(diff([sha, 'HEAD']))
  }
  return unique(staged ? diff(['--cached']) : [...diff(['HEAD']), ...readGit(repo, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)])
}
function filesUnder(repo, directory) {
  const target = path.join(repo, directory)
  if (!fs.existsSync(target)) return []
  return fs.readdirSync(target, { withFileTypes: true }).flatMap(entry => {
    const name = `${directory}/${entry.name}`
    return entry.isDirectory() ? filesUnder(repo, name) : [name]
  })
}
export function validateMap(map, repo = root) {
  if (map.version !== 1 || !Array.isArray(map.guards) || !Array.isArray(map.checks) || !map.guards.length) fail('invalid verification map')
  const checks = new Map()
  for (const check of map.checks) {
    if (!/^[a-z][a-z0-9-]+$/.test(check.id) || checks.has(check.id)) fail('duplicate/invalid check id')
    if (!['node', 'vitest'].includes(check.kind) || !Array.isArray(check.files) || !check.files.length) fail(`invalid check: ${check.id}`)
    for (const file of check.files) {
      if (!safePath(file) || !(check.kind === 'node' ? /^scripts\/[\w-]+\.mjs$/ : /^tests\/.+\.test\.ts$/).test(file)) fail(`invalid executable path: ${check.id}`)
      if (!fs.existsSync(path.join(repo, file)) || !fs.lstatSync(path.join(repo, file)).isFile()) fail(`missing check file: ${file}`)
    }
    if (check.kind === 'node' && check.files.length !== 1) fail('node check must have one entry')
    if (check.kind === 'node' && (!check.receipt?.pattern || !Number.isInteger(check.receipt.minimum) || check.receipt.minimum < 1)) fail('node check requires a positive execution receipt')
    if (check.receipt) new RegExp(check.receipt.pattern)
    if (check.testNames !== undefined && (check.kind !== 'vitest' || check.files.length !== 1 || !Array.isArray(check.testNames) || !check.testNames.length || check.testNames.some(name => typeof name !== 'string' || !name))) fail('invalid test names')
    checks.set(check.id, check)
  }
  const requirements = new Map(filesUnder(repo, 'vibe/specs/requirements').filter(file => file.endsWith('.md')).map(file => {
    const text = fs.readFileSync(path.join(repo, file), 'utf8')
    return [/^qualified_source: (.+)$/m.exec(text)?.[1], /^status: (.+)$/m.exec(text)?.[1]]
  }))
  const inventory = [...fs.readdirSync(repo, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name),
    ...['src', 'preload', 'public', 'contracts', 'scripts', 'tests', 'vibe'].flatMap(dir => filesUnder(repo, dir))]
  const ids = new Set()
  for (const guard of map.guards) {
    if (!guard.id || ids.has(guard.id) || !guard.boundary || !guard.paths?.length || !guard.checks?.length || !guard.sources?.length) fail('invalid guard')
    ids.add(guard.id)
    for (const pattern of guard.paths) if (!safePath(pattern) || !inventory.some(file => matches(file, pattern))) fail(`missing owner/consumer path: ${pattern}`)
    for (const id of guard.checks) if (!checks.has(id)) fail(`unknown check: ${id}`)
    for (const source of guard.sources) {
      if (source.startsWith('source-only:')) {
        const [file, heading] = source.slice(12).split('#')
        if (!safePath(file) || !heading || !fs.readFileSync(path.join(repo, file), 'utf8').includes(`## ${heading}`)) fail(`missing source-only section: ${source}`)
      } else if (requirements.get(source) !== 'active') fail(`inactive or missing requirement: ${source}`)
    }
  }
  return map
}
export function selectChecks(map, files, all = false) {
  for (const file of files) if (!safePath(file)) fail('unsafe changed path')
  const governance = files.some(file => map.governance.some(pattern => matches(file, pattern)))
  const excluded = files.filter(file => map.exclusions.some(pattern => matches(file, pattern)))
  const guards = map.guards.filter(guard => all || governance || files.some(file => !excluded.includes(file) && guard.paths.some(pattern => matches(file, pattern))))
  const unmapped = files.filter(file => !excluded.includes(file) && map.protected.some(pattern => matches(file, pattern)) && !map.governance.some(pattern => matches(file, pattern)) && !map.guards.some(guard => guard.paths.some(pattern => matches(file, pattern))))
  if (unmapped.length) fail(`unmapped core change: ${unmapped.join(', ')}`)
  const ids = unique(guards.flatMap(guard => guard.checks))
  return { files: unique(files), excluded, guards: guards.map(guard => ({ id: guard.id, sources: guard.sources, boundary: guard.boundary,
    reasons: all ? ['explicit-all-core'] : governance ? ['verification-governance-change'] : files.filter(file => guard.paths.some(pattern => matches(file, pattern))) })),
  checks: ids.map(id => map.checks.find(check => check.id === id)) }
}
export function inputDigest(repo, map, plan) {
  // Hashing dependencies does not select additional tests. Include the full repository-owned
  // execution surface so an indirect import changing during the run cannot leave a fresh PASS.
  const files = unique([mapPath, 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'vibe/specs/PRODUCT_REQUIREMENTS.md', ...plan.files,
    ...fs.readdirSync(repo).filter(file => /^(tsconfig.*\.json|vitest\.config\..+)$/.test(file)),
    ...['src', 'preload', 'public', 'contracts', 'scripts', 'tests', 'vibe', '.github'].flatMap(dir => filesUnder(repo, dir))])
  const hash = crypto.createHash('sha256')
  hash.update(process.version).update('\0')
  try { hash.update(git(repo, ['rev-parse', '--verify', 'HEAD'])).update(git(repo, ['ls-files', '--stage', '-z'])) } catch { hash.update('no-git-fixture') }
  for (const file of files) {
    const absolute = path.join(repo, file)
    hash.update(file).update('\0')
    if (!fs.existsSync(absolute)) hash.update('deleted')
    else if (fs.lstatSync(absolute).isSymbolicLink()) hash.update(`symlink:${fs.readlinkSync(absolute)}`)
    else if (fs.lstatSync(absolute).isFile()) hash.update(fs.readFileSync(absolute))
    hash.update('\0')
  }
  return hash.digest('hex')
}
export function runCommand(command, args, { cwd, timeoutMs = 120000, maxBytes = 2 * 1024 * 1024 } = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    let bytes = 0, output = '', failure = null
    const stop = reason => {
      failure = reason
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
    }
    const timer = setTimeout(() => stop('timeout'), timeoutMs)
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
      bytes += data.length
      if (bytes > maxBytes) stop('output-limit')
      else output += data.toString()
    })
    child.on('error', () => { clearTimeout(timer); resolve({ ok: false, reason: 'spawn-failed', output: '' }) })
    child.on('close', code => { clearTimeout(timer); resolve({ ok: code === 0 && !failure, reason: failure || (code === 0 ? null : 'check-failed'), output }) })
  })
}
export function countVerifiedTests(report, files, testNames) {
  if (report.success !== true || report.numFailedTests > 0) fail('test report failed')
  let count = 0
  for (const file of files) {
    const suites = report.testResults?.filter(suite => suite.name.replaceAll('\\', '/').endsWith(`/${file}`)) || []
    const assertions = suites.flatMap(suite => suite.assertionResults || [])
    const passed = assertions.filter(test => test.status === 'passed').length
    if (!passed || assertions.some(test => test.status === 'failed')) fail(`zero or failed tests: ${file}`)
    if (testNames && (testNames.some(name => !assertions.some(test => test.title === name && test.status === 'passed'))
      || assertions.some(test => test.status === 'passed' && !testNames.includes(test.title)))) fail('named test scope mismatch')
    count += passed
  }
  return count
}
export async function executePlan(repo, map, plan, execute = runCommand) {
  const digest = inputDigest(repo, map, plan)
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eypc-core-check-'))
  const results = []
  try {
    for (const check of plan.checks) {
      const reportFile = path.join(directory, `${check.id}.json`)
      const pattern = check.testNames?.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
      const args = check.kind === 'node' ? check.files : ['node_modules/vitest/vitest.mjs', 'run', ...check.files, '--reporter=json', `--outputFile=${reportFile}`, '--test-timeout=30000', ...(pattern ? ['--testNamePattern', `(?:${pattern})$`] : [])]
      const result = await execute(process.execPath, args, { cwd: repo })
      let count = null, reason = result.reason
      if (!result.ok && check.kind === 'vitest') {
        try {
          const failedReport = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
          const failures = (failedReport.testResults || []).flatMap(suite => (suite.assertionResults || [])
            .filter(test => test.status === 'failed').map(test => `${test.fullName || test.title}: ${(test.failureMessages || []).join('\n')}`))
          if (failures.length) process.stderr.write(`${failures.join('\n').slice(-8000)}\n`)
        } catch { /* The typed failure below still rejects a missing report. */ }
      }
      if (result.ok && check.kind === 'vitest') {
        try { count = countVerifiedTests(JSON.parse(fs.readFileSync(reportFile, 'utf8')), check.files, check.testNames) } catch { reason = 'invalid-or-empty-test-report' }
      }
      if (result.ok && check.kind === 'node') {
        const match = new RegExp(check.receipt.pattern).exec(result.output)
        count = Number(match?.[1])
        if (!Number.isSafeInteger(count) || count < check.receipt.minimum) reason = 'missing-or-empty-execution-receipt'
      }
      results.push({ id: check.id, passed: result.ok && !reason, tests: check.kind === 'vitest' ? count : null, checkedUnits: check.kind === 'node' && Number.isFinite(count) ? count : null, reason })
      if (!results.at(-1).passed) {
        // Diagnostic output stays on the console; the evidence report stores only typed results.
        if (result.output) process.stderr.write(result.output.slice(-12000))
      }
    }
    const fresh = digest === inputDigest(repo, map, plan)
    return { revision: 'eypc-core-verification-v1', inputDigest: digest, fresh, status: !fresh ? 'stale' : results.length === plan.checks.length && results.every(result => result.passed) ? (results.length ? 'passed' : 'no-affected-checks') : 'failed', results }
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
}
export async function main(args = process.argv.slice(2)) {
  let planOnly = false, all = false, staged = false, base, output, files
  while (args.length) {
    const option = args.shift()
    if (option === '--plan') planOnly = true
    else if (option === '--all') all = true
    else if (option === '--staged') staged = true
    else if (['--base', '--output', '--files'].includes(option)) {
      const value = args.shift()
      if (!value || value.startsWith('--')) fail(`missing value: ${option}`)
      if (option === '--base') base = value
      if (option === '--output') output = value
      if (option === '--files') files = JSON.parse(value)
    } else fail(`unknown option: ${option}`)
  }
  if ([all, staged, Boolean(base), Boolean(files)].filter(Boolean).length > 1) fail('choose one input mode')
  const map = validateMap(JSON.parse(fs.readFileSync(path.join(root, mapPath), 'utf8')))
  const plan = selectChecks(map, all ? [] : files || changedFiles(root, { base, staged }), all)
  const report = planOnly ? { status: 'planned-not-run', plan } : { ...await executePlan(root, map, plan), plan }
  if (output) fs.writeFileSync(path.resolve(output), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
  console.log(JSON.stringify(report, null, 2))
  if (['failed', 'stale'].includes(report.status)) process.exitCode = 1
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
