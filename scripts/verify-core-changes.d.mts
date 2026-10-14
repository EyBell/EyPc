export interface CoreCheck {
  id: string
  kind: 'node' | 'vitest'
  files: string[]
  receipt?: { pattern: string; minimum: number }
  testNames?: string[]
}
export interface CoreGuard { id: string; sources: string[]; paths: string[]; checks: string[]; boundary: string }
export interface CoreMap { version: number; protected: string[]; governance: string[]; exclusions: string[]; guards: CoreGuard[]; checks: CoreCheck[] }
export interface CorePlan {
  files: string[]
  excluded: string[]
  guards: Array<Pick<CoreGuard, 'id' | 'sources' | 'boundary'> & { reasons: string[] }>
  checks: CoreCheck[]
}
export interface CommandResult { ok: boolean; reason: string | null; output: string }
export interface CommandOptions { cwd: string; timeoutMs?: number; maxBytes?: number }
export type Executor = (command: string, args: string[], options: CommandOptions) => Promise<CommandResult>
export interface TestReport { success: boolean; numFailedTests?: number; testResults?: Array<{ name: string; assertionResults: Array<{ status: string; title?: string }> }> }
export interface VerificationResult {
  revision: string
  inputDigest: string
  fresh: boolean
  status: 'stale' | 'passed' | 'no-affected-checks' | 'failed'
  results: Array<{ id: string; passed: boolean; tests: number | null; checkedUnits: number | null; reason: string | null }>
}
export const root: string
export const mapPath: string
export function matches(file: string, pattern: string): boolean
export function changedFiles(repo: string, options?: { base?: string; staged?: boolean }, readGit?: (repo: string, args: string[]) => string): string[]
export function validateMap(map: CoreMap, repo?: string): CoreMap
export function selectChecks(map: CoreMap, files: string[], all?: boolean): CorePlan
export function inputDigest(repo: string, map: CoreMap, plan: CorePlan): string
export const runCommand: Executor
export function countVerifiedTests(report: TestReport, files: string[], testNames?: string[]): number
export function executePlan(repo: string, map: CoreMap, plan: CorePlan, execute?: Executor): Promise<VerificationResult>
export function main(args?: string[]): Promise<void>
