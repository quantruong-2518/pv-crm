import { addDays, dayOf } from './clock'
import { NEXT_TEXT } from './emit-comms-text'
import type { Plan } from './plan'
import type { ConfigRow, Ctx } from './types'

/** What the talk and meeting writers share: one guest identity per wire
 *  address (the book's unique key), a member identity per cast seat, and the
 *  close-out of a record (summary, three answers, sometimes a next step). */

export type Person = Plan['contact'][number]
export type Closing = {
  summary: string
  answers: { criterionId: string; criterionName: string; answerId: string; answerName: string }[]
  next: {
    nextKindId: string | null
    nextKindName: string | null
    nextText: string | null
    nextDue: string | null
  }
}
export type Kit = {
  ctx: Ctx
  guestId(person: Person, wire: 'phone' | 'email', at: Date): string
  memberId(actorId: string): string
  closing(pool: readonly string[], person: string, closedAt: Date): Closing
}

const NO_NEXT = { nextKindId: null, nextKindName: null, nextText: null, nextDue: null }

/** Answers grouped under their question by `criterion_id`; a question with no
 *  active answer is skipped, since a debrief cannot pick from nothing. */
function questions(ctx: Ctx): { criterion: ConfigRow; answers: ConfigRow[] }[] {
  const criteria = ctx.world.config.get('COMM_CRITERION') ?? []
  const answers = ctx.world.config.get('COMM_ANSWER') ?? []
  return criteria
    .map((criterion) => ({
      criterion,
      answers: answers.filter((a) => a.criterionId === criterion.id),
    }))
    .filter((q) => q.answers.length > 0)
}

export function makeKit(ctx: Ctx): Kit {
  const guests = new Map<string, Plan['identity'][number]>()
  const asked = questions(ctx)
  const steps = ctx.world.config.get('STEP_KIND') ?? []

  const closing = (pool: readonly string[], person: string, closedAt: Date): Closing => {
    const answers = asked.map(({ criterion, answers: options }) => {
      const pick = ctx.rng.weighted(
        options.map((o, i) => [o, i === 0 ? 4 : i === 1 ? 4 : 2] as const),
      )
      return {
        criterionId: criterion.id,
        criterionName: criterion.name,
        answerId: pick.id,
        answerName: pick.name,
      }
    })
    const kind = steps.length > 0 && ctx.rng.chance(0.35) ? ctx.rng.pick(steps) : null
    const text = kind ? (NEXT_TEXT[kind.name] ?? NEXT_TEXT['Theo dõi phản hồi']!) : null
    const next =
      kind && text
        ? {
            nextKindId: kind.id,
            nextKindName: kind.name,
            nextText: text(person),
            nextDue: addDays(dayOf(closedAt), ctx.rng.int(2, 10)),
          }
        : NO_NEXT
    return { summary: ctx.rng.pick(pool), answers, next }
  }

  return {
    ctx,
    closing,
    memberId(actorId) {
      const id = ctx.ids.identity.get(actorId)
      if (!id) throw new Error(`seed-quarter comms: no member mailbox for ${actorId}`)
      return id
    },
    guestId(person, wanted, at) {
      const mail = person.email?.toLowerCase()
      const wire = wanted === 'email' && mail ? ('email' as const) : ('phone' as const)
      const address = wire === 'email' ? mail : person.phone
      if (!address) throw new Error(`seed-quarter comms: ${person.code} has no wire address`)
      const key = `${wire}:${address}`
      const known = guests.get(key)
      if (known) {
        if (known.createdAt && at < known.createdAt) known.createdAt = at
        return known.id!
      }
      const row = {
        id: ctx.rng.uuid(),
        channel: wire,
        address,
        side: 'guest' as const,
        objectCode: person.code,
        createdAt: at,
      }
      guests.set(key, row)
      ctx.plan.identity.push(row)
      return row.id
    },
  }
}
