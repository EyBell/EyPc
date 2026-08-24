import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const specsRoot = path.join(repoRoot, 'vibe', 'specs')
const registryRoot = path.join(specsRoot, 'requirements')
const catalogPath = path.join(specsRoot, 'source-anchors', 'catalog.json')
const write = process.argv.includes('--write')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/')
}

function walk(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(filePath))
    else files.push(filePath)
  }
  return files
}

function sourceSpecId(filePath, text) {
  const direct = /^spec_id:\s*(SPEC-[A-Z0-9-]+)\s*$/m.exec(text)
  if (direct) return direct[1]
  const sibling = path.join(path.dirname(filePath), 'spec.md')
  if (!fs.existsSync(sibling)) return null
  const spec = fs.readFileSync(sibling, 'utf8')
  return /^spec_id:\s*`?(SPEC-[A-Z0-9-]+)`?\s*$/m.exec(spec)?.[1]
    || /\b(SPEC-[0-9]{6}(?:-[0-9]{4})?-[A-Z0-9-]+)\b/.exec(spec)?.[1]
    || null
}

function requirementRegistry() {
  const byQualifiedSource = new Map()
  const specIdBySourcePath = new Map()
  for (const entry of fs.readdirSync(registryRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const text = fs.readFileSync(path.join(registryRoot, entry.name), 'utf8')
    const qualifiedSource = /^qualified_source:\s*(\S+)\s*$/m.exec(text)?.[1]
    const id = /^id:\s*(\S+)\s*$/m.exec(text)?.[1]
    const domain = /^domain:\s*(\S+)\s*$/m.exec(text)?.[1]
    if (qualifiedSource && id) {
      byQualifiedSource.set(qualifiedSource, { id, domain: domain || null })
      const sourceLink = /\[原始记录\]\((\.\.\/[^)#]+\/raw-requirement\.md)(?:#L\d+)?\)/.exec(text)?.[1]
      if (sourceLink) {
        const sourcePath = relative(path.resolve(registryRoot, sourceLink))
        specIdBySourcePath.set(sourcePath, qualifiedSource.split('::')[0])
      }
    }
  }
  return { byQualifiedSource, specIdBySourcePath }
}

function fenceMarker(line) {
  const match = /^\s*(`{3,}|~{3,})/.exec(line)
  return match ? { character: match[1][0], length: match[1].length } : null
}

function headingText(line) {
  const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
  if (!match) return null
  return { level: match[1].length, text: match[2].replace(/\s+#+\s*$/, '').trim() }
}

function rawIdentity(heading) {
  const matches = [...heading.matchAll(/\bRAW-(\d{3})\b/g)].map((match) => `RAW-${match[1]}`)
  return new Set(matches).size === 1 ? matches[0] : null
}

function parseSource(filePath, registry) {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/)
  const sourcePath = relative(filePath)
  const sourceTask = path.relative(specsRoot, path.dirname(filePath)).split(path.sep).join('/')
  const specId = sourceSpecId(filePath, text) || registry.specIdBySourcePath.get(sourcePath) || null
  const headings = []
  const markerOccurrences = new Map()
  const anchors = []
  const rawIdentities = new Set()
  let fence = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const marker = fenceMarker(line)
    if (marker) {
      if (!fence) fence = marker
      else if (marker.character === fence.character && marker.length >= fence.length) fence = null
      continue
    }
    if (fence) continue

    for (const match of line.matchAll(/\bRAW-(\d{3})\b/g)) rawIdentities.add(`RAW-${match[1]}`)
    const heading = headingText(line)
    if (heading) {
      headings.splice(heading.level - 1)
      headings[heading.level - 1] = heading.text
      continue
    }

    const ordered = /^\s{0,3}(\d{1,3})\.\s+\S/.exec(line)
    if (!ordered) continue
    const nativeMarker = ordered[1]
    const headingPath = headings.filter(Boolean)
    const exactHeading = headingPath.at(-1) || '(document-root)'
    let parentRaw = null
    for (let headingIndex = headingPath.length - 1; headingIndex >= 0; headingIndex -= 1) {
      parentRaw = rawIdentity(headingPath[headingIndex])
      if (parentRaw) break
    }
    const occurrenceKey = `${headingPath.join('\u0000')}\u0000${nativeMarker}`
    const markerOccurrence = (markerOccurrences.get(occurrenceKey) || 0) + 1
    markerOccurrences.set(occurrenceKey, markerOccurrence)
    const identitySeed = `${sourcePath}\u0000${headingPath.join('\u0000')}\u0000decimal\u0000${nativeMarker}\u0000${markerOccurrence}`
    const qualifiedSource = specId && parentRaw ? `${specId}::${parentRaw}#${nativeMarker}` : null
    const linked = qualifiedSource ? registry.byQualifiedSource.get(qualifiedSource) : null
    anchors.push({
      source_id: `SA-${sha256(identitySeed).slice(0, 20).toUpperCase()}`,
      source_task: sourceTask,
      source_path: sourcePath,
      line: index + 1,
      exact_heading_text: exactHeading,
      heading_path: headingPath,
      native_marker_kind: 'decimal',
      native_marker: nativeMarker,
      marker_occurrence: markerOccurrence,
      parent_raw_id: parentRaw,
      qualified_source: qualifiedSource,
      clause_sha256: sha256(line.trim()),
      classification: parentRaw ? 'raw-child-requirement' : 'source-addressable-candidate',
      disposition: linked
        ? 'registered-requirement'
        : parentRaw ? 'registry-review-required' : 'source-addressable-not-registered',
      semantic_module: linked?.domain || null,
      linked_current_requirement: linked?.id || null,
      selection_basis: parentRaw
        ? 'ordered-list-item-under-single-raw-heading'
        : 'ordered-list-item-outside-fenced-content-without-raw-parent'
    })
  }

  return {
    document: {
      source_task: sourceTask,
      source_path: sourcePath,
      spec_id: specId,
      content_sha256: sha256(text),
      raw_identity_count: rawIdentities.size,
      ordered_anchor_count: anchors.length,
      raw_parent_ordered_count: anchors.filter((anchor) => anchor.parent_raw_id).length,
      unparented_ordered_count: anchors.filter((anchor) => !anchor.parent_raw_id).length
    },
    anchors
  }
}

const registry = requirementRegistry()
const rawSources = walk(specsRoot)
  .filter((filePath) => path.basename(filePath) === 'raw-requirement.md')
  .sort((left, right) => relative(left).localeCompare(relative(right)))
const parsed = rawSources.map((filePath) => parseSource(filePath, registry))
const anchors = parsed.flatMap((entry) => entry.anchors)
const ids = new Set()
const errors = []
for (const anchor of anchors) {
  if (ids.has(anchor.source_id)) errors.push(`duplicate source_id ${anchor.source_id}`)
  ids.add(anchor.source_id)
  if ('clause_text' in anchor || 'raw_text' in anchor || 'prompt' in anchor) {
    errors.push(`${anchor.source_id}: raw content field is forbidden`)
  }
}

const catalog = {
  schema: 'eypc-source-anchor-catalog-v1',
  source_pattern: 'vibe/specs/**/raw-requirement.md',
  privacy_boundary: 'metadata-and-hashes-only; fenced-content-excluded; no-clause-text-or-prompt',
  identity_rule: 'source_path + heading_path + native_marker_kind + native_marker + marker_occurrence',
  summary: {
    source_documents: parsed.length,
    ordered_anchors: anchors.length,
    raw_parent_ordered: anchors.filter((anchor) => anchor.parent_raw_id).length,
    unparented_ordered: anchors.filter((anchor) => !anchor.parent_raw_id).length,
    registered_requirements: anchors.filter((anchor) => anchor.linked_current_requirement).length,
    registry_review_required: anchors.filter((anchor) => anchor.disposition === 'registry-review-required').length,
    source_addressable_not_registered: anchors.filter((anchor) => anchor.disposition === 'source-addressable-not-registered').length
  },
  documents: parsed.map((entry) => entry.document),
  anchors
}
const serialized = `${JSON.stringify(catalog, null, 2)}\n`

if (errors.length) {
  for (const error of errors) process.stderr.write(`error: ${error}\n`)
  process.exit(1)
}

if (write) {
  fs.mkdirSync(path.dirname(catalogPath), { recursive: true })
  fs.writeFileSync(catalogPath, serialized)
  process.stdout.write(`source anchors synchronized: ${catalog.summary.source_documents} documents, ${catalog.summary.ordered_anchors} ordered anchors\n`)
  process.exit(0)
}

if (!fs.existsSync(catalogPath)) {
  process.stderr.write('error: source anchor catalog is missing; run pnpm run sync:source-anchors\n')
  process.exit(1)
}
const committed = fs.readFileSync(catalogPath, 'utf8')
if (committed !== serialized) {
  process.stderr.write('error: source anchor catalog is stale; run pnpm run sync:source-anchors\n')
  process.exit(1)
}

process.stdout.write(`source anchors: documents=${catalog.summary.source_documents}, ordered=${catalog.summary.ordered_anchors}, raw-parent=${catalog.summary.raw_parent_ordered}, unparented=${catalog.summary.unparented_ordered}, source-only=${catalog.summary.source_addressable_not_registered}\n`)
process.stdout.write('source anchor validation passed\n')
