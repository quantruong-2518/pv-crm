/** Data scenario: "Don't mix two scenarios on the same screen."
 *
 *  There are exactly two scenarios — `sao-do` (customer has already bought,
 *  frozen 10/08 07:58) and `das-vina` (customer hasn't bought yet, frozen
 *  17/08 09:10). Mixing them on one screen creates a world that can't exist:
 *  signed and not-signed at the same time.
 *
 *  This is the kind of mistake a human reviewer has a very hard time
 *  spotting — two imports a few lines apart, a variable name that gives
 *  nothing away. The machine sees it instantly. */
const SCENARIO = /fixtures\/(sao-do|das-vina)$/

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'A file must not use both data scenarios',
    },
    schema: [],
    messages: {
      mixed:
        'This file uses both scenarios: "{{first}}" and "{{second}}". Don\'t mix them — Sao Đỏ is a customer who HAS bought (frozen 10/08 07:58), DAS Vina is a customer who has NOT bought (17/08 09:10). Split into two screens, or pick one.',
      barrel:
        'A screen must not import the barrel "{{source}}". Import the scenario you need directly — @pv/engines/fixtures/sao-do or @pv/engines/fixtures/das-vina — so the rule can verify the screen uses only one scenario.',
    },
  },
  create(context) {
    const seen = new Map()

    return {
      ImportDeclaration(node) {
        const source = node.source.value
        if (typeof source !== 'string') return

        if (/@pv\/engines\/fixtures$/.test(source) || /fixtures\/index$/.test(source)) {
          context.report({ node, messageId: 'barrel', data: { source } })
          return
        }

        const m = source.match(SCENARIO)
        if (!m) return
        const id = m[1]
        if (!seen.has(id)) seen.set(id, source)
        if (seen.size > 1) {
          const [first, second] = [...seen.keys()]
          context.report({ node, messageId: 'mixed', data: { first, second } })
        }
      },
    }
  },
}
