import { RuleTester } from 'eslint'
import plugin from './index.js'

/** Rule lint có bug thì tệ hơn không có rule: nó chặn code đúng và cho qua code
 *  sai, rồi người ta tắt nó đi. Mỗi rule ở đây phải chứng minh được cả hai
 *  chiều — bắt đúng cái sai, và KHÔNG bắt nhầm cái đúng. */
const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

const r = plugin.rules

tester.run('no-raw-hex', r['no-raw-hex'], {
  valid: [
    "const bg = 'var(--primary)'",
    "const cls = 'bg-primary text-foreground'",
    "const s = 'shadow-[0_3px_12px_var(--shadow-primary)]'",
  ],
  invalid: [
    { code: "const bg = '#2E63E6'", errors: [{ messageId: 'rawHex' }] },
    { code: 'const bg = `linear-gradient(#0B1220, #133A8A)`', errors: [{ messageId: 'rawHex' }] },
    { code: "const c = 'text-[#7FA3FF]'", errors: [{ messageId: 'rawHex' }] },
  ],
})

tester.run('no-box-border', r['no-box-border'], {
  valid: [
    // Đường kẻ một cạnh chia dòng bảng — không phải viền hộp.
    "const c = 'border-b border-b-white/6'",
    "const c = 'border-t border-t-white/12 pt-10'",
    "const c = 'rounded-md shadow-card'",
    // Chữ trong tài liệu nói VỀ token, không phải class.
    "const doc = '--border: transparent'",
  ],
  invalid: [
    { code: "const c = 'border'", errors: [{ messageId: 'boxBorder' }] },
    {
      // Hai class viền trong cùng một chuỗi → hai lỗi, không gộp.
      code: "const c = 'border-2 border-[var(--hc-border)]'",
      errors: [{ messageId: 'boxBorder' }, { messageId: 'boxBorder' }],
    },
    { code: "const c = 'lg:border-4'", errors: [{ messageId: 'boxBorder' }] },
    { code: "const c = 'border-x'", errors: [{ messageId: 'boxBorder' }] },
  ],
})

tester.run('spacing-scale', r['spacing-scale'], {
  valid: [
    "const c = 'p-4 gap-6 mt-8 px-3 py-12'", // 16 · 24 · 32 · 12 · 48
    "const c = 'p-0 m-auto gap-px-ish'",
    "const c = 'py-[16px] gap-[24px]'",
    "const c = '-mt-2'", // -8px vẫn thuộc thang
    "const c = 'h-[150px] w-[232px]'", // không phải padding/gap
  ],
  invalid: [
    { code: "const c = 'gap-2.5'", errors: [{ messageId: 'offScale' }] }, // 10px
    { code: "const c = 'py-[18px]'", errors: [{ messageId: 'offScale' }] },
    { code: "const c = 'pt-10'", errors: [{ messageId: 'offScale' }] }, // 40px
    { code: "const c = 'px-[11px]'", errors: [{ messageId: 'offScale' }] },
  ],
})

tester.run('no-ai-slop', r['no-ai-slop'], {
  valid: [
    "import { TrendingUp } from 'lucide-react'",
    "const label = 'Tăng 12% so với kế hoạch'",
    'const el = <span>Đơn trễ 2 ngày</span>',
  ],
  invalid: [
    { code: "const l = '▲ 2 hóa đơn'", errors: [{ messageId: 'glyph' }] },
    { code: 'const el = <span>Xong 🎉</span>', errors: [{ messageId: 'emoji' }] },
    { code: "import { Sparkles } from 'lucide-react'", errors: [{ messageId: 'icon' }] },
    { code: "import { Bot } from 'lucide-react'", errors: [{ messageId: 'icon' }] },
  ],
})

tester.run('icon-through-gate', r['icon-through-gate'], {
  valid: [
    // Import để TRUYỀN vào <Icon> là cách dùng đúng.
    "import { House } from 'lucide-react'; const el = <Icon icon={House} size={16} />",
    "import { House } from 'lucide-react'; const nav = [{ icon: House, label: 'Trang chủ' }]",
    'const el = <Icon icon={x} />',
  ],
  invalid: [
    {
      code: "import { House } from 'lucide-react'; const el = <House />",
      errors: [{ messageId: 'direct' }],
    },
    {
      code: "import { Orbit as O } from 'lucide-react'; const el = <O strokeWidth={2} />",
      errors: [{ messageId: 'direct' }],
    },
  ],
})

tester.run('no-scenario-mix', r['no-scenario-mix'], {
  valid: [
    "import { saoDo } from '@pv/engines/fixtures/sao-do'",
    "import { dasVina, OPEN_DEALS } from '@pv/engines/fixtures/das-vina'",
    "import { createObjectGraph } from '@pv/engines'",
  ],
  invalid: [
    {
      code: "import { saoDo } from '@pv/engines/fixtures/sao-do'\nimport { dasVina } from '@pv/engines/fixtures/das-vina'",
      errors: [{ messageId: 'mixed' }],
    },
    {
      code: "import { saoDo, dasVina } from '@pv/engines/fixtures'",
      errors: [{ messageId: 'barrel' }],
    },
  ],
})
