import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'
import aurora from '@pv/eslint-plugin-aurora'

/** The repo's gate. Three layers, from outside in:
 *   1 · TypeScript + React — common programming errors;
 *   2 · aurora/* — the 15 design laws, the machine-checkable part;
 *   3 · package boundaries — a branch must not reach into another branch's guts.
 *
 *  Violations that EXIST ALREADY live in `eslint-suppressions.json` (generated
 *  with `pnpm lint --suppress-all`). The rule stays `error`: a new violation
 *  goes red, and old debt is countable and paid down over time. No rule is
 *  ever left at `warn` — `warn` is the gentle way to never fix it. */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ---- 1 · TypeScript + React ----------------------------------------------
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  // ---- 2 · the 15 Aurora laws ------------------------------------------------
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    plugins: { aurora },
    rules: {
      'aurora/no-raw-hex': 'error',
      'aurora/no-box-border': 'error',
      'aurora/spacing-scale': 'error',
      'aurora/no-ai-slop': 'error',
      'aurora/icon-through-gate': 'error',
      'aurora/no-scenario-mix': 'error',
      'aurora/comments-in-english': 'error',
      'aurora/comment-budget': 'error',

      // Law 3 · code shape. Counts REAL CODE LINES (comments and blank lines
      // excluded), so the ceiling isn't pushed up by comments — and trimming
      // comments doesn't raise the ceiling.
      'max-lines': ['error', { max: 700, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
    },
  },

  // Ratified exceptions — each one comes with a written rationale, no exception without a reason.
  {
    // Token table: the hex here is DISPLAYED CONTENT, not a style value.
    files: ['packages/tokens/src/tokens.ts'],
    rules: { 'aurora/no-raw-hex': 'off' },
  },
  {
    // icon.tsx IS the gate — it has to touch the Hugeicons renderer directly.
    files: ['packages/ui/src/ui/icon.tsx'],
    rules: { 'aurora/icon-through-gate': 'off' },
  },
  {
    // Law 4, the sole exception: high-contrast variant for kiosk tablets
    // outdoors in bright light, 2px border (docs/luat-thiet-ke.md §1 law 4).
    files: ['packages/ui/src/organisms/kiosk-tile.tsx'],
    rules: { 'aurora/no-box-border': 'off' },
  },
  {
    // The kit page IS DOCUMENTATION about the system: it has to be able to
    // write out the very thing the system forbids, to explain why it's
    // forbidden. Only the text content is exempt, not the layout.
    files: ['apps/web/src/kit/**/*.tsx'],
    rules: { 'aurora/no-ai-slop': 'off', 'aurora/no-raw-hex': 'off' },
  },
  {
    // The fixture IS where scenarios are defined, and a test needs to hold
    // both to compare them.
    files: ['packages/engines/src/fixtures/**', '**/*.test.{ts,tsx,js}'],
    rules: { 'aurora/no-scenario-mix': 'off' },
  },
  {
    // Fixtures are DATA and the kit page is a CATALOG: both grow long by the
    // number of entries they list, not by complexity. A length ceiling here
    // measures the wrong thing.
    files: ['packages/engines/src/fixtures/**', 'apps/web/src/kit/**', '**/*.test.{ts,tsx,js}'],
    rules: { 'max-lines': 'off', 'max-lines-per-function': 'off' },
  },
  {
    // Tests aren't UI. A test title is allowed to quote the design docs
    // verbatim — including the ⚠ mark in the table — and the no-ai-slop rule
    // itself forces writing out the very thing it bans.
    files: ['**/*.test.{ts,tsx,js}'],
    rules: { 'aurora/no-ai-slop': 'off' },
  },

  // ---- 3 · package boundary ------------------------------------------------
  {
    files: ['apps/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@pv/ui/*', '@pv/engines/src/*', '**/packages/*/src/**', '@api/*'],
              message:
                'Import qua cửa chính của package (@pv/ui · @pv/engines · @pv/tokens), không với vào ruột nó. Thiếu export thì mở export ở package đó. `@api/*` là alias NỘI BỘ của máy chủ — app web không với sang đó (khối 3b khai lại rule này cho chính apps/api).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@pv/engines', '@pv/engines/*', '@/*'],
              message:
                '@pv/ui là thư viện trình bày thuần — không biết engine, không biết app. Dữ liệu vào bằng props.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/engines/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', '@pv/ui', '@pv/ui/*'],
              message:
                '@pv/engines là logic nền tảng thuần TypeScript — không phụ thuộc React. Đây là thứ giữ cho engine dùng lại được ở backend.',
            },
          ],
        },
      ],
    },
  },

  {
    // `@pv/contracts` — the DATA CONTRACT, and the most widely imported package.
    //
    // It sits in the BROWSER bundle (every `data/*.ts` in apps/web reads its
    // types from here) and also sits on the server. One `import … from '@api/…'`
    // line here therefore doesn't just reverse the dependency — it drags server
    // source code, and everything that code pulls in, into the file the user
    // downloads.
    //
    // This guard is the gap that was already named in the docblock of
    // `LeadMailTimelineRow.deliveryState`: the other three packages all had a
    // guard, this one didn't, so its boundary was kept by reviewers' eyes. Now
    // the machine keeps it.
    //
    // `zod` is its one and only legitimate dependency (see `package.json`), so
    // the ban list here is broader than the three blocks above: no React, no
    // screen library, no engine, no server, no app.
    files: ['packages/contracts/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@api/*',
                '@/*',
                '@pv/ui',
                '@pv/ui/*',
                '@pv/engines',
                '@pv/engines/*',
                'react',
                'react-dom',
                '**/apps/*/src/**',
                '**/packages/*/src/**',
              ],
              message:
                '@pv/contracts là hợp đồng dữ liệu thuần zod, và nó đi vào CẢ bundle trình duyệt. Nhập từ @api/* là kéo mã máy chủ vào tệp người dùng tải về; nhập engine hay thư viện màn là biến một file kiểu thành một phụ thuộc. Cần một danh sách giá trị dùng chung (ví dụ MAIL_STATES) thì hạ nó xuống package này, đừng với lên chỗ đang giữ nó.',
            },
          ],
        },
      ],
    },
  },

  {
    // `@pv/mail-templates` — the ONLY place on the server side allowed to
    // know React. It builds email bodies and knows nothing else: no engine, no
    // app, no screen library. Its exit door is a pure function returning
    // {subject, html, text}, so `apps/api` still keeps the rule banning react
    // in block 3b right below.
    files: ['packages/mail-templates/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@pv/ui', '@pv/ui/*', '@pv/engines', '@pv/engines/*', '@api/*', '@/*'],
              message:
                '@pv/mail-templates chỉ dựng thân email từ props. Nó không đọc engine, không với sang máy chủ hay app web.',
            },
          ],
        },
      ],
      // The 8-step scale is a SCREEN law (law 7). Email bodies run on tables
      // and inline padding that each mail client interprets its own way;
      // enforcing the scale here forces a law onto a place it has no effect.
      // Color is the OPPOSITE — raw hex is still banned, values come from
      // `@pv/tokens` so mail doesn't drift off the color table.
      'aurora/spacing-scale': 'off',
    },
  },

  // ---- 3b · boundary INSIDE apps/api -----------------------------------------
  // Three rules, same mechanism as the package boundary above. A Nest module
  // CANNOT enforce them on its own: `@Module({ imports })` only says who can
  // use whose provider, it doesn't stop one file from `import`-ing straight
  // into another.
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@pv/ui', '@pv/ui/*', '@pv/tokens', '@pv/tokens/*', 'react', 'react-dom'],
              message:
                'apps/api là máy chủ — không biết React, không biết thư viện trình bày. Đối xứng với rule cấm @pv/engines import react.',
            },
            {
              group: ['@pv/engines/src/*', '**/packages/*/src/**'],
              message:
                'Import qua cửa chính của package, không với vào ruột nó — cùng luật với apps/web (khối 3).',
            },
            {
              group: ['@/*'],
              message: 'Alias @/ là của apps/web. Máy chủ không với sang app web.',
            },
            {
              group: ['@pv/engines/fixtures', '@pv/engines/fixtures/*'],
              message:
                'Fixture là dữ liệu kịch bản, không phải nguồn dữ liệu của máy chủ. Chỉ hai script `seed*.ts` được nhập — chỗ khác nhập là đưa tên khách hàng vào đường chạy thật.',
            },
          ],
        },
      ],
    },
  },
  {
    // The two seed scripts load EXACTLY the frozen scenario into Postgres —
    // that's their job, and the sole exception to the fixture law above.
    //
    // The exception hangs on ONE property, not the file name: this is a CLI
    // command run by hand, not a server request path. The fixture law exists
    // to stop customer names from leaking into what serves real requests; a
    // script someone types by hand and reads the output of isn't that.
    // `no-console` is off for the same reason — a CLI script's output IS its
    // interface.
    //
    // `seed.ts` rebuilds the whole ledger; `seed-accounts.ts` only UPDATEs the
    // email and password of an actor that already exists, so it can run
    // against the real database. Adding a third file here — stop and ask
    // first; this list being short is deliberate.
    files: ['apps/api/src/seed.ts', 'apps/api/src/seed-accounts.ts'],
    rules: { 'no-restricted-imports': 'off', 'no-console': 'off' },
  },
  {
    // `reset-staff.ts` stands ALONE, not merged into the block above, because
    // it only asks for half of that exception: it's a CLI command so
    // `no-console` is off, but it imports no fixture — the real staff ledger
    // lives in `staff.ts`. Merging it in would open the door for customer
    // names to enter a file that has no need of them. `seed-mail-leads.ts` is
    // the same half for the same reason: a CLI command, no fixture.
    files: ['apps/api/src/reset-staff.ts', 'apps/api/src/seed-mail-leads.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Platform is the FOUNDATION. A foundation that knows about a branch has
    // already become a branch.
    files: ['apps/api/src/platform/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/branches/**'],
              message:
                'platform/ không thuộc nhánh nào và không được biết nhánh nào. Cần dữ liệu của nhánh thì để nhánh đưa vào, đừng đi lấy.',
            },
          ],
        },
      ],
    },
  },
  {
    // Cross-branch access must go through the module's exported service, not
    // through a file. This is the law that keeps splitting off a service later
    // a one-week job, not a one-quarter job — see apps/api's CLAUDE.md.
    files: ['apps/api/src/branches/sales/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/branches/supply/**', '**/branches/factory/**', '**/branches/finance/**'],
              message:
                'Nhánh Sales không với vào ruột nhánh khác. Đọc chéo nhánh qua service mà module kia xuất khẩu.',
            },
          ],
        },
      ],
    },
  },

  {
    // ---- RATIFIED EXCEPTION: Nest decorators need a VALUE-FORM import ----
    //
    // `consistent-type-imports` sees `private readonly repo: LeadRepository` in
    // a constructor and concludes "only used as a type." Syntactically, true.
    // At runtime, wrong — and wrong in a way that only blows up when the app
    // runs: `emitDecoratorMetadata` generates `design:paramtypes` from that
    // very `import` statement. Switch to `import type` and TypeScript erases
    // the import, the metadata records `Object`, and Nest reports "Cannot
    // resolve dependency" at a spot that has nothing to do with the file you
    // just edited.
    //
    // This is real friction between the Nest idiom and the repo's ESM /
    // `verbatim` config. The only way to keep both the rule and DI is to hand-
    // attach `@Inject()` to EVERY constructor parameter — far noisier than one
    // documented exception. The tradeoff: `apps/api` gets no benefit from this
    // rule, and the author has to use `import type` themselves for whatever is
    // genuinely just a type.
    files: ['apps/api/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },

  // ---- tools and config -------------------------------------------------------
  {
    files: ['tools/**/*.{js,mjs}', '*.config.{js,mjs,ts}', 'vitest.setup.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off', 'no-undef': 'off' },
  },
  {
    // Block 2 above only scopes the Aurora rules to apps/** and packages/**, so
    // tools/ and the root config files were never gated by comments-in-english —
    // a hole that let Vietnamese comments pile up here undetected. This block
    // closes it without touching block 2, since the other Aurora rules (raw hex,
    // spacing scale, etc.) don't apply to lint tooling or build config.
    files: [
      'tools/**/*.{ts,js,mjs}',
      'eslint.config.js',
      'vitest.config.ts',
      'prettier.config.js',
      'alias.config.ts',
    ],
    plugins: { aurora },
    rules: { 'aurora/comments-in-english': 'error' },
  },
  {
    // shadcn/ui convention: the cva variant is exported from the same file as
    // the component (`export { buttonVariants }`). This is a settled
    // convention of the repo — apps/web/README.md, "Stack" section. The
    // tradeoff: HMR for a file inside the library falls back to a full reload
    // instead of fast refresh; acceptable because the real screens live in
    // apps/web, where the rule stays on.
    files: ['packages/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // routes.tsx is a ROUTE TABLE, not a component module — it exports
    // `SCREENS` and `router`. Fast refresh doesn't apply to it.
    files: ['apps/web/src/routes.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  prettier,
)
