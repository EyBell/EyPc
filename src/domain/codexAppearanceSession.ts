import type { CodexSettings } from './codex'

/** Fields edited by the appearance workbench; display style is independent. */
const APPEARANCE_FIELDS = new Set([
  'colors', 'counterColors', 'waterAppearance', 'expandedCardAppearance',
  'magpieQuotaGridCursorPrimaryLabel', 'magpieQuotaGridCursorSecondaryLabel'
])

interface ChangedLeaf {
  path: string[]
  before: unknown
  lastWritten: unknown
}

function leaves(value: unknown, path: string[]): Array<{ path: string[]; value: unknown }> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, [...path, key]))
  }
  return [{ path, value }]
}

function readPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => current && typeof current === 'object'
    ? (current as Record<string, unknown>)[key] : undefined, value)
}

function writePath(target: Record<string, unknown>, path: string[], value: unknown) {
  let current = target
  for (const key of path.slice(0, -1)) current = current[key] as Record<string, unknown>
  current[path[path.length - 1]] = value
}

function cloneValue<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T
}

/** Tracks only values this workbench changed, so rollback does not replace whole settings. */
export class CodexAppearanceSession {
  private readonly changes = new Map<string, ChangedLeaf>()

  get dirty() { return this.changes.size > 0 }

  record(current: CodexSettings, patch: Partial<CodexSettings>) {
    for (const [root, value] of Object.entries(patch)) {
      if (!APPEARANCE_FIELDS.has(root) || value === undefined) continue
      for (const leaf of leaves(value, [root])) {
        const before = readPath(current, leaf.path)
        if (Object.is(before, leaf.value)) continue
        const key = leaf.path.join('.')
        const prior = this.changes.get(key)
        // If a different value arrived since our last write, it becomes the
        // new baseline rather than something a later rollback may overwrite.
        const baseline = prior && !Object.is(before, prior.lastWritten) && !Object.is(before, prior.before)
          ? before : prior ? prior.before : before
        if (Object.is(leaf.value, baseline)) this.changes.delete(key)
        else this.changes.set(key, { path: leaf.path, before: cloneValue(baseline), lastWritten: cloneValue(leaf.value) })
      }
    }
  }

  restore(current: CodexSettings): { patch: Partial<CodexSettings>; conflicts: string[] } {
    const patch: Record<string, unknown> = {}
    const conflicts: string[] = []
    for (const entry of this.changes.values()) {
      const currentValue = readPath(current, entry.path)
      if (Object.is(currentValue, entry.before)) continue
      if (!Object.is(currentValue, entry.lastWritten)) {
        conflicts.push(entry.path.join('.'))
        continue
      }
      const root = entry.path[0]
      if (entry.path.length === 1) patch[root] = cloneValue(entry.before)
      else {
        if (!(root in patch)) patch[root] = cloneValue((current as unknown as Record<string, unknown>)[root])
        writePath(patch[root] as Record<string, unknown>, entry.path.slice(1), cloneValue(entry.before))
      }
    }
    return { patch: patch as Partial<CodexSettings>, conflicts }
  }

  clear() { this.changes.clear() }
}
