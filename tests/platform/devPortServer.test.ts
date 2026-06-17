import { describe, expect, it } from 'vitest'
import { killDevPort, parseDevPortScanOutput } from '../../src/platform/devPortServer'

describe('dev port server scanner', () => {
  it('parses macOS lsof output for browser dev scans', () => {
    const rows = parseDevPortScanOutput('darwin', `COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    87822 gdkmjd 18u IPv6 0xabcd      0t0  TCP [::1]:8081 (LISTEN)
`)

    expect(rows).toEqual([
      expect.objectContaining({ pid: 87822, port: 8081, command: 'node', address: '[::1]:8081' })
    ])
  })

  it('parses Windows netstat output for browser dev scans', () => {
    const rows = parseDevPortScanOutput('win32', `  TCP    [::1]:8081        [::]:0         LISTENING       87822
`)

    expect(rows).toEqual([
      expect.objectContaining({ pid: 87822, port: 8081, command: 'pid-87822', address: '[::1]:8081' })
    ])
  })

  it('verifies pid and port before running a browser dev kill command', async () => {
    const executed: string[] = []
    const result = await killDevPort(
      { pid: 87822, port: 8081, force: false },
      {
        platform: 'darwin',
        runPlan: async (plan) => {
          executed.push(`${plan.command} ${plan.args.join(' ')}`)
          if (plan.command.includes('lsof')) {
            return {
              ok: true,
              stdout: `COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    87822 gdkmjd 18u IPv6 0xabcd      0t0  TCP [::1]:8081 (LISTEN)
`,
              stderr: '',
              error: ''
            }
          }
          return { ok: true, stdout: '', stderr: '', error: '' }
        }
      }
    )

    expect(result).toEqual({ ok: true, pid: 87822, port: 8081, force: false })
    expect(executed.some((item) => item.includes('kill -TERM 87822'))).toBe(true)
  })

  it('refuses browser dev kill when pid no longer owns the requested port', async () => {
    const executed: string[] = []
    const result = await killDevPort(
      { pid: 87822, port: 3000, force: true },
      {
        platform: 'darwin',
        runPlan: async (plan) => {
          executed.push(`${plan.command} ${plan.args.join(' ')}`)
          return {
            ok: true,
            stdout: `COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    87822 gdkmjd 18u IPv6 0xabcd      0t0  TCP [::1]:8081 (LISTEN)
`,
            stderr: '',
            error: ''
          }
        }
      }
    )

    expect(result).toMatchObject({ ok: false, pid: 87822, port: 3000, force: true })
    expect(result.error).toContain('PID no longer owns target port')
    expect(executed.some((item) => item.includes('kill -KILL'))).toBe(false)
  })
})
