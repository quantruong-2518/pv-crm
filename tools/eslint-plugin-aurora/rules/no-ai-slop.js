/** Luật 15 · Không AI slop, và luật 11 · không emoji.
 *
 *  Ba thứ bị chặn, đều lấy thẳng từ docs/luat-thiet-ke.md:
 *   · emoji — không có chỗ nào trên giao diện dùng emoji;
 *   · ▲▼▬ và họ hàng — delta số dùng icon Lucide trending-up/down/minus;
 *   · icon `sparkles` / `bot` / `wand` — Trợ lý AI dùng `orbit`, không có ngoại lệ. */
const EMOJI = /\p{Extended_Pictographic}/u
const GLYPH = /[▲▼▬△▽▴▾►◄◀▶⯅⯆]/

const BANNED_ICONS = new Set([
  'Sparkle',
  'Sparkles',
  'Bot',
  'BotMessageSquare',
  'Wand',
  'Wand2',
  'WandSparkles',
  'BrainCircuit',
])

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Không emoji, không ▲▼, không icon AI slop (luật 11 + 15)' },
    schema: [],
    messages: {
      emoji: 'Emoji "{{ch}}" không dùng trên giao diện (luật 11 · docs/luat-thiet-ke.md).',
      glyph:
        'Ký tự "{{ch}}" không dùng để chỉ hướng. Delta số dùng icon Lucide trending-up / trending-down / minus (luật 15).',
      icon: 'Icon "{{name}}" là AI slop. Trợ lý AI dùng `orbit` — không `sparkles`, không `bot` (luật 15).',
    },
  },
  create(context) {
    const checkText = (node, text) => {
      if (typeof text !== 'string') return
      const e = text.match(EMOJI)
      if (e) context.report({ node, messageId: 'emoji', data: { ch: e[0] } })
      const g = text.match(GLYPH)
      if (g) context.report({ node, messageId: 'glyph', data: { ch: g[0] } })
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') checkText(node, node.value)
      },
      TemplateElement(node) {
        checkText(node, node.value.raw)
      },
      JSXText(node) {
        checkText(node, node.value)
      },
      ImportDeclaration(node) {
        if (node.source.value !== 'lucide-react') return
        for (const spec of node.specifiers) {
          const name = spec.imported?.name
          if (name && BANNED_ICONS.has(name)) {
            context.report({ node: spec, messageId: 'icon', data: { name } })
          }
        }
      },
    }
  },
}
