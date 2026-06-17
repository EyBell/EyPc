import { describe, expect, it } from 'vitest'
import { parseDevPortScanOutput } from '../../src/platform/devPortServer'

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
})
