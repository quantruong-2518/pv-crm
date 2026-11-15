import type { ToolShrink } from '@api/platform/assistant/assistant-tools'

/** The `shrink` every list tool shares: a result over the turn's token budget loses
 *  rows from the END of each list, halving until `fits`. A row is one `{trusted,
 *  untrusted}` object (or one trusted object), so its two halves go together and
 *  never apart. `codes` are left whole upstream: a superset is the safe direction. */

/** Keys leading from the output to an array of rows; a path that finds none is skipped. */
export type RowPath = readonly string[]

const rowsAt = (root: object, path: RowPath): unknown[] | null => {
  let at: unknown = root
  for (const key of path) {
    if (typeof at !== 'object' || at === null) return null
    at = (at as Record<string, unknown>)[key]
  }
  return Array.isArray(at) ? at : null
}

/** `prepare` edits the copy before any row goes, for a cheaper cut than a lost row. */
export function shrinkRows(
  output: object,
  paths: readonly RowPath[],
  fits: Parameters<ToolShrink>[1],
  prepare?: (copy: object) => void,
): object | null {
  try {
    const copy = structuredClone(output)
    prepare?.(copy)
    if (prepare && fits(copy)) return copy
    const lists = paths.map((path) => rowsAt(copy, path)).filter((l) => l !== null)
    const cut = (keep: number) => {
      for (const list of lists) list.length = Math.min(list.length, keep)
    }
    let keep = Math.floor(Math.max(0, ...lists.map((l) => l.length)) / 2)
    while (keep >= 1) {
      cut(keep)
      if (fits(copy)) return copy
      keep = keep === 1 ? 0 : Math.floor(keep / 2)
    }
    return null
  } catch {
    return null
  }
}
