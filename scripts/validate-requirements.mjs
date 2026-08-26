import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const vibeRoot = path.join(repoRoot, 'vibe')
const specsRoot = path.join(vibeRoot, 'specs')
const registryRoot = path.join(repoRoot, 'vibe', 'specs', 'requirements')
const modulesRoot = path.join(registryRoot, 'modules')
const productRequirementsPath = path.join(specsRoot, 'PRODUCT_REQUIREMENTS.md')
const sourceCatalogPath = path.join(specsRoot, 'source-anchors', 'catalog.json')
const architecturePath = path.join(vibeRoot, 'knowledge', 'ARCHITECTURE.md')
const runtimeIdentityPath = path.join(repoRoot, 'public', 'runtime-identity.cjs')
const companionContractSchemaPath = path.join(repoRoot, 'contracts', 'companion-v7.schema.json')
const writeCurrentTruth = process.argv.includes('--write-current-truth')
const currentTruthOwnerMarker = '<!-- eypc-current-product-truth-owner:v1 -->'
const currentTruthStart = '<!-- eypc-current-product-truth:start -->'
const currentTruthEnd = '<!-- eypc-current-product-truth:end -->'
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

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return []
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(filePath))
    else files.push(filePath)
  }
  return files
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/')
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function digestFiles(filePaths) {
  const digest = crypto.createHash('sha256')
  for (const filePath of [...filePaths].sort((left, right) => relative(left).localeCompare(relative(right)))) {
    digest.update(relative(filePath))
    digest.update('\0')
    digest.update(fs.readFileSync(filePath))
    digest.update('\0')
  }
  return digest.digest('hex')
}

function currentTruthRange(text) {
  const start = text.indexOf(currentTruthStart)
  const end = text.indexOf(currentTruthEnd)
  if (start < 0 || end < start) return null
  if (text.indexOf(currentTruthStart, start + currentTruthStart.length) >= 0) return null
  if (text.indexOf(currentTruthEnd, end + currentTruthEnd.length) >= 0) return null
  return { start, end: end + currentTruthEnd.length }
}

function productBodyForDigest(text) {
  const range = currentTruthRange(text)
  if (!range) return null
  return `${text.slice(0, range.start)}${currentTruthStart}\n<deterministic-current-product-truth>\n${currentTruthEnd}${text.slice(range.end)}`
}

function renderCurrentTruthBlock(truth) {
  const registry = truth.requirement_registry
  const sources = truth.source_anchor_catalog
  const runtime = truth.runtime_identity
  const runtimeChain = [
    runtime.task_state,
    runtime.registry,
    runtime.topology,
    runtime.kernel,
    runtime.snapshot,
    runtime.command,
    runtime.subscribe,
    runtime.ack
  ].join(' / ')
  const builtAtLine = runtime.built_at_local && runtime.built_at
    ? `| 当前构建时间 | \`${runtime.built_at_local}\`（\`${runtime.built_at}\`） |`
    : ''
  return `${currentTruthStart}
## 全局当前真值快照

> 本节由统一需求校验器根据当前登记、来源目录、架构正文和 Runtime Identity 确定性生成。任何受管输入变化而未同步时，校验直接失败；墙上时钟不参与“新鲜”判定。

| 真值维度 | 当前唯一值 |
| --- | --- |
| 当前产品语义主文档 | \`${truth.sole_owner}\`（唯一 owner marker） |
| 需求登记 | ${registry.leaves} leaves / ${registry.modules} modules / ${registry.active} active / ${registry.superseded} superseded / ${registry.proposed} proposed / ${registry.conflicted} conflicted |
| 取代关系 | ${registry.whole_supersession_edges} whole / ${registry.scoped_relations} scoped |
| 原始来源 | ${sources.documents} documents / ${sources.ordered_anchors} ordered / ${sources.raw_parent_ordered} RAW-parent / ${sources.source_only} source-only |
| 当前核心版本 | \`${runtime.core_version_label}\`（\`${runtime.core_version}\`） |
| 当前统一运行合同 | \`${runtimeChain}\` |
| 当前构建产物 | \`${runtime.host_asset} / ${runtime.renderer_asset}\` · \`${runtime.artifact_state}\` |
${builtAtLine}
| 新鲜度合同 | \`${truth.freshness}\` |

<details>
<summary>机器清单与内容指纹</summary>

\`\`\`json current-product-truth-v1
${JSON.stringify(truth, null, 2)}
\`\`\`

</details>
${currentTruthEnd}`
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
    // `#n` addresses a numbered clause written under a RAW heading in the source
    // document. Both halves already exist there — the parent id and the ordinal
    // — so a sub-clause leaf transcribes an identity rather than inventing one.
    // Clauses with no RAW-bearing parent stay out of the registry; giving them
    // numbers would be requirement authoring. See coverage.md.
    if (!/^SPEC-[A-Z0-9-]+::RAW-\d{3}(#\d{1,3})?$/.test(fields.qualified_source)) {
      errors.push(`${name}: qualified_source must be SPEC-<task>::RAW-nnn or SPEC-<task>::RAW-nnn#n, found ${fields.qualified_source}`)
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
  // An index document is never a leaf, so a link to one inside this section is
  // explanatory prose rather than a claim of ownership.
  const links = [...primary.matchAll(/\]\(\.\.\/([a-z0-9-]+\.md)/g)]
    .map((match) => match[1])
    .filter((link) => !indexDocuments.has(link))
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

let productText = ''
if (!fs.existsSync(productRequirementsPath)) {
  errors.push('PRODUCT_REQUIREMENTS.md: missing global current product truth owner')
} else {
  productText = fs.readFileSync(productRequirementsPath, 'utf8')
}

const truthOwners = walkFiles(vibeRoot)
  .filter((filePath) => filePath.endsWith('.md'))
  .filter((filePath) => fs.readFileSync(filePath, 'utf8').includes(currentTruthOwnerMarker))
if (truthOwners.length !== 1 || truthOwners[0] !== productRequirementsPath) {
  errors.push(`current product truth owner must be unique at vibe/specs/PRODUCT_REQUIREMENTS.md; found ${truthOwners.map(relative).join(', ') || 'none'}`)
}
if (productText && productText.split(currentTruthOwnerMarker).length !== 2) {
  errors.push('PRODUCT_REQUIREMENTS.md: current truth owner marker must appear exactly once')
}

const truthRange = productText ? currentTruthRange(productText) : null
if (!truthRange) errors.push('PRODUCT_REQUIREMENTS.md: missing or duplicate deterministic current truth block')

const rawSourceFiles = walkFiles(specsRoot)
  .filter((filePath) => path.basename(filePath) === 'raw-requirement.md')
  .sort((left, right) => relative(left).localeCompare(relative(right)))
let sourceCatalog = null
if (!fs.existsSync(sourceCatalogPath)) {
  errors.push('source-anchors/catalog.json: missing source anchor catalog')
} else {
  try {
    sourceCatalog = JSON.parse(fs.readFileSync(sourceCatalogPath, 'utf8'))
  } catch {
    errors.push('source-anchors/catalog.json: invalid JSON')
  }
}

if (sourceCatalog) {
  const catalogDocuments = new Map((sourceCatalog.documents || []).map((document) => [document.source_path, document.content_sha256]))
  if (catalogDocuments.size !== rawSourceFiles.length) {
    errors.push(`source anchor catalog document count ${catalogDocuments.size} does not match current raw sources ${rawSourceFiles.length}`)
  }
  for (const filePath of rawSourceFiles) {
    const sourcePath = relative(filePath)
    const expectedHash = sha256(fs.readFileSync(filePath))
    if (catalogDocuments.get(sourcePath) !== expectedHash) {
      errors.push(`${sourcePath}: source anchor catalog content hash is stale`)
    }
  }
  for (const sourcePath of catalogDocuments.keys()) {
    if (!rawSourceFiles.some((filePath) => relative(filePath) === sourcePath)) {
      errors.push(`${sourcePath}: source anchor catalog references a missing raw source`)
    }
  }
}

let runtimeIdentity = null
if (!fs.existsSync(runtimeIdentityPath)) {
  errors.push('public/runtime-identity.cjs: missing current runtime identity')
} else {
  try {
    runtimeIdentity = require(runtimeIdentityPath)
  } catch {
    errors.push('public/runtime-identity.cjs: cannot load current runtime identity')
  }
}

let taskStateRevision = null
if (!fs.existsSync(companionContractSchemaPath)) {
  errors.push('contracts/companion-v7.schema.json: missing generated-contract source')
} else {
  try {
    const companionContractSchema = JSON.parse(fs.readFileSync(companionContractSchemaPath, 'utf8'))
    taskStateRevision = companionContractSchema?.properties?.revisions?.properties?.taskState?.const || null
  } catch {
    errors.push('contracts/companion-v7.schema.json: cannot parse generated-contract source')
  }
}
if (!taskStateRevision) errors.push('contracts/companion-v7.schema.json: missing revisions.taskState.const')

if (sourceCatalog && runtimeIdentity && taskStateRevision && truthRange) {
  const registryFiles = [
    ...markdownFiles(registryRoot).map((name) => path.join(registryRoot, name)),
    ...moduleNames.map((name) => path.join(modulesRoot, name))
  ]
  const productBody = productBodyForDigest(productText)
  const truth = {
    schema: 'eypc-current-product-truth-v1',
    sole_owner: 'vibe/specs/PRODUCT_REQUIREMENTS.md',
    freshness: 'deterministic-current-inputs; mismatch-fails-validate-requirements',
    requirement_registry: {
      leaves: leaves.size,
      modules: moduleNames.length,
      proposed: statusCounts.get('proposed') || 0,
      active: statusCounts.get('active') || 0,
      superseded: statusCounts.get('superseded') || 0,
      retired: statusCounts.get('retired') || 0,
      conflicted: statusCounts.get('conflicted') || 0,
      whole_supersession_edges: wholeEdges,
      scoped_relations: scopedEdges
    },
    source_anchor_catalog: {
      documents: sourceCatalog.summary?.source_documents ?? null,
      ordered_anchors: sourceCatalog.summary?.ordered_anchors ?? null,
      raw_parent_ordered: sourceCatalog.summary?.raw_parent_ordered ?? null,
      registered_requirements: sourceCatalog.summary?.registered_requirements ?? null,
      source_only: sourceCatalog.summary?.source_addressable_not_registered ?? null
    },
    runtime_identity: {
      core_version: runtimeIdentity.coreVersion,
      core_version_label: runtimeIdentity.coreVersionLabel,
      task_state: taskStateRevision,
      registry: runtimeIdentity.registryRevision,
      topology: runtimeIdentity.topologyRevision,
      kernel: runtimeIdentity.kernelRevision,
      snapshot: runtimeIdentity.taskPackageRevision,
      command: runtimeIdentity.commandRevision,
      subscribe: runtimeIdentity.subscribeRevision,
      ack: runtimeIdentity.ackRevision,
      host_asset: runtimeIdentity.hostAssetId,
      renderer_asset: runtimeIdentity.rendererAssetId,
      artifact_state: runtimeIdentity.artifactState,
      built_at: runtimeIdentity.builtAt || null,
      built_at_local: runtimeIdentity.builtAtLocal || null,
      package_version: runtimeIdentity.packageVersion || null
    },
    content_digests: {
      requirement_registry: digestFiles(registryFiles),
      raw_sources: digestFiles(rawSourceFiles),
      source_anchor_catalog: sha256(fs.readFileSync(sourceCatalogPath)),
      product_body: sha256(productBody),
      architecture: sha256(fs.readFileSync(architecturePath)),
      runtime_contract: digestFiles([runtimeIdentityPath, companionContractSchemaPath])
    }
  }
  const expectedTruthBlock = renderCurrentTruthBlock(truth)
  const currentBlock = productText.slice(truthRange.start, truthRange.end)
  if (writeCurrentTruth) {
    if (errors.length === 0) {
      const updated = `${productText.slice(0, truthRange.start)}${expectedTruthBlock}${productText.slice(truthRange.end)}`
      fs.writeFileSync(productRequirementsPath, updated)
      productText = updated
      process.stdout.write('current product truth synchronized\n')
    }
  } else if (currentBlock !== expectedTruthBlock) {
    errors.push('PRODUCT_REQUIREMENTS.md: current truth snapshot is stale; run node scripts/validate-requirements.mjs --write-current-truth after synchronizing sources')
  }
}

process.stdout.write(`requirements: leaves=${leaves.size}, modules=${moduleNames.length}, ${summary}`
  + `, edges=${wholeEdges} whole + ${scopedEdges} scoped\n`)
for (const warning of warnings) process.stdout.write(`warning: ${warning}\n`)

if (errors.length) {
  for (const error of errors) process.stderr.write(`error: ${error}\n`)
  process.stderr.write('requirement registry validation failed\n')
  process.exit(1)
}

process.stdout.write('requirement registry validation passed\n')
