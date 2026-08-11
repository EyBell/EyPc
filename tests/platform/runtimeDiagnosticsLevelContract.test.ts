import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const files = [
  'preload/diagnostics.cjs',
  'preload/index.js',
  'preload/companion/navigation.cjs',
  'preload/companion/task-actions.cjs',
  'preload/companion/task-kernel.cjs',
  'src/runtime/appRuntime.ts'
]

function missingExplicitLevels(file: string): string[] {
  const path = resolve(process.cwd(), file)
  const source = readFileSync(path, 'utf8')
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
  )
  const failures: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression
      const isRecordCall = ts.isPropertyAccessExpression(expression) && expression.name.text === 'record'
        || file.includes('/companion/') && ts.isIdentifier(expression) && expression.text === 'record'
        || file === 'preload/diagnostics.cjs' && ts.isIdentifier(expression) && expression.text === 'record'
      if (isRecordCall) {
        const input = node.arguments[0]
        const hasLevel = Boolean(input && ts.isObjectLiteralExpression(input) && input.properties.some((property) =>
          (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
          && property.name.getText(sourceFile).replace(/['"]/g, '') === 'level'
        ))
        if (!hasLevel) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          failures.push(`${file}:${position.line + 1}`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return failures
}

describe('runtime diagnostics explicit level contract', () => {
  it('requires every production diagnostics call to declare a level', () => {
    expect(files.flatMap(missingExplicitLevels)).toEqual([])
  })
})
