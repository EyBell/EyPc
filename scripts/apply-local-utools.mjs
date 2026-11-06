import { constants, copyFileSync, existsSync, lstatSync, openSync, readSync, closeSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { basename, resolve } from 'node:path'

// The caller identifies both packages and their expected hashes explicitly.
// Never close uTools or replace a package while any process still has it open.
const [mode, candidateArg, targetArg, expectedCandidate, expectedTarget] = process.argv.slice(2)
if (!['--check', '--apply'].includes(mode) || !candidateArg || !targetArg || !/^[a-f0-9]{64}$/.test(expectedCandidate || '') || !/^[a-f0-9]{64}$/.test(expectedTarget || '')) throw new Error('usage: --check|--apply candidate target expected-candidate-sha256 expected-target-sha256')
const candidate = resolve(candidateArg), target = resolve(targetArg)
if (candidate === target || !/^unsafe-[a-f0-9]+\.asar$/.test(basename(target))) throw new Error('target must be an explicitly identified installed unsafe asar')
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex')
function regular(path) { const s = lstatSync(path); if (!s.isFile() || s.isSymbolicLink()) throw new Error(`not a regular file: ${path}`); return s }
function manifest(path) {
  const fd = openSync(path, 'r')
  try {
    const b = Buffer.alloc(16); if (readSync(fd, b, 0, 16, 0) !== 16 || b.readUInt32LE(0) !== 4) throw new Error('invalid asar')
    const length = b.readUInt32LE(12); if (!length || length > 16 * 1024 * 1024) throw new Error('invalid asar header')
    const h = Buffer.alloc(length); if (readSync(fd, h, 0, length, 16) !== length) throw new Error('short asar header')
    const entry = JSON.parse(h.toString()).files?.['plugin.json']
    if (!entry || entry.unpacked || entry.link || !Number.isInteger(entry.size) || entry.size > 1024 * 1024 || !/^\d+$/.test(entry.offset)) throw new Error('invalid plugin manifest entry')
    const data = Buffer.alloc(entry.size); if (readSync(fd, data, 0, data.length, 8 + b.readUInt32LE(4) + Number(entry.offset)) !== data.length) throw new Error('short plugin manifest')
    return JSON.parse(data.toString())
  } finally { closeSync(fd) }
}
function files(path, prefix = '') {
  if (!existsSync(path)) throw new Error(`missing native directory: ${path}`)
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const next = `${path}/${entry.name}`, label = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) return files(next, label)
    if (!entry.isFile()) throw new Error(`unexpected native entry: ${label}`)
    return [`${label} ${digest(next)}`]
  }).sort()
}
function occupied() {
  const result = spawnSync('lsof', ['-n', '-t', '--', target], { encoding: 'utf8' })
  if (result.error || (result.status !== 0 && result.status !== 1)) throw new Error('unable to establish package ownership')
  return result.status === 0 && result.stdout.trim() !== ''
}
const oldStat = regular(target); regular(candidate)
if (digest(candidate) !== expectedCandidate || digest(target) !== expectedTarget) throw new Error('package changed since review')
const oldManifest = manifest(target), newManifest = manifest(candidate)
if (!/^[a-zA-Z0-9]{3,16}$/.test(newManifest.name || '') || !newManifest.version || oldManifest.name !== newManifest.name || oldManifest.version !== newManifest.version) throw new Error('installed and candidate identities differ')
if (JSON.stringify(files(`${candidate}.unpacked`)) !== JSON.stringify(files(`${target}.unpacked`))) throw new Error('native modules differ; separate installation required')
if (occupied()) { console.log('BLOCKED: installed package is still open; exit uTools first'); process.exit(2) }
if (mode === '--check') { console.log('READY: identity, hashes, native modules and open-file check passed'); process.exit(0) }
const suffix = randomBytes(8).toString('hex'), backup = `${target}.eypc-backup-${suffix}`, pending = `${target}.eypc-new-${suffix}`
copyFileSync(target, backup, constants.COPYFILE_EXCL)
copyFileSync(candidate, pending, constants.COPYFILE_EXCL)
const current = regular(target)
if (current.ino !== oldStat.ino || current.dev !== oldStat.dev || digest(target) !== expectedTarget || occupied()) throw new Error(`target changed or reopened; backup retained at ${backup}`)
renameSync(pending, target)
if (digest(target) !== expectedCandidate) throw new Error(`replacement verification failed; backup retained at ${backup}`)
console.log(`APPLIED ${target}\nBACKUP ${backup}`)
