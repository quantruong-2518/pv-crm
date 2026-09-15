/** Shared utility: pull Tailwind class tokens out of every string in the file.
 *
 *  Doesn't parse `cn()` / `cva()` separately — Tailwind classes always sit
 *  inside a string, so scanning every string is enough and misses no branch.
 *  The tradeoff: it can touch prose strings too; the regexes below are all
 *  tightly anchored so prose doesn't match. */

/** Strip the variant prefix (`lg:`, `hover:`, `dark:lg:`) and the important `!` mark. */
export function bare(token) {
  const last = token.split(':').pop() ?? token
  return last.replace(/^!/, '')
}

/** Walk every string in the file and call `visit(token, node)` for each class. */
export function scanClassStrings(context, visit) {
  const fromText = (text, node) => {
    if (!text || text.length > 4000) return
    for (const raw of text.split(/\s+/)) {
      const token = bare(raw.trim())
      if (token) visit(token, node)
    }
  }

  return {
    Literal(node) {
      if (typeof node.value === 'string') fromText(node.value, node)
    },
    TemplateElement(node) {
      fromText(node.value.raw, node)
    },
  }
}
