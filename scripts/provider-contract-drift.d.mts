import type { CompanionProviderId } from '../src/domain/companionProvider'

export const EXTRACTOR_REVISION: 'static-provider-structure-v1'
export const REPORT_REVISION: 'provider-contract-drift-v1'
export const LIMITS: Readonly<{
  json: number
  metadata: number
  asarHeader: number
  nodes: number
  depth: number
}>

export type ContractValueType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
export type ContractKind = 'contract' | 'method' | 'event'

/** Accepted schema input; unsupported keywords and arbitrary values are rejected. */
export type StaticContractNode =
  | { type: Exclude<ContractValueType, 'object' | 'array'> }
  | { type: 'object'; properties?: Record<string, StaticContractNode>; required?: readonly string[] }
  | { type: 'array'; items: StaticContractNode }

export interface StaticContractSchema {
  version: 1
  provider: CompanionProviderId
  contracts?: Record<string, StaticContractNode>
  methods?: Record<string, StaticContractNode>
  events?: Record<string, StaticContractNode>
}

export interface ContractStructureEntry {
  /** Opaque SHA-256 references, never source names or file paths. */
  ref: string
  rootRef: string
  kind: ContractKind
  type: ContractValueType
  required: boolean
}

export interface ContractStructure {
  digest: string | null
  entries: ContractStructureEntry[]
}

export interface NormalizedContractStructure extends ContractStructure {
  digest: string
}

export type ContractChangeKind =
  | 'extractor-changed'
  | 'version-changed'
  | 'build-changed'
  | 'artifact-changed'
  | `${ContractKind}-added`
  | `${ContractKind}-removed`
  | 'required-added'
  | 'required-removed'
  | 'optional-add'
  | 'optional-removed'
  | 'type-changed'

export interface ContractChange {
  kind: ContractChangeKind
  ref: string | null
}

export interface ContractComparison {
  structure: 'no-baseline' | 'unchanged' | 'changed' | 'unknown'
  changes: ContractChange[]
}

export interface ProviderArtifactMetadata {
  state: 'observed' | 'missing' | 'ambiguous' | 'unknown' | 'not-requested'
  format: 'none' | 'asar-header' | 'unpacked'
  version: string | null
  build: string | null
  digest: string | null
}

export type ProviderContractErrorCode =
  | 'invalid-path' | 'private-path-refused' | 'missing' | 'read-failed'
  | 'symlink-refused' | 'not-a-file' | 'input-changed' | 'size-limit'
  | 'invalid-json' | 'invalid-manifest' | 'invalid-metadata' | 'invalid-asar'
  | 'invalid-app-paths' | 'invalid-app-path' | 'app-missing' | 'app-ambiguous'
  | 'layout-ambiguous' | 'layout-unknown' | 'invalid-schema' | 'unsupported-schema'
  | 'schema-limit' | 'invalid-baseline' | 'invalid-provider' | 'invalid-arguments'
  | 'output-path-refused' | 'output-exists'

/** Exact report whitelist. Static observations never establish runtime support. */
export interface ProviderContractReport {
  reportRevision: typeof REPORT_REVISION
  extractorRevision: string
  provider: CompanionProviderId | null
  artifact: ProviderArtifactMetadata
  contractCoverage: 'explicit-subset' | 'partial' | 'unavailable'
  structure: ContractStructure
  comparison: ContractComparison
  assessment: 'unknown' | 'review-required' | 'no-structural-change'
  runtimeSupport: 'unverified'
  errorCodes: ProviderContractErrorCode[]
}

export interface InspectProviderContractOptions {
  /** Untrusted boundary input; validated against the existing provider manifest. */
  provider?: string
  appPaths?: readonly string[]
  schemaPath?: string
  baselinePath?: string
}

export function normalizeContractSchema(input: unknown, provider: string): NormalizedContractStructure
export function compareContractReports(current: ProviderContractReport, baseline?: unknown): ContractComparison
export function inspectProviderContract(options?: InspectProviderContractOptions): ProviderContractReport
export function runCli(argv: readonly string[], write?: (text: string) => void): 0 | 2
