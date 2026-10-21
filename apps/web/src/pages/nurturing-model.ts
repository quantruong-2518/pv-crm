import type { useBookQuery } from '@/app/book-query'

/** The nurturing page's tab switch, without JSX (ADR 0109).
 *
 *  Each tab is a server-paged book with its own address query, and
 *  `useBookQuery` rewrites the whole address from its schema's keys on every
 *  filter, search or page change. `tab` is therefore made a key of each tab's
 *  schema, or the first keystroke on the deal or contract tab would drop the
 *  reader back to the lead tab. */

export const NURTURE_TABS = ['lead', 'deal', 'contract'] as const
export type NurtureTab = (typeof NURTURE_TABS)[number]

export const NURTURE_TAB_LABEL: Record<NurtureTab, string> = {
  lead: 'Lead',
  deal: 'Cơ hội',
  contract: 'Hợp đồng',
}

/** The tabs this reader may open, in order; the lead tab is always there. */
export const tabsFor = (canDeal: boolean, canContract: boolean): NurtureTab[] =>
  NURTURE_TABS.filter((t) => t === 'lead' || (t === 'deal' ? canDeal : canContract))

type BookShape = { q?: string; page: number; size: number }
type BookSchema<Q extends BookShape> = Parameters<typeof useBookQuery<Q>>[0]
type WithTab<Q> = Q & { tab?: string }

const tabOf = (input: unknown) => (input as { tab?: string }).tab

/** A book schema that also carries the address-only `tab`. Build it once at
 *  module level: the hook keys its memos on the schema's identity. */
export function withTab<Q extends BookShape>(schema: BookSchema<Q>): BookSchema<WithTab<Q>> {
  return {
    shape: { ...schema.shape, tab: true },
    parse: (input) => ({ ...schema.parse(input), tab: tabOf(input) }),
    safeParse: (input) => {
      const result = schema.safeParse(input)
      return result.success
        ? { success: true, data: { ...result.data, tab: tabOf(input) } }
        : { success: false }
    },
  }
}

/** The book's own query: `tab` belongs to the address, not to the wire. */
export function withoutTab<Q extends { tab?: string }>(query: Q): Omit<Q, 'tab'> {
  const { tab, ...rest } = query
  void tab
  return rest
}
