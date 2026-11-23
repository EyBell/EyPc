import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Baseline changes require the change reason and verification in the existing
// codex-unread-linkage task card and architecture owner, reviewed with the diff.
export function checkCodexUnreadRoute(root = resolve(fileURLToPath(new URL('..', import.meta.url)))) {
  const owner = readFileSync(resolve(root, 'preload/codex/desktop-unread-evidence.cjs'))
  const expected = '147b4773cc50a77831940654b62c66a84861bc87d16f60cb1b84512229d6f4fb'
  if (createHash('sha256').update(owner).digest('hex') !== expected) {
    throw new Error('Codex 未读通路基线改变：须审查原因、更新架构与验证记录后显式更新基线')
  }
  if (!owner.equals(readFileSync(resolve(root, 'public/codex/desktop-unread-evidence.cjs')))) throw new Error('Codex 未读 owner 镜像不一致')
  for (const name of ['preload/index.js', 'public/preload.js']) {
    const entry = readFileSync(resolve(root, name), 'utf8')
    for (const hook of ['createCodexDesktopUnreadRecovery?.(', 'this.unreadRecovery?.snapshotAllowed(',
      'completedInstance: codexDesktopCompletedInstance',
      'this.unreadRecovery?.snapshotAccepted(', 'this.unreadRecovery?.notificationAccepted(',
      'this.unreadRecovery?.bindingChanged(', 'this.unreadRecovery?.persistenceFailed(', 'this.unreadRecovery?.clear(this)',
      "this.unreadRecovery?.clear(this, process.platform === 'win32')"]) {
      if (!entry.includes(hook)) throw new Error(`${name}: Codex 未读通路缺少 ${hook}`)
    }
  }
  process.stdout.write('Codex 未读通路静态基线检查通过\n')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) checkCodexUnreadRoute()
