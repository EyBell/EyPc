import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('search focus caret contract', () => {
  it('places the caret at the end when a search focus request is applied', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')

    expect(app).toContain('setSelectionRange(input.value.length, input.value.length)')
  })
})
