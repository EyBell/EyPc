import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { UTOOLS_PRELOAD_ASSETS, UTOOLS_PRELOAD_MODULE_ASSETS } from './utools-preload-assets.mjs'

/**
 * Validates canonical/public preload pairs **as committed**.
 *
 * `validate-utools-runtime.mjs` already proves the working tree is mirrored, and
 * that check passes even when the committed state is broken: a batch commit that
 * takes the canonical file without its mirror leaves HEAD inconsistent while the
 * tree stays green. The host loads the mirror, so that state ships the wrong
 * preload with every automated gate reporting success. This closes that gap.
 *
 * Untracked-on-both-sides is a new module that has not landed yet and is fine.
 * One side tracked without the other is not.
 */

const root = resolve(import.meta.dirname, '..')
const pairs = [...UTOOLS_PRELOAD_ASSETS, ...UTOOLS_PRELOAD_MODULE_ASSETS]

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'] })
}

function insideRepository() {
  try {
    return git(['rev-parse', '--is-inside-work-tree']).toString('utf8').trim() === 'true'
  } catch {
    return false
  }
}

function committedBytes(path) {
  try {
    return git(['show', `HEAD:${path}`])
  } catch {
    return null
  }
}

if (!insideRepository()) {
  process.stdout.write('committed preload mirrors: not a git repository, skipped\n')
  process.exit(0)
}

const errors = []
let compared = 0
let pending = 0

for (const asset of pairs) {
  const canonical = committedBytes(asset.canonical)
  const mirror = committedBytes(asset.public)
  if (!canonical && !mirror) {
    pending += 1
    continue
  }
  if (!canonical) {
    errors.push(`${asset.public} is committed without its canonical ${asset.canonical}`)
    continue
  }
  if (!mirror) {
    errors.push(`${asset.canonical} is committed without its mirror ${asset.public}`)
    continue
  }
  compared += 1
  if (!canonical.equals(mirror)) {
    errors.push(`${asset.public} does not match ${asset.canonical} in HEAD — the host would load the stale side`)
  }
}

process.stdout.write(`committed preload mirrors: ${compared} pairs verified`
  + (pending ? `, ${pending} not yet committed` : '') + '\n')

if (errors.length) {
  for (const error of errors) process.stderr.write(`error: ${error}\n`)
  process.stderr.write('committed preload mirror validation failed\n')
  process.exit(1)
}

process.stdout.write('committed preload mirror validation passed\n')
