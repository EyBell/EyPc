import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const openerModule = require_(resolve(process.cwd(), 'preload/cursor/open.cjs'))

const COMPOSER_A = '4cab4479-df25-4ff7-a427-26aed29c5c0a'
const COMPOSER_B = '9b09ae06-2a6a-4aa8-a8b3-eea23d8f4ca1'

function opener(options: { execError?: Error; withExec?: boolean } = {}) {
  const calls: Array<{ file: string; args: string[] }> = []
  const dependencies: Record<string, unknown> = {}
  if (options.withExec !== false) {
    dependencies.execFile = (file: string, args: string[], _opts: unknown, done: (error?: Error | null) => void) => {
      calls.push({ file, args })
      done(options.execError || null)
    }
  }
  return { value: openerModule.createOpener(dependencies), calls }
}

describe('cursor deep-link opener', () => {
  it('builds the exact agent deeplink for a bare composer id', () => {
    expect(openerModule.agentDeepLink(COMPOSER_A))
      .toBe(`cursor://anysphere.cursor-deeplink/agent?id=${COMPOSER_A}`)
  })

  it('only admits a canonical composer uuid', () => {
    expect(openerModule.normalizeComposerId(COMPOSER_A.toUpperCase())).toBe(COMPOSER_A)
    expect(openerModule.normalizeComposerId('not-a-uuid')).toBe('')
    expect(openerModule.normalizeComposerId('')).toBe('')
  })

  it('dispatches the deeplink on darwin via open and reports dispatched, never a read', async () => {
    const context = opener()
    const result = await context.value.openTask(COMPOSER_A, { platform: 'darwin' })
    expect(result).toMatchObject({ outcome: 'dispatched', confirmsRead: false })
    expect(context.calls).toEqual([
      { file: 'open', args: [`cursor://anysphere.cursor-deeplink/agent?id=${COMPOSER_A}`] }
    ])
  })

  it('uses the win32 and linux launchers per platform', async () => {
    const win = opener()
    await win.value.openTask(COMPOSER_A, { platform: 'win32' })
    expect(win.calls[0].file).toBe('cmd')
    expect(win.calls[0].args).toEqual(['/c', 'start', '', `cursor://anysphere.cursor-deeplink/agent?id=${COMPOSER_A}`])

    const linux = opener()
    await linux.value.openTask(COMPOSER_A, { platform: 'linux' })
    expect(linux.calls[0]).toEqual({ file: 'xdg-open', args: [`cursor://anysphere.cursor-deeplink/agent?id=${COMPOSER_A}`] })
  })

  it('refuses a non-composer id without dispatching', async () => {
    const context = opener()
    const result = await context.value.openTask('subagent-42', { platform: 'darwin' })
    expect(result.outcome).toBe('unavailable')
    expect(context.calls).toEqual([])
  })

  it('reports failed when the OS launcher errors', async () => {
    const context = opener({ execError: new Error('no handler') })
    const result = await context.value.openTask(COMPOSER_A, { platform: 'darwin' })
    expect(result.outcome).toBe('failed')
  })

  it('is unavailable when no exec launcher is present', async () => {
    const context = opener({ withExec: false })
    const result = await context.value.openTask(COMPOSER_A, { platform: 'darwin' })
    expect(result.outcome).toBe('unavailable')
  })

  it('coalesces a synchronous burst to the latest target', async () => {
    const context = opener()
    const first = context.value.openTask(COMPOSER_A, { platform: 'darwin' })
    const second = context.value.openTask(COMPOSER_B, { platform: 'darwin' })
    expect((await first).outcome).toBe('unavailable')
    expect((await second).outcome).toBe('dispatched')
    expect(context.calls).toEqual([
      { file: 'open', args: [`cursor://anysphere.cursor-deeplink/agent?id=${COMPOSER_B}`] }
    ])
  })
})
