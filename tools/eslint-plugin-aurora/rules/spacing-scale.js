import { scanClassStrings } from '../lib/classes.js'

/** Law 7 · Spacing has only 8 steps: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48.
 *  docs/luat-thiet-ke.md §8: "Padding/gap belongs only to the 8 steps. No 10, 14, 18."
 *
 *  The rule catches both forms:
 *    · Tailwind steps — `p-4` (16px) is valid, `p-2.5` (10px) and `p-7` (28px)
 *      are not;
 *    · arbitrary values — `py-[18px]` doesn't belong to the scale.
 *
 *  Violations that EXIST ALREADY live in `eslint-suppressions.json`, not
 *  deleted but counted — a new one goes red, the old ones stay visible to be
 *  paid down over time. */
const SCALE = new Set([4, 8, 12, 16, 20, 24, 32, 48])

const PROP = 'p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y'
const ARBITRARY = new RegExp(`^-?(${PROP})-\\[(-?[0-9.]+)px\\]$`)
const STEP = new RegExp(`^-?(${PROP})-([0-9.]+|px)$`)

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Spacing has only 8 steps, 4·8·12·16·20·24·32·48 (law 7 · Aurora v2.0)' },
    schema: [],
    messages: {
      offScale:
        'Class "{{token}}" produces {{px}}px, which doesn\'t belong to the 8-step scale (4·8·12·16·20·24·32·48) — law 7. Pick the nearest step, or if the number comes straight from the original design file, flag it and get approval before keeping it.',
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
