/* global console */
/* KIỂM KÊ READ-ONLY — không một câu ghi nào trong file này.
 *
 * Trả lời đúng một câu hỏi: trong Neon, dòng nào là demo nạp từ fixture DAS
 * Vina, dòng nào là dữ liệu thật gõ/nhập qua cửa. Chạy trước khi quyết có dọn
 * hay không:
 *
 *   node apps/api/census.mjs
 *
 * Xoá file này sau khi đọc xong — nó là dụng cụ một lần, không phải công cụ. */
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import pg from 'pg'

const url = readFileSync(new URL('.env', import.meta.url), 'utf8')
  .split('\n')
  .find((l) => l.startsWith('DATABASE_URL='))
  ?.slice('DATABASE_URL='.length)
  .trim()

if (!url?.startsWith('postgres')) throw new Error(`DATABASE_URL không phải Postgres: ${url}`)

const client = new pg.Client({ connectionString: url })
await client.connect()
console.log(`nối tới: ${new URL(url.replace(/^postgres(ql)?:/, 'http:')).host}\n`)

const show = async (label, sql) => {
  try {
    const r = await client.query(sql)
    console.log(`### ${label}`)
    if (r.rows.length === 0) console.log('    (trống)')
    for (const row of r.rows) console.log('   ', JSON.stringify(row))
  } catch (e) {
    console.log(`### ${label}  → LỖI: ${e.message}`)
  }
  console.log()
}

/* Dải mã là thứ phân biệt được demo với thật: fixture sinh LD-0100..LD-0199,
   19 dòng Apollo nhập từ Excel nằm ở LD-0201..LD-0219, còn gì gõ sau đó thì
   lấy số tiếp theo. */
await show(
  'sales.lead — theo dải mã',
  `select case
      when code >= 'LD-0220' then 'LD-0220+  · gõ/nhập sau này'
      when code >= 'LD-0201' then 'LD-0201..0219  · Apollo thật'
      else 'LD-0100..0199  · fixture demo' end as nhom,
    count(*)::int as so_dong, min(code) as tu, max(code) as den
   from sales.lead group by 1 order by 1`,
)
await show(
  'sales.lead — 20 dòng mới nhất',
  `select code, company, campaign_code, created_at::date as ngay
   from sales.lead order by code desc limit 20`,
)
await show(
  'platform.actor',
  `select id, name, role, email is not null as co_email, password_hash is not null as co_mat_khau
   from platform.actor order by id`,
)
await show(
  'platform.object — theo loại',
  `select kind, count(*)::int as so_dong, min(code) as tu, max(code) as den
   from platform.object group by 1 order by 1`,
)
await show('platform.edge', `select count(*)::int as so_canh from platform.edge`)
await show(
  'sales.opportunity',
  `select count(*)::int as so_dong, min(code) as tu, max(code) as den from sales.opportunity`,
)
await show('sales.contract', `select count(*)::int as so_dong from sales.contract`)
await show(
  'sales.config_entry — theo danh mục',
  `select list, count(*)::int as so_dong from sales.config_entry group by 1 order by 1`,
)
await show('sales.campaign', `select code, name, kind from sales.campaign order by code`)
await show('sales.lead_intake', `select count(*)::int as so_dong from sales.lead_intake`)
await show('platform.audit', `select count(*)::int as so_dong from platform.audit`)
await show('platform.mail_run', `select count(*)::int as so_dong from platform.mail_run`)
await show(
  'platform.email_delivery',
  `select count(*)::int as so_dong from platform.email_delivery`,
)

await client.end()
