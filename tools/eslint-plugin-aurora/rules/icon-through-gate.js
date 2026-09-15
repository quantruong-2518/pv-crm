/** Law 11 · Hugeicons Stroke Rounded icons, stroke 1.75, size 16 in buttons / 20 in nav.
 *
 *  `<Icon>` is the ONLY GATE into Hugeicons — there `size` and `strokeWidth`
 *  are a narrow union so they can't be set wrong. Rendering `<House />`
 *  directly goes around that gate and gets the default stroke of 2, default
 *  size of 24.
 *
 *  Importing the icon name to PASS into `<Icon icon={House} />` or into a
 *  data prop is still valid — the rule only blocks using it as a JSX tag.
 *
 *  The file that defines `<Icon>` is exempted in eslint.config.js. */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Hugeicons icons must go through <Icon> (law 11 · Aurora v2.0)' },
    schema: [],
    messages: {
      direct:
        "Don't render <{{name}} /> directly. Use <Icon icon={{{name}}} size={16} /> — <Icon> is the only gate into Hugeicons, where stroke 1.75 and size are locked at the style layer (law 11).",
    },
  },
  create(context) {
    const fromHugeicons = new Set()

    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@hugeicons/react') return
        for (const spec of node.specifiers) {
          if (spec.local?.name) fromHugeicons.add(spec.local.name)
        }
      },
      JSXOpeningElement(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null
        if (name && fromHugeicons.has(name)) {
          context.report({ node: node.name, messageId: 'direct', data: { name } })
        }
      },
    }
  },
}
