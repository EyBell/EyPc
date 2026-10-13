import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkCompanionDiagnosticPrivacy } from '../../scripts/check-companion-diagnostic-privacy.mjs'

const source = readFileSync('preload/index.js', 'utf8')
describe('Side recovery diagnostics privacy boundary', () => {
  it('keeps recovery evidence while correlating both events with one anonymous task fingerprint', () => {
    expect(checkCompanionDiagnosticPrivacy(source)).toBe(2)
  })
  it.each(['desktop-resubscribe', 'desktop-replacement-snapshot'])('rejects bypassing the existing anonymous owner for %s', event => {
    const end = source.indexOf(`event: '${event}'`)
    const begin = source.lastIndexOf('recordCompanionDiagnosticEvent({', end)
    expect(begin).toBeGreaterThan(0)
    const changed = source.slice(0, begin) + source.slice(begin).replace('recordCompanionDiagnosticEvent({', 'runtimeDiagnostics.record({')
    expect(() => checkCompanionDiagnosticPrivacy(changed)).toThrow(/anonymous diagnostic owner/)
  })
})
