#!/usr/bin/env node
/** Guards Tailwind's scan scope.
 *
 *  Tailwind v4 auto-detects sources from Vite's root directory. In a
 *  monorepo, it does NOT see workspace packages — so any class used only
 *  inside @pv/ui silently vanishes from the build. No error, no warning,
 *  just a broken screen.
 *
 *  This is the worst kind of bug: build green, test green, typecheck green.
 *  This script reads every arbitrary-value class in the source, then checks
 *  whether it actually made it into the generated CSS.
 *
 *  Run AFTER `pnpm build`. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DIST = join(ROOT, 'apps/web/dist/assets')
const SOURCES = [join(ROOT, 'packages/ui/src'), join(ROOT, 'apps/web/src')]

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []
  })

let css = ''
try {
  for (const f of readdirSync(DIST).filter((n) => n.endsWith('.css'))) {
    css += readFileSync(join(DIST, f), 'utf8')
  }
} catch {
  console.error('✗ No built CSS found. Run `pnpm build` first.')
  process.exit(1)
}

if (!css) {
  console.error('✗ The dist directory has no CSS file.')
  process.exit(1)
}

// Classes shaped like `h-[150px]`, `size-[38px]`, `bg-[linear-gradient(...)]`.
// Only takes the px/rem-unit kind — they're guaranteed to appear verbatim in
// the generated CSS, so they can be checked without simulating how Tailwind escapes.
const ARBITRARY = /\b[a-z][a-z0-9-]*-\[(-?[0-9.]+(?:px|rem))\]/g

const wanted = new Map()
for (const dir of SOURCES) {
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(ARBITRARY)) {
      if (!wanted.has(m[0])) wanted.set(m[0], relative(ROOT, file))
    }
  }
}

const missing = [...wanted].filter(([cls]) => {
  const value = cls.slice(cls.indexOf('[') + 1, -1)
  return !css.includes(value)
})

console.log(`Arbitrary-value classes in source : ${wanted.size}`)
console.log(`Present in built CSS               : ${wanted.size - missing.length}`)

if (missing.length > 0) {
  console.error(`\n✗ ${missing.length} classes did not generate CSS:\n`)
  for (const [cls, file] of missing.slice(0, 25)) console.error(`  · ${cls}  (${file})`)
  if (missing.length > 25) console.error(`  … and ${missing.length - 25} more classes`)
  console.error(
    '\nAlmost certainly a missing @source line in apps/web/src/styles/app.css.\n' +
      'Every workspace source directory must be declared there.\n',
  )
  process.exit(1)
}

console.log('\n✓ Every arbitrary-value class is present in the built CSS.')
