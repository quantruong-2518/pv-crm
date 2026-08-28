/* global console, process, URL */
/* Dọn hai dòng bản thử lọt vào Neon: LD-0232, LD-0233.
 *
 * Chạy KHÔNG tham số  → chỉ soi và ghi bản sao ra /tmp, không đụng dữ liệu.
 * Chạy với `--apply`  → xoá thật, trong MỘT transaction.
 *
 * `sales.lead.code` VỪA là khoá chính VỪA trỏ vào `platform.object.code` —
 * không có cột `object_code` riêng, nên mã lead cũng là mã object.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'

const CODES = ['LD-0232', 'LD-0233']
const APPLY = process.argv.includes('--apply')

const url = readFileSync(new URL('.env', import.meta.url), 'utf8')
  .split('\n')
  .find((l) => l.startsWith('DATABASE_URL='))
  ?.slice('DATABASE_URL='.length)
  .trim()

if (!url?.startsWith('postgres')) throw new Error(`DATABASE_URL không phải Postgres: ${url}`)

const client = new pg.Client({ connectionString: url })
await client.connect()

const q = async (label, sql) => {
  const r = await client.query(sql, [CODES])
  console.log(`  ${String(r.rows.length).padStart(3)}  ${label}`)
  return r.rows
}

console.log('--- những gì đang dính tới hai mã này ---')
const leads = await q('sales.lead', 'select * from sales.lead where code = any($1)')
const objects = await q('platform.object', 'select * from platform.object where code = any($1)')
const intakes = await q(
  'sales.lead_intake',
  'select * from sales.lead_intake where lead_code = any($1)',
)
const opps = await q(
  'sales.opportunity',
  'select * from sales.opportunity where lead_code = any($1)',
)
const edges = await q(
  'platform.edge',
  'select * from platform.edge where from_code = any($1) or to_code = any($1)',
)
const audits = await q('platform.audit', 'select * from platform.audit where code = any($1)')

writeFileSync(
  '/tmp/pv-smoke-backup.json',
  JSON.stringify({ takenFor: CODES, leads, objects, intakes, opps, edges, audits }, null, 2),
)
console.log('\nbản sao đã ghi: /tmp/pv-smoke-backup.json')
for (const l of leads) console.log(`  ${l.code}  ${l.company}  ·  ${l.contact_name ?? '—'}`)

const count = async () =>
  (await client.query('select count(*)::int as n from sales.lead')).rows[0].n
console.log(`\nsales.lead trước: ${await count()}`)

if (!APPLY) {
  console.log('\nCHƯA XOÁ GÌ — chạy lại với --apply để xoá thật.')
  await client.end()
  process.exit(0)
}

try {
  await client.query('begin')
  const del = async (label, sql) => {
    const r = await client.query(sql, [CODES])
    console.log(`  xoá ${String(r.rowCount).padStart(3)}  ${label}`)
  }
  await del('sales.opportunity', 'delete from sales.opportunity where lead_code = any($1)')
  await del('sales.lead_intake', 'delete from sales.lead_intake where lead_code = any($1)')
  await del('sales.lead', 'delete from sales.lead where code = any($1)')
  await del(
    'platform.edge',
    'delete from platform.edge where from_code = any($1) or to_code = any($1)',
  )
  await del('platform.audit', 'delete from platform.audit where code = any($1)')
  await del('platform.object', 'delete from platform.object where code = any($1)')
  await client.query('commit')
  console.log('\ncommit xong.')
} catch (e) {
  await client.query('rollback')
  console.error('\nĐÃ ROLLBACK — không dòng nào bị xoá:', e.message)
  await client.end()
  process.exit(1)
}

const left = await client.query('select code from sales.lead where code = any($1)', [CODES])
console.log(`sales.lead sau: ${await count()}  ·  còn sót: ${left.rows.length}`)
await client.end()
