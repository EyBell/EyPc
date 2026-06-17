import { execFile } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseLsofListeningTcp, parseNetstatListeningTcp } from '../domain/ports'
import type { KillRequest, KillResult, PortProcess } from '../domain/types'
import { buildKillPlanCandidates, chooseScanCommandCandidates, type CommandPlan } from './processBridge'

interface CommandResult {
  ok: boolean
  stdout: string
  stderr: string
  error: string
}

type CommandRunner = (plan: CommandPlan) => Promise<CommandResult>

interface DevKillOptions {
  platform?: NodeJS.Platform | string
  runPlan?: CommandRunner
}

function run(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: 10_000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        error: error ? String(error.message || error) : ''
      })
    })
  })
}

function runPlan(plan: CommandPlan): Promise<CommandResult> {
  return run(plan.command, plan.args)
}

async function runFirst(plans: CommandPlan[], runner: CommandRunner = runPlan): Promise<CommandResult> {
  let last: CommandResult | null = null
  for (const plan of plans) {
    const result = await runner(plan)
    last = result
    if (result.ok) return result
  }
  return last || { ok: false, stdout: '', stderr: '', error: 'no command candidates' }
}

export function parseDevPortScanOutput(platform: NodeJS.Platform | string, output: string): PortProcess[] {
  return platform === 'win32' ? parseNetstatListeningTcp(output) : parseLsofListeningTcp(output)
}

export async function scanDevPorts(platform: NodeJS.Platform | string = process.platform, runner: CommandRunner = runPlan): Promise<PortProcess[]> {
  const result = await runFirst(chooseScanCommandCandidates(platform), runner)
  if (!result.ok) throw new Error(result.error || result.stderr || 'port scan failed')
  return parseDevPortScanOutput(platform, result.stdout)
}

function normalizeKillRequest(input: Partial<KillRequest> | null | undefined): KillRequest {
  return {
    pid: Math.max(0, Math.trunc(Number(input?.pid) || 0)),
    port: Math.max(0, Math.trunc(Number(input?.port) || 0)),
    force: Boolean(input?.force)
  }
}

export async function killDevPort(input: Partial<KillRequest> | null | undefined, options: DevKillOptions = {}): Promise<KillResult> {
  const request = normalizeKillRequest(input)
  const platform = options.platform || process.platform
  const runner = options.runPlan || runPlan
  if (!request.pid || !request.port) {
    return { ...request, ok: false, error: 'invalid kill request' }
  }
  const current = await scanDevPorts(platform, runner)
  if (!current.some((item) => item.pid === request.pid && item.port === request.port)) {
    return { ...request, ok: false, error: 'PID no longer owns target port' }
  }
  const result = await runFirst(buildKillPlanCandidates(platform, request.pid, request.force), runner)
  return {
    ...request,
    ok: result.ok,
    error: result.ok ? undefined : result.error || result.stderr || 'kill failed'
  }
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 16_384) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!body.trim()) {
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function handleDevPortApi(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.url === '/__eypc__/ports/scan') {
    void scanDevPorts()
      .then((ports) => sendJson(res, 200, { ports }))
      .catch((error) => sendJson(res, 500, { ports: [], error: error instanceof Error ? error.message : 'port scan failed' }))
    return true
  }
  if (req.url === '/__eypc__/ports/kill') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return true
    }
    void readJsonBody(req)
      .then((body) => killDevPort(body as Partial<KillRequest> | null))
      .then((result) => sendJson(res, result.ok ? 200 : 409, result))
      .catch((error) => sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'kill request failed' }))
    return true
  }
  return false
}
