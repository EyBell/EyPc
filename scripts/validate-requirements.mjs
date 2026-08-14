import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const registryRoot = path.join(repoRoot, 'vibe', 'specs', 'requirements')
const modulesRoot = path.join(registryRoot, 'modules')
const allowedStatuses = new Set(['proposed', 'active', 'superseded', 'retired', 'conflicted'])
const allowedAuthorities = new Set(['user-stated', 'agent-transcribed'])
const requiredFields = ['id', 'qualified_source', 'status', 'domain', 'authority']
const requiredModuleSections = [
  'Scope',
  'Current Authorities And Routes',
  'Primary Requirements',
  'Related Requirements',
  'Historical Or Migration Sources'
]
const MODULE_CAPACITY = 200
// Index documents describe the registry; they are not requirements and must not
// be asked for frontmatter or a module owner.
const indexDocuments = new Set(['README.md', 'coverage.md', 'conflict-register.md'])

function markdownFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory).filter((name) => name.endsWith('.md')).sort()
}

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return null
  const end = text.indexOf('\n---', 4)
  if (end < 0) return null
  const fields = {}
  let listKey = ''
  for (const line of text.slice(4, end).split('\n')) {
    const item = /^\s+-\s+(.*)$/.exec(line)
    if (item && listKey) {
      fields[listKey].push(item[1].trim())
      continue
    }
    const pair = /^([a-z_]+):\s*(.*)$/.exec(line)
    if (!pair) continue
    if (pair[2] === '') {
      listKey = pair[1]
      fields[listKey] = []
    } else {
      listKey = ''
      fields[pair[1]] = pair[2].trim()
    }
  }
  return fields
}

function sectionBody(text, heading) {
  const start = text.indexOf(`\n## ${heading}`)
  if (start < 0) return null
  const rest = text.slice(start + 1)
  const next = rest.indexOf('\n## ', 1)
  return next < 0 ? rest : rest.slice(0, next)
}

const errors = []
const warnings = []

const leafNames = markdownFiles(registryRoot).filter((name) => !indexDocuments.has(name))
const leaves = new Map()
const qualifiedSources = new Map()

for (const name of leafNames) {
  const text = fs.readFileSync(path.join(registryRoot, name), 'utf8')
  const fields = parseFrontmatter(text)
  if (!fields) {
    errors.push(`${name}: missing frontmatter`)
    continue
  }
  for (const field of requiredFields) {
    if (!fields[field]) errors.push(`${name}: missing ${field}`)
  }
  if (fields.status && !allowedStatuses.has(fields.status)) {
    errors.push(`${name}: invalid status ${fields.status}`)
  }
  if (fields.authority && !allowedAuthorities.has(fields.authority)) {
    errors.push(`${name}: invalid authority ${fields.authority}`)
  }
  if (fields.qualified_source) {
    if (!/^SPEC-[A-Z0-9-]+::RAW-\d{3}$/.test(fields.qualified_source)) {
      errors.push(`${name}: qualified_source must be SPEC-<task>::RAW-nnn, found ${fields.qualified_source}`)
    }
    const previous = qualifiedSources.get(fields.qualified_source)
    // A repeated RAW id inside one task is a real duplicate, not a namespace
    // collision, so it needs its own qualified source rather than a second leaf
    // claiming the same one.
    if (previous) errors.push(`${name}: duplicate qualified_source shared with ${previous}`)
    else qualifiedSources.set(fields.qualified_source, name)
  }
  // Scoped relations are nested objects the flat parser above cannot model, and
  // they matter: 47 of them exist against 18 whole-clause supersessions, so the
  // registry would answer "is this clause replaced?" while staying silent on
  // "is this *part* of it still valid?" — the more common question.
  const front = text.slice(4, text.indexOf('\n---', 4))
  const scoped = []
  for (const block of front.split(/\n\s+- kind: /).slice(1)) {
    const kind = block.split('\n')[0].trim()
    const target = /\n\s+target:\s*(\S+)/.exec(`\n${block}`)
    const scope = /\n\s+scope:\s*(.+)/.exec(`\n${block}`)
    scoped.push({ kind, target: target ? target[1] : '', scope: scope ? scope[1].trim() : '' })
  }
  fields.__scoped = scoped
  leaves.set(name.replace(/\.md$/, ''), fields)
}

const allowedScopedKinds = new Set(['superseded-by', 'refined-by', 'refines'])
for (const [slug, fields] of leaves) {
  for (const relation of fields.__scoped || []) {
    if (!allowedScopedKinds.has(relation.kind)) {
      errors.push(`${slug}: invalid scoped relation kind ${relation.kind}`)
    }
    if (!relation.scope) errors.push(`${slug}: scoped relation to ${relation.target} names no scope`)
    const target = relation.target.replace(/^eypc-req-/, '')
    if (!relation.target) errors.push(`${slug}: scoped relation has no target`)
    else if (target === slug) errors.push(`${slug}: scoped relation points at itself`)
    else if (!leaves.has(target)) errors.push(`${slug}: scoped relation points at unknown ${relation.target}`)
  }
}

// Supersession edges must be declared from both sides: a one-sided edge means a
// clause was retired in prose without the replacement ever claiming it.
for (const [slug, fields] of leaves) {
  const by = fields.superseded_by
  if (by) {
    const target = by.replace(/^eypc-req-/, '')
    const targetFields = leaves.get(target)
    if (!targetFields) errors.push(`${slug}: superseded_by points at unknown ${by}`)
    else if (!(targetFields.supersedes || []).includes(`eypc-req-${slug}`)) {
      errors.push(`${slug}: superseded_by ${by} is not matched by a supersedes entry`)
    }
    if (fields.status !== 'superseded') {
      errors.push(`${slug}: has superseded_by but status is ${fields.status}`)
    }
  }
  for (const entry of fields.supersedes || []) {
    const source = entry.replace(/^eypc-req-/, '')
    const sourceFields = leaves.get(source)
    if (!sourceFields) errors.push(`${slug}: supersedes unknown ${entry}`)
    else if (sourceFields.superseded_by !== `eypc-req-${slug}`) {
      errors.push(`${slug}: supersedes ${entry} without the matching superseded_by`)
    }
  }
}

// A supersession cycle would make "which clause is current" unanswerable.
for (const slug of leaves.keys()) {
  const walked = new Set([slug])
  let cursor = slug
  while (true) {
    const next = leaves.get(cursor)?.superseded_by
    if (!next) break
    cursor = next.replace(/^eypc-req-/, '')
    if (walked.has(cursor)) {
      errors.push(`${slug}: supersession cycle through ${cursor}`)
      break
    }
    walked.add(cursor)
  }
}

const owners = new Map(leafNames.map((name) => [name, []]))
const moduleNames = markdownFiles(modulesRoot)
if (!moduleNames.length) errors.push('modules/: no responsibility module found')

for (const moduleName of moduleNames) {
  const text = fs.readFileSync(path.join(modulesRoot, moduleName), 'utf8')
  for (const heading of requiredModuleSections) {
    if (sectionBody(text, heading) === null) errors.push(`${moduleName}: missing section ${heading}`)
  }
  const primary = sectionBody(text, 'Primary Requirements') || ''
  const links = [...primary.matchAll(/\]\(\.\.\/([a-z0-9-]+\.md)/g)].map((match) => match[1])
  if (links.length > MODULE_CAPACITY) {
    errors.push(`${moduleName}: ${links.length} Primary requirements (maximum ${MODULE_CAPACITY})`)
  }
  for (const link of links) {
    if (!owners.has(link)) errors.push(`${moduleName}: links unknown leaf ${link}`)
    else owners.get(link).push(moduleName)
  }
}

for (const [name, moduleList] of owners) {
  if (moduleList.length === 0) errors.push(`${name}: no module claims it as Primary`)
  else if (moduleList.length > 1) errors.push(`${name}: claimed as Primary by ${moduleList.join(', ')}`)
}

const statusCounts = new Map()
for (const fields of leaves.values()) {
  statusCounts.set(fields.status, (statusCounts.get(fields.status) || 0) + 1)
}
const conflicted = statusCounts.get('conflicted') || 0
if (conflicted) warnings.push(`${conflicted} requirement(s) marked conflicted and awaiting a user decision`)
const proposed = statusCounts.get('proposed') || 0
if (proposed) warnings.push(`${proposed} requirement(s) still proposed and never confirmed by the user`)

const scopedEdges = [...leaves.values()].reduce((total, fields) => total + (fields.__scoped || []).length, 0)
const wholeEdges = [...leaves.values()].filter((fields) => fields.superseded_by).length
const summary = ['proposed', 'active', 'superseded', 'retired', 'conflicted']
  .map((status) => `${status}=${statusCounts.get(status) || 0}`)
  .join(', ')
process.stdout.write(`requirements: leaves=${leaves.size}, modules=${moduleNames.length}, ${summary}`
  + `, edges=${wholeEdges} whole + ${scopedEdges} scoped\n`)
for (const warning of warnings) process.stdout.write(`warning: ${warning}\n`)

if (errors.length) {
  for (const error of errors) process.stderr.write(`error: ${error}\n`)
  process.stderr.write('requirement registry validation failed\n')
  process.exit(1)
}

process.stdout.write('requirement registry validation passed\n')
