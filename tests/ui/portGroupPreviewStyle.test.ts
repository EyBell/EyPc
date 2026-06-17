import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('port group shift preview style', () => {
  it('does not expand every group row when Shift preview is active', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')

    expect(css).not.toContain('.shift-preview .group-row .group-actions')
    expect(css).toContain('.group-row.shift-preview-target .group-actions')
  })
})
