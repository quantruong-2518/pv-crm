#!/usr/bin/env node
/** i18n coverage report for apps/web/src: `pnpm i18n:check [dir] [--json] [--summary]`.
 *
 *  Reports (a) Vietnamese text outside any message() call and (b) message()
 *  calls whose en or ko is still ''. Exit 1 when either exists, 0 when clean.
 *  `// i18n-ignore` on the line exempts a non-display Vietnamese string. */
import { relative, resolve } from 'node:path'
import { ROOT, WEB_SRC, listFiles, readScan } from './i18n-scan.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const dirArg = args.find((a) => !a.startsWith('--'))
const dir = dirArg ? resolve(dirArg) : WEB_SRC

const hardcoded = []
const empty = []
for (const file of listFiles(dir)) {
  const rel = relative(ROOT, file)
  const scan = readScan(file)
  for (const h of scan.hardcoded) hardcoded.push({ file: rel, ...h })
  for (const c of scan.calls) {
    const missing = ['en', 'ko'].filter((l) => c[l])
    empty.push({ file: rel, line: c.line, text: c.vi.text.slice(0, 70), missing })
  }
}
const total = hardcoded.length + empty.length

function summarize() {
  const by = new Map()
  const base = relative(dir, ROOT) === '' ? '' : `${relative(ROOT, dir)}/`
  const top = (f) => f.slice(base.length).split('/').slice(0, -1)[0] ?? '.'
  const bump = (f, key) => {
    const row = by.get(top(f)) ?? { hardcoded: 0, empty: 0 }
    row[key]++
    by.set(top(f), row)
  }
  for (const h of hardcoded) bump(h.file, 'hardcoded')
  for (const e of empty) bump(e.file, 'empty')
  return [...by.entries()]
    .map(([area, r]) => ({ area, ...r, total: r.hardcoded + r.empty }))
    .sort((a, b) => b.total - a.total)
}

const totals = { hardcoded: hardcoded.length, emptyTranslations: empty.length, total }

if (flag('--json')) {
  const body = flag('--summary')
    ? { totals, byArea: summarize() }
    : { totals, hardcoded, emptyTranslations: empty }
  console.log(JSON.stringify(body, null, 2))
} else if (flag('--summary')) {
  for (const r of summarize())
    console.log(
      `${r.area.padEnd(14)} ${String(r.hardcoded).padStart(6)} hardcoded ${String(r.empty).padStart(6)} empty`,
    )
  console.log(`TOTAL: ${totals.hardcoded} hardcoded, ${totals.emptyTranslations} empty en/ko`)
} else {
  const group = (rows, title, show) => {
    if (!rows.length) return
    console.log(`\n== ${title} ==`)
    let current = ''
    for (const r of rows) {
      if (r.file !== current) console.log(`\n${(current = r.file)}`)
      console.log(`  ${r.line}: ${show(r)}`)
    }
  }
  group(hardcoded, 'Vietnamese outside message()', (r) => r.text)
  group(empty, 'message() with empty en/ko', (r) => `[${r.missing.join('+')}] ${r.text}`)
  console.log(`\nTOTAL: ${totals.hardcoded} hardcoded, ${totals.emptyTranslations} empty en/ko`)
}

process.exit(total > 0 ? 1 : 0)
