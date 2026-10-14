import * as fs from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, parse, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const EXTRACTOR_REVISION = 'static-provider-structure-v1'
export const REPORT_REVISION = 'provider-contract-drift-v1'
export const LIMITS = Object.freeze({ json: 1024 * 1024, metadata: 256 * 1024, asarHeader: 16 * 1024 * 1024, nodes: 2048, depth: 12 })
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
const HASH = /^[a-f0-9]{64}$/
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.\/-]{0,95}$/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const digest = value => createHash('sha256').update(value).digest('hex')
class InputError extends Error { constructor(code) { super(code); this.code = code } }
const fail = code => { throw new InputError(code) }
const errorCode = error => error instanceof InputError ? error.code : 'read-failed'
const keysOnly = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key))

// Explicit paths are still refused when they identify private stores. Never resolve
// symlinks: each existing component and the opened file must remain the same inode.
function checkedPath(input, missingLeaf = false) {
  if (typeof input !== 'string' || !input || input.includes('\0')) fail('invalid-path')
  const absolute = resolve(input)
  const components = absolute.slice(parse(absolute).root.length).split(/[\\/]/).filter(Boolean)
  if (components.some(part => /^(?:\.codex|\.claude|\.cursor|\.orca|\.ssh|\.aws|Keychains|Logs|Application Support|credentials(?:\.json)?|\.credentials\.json|auth\.json|secrets(?:\.json)?|tokens?\.json|\.env(?:\..*)?|sessions?|conversations?|rollouts?|history\.jsonl)$/i.test(part))) fail('private-path-refused')
  let current = parse(absolute).root
  for (let index = 0; index < components.length; index += 1) {
    current = join(current, components[index])
    let stat
    try { stat = fs.lstatSync(current) } catch (error) {
      if (error.code === 'ENOENT' && missingLeaf && index === components.length - 1) return { path: absolute, stat: null }
      if (error.code === 'ENOENT') fail('missing')
      fail('read-failed')
    }
    if (stat.isSymbolicLink()) fail('symlink-refused')
    if (index < components.length - 1 && !stat.isDirectory()) fail('invalid-path')
    if (index === components.length - 1) return { path: absolute, stat }
  }
  fail('invalid-path')
}

function withFile(input, action) {
  const checked = checkedPath(input)
  if (!checked.stat.isFile()) fail('not-a-file')
  let fd
  try {
    fd = fs.openSync(checked.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    const stat = fs.fstatSync(fd)
    if (!stat.isFile() || stat.ino !== checked.stat.ino || stat.dev !== checked.stat.dev) fail('input-changed')
    const result = action(fd, stat)
    const after = fs.fstatSync(fd)
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) fail('input-changed')
    return result
  } finally { if (fd !== undefined) fs.closeSync(fd) }
}

function readBytes(input, limit) {
  return withFile(input, (fd, stat) => {
    if (stat.size > limit) fail('size-limit')
    const bytes = Buffer.alloc(stat.size)
    if (fs.readSync(fd, bytes, 0, bytes.length, 0) !== bytes.length) fail('input-changed')
    return bytes
  })
}

function jsonBytes(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { fail('invalid-json') }
}

function providerRegistry() {
  const manifest = jsonBytes(readBytes(join(ROOT, 'preload/companion/provider-manifest.json'), LIMITS.metadata))
  if (!Array.isArray(manifest.order) || !record(manifest.providers)) fail('invalid-manifest')
  return manifest.order.map(id => {
    const row = manifest.providers[id]
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(id) || row?.id !== id || !/^[A-Za-z0-9 -]{1,48}$/.test(row.label)) fail('invalid-manifest')
    return { id, label: row.label }
  })
}

// Info.plist may be XML or binary. Only two scalar metadata keys are selected;
// nested values and all other dictionary values are never traversed or returned.
function plistVersions(bytes) {
  const names = ['CFBundleShortVersionString', 'CFBundleVersion']
  let values
  if (bytes.subarray(0, 8).toString() === 'bplist00') {
    if (bytes.length < 40) fail('invalid-metadata')
    const trailer = bytes.length - 32
    const offsetWidth = bytes[trailer + 6]
    const refWidth = bytes[trailer + 7]
    const uint = (offset, width) => {
      if (width < 1 || width > 8 || offset < 0 || offset + width > bytes.length) fail('invalid-metadata')
      let result = 0n
      for (let index = 0; index < width; index += 1) result = result * 256n + BigInt(bytes[offset + index])
      if (result > BigInt(Number.MAX_SAFE_INTEGER)) fail('invalid-metadata')
      return Number(result)
    }
    const count = uint(trailer + 8, 8)
    const root = uint(trailer + 16, 8)
    const table = uint(trailer + 24, 8)
    if (!count || count > 8192 || root >= count || table + count * offsetWidth > trailer) fail('invalid-metadata')
    const object = reference => {
      if (reference >= count) fail('invalid-metadata')
      let offset = uint(table + reference * offsetWidth, offsetWidth)
      if (offset < 8 || offset >= table) fail('invalid-metadata')
      const marker = bytes[offset++]
      let length = marker & 15
      if (length === 15) {
        const sizeMarker = bytes[offset++]
        if (sizeMarker >> 4 !== 1) fail('invalid-metadata')
        const width = 2 ** (sizeMarker & 15)
        length = uint(offset, width)
        offset += width
      }
      return { kind: marker >> 4, length, offset }
    }
    const scalar = reference => {
      const value = object(reference)
      if (![5, 6].includes(value.kind)) return null
      const width = value.kind === 6 ? 2 : 1
      if (value.length > 256 || value.offset + value.length * width > table) fail('invalid-metadata')
      const text = bytes.subarray(value.offset, value.offset + value.length * width)
      return width === 1 ? text.toString('ascii') : Buffer.from(text).swap16().toString('utf16le')
    }
    const dictionary = object(root)
    if (dictionary.kind !== 13 || dictionary.length > 1024 || dictionary.offset + dictionary.length * refWidth * 2 > table) fail('invalid-metadata')
    values = names.map(name => {
      for (let index = 0; index < dictionary.length; index += 1) {
        if (scalar(uint(dictionary.offset + index * refWidth, refWidth)) !== name) continue
        return scalar(uint(dictionary.offset + (dictionary.length + index) * refWidth, refWidth))
      }
      return null
    })
  } else {
    const text = bytes.toString('utf8')
    if (!/<plist[\s>]/.test(text) || !/<dict>/.test(text)) fail('invalid-metadata')
    values = names.map(name => new RegExp(`<key>\\s*${name}\\s*</key>\\s*<string>([^<]{1,128})</string>`).exec(text)?.[1] || null)
  }
  const safe = value => typeof value === 'string' && /^\d[A-Za-z0-9.+_-]{0,63}$/.test(value) ? value : null
  return { version: safe(values[0]), build: safe(values[1]) }
}

function asarHeaderDigest(input) {
  return withFile(input, (fd, stat) => {
    const prefix = Buffer.alloc(16)
    if (fs.readSync(fd, prefix, 0, 16, 0) !== 16 || prefix.readUInt32LE(0) !== 4) fail('invalid-asar')
    const length = prefix.readUInt32LE(12)
    if (length > LIMITS.asarHeader) fail('size-limit')
    if (length < 2 || length + 16 > stat.size) fail('invalid-asar')
    const bytes = Buffer.alloc(length)
    if (fs.readSync(fd, bytes, 0, length, 16) !== length) fail('input-changed')
    if (!record(jsonBytes(bytes).files)) fail('invalid-asar')
    return digest(bytes)
  })
}

const emptyArtifact = state => ({ state, format: 'none', version: null, build: null, digest: null })
function artifactFor(provider, paths, schemaOnly) {
  if (schemaOnly && paths === undefined) return { artifact: emptyArtifact('not-requested'), errors: [] }
  const candidates = paths === undefined
    ? [...new Set([provider.label, ...(provider.id === 'codex' ? ['ChatGPT'] : [])])].map(name => `/Applications/${name}.app`)
    : paths
  if (!Array.isArray(candidates) || !candidates.length || candidates.length > 8) return { artifact: emptyArtifact('unknown'), errors: ['invalid-app-paths'] }
  try {
    const found = []
    for (const candidate of [...new Set(candidates)]) {
      if (typeof candidate !== 'string' || !candidate.endsWith('.app')) fail('invalid-app-path')
      try {
        const checked = checkedPath(candidate)
        if (!checked.stat.isDirectory()) fail('invalid-app-path')
        found.push(checked.path)
      } catch (error) { if (errorCode(error) !== 'missing') throw error }
    }
    if (!found.length) return { artifact: emptyArtifact('missing'), errors: ['app-missing'] }
    if (found.length > 1) return { artifact: emptyArtifact('ambiguous'), errors: ['app-ambiguous'] }
    const app = found[0]
    const info = readBytes(join(app, 'Contents/Info.plist'), LIMITS.metadata)
    const metadata = plistVersions(info)
    const resources = join(app, 'Contents/Resources')
    const exists = file => { try { checkedPath(file); return true } catch (error) { if (errorCode(error) === 'missing') return false; throw error } }
    const asar = exists(join(resources, 'app.asar'))
    const unpacked = exists(join(resources, 'app/package.json'))
    if (asar === unpacked) fail(asar ? 'layout-ambiguous' : 'layout-unknown')
    const parts = [digest(info)]
    if (asar) parts.push(asarHeaderDigest(join(resources, 'app.asar')))
    else {
      const packageBytes = readBytes(join(resources, 'app/package.json'), LIMITS.metadata)
      if (!record(jsonBytes(packageBytes))) fail('invalid-metadata')
      parts.push(digest(packageBytes))
      const product = join(resources, 'app/product.json')
      if (exists(product)) {
        const bytes = readBytes(product, LIMITS.metadata)
        if (!record(jsonBytes(bytes))) fail('invalid-metadata')
        parts.push(digest(bytes))
      }
    }
    return { artifact: { state: 'observed', format: asar ? 'asar-header' : 'unpacked', ...metadata, digest: digest(JSON.stringify(parts)) }, errors: [] }
  } catch (error) { return { artifact: emptyArtifact('unknown'), errors: [errorCode(error)] } }
}

/** Strict, explicitly supplied schema subset. Names become opaque references;
 * values, enum members, descriptions, examples and extensions never enter reports.
 * Each input is a declared subset, not an exhaustive statement about the vendor. */
export function normalizeContractSchema(input, provider) {
  if (!keysOnly(input, ['version', 'provider', 'contracts', 'methods', 'events']) || input.version !== 1 || input.provider !== provider) fail('invalid-schema')
  const entries = []
  const visit = (node, kind, rootRef, pathParts, required, depth) => {
    if (depth > LIMITS.depth || entries.length >= LIMITS.nodes) fail('schema-limit')
    if (!keysOnly(node, ['type', 'properties', 'required', 'items']) || !TYPES.has(node.type)) fail('unsupported-schema')
    if (node.type !== 'object' && (own(node, 'properties') || own(node, 'required'))) fail('invalid-schema')
    if (node.type !== 'array' && own(node, 'items')) fail('invalid-schema')
    const ref = pathParts.length ? digest(JSON.stringify([rootRef, pathParts])) : rootRef
    entries.push({ ref, rootRef, kind, type: node.type, required })
    if (node.type === 'object') {
      const properties = own(node, 'properties') ? node.properties : {}
      const requiredNames = own(node, 'required') ? node.required : []
      if (!record(properties) || Object.keys(properties).length > 128 || !Array.isArray(requiredNames)
        || new Set(requiredNames).size !== requiredNames.length
        || requiredNames.some(name => typeof name !== 'string' || !own(properties, name))) fail('invalid-schema')
      for (const name of Object.keys(properties).sort()) {
        if (!IDENTIFIER.test(name)) fail('invalid-schema')
        visit(properties[name], kind, rootRef, [...pathParts, name], requiredNames.includes(name), depth + 1)
      }
    } else if (node.type === 'array') {
      if (!own(node, 'items')) fail('invalid-schema')
      visit(node.items, kind, rootRef, [...pathParts, '[]'], true, depth + 1)
    }
  }
  for (const [key, kind] of [['contracts', 'contract'], ['methods', 'method'], ['events', 'event']]) {
    if (!own(input, key)) continue
    if (!record(input[key]) || Object.keys(input[key]).length > 64) fail('invalid-schema')
    for (const name of Object.keys(input[key]).sort()) {
      if (!IDENTIFIER.test(name)) fail('invalid-schema')
      const rootRef = digest(JSON.stringify([kind, name]))
      visit(input[key][name], kind, rootRef, [], true, 0)
    }
  }
  if (!entries.length) fail('invalid-schema')
  entries.sort((left, right) => left.ref.localeCompare(right.ref))
  return { digest: digest(JSON.stringify(entries)), entries }
}

function validateBaseline(input, provider) {
  if (!keysOnly(input, ['reportRevision', 'extractorRevision', 'provider', 'artifact', 'contractCoverage', 'structure', 'comparison', 'assessment', 'runtimeSupport', 'errorCodes'])
    || input.reportRevision !== REPORT_REVISION || input.provider !== provider
    || !/^[A-Za-z0-9._-]{1,64}$/.test(input.extractorRevision || '')
    || !record(input.artifact) || !record(input.structure)) fail('invalid-baseline')
  if (!['explicit-subset', 'partial', 'unavailable'].includes(input.contractCoverage)) fail('invalid-baseline')
  const entries = input.structure.entries
  if (!Array.isArray(entries) || entries.length > LIMITS.nodes || !keysOnly(input.structure, ['digest', 'entries'])) fail('invalid-baseline')
  if (entries.some(entry => !keysOnly(entry, ['ref', 'rootRef', 'kind', 'type', 'required'])
    || !HASH.test(entry.ref) || !HASH.test(entry.rootRef) || !['contract', 'method', 'event'].includes(entry.kind)
    || !TYPES.has(entry.type) || typeof entry.required !== 'boolean')) fail('invalid-baseline')
  if (new Set(entries.map(entry => entry.ref)).size !== entries.length) fail('invalid-baseline')
  if (input.contractCoverage === 'explicit-subset' && (!entries.length || digest(JSON.stringify(entries)) !== input.structure.digest)) fail('invalid-baseline')
  return input
}

export function compareContractReports(current, baseline) {
  if (!baseline) return { structure: 'no-baseline', changes: [] }
  validateBaseline(current, current.provider)
  validateBaseline(baseline, current.provider)
  const changes = []
  const add = (kind, ref = null) => changes.push({ kind, ref })
  if (current.extractorRevision !== baseline.extractorRevision) {
    add('extractor-changed')
    return { structure: 'unknown', changes }
  }
  if (current.artifact.state === 'observed' && baseline.artifact.state === 'observed') {
    if (current.artifact.version !== baseline.artifact.version) add('version-changed')
    if (current.artifact.build !== baseline.artifact.build) add('build-changed')
    if (current.artifact.digest !== baseline.artifact.digest) add('artifact-changed')
  }
  const usable = report => report.contractCoverage === 'explicit-subset' && ['observed', 'not-requested'].includes(report.artifact.state)
  if (!usable(current) || !usable(baseline)) return { structure: 'unknown', changes }
  const previous = new Map(baseline.structure.entries.map(entry => [entry.ref, entry]))
  const next = new Map(current.structure.entries.map(entry => [entry.ref, entry]))
  const rootChanges = new Set()
  for (const [source, other, direction] of [[next, previous, 'added'], [previous, next, 'removed']]) {
    for (const entry of source.values()) {
      if (entry.ref === entry.rootRef && !other.has(entry.ref)) {
        add(`${entry.kind}-${direction}`, entry.ref)
        rootChanges.add(entry.rootRef)
      }
    }
  }
  for (const entry of next.values()) {
    if (rootChanges.has(entry.rootRef)) continue
    const before = previous.get(entry.ref)
    if (!before) add(entry.required ? 'required-added' : 'optional-add', entry.ref)
    else {
      if (before.type !== entry.type) add('type-changed', entry.ref)
      if (before.required !== entry.required) add(entry.required ? 'required-added' : 'required-removed', entry.ref)
    }
  }
  for (const entry of previous.values()) {
    if (!rootChanges.has(entry.rootRef) && !next.has(entry.ref)) add(entry.required ? 'required-removed' : 'optional-removed', entry.ref)
  }
  return { structure: current.structure.digest === baseline.structure.digest ? 'unchanged' : 'changed', changes }
}

function emptyReport(provider = null) {
  return { reportRevision: REPORT_REVISION, extractorRevision: EXTRACTOR_REVISION, provider,
    artifact: emptyArtifact('unknown'), contractCoverage: 'unavailable', structure: { digest: null, entries: [] },
    comparison: { structure: 'no-baseline', changes: [] }, assessment: 'unknown', runtimeSupport: 'unverified', errorCodes: [] }
}

export function inspectProviderContract(options = {}) {
  const report = emptyReport()
  try {
    const provider = providerRegistry().find(row => row.id === options.provider)
    if (!provider) fail('invalid-provider')
    report.provider = provider.id
    const artifact = artifactFor(provider, options.appPaths, Boolean(options.schemaPath))
    report.artifact = artifact.artifact
    report.errorCodes.push(...artifact.errors)
    if (report.artifact.state === 'observed') report.contractCoverage = 'partial'
    if (options.schemaPath) {
      report.structure = normalizeContractSchema(jsonBytes(readBytes(options.schemaPath, LIMITS.json)), provider.id)
      report.contractCoverage = 'explicit-subset'
    }
    const baseline = options.baselinePath ? jsonBytes(readBytes(options.baselinePath, LIMITS.json)) : null
    report.comparison = compareContractReports(report, baseline)
    if (report.contractCoverage === 'explicit-subset' && !report.errorCodes.length) {
      report.assessment = report.comparison.structure === 'unchanged' && !report.comparison.changes.length
        ? 'no-structural-change' : 'review-required'
    }
  } catch (error) {
    report.errorCodes.push(errorCode(error))
    report.comparison = { structure: 'unknown', changes: [] }
  }
  return report
}

/** --app is repeatable so explicit ambiguous installations can be reported. */
export function runCli(argv, write = text => process.stdout.write(text)) {
  let report
  let output
  try {
    const options = {}
    for (let index = 0; index < argv.length; index += 2) {
      const flag = argv[index]
      const value = argv[index + 1]
      if (!['--provider', '--app', '--schema', '--baseline', '--output'].includes(flag) || !value || value.startsWith('--')) fail('invalid-arguments')
      if (flag === '--app') (options.appPaths ||= []).push(value)
      else {
        const key = { '--provider': 'provider', '--schema': 'schemaPath', '--baseline': 'baselinePath', '--output': 'output' }[flag]
        if (own(options, key)) fail('invalid-arguments')
        options[key] = value
      }
    }
    output = options.output
    report = inspectProviderContract(options)
    if (output) {
      if ([options.schemaPath, options.baselinePath].some(input => input && resolve(input) === resolve(output))
        || resolve(output).split(/[\\/]/).some(part => part.endsWith('.app'))) fail('output-path-refused')
      const checked = checkedPath(output, true)
      if (checked.stat) fail('output-exists')
      const fd = fs.openSync(checked.path, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600)
      try { fs.writeFileSync(fd, `${JSON.stringify(report, null, 2)}\n`) } finally { fs.closeSync(fd) }
    }
  } catch (error) {
    report ||= emptyReport()
    report.assessment = 'unknown'
    report.errorCodes.push(errorCode(error))
  }
  write(`${JSON.stringify(report)}\n`)
  return report.assessment === 'unknown' ? 2 : 0
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exitCode = runCli(process.argv.slice(2))
