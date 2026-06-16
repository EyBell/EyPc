export interface CommandPlan {
  command: string
  args: string[]
}

export type SupportedNodePlatform = 'darwin' | 'linux' | 'win32'

export function chooseScanCommand(platform: string | SupportedNodePlatform): CommandPlan {
  if (platform === 'win32') return { command: 'netstat', args: ['-ano', '-p', 'tcp'] }
  return { command: 'lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] }
}

export function buildKillPlan(platform: string | SupportedNodePlatform, pid: number, force: boolean): CommandPlan {
  const safePid = String(Math.max(0, Math.trunc(pid)))
  if (platform === 'win32') {
    return { command: 'taskkill', args: ['/PID', safePid, '/T', ...(force ? ['/F'] : [])] }
  }
  return { command: 'kill', args: [force ? '-KILL' : '-TERM', safePid] }
}
