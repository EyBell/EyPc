import { describe, expect, it } from 'vitest'
import { compareWindowRowsByApplication, filterJumpableLiveWindows, isChromiumFamilyApp, isJumpableLiveWindow } from '../../src/domain/windows'

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

describe('jumpable live window filter', () => {
  it('drops chromium placeholder Window titles and host chrome shells', () => {
    expect(isJumpableLiveWindow({ appId: 'com.microsoft.edgemac', appName: 'Microsoft Edge', title: 'Window' })).toBe(false)
    expect(isJumpableLiveWindow({ appId: 'msedge', appName: 'msedge', title: 'Window' })).toBe(false)
    expect(isJumpableLiveWindow({ appId: 'explorer', appName: 'explorer', title: 'Program Manager' })).toBe(false)
    expect(isJumpableLiveWindow({ appId: 'explorer', appName: 'explorer', title: 'Default IME' })).toBe(false)
  })

  it('keeps real browser, app-named, and desktop windows', () => {
    expect(isChromiumFamilyApp({ appId: 'com.microsoft.edgemac', appName: 'Microsoft Edge' })).toBe(true)
    expect(isJumpableLiveWindow({
      appId: 'com.microsoft.edgemac',
      appName: 'Microsoft Edge',
      title: '总开发任务项目管理 - 飞书云文档 - Microsoft Edge'
    })).toBe(true)
    expect(isJumpableLiveWindow({
      appId: 'chrome',
      appName: 'Google Chrome',
      title: 'Google Chrome'
    })).toBe(true)
    expect(isJumpableLiveWindow({
      appId: 'com.keepassxc',
      appName: 'KeePassXC',
      title: 'edge-250717 - KeePassXC'
    })).toBe(true)
    expect(isJumpableLiveWindow({
      appId: 'com.apple.Notes',
      appName: 'Notes',
      title: 'Inbox'
    })).toBe(true)
    expect(isJumpableLiveWindow({
      appId: 'com.apple.Safari',
      appName: 'Safari',
      title: 'Window'
    })).toBe(true)
  })

  it('filters a mixed list while preserving order of keepers', () => {
    const kept = filterJumpableLiveWindows([
      { id: '1', appId: 'com.microsoft.edgemac', appName: 'Microsoft Edge', title: 'Window' },
      { id: '2', appId: 'com.microsoft.edgemac', appName: 'Microsoft Edge', title: 'Docs - Microsoft Edge' },
      { id: '3', appId: 'explorer', appName: 'explorer', title: 'MSCTFIME UI' },
      { id: '4', appId: 'Notes', appName: 'Notes', title: 'Inbox' }
    ])
    expect(kept.map((item) => item.id)).toEqual(['2', '4'])
  })
})
