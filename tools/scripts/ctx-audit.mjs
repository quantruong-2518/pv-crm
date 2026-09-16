#!/usr/bin/env node
/** ctx-audit — proves the AI instruction layer still matches the repo.
 *
 *  Prose that DESCRIBES the repo rots; a command that COMPUTES it cannot. Every
 *  check below exists because that exact drift was found by hand on 15/09:
 *  a doc naming a deleted test, a routing table saying "four agents" over twelve,
 *  a tree map missing apps/api, an enabled plugin that was never installed.
 *
 *  `--strict` (what `pnpm check` runs) fails on checks 1-4 — broken references,
 *  all fixable now. Checks 5-6 warn: they are ratchets, not gates. */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const strict = process.argv.includes('--strict')
const errors = []
const warnings = []
const fail = (check, msg) => {
  const line = `${check} · ${msg}`
  if (!errors.includes(line)) errors.push(line)
}
const warn = (check, msg) => warnings.push(`${check} · ${msg}`)

const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const walk = (dir, out = []) => {
  if (!existsSync(join(ROOT, dir))) return out
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

// Every markdown an agent reads to decide something — the files allowed to rot.
// docs/ belongs here: an ADR naming a file that no longer exists is a dead end
// exactly like a skill naming one, and until 16/09 nothing checked them at all.
const INSTRUCTION_FILES = [
  'CLAUDE.md',
  ...walk('.claude').filter((p) => p.endsWith('.md')),
  ...walk('docs').filter((p) => p.endsWith('.md')),
  ...['apps', 'packages']
    .flatMap((d) => readdirSync(join(ROOT, d)).map((n) => `${d}/${n}/CLAUDE.md`))
    .filter((p) => existsSync(join(ROOT, p))),
]

// ---------------------------------------------------------------- 1 · paths
// A path inside backticks must exist. Globs, placeholders and package
// specifiers are prose, not paths — they are skipped rather than guessed at.
const PATH_RE = /`([^`\s]+\.[a-z]{2,4}|(?:apps|packages|docs|tools|\.claude)\/[^`\s]*)`/g
const skipPath = (p) =>
  /[*<>{}$:]|\.\.\./.test(p) ||
  p.startsWith('@') ||
  p.startsWith('http') ||
  !/^(apps|packages|docs|tools|\.claude)\//.test(p)

// A line carrying <!--ctx:ignore--> is quoting a path on purpose: a wrong one
// being described, or a file that was deleted and is named as history.
for (const file of INSTRUCTION_FILES) {
  for (const text of read(file).split('\n')) {
    if (text.includes('<!--ctx:ignore-->') || text.trim().startsWith('Source:')) continue
    for (const [, raw] of text.matchAll(PATH_RE)) {
      const p = raw.replace(/\/$/, '')
      if (skipPath(p)) continue
      if (!existsSync(join(ROOT, p))) fail('1·path', `${file} names ${p} — it does not exist`)
    }
  }
}

// -------------------------------------------------------------- 2 · scripts
const scripts = Object.keys(JSON.parse(read('package.json')).scripts)
const apiScripts = existsSync(join(ROOT, 'apps/api/package.json'))
  ? Object.keys(JSON.parse(read('apps/api/package.json')).scripts ?? {})
  : []
for (const file of INSTRUCTION_FILES) {
  for (const [, name] of read(file).matchAll(/pnpm ([a-z][a-z0-9:]*)/g)) {
    if (['install', 'dlx', 'exec', 'run', 'add', 'why'].includes(name)) continue
    if (!scripts.includes(name) && !apiScripts.includes(name))
      fail('2·script', `${file} calls "pnpm ${name}" — no such script in package.json`)
  }
}

// --------------------------------------------------------------- 3 · agents
const agents = existsSync(join(ROOT, '.claude/agents'))
  ? readdirSync(join(ROOT, '.claude/agents'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
  : []
// Only names SHAPED like an agent are checked, so ordinary hyphenated prose in
// backticks never trips this.
const AGENT_SHAPE = /-(builder|reviewer|keeper|tracer|locator|drafter|guardian|runner|writer)$/
for (const file of INSTRUCTION_FILES) {
  for (const [, name] of read(file).matchAll(/`([a-z][a-z-]+)`/g)) {
    if (!AGENT_SHAPE.test(name)) continue
    if (!agents.includes(name))
      fail('3·agent', `${file} names agent "${name}" — no such file in .claude/agents`)
  }
}

// ------------------------------------------------------------------ 4 · map
// The always-loaded map must name every workspace that exists, or a session
// starts with a false picture of the repo.
const rootMd = read('CLAUDE.md')
for (const d of ['apps', 'packages']) {
  for (const name of readdirSync(join(ROOT, d))) {
    if (!statSync(join(ROOT, d, name)).isDirectory()) continue
    if (!rootMd.includes(`${d}/${name}`))
      fail('4·map', `CLAUDE.md never mentions ${d}/${name} — the map is missing a workspace`)
  }
}

// -------------------------------------------------------------- 5 · plugins
const settingsPath = '.claude/settings.json'
if (existsSync(join(ROOT, settingsPath))) {
  const enabled = Object.entries(JSON.parse(read(settingsPath)).enabledPlugins ?? {})
    .filter(([, on]) => on)
    .map(([k]) => k)
  const home = process.env.HOME ?? ''
  for (const spec of enabled) {
    const [, marketplace] = spec.split('@')
    const installed =
      home &&
      ['plugins/marketplaces', 'plugins/repos', 'plugins/cache'].some((d) =>
        existsSync(join(home, '.claude', d, marketplace)),
      )
    if (!installed)
      warn('5·plugin', `${spec} is enabled but marketplace "${marketplace}" is not installed`)
  }
}

// -------------------------------------------------------- 6 · comment budget
// Budget = the ratio measured the day the ratchet was set, plus one point. It
// can only be lowered. Growth is what this catches; the target is the goal.
const ZONES = [
  ['packages/contracts/src', 61, 30],
  ['apps/api/src', 41, 30],
  ['apps/web/src/data', 40, 25],
  ['packages/engines/src', 32, 25],
  ['packages/ui/src', 19, 20],
  ['apps/web/src/pages', 15, 15],
]
const rows = []
for (const [zone, budget, target] of ZONES) {
  const files = walk(zone).filter((p) => /\.tsx?$/.test(p))
  let total = 0
  let comment = 0
  for (const f of files) {
    for (const line of read(f).split('\n')) {
      total++
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) comment++
    }
  }
  const pct = total ? Math.round((comment / total) * 100) : 0
  rows.push([zone, pct, budget, target])
  if (pct > budget) warn('6·comment', `${zone} is ${pct}% comment, over its ${budget}% ratchet`)
}

// ------------------------------------------------------- 7 · docs structure
// The convention switches itself on the day docs/index.md lands, so it never
// fails a tree that has not been migrated yet. Filenames are English kebab-case
// because a path travels: into a comment, a URL, a git log, a foreign keyboard.
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*(\.md)?$/
const docsMigrated = existsSync(join(ROOT, 'docs/index.md'))
const note = docsMigrated ? fail : warn
if (existsSync(join(ROOT, 'docs'))) {
  const entries = readdirSync(join(ROOT, 'docs'), { withFileTypes: true })
  const ROOT_ALLOWED = new Set(['index.md', 'status.md'])

  for (const e of entries) {
    if (!NAME_RE.test(e.name)) note('7·docs', `docs/${e.name} — name is not english kebab-case`)
    if (!e.isDirectory() && !ROOT_ALLOWED.has(e.name))
      note(
        '7·docs',
        `docs/${e.name} sits outside a module folder — only index.md and status.md may`,
      )
  }

  for (const dir of entries.filter((e) => e.isDirectory())) {
    const indexPath = `docs/${dir.name}/index.md`
    if (!existsSync(join(ROOT, indexPath))) {
      note('7·docs', `${indexPath} is missing — every module folder carries its own map`)
      continue
    }
    const index = read(indexPath)
    for (const f of readdirSync(join(ROOT, 'docs', dir.name))) {
      if (!NAME_RE.test(f)) note('7·docs', `docs/${dir.name}/${f} — name is not english kebab-case`)
      if (f === 'index.md') continue
      if (!index.includes(f))
        note('7·docs', `docs/${dir.name}/${f} is in no index — an orphan nobody can find`)
    }
  }
}

// --------------------------------------------- 8 · docs paths cited in code
// A comment pointing at a deleted document is a dead end a reader only finds by
// following it. Warning, not error, while the English-comment migration is in
// flight: those same comments are being rewritten, and the pointer is repaired
// in that pass rather than in a separate one.
const CODE_DOC_RE = /docs\/[a-z0-9/-]+\.md/g
const codeDirs = ['apps', 'packages', 'tools']
const dangling = new Map()
for (const dir of codeDirs) {
  for (const f of walk(dir).filter((p) => /\.tsx?$/.test(p))) {
    for (const [p] of read(f).matchAll(CODE_DOC_RE)) {
      if (existsSync(join(ROOT, p))) continue
      dangling.set(p, (dangling.get(p) ?? 0) + 1)
    }
  }
}
for (const [p, n] of [...dangling].sort((a, b) => b[1] - a[1]))
  warn('8·code', `${n} comment${n > 1 ? 's' : ''} cite${n > 1 ? '' : 's'} ${p} — that file is gone`)

// ------------------------------------- 9 · bare .md names, no docs/ prefix
// A pointer written `fix-later.md §6` instead of `docs/fix-later.md` is just as
// dead and twice as hard to see: checks 1 and 8 both key on the prefix. Resolve
// by BASENAME against every markdown that actually exists, so nothing has to be
// hardcoded and the check cannot rot with the file list.
const knownMd = new Set()
for (const dir of ['docs', '.claude', 'apps', 'packages', 'tools']) {
  for (const f of walk(dir).filter((p) => p.endsWith('.md'))) knownMd.add(f.split('/').pop())
}
for (const f of readdirSync(ROOT)) if (f.endsWith('.md')) knownMd.add(f)

const BARE_MD_RE = /(?<![\w/\-.])([a-z0-9]+(?:-[a-z0-9]+)+\.md)(?![\w/])/g
const bare = new Map()
const scanBare = (file, text, label) => {
  for (const [, name] of text.matchAll(BARE_MD_RE)) {
    if (knownMd.has(name)) continue
    const key = `${name}|${label}`
    bare.set(key, (bare.get(key) ?? 0) + 1)
  }
}
for (const file of INSTRUCTION_FILES) {
  for (const line of read(file).split('\n')) {
    if (line.includes('<!--ctx:ignore-->') || line.trim().startsWith('Source:')) continue
    scanBare(file, line, 'docs')
  }
}
for (const dir of codeDirs)
  for (const f of walk(dir).filter((p) => /\.tsx?$/.test(p))) scanBare(f, read(f), 'code')

for (const [key, n] of [...bare].sort((a, b) => b[1] - a[1])) {
  const [name, label] = key.split('|')
  warn(
    '9·bare',
    `${n} ${label} reference${n > 1 ? 's' : ''} name "${name}" with no docs/ prefix — no such file`,
  )
}

// ----------------------------------------------------------------- report
console.log('\nContext cost\n')
console.log('  zone                       now  ratchet  target')
for (const [zone, pct, budget, target] of rows)
  console.log(
    `  ${zone.padEnd(26)} ${String(pct + '%').padStart(4)}  ${String(budget + '%').padStart(7)}  ${String(target + '%').padStart(6)}`,
  )
const bytes = (dir) =>
  walk(dir)
    .filter((p) => p.endsWith('.md'))
    .reduce((n, p) => n + Buffer.byteLength(read(p), 'utf8'), 0)
console.log(
  `\n  CLAUDE.md always-loaded    ${read('CLAUDE.md').split('\n').length} lines · ${Math.round(Buffer.byteLength(read('CLAUDE.md'), 'utf8') / 1024)} KB`,
)
console.log(`  docs/                      ${Math.round(bytes('docs') / 1024)} KB`)
console.log(`  .claude/ instructions      ${Math.round(bytes('.claude') / 1024)} KB`)
console.log(`  agents                     ${agents.length}`)

if (warnings.length) {
  console.log(`\nWarnings (${warnings.length})\n`)
  for (const w of warnings) console.log(`  ! ${w}`)
}
if (errors.length) {
  console.log(`\nBroken references (${errors.length})\n`)
  for (const e of errors) console.log(`  ✗ ${e}`)
  console.log('')
  if (strict) process.exit(1)
} else {
  console.log('\n  no broken references\n')
}
