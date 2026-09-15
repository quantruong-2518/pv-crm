import { fileURLToPath, URL } from 'node:url'

/** Alias table SHARED by `vite build` and `vitest`.
 *
 *  One single table, not two copies. If test and build resolve modules
 *  differently, tests go green while the app breaks — the kind of bug that
 *  costs a whole afternoon to track down, with nothing in the code pointing at it.
 *
 *  Uses regex anchored at both ends instead of a prefix string: `@pv/tokens` as
 *  a plain string would also swallow `@pv/tokens/globals.css` and route it to
 *  `index.ts/globals.css`.
 *
 *  `apps/api` does NOT read this table — the Node runtime doesn't understand
 *  bundler aliases. The server side resolves via `tsconfig-paths`, see
 *  `apps/api/package.json`.
 *
 *  @param rootUrl `import.meta.url` of the calling file, resolved to the repo root. */
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
    { find: /^@pv\/contracts$/, replacement: r('./packages/contracts/src/index.ts') },
    { find: /^@pv\/contracts\/(.+)$/, replacement: `${r('./packages/contracts/src')}/$1` },
    { find: /^@\/(.+)$/, replacement: `${r('./apps/web/src')}/$1` },
  ]
}
