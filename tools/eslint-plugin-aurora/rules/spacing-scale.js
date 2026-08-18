import { scanClassStrings } from '../lib/classes.js'

/** Luật 7 · Spacing chỉ 8 bậc: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48.
 *  docs/luat-thiet-ke.md §8: "Padding/gap chỉ thuộc 8 bậc. Không có 10, 14, 18."
 *
 *  Rule bắt cả hai dạng:
 *    · bậc Tailwind — `p-4` (16px) hợp lệ, `p-2.5` (10px) và `p-7` (28px) không;
 *    · giá trị tuỳ ý — `py-[18px]` không thuộc thang.
 *
 *  Vi phạm ĐANG CÓ nằm trong `eslint-suppressions.json`, không bị xoá đi mà
 *  được đếm — thêm mới thì đỏ, cái cũ thì nhìn thấy để trả dần. */
const SCALE = new Set([4, 8, 12, 16, 20, 24, 32, 48])

const PROP = 'p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y'
const ARBITRARY = new RegExp(`^-?(${PROP})-\\[(-?[0-9.]+)px\\]$`)
const STEP = new RegExp(`^-?(${PROP})-([0-9.]+|px)$`)

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Spacing chỉ 8 bậc 4·8·12·16·20·24·32·48 (luật 7 · Aurora v2.0)' },
    schema: [],
    messages: {
      offScale:
        'Class "{{token}}" cho ra {{px}}px, không thuộc thang 8 bậc (4·8·12·16·20·24·32·48) — luật 7. Chọn bậc gần nhất, hoặc nếu con số lấy đúng từ bản vẽ gốc thì nêu ra và xin phê duyệt trước khi giữ.',
    },
  },
  create(context) {
    return scanClassStrings(context, (token, node) => {
      let px = null

      const arb = token.match(ARBITRARY)
      if (arb) {
        px = Math.abs(Number(arb[2]))
      } else {
        const step = token.match(STEP)
        if (step) px = step[2] === 'px' ? 1 : Math.abs(Number(step[2])) * 4
      }

      if (px === null || Number.isNaN(px) || px === 0) return
      if (SCALE.has(px)) return

      context.report({ node, messageId: 'offScale', data: { token, px: String(px) } })
    })
  },
}
