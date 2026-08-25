import { describe, expect, it } from 'vitest'
import { createActionRuntime } from '../../src/runtime/action/actionRuntime'
import { createCommandCatalogV7 } from '../../src/runtime/command/commandCatalog'
import { buildCommandCatalogV7 } from '../../src/runtime/keybinding/keybindingRuntime'

describe('Command Catalog V7', () => {
  it('owns command presentation metadata while handlers own execution', () => {
    const catalog = createCommandCatalogV7([{
      id: 'demo.run',
      title: '规范标题',
      group: '规范分组',
      risk: 'data-write',
      executionOwner: 'runtime-action',
      defaultBindings: [{ shortcutIds: ['Ctrl+Enter'], layer: 'global', when: 'true', weight: 100 }]
    }])
    const runtime = createActionRuntime({ catalog })
    runtime.register({
      id: 'demo.run',
      title: '旧标题',
      group: '旧分组',
      risk: 'normal',
      scope: 'global',
      priority: 1,
      when: () => true,
      run: () => true
    })

    expect(runtime.get('demo.run')).toMatchObject({
      title: '规范标题',
      group: '规范分组',
      risk: 'data-write',
      shortcut: 'Ctrl+Enter'
    })
  })

  it('rejects duplicate descriptors and unknown V7 handlers', () => {
    expect(() => createCommandCatalogV7([
      { id: 'same', title: 'A', group: 'G', risk: 'normal', executionOwner: 'runtime-action', defaultBindings: [] },
      { id: 'same', title: 'B', group: 'G', risk: 'normal', executionOwner: 'runtime-action', defaultBindings: [] }
    ])).toThrow(/Duplicate command descriptor/)

    const runtime = createActionRuntime({ catalog: createCommandCatalogV7([]) })
    expect(() => runtime.registerHandler({ commandId: 'missing', scope: 'global', priority: 1, when: () => true, run: () => true })).toThrow(/Unknown command descriptor/)
  })

  it('never downgrades handler risk and preserves metadata absent from the Catalog', () => {
    const catalog = createCommandCatalogV7([{
      id: 'demo.delete',
      title: '规范删除',
      group: '规范分组',
      risk: 'normal',
      executionOwner: 'runtime-action',
      defaultBindings: []
    }])
    const runtime = createActionRuntime({ catalog })
    runtime.register({
      id: 'demo.delete',
      title: '旧标题',
      description: '保留处理器说明',
      icon: 'trash',
      group: '旧分组',
      risk: 'destructive',
      scope: 'row',
      priority: 1,
      when: () => true,
      run: () => true
    })

    expect(runtime.get('demo.delete')).toMatchObject({
      title: '规范删除',
      group: '规范分组',
      description: '保留处理器说明',
      icon: 'trash',
      risk: 'destructive'
    })
  })

  it('declares the one execution owner used by the runtime dispatcher', () => {
    const catalog = buildCommandCatalogV7()
    expect(catalog.require('quickJump.openForward').executionOwner).toBe('main-quick-jump')
    expect(catalog.require('codex.quickJump.openForward').executionOwner).toBe('main-quick-jump')
    expect(catalog.require('tab.next').executionOwner).toBe('shell')
    expect(catalog.require('windows.list.down').executionOwner).toBe('shell')
    expect(catalog.require('ports.scan').executionOwner).toBe('runtime-action')
    expect(catalog.executionOwnerFor('quickJump.openForward', 'action')).toBe('action-local')
    expect(catalog.executionOwnerFor('quickJump.openForward', 'float')).toBe('float-local')
    expect(catalog.executionOwnerFor('codex.quickJump.openTasks', 'float')).toBe('float-local')
    expect(catalog.executionOwnerFor('codex.tab.next', 'float')).toBe('runtime-action')
    expect(catalog.require('codex.float.toggle').risk).toBe('data-write')
    expect(catalog.require('codex.tab.prev').risk).toBe('data-write')
    expect(catalog.require('codex.tab.next').risk).toBe('data-write')
    expect(catalog.require('codex.action.run.1').risk).toBe('data-write')
  })
})
