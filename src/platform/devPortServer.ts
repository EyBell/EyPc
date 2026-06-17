import { execFile } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseLsofListeningTcp, parseNetstatListeningTcp } from '../domain/ports'
import type { PortProcess } from '../domain/types'
import { chooseScanCommandCandidates, type CommandPlan } from './processBridge'

interface CommandResult {
  ok: boolean
  stdout: string
  stderr: string
  error: string
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

async function runFirst(plans: CommandPlan[]): Promise<CommandResult> {
  let last: CommandResult | null = null
  for (const plan of plans) {
    const result = await run(plan.command, plan.args)
    last = result
    if (result.ok) return result
  }
  return last || { ok: false, stdout: '', stderr: '', error: 'no command candidates' }
}

export function parseDevPortScanOutput(platform: NodeJS.Platform | string, output: string): PortProcess[] {
  return platform === 'win32' ? parseNetstatListeningTcp(output) : parseLsofListeningTcp(output)
}

export async function scanDevPorts(platform: NodeJS.Platform | string = process.platform): Promise<PortProcess[]> {
  const result = await runFirst(chooseScanCommandCandidates(platform))
  if (!result.ok) throw new Error(result.error || result.stderr || 'port scan failed')
  return parseDevPortScanOutput(platform, result.stdout)
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function handleDevPortApi(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.url !== '/__eypc__/ports/scan') return false
  void scanDevPorts()
    .then((ports) => sendJson(res, 200, { ports }))
    .catch((error) => sendJson(res, 500, { ports: [], error: error instanceof Error ? error.message : 'port scan failed' }))
  return true
}
