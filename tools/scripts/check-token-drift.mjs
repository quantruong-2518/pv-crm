#!/usr/bin/env node
/** Guards the token layer.
 *
 *  Is there any `var(--x)` in code that points at a token that DOES NOT EXIST?
 *
 *  docs/luat-thiet-ke.md §2: "Missing a token? ASK, don't invent a new hex" —
 *  but inventing a *token name* is even worse than inventing a hex: CSS
 *  silently falls back to transparent, the build stays green, tests stay
 *  green, and nobody notices until the demo in front of the client.
 *
 *  An earlier version had a second half: cross-checking
 *  `packages/tokens/globals.css` against the design source
 *  `project/theme/globals.css`. That half was dropped on 18/08 when
 *  `project/` was deleted — now the whole repo has only ONE token file, with
 *  no second copy to drift from. Rebuilding the design source would restore
 *  that half.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TOKENS = join(ROOT, 'packages/tokens/globals.css')

const declared = new Set()
for (const m of readFileSync(TOKENS, 'utf8').matchAll(/^\s*(--[\w-]+)\s*:/gm)) {
  declared.add(m[1])
}

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    if (n === 'node_modules' || n === 'dist' || n === 'coverage') return []
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(p) ? [p] : []
  })

const referenced = new Map()
for (const file of [join(ROOT, 'packages'), join(ROOT, 'apps')].flatMap(walk)) {
  for (const m of readFileSync(file, 'utf8').matchAll(/var\(\s*(--[\w-]+)/g)) {
    if (!referenced.has(m[1])) referenced.set(m[1], relative(ROOT, file))
  }
}

const dangling = [...referenced].filter(([name]) => !declared.has(name))

console.log(`Tokens declared in packages/tokens/globals.css : ${declared.size}`)
console.log(`var(--*) references in code                    : ${referenced.size}`)

if (dangling.length > 0) {
  console.error(`\n✗ ${dangling.length} references point at a token that doesn't exist:\n`)
  for (const [name, file] of dangling) console.error(`  · var(${name})  used in ${file}`)
  console.error(
    '\nThe token layer is the one and only color file for the whole system.\n' +
      'Declare the token in packages/tokens/globals.css, or fix the name.\n' +
      "Don't invent a new hex.\n",
  )
  process.exit(1)
}

console.log('\n✓ No var(--*) points into nothing.')
