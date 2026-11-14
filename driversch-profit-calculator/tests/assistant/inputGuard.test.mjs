import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Regression guard: these patterns caused the input bugs. They must not come back in source code.
const root = new URL('../../src/', import.meta.url).pathname
function sourceFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}
// Comments may explain the old bug, so they are removed before checking code.
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '')
const files = sourceFiles(root).map(path => ({ name: relative(root, path), text: stripComments(readFileSync(path, 'utf8')) }))

test('no browser number inputs (they reject Arabic digits)', () => {
  const offenders = files.filter(f => /<input[^>]*type=(["']number["']|\{['"]number['"]\})/s.test(f.text)).map(f => f.name)
  assert.deepEqual(offenders, [])
})

test('no raw parseFloat/parseInt in UI code (use the shared numeric utilities)', () => {
  const offenders = files.filter(f => /parseFloat\(|parseInt\(/.test(f.text)).map(f => f.name)
  assert.deepEqual(offenders, [])
})

test('no Arabic-only or English-only character restrictions in UI code', () => {
  const offenders = files
    .filter(f => /\[\\u0600-\\u06FF|\[ء-ي|\\p\{Script=Arab|\[a-zA-Z\]\+?\$?/.test(f.text) && !f.name.endsWith('numericInput.ts'))
    .map(f => f.name)
  assert.deepEqual(offenders, [])
})

test('every textarea declares a direction', () => {
  const offenders = []
  for (const f of files) {
    for (const match of f.text.matchAll(/<textarea[^>]*>/g)) {
      if (!/dir=/.test(match[0])) offenders.push(f.name)
    }
  }
  assert.deepEqual(offenders, [])
})
