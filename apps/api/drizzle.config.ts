import { defineConfig } from 'drizzle-kit'

/** Cấu hình migration. Đọc `.env` của chính `apps/api`.
 *
 *  Chọn driver theo lược đồ URL, cùng luật với `platform/db/create-db.ts` —
 *  một chỗ quyết định thì hai chỗ không lệch nhau. */
const url = process.env.DATABASE_URL ?? 'pglite://./.pglite'

const common = {
  schema: './src/**/*.schema.ts',
  /* NGOÀI `src/`: file migration là lịch sử của cơ sở dữ liệu, không phải mã
     nguồn được biên dịch. Để trong `src/` thì `tsc` và eslint đều phải học
     cách bỏ qua nó. */
  out: './drizzle',
  dialect: 'postgresql' as const,
  /* Three schemas. `public` is left empty on purpose — one schema per branch or
     domain is the boundary rule, see `apps/api`'s own CLAUDE.md. `comms` joined
     on 15/09, and it has to be listed here: `schema` above already picks the new
     file up, so without this line the DESIRED state holds `comms.identity` while
     the INTROSPECTED state cannot see the schema at all, and the next generated
     migration emits a second CREATE TABLE for a table that already exists. */
  schemaFilter: ['platform', 'sales', 'comms'],
  verbose: true,
  strict: true,
}

export default url.startsWith('pglite://')
  ? defineConfig({
      ...common,
      driver: 'pglite',
      dbCredentials: { url: url.slice('pglite://'.length) },
    })
  : defineConfig({ ...common, dbCredentials: { url } })
