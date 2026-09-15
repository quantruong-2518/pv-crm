import { scanClassStrings } from '../lib/classes.js'

/** Law 4 · Borderless. `--border: transparent`; edges read via shadow + a 1px
 *  inset highlight. The ONE exception: high-contrast variant for kiosk tablets
 *  outdoors in bright light, 2px border (declared in eslint.config.js).
 *
 *  The rule reads the law narrowly: it bans a BORDER AROUND A BOX. A single-
 *  edge line (`border-b` dividing table rows) is not a box border and is let
 *  through — that's how DataTable divides rows, already there in the 10/08 freeze. */
const BOX_BORDER = /^border(-(0|2|4|8|x|y|\[.+\]))?$/

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Ban a border around a box (law 4 · Aurora v2.0)' },
    schema: [],
    messages: {
      boxBorder:
        'Class "{{token}}" draws a border around a box. The system is borderless (law 4) — layering is done with box-shadow + an inset highlight, not with a border. The one exception is the kiosk tablet high-contrast variant.',
    },
  },
  create(context) {
    return scanClassStrings(context, (token, node) => {
      if (BOX_BORDER.test(token)) {
        context.report({ node, messageId: 'boxBorder', data: { token } })
      }
    })
  },
}
