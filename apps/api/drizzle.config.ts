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
  // Hai schema, không phải một. `public` cố tình để trống — mỗi nhánh một
  // schema là luật ranh giới, xem CLAUDE.md của apps/api.
  schemaFilter: ['platform', 'sales'],
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
