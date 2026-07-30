import { describe, expect, it } from 'vitest'
import { compareWindowRowsByApplication, filterIdentifiedLiveWindows, liveWindowIdentity, targetMatchesLiveWindow, windowTargetAppMatches } from '../../src/domain/windows'

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
