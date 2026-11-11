import { AfterSaleBookQuery, LeadBookQuery, ListCustomersInput, ObjectCode } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { PvError } from '@api/platform/http/problem'
import { zod } from '@api/platform/http/zod.pipe'
import type { Ask } from './scope-door'
import type { World } from './world'

/** How the three doors of `list_customers` are asked as a seat. Each adapter asks the
 *  after-sale book itself, because the lead doors take their codes from its page and
 *  an adapter sees only the seat and the call's input.
 *
 *  `customers` holds the page whole. `leads` and `profile` hold only the lead codes the
 *  door let through, so the leaf check can measure the tool against the page alone. */

/* Typed, not imported: the tool's page size is what is under test. */
const SIZE = 20

async function pageOf(world: World, who: Actor, input: unknown) {
  const { temperature, care, query, mine } = ListCustomersInput.parse(input ?? {})
  const ask = { temperature, care, q: query, carer: mine ? who.id : undefined, size: SIZE }
  const q = zod(AfterSaleBookQuery).transform(
    Object.fromEntries(Object.entries(ask).filter(([, value]) => value !== undefined)),
  )
  return world.afterSales.book(who, q)
}

/** The page, and which of its leads the lead book returns as the seat. */
async function booked(world: World, who: Actor, input: unknown) {
  const page = await pageOf(world, who, input)
  const codes = [...new Set(page.rows.map((r) => r.leadCode))]
  if (codes.length === 0) return { page, codes, booked: [] as string[] }
  const q = zod(LeadBookQuery).transform({
    codes: codes.join(','),
    size: codes.length,
    state: 'all',
  })
  const book = await world.leads.book(who, q)
  return { page, codes, booked: book.rows.map((r) => r.code) }
}

export const CUSTOMER_ASK: Record<string, Ask> = {
  customers: async (world, who, _on, input) => ({
    body: await pageOf(world, who, input),
    codes: [],
    rows: 0,
  }),
  leads: async (world, who, _on, input) => {
    const { booked: codes } = await booked(world, who, input)
    return { body: { rows: codes }, codes }
  },
  /* A lead the book left out is opened at the profile door; 403 and 404 drop it. */
  profile: async (world, who, _on, input) => {
    const { codes, booked: seen } = await booked(world, who, input)
    const opened: string[] = []
    for (const code of codes.filter((c) => !seen.includes(c))) {
      try {
        await world.leads.profile(who, zod(ObjectCode).transform(code))
        opened.push(code)
      } catch (error) {
        const status = error instanceof PvError ? error.getStatus() : null
        if (status !== 403 && status !== 404) throw error
      }
    }
    return { body: { rows: opened }, codes: opened }
  },
}
