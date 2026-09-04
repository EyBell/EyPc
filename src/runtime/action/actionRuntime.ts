/** 用户可见突变的唯一入口：register 描述命令，dispatch 按 when/risk 执行并可选快照。 */
import type { CommandCatalogV7 } from '../command/commandCatalog'
import type { RuntimeActionDefinition, RuntimeActionDispatchResult, RuntimeActionHandlerV7, RuntimeActionIntent, RuntimeActionScope } from './types'

interface ActionRuntimeOptions {
  catalog?: CommandCatalogV7
  captureSnapshot?: () => unknown
  commitSnapshot?: (snapshot: unknown) => void
  onDispatch?: (observation: RuntimeActionDispatchObservation) => void
}

export interface RuntimeActionDispatchObservation {
  operationId: string
  actionId: string
  source?: string
  outcome: 'unavailable' | 'rejected' | 'handled' | 'not-handled' | 'failed' | 'threw'
  handled: boolean
  durationMs: number
  tab: RuntimeActionIntent['context']['tab']
  selectedIds: string[]
  layerIds: string[]
  risk?: RuntimeActionDefinition['risk']
  scope?: RuntimeActionDefinition['scope']
  hasError?: boolean
  errorName?: string
}

const SCOPE_WEIGHT: Record<RuntimeActionScope, number> = {
  global: 100,
  tab: 200,
  row: 300,
  layer: 400
}

const RISK_WEIGHT: Record<RuntimeActionDefinition['risk'], number> = {
  normal: 0,
  'data-write': 1,
  destructive: 2
}

function highestRisk(
  descriptorRisk: RuntimeActionDefinition['risk'],
  handlerRisk: RuntimeActionDefinition['risk']
): RuntimeActionDefinition['risk'] {
  return RISK_WEIGHT[descriptorRisk] >= RISK_WEIGHT[handlerRisk] ? descriptorRisk : handlerRisk
}

function handled(value: ReturnType<RuntimeActionDefinition['run']>): boolean {
  return typeof value === 'object' ? value.handled !== false : value !== false
}

function errorOf(value: ReturnType<RuntimeActionDefinition['run']>): string | undefined {
  return typeof value === 'object' ? value.error : undefined
}

export function createActionRuntime(options: ActionRuntimeOptions = {}) {
  const actions = new Map<string, RuntimeActionDefinition>()
  let operationSequence = 0

  function operationId(intent: RuntimeActionIntent): string {
    const supplied = intent.args?.operationId
    if (typeof supplied === 'string' && /^[A-Za-z0-9:_-]{8,160}$/.test(supplied)) return supplied
    operationSequence += 1
    return `action-${Date.now().toString(36)}-${operationSequence.toString(36)}`
  }

  function observe(observation: RuntimeActionDispatchObservation): void {
    try { options.onDispatch?.(observation) } catch {}
  }

  function canonicalDefinition(action: RuntimeActionDefinition): RuntimeActionDefinition {
    const descriptor = options.catalog?.get(action.id)
    if (!descriptor) return action
    return {
      ...action,
      title: descriptor.title,
      group: descriptor.group,
      description: descriptor.description ?? action.description,
      icon: descriptor.icon ?? action.icon,
      // A partially migrated Catalog may tighten risk, but must never downgrade an
      // already audited handler and accidentally bypass write/destructive policy.
      risk: highestRisk(descriptor.risk, action.risk),
      shortcut: descriptor.defaultBindings[0]?.shortcutIds[0]
    }
  }

  function registerDefinition(action: RuntimeActionDefinition): void {
    if (actions.has(action.id)) throw new Error(`Duplicate action id: ${action.id}`)
    actions.set(action.id, canonicalDefinition(action))
  }

  return {
    register(action: RuntimeActionDefinition): void {
      registerDefinition(action)
    },
    registerHandler(handler: RuntimeActionHandlerV7): void {
      const descriptor = options.catalog?.require(handler.commandId)
      if (!descriptor) throw new Error('registerHandler requires a Command Catalog')
      registerDefinition({
        id: handler.commandId,
        title: descriptor.title,
        group: descriptor.group,
        description: descriptor.description,
        icon: descriptor.icon,
        risk: descriptor.risk,
        scope: handler.scope,
        priority: handler.priority,
        shortcut: descriptor.defaultBindings[0]?.shortcutIds[0],
        when: handler.when,
        run: handler.run
      })
    },
    all(): RuntimeActionDefinition[] {
      return [...actions.values()].sort((a, b) => a.group.localeCompare(b.group) || a.id.localeCompare(b.id))
    },
    get(actionId: string): RuntimeActionDefinition | null {
      return actions.get(actionId) || null
    },
    dispatch(intent: RuntimeActionIntent): RuntimeActionDispatchResult {
      const startedAt = Date.now()
      const currentOperationId = operationId(intent)
      const action = actions.get(intent.actionId)
      const observationBase = {
        operationId: currentOperationId,
        actionId: intent.actionId,
        tab: intent.context.tab,
        selectedIds: [...intent.context.selectedIds],
        layerIds: [...intent.context.layerIds],
        ...(typeof intent.args?.source === 'string' ? { source: intent.args.source } : {})
      }
      if (!action) {
        observe({ ...observationBase, outcome: 'unavailable', handled: false, durationMs: Date.now() - startedAt })
        return { handled: false, actionId: null }
      }
      if (!action.when(intent.context)) {
        observe({ ...observationBase, outcome: 'rejected', handled: false, durationMs: Date.now() - startedAt, risk: action.risk, scope: action.scope })
        return { handled: false, actionId: null }
      }
      const shouldSnapshot = action.risk === 'data-write' || action.risk === 'destructive'
      const snapshot = shouldSnapshot ? options.captureSnapshot?.() : undefined
      try {
        const result = action.run(intent.context, { ...intent.args, operationId: currentOperationId })
        const actionHandled = handled(result)
        const actionError = errorOf(result)
        if (shouldSnapshot && actionHandled) options.commitSnapshot?.(snapshot)
        observe({
          ...observationBase,
          actionId: action.id,
          outcome: actionError ? 'failed' : actionHandled ? 'handled' : 'not-handled',
          handled: actionHandled,
          durationMs: Date.now() - startedAt,
          risk: action.risk,
          scope: action.scope,
          hasError: Boolean(actionError)
        })
        return { handled: actionHandled, actionId: action.id, error: actionError }
      } catch (error) {
        observe({
          ...observationBase,
          actionId: action.id,
          outcome: 'threw',
          handled: false,
          durationMs: Date.now() - startedAt,
          risk: action.risk,
          scope: action.scope,
          hasError: true,
          errorName: error instanceof Error ? error.name : typeof error
        })
        throw error
      }
    },
    resolveCandidates(actionIds: string[], context: RuntimeActionIntent['context']): RuntimeActionDefinition[] {
      return actionIds
        .map((id) => actions.get(id))
        .filter((action): action is RuntimeActionDefinition => Boolean(action && action.when(context)))
        .sort((a, b) => (SCOPE_WEIGHT[b.scope] * 1000 + b.priority) - (SCOPE_WEIGHT[a.scope] * 1000 + a.priority))
    }
  }
}
