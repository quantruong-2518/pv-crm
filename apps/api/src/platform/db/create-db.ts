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

  const pool = new Pool({ connectionString: url, max: 10 })
  return { db: drizzleNodePg(pool), close: () => pool.end(), kind: 'postgres' }
}
