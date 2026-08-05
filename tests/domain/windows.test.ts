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

  it('prioritizes bound slots by ascending slot number before pin and application order', () => {
    const rows = [
      { id: 'pin-only', pinned: true, appName: 'Alpha', displayName: 'Pinned', title: 'Pinned', slotNumbers: [] as number[] },
      { id: 'slot-5', pinned: false, appName: 'Zeta', displayName: 'Slot Five', title: 'Slot Five', slotNumbers: [5] },
      { id: 'slot-1', pinned: false, appName: 'Omega', displayName: 'Slot One', title: 'Slot One', slotNumbers: [1] },
      { id: 'plain', pinned: false, appName: 'Beta', displayName: 'Plain', title: 'Plain', slotNumbers: [] as number[] },
      { id: 'slot-2-and-9', pinned: true, appName: 'Gamma', displayName: 'Multi', title: 'Multi', slotNumbers: [9, 2] }
    ]

    expect(rows.sort(compareWindowRowsByApplication).map((row) => row.id)).toEqual([
      'slot-1',
      'slot-2-and-9',
      'slot-5',
      'pin-only',
      'plain'
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
  it('keeps one real root with its proven, title-blind child relationship', () => {
    const families = coalesceNativeWindowFamilies([
      { id: 'root', instanceId: 'darwin:10:100', relationship: 'root', relationEvidence: 'root-self', rootInstanceId: 'darwin:10:100', platform: 'darwin', nativeRef: '10:0:100', rootNativeRef: '10:0:100', rootPid: 10, appId: 'com.browser', appName: 'Browser', pid: 10, title: 'Browser Main', minimized: false, focused: false },
      { id: 'tab-a', instanceId: 'darwin:10:201', relationship: 'child', relationEvidence: 'macos-ax-top-level', rootInstanceId: 'darwin:10:100', platform: 'darwin', nativeRef: '10:0:201', rootNativeRef: '10:0:100', rootPid: 10, appId: 'com.browser', appName: 'Browser', pid: 10, title: 'Tab A', minimized: false, focused: false },
      { id: 'tab-b', instanceId: 'darwin:10:202', relationship: 'child', relationEvidence: 'macos-ax-top-level', rootInstanceId: 'darwin:10:100', platform: 'darwin', nativeRef: '10:0:202', rootNativeRef: '10:0:100', rootPid: 10, appId: 'com.browser', appName: 'Browser', pid: 10, title: 'Tab B', minimized: false, focused: true }
    ])

    expect(families).toHaveLength(1)
    expect(families[0].root).toMatchObject({ instanceId: 'darwin:10:100', nativeRef: '10:0:100', title: 'Browser Main', focused: true })
    expect(families[0].root.memberInstanceIds).toEqual(['darwin:10:100', 'darwin:10:201', 'darwin:10:202'])
    expect(families[0].root.searchTitles).toEqual(['Browser Main', 'Tab A', 'Tab B'])
    expect(families[0].children.map((child) => child.instanceId)).toEqual(['darwin:10:202', 'darwin:10:201'])
  })

  it('never merges independent roots merely because app and title are equal', () => {
    const common = { platform: 'darwin' as const, appId: 'com.browser', appName: 'Browser', pid: 10, title: 'Same', minimized: false, focused: false }
    const families = coalesceNativeWindowFamilies([
      { ...common, id: 'one', instanceId: 'darwin:10:100', nativeRef: '10:0:100' },
      { ...common, id: 'two', instanceId: 'darwin:10:101', nativeRef: '10:0:101' }
    ])
    expect(families.map((family) => family.root.instanceId)).toEqual(['darwin:10:100', 'darwin:10:101'])
  })

  it('does not retain a stale standalone member and preserves proven family evidence in a partial inventory', () => {
    const common = { platform: 'darwin' as const, appId: 'com.editor', appName: 'Editor', pid: 10, minimized: false, focused: false }
    const staleRoot: LiveWindow = { ...common, id: 'member', instanceId: 'member', nativeRef: 'member', title: 'Tool', relationship: 'root', memberInstanceIds: ['member', 'old-sheet'], memberNativeRefs: ['member', 'old-sheet-ref'], searchTitles: ['Tool', 'Old sheet'] }
    const staleChild: LiveWindow = { ...common, id: 'old-sheet', instanceId: 'old-sheet', nativeRef: 'old-sheet-ref', title: 'Old sheet', relationship: 'child', rootInstanceId: 'member', rootNativeRef: 'member' }
    const root: LiveWindow = { ...common, id: 'root', instanceId: 'root', nativeRef: 'root', title: 'Main', relationship: 'root', memberInstanceIds: ['root', 'member'], memberNativeRefs: ['root', 'member'], searchTitles: ['Main', 'Tool'] }
    const member: LiveWindow = { ...common, id: 'member', instanceId: 'member', nativeRef: 'member', title: 'Tool', relationship: 'child', rootInstanceId: 'root', rootNativeRef: 'root' }
    const merged = mergePartialWindowFamilyInventory(
      [{ root: staleRoot, children: [staleChild] }],
      [{ root, children: [member] }]
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].root).toMatchObject({
      instanceId: 'root',
      memberInstanceIds: ['root', 'member', 'old-sheet'],
      memberNativeRefs: ['root', 'member', 'old-sheet-ref'],
      searchTitles: ['Main', 'Tool', 'Old sheet']
    })
    expect(merged[0].children.map((child) => child.instanceId)).toEqual(['member', 'old-sheet'])
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
    slotNumbers: [] as number[],
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

  it('orders retained slot-bound roots by ascending slot number ahead of pin-only and live rows', () => {
    const live: LiveWindow[] = [
      { id: 'live-a', instanceId: 'live-a', platform: 'darwin', nativeRef: 'live-a', appId: 'com.alpha', appName: 'Alpha', pid: 1, title: 'Live Alpha', minimized: false, focused: false },
      { id: 'slot-5', instanceId: 'slot-5', platform: 'darwin', nativeRef: 'slot-5', appId: 'com.zeta', appName: 'Zeta', pid: 5, title: 'Slot Five', minimized: false, focused: false },
      { id: 'slot-1', instanceId: 'slot-1', platform: 'darwin', nativeRef: 'slot-1', appId: 'com.omega', appName: 'Omega', pid: 1, title: 'Slot One', minimized: false, focused: false }
    ]
    const target = (id: string, alias: string, instanceId: string, pinned: boolean): WindowTarget => ({
      id,
      alias,
      scope: 'instance',
      platform: 'darwin',
      appId: live.find((item) => item.instanceId === instanceId)!.appId,
      appName: live.find((item) => item.instanceId === instanceId)!.appName,
      lastKnownTitle: alias,
      lastInstanceId: instanceId,
      lastNativeRef: instanceId,
      groupKey: null,
      lastActiveInstanceId: null,
      alternateAliases: [],
      favorite: false,
      pinned,
      createdAt: 1,
      updatedAt: 1
    })
    const rows = buildWindowTreeRows({
      targets: [
        target('t-pin', 'Pinned Alpha', 'live-a', true),
        target('t-5', 'Slot Five', 'slot-5', false),
        target('t-1', 'Slot One', 'slot-1', false)
      ],
      slots: [
        { slot: 5, targetIdByPlatform: { darwin: 't-5' } },
        { slot: 1, targetIdByPlatform: { darwin: 't-1' } }
      ],
      liveWindows: live,
      freshInstanceIds: new Set(live.map((window) => window.instanceId)),
      currentPlatform: 'darwin',
      listLoaded: true,
      focusedRowId: null,
      selectedRowIds: [],
      expandedGroupKeys: new Set(),
      recentFileManagerInstanceIds: new Map(),
      searchQuery: '',
      rebind: { targetId: null, candidateInstanceIds: [] }
    })

    expect(rows.filter((row) => row.treeLevel === 1).map((row) => ({ id: row.id, slots: row.slotNumbers }))).toEqual([
      { id: targetWindowRowId('t-1'), slots: [1] },
      { id: targetWindowRowId('t-5'), slots: [5] },
      { id: targetWindowRowId('t-pin'), slots: [] }
    ])
  })
})

describe('legacy member target reconciliation', () => {
  function target(id: string, alias: string, nativeRef: string, createdAt: number): WindowTarget {
    return { id, alias, scope: 'instance', platform: 'darwin', appId: 'com.editor', appName: 'Editor', lastKnownTitle: alias, lastInstanceId: null, lastNativeRef: nativeRef, groupKey: null, lastActiveInstanceId: null, alternateAliases: [], favorite: id === 'later', pinned: id === 'earlier', createdAt, updatedAt: createdAt }
  }

  it('adopts a proven root for one unambiguous historical member target', () => {
    const live: LiveWindow = { id: 'darwin:8:100', instanceId: 'darwin:8:100', platform: 'darwin', nativeRef: '8:0:100', appId: 'com.editor', appName: 'Editor', pid: 8, title: 'Current', minimized: false, focused: true, memberNativeRefs: ['8:0:201', '8:0:202'], memberInstanceIds: ['darwin:8:201', 'darwin:8:202'] }
    const result = reconcileWindowTargetsWithFamilies(
      [target('earlier', 'Old editor', '8:0:201', 1)],
      [{ slot: 1, targetIdByPlatform: { darwin: 'earlier' } }],
      [live],
      10
    )
    expect(result.targets).toMatchObject([
      { id: 'earlier', alias: 'Old editor', lastInstanceId: 'darwin:8:100', lastNativeRef: '8:0:100', favorite: false, pinned: true, alternateAliases: [] }
    ])
    expect(result.slots[0].targetIdByPlatform.darwin).toBe('earlier')
    expect(result.changed).toBe(true)
  })

  it('preserves multiple historical targets that converge on one root for explicit recovery', () => {
    const live: LiveWindow = { id: 'darwin:8:100', instanceId: 'darwin:8:100', platform: 'darwin', nativeRef: '8:0:100', appId: 'com.editor', appName: 'Editor', pid: 8, title: 'Current', minimized: false, focused: true, memberNativeRefs: ['8:0:201', '8:0:202'], memberInstanceIds: ['darwin:8:201', 'darwin:8:202'] }
    const result = reconcileWindowTargetsWithFamilies(
      [target('earlier', 'Old editor', '8:0:201', 1), target('later', 'Second alias', '8:0:202', 2)],
      [{ slot: 1, targetIdByPlatform: { darwin: 'later' } }, { slot: 2, targetIdByPlatform: { darwin: 'earlier' } }],
      [live],
      10
    )

    expect(result.targets).toMatchObject([
      { id: 'earlier', lastInstanceId: null, lastNativeRef: '8:0:201', alias: 'Old editor', favorite: false, pinned: true },
      { id: 'later', lastInstanceId: null, lastNativeRef: '8:0:202', alias: 'Second alias', favorite: true, pinned: false }
    ])
    expect(result.slots.map((slot) => slot.targetIdByPlatform.darwin)).toEqual(['later', 'earlier'])
    expect(result.changed).toBe(false)
  })
})

describe('window rebind state machine', () => {
  it('owns entry, candidate deduplication, focus, and interaction policy', () => {
    const transition = transitionWindowRebind(createWindowRebindState(), {
      type: 'begin',
      targetId: 'browser',
      candidateInstanceIds: ['darwin:91:222', 'darwin:91:222', 'darwin:91:333'],
      restoreFocusRowId: 'target:browser',
      slotNumber: 2
    })

    expect(windowRebindView(transition.state)).toEqual({
      phase: 'confirming',
      targetId: 'browser',
      candidateInstanceIds: ['darwin:91:222', 'darwin:91:333']
    })
    expect(transition.effects.focusCandidateInstanceId).toBe('darwin:91:222')
    expect(transition.state).toMatchObject({ phase: 'confirming', slotNumber: 2 })
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
    expect(partial.effects.probeStaleBindingTargetId).toBeNull()

    const complete = transitionWindowRebind(partial.state, {
      type: 'inventory',
      completeness: 'complete',
      freshCandidateInstanceIds: [],
      retainedInstanceIds: [],
      focusedCandidateInstanceId: 'darwin:91:222'
    })
    expect(windowRebindView(complete.state)).toEqual({ phase: 'confirming', targetId: 'browser', candidateInstanceIds: [] })
    expect(complete.effects.probeStaleBindingTargetId).toBe('browser')
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
