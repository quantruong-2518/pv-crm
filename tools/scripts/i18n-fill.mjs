#!/usr/bin/env node
/** Fills empty en/ko in `message(vi, '', '')` calls: `pnpm i18n:fill [dir] [--dry]`.
 *
 *  Vietnamese is the source; Haiku translates the missing languages in batches
 *  and each empty literal is replaced in place (prettier runs afterwards).
 *  A translation whose placeholders differ from the vi text is skipped and listed.
 *
 *  Exit codes: 0 nothing changed · 10 files rewritten · 3 no API key · 1 failure.
 *  The key comes from process.env or that single line of apps/api/.env; the rest
 *  of .env is never read into the environment. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'
import { ROOT, WEB_SRC, listFiles, readScan } from './i18n-scan.mjs'

const MODEL = 'claude-haiku-5-5'
const BATCH = 40
const PARALLEL = 3
const PLACEHOLDER = /\$\{[^}]*\}|\{\{[^}]*\}\}|\{[\w.]+\}|%[sd]/g

const SYSTEM = `You translate UI copy for a B2B CRM (sales pipeline, contracts, campaigns) from Vietnamese.
Write concise, native-quality English and Korean, as a product designer at a native company would.
Korean: polite register, 합쇼체/해요체 kept consistent, no casual endings.
Terms: lead = lead, cơ hội = opportunity / 기회, hợp đồng = contract / 계약, chiến dịch = campaign / 캠페인.
Keep placeholders such as {name}, \${x}, %s, and all punctuation and ellipsis exactly as in the source.
Some items are fragments of a sentence; translate the fragment, do not complete it.
Add no explanation. Reply with JSON only: {"<id>": {"en": "...", "ko": "..."}, ...} covering every id.`

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const dirArg = args.find((a) => !a.startsWith('--'))
const dir = dirArg ? resolve(dirArg) : WEB_SRC

/** Fragments rely on edge spaces, so the vi text's edge whitespace wins over the model's. */
const edgeOf = (vi, out) => vi.match(/^\s*/)[0] + out.trim() + vi.match(/\s*$/)[0]

function readKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  const envFile = join(ROOT, 'apps/api/.env')
  if (!existsSync(envFile)) return ''
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*(.*)$/)
    if (m)
      return m[1]
        .replace(/\s+#.*$/, '')
        .trim()
        .replace(/^(['"])(.*)\1$/, '$2')
  }
  return ''
}

const placeholders = (s) => (s.match(PLACEHOLDER) ?? []).sort().join('\u0000')

function literal(text, quote, live) {
  const useTick = live && text.includes('${')
  const q = useTick ? '`' : quote
  let body = text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
  if (q === '`') body = body.replace(/`/g, '\\`')
  else body = body.split(q).join(`\\${q}`)
  return `${q}${body}${q}`
}

function collect() {
  const jobs = []
  for (const file of listFiles(dir)) {
    const { calls } = readScan(file)
    if (calls.length) jobs.push({ file, calls })
  }
  return jobs
}

async function translate(client, texts) {
  const payload = Object.fromEntries(texts.map((t, i) => [i, t]))
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
  })
  const raw = res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  return JSON.parse(json)
}

async function runBatches(client, unique) {
  const answers = new Map()
  const batches = []
  for (let i = 0; i < unique.length; i += BATCH) batches.push(unique.slice(i, i + BATCH))
  let next = 0
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++]
      try {
        const out = await translate(client, batch)
        batch.forEach((vi, i) => answers.set(vi, out[i]))
      } catch (err) {
        console.error(`Lô dịch thất bại (${batch.length} câu): ${err.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  return answers
}

function rewrite(file, calls, answers, skipped) {
  const text = readFileSync(file, 'utf8')
  const edits = []
  for (const c of calls) {
    const ans = answers.get(c.vi.text)
    for (const lang of ['en', 'ko']) {
      if (!c[lang]) continue
      const out = typeof ans?.[lang] === 'string' ? edgeOf(c.vi.text, ans[lang]) : ''
      if (out.trim() === '' || placeholders(out) !== placeholders(c.vi.text)) {
        skipped.push(`${relative(ROOT, file)}:${c.line} [${lang}] ${c.vi.text.slice(0, 60)}`)
        continue
      }
      const { start, end } = c[lang]
      edits.push({ start, end, text: literal(out, text[start], c.vi.template) })
    }
  }
  let next = text
  for (const e of edits.sort((a, b) => b.start - a.start))
    next = next.slice(0, e.start) + e.text + next.slice(e.end)
  if (edits.length) writeFileSync(file, next)
  return edits.length
}

const jobs = collect()
const total = jobs.reduce((n, j) => n + j.calls.length, 0)
if (total === 0) {
  console.log('i18n:fill — không có message() nào còn trống en/ko.')
  process.exit(0)
}
if (dry) {
  for (const j of jobs) {
    console.log(relative(ROOT, j.file))
    for (const c of j.calls)
      console.log(
        `  ${c.line}: [${['en', 'ko'].filter((l) => c[l]).join('+')}] ${c.vi.text.slice(0, 70)}`,
      )
  }
  console.log(`\n${total} message() còn trống en/ko trong ${jobs.length} file.`)
  process.exit(0)
}

const key = readKey()
if (!key) {
  console.error(
    'Chưa có ANTHROPIC_API_KEY (biến môi trường hoặc apps/api/.env) nên không dịch được.',
  )
  process.exit(3)
}

const require = createRequire(join(ROOT, 'apps/api/package.json'))
const { default: Anthropic } = await import(require.resolve('@anthropic-ai/sdk'))
const client = new Anthropic({ apiKey: key, maxRetries: 2 })
const unique = [...new Set(jobs.flatMap((j) => j.calls.map((c) => c.vi.text)))]
console.log(`Dịch ${unique.length} câu khác nhau (${total} chỗ) bằng ${MODEL}…`)
const answers = await runBatches(client, unique)

const skipped = []
const changed = []
for (const j of jobs) if (rewrite(j.file, j.calls, answers, skipped) > 0) changed.push(j.file)

if (changed.length) {
  const bin = join(ROOT, 'node_modules/.bin/prettier')
  const r = spawnSync(bin, ['--write', ...changed], { cwd: ROOT, stdio: 'ignore' })
  if (r.status !== 0) console.error('prettier không format được một số file — chạy `pnpm format`.')
  for (const f of changed) console.log(`đã điền: ${relative(ROOT, f)}`)
}
if (skipped.length) {
  console.error(`\nBỏ qua ${skipped.length} chỗ (thiếu bản dịch hoặc lệch placeholder):`)
  for (const s of skipped) console.error(`  ${s}`)
}
process.exit(changed.length ? 10 : skipped.length ? 1 : 0)
