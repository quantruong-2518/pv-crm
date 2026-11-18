import { ListDealsInput, OpportunityBookQuery } from '@pv/contracts'
import { READ_SIZE } from '@api/branches/sales/assistant/list-my-work-today'
import { zod } from '@api/platform/http/zod.pipe'
import type { Ask } from './scope-door'

/** How the door of `list_deals` is asked as a seat: the opportunity book itself, open
 *  deals, the query and the close day of the input, in the order the tool asks for, and
 *  as wide as the tool ever reads. The body is the page whole, so every leaf of a row the
 *  tool shows, and its `hidden`, has a door leaf to match. The focus filters and the
 *  quiet order are the tool's own and are left to its unit test: the matrix only holds
 *  the tool to the deals the book gave this seat. */

export const DEAL_ASK: Record<string, Ask> = {
  deals: async (world, who, _on, input) => {
    const ask = ListDealsInput.parse(input ?? {})
    const q = {
      state: 'open',
      q: ask.query,
      expectedTo: ask.focus === 'closing' ? ask.by : undefined,
      sort: ask.sort === 'expectedClose' ? 'expectedClose' : 'amount',
      dir: ask.sort === 'expectedClose' ? 'asc' : 'desc',
      size: READ_SIZE,
    }
    const body = await world.opportunities.book(
      who,
      zod(OpportunityBookQuery).transform(
        Object.fromEntries(Object.entries(q).filter(([, value]) => value !== undefined)),
      ),
    )
    return { body, codes: body.rows.map((r) => r.code) }
  },
}
