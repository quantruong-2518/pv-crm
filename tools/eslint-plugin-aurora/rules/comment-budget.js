/** Law 1 · Comments carry the WHY, and have a cap.
 *
 *  A docblock long enough to narrate a decision is a docs/ page wearing a code
 *  file's clothes: every reader pays for it on every read, and it drifts from
 *  the decision it describes because no compiler checks prose. The cap forces
 *  the split — the reason stays at the declaration, the history moves to docs/
 *  and the comment points at it.
 *
 *  Inside a function the cap is tighter: three lines is enough for "why this
 *  branch", and anything longer is usually describing WHAT the code does. */
const TOP_CAP = 15
const INNER_CAP = 3

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'MethodDefinition',
])

const insideFunction = (node) => {
  for (let n = node; n; n = n.parent) if (FUNCTION_TYPES.has(n.type)) return true
  return false
}

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Length cap for a comment block (law 1)' },
    schema: [],
    messages: {
      tooLong:
        "Comment block is {{lines}} lines, over the {{cap}}-line cap (law 1). Keep the WHY right here; move the decision's history to docs/ and point to it with one line.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()
    return {
      Program() {
        const groups = []
        for (const comment of sourceCode.getAllComments()) {
          const last = groups[groups.length - 1]
          // Consecutive `//` lines read as one block, so they are budgeted as one.
          if (
            last &&
            last.type === 'Line' &&
            comment.type === 'Line' &&
            comment.loc.start.line === last.endLine + 1
          ) {
            last.endLine = comment.loc.end.line
            continue
          }
          groups.push({
            node: comment,
            type: comment.type,
            startLine: comment.loc.start.line,
            endLine: comment.loc.end.line,
          })
        }
        for (const group of groups) {
          const lines = group.endLine - group.startLine + 1
          const owner = sourceCode.getNodeByRangeIndex(group.node.range[0])
          const cap = owner && insideFunction(owner) ? INNER_CAP : TOP_CAP
          if (lines > cap) {
            context.report({ loc: group.node.loc, messageId: 'tooLong', data: { lines, cap } })
          }
        }
      },
    }
  },
}
