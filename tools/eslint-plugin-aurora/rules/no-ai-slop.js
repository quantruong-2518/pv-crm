/** Law 15 · No AI slop, and law 11 · no emoji.
 *
 *  Three things are blocked, all taken straight from docs/luat-thiet-ke.md:
 *   · emoji — no place in the UI uses emoji;
 *   · ▲▼▬ and relatives — numeric deltas use the Hugeicons
 *     trending-up/down/minus icons;
 *   · the `sparkles` / `bot` / `wand` icons — the AI Assistant uses `orbit`,
 *     no exceptions.
 *  A fourth, from docs/design-system/ui-copy.md: builder vocabulary and
 *  capitals used for emphasis, in strings written straight into JSX (text,
 *  attributes, `{}` including ternaries and `&&`). Copy held in a variable, a
 *  call argument or a plain object is out of reach and stays human-guarded. */
const EMOJI = /\p{Extended_Pictographic}/u
const GLYPH = /[▲▼▬△▽▴▾►◄◀▶⯅⯆]/

// `SQL` is left to people: it is also a lead tier the product shows to users.
const JARGON = /máy\s+chủ|\bendpoint\b/i
// A Vietnamese vowel mark separates a shouted word from an acronym such as KPI.
const CAPS_WORD = /(?<!\p{L})\p{Lu}{3,}(?!\p{L})/gu
const TONED = /[ĂÂÊÔƠƯÀÁẢÃẠẰẮẲẴẶẦẤẨẪẬÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴ]/u

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
    docs: {
      description: 'No emoji, no ▲▼, no AI-slop icons, no builder words in copy (law 11 + 15)',
    },
    schema: [],
    messages: {
      emoji: 'Emoji "{{ch}}" is not used in the UI (law 11 · docs/luat-thiet-ke.md).',
      glyph:
        'Character "{{ch}}" is not used to indicate direction. Numeric deltas use the Hugeicons trending-up / trending-down / minus icons (law 15).',
      jargon:
        'On-screen copy says "{{word}}". Users are not technical: say what happens to them, not how the system does it (docs/design-system/ui-copy.md).',
      shout:
        'On-screen copy shouts "{{word}}". No capitals for emphasis (docs/design-system/ui-copy.md).',
      icon: 'Icon "{{name}}" is AI slop. The AI Assistant uses `orbit` — not `sparkles`, not `bot` (law 15).',
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

    const checkCopy = (node, text) => {
      const j = text.match(JARGON)
      if (j) context.report({ node, messageId: 'jargon', data: { word: j[0] } })
      const s = (text.match(CAPS_WORD) ?? []).find((w) => TONED.test(w))
      if (s) context.report({ node, messageId: 'shout', data: { word: s } })
    }
    const PASS_THROUGH = new Set(['ConditionalExpression', 'LogicalExpression', 'TemplateLiteral'])
    const inJsx = (node) => {
      let p = node.parent
      while (PASS_THROUGH.has(p.type)) p = p.parent
      return p.type === 'JSXAttribute' || p.type === 'JSXExpressionContainer'
    }

    return {
      Literal(node) {
        if (typeof node.value !== 'string') return
        checkText(node, node.value)
        if (inJsx(node)) checkCopy(node, node.value)
      },
      TemplateElement(node) {
        checkText(node, node.value.raw)
        if (inJsx(node)) checkCopy(node, node.value.raw)
      },
      JSXText(node) {
        checkText(node, node.value)
        checkCopy(node, node.value)
      },
      ImportDeclaration(node) {
        if (!['@hugeicons/core-free-icons', '@pv/ui'].includes(node.source.value)) return
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
