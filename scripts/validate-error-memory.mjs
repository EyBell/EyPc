import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const memoryRoot = path.join(repoRoot, 'vibe', 'knowledge', 'error-memory')
const modulesRoot = path.join(memoryRoot, 'modules')
const allowedStatuses = new Set(['candidate', 'verified', 'superseded', 'retired'])
const requiredFields = [
  'id',
  'status',
  'scope',
  'fingerprint',
  'first_seen',
  'last_verified',
  'review_after',
  'evidence',
  'tags'
]
const requiredModuleSections = [
  'Scope',
  'Current Authorities And Routes',
  'Primary Error Records',
  'Related Error Records',
  'Historical Or Migration Sources'
]
const datePattern = /^\d{4}-\d{2}-\d{2}$/

function markdownFiles(directory) {
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .sort()
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return null
  const result = {}
  let activeList = ''
  for (const rawLine of match[1].split(/\r?\n/)) {
    const field = rawLine.match(/^([a-z_]+):(?:\s*(.*))?$/)
    if (field) {
      activeList = field[1]
      result[activeList] = field[2] ? field[2].trim() : []
      continue
    }
    const item = rawLine.match(/^\s+-\s+(.+)$/)
    if (!item || !activeList) continue
    if (!Array.isArray(result[activeList])) result[activeList] = []
    result[activeList].push(item[1].trim())
  }
  return result
}

function sectionBody(text, heading) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`)
  if (start < 0) return ''
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index
      break
    }
  }
  return lines.slice(start + 1, end).join('\n')
}

function markdownTargets(text) {
  const targets = []
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g
  for (const match of text.matchAll(pattern)) {
    const target = match[1].trim().replace(/^<|>$/g, '').split('#')[0]
    if (target && !/^[a-z]+:/i.test(target)) targets.push(target)
  }
  return targets
}

function isInside(candidate, parent) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

const errors = []
const warnings = []
const leafNames = markdownFiles(memoryRoot).filter((name) => name !== 'README.md')
const leafPaths = new Map(leafNames.map((name) => [path.resolve(memoryRoot, name), name]))
const statusCounts = new Map()
const ids = new Map()
const fingerprints = new Map()

for (const name of leafNames) {
  const text = fs.readFileSync(path.join(memoryRoot, name), 'utf8')
  const metadata = parseFrontmatter(text)
  if (!metadata) {
    errors.push(`${name}: missing frontmatter`)
    continue
  }
  for (const field of requiredFields) {
    const value = metadata[field]
    if (Array.isArray(value) ? value.length === 0 : !String(value || '').trim()) {
      errors.push(`${name}: missing ${field}`)
    }
  }
  const status = String(metadata.status || '')
  if (!allowedStatuses.has(status)) errors.push(`${name}: invalid status ${status || '(empty)'}`)
  statusCounts.set(status, (statusCounts.get(status) || 0) + 1)
  for (const field of ['first_seen', 'last_verified', 'review_after']) {
    if (metadata[field] && !datePattern.test(String(metadata[field]))) {
      errors.push(`${name}: ${field} must be YYYY-MM-DD`)
    }
  }
  for (const [field, registry] of [['id', ids], ['fingerprint', fingerprints]]) {
    const value = String(metadata[field] || '')
    if (!value) continue
    const previous = registry.get(value)
    if (previous) errors.push(`${name}: duplicate ${field} also used by ${previous}`)
    else registry.set(value, name)
  }
  const reviewAfter = String(metadata.review_after || '')
  if ((status === 'candidate' || status === 'verified') && datePattern.test(reviewAfter) && reviewAfter < new Date().toISOString().slice(0, 10)) {
    warnings.push(`${name}: ${status} review overdue since ${reviewAfter}`)
  }
}

const primaryOwners = new Map(leafNames.map((name) => [name, []]))
const relatedOwners = new Map(leafNames.map((name) => [name, []]))
const moduleNames = markdownFiles(modulesRoot)
const modulePaths = new Map(moduleNames.map((name) => [path.resolve(modulesRoot, name), name]))
const routeGraph = new Map()

for (const moduleName of moduleNames) {
  const modulePath = path.join(modulesRoot, moduleName)
  const text = fs.readFileSync(modulePath, 'utf8')
  const lineCount = text.split(/\r?\n/).length
  if (lineCount > 150) errors.push(`${moduleName}: module has ${lineCount} lines (maximum 150)`)
  for (const heading of requiredModuleSections) {
    if (!new RegExp(`^## ${heading}$`, 'm').test(text)) errors.push(`${moduleName}: missing section ${heading}`)
  }
  for (const target of markdownTargets(text)) {
    const resolved = path.resolve(modulesRoot, target)
    if (!fs.existsSync(resolved)) errors.push(`${moduleName}: broken link ${target}`)
    else if (!isInside(resolved, repoRoot)) errors.push(`${moduleName}: link escapes repository ${target}`)
  }
  routeGraph.set(modulePath, markdownTargets(text)
    .map((target) => path.resolve(modulesRoot, target))
    .filter((target) => modulePaths.has(target) || target === path.join(memoryRoot, 'README.md')))
  for (const [heading, registry] of [
    ['Primary Error Records', primaryOwners],
    ['Related Error Records', relatedOwners]
  ]) {
    for (const target of markdownTargets(sectionBody(text, heading))) {
      const resolved = path.resolve(modulesRoot, target)
      if (!isInside(resolved, memoryRoot) || !leafPaths.has(resolved)) {
        errors.push(`${moduleName}: ${heading} target must be a local leaf (${target})`)
        continue
      }
      registry.get(leafPaths.get(resolved)).push(moduleName)
    }
  }
  const primaryCount = markdownTargets(sectionBody(text, 'Primary Error Records')).length
  if (primaryCount > 30) errors.push(`${moduleName}: ${primaryCount} Primary records (maximum 30)`)
}

for (const name of leafNames) {
  const primary = primaryOwners.get(name)
  const related = relatedOwners.get(name)
  if (primary.length !== 1) errors.push(`${name}: expected exactly one Primary owner, found ${primary.length}`)
  if (related.length > 2) errors.push(`${name}: expected at most two Related owners, found ${related.length}`)
}

const rootText = fs.readFileSync(path.join(memoryRoot, 'README.md'), 'utf8')
const rootPath = path.join(memoryRoot, 'README.md')
const rootTargets = markdownTargets(rootText).map((target) => path.resolve(memoryRoot, target))
for (const target of rootTargets) {
  if (!fs.existsSync(target)) errors.push(`README.md: broken link ${path.relative(memoryRoot, target)}`)
  else if (!isInside(target, repoRoot)) errors.push(`README.md: link escapes repository ${path.relative(memoryRoot, target)}`)
}
const rootLeafLinks = rootTargets
  .map((target) => path.resolve(memoryRoot, target))
  .filter((target) => leafPaths.has(target))
if (rootLeafLinks.length > 10) errors.push(`README.md: ${rootLeafLinks.length} direct leaf links (maximum 10)`)
const rootModuleLinks = rootTargets.filter((target) => modulePaths.has(target))
for (const [modulePath, moduleName] of modulePaths) {
  const linkCount = rootModuleLinks.filter((target) => target === modulePath).length
  if (linkCount !== 1) errors.push(`${moduleName}: expected exactly one root route, found ${linkCount}`)
}
routeGraph.set(rootPath, rootModuleLinks)

const visiting = new Set()
const visited = new Set()
function visitRoute(node, trail = []) {
  if (visiting.has(node)) {
    errors.push(`route cycle: ${[...trail, node].map((item) => path.relative(memoryRoot, item) || 'README.md').join(' -> ')}`)
    return
  }
  if (visited.has(node)) return
  visiting.add(node)
  for (const target of routeGraph.get(node) || []) visitRoute(target, [...trail, node])
  visiting.delete(node)
  visited.add(node)
}
visitRoute(rootPath)

const statusSummary = [...statusCounts.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([status, count]) => `${status || 'missing'}=${count}`)
  .join(', ')
console.log(`error-memory: leaves=${leafNames.length}, modules=${moduleNames.length}, ${statusSummary}`)
for (const warning of warnings) console.warn(`warning: ${warning}`)
if (errors.length) {
  for (const error of errors) console.error(`error: ${error}`)
  process.exitCode = 1
} else {
  console.log('error-memory validation passed')
}
