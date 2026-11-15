import { HoldListQuery, ObjectCode } from '@pv/contracts'
import { zod } from '@api/platform/http/zod.pipe'
import type { Ask } from './scope-door'

/** How the doors behind `get_record`'s contact, campaign and journey kinds and
 *  `list_my_work`'s approval, parked and meeting kinds are asked as a seat. The three
 *  record kinds take the code from the call, as the history doors do.
 *
 *  Typed to the tools' caps: a journey counts at most 20 deals and 20 contracts as rows
 *  but names only itself, and a list of approvals or holds is at most 20 rows. An approval names its linked records by
 *  kind and label, so it contributes no code: the door's link codes are not the tool's. */

const LIST = 20

const codeOf = (input: unknown) => zod(ObjectCode).transform((input as { code: string }).code)

export const KINDS_ASK: Record<string, Ask> = {
  contact: async (world, who, _on, input) => {
    const body = await world.contacts.profile(who, codeOf(input))
    return { body, codes: [body.code, body.leadCode], rows: 1 }
  },
  campaign: async (world, who, _on, input) => {
    const body = await world.campaigns.profile(who, codeOf(input))
    return { body, codes: [body.code] }
  },
  workstream: async (world, who, _on, input) => {
    const body = await world.workstreams.profile(who, codeOf(input))
    const rows = 1 + Math.min(body.deals.length, LIST) + Math.min(body.contracts.length, LIST)
    return { body, codes: [body.code], rows }
  },
  approvalWaiting: async (world, who) => {
    const body = await world.approvals.pendingFor(who)
    return { body, codes: [], rows: Math.min(body.rows.length, LIST) }
  },
  approvalRaised: async (world, who) => {
    const body = await world.approvals.raisedBy(who)
    return { body, codes: [], rows: Math.min(body.rows.length, LIST) }
  },
  /* The door lists every hold in the seat's scope; the tool keeps the ones the seat itself
     holds (the owner's decision 1 of the list_my_work scope), so the oracle keeps them too. */
  hold: async (world, who) => {
    const all = await world.holds.list(who, zod(HoldListQuery).transform({}))
    const mine = all.rows.filter((r) => r.holder?.id === who.id).slice(0, LIST)
    return { body: { rows: mine }, codes: mine.map((r) => r.code) }
  },
  meeting: async (world, who) => {
    const body = await world.meetings.today(who)
    return { body, codes: [], rows: body.next ? 1 : 0 }
  },
}
