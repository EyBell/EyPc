import { expect, it, vi } from 'vitest'
import { registerCodexActions } from '../../src/runtime/feature/codex/actions'

it('persists auto-docked style and position together while legacy position writes preserve style', () => {
  const actions = new Map<string, any>()
  const updateSettings = vi.fn(() => true)
  registerCodexActions({ register: (action: any) => actions.set(action.id, action), registerHandler: vi.fn(), codexController: { updateSettings } } as unknown as Parameters<typeof registerCodexActions>[0])
  const run = actions.get('codex.float.position.save').run
  const position = { version: 2, displayId: 'screen', edge: 'top', edgeOffset: .5, x: 400, y: 32 }
  expect(run({}, { position, displayStyle: 'edge' })).toBe(true)
  expect(updateSettings).toHaveBeenLastCalledWith({ position, displayStyle: 'edge' })
  run({}, { position })
  expect(updateSettings).toHaveBeenLastCalledWith({ position })
  expect(run({}, { displayStyle: 'edge' })).toBe(false)
  expect(updateSettings).toHaveBeenCalledTimes(2)
})
