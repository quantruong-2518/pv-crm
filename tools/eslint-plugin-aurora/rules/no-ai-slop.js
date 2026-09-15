/** Law 15 · No AI slop, and law 11 · no emoji.
 *
 *  Three things are blocked, all taken straight from docs/luat-thiet-ke.md:
 *   · emoji — no place in the UI uses emoji;
 *   · ▲▼▬ and relatives — numeric deltas use the Hugeicons
 *     trending-up/down/minus icons;
 *   · the `sparkles` / `bot` / `wand` icons — the AI Assistant uses `orbit`,
 *     no exceptions. */
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
    docs: { description: 'No emoji, no ▲▼, no AI-slop icons (law 11 + 15)' },
    schema: [],
    messages: {
      emoji: 'Emoji "{{ch}}" is not used in the UI (law 11 · docs/luat-thiet-ke.md).',
      glyph:
        'Character "{{ch}}" is not used to indicate direction. Numeric deltas use the Hugeicons trending-up / trending-down / minus icons (law 15).',
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
