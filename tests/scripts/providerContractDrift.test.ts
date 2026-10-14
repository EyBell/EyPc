import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EXTRACTOR_REVISION, LIMITS, compareContractReports, inspectProviderContract, normalizeContractSchema, runCli } from '../../scripts/provider-contract-drift.mjs'

const roots: string[] = []
function temporary() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'eypc-provider-drift-'))
  roots.push(root)
  return root
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function json(root: string, name: string, value: unknown) {
  const file = join(root, name)
  writeFileSync(file, JSON.stringify(value))
  return file
}
function schema(provider = 'codex'): any {
  return { version: 1, provider, contracts: { state: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] } }, methods: { 'thread/read': { type: 'object' } } }
}
function app(root: string, name = 'Example', version = '1.0.0', format = 'unpacked') {
  const path = join(root, `${name}.app`)
  mkdirSync(join(path, 'Contents/Resources'), { recursive: true })
  writeFileSync(join(path, 'Contents/Info.plist'), `<plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleVersion</key><string>7</string></dict></plist>`)
  if (format === 'unpacked') {
    mkdirSync(join(path, 'Contents/Resources/app'))
    writeFileSync(join(path, 'Contents/Resources/app/package.json'), '{"name":"vendor-app","version":"1.0.0"}')
  } else if (format === 'asar') {
    const bytes = Buffer.from(JSON.stringify({ files: { 'index.js': { size: 10, offset: '0' } } }))
    const header = Buffer.alloc(16)
    header.writeUInt32LE(4, 0)
    header.writeUInt32LE(bytes.length + 8, 4)
    header.writeUInt32LE(bytes.length + 4, 8)
    header.writeUInt32LE(bytes.length, 12)
    writeFileSync(join(path, 'Contents/Resources/app.asar'), Buffer.concat([header, bytes, Buffer.from('never run!')]))
  }
  return path
}
function baseline(root: string, before: any, appPaths?: string[]) {
  const source = json(root, 'before.json', before)
  const report = inspectProviderContract({ provider: before.provider, schemaPath: source, appPaths })
  expect(report.errorCodes).toEqual([])
  return json(root, 'baseline.json', report)
}
function changed(before: any, after: any) {
  const root = temporary()
  return inspectProviderContract({ provider: before.provider, schemaPath: json(root, 'after.json', after), baselinePath: baseline(root, before) })
}

describe('Static provider contract drift', () => {
  it.each(['codex', 'claude', 'cursor', 'orca'])('uses manifest identity and explicit schema for %s without an app', provider => {
    const root = temporary()
    const report = inspectProviderContract({ provider, schemaPath: json(root, 'schema.json', schema(provider)) })
    expect(report).toMatchObject({ provider, artifact: { state: 'not-requested' }, contractCoverage: 'explicit-subset', assessment: 'review-required', runtimeSupport: 'unverified', errorCodes: [] })
    expect(report.structure.entries).toHaveLength(3)
  })

  it('keeps an unchanged schema stable under object-key ordering', () => {
    const before = schema()
    const after = { methods: before.methods, contracts: before.contracts, provider: 'codex', version: 1 }
    expect(changed(before, after)).toMatchObject({ assessment: 'no-structural-change', comparison: { structure: 'unchanged', changes: [] } })
  })

  it('reports version-only changes for review without asserting any runtime capability', () => {
    const root = temporary()
    const first = app(root, 'Before', '1.0.0')
    const second = app(root, 'After', '2.0.0')
    const report = inspectProviderContract({ provider: 'codex', appPaths: [second], schemaPath: json(root, 'schema.json', schema()), baselinePath: baseline(root, schema(), [first]) })
    expect(report).toMatchObject({ assessment: 'review-required', runtimeSupport: 'unverified', comparison: { structure: 'unchanged' } })
    expect(report.comparison.changes.map(change => change.kind)).toEqual(['version-changed', 'artifact-changed'])
    expect(JSON.stringify(report)).not.toMatch(/unsupported|compatible|capabilities/)
  })

  it('distinguishes optional additions, required removal and type changes', () => {
    const before = schema()
    const after = schema()
    after.contracts.state.properties.extra = { type: 'boolean' }
    after.contracts.state.properties.status.type = 'number'
    after.contracts.state.required = []
    const report = changed(before, after)
    expect(report.comparison.structure).toBe('changed')
    expect(report.comparison.changes.map(change => change.kind).sort()).toEqual(['optional-add', 'required-removed', 'type-changed'])
    delete after.contracts.state.properties.status
    expect(changed(before, after).comparison.changes.map(change => change.kind)).toContain('required-removed')
  })

  it('reports declared method and event additions/removals without guessing names from binaries', () => {
    const after = schema()
    after.methods = { 'thread/start': { type: 'object' } }
    after.events = { 'thread/changed': { type: 'array', items: { type: 'string' } } }
    const report = changed(schema(), after)
    expect(report.comparison.changes.map(change => change.kind).sort()).toEqual(['event-added', 'method-added', 'method-removed'])
    expect(report.comparison.changes.every(change => /^[a-f0-9]{64}$/.test(change.ref!))).toBe(true)
  })

  it('invalidates comparison when the extractor revision changes', () => {
    const root = temporary()
    const basePath = baseline(root, schema())
    const old = JSON.parse(readFileSync(basePath, 'utf8'))
    old.extractorRevision = 'static-provider-structure-v0'
    writeFileSync(basePath, JSON.stringify(old))
    const report = inspectProviderContract({ provider: 'codex', schemaPath: json(root, 'schema.json', schema()), baselinePath: basePath })
    expect(report.extractorRevision).toBe(EXTRACTOR_REVISION)
    expect(report.comparison).toEqual({ structure: 'unknown', changes: [{ kind: 'extractor-changed', ref: null }] })
    expect(report.assessment).toBe('review-required')
  })

  it.each(['unpacked', 'asar'])('reads only bounded static %s metadata and never claims complete capability coverage', format => {
    const root = temporary()
    const report = inspectProviderContract({ provider: 'orca', appPaths: [app(root, 'Orca', '1.4.224', format)] })
    expect(report).toMatchObject({ artifact: { state: 'observed', format: format === 'asar' ? 'asar-header' : 'unpacked', version: '1.4.224', build: '7' }, assessment: 'unknown', runtimeSupport: 'unverified', contractCoverage: 'partial', structure: { digest: null, entries: [] } })
  })

  it('reads scalar version metadata from a binary plist without a utility or vendor process', () => {
    const root = temporary()
    const bundle = app(root)
    const objects = ['CFBundleShortVersionString', '26.1007.30912', 'CFBundleVersion', '20156'].map(value => {
      const text = Buffer.from(value)
      return Buffer.concat([Buffer.from(text.length < 15 ? [0x50 + text.length] : [0x5f, 0x10, text.length]), text])
    })
    objects.push(Buffer.from([0xd2, 0, 2, 1, 3]))
    let offset = 8
    const offsets = objects.map(object => { const current = offset; offset += object.length; return current })
    const trailer = Buffer.alloc(32)
    trailer[6] = 1
    trailer[7] = 1
    trailer.writeBigUInt64BE(5n, 8)
    trailer.writeBigUInt64BE(4n, 16)
    trailer.writeBigUInt64BE(BigInt(offset), 24)
    writeFileSync(join(bundle, 'Contents/Info.plist'), Buffer.concat([Buffer.from('bplist00'), ...objects, Buffer.from(offsets), trailer]))
    expect(inspectProviderContract({ provider: 'codex', appPaths: [bundle] })).toMatchObject({ artifact: { state: 'observed', version: '26.1007.30912', build: '20156' }, errorCodes: [] })
  })

  it('reports missing and ambiguous installations as unknown and never as removed contracts', () => {
    const root = temporary()
    const basePath = baseline(root, schema())
    const paths = [[join(root, 'Absent.app')], [app(root, 'One'), app(root, 'Two')]]
    for (const [index, appPaths] of paths.entries()) {
      const report = inspectProviderContract({ provider: 'codex', appPaths, schemaPath: json(root, `schema${index}.json`, schema()), baselinePath: basePath })
      expect(report.artifact.state).toBe(index ? 'ambiguous' : 'missing')
      expect(report.assessment).toBe('unknown')
      expect(report.comparison).toEqual({ structure: 'unknown', changes: [] })
    }
  })

  it('does not infer contracts from an unknown installation layout', () => {
    const root = temporary()
    const report = inspectProviderContract({ provider: 'claude', appPaths: [app(root, 'Claude', '1.0.0', 'unknown')] })
    expect(report).toMatchObject({ assessment: 'unknown', contractCoverage: 'unavailable', errorCodes: ['layout-unknown'] })
  })

  it.each([
    { version: 9, provider: 'codex', contracts: {} },
    { ...schema(), prompt: 'PRIVATE_INPUT_MARKER' },
    { ...schema(), contracts: { bad: { type: 'string', enum: ['PRIVATE_INPUT_MARKER'] } } },
    { ...schema(), contracts: { bad: { type: 'object', required: ['absent'] } } },
    { ...schema(), contracts: { bad: { type: 'object', properties: null } } },
    { ...schema(), contracts: { bad: { type: 'array' } } }
  ])('rejects unknown or unsupported schemas without emitting input values', input => {
    const root = temporary()
    const report = inspectProviderContract({ provider: 'codex', schemaPath: json(root, 'schema.json', input), baselinePath: baseline(root, schema()) })
    expect(report.assessment).toBe('unknown')
    expect(report.errorCodes.length).toBeGreaterThan(0)
    expect(report.comparison.changes).toEqual([])
    expect(JSON.stringify(report)).not.toContain('PRIVATE_INPUT_MARKER')
  })

  it('rejects malformed JSON, excessive files, excessive schema depth and invalid providers', () => {
    const root = temporary()
    const file = join(root, 'schema.json')
    writeFileSync(file, '{PRIVATE_BODY')
    expect(inspectProviderContract({ provider: 'codex', schemaPath: file }).errorCodes).toEqual(['invalid-json'])
    writeFileSync(file, ' '.repeat(LIMITS.json + 1))
    expect(inspectProviderContract({ provider: 'codex', schemaPath: file }).errorCodes).toEqual(['size-limit'])
    let node: any = { type: 'string' }
    for (let index = 0; index <= LIMITS.depth; index++) node = { type: 'array', items: node }
    expect(() => normalizeContractSchema({ version: 1, provider: 'codex', contracts: { deep: node } }, 'codex')).toThrow('schema-limit')
    expect(inspectProviderContract({ provider: 'PRIVATE_PROVIDER' }).provider).toBeNull()
  })

  it('rejects file and directory symlinks before following them', () => {
    const root = temporary()
    const source = json(root, 'source.json', schema())
    symlinkSync(source, join(root, 'linked.json'))
    expect(inspectProviderContract({ provider: 'codex', schemaPath: join(root, 'linked.json') }).errorCodes).toEqual(['symlink-refused'])
    symlinkSync(root, join(root, 'linked-directory'))
    expect(inspectProviderContract({ provider: 'codex', schemaPath: join(root, 'linked-directory/source.json') }).errorCodes).toEqual(['symlink-refused'])
    const bundle = app(root)
    symlinkSync(bundle, join(root, 'Linked.app'))
    expect(inspectProviderContract({ provider: 'codex', appPaths: [join(root, 'Linked.app')] }).errorCodes).toEqual(['symlink-refused'])
  })

  it('bounds ASAR headers without reading their declared payloads', () => {
    const root = temporary()
    const bundle = app(root, 'Huge', '1.0.0', 'asar')
    const header = Buffer.alloc(16)
    header.writeUInt32LE(4, 0)
    header.writeUInt32LE(LIMITS.asarHeader + 1, 12)
    writeFileSync(join(bundle, 'Contents/Resources/app.asar'), header)
    expect(inspectProviderContract({ provider: 'codex', appPaths: [bundle] }).errorCodes).toEqual(['size-limit'])
  })

  it('keeps exact report keys and hashes schema identifiers instead of leaking names, paths or values', () => {
    const root = temporary()
    const input = schema()
    input.contracts.state.properties.PRIVATE_IDENTIFIER_MARKER = { type: 'string' }
    const report = inspectProviderContract({ provider: 'codex', schemaPath: json(root, 'schema.json', input) })
    expect(Object.keys(report).sort()).toEqual(['artifact', 'assessment', 'comparison', 'contractCoverage', 'errorCodes', 'extractorRevision', 'provider', 'reportRevision', 'runtimeSupport', 'structure'].sort())
    expect(Object.keys(report.artifact).sort()).toEqual(['build', 'digest', 'format', 'state', 'version'])
    expect(Object.keys(report.structure).sort()).toEqual(['digest', 'entries'])
    for (const entry of report.structure.entries) expect(Object.keys(entry).sort()).toEqual(['kind', 'ref', 'required', 'rootRef', 'type'])
    expect(JSON.stringify(report)).not.toContain(root)
    expect(JSON.stringify(report)).not.toContain('PRIVATE_IDENTIFIER_MARKER')
    expect(JSON.stringify(report)).not.toContain('thread/read')
    expect(inspectProviderContract({ provider: 'codex', schemaPath: json(root, 'auth.json', input) }).errorCodes).toEqual(['private-path-refused'])
  })

  it('rejects corrupt or cross-provider baselines and does not leak their arbitrary fields', () => {
    const root = temporary()
    const basePath = baseline(root, schema('claude'))
    const report = inspectProviderContract({ provider: 'codex', schemaPath: json(root, 'schema.json', schema()), baselinePath: basePath })
    expect(report.errorCodes).toEqual(['invalid-baseline'])
    writeFileSync(basePath, JSON.stringify({ reportRevision: 'PRIVATE_BASELINE' }))
    expect(JSON.stringify(inspectProviderContract({ provider: 'codex', schemaPath: join(root, 'schema.json'), baselinePath: basePath }))).not.toContain('PRIVATE_BASELINE')
    const current = inspectProviderContract({ provider: 'codex', schemaPath: join(root, 'schema.json') })
    const invalid = structuredClone(current)
    invalid.structure.entries[0].ref = 'PRIVATE_REFERENCE'
    expect(() => compareContractReports(invalid, current)).toThrow('invalid-baseline')
  })

  it('supports CLI schema/baseline/output, refuses overwrites and emits only a sanitized error for bad arguments', () => {
    const root = temporary()
    const schemaPath = json(root, 'schema.json', schema())
    const basePath = baseline(root, schema())
    const before = readFileSync(basePath, 'utf8')
    const output = join(root, 'report.json')
    let stdout = ''
    expect(runCli(['--provider', 'codex', '--schema', schemaPath, '--baseline', basePath, '--output', output], text => { stdout += text })).toBe(0)
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(JSON.parse(stdout))
    expect(JSON.parse(stdout).assessment).toBe('no-structural-change')
    expect(readFileSync(basePath, 'utf8')).toBe(before)
    stdout = ''
    expect(runCli(['--provider', 'codex', '--schema', schemaPath, '--baseline', basePath, '--output', basePath], text => { stdout += text })).toBe(2)
    expect(JSON.parse(stdout).errorCodes).toContain('output-path-refused')
    expect(readFileSync(basePath, 'utf8')).toBe(before)
    stdout = ''
    expect(runCli(['--provider', 'codex', '--schema', schemaPath, '--output', output], text => { stdout += text })).toBe(2)
    expect(JSON.parse(stdout).errorCodes).toContain('output-exists')
    stdout = ''
    expect(runCli(['--bad', 'PRIVATE_ARGUMENT'], text => { stdout += text })).toBe(2)
    expect(stdout).not.toContain('PRIVATE_ARGUMENT')
  })
})
