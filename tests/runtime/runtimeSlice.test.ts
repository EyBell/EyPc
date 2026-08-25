import { describe, expect, it, vi } from 'vitest'
import { createRuntimeSliceV7 } from '../../src/runtime/runtimeSlice'

describe('RuntimeSlice V7', () => {
  it('advances only when its selected view changes', () => {
    let source = { ports: 1, mqtt: 1 }
    const upstream: { listener?: () => void } = {}
    const slice = createRuntimeSliceV7({
      id: 'ports',
      readSource: () => source,
      select: (value) => ({ ports: value.ports }),
      subscribeSource: (listener) => { upstream.listener = listener; return () => { delete upstream.listener } }
    })
    const listener = vi.fn()
    slice.subscribe(listener)

    source = { ports: 1, mqtt: 2 }
    upstream.listener?.()
    expect(slice.revision).toBe(1)
    expect(listener).not.toHaveBeenCalled()

    source = { ports: 2, mqtt: 2 }
    upstream.listener?.()
    expect(slice.revision).toBe(2)
    expect(listener).toHaveBeenCalledWith(2)
    expect(slice.snapshot()).toEqual({ ports: 2 })

    slice.dispose()
    expect(upstream.listener).toBeUndefined()
  })

  it('stops hidden subscriptions and catches up exactly once when restarted', () => {
    let source = { value: 1 }
    const upstream: { listener?: () => void } = {}
    const slice = createRuntimeSliceV7({
      id: 'feature:ports',
      readSource: () => source,
      select: (value) => ({ value: value.value }),
      subscribeSource: (listener) => { upstream.listener = listener; return () => { delete upstream.listener } }
    })
    const listener = vi.fn()
    slice.subscribe(listener)

    expect(slice.active).toBe(true)
    slice.stop()
    expect(slice.active).toBe(false)
    source = { value: 2 }
    expect(slice.snapshot()).toEqual({ value: 1 })

    slice.start()
    expect(slice.active).toBe(true)
    expect(slice.snapshot()).toEqual({ value: 2 })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
