'use strict'

// Process-local presentation receipt, never an assertion about native focus.
const SHORTCUT_SOURCES = new Set(['global-shortcut', 'local-shortcut', 'attention-shortcut', 'task-cycle', 'manual-quick-jump'])
function fingerprint(task, members = [task]) {
  return JSON.stringify(members.map(member => [member.key, member.phase, member.unread === true,
    member.turnStartedAt || 0, member.lastQuestionAt || 0, member.terminalAt || 0,
    member.statusEnteredAt || 0, member.phaseRevision || 0]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
}
function createShortcutReadReceipts() {
  const receipts = new Map()
  const instances = new Map()
  let generation = 0
  return {
    capture(task, members, source) {
      if (!SHORTCUT_SOURCES.has(source) || task?.phase !== 'completed' || task.unread !== true) return null
      return { key: task.key, generation, instance: instances.get(task.key), fingerprint: fingerprint(task, members) }
    },
    accept(token, task, members, outcome) {
      if (!token || !['opened', 'dispatched'].includes(outcome) || token.generation !== generation
        || instances.get(token.key) !== token.instance
        || task?.key !== token.key || task.phase !== 'completed' || task.unread !== true
        || fingerprint(task, members) !== token.fingerprint) return false
      receipts.set(token.key, token.fingerprint)
      return true
    },
    project(task, members) {
      const receipt = receipts.get(task.key)
      if (!receipt) return task
      if (task.phase !== 'completed' || fingerprint(task, members) !== receipt) {
        receipts.delete(task.key)
        return task
      }
      return { ...task, unread: false, unreadKnown: true }
    },
    retain(keys) {
      for (const key of instances.keys()) if (!keys.has(key)) { instances.delete(key); receipts.delete(key) }
      for (const key of keys) if (!instances.has(key)) instances.set(key, {})
    },
    clear() { receipts.clear(); instances.clear(); generation++ }
  }
}
module.exports = { createShortcutReadReceipts, isShortcutSource: source => SHORTCUT_SOURCES.has(source) }
