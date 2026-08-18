import { fileURLToPath, URL } from 'node:url'

/** Bảng alias DÙNG CHUNG cho `vite build` và `vitest`.
 *
 *  Một bảng duy nhất, không hai bản. Nếu test và build phân giải module khác
 *  nhau thì test xanh trong khi app vỡ — loại bug tốn cả buổi để tìm ra và
 *  không có gì trong code chỉ tới nó.
 *
 *  Dùng regex neo hai đầu chứ không dùng chuỗi tiền tố: `@pv/tokens` dạng chuỗi
 *  sẽ nuốt luôn `@pv/tokens/globals.css` và trỏ nó vào `index.ts/globals.css`.
 *
 *  @param rootUrl `import.meta.url` của file gọi, quy về thư mục gốc repo. */
export function pvAliases(rootUrl: string) {
  const r = (p: string) => fileURLToPath(new URL(p, rootUrl))

  return [
    { find: /^@pv\/tokens\/globals\.css$/, replacement: r('./packages/tokens/globals.css') },
    { find: /^@pv\/tokens$/, replacement: r('./packages/tokens/src/index.ts') },
    { find: /^@pv\/ui$/, replacement: r('./packages/ui/src/index.ts') },
    { find: /^@pv\/engines$/, replacement: r('./packages/engines/src/index.ts') },
    {
      find: /^@pv\/engines\/fixtures$/,
      replacement: r('./packages/engines/src/fixtures/index.ts'),
    },
    {
      find: /^@pv\/engines\/fixtures\/(.+)$/,
      replacement: `${r('./packages/engines/src/fixtures')}/$1`,
    },
    { find: /^@\/(.+)$/, replacement: `${r('./apps/web/src')}/$1` },
  ]
}
