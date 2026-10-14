import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
try {
  const output = execFileSync(process.execPath, ['node_modules/vue-tsc/bin/vue-tsc.js', '--noEmit', '--listFiles'],
    { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 })
  const files = output.split(/\r?\n/).filter(file => [resolve(root, 'src'), resolve(root, 'tests')].some(prefix => file.startsWith(`${prefix}/`)))
  if (!files.length) throw new Error('typecheck returned no repository source files')
  console.log(`Core typecheck passed: ${files.length} source files`)
} catch (error) {
  process.stderr.write(String(error.stdout || error.message).slice(-12000))
  process.exitCode = 1
}
