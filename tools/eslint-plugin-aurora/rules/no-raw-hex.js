/** Law 1 · Color comes only from `globals.css`.
 *  docs/luat-thiet-ke.md §8.1: "No hex anywhere in code outside `globals.css`".
 *
 *  The one ratified exception: `packages/tokens/src/tokens.ts` — there the hex
 *  is the DISPLAYED CONTENT of the color table, not a style value. The
 *  exception is declared in `eslint.config.js`, not in this rule. */
const HEX = /#[0-9a-fA-F]{3,8}\b/

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Ban hex outside the token layer (law 1 · Aurora v2.0)' },
    schema: [],
    messages: {
      rawHex:
        'Hex "{{hex}}" sits outside the token layer. Color comes only from packages/tokens/globals.css — use var(--*) or a Tailwind class already mapped to a token. Missing a token? ASK, don\'t invent a new hex.',
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
