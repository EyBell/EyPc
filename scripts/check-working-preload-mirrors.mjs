import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { UTOOLS_PRELOAD_ASSETS, UTOOLS_PRELOAD_MODULE_ASSETS } from './utools-preload-assets.mjs'

const root = resolve(import.meta.dirname, '..')
const pairs = [...UTOOLS_PRELOAD_ASSETS, ...UTOOLS_PRELOAD_MODULE_ASSETS]
assert(pairs.length > 0, 'preload mirror inventory must not be empty')
for (const pair of pairs) {
  assert(readFileSync(resolve(root, pair.canonical)).equals(readFileSync(resolve(root, pair.public))), `${pair.public} must match ${pair.canonical}`)
}
console.log(`Working preload mirrors passed: ${pairs.length} pairs`)
