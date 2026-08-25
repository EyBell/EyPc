export type RuntimeSliceListener = (revision: number) => void

export interface RuntimeSliceV7<TView> {
  readonly id: string
  readonly revision: number
  readonly active: boolean
  snapshot(): Readonly<TView>
  subscribe(listener: RuntimeSliceListener): () => void
}

export interface RuntimeSliceOwnerV7<TView> extends RuntimeSliceV7<TView> {
  start(): void
  stop(): void
  invalidate(): boolean
  dispose(): void
}

export interface RuntimeSliceOptionsV7<TSource, TView> {
  id: string
  readSource: () => TSource
  select: (source: TSource) => TView
  subscribeSource?: (listener: () => void) => () => void
  equals?: (left: TView, right: TView) => boolean
  startSubscribed?: boolean
}

export function shallowEqualRuntimeView<TView>(left: TView, right: TView): boolean {
  if (Object.is(left, right)) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.is(leftRecord[key], rightRecord[key]))
}

export function createRuntimeSliceV7<TSource, TView>(
  options: RuntimeSliceOptionsV7<TSource, TView>
): RuntimeSliceOwnerV7<TView> {
  const equals = options.equals || shallowEqualRuntimeView
  const listeners = new Set<RuntimeSliceListener>()
  let view = options.select(options.readSource())
  let revision = 1
  let disposed = false
  let unsubscribe: (() => void) | null = null

  function invalidate(): boolean {
    if (disposed) return false
    const next = options.select(options.readSource())
    if (equals(view, next)) return false
    view = next
    revision += 1
    for (const listener of listeners) listener(revision)
    return true
  }

  function start(): void {
    if (disposed || unsubscribe || !options.subscribeSource) return
    unsubscribe = options.subscribeSource(() => { invalidate() })
    invalidate()
  }

  function stop(): void {
    unsubscribe?.()
    unsubscribe = null
  }

  if (options.startSubscribed !== false) start()

  return {
    id: options.id,
    get revision() { return revision },
    get active() { return Boolean(unsubscribe) },
    snapshot: () => view as Readonly<TView>,
    subscribe(listener) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start,
    stop,
    invalidate,
    dispose() {
      if (disposed) return
      disposed = true
      stop()
      listeners.clear()
    }
  }
}
