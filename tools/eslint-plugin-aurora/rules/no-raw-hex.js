/** Luật 1 · Màu chỉ lấy từ `globals.css`.
 *  docs/luat-thiet-ke.md §8.1: "Không có hex nào trong code ngoài `globals.css`".
 *
 *  Ngoại lệ duy nhất đã ratify: `packages/tokens/src/tokens.ts` — ở đó hex là
 *  NỘI DUNG hiển thị của bảng màu, không phải giá trị style. Ngoại lệ khai báo
 *  trong `eslint.config.js`, không phải trong rule này. */
const HEX = /#[0-9a-fA-F]{3,8}\b/

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Cấm hex ngoài tầng token (luật 1 · Aurora v2.0)' },
    schema: [],
    messages: {
      rawHex:
        'Hex "{{hex}}" nằm ngoài tầng token. Màu chỉ lấy từ packages/tokens/globals.css — dùng var(--*) hoặc class Tailwind đã map token. Thiếu token thì HỎI, đừng bịa hex mới.',
    },
  },
  create(context) {
    const check = (node, text) => {
      const m = typeof text === 'string' ? text.match(HEX) : null
      if (m) context.report({ node, messageId: 'rawHex', data: { hex: m[0] } })
    }
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value)
      },
      TemplateElement(node) {
        check(node, node.value.raw)
      },
    }
  },
}
