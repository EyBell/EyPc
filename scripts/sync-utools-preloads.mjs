import { resolve } from 'node:path'
import { syncUtoolsPreloads } from './utools-preload-assets.mjs'

const root = resolve(import.meta.dirname, '..')

syncUtoolsPreloads(root, 'public')
console.log('uTools preload mirrors synchronized from canonical sources')
