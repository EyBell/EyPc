import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { buildUtoolsRuntimeIdentity } from './utools-runtime-identity.mjs'

const root = resolve(import.meta.dirname, '..')
const actual = createRequire(import.meta.url)(resolve(root, 'public/runtime-identity.cjs'))
const expected = buildUtoolsRuntimeIdentity(root)
for (const [key, value] of Object.entries(expected)) {
  assert.equal(actual[key], value, `runtime identity ${key} is stale; rebuild the affected artifact before accepting this change`)
}
console.log(`Runtime identity passed: ${Object.keys(expected).length} fields`)
