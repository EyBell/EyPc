import { describe, expect, it } from 'vitest'
import { coalesceNativeWindowFamilies, compareWindowRowsByApplication, filterIdentifiedLiveWindows, liveWindowIdentity, mergePartialWindowFamilyInventory, targetMatchesLiveWindow, windowTargetAppMatches, type LiveWindow, type WindowTarget } from '../../src/domain/windows'
import { buildWindowTreeRows, candidateInstanceIdFromRowId, candidateWindowRowId, chooseFileManagerGroupLanding, fileManagerGroupKey, flattenWindowTree, liveWindowRowId, projectWindowTree, reconcileWindowTargetsWithFamilies, resolveVisibleWindowTreeFocus, resolveWindowTreeActionTargets, resolveWindowTreeNavigation, targetWindowRowId, toggleWindowTreeSelection } from '../../src/domain/windowTree'
import { createWindowRebindState, transitionWindowRebind, windowInteractionAllowed, windowRebindView } from '../../src/domain/windowRebind'

describe('window row application order', () => {
  it('keeps pinned rows first and sorts each section by application name', () => {
    const rows = [
      { id: 'beta', pinned: false, appName: 'Beta', displayName: 'Second', title: 'Second' },
      { id: 'zeta-pin', pinned: true, appName: 'Zeta', displayName: 'Pinned Zeta', title: 'Pinned Zeta' },
      { id: 'alpha', pinned: false, appName: 'Alpha', displayName: 'First', title: 'First' },
      { id: 'alpha-pin', pinned: true, appName: 'Alpha', displayName: 'Pinned Alpha', title: 'Pinned Alpha' }
    ]

    expect(rows.sort(compareWindowRowsByApplication).map((row) => row.id)).toEqual([
      'alpha-pin',
      'zeta-pin',
      'alpha',
      'beta'
    ])
  })
})

describe('identified live window filter', () => {
  it('keeps arbitrary titles and deduplicates only by instance id', () => {
    const kept = filterIdentifiedLiveWindows([
      { id: '1', instanceId: 'darwin:9:1', title: '' },
      { id: '2', instanceId: 'darwin:9:2', title: 'Window' },
      { id: '3', instanceId: 'darwin:9:3', title: 'Program Manager' },
      { id: '4', instanceId: 'darwin:9:2', title: 'changed title' }
    ])
    expect(kept.map((item) => item.id)).toEqual(['1', '2', '3'])
  })
})

describe('native window instance identity', () => {
  const target = {
    scope: 'instance' as const,
    platform: 'darwin' as const,
    appId: 'com.jetbrains.rider',
    appName: 'Rider',
    lastInstanceId: 'darwin:91:222',
    lastNativeRef: '91:0:222'
  }

  it('keeps matching the same instance after any title change', () => {
    const live = {
      instanceId: 'darwin:91:222',
      nativeRef: '91:0:222',
      platform: 'darwin' as const,
      appId: 'com.jetbrains.rider',
      appName: 'Rider',
      title: 'completely different browser tab title'
    }

    expect(liveWindowIdentity(live)).toBe('darwin:91:222')
    expect(targetMatchesLiveWindow(target, live)).toBe(true)
  })

  it('never treats an equal app/title with another instance id as the saved window', () => {
    const sibling = {
      instanceId: 'darwin:91:333',
      nativeRef: '91:0:333',
      platform: 'darwin' as const,
      appId: 'com.jetbrains.rider',
      appName: 'Rider',
      title: 'same title'
    }

    expect(windowTargetAppMatches(target, sibling)).toBe(true)
    expect(targetMatchesLiveWindow(target, sibling)).toBe(false)
  })

  it('allows an exact legacy native reference only until instance id is backfilled', () => {
    const legacy = { ...target, lastInstanceId: null }
    const live = {
      instanceId: 'darwin:91:222', nativeRef: '91:0:222', platform: 'darwin' as const,
      appId: 'com.jetbrains.rider', appName: 'Rider', title: 'any title'
    }
    expect(targetMatchesLiveWindow(legacy, live)).toBe(true)
  })
})

describe('root window family coalescing', () => {
  it('collapses proven child surfaces into one title-blind root while preserving member search titles', () => {
    const windows = coalesceNativeWindowFamilies([
      { id: 'tab-a', instanceId: 'darwin:10:201', rootInstanceId: 'darwin:10:100', platform: 'darwin', nativeRef: '10:0:201', rootNativeRef: '10:0:100', rootPid: 10, appId: 'com.browser', appName: 'Browser', pid: 10, title: 'Tab A', minimized: false, focused: false },
      { id: 'tab-b', instanceId: 'darwin:10:202', rootInstanceId: 'darwin:10:100', platform: 'darwin', nativeRef: '10:0:202', rootNativeRef: '10:0:100', rootPid: 10, appId: 'com.browser', appName: 'Browser', pid: 10, title: 'Tab B', minimized: false, focused: true }
    ])

    expect(windows).toHaveLength(1)
    expect(windows[0]).toMatchObject({ instanceId: 'darwin:10:100', nativeRef: '10:0:100', title: 'Tab B', focused: true })
    expect(windows[0].memberInstanceIds).toEqual(['darwin:10:201', 'darwin:10:202'])
    expect(windows[0].searchTitles).toEqual(['Tab A', 'Tab B'])
  })

  it('never merges independent roots merely because app and title are equal', () => {
    const common = { platform: 'darwin' as const, appId: 'com.browser', appName: 'Browser', pid: 10, title: 'Same', minimized: false, focused: false }
    const windows = coalesceNativeWindowFamilies([
      { ...common, id: 'one', instanceId: 'darwin:10:100', nativeRef: '10:0:100' },
      { ...common, id: 'two', instanceId: 'darwin:10:101', nativeRef: '10:0:101' }
    ])
    expect(windows.map((window) => window.instanceId)).toEqual(['darwin:10:100', 'darwin:10:101'])
  })

  it('does not retain a stale standalone member and preserves proven family evidence in a partial inventory', () => {
    const common = { platform: 'darwin' as const, appId: 'com.editor', appName: 'Editor', pid: 10, minimized: false, focused: false }
    const stale: LiveWindow = { ...common, id: 'member', instanceId: 'member', nativeRef: 'member', title: 'Tool', memberInstanceIds: ['old-sheet'], memberNativeRefs: ['old-sheet-ref'], searchTitles: ['Old sheet'] }
    const root: LiveWindow = { ...common, id: 'root', instanceId: 'root', nativeRef: 'root', title: 'Main', memberInstanceIds: ['member'] }
    expect(mergePartialWindowFamilyInventory([stale], [root])).toEqual([
      expect.objectContaining({
        instanceId: 'root',
        memberInstanceIds: ['member', 'old-sheet'],
        memberNativeRefs: ['member', 'old-sheet-ref'],
        searchTitles: ['Tool', 'Old sheet']
      })
    ])
  })
})

describe('file manager product tree', () => {
  const leaf = (id: string, appId = 'com.apple.finder', platform: 'darwin' | 'win32' = 'darwin') => ({
    row: id,
    id,
    platform,
    appId,
    appName: appId === 'com.apple.finder' ? 'Finder' : 'Browser',
    displayName: id,
    title: id,
    pinned: false,
    searchText: id
  })

  it('always creates one virtual Finder parent while keeping each root as a child', () => {
    const groupKey = fileManagerGroupKey('darwin', 'com.apple.finder')!
    const one = projectWindowTree([leaf('Downloads')], [], new Set(), '')
    expect(one).toMatchObject([{ kind: 'file-manager-group', groupKey, expanded: false, children: [{ id: 'Downloads' }] }])

    const multiple = projectWindowTree([leaf('Downloads'), leaf('Projects')], [], new Set([groupKey]), '')
    expect(multiple).toMatchObject([{ kind: 'file-manager-group', groupKey, expanded: true, visibleChildren: [{ id: 'Downloads' }, { id: 'Projects' }] }])
    expect(fileManagerGroupKey('win32', 'Explorer.exe')).toBe('file-manager:win32:explorer')
    expect(projectWindowTree([
      leaf('explorer-pid-10', 'explorer.exe', 'win32'),
      leaf('explorer-pid-20', 'explorer', 'win32')
    ], [], new Set(['file-manager:win32:explorer']), '')).toMatchObject([
      { kind: 'file-manager-group', groupKey: 'file-manager:win32:explorer', children: [{ id: 'explorer-pid-10' }, { id: 'explorer-pid-20' }] }
    ])
  })

  it('does not aggregate ordinary application roots and expands only matching file-manager search children', () => {
    const result = projectWindowTree([leaf('Browser A', 'com.browser'), leaf('Browser B', 'com.browser'), leaf('Downloads'), leaf('Projects')], [], new Set(), 'Projects')
    expect(result).toMatchObject([{ kind: 'file-manager-group', expanded: true, visibleChildren: [{ id: 'Projects' }] }])
    const visible = flattenWindowTree(result)
    expect(visible.map((item) => item.kind === 'window' ? [item.source.id, item.level] : [item.projection.groupKey, 1])).toEqual([
      ['file-manager:darwin:com.apple.finder', 1],
      ['Projects', 2]
    ])
    expect(resolveVisibleWindowTreeFocus({ id: 'Downloads', parentGroupKey: 'file-manager:darwin:com.apple.finder' }, [
      { id: 'group:file-manager:darwin:com.apple.finder' }
    ])).toBe('group:file-manager:darwin:com.apple.finder')
  })

  it('uses the shared parent landing policy: focused, last active, session recent, then visible order', () => {
    const windows: LiveWindow[] = [
      { id: 'a', instanceId: 'a', platform: 'darwin', nativeRef: 'a', appId: 'com.apple.finder', appName: 'Finder', pid: 1, title: 'A', minimized: false, focused: false },
      { id: 'b', instanceId: 'b', platform: 'darwin', nativeRef: 'b', appId: 'com.apple.finder', appName: 'Finder', pid: 1, title: 'B', minimized: false, focused: false }
    ]
    expect(chooseFileManagerGroupLanding(windows, { lastActiveInstanceId: 'b', recentInstanceId: 'a', orderedInstanceIds: ['a', 'b'] })?.instanceId).toBe('b')
    expect(chooseFileManagerGroupLanding(windows, { recentInstanceId: 'b', orderedInstanceIds: ['a', 'b'] })?.instanceId).toBe('b')
    expect(chooseFileManagerGroupLanding(windows, { orderedInstanceIds: ['b', 'a'] })?.instanceId).toBe('b')
    expect(chooseFileManagerGroupLanding([{ ...windows[0], focused: true }, windows[1]], { lastActiveInstanceId: 'b' })?.instanceId).toBe('a')
  })

  it('centralizes row identity, projection, navigation, action targets, and real-root-only selection', () => {
    const finder: LiveWindow[] = [
      { id: 'downloads', instanceId: 'downloads', platform: 'darwin', nativeRef: 'downloads', appId: 'com.apple.finder', appName: 'Finder', pid: 1, title: 'Downloads', minimized: false, focused: false },
      { id: 'projects', instanceId: 'projects', platform: 'darwin', nativeRef: 'projects', appId: 'com.apple.finder', appName: 'Finder', pid: 1, title: 'Projects', minimized: false, focused: true },
      { id: 'browser', instanceId: 'browser', platform: 'darwin', nativeRef: 'browser', appId: 'com.browser', appName: 'Browser', pid: 2, title: 'Browser', minimized: false, focused: false }
    ]
    const groupKey = fileManagerGroupKey('darwin', 'com.apple.finder')!
    const rows = buildWindowTreeRows({
      targets: [],
      slots: [],
      liveWindows: finder,
      freshInstanceIds: new Set(finder.map((window) => window.instanceId)),
      currentPlatform: 'darwin',
      listLoaded: true,
      focusedRowId: `group:${groupKey}`,
      selectedRowIds: [],
      expandedGroupKeys: new Set([groupKey]),
      recentFileManagerInstanceIds: new Map(),
      searchQuery: '',
      rebind: { targetId: null, candidateInstanceIds: [] }
    })
    const group = rows.find((row) => row.kind === 'file-manager-group')!
    const children = rows.filter((row) => row.parentGroupKey === groupKey)
    const browser = rows.find((row) => row.live?.instanceId === 'browser')!

    expect(rows.map((row) => row.id)).toEqual([liveWindowRowId('browser'), `group:${groupKey}`, liveWindowRowId('downloads'), liveWindowRowId('projects')])
    expect(resolveWindowTreeNavigation(rows, group.id, 'expand').focusedId).toBe(children[0].id)
    expect(resolveWindowTreeNavigation(rows, children[0].id, 'collapse').focusedId).toBe(group.id)
    expect(toggleWindowTreeSelection(rows, { focusedId: group.id, selectedIds: [], advance: true })).toMatchObject({ focusedId: children[0].id, selectedIds: [], virtualParentBlocked: true })
    expect(toggleWindowTreeSelection(rows, { focusedId: browser.id, selectedIds: [], advance: true })).toMatchObject({ selectedIds: [browser.id], focusedId: children[0].id, virtualParentBlocked: false })
    expect(resolveWindowTreeActionTargets(rows, { focusedId: group.id, selectedIds: [] })).toMatchObject({ mode: 'single', context: 'file-manager-group', targets: [{ id: group.id }] })
    expect(resolveWindowTreeActionTargets(rows, { focusedId: children[0].id, selectedIds: [children[0].id, browser.id] })).toMatchObject({ mode: 'multi', context: 'selection', targets: [{ id: children[0].id }, { id: browser.id }] })
    expect(candidateInstanceIdFromRowId(candidateWindowRowId('darwin:1:2'))).toBe('darwin:1:2')
    expect(targetWindowRowId('saved')).toBe('target:saved')
  })
})

describe('legacy member target reconciliation', () => {
  function target(id: string, alias: string, nativeRef: string, createdAt: number): WindowTarget {
    return { id, alias, scope: 'instance', platform: 'darwin', appId: 'com.editor', appName: 'Editor', lastKnownTitle: alias, lastInstanceId: null, lastNativeRef: nativeRef, groupKey: null, lastActiveInstanceId: null, alternateAliases: [], favorite: id === 'later', pinned: id === 'earlier', createdAt, updatedAt: createdAt }
  }

  it('adopts a proven root, merges duplicate member targets losslessly, and remaps every slot', () => {
    const live: LiveWindow = { id: 'darwin:8:100', instanceId: 'darwin:8:100', platform: 'darwin', nativeRef: '8:0:100', appId: 'com.editor', appName: 'Editor', pid: 8, title: 'Current', minimized: false, focused: true, memberNativeRefs: ['8:0:201', '8:0:202'], memberInstanceIds: ['darwin:8:201', 'darwin:8:202'] }
    const result = reconcileWindowTargetsWithFamilies(
      [target('earlier', 'Old editor', '8:0:201', 1), target('later', 'Second alias', '8:0:202', 2)],
      [{ slot: 1, targetIdByPlatform: { darwin: 'later' } }, { slot: 2, targetIdByPlatform: { darwin: 'earlier' } }],
      [live],
      10
    )
    expect(result.targets).toHaveLength(1)
    expect(result.targets[0]).toMatchObject({ id: 'later', lastInstanceId: 'darwin:8:100', lastNativeRef: '8:0:100', favorite: true, pinned: true, alternateAliases: ['Old editor'] })
    expect(result.slots.map((slot) => slot.targetIdByPlatform.darwin)).toEqual(['later', 'later'])
  })
})

describe('window rebind state machine', () => {
  it('owns entry, candidate deduplication, focus, and interaction policy', () => {
    const transition = transitionWindowRebind(createWindowRebindState(), {
      type: 'begin',
      targetId: 'browser',
      candidateInstanceIds: ['darwin:91:222', 'darwin:91:222', 'darwin:91:333'],
      restoreFocusRowId: 'target:browser'
    })

    expect(windowRebindView(transition.state)).toEqual({
      phase: 'confirming',
      targetId: 'browser',
      candidateInstanceIds: ['darwin:91:222', 'darwin:91:333']
    })
    expect(transition.effects.focusCandidateInstanceId).toBe('darwin:91:222')
    expect(windowInteractionAllowed(transition.state, 'browse')).toBe(false)
    expect(windowInteractionAllowed(transition.state, 'rebind')).toBe(true)
    expect(windowInteractionAllowed(transition.state, 'always')).toBe(true)
  })

  it('retains cached candidates for partial inventory and replaces them for complete inventory', () => {
    const begun = transitionWindowRebind(createWindowRebindState(), {
      type: 'begin',
      targetId: 'browser',
      candidateInstanceIds: ['darwin:91:222'],
      restoreFocusRowId: 'target:browser'
    }).state
    const partial = transitionWindowRebind(begun, {
      type: 'inventory',
      completeness: 'partial',
      freshCandidateInstanceIds: ['darwin:91:333'],
      retainedInstanceIds: ['darwin:91:222', 'darwin:91:333'],
      focusedCandidateInstanceId: 'darwin:91:222'
    })
    expect(windowRebindView(partial.state).candidateInstanceIds).toEqual(['darwin:91:222', 'darwin:91:333'])
    expect(partial.effects.clearStaleBindingTargetId).toBeNull()

    const complete = transitionWindowRebind(partial.state, {
      type: 'inventory',
      completeness: 'complete',
      freshCandidateInstanceIds: [],
      retainedInstanceIds: [],
      focusedCandidateInstanceId: 'darwin:91:222'
    })
    expect(windowRebindView(complete.state)).toEqual({ phase: 'confirming', targetId: 'browser', candidateInstanceIds: [] })
    expect(complete.effects.clearStaleBindingTargetId).toBe('browser')
  })

  it('ends only for the matching confirmed target or an explicit cancel', () => {
    const begun = transitionWindowRebind(createWindowRebindState(), {
      type: 'begin',
      targetId: 'browser',
      candidateInstanceIds: ['darwin:91:222'],
      restoreFocusRowId: 'target:browser'
    }).state

    const unrelated = transitionWindowRebind(begun, { type: 'confirmed', targetId: 'editor' })
    expect(unrelated.state).toEqual(begun)

    const cancelled = transitionWindowRebind(unrelated.state, { type: 'cancel' })
    expect(windowRebindView(cancelled.state)).toEqual({ phase: 'idle', targetId: null, candidateInstanceIds: [] })
    expect(cancelled.effects.restoreFocusRowId).toBe('target:browser')

    const confirmed = transitionWindowRebind(begun, { type: 'confirmed', targetId: 'browser' })
    expect(windowRebindView(confirmed.state)).toEqual({ phase: 'idle', targetId: null, candidateInstanceIds: [] })
  })
})
