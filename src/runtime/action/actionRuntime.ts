import type { RuntimeActionDefinition, RuntimeActionDispatchResult, RuntimeActionIntent, RuntimeActionScope } from './types'

interface ActionRuntimeOptions {
  captureSnapshot?: () => unknown
  commitSnapshot?: (snapshot: unknown) => void
}

const SCOPE_WEIGHT: Record<RuntimeActionScope, number> = {
  global: 100,
  tab: 200,
  row: 300,
  layer: 400
}

function handled(value: ReturnType<RuntimeActionDefinition['run']>): boolean {
  return typeof value === 'object' ? value.handled !== false : value !== false
}

function errorOf(value: ReturnType<RuntimeActionDefinition['run']>): string | undefined {
  return typeof value === 'object' ? value.error : undefined
}

export function createActionRuntime(options: ActionRuntimeOptions = {}) {
  const actions = new Map<string, RuntimeActionDefinition>()

  return {
    register(action: RuntimeActionDefinition): void {
      if (actions.has(action.id)) throw new Error(`Duplicate action id: ${action.id}`)
      actions.set(action.id, action)
    },
    all(): RuntimeActionDefinition[] {
      return [...actions.values()].sort((a, b) => a.group.localeCompare(b.group) || a.id.localeCompare(b.id))
    },
    get(actionId: string): RuntimeActionDefinition | null {
      return actions.get(actionId) || null
    },
    dispatch(intent: RuntimeActionIntent): RuntimeActionDispatchResult {
      const action = actions.get(intent.actionId)
      if (!action || !action.when(intent.context)) return { handled: false, actionId: null }
      const shouldSnapshot = action.risk === 'data-write' || action.risk === 'destructive'
      const snapshot = shouldSnapshot ? options.captureSnapshot?.() : undefined
      const result = action.run(intent.context, intent.args)
      if (shouldSnapshot && handled(result)) options.commitSnapshot?.(snapshot)
      return { handled: handled(result), actionId: action.id, error: errorOf(result) }
    },
    resolveCandidates(actionIds: string[], context: RuntimeActionIntent['context']): RuntimeActionDefinition[] {
      return actionIds
        .map((id) => actions.get(id))
        .filter((action): action is RuntimeActionDefinition => Boolean(action && action.when(context)))
        .sort((a, b) => (SCOPE_WEIGHT[b.scope] * 1000 + b.priority) - (SCOPE_WEIGHT[a.scope] * 1000 + a.priority))
    }
  }
}
