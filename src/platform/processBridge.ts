export interface CommandPlan {
  command: string
  args: string[]
}

export type SupportedNodePlatform = 'darwin' | 'linux' | 'win32'

export function chooseScanCommand(platform: string | SupportedNodePlatform): CommandPlan {
  if (platform === 'win32') return { command: 'netstat', args: ['-ano', '-p', 'tcp'] }
  return { command: 'lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] }
}

export function chooseScanCommandCandidates(platform: string | SupportedNodePlatform, systemRoot = 'C:\\Windows'): CommandPlan[] {
  if (platform === 'win32') {
    return [
      { command: `${systemRoot}\\System32\\netstat.exe`, args: ['-ano', '-p', 'tcp'] },
      { command: 'netstat', args: ['-ano', '-p', 'tcp'] }
    ]
  }
  return [
    { command: '/usr/sbin/lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] },
    { command: '/usr/bin/lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] },
    { command: 'lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] }
  ]
}

export function buildKillPlan(platform: string | SupportedNodePlatform, pid: number, force: boolean): CommandPlan {
  const safePid = String(Math.max(0, Math.trunc(pid)))
  if (platform === 'win32') {
    return { command: 'taskkill', args: ['/PID', safePid, '/T', ...(force ? ['/F'] : [])] }
  }
  return { command: 'kill', args: [force ? '-KILL' : '-TERM', safePid] }
}

export function buildKillPlanCandidates(platform: string | SupportedNodePlatform, pid: number, force: boolean, systemRoot = 'C:\\Windows'): CommandPlan[] {
  const safePid = String(Math.max(0, Math.trunc(pid)))
  if (platform === 'win32') {
    const args = ['/PID', safePid, '/T', ...(force ? ['/F'] : [])]
    return [
      { command: `${systemRoot}\\System32\\taskkill.exe`, args },
      { command: 'taskkill', args }
    ]
  }
  const args = [force ? '-KILL' : '-TERM', safePid]
  return [
    { command: '/bin/kill', args },
    { command: 'kill', args }
  ]
}
