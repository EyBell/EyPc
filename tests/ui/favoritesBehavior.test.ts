// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import FavoriteTree from '../../src/components/FavoriteTree.vue'
import ConfirmLayer from '../../src/components/ConfirmLayer.vue'
import FavoritesPage from '../../src/pages/FavoritesPage.vue'
import QuickFavoritesPage from '../../src/pages/QuickFavoritesPage.vue'
import { buildFavoriteTree, flattenFavoriteTree } from '../../src/domain/favorites'
import { createInitialState } from '../../src/domain/state'
import { createAppRuntime, type AppRuntimeSnapshot } from '../../src/runtime/appRuntime'
import type { FavoriteNode } from '../../src/domain/types'

function favorite(id: string, kind: FavoriteNode['kind'], name: string, path = '', parentId: string | null = null): FavoriteNode {
  return { id, kind, name, path, parentId, tags: [], color: '#2f80ed', sortOrder: 1, createdAt: 1, updatedAt: 1 }
}

function snapshotWithFavorites(favorites: FavoriteNode[] = []): AppRuntimeSnapshot {
  const state = createInitialState(1)
  state.activeTab = 'favorites'
  state.favorites = favorites
  state.settings.featureConfigs = [
    { id: 'ports', enabled: true, sortOrder: 1 },
    { id: 'favorites', enabled: true, sortOrder: 2 },
    { id: 'settings', enabled: true, sortOrder: 3 }
  ]
  return createAppRuntime(state).snapshot()
}

afterEach(() => {
  document.body.innerHTML = ''
  Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true })
})

describe('favorite tree accessibility and inline rename', () => {
  it('uses one roving focus owner with complete tree item state', async () => {
    const nodes = [favorite('group', 'group', '资料'), favorite('file', 'file', '说明', '/tmp/说明.md', 'group')]
    const rows = flattenFavoriteTree(buildFavoriteTree(nodes))
    const wrapper = mount(FavoriteTree, {
      props: {
        nodes,
        rows,
        selectedIds: ['group'],
        focusedId: 'group',
        collapsedIds: [],
        canOpen: true
      }
    })

    const tree = wrapper.get('[role="tree"]')
    const treeItems = wrapper.findAll('[role="treeitem"]')
    expect(tree.attributes('tabindex')).toBe('0')
    expect(tree.attributes('aria-activedescendant')).toBe('favorite-treeitem-group')
    expect(treeItems.map((item) => item.attributes('tabindex'))).toEqual(['-1', '-1'])
    expect(treeItems[0].attributes()).toMatchObject({ 'aria-level': '1', 'aria-selected': 'true', 'aria-expanded': 'true' })
    expect(treeItems[1].attributes('aria-level')).toBe('2')
    expect(wrapper.get('button.disclosure').attributes('aria-label')).toBe('折叠 资料')
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    expect(wrapper.findAll('[role="treeitem"] button').every((button) => button.attributes('tabindex') === '-1')).toBe(true)

    await wrapper.setProps({
      renameDraft: {
        mode: 'rename', targetId: 'group', targetIds: ['group'], kind: 'group', name: '新资料', path: '', tagsText: '', color: '#2f80ed', parentId: null,
        runnerEnabled: false, runnerMode: 'background', runnerExecutable: '', runnerArgsText: '', runnerCwdMode: 'target-directory', runnerCwd: '', runnerPlatform: 'darwin', runnerTrusted: false, activeField: 'name'
      }
    })
    const input = wrapper.get('input.favorite-inline-rename')
    await input.setValue('归档')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('updateRename')?.at(-1)).toEqual(['归档'])
    expect(wrapper.emitted('saveRename')).toHaveLength(1)
  })
})

describe('quick favorites states and capabilities', () => {
  it('renders read-only empty and unsupported-action states with live feedback', async () => {
    const emptyWrapper = mount(QuickFavoritesPage, { props: { snapshot: snapshotWithFavorites() } })
    expect(emptyWrapper.get('[role="status"] strong').text()).toBe('还没有文件收藏')
    expect(emptyWrapper.find('[aria-label="新建分组"]').exists()).toBe(false)

    const item = favorite('file', 'file', '说明', '/tmp/说明.md')
    const base = snapshotWithFavorites([item])
    const wrapper = mount(QuickFavoritesPage, {
      props: {
        snapshot: {
          ...base,
          focusedFavoriteId: item.id,
          favoriteCapabilities: { ...base.favoriteCapabilities, open: false, reveal: false, copyItems: false },
          message: '当前宿主不支持打开'
        }
      }
    })
    const grid = wrapper.get('[role="grid"]')
    expect(grid.attributes('aria-activedescendant')).toBe('quick-favorite-file')
    expect(wrapper.get('[role="row"]').attributes('tabindex')).toBe('-1')
    expect(wrapper.get('button[aria-label="打开"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('button[aria-label="定位"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('button[aria-label="复制真实项"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('.favorite-status').attributes('aria-live')).toBe('polite')
    expect(wrapper.get('.favorite-status').text()).toBe('当前宿主不支持打开')
    expect(wrapper.get('.favorite-path-state').text()).toBe('状态未知')
    expect(wrapper.get('.favorite-path-state').classes()).not.toContain('error')
    expect(wrapper.findAll('.quick-favorite-row-actions button').every((button) => button.attributes('tabindex') === '-1')).toBe(true)

    await wrapper.setProps({ snapshot: { ...wrapper.props('snapshot'), state: { ...base.state, favoriteSearch: 'missing' }, favoriteItemRows: [] } })
    expect(wrapper.get('.favorite-empty-state strong').text()).toBe('没有匹配结果')

    await wrapper.setProps({
      snapshot: {
        ...base,
        focusedFavoriteId: item.id,
        favoriteCapabilities: { ...base.favoriteCapabilities, inspectPaths: true },
        favoritePathInspections: {
          'posix:/tmp/说明.md': { path: item.path, status: 'missing', kind: 'unknown', exists: false, isSymbolicLink: false, errorCode: 'not-found' }
        }
      }
    })
    expect(wrapper.get('[role="row"]').classes()).toContain('path-error')
    expect(wrapper.get('.favorite-path-state').text()).toBe('路径不存在')

    await wrapper.setProps({
      snapshot: {
        ...base,
        focusedFavoriteId: item.id,
        favoriteCapabilities: { ...base.favoriteCapabilities, inspectPaths: true },
        favoritePathInspections: {
          'posix:/tmp/说明.md': { path: item.path, status: 'invalid', kind: 'unknown', exists: false, isSymbolicLink: false, errorCode: 'invalid-path' }
        }
      }
    })
    expect(wrapper.get('.favorite-path-state').text()).toBe('路径无效')
  })

  it('generates distinct active-descendant ids for punctuation variants', () => {
    const base = snapshotWithFavorites([
      favorite('a b', 'file', 'Space', '/tmp/space'),
      favorite('a?b', 'file', 'Question', '/tmp/question')
    ])
    const wrapper = mount(QuickFavoritesPage, { props: { snapshot: base } })
    const ids = wrapper.findAll('[role="row"]').map((row) => row.attributes('id'))
    expect(new Set(ids).size).toBe(2)
  })

  it('moves focus across quick detail and safe-action panels and restores the grid', async () => {
    const item = favorite('file', 'file', '说明', '/tmp/说明.md')
    const base = snapshotWithFavorites([item])
    const wrapper = mount(QuickFavoritesPage, { props: { snapshot: base }, attachTo: document.body })
    const grid = wrapper.get('[data-role="favorite-items"]').element as HTMLElement
    grid.focus()

    await wrapper.setProps({
      snapshot: {
        ...base,
        favoriteDrawer: { open: true, active: false, activeIndex: 0, targetKind: 'favorite', targetIds: [item.id] }
      }
    })
    await nextTick()
    expect(wrapper.get('.quick-favorite-context-panel').attributes()).toMatchObject({ role: 'dialog', 'aria-modal': 'true' })
    expect(document.activeElement).toBe(wrapper.get('button[aria-label="关闭详情"]').element)

    await wrapper.setProps({
      snapshot: {
        ...base,
        favoriteDrawer: { open: true, active: true, activeIndex: 0, targetKind: 'favorite', targetIds: [item.id] },
        favoriteDrawerItems: [{ commandId: 'favorites.open', title: '打开', description: '打开收藏', icon: 'open', shortcutLabel: 'Enter', risk: 'normal', enabled: true }]
      }
    })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('button[aria-label="关闭操作"]').element)

    await wrapper.setProps({ snapshot: { ...base, favoriteDrawer: { ...base.favoriteDrawer, open: false } } })
    await nextTick()
    expect(document.activeElement).toBe(grid)
  })
})

describe('favorites page dialogs, focus and states', () => {
  it('moves DOM focus with pane shortcuts and keeps one active descendant owner', async () => {
    const base = snapshotWithFavorites([
      favorite('group', 'group', '资料'),
      favorite('file', 'file', '说明', '/tmp/说明.md', 'group')
    ])
    const runtime = createAppRuntime(base.state)
    runtime.focusFavorite('file')
    const wrapper = mount(FavoritesPage, { props: { snapshot: runtime.snapshot() }, attachTo: document.body })
    const items = wrapper.get('[data-role="favorite-items"]').element as HTMLElement
    items.focus()

    expect(runtime.handleShortcut('Tab', { textInputFocused: false, activeInputRole: 'favorite-items' })).toBe('favorites.pane.toggleNext')
    await wrapper.setProps({ snapshot: runtime.snapshot() })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('[data-role="favorite-containers"]').element)
    expect(runtime.snapshot().focusedFavoriteId).toBeNull()
    expect(wrapper.get('[data-role="favorite-items"]').attributes('aria-activedescendant')).toBeUndefined()
    expect(wrapper.findAll('.favorite-row.focused')).toHaveLength(1)

    expect(runtime.handleShortcut('Shift+Tab', { textInputFocused: false, activeInputRole: 'favorite-containers' })).toBe('favorites.pane.togglePrev')
    await wrapper.setProps({ snapshot: runtime.snapshot() })
    await nextTick()
    expect(document.activeElement).toBe(items)
    expect(runtime.snapshot().focusedFavoriteGroupId).toBeNull()
    expect(wrapper.get('[data-role="favorite-items"]').attributes('aria-activedescendant')).toBe('favorite-row-file')
  })

  it('traps drawer focus and restores the opening trigger after close', async () => {
    const item = favorite('file', 'file', '说明', '/tmp/说明.md')
    const base = snapshotWithFavorites([item])
    const wrapper = mount(FavoritesPage, { props: { snapshot: base }, attachTo: document.body })
    const trigger = wrapper.get('button.favorite-add-button').element as HTMLButtonElement
    trigger.focus()

    await wrapper.setProps({
      snapshot: {
        ...base,
        favoriteDrawer: { open: true, active: true, activeIndex: 0, targetKind: 'favorite', targetIds: [item.id] },
        favoriteDrawerItems: [{ commandId: 'favorites.open', title: '打开', description: '打开收藏', icon: 'open', shortcutLabel: 'Enter', risk: 'normal', enabled: true }]
      }
    })
    await nextTick()
    const dialog = wrapper.get('.favorite-action-drawer')
    expect(dialog.attributes()).toMatchObject({ role: 'dialog', 'aria-modal': 'true' })
    expect(document.activeElement).toBe(dialog.get('button[aria-label="关闭抽屉"]').element)

    const buttons = dialog.findAll('button')
    ;(buttons.at(-1)?.element as HTMLButtonElement).focus()
    await dialog.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(buttons[0].element)

    await wrapper.setProps({ snapshot: { ...base, favoriteDrawer: { ...base.favoriteDrawer, open: false } } })
    await nextTick()
    expect(document.activeElement).toBe(trigger)
  })

  it('moves focus when switching between favorite detail and action panels', async () => {
    const item = favorite('file', 'file', '说明', '/tmp/说明.md')
    const base = snapshotWithFavorites([item])
    const wrapper = mount(FavoritesPage, { props: { snapshot: base }, attachTo: document.body })
    const trigger = wrapper.get('[data-role="favorite-items"]').element as HTMLElement
    trigger.focus()

    await wrapper.setProps({
      snapshot: {
        ...base,
        favoriteDrawer: { open: true, active: false, activeIndex: 0, targetKind: 'favorite', targetIds: [item.id] }
      }
    })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('button[aria-label="关闭详情"]').element)

    await wrapper.setProps({
      snapshot: {
        ...base,
        favoriteDrawer: { open: true, active: true, activeIndex: 0, targetKind: 'favorite', targetIds: [item.id] },
        favoriteDrawerItems: [{ commandId: 'favorites.open', title: '打开', description: '打开收藏', icon: 'open', shortcutLabel: 'Enter', risk: 'normal', enabled: true }]
      }
    })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('button[aria-label="关闭抽屉"]').element)

    await wrapper.setProps({ snapshot: { ...base, favoriteDrawer: { ...base.favoriteDrawer, open: false } } })
    await nextTick()
    expect(document.activeElement).toBe(trigger)
  })

  it('renders inline rename without a modal and exposes directory loading, error and empty states', async () => {
    const folder = favorite('folder', 'folder', '项目', '/tmp/project')
    const base = snapshotWithFavorites([folder])
    const renameDraft = {
      mode: 'rename' as const, targetId: folder.id, targetIds: [folder.id], kind: folder.kind, name: folder.name, path: folder.path,
      tagsText: '', color: folder.color, parentId: null, runnerEnabled: false, runnerMode: 'background' as const, runnerExecutable: '',
      runnerArgsText: '', runnerCwdMode: 'target-directory' as const, runnerCwd: '', runnerPlatform: 'darwin' as const, runnerTrusted: false, activeField: 'name' as const
    }
    const wrapper = mount(FavoritesPage, {
      props: { snapshot: { ...base, focusedFavoriteId: folder.id } },
      attachTo: document.body
    })
    const row = wrapper.get('.favorite-item-row').element as HTMLElement
    expect(wrapper.get('.favorite-item-row input[type="checkbox"]').attributes()).toMatchObject({ tabindex: '-1', type: 'checkbox' })
    expect(wrapper.get('.favorite-item-row input[type="checkbox"]').attributes('role')).toBeUndefined()
    expect(wrapper.findAll('.favorite-item-row .favorite-row-actions button').every((button) => button.attributes('tabindex') === '-1')).toBe(true)
    row.focus()
    await wrapper.setProps({ snapshot: { ...base, focusedFavoriteId: folder.id, favoriteDraft: renameDraft } })
    await nextTick()
    expect(wrapper.find('form.favorite-editor').exists()).toBe(false)
    expect(wrapper.findAll('input.favorite-inline-rename')).toHaveLength(1)
    const rename = wrapper.get('.favorite-item-list input.favorite-inline-rename')
    expect(document.activeElement).toBe(rename.element)
    await rename.setValue('项目归档')
    await rename.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('updateFavoriteDraft')?.at(-1)).toEqual([{ name: '项目归档' }])
    expect(wrapper.emitted('saveFavoriteDraft')).toHaveLength(1)

    await wrapper.setProps({ snapshot: { ...base, focusedFavoriteId: folder.id, favoriteDraft: null } })
    await nextTick()
    expect(document.activeElement).toBe(row)

    const selectedFolder = { ...folder }
    await wrapper.setProps({
      snapshot: { ...base, selectedFavoriteGroupId: folder.id, selectedFavoriteContainer: selectedFolder, favoriteDirectoryLoading: true }
    })
    expect(wrapper.get('[data-role="favorite-directory"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('.favorite-directory-state.loading').attributes('role')).toBe('status')

    await wrapper.setProps({
      snapshot: { ...base, selectedFavoriteGroupId: folder.id, selectedFavoriteContainer: selectedFolder, favoriteDirectoryLoading: false, favoriteDirectoryError: '没有访问权限' }
    })
    expect(wrapper.get('.favorite-directory-state.error').attributes('role')).toBe('alert')

    await wrapper.setProps({
      snapshot: { ...base, selectedFavoriteGroupId: folder.id, selectedFavoriteContainer: selectedFolder, favoriteDirectoryLoading: false, favoriteDirectoryError: null, favoriteDirectoryEntries: [] }
    })
    expect(wrapper.get('.favorite-directory-section .empty-note').text()).toBe('当前目录为空。')
  })

  it('supports menu arrow navigation and restores editor focus to the stable add button', async () => {
    const base = snapshotWithFavorites([favorite('file', 'file', '说明', '/tmp/说明.md')])
    const openSnapshot = {
      ...base,
      favoriteAddMenuOpen: true,
      favoriteCapabilities: { ...base.favoriteCapabilities, pickFiles: true, pickFolders: true }
    }
    const wrapper = mount(FavoritesPage, { props: { snapshot: { ...openSnapshot, favoriteAddMenuOpen: false } }, attachTo: document.body })
    await wrapper.setProps({ snapshot: openSnapshot })
    await nextTick()
    const menuItems = wrapper.findAll('#favorite-add-menu [role="menuitem"]')
    expect(document.activeElement).toBe(menuItems[0].element)
    await wrapper.get('#favorite-add-menu').trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(menuItems[1].element)

    const manual = menuItems[2].element as HTMLButtonElement
    manual.focus()
    const draft = {
      mode: 'create-target' as const, targetId: 'draft', targetIds: [] as string[], kind: 'folder' as const, name: '', path: '',
      tagsText: '', color: '#2F80ED', parentId: null, runnerEnabled: false, runnerMode: 'background' as const, runnerExecutable: '',
      runnerArgsText: '', runnerCwdMode: 'target-directory' as const, runnerCwd: '', runnerPlatform: 'darwin' as const, runnerTrusted: false, activeField: 'name' as const
    }
    await wrapper.setProps({ snapshot: { ...base, favoriteAddMenuOpen: false, favoriteDraft: draft } })
    await nextTick()
    const editor = wrapper.get('form.favorite-editor')
    expect(editor.attributes()).toMatchObject({ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'favorite-editor-title' })
    expect(document.activeElement).toBe(editor.get('[data-field="name"]').element)

    const focusable = editor.findAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ;(focusable.at(-1)?.element as HTMLElement).focus()
    await editor.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(focusable[0].element)

    await wrapper.setProps({ snapshot: { ...base, favoriteDraft: null } })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('.favorite-add-button').element)
  })

  it('renders structured runner preview and a compact ten-slot manager', async () => {
    const item = favorite('script', 'file', 'Run script', '/tmp/run script.sh')
    const base = snapshotWithFavorites([item])
    const draft = {
      mode: 'edit' as const,
      targetId: item.id,
      targetIds: [item.id],
      kind: item.kind,
      name: item.name,
      path: item.path,
      tagsText: '',
      color: item.color,
      parentId: null,
      runnerEnabled: true,
      runnerMode: 'background' as const,
      runnerExecutable: '/bin/sh',
      runnerArgsText: '{path}\n--name={name}',
      runnerCwdMode: 'target-directory' as const,
      runnerCwd: '',
      runnerPlatform: 'darwin' as const,
      runnerTrusted: false,
      activeField: 'runner-executable' as const
    }
    const wrapper = mount(FavoritesPage, {
      props: {
        snapshot: {
          ...base,
          favoriteCurrentPlatform: 'darwin',
          favoriteCapabilities: { ...base.favoriteCapabilities, platform: 'darwin', run: true, terminalRun: true },
          favoriteDraft: draft
        }
      },
      attachTo: document.body
    })

    expect(wrapper.get('.favorite-runner-editor legend').text()).toContain('macOS 打开方式')
    expect(wrapper.get('.favorite-runner-preview').text()).toContain('/tmp/run script.sh')
    expect(wrapper.get('.favorite-runner-heading').text()).toContain('保存时需要确认信任')

    const slots = base.state.favoriteSlots.map((slot) => slot.slot === 1
      ? { ...slot, favoriteIdByPlatform: { darwin: item.id } }
      : slot)
    await wrapper.setProps({
      snapshot: {
        ...base,
        state: { ...base.state, favoriteSlots: slots },
        favoriteCurrentPlatform: 'darwin',
        favoriteDraft: null,
        favoriteSlotManagerOpen: true,
        favoriteSlotManagerTargetId: item.id
      }
    })
    await nextTick()

    const manager = wrapper.get('[data-role="favorite-slot-manager"]')
    expect(manager.attributes()).toMatchObject({ role: 'dialog', 'aria-modal': 'true' })
    expect(manager.findAll('.favorite-slot-row')).toHaveLength(10)
    expect(manager.findAll('.favorite-slot-row')[0].text()).toContain('Run script')
    await manager.findAll('.favorite-slot-row')[0].get('button').trigger('click')
    expect(wrapper.emitted('dispatch')?.at(-1)).toEqual(['favorites.slot.assign.1'])
  })

  it('traps review focus, labels color fields, and restores its trigger', async () => {
    const base = snapshotWithFavorites([favorite('file', 'file', '说明', '/tmp/说明.md')])
    const wrapper = mount(FavoritesPage, { props: { snapshot: base }, attachTo: document.body })
    const trigger = wrapper.get('.favorite-add-button').element as HTMLButtonElement
    trigger.focus()
    const review = {
      kind: 'file' as const,
      parentId: null,
      activeIndex: 0,
      items: [{ id: 'review', kind: 'file' as const, path: '/tmp/new.md', name: 'New', parentId: null, tagsText: '', color: '#F2994A' }]
    }
    await wrapper.setProps({ snapshot: { ...base, favoritePickReview: review } })
    await nextTick()
    const dialog = wrapper.get('form.favorite-pick-review')
    expect(document.activeElement).toBe(dialog.get('[data-field="name"]').element)
    expect(dialog.get('input[type="color"]').attributes('aria-label')).toBe('设置 New 的颜色')
    const focusable = dialog.findAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ;(focusable.at(-1)?.element as HTMLElement).focus()
    await dialog.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(focusable[0].element)

    await wrapper.setProps({ snapshot: { ...base, favoritePickReview: null } })
    await nextTick()
    expect(document.activeElement).toBe(trigger)
  })

  it('moves focus between the stable narrow-screen panel controls', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 640, writable: true, configurable: true })
    const base = snapshotWithFavorites([favorite('group', 'group', '资料')])
    const wrapper = mount(FavoritesPage, {
      props: { snapshot: { ...base, favoriteContainerPanelOpen: false } },
      attachTo: document.body
    })
    await wrapper.setProps({ snapshot: { ...base, favoriteContainerPanelOpen: true } })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('[data-role="favorite-containers"]').element)

    await wrapper.setProps({ snapshot: { ...base, favoriteContainerPanelOpen: false } })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('button[aria-label="打开容器栏"]').element)
  })

  it('names, traps, and restores focus for confirmation dialogs', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = '移出收藏'
    document.body.appendChild(trigger)
    trigger.focus()
    const wrapper = mount(ConfirmLayer, { props: { title: '移出收藏', detail: '仅移除插件元数据' }, attachTo: document.body })
    await nextTick()
    expect(wrapper.get('[role="dialog"]').attributes()).toMatchObject({
      'aria-labelledby': 'confirm-layer-title',
      'aria-describedby': 'confirm-layer-detail'
    })
    const buttons = wrapper.findAll('button')
    expect(document.activeElement).toBe(buttons[0].element)
    ;(buttons[1].element as HTMLButtonElement).focus()
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(buttons[0].element)
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
    await nextTick()
    expect(document.activeElement).toBe(trigger)
  })

  it('restores confirmation focus to a stable pane when the trigger was removed', async () => {
    const container = document.createElement('div')
    container.dataset.role = 'favorite-containers'
    container.tabIndex = 0
    document.body.appendChild(container)
    const addButton = document.createElement('button')
    addButton.className = 'favorite-add-button'
    document.body.appendChild(addButton)
    const fallback = document.createElement('div')
    fallback.dataset.role = 'favorite-items'
    fallback.tabIndex = 0
    document.body.appendChild(fallback)
    const trigger = document.createElement('button')
    trigger.textContent = '移出当前行'
    document.body.appendChild(trigger)
    trigger.focus()
    const wrapper = mount(ConfirmLayer, {
      props: {
        title: '移出收藏',
        detail: '仅移除插件元数据',
        restoreFocusSelectors: ['[data-role="favorite-items"]', '.favorite-add-button', '[data-role="favorite-containers"]']
      },
      attachTo: document.body
    })
    await nextTick()
    trigger.remove()
    wrapper.unmount()
    await nextTick()
    expect(document.activeElement).toBe(fallback)
  })

  it('retries confirmation focus after the fallback pane finishes rendering', async () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame
    let retry: FrameRequestCallback | null = null
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      retry = callback
      return 1
    }) as typeof window.requestAnimationFrame
    try {
      const trigger = document.createElement('button')
      document.body.appendChild(trigger)
      trigger.focus()
      const wrapper = mount(ConfirmLayer, {
        props: { title: '移出收藏', detail: '仅移除插件元数据', restoreFocusSelectors: ['[data-role="favorite-items"]'] },
        attachTo: document.body
      })
      await nextTick()
      trigger.remove()
      wrapper.unmount()
      await nextTick()

      const fallback = document.createElement('div')
      fallback.dataset.role = 'favorite-items'
      fallback.tabIndex = 0
      document.body.appendChild(fallback)
      const scheduledRetry = retry as FrameRequestCallback | null
      scheduledRetry?.(0)
      expect(document.activeElement).toBe(fallback)
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame
    }
  })
})
