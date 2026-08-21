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
    // icon.tsx LÀ cái cửa — nó phải chạm lucide trực tiếp.
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
              group: ['@pv/ui/*', '@pv/engines/src/*', '**/packages/*/src/**'],
              message:
                'Import qua cửa chính của package (@pv/ui · @pv/engines · @pv/tokens), không với vào ruột nó. Thiếu export thì mở export ở package đó.',
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
