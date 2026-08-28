import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'
import aurora from '@pv/eslint-plugin-aurora'

/** Gác của repo. Ba tầng, từ ngoài vào:
 *   1 · TypeScript + React — lỗi lập trình thường;
 *   2 · aurora/* — 15 luật thiết kế, phần máy kiểm được;
 *   3 · biên giới package — nhánh không được với vào ruột nhánh khác.
 *
 *  Vi phạm ĐANG CÓ nằm trong `eslint-suppressions.json` (sinh bằng
 *  `pnpm lint --suppress-all`). Rule vẫn là `error`: thêm vi phạm mới thì đỏ,
 *  còn nợ cũ thì đếm được và trả dần. Không có rule nào để ở `warn` — `warn`
 *  là cách êm ái để không bao giờ sửa. */
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

  // ---- 2 · 15 luật Aurora --------------------------------------------------
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
    },
  },

  // Ngoại lệ đã ratify — mỗi cái kèm căn cứ, không có ngoại lệ không lý do.
  {
    // Bảng token: hex ở đây là NỘI DUNG hiển thị, không phải giá trị style.
    files: ['packages/tokens/src/tokens.ts'],
    rules: { 'aurora/no-raw-hex': 'off' },
  },
  {
    // icon.tsx LÀ cái cửa — nó phải chạm Hugeicons renderer trực tiếp.
    files: ['packages/ui/src/ui/icon.tsx'],
    rules: { 'aurora/icon-through-gate': 'off' },
  },
  {
    // Luật 4, ngoại lệ duy nhất: biến thể tương phản cao cho kiosk tablet
    // ngoài sáng, viền 2px (docs/luat-thiet-ke.md §1 luật 4).
    files: ['packages/ui/src/organisms/kiosk-tile.tsx'],
    rules: { 'aurora/no-box-border': 'off' },
  },
  {
    // Trang kit là TÀI LIỆU về hệ: nó phải viết ra được cả thứ hệ cấm, để giải
    // thích vì sao cấm. Chỉ miễn phần nội dung chữ, không miễn phần layout.
    files: ['apps/web/src/kit/**/*.tsx'],
    rules: { 'aurora/no-ai-slop': 'off', 'aurora/no-raw-hex': 'off' },
  },
  {
    // Fixture LÀ nơi định nghĩa kịch bản, và test phải cầm được cả hai để so.
    files: ['packages/engines/src/fixtures/**', '**/*.test.{ts,tsx,js}'],
    rules: { 'aurora/no-scenario-mix': 'off' },
  },
  {
    // Test không phải giao diện. Tiêu đề test được phép trích nguyên văn tài
    // liệu thiết kế — kể cả dấu ⚠ trong bảng — và của chính rule no-ai-slop
    // buộc phải viết ra thứ nó cấm.
    files: ['**/*.test.{ts,tsx,js}'],
    rules: { 'aurora/no-ai-slop': 'off' },
  },

  // ---- 3 · biên giới package ----------------------------------------------
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
    // `@pv/contracts` — HỢP ĐỒNG DỮ LIỆU, và là package bị import rộng nhất.
    //
    // Nó nằm trong bundle của TRÌNH DUYỆT (mọi `data/*.ts` của apps/web đọc
    // kiểu từ đây) và cũng nằm trong máy chủ. Một dòng `import … from '@api/…'`
    // ở đây vì thế không chỉ đảo chiều phụ thuộc — nó kéo mã nguồn máy chủ,
    // và mọi thứ mã đó kéo theo, vào tệp người dùng tải về.
    //
    // Rào này là chỗ trống đã được ghi tên trong docblock của
    // `LeadMailTimelineRow.deliveryState`: ba package kia đều có rào, package
    // này thì không, nên biên giới của nó do người soát giữ. Nay máy giữ.
    //
    // `zod` là phụ thuộc DUY NHẤT đúng của nó (xem `package.json`), nên danh
    // sách cấm ở đây rộng hơn ba khối trên: không React, không thư viện màn,
    // không engine, không máy chủ, không app.
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
    // `@pv/mail-templates` — chỗ DUY NHẤT ở tầng máy chủ được biết React.
    // Nó dựng thân email và không biết gì khác: không engine, không app, không
    // thư viện màn. Cửa ra là một hàm thuần trả {subject, html, text}, nên
    // `apps/api` vẫn giữ nguyên rule cấm react ở khối 3b ngay dưới đây.
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
      // Thang 8 bậc là luật của MÀN (luật 7). Thân email đi bằng bảng và
      // padding inline mà từng mail client tự diễn giải; ép thang ở đây là ép
      // một luật vào nơi nó không có hiệu lực. Màu thì NGƯỢC LẠI — vẫn cấm hex
      // thô, giá trị lấy từ `@pv/tokens` để mail không trôi khỏi bảng màu.
      'aurora/spacing-scale': 'off',
    },
  },

  // ---- 3b · biên giới BÊN TRONG apps/api ----------------------------------
  // Ba luật, cùng cơ chế với biên giới package ở trên. Nest module KHÔNG tự ép
  // được chúng: `@Module({ imports })` chỉ nói ai dùng được provider của ai, nó
  // không ngăn một file `import` thẳng vào file khác.
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
    // Hai script seed nạp CHÍNH kịch bản đóng băng vào Postgres — đó là việc
    // của chúng, và là ngoại lệ duy nhất của luật fixture ở trên.
    //
    // Ngoại lệ bám vào MỘT tính chất, không phải vào tên file: đây là lệnh
    // CLI chạy tay, không phải đường chạy của máy chủ. Luật fixture sinh ra để
    // chặn tên khách hàng lọt vào thứ phục vụ request thật; một script người ta
    // gõ tay rồi đọc kết quả không phải thứ đó. `no-console` tắt cùng lý do —
    // đầu ra của một script CLI LÀ giao diện của nó.
    //
    // `seed.ts` dựng lại cả sổ; `seed-accounts.ts` chỉ UPDATE email và mật khẩu
    // của actor đã có nên chạy được trên database thật. Thêm file thứ ba vào
    // đây thì dừng lại và hỏi trước — danh sách này ngắn là có chủ ý.
    files: ['apps/api/src/seed.ts', 'apps/api/src/seed-accounts.ts'],
    rules: { 'no-restricted-imports': 'off', 'no-console': 'off' },
  },
  {
    // Platform là NỀN. Nền biết nhánh là nền đã thành một nhánh.
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
    // Chéo nhánh phải đi qua service xuất khẩu của module, không đi qua file.
    // Đây là luật giữ cho việc tách service sau này là một tuần, không phải
    // một quý — xem CLAUDE.md của apps/api.
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
    // ---- NGOẠI LỆ ĐÃ RATIFY: decorator của Nest cần import DẠNG GIÁ TRỊ ----
    //
    // `consistent-type-imports` nhìn thấy `private readonly repo: LeadRepository`
    // trong constructor và kết luận "chỉ dùng làm kiểu". Về cú pháp thì đúng.
    // Về thực thi thì sai, và sai theo kiểu chỉ nổ lúc chạy:
    // `emitDecoratorMetadata` phát sinh `design:paramtypes` từ chính lời
    // `import` đó. Đổi sang `import type` thì TypeScript xoá lời import, siêu
    // dữ liệu ghi `Object`, và Nest báo "Cannot resolve dependency" ở một chỗ
    // chẳng liên quan gì tới file vừa sửa.
    //
    // Đây là chỗ ma sát có thật giữa idiom Nest và cấu hình ESM/`verbatim` của
    // repo. Cách duy nhất vừa giữ rule vừa giữ DI là gắn `@Inject()` tay lên
    // MỌI tham số constructor — ồn hơn nhiều so với một ngoại lệ có ghi lý do.
    // Đổi lại: `apps/api` không được lợi từ rule này, và người viết phải tự
    // dùng `import type` cho những gì thật sự chỉ là kiểu.
    files: ['apps/api/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },

  // ---- công cụ và cấu hình -------------------------------------------------
  {
    files: ['tools/**/*.{js,mjs}', '*.config.{js,mjs,ts}', 'vitest.setup.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off', 'no-undef': 'off' },
  },
  {
    // Quy ước shadcn/ui: cva variant xuất khẩu cùng file với component
    // (`export { buttonVariants }`). Đây là quy ước đã chốt của repo —
    // apps/web/README.md mục "Stack". Đổi lại, HMR của một file trong thư viện
    // rơi về full reload thay vì fast refresh; chấp nhận được vì màn thật nằm
    // ở apps/web, nơi rule vẫn bật.
    files: ['packages/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // routes.tsx là BẢNG ROUTE, không phải module component — nó xuất khẩu
    // `SCREENS` và `router`. Fast refresh không áp dụng cho nó.
    files: ['apps/web/src/routes.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  prettier,
)
