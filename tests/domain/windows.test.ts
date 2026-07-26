import { describe, expect, it } from 'vitest'
import { filterJumpableLiveWindows, isChromiumFamilyApp, isJumpableLiveWindow } from '../../src/domain/windows'

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
