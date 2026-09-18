import { Logger } from '@nestjs/common'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

/** Kiểu database mà cả app dùng — KHÔNG khoá vào một driver cụ thể.
 *
 *  `PgDatabase` là lớp cha chung của `NodePgDatabase` và `PgliteDatabase`. Mọi
 *  thứ repository cần (`select`, `insert`, `delete`, `transaction`, `execute`)
 *  đều nằm ở lớp cha này, nên đổi driver không đụng một dòng nào trong
 *  `branches/`. */
export type Db = PgDatabase<PgQueryResultHKT>

export type DbHandle = {
  db: Db
  close: () => Promise<void>
  kind: 'postgres' | 'pglite'
}

const PGLITE = 'pglite://'

/** Chọn driver theo lược đồ của `DATABASE_URL`.
 *
 *  ------------------------------------------------------------------
 *  HAI ĐƯỜNG, KHÔNG PHẢI HAI CƠ SỞ DỮ LIỆU KHÁC NHAU
 *  ------------------------------------------------------------------
 *   · `postgres://…`      → Postgres thật. Đây là thứ production chạy.
 *   · `pglite://./.pglite` → PGlite: CHÍNH Postgres, biên dịch sang WASM và
 *     chạy trong tiến trình Node này. Không daemon, không cổng, không
 *     container, không sudo.
 *
 *  Vì là cùng một engine nên recursive CTE của `graph.repository.ts`, hai
 *  schema `pgSchema`, `text[]`, `uuid` đều chạy y hệt — khác với việc thay
 *  bằng SQLite, thứ sẽ bắt viết hai phương ngữ SQL và làm chính cái nó định
 *  giúp trở nên vô nghĩa.
 *
 *  GIỚI HẠN của PGlite, phải biết trước khi dựa vào: một kết nối tại một thời
 *  điểm, và không phải extension nào cũng có sẵn. Đủ cho phát triển và test,
 *  KHÔNG đủ cho production — `env.ts` từ chối khởi động nếu thấy `pglite://`
 *  khi `NODE_ENV=production`.
 *
 *  Nhập động (`await import`) chứ không nhập tĩnh: `@electric-sql/pglite` là
 *  devDependency, và ảnh production cài `--prod` nên nó KHÔNG có ở đó. Nhập
 *  tĩnh thì máy chủ thật chết lúc khởi động vì một gói chỉ dùng ở máy dev. */
export async function createDb(url: string): Promise<DbHandle> {
  if (url.startsWith(PGLITE)) {
    const target = url.slice(PGLITE.length)
    const { PGlite } = await import('@electric-sql/pglite')
    const { drizzle } = await import('drizzle-orm/pglite')

    /* 'memory' → sống trong RAM, chết theo tiến trình. Dùng cho test.
       Còn lại là một thư mục trên đĩa — dữ liệu còn sau khi tắt máy chủ. */
    const client = new PGlite(target === 'memory' ? undefined : target)
    return { db: drizzle(client), close: () => client.close(), kind: 'pglite' }
  }

  const pool = new Pool({
    connectionString: url,
    max: 10,
    application_name: `pv-one-app-${detectRole()}`,
    /* Fail a stuck connection attempt fast rather than hang a request — Neon
       cold-start and quota rejection both surface within a few seconds. */
    connectionTimeoutMillis: 5_000,
    /* Close idle clients instead of holding them open — every held connection
       is compute Neon will not let go idle. */
    idleTimeoutMillis: 30_000,
  })
  /* `pg.Pool` is an EventEmitter: an idle client Neon drops in the background
     throws on the process with no 'error' listener — same risk
     `boss.provider.ts` already guards for the pg-boss pool. */
  pool.on('error', (err) => {
    new Logger('db').error(`Postgres pool background error: ${err.message}`)
  })
  return { db: drizzleNodePg(pool), close: () => pool.end(), kind: 'postgres' }
}

/** Tells processes apart in `pg_stat_activity` — not a parameter, because
 *  `DbModule` is shared by both `api` and `worker` (see `db.module.ts`), so
 *  nothing in the DI graph naturally knows the role to pass down. `main.ts`
 *  and `worker.ts` each set `PV_ROLE` as the first thing they do, before any
 *  other code runs; one-off scripts (`seed.ts`, `seed-accounts.ts`,
 *  `reset-staff.ts`) never set it, so they fall into `'script'`. */
function detectRole(): 'api' | 'worker' | 'script' {
  const role = process.env.PV_ROLE
  return role === 'api' || role === 'worker' ? role : 'script'
}
