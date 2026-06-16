import { describe, expect, it } from 'vitest'
import { buildKillPlan, chooseScanCommand } from '../../src/platform/processBridge'

describe('process bridge helpers', () => {
  it('chooses platform scan commands', () => {
    expect(chooseScanCommand('darwin').command).toBe('lsof')
    expect(chooseScanCommand('linux').command).toBe('lsof')
    expect(chooseScanCommand('win32').command).toBe('netstat')
  })

  it('builds normal and force kill plans', () => {
    expect(buildKillPlan('darwin', 123, false)).toEqual({ command: 'kill', args: ['-TERM', '123'] })
    expect(buildKillPlan('linux', 123, true)).toEqual({ command: 'kill', args: ['-KILL', '123'] })
    expect(buildKillPlan('win32', 123, true)).toEqual({ command: 'taskkill', args: ['/PID', '123', '/T', '/F'] })
  })
})
