import { describe, expect, it } from 'vitest'
import { buildKillPlan, buildKillPlanCandidates, chooseScanCommand, chooseScanCommandCandidates } from '../../src/platform/processBridge'

describe('process bridge helpers', () => {
  it('chooses platform scan commands', () => {
    expect(chooseScanCommand('darwin')).toEqual({ command: 'lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] })
    expect(chooseScanCommand('linux')).toEqual({ command: 'lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] })
    expect(chooseScanCommand('win32')).toEqual({ command: 'netstat', args: ['-ano', '-p', 'tcp'] })
  })

  it('chooses absolute scan command candidates for GUI host PATH compatibility', () => {
    expect(chooseScanCommandCandidates('darwin')[0]).toEqual({ command: '/usr/sbin/lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] })
    expect(chooseScanCommandCandidates('linux').map((plan) => plan.command)).toContain('/usr/bin/lsof')
    expect(chooseScanCommandCandidates('win32', 'C:\\Windows')[0]).toEqual({ command: 'C:\\Windows\\System32\\netstat.exe', args: ['-ano', '-p', 'tcp'] })
  })

  it('builds normal and force kill plans', () => {
    expect(buildKillPlan('darwin', 123, false)).toEqual({ command: 'kill', args: ['-TERM', '123'] })
    expect(buildKillPlan('linux', 123, true)).toEqual({ command: 'kill', args: ['-KILL', '123'] })
    expect(buildKillPlan('win32', 123, true)).toEqual({ command: 'taskkill', args: ['/PID', '123', '/T', '/F'] })
  })

  it('chooses absolute kill candidates for GUI host PATH compatibility', () => {
    expect(buildKillPlanCandidates('darwin', 123, false)[0]).toEqual({ command: '/bin/kill', args: ['-TERM', '123'] })
    expect(buildKillPlanCandidates('win32', 123, true, 'C:\\Windows')[0]).toEqual({ command: 'C:\\Windows\\System32\\taskkill.exe', args: ['/PID', '123', '/T', '/F'] })
  })
})
