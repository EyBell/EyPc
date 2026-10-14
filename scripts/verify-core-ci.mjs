import fs from 'node:fs'
import { main } from './verify-core-changes.mjs'

// Event values become argv data, never interpolated shell commands.
const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
const base = process.env.GITHUB_EVENT_NAME === 'pull_request' ? event.pull_request?.base?.sha : event.before
const args = base && /^[a-f0-9]{40}$/.test(base) && !/^0+$/.test(base) ? ['--base', base] : ['--all']
await main(args)
