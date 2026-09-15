import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { createShortcutReadReceipts } = require_('../../preload/companion/shortcut-read.cjs')
const task = (extra = {}) => ({ key: 'a', phase: 'completed', unread: true, terminalAt: 100, phaseRevision: 100, ...extra })
function setup() {
  const receipts = createShortcutReadReceipts()
  receipts.retain(new Set(['a']))
  return receipts
}
describe('shortcut-local read boundaries', () => {
  it('rejects delayed success after reset or removal and reappearance of the same key', () => {
    const receipts = setup(), row = task()
    const beforeReset = receipts.capture(row, [row], 'global-shortcut')
    receipts.clear(); receipts.retain(new Set(['a']))
    expect(receipts.accept(beforeReset, row, [row], 'dispatched')).toBe(false)
    const beforeRemoval = receipts.capture(row, [row], 'global-shortcut')
    receipts.retain(new Set()); receipts.retain(new Set(['a']))
    expect(receipts.accept(beforeRemoval, row, [row], 'dispatched')).toBe(false)
  })
  it('does not acknowledge an automatic recovery or an ordinary card dispatch', () => {
    const receipts = setup(), row = task()
    expect(receipts.capture(row, [row], 'automatic-recovery')).toBeNull()
    expect(receipts.capture(row, [row], 'card-click')).toBeNull()
  })
  it('does not hide a new child completion or child membership change', () => {
    for (const nextChild of [task({ key: 'child', terminalAt: 200 }), task({ key: 'other-child' })]) {
      const receipts = setup(), root = task(), child = task({ key: 'child' })
      const token = receipts.capture(root, [root, child], 'global-shortcut')
      expect(receipts.accept(token, root, [root, child], 'dispatched')).toBe(true)
      expect(receipts.project(root, [root, child]).unread).toBe(false)
      expect(receipts.project(root, [root, nextChild]).unread).toBe(true)
    }
  })
  it('allows a new native unread transition after native read was observed', () => {
    const receipts = setup(), row = task()
    const token = receipts.capture(row, [row], 'global-shortcut')
    receipts.accept(token, row, [row], 'dispatched')
    expect(receipts.project(task({ unread: false }), [task({ unread: false })]).unread).toBe(false)
    expect(receipts.project(row, [row]).unread).toBe(true)
  })
  it('does not mutate provider evidence or persist receipts', () => {
    const receipts = setup(), row = Object.freeze(task())
    const token = receipts.capture(row, [row], 'global-shortcut')
    receipts.accept(token, row, [row], 'dispatched')
    expect(receipts.project(row, [row]).unread).toBe(false)
    expect(row.unread).toBe(true)
    expect(setup().project(row, [row]).unread).toBe(true)
  })
})
