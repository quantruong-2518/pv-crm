#!/usr/bin/env node
/** Lint debt report — reads `eslint-suppressions.json` into something a human can read.
 *
 *  The suppressions file exists so a rule can stay at `error` while CI stays
 *  green today. But debt nobody counts becomes debt forever. Run
 *  `pnpm lint:debt` to see how much is left, where, and which file is worth
 *  cleaning up first. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

let data
try {
  data = JSON.parse(readFileSync(join(ROOT, 'eslint-suppressions.json'), 'utf8'))
} catch {
  console.log('✓ No eslint-suppressions.json — the repo has zero lint debt.')
  process.exit(0)
}

const byRule = new Map()
const byFile = []

for (const [file, rules] of Object.entries(data)) {
  let fileTotal = 0
  for (const [rule, { count }] of Object.entries(rules)) {
    byRule.set(rule, (byRule.get(rule) ?? 0) + count)
    fileTotal += count
  }
  byFile.push([file, fileTotal])
}

const total = [...byRule.values()].reduce((a, b) => a + b, 0)

console.log(`Lint debt: ${total} violations across ${byFile.length} files\n`)

console.log('By rule:')
for (const [rule, n] of [...byRule].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${rule}`)
}

console.log('\nTen files with the most debt:')
for (const [file, n] of byFile.sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(n).padStart(4)}  ${file}`)
}

console.log(
  '\nOnce a file is clean, run `pnpm lint:prune` to remove it from the list.\n' +
    'The rule stays `error`: a new violation anywhere goes red in CI.',
)
