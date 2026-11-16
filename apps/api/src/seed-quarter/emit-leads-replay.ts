import type { LeadState, LeadTier, RoleId } from '@pv/contracts'
import { LEAD_NOTE } from '@api/branches/sales/lead/lead-write.mapper'
import { SYSTEM_ACTOR } from '@api/branches/sales/touch/touch.service'
import type { Plan } from './plan'
import type { ActorId, Day, Story } from './story.types'
import type { Ctx } from './types'

/** Replays one journey's beats into the lead's final columns and its timeline.
 *  Each beat writes what the product's own door writes for that move, so the
 *  trail reads like a lead that really lived it. Deal beats move the lead too
 *  (converted, then parked by the machine), so they are read here as well. */

export type TouchRow = Plan['touch'][number] & { at: Date }

export type LeadFacts = {
  state: LeadState
  ownerId: ActorId | null
  bdOwnerId: ActorId | null
  tier: LeadTier | null
  stateSince: Date
  exit: { reasonId: string; at: Date } | null
  recontactOn: Day | null
  repliedFromPoolAt: Date | null
  disabled: { at: Date; by: ActorId } | null
  touches: TouchRow[]
  lastTouchAt: Date
}

const CHANNEL_DONE = {
  call: 'Gọi điện, trao đổi với khách',
  mail: LEAD_NOTE.mailed,
  message: 'Nhắn tin trao đổi với khách',
} as const
const CHANNEL_MISSED = {
  call: 'Gọi chưa được, hẹn gọi lại',
  mail: 'Thư đã gửi, khách chưa trả lời',
  message: 'Nhắn tin, khách chưa trả lời',
} as const

const SOURCE_NOTE = {
  LANDING_PAGE: LEAD_NOTE.landing,
  MANUAL: LEAD_NOTE.typed,
  IMPORT: LEAD_NOTE.imported('danh-sach-khach-hang.xlsx'),
  APOLLO: 'Vào sổ · nạp từ Apollo',
  SCAN: 'Vào sổ · nạp từ ảnh danh thiếp',
} as const

const MERGE_DOORS = ['LANDING_PAGE', 'MANUAL', 'IMPORT'] as const

export type Hand = { by: string; actorId: string | null; role?: RoleId }

export function handOf(ctx: Ctx, id: ActorId | null): Hand {
  if (!id) return { by: SYSTEM_ACTOR, actorId: null }
  const a = ctx.world.actors.get(id)
  if (!a) throw new Error(`seed-quarter: actor ${id} is not in the cast`)
  return { by: a.name, actorId: a.id, ...(a.roleIds[0] ? { role: a.roleIds[0] as RoleId } : {}) }
}

const blank = (bornAt: Date): LeadFacts => ({
  state: 'new',
  ownerId: null,
  bdOwnerId: null,
  tier: null,
  stateSince: bornAt,
  exit: null,
  recontactOn: null,
  repliedFromPoolAt: null,
  disabled: null,
  touches: [],
  lastTouchAt: bornAt,
})

export function replay(ctx: Ctx, story: Story, code: string): LeadFacts {
  const k = story.knobs
  const f = blank(story.bornAt)
  let holdSetAt: Date | null = null
  const push = (
    kind: TouchRow['kind'],
    at: Date,
    who: Hand,
    note: string,
    extra: Partial<TouchRow> = {},
  ): void => {
    f.touches.push({
      id: ctx.rng.uuid(),
      subjectCode: code,
      subjectKind: 'lead',
      kind,
      at,
      by: who.by,
      actorId: who.actorId,
      note,
      ...extra,
    })
    if (at > f.lastTouchAt) f.lastTouchAt = at
  }
  const to = (h: Hand) =>
    h.actorId ? { toActorId: h.actorId, toName: h.by, ...(h.role ? { toRole: h.role } : {}) } : {}
  const move = (at: Date, state: LeadState): void => {
    f.state = state
    f.stateSince = at
  }

  for (const b of story.beats) {
    switch (b.kind) {
      case 'lead-born': {
        const who = handOf(ctx, b.by)
        push('created', b.at, who, SOURCE_NOTE[k.sourceKind], to(who))
        break
      }
      case 'lead-claimed': {
        const who = handOf(ctx, b.by)
        f.ownerId = b.by
        f.bdOwnerId = b.by
        move(b.at, 'assigned')
        push('handed-over', b.at, who, `${LEAD_NOTE.handedTo} ${who.by}`, to(who))
        break
      }
      case 'lead-handed': {
        const [from, next] = [b.from ? handOf(ctx, b.from) : null, handOf(ctx, b.to)]
        f.ownerId = b.to
        push('handed-over', b.at, handOf(ctx, b.by), `${LEAD_NOTE.handedTo} ${next.by}`, {
          ...(from ? { fromActorId: from.actorId, fromName: from.by } : {}),
          ...to(next),
        })
        break
      }
      case 'lead-released': {
        const from = handOf(ctx, f.ownerId)
        f.ownerId = null
        move(b.at, 'new')
        push('handed-over', b.at, handOf(ctx, b.by), LEAD_NOTE.released, {
          fromActorId: from.actorId,
          fromName: from.by,
        })
        break
      }
      case 'first-touch': {
        if (f.state === 'assigned') move(b.at, 'working')
        const note = b.channel === 'mail' ? LEAD_NOTE.mailed : LEAD_NOTE.exchanged
        push('exchange-logged', b.at, handOf(ctx, b.by), note)
        break
      }
      case 'care':
        if (b.reached) push('exchange-logged', b.at, handOf(ctx, b.by), CHANNEL_DONE[b.channel])
        else push('contacted', b.at, handOf(ctx, b.by), CHANNEL_MISSED[b.channel])
        break
      case 'tier':
        f.tier = b.tier
        push('tier-raised', b.at, handOf(ctx, b.by), LEAD_NOTE.tierRaised(b.tier), {
          toTier: b.tier,
        })
        break
      case 'merged':
        push('re-entered', b.at, handOf(ctx, b.by), ctx.rng.pick(MERGE_DOORS))
        break
      case 'parked': {
        const parkedFrom = f.state
        f.ownerId = null
        f.exit = { reasonId: b.reasonKey, at: b.at }
        f.recontactOn = b.recontactOn
        f.repliedFromPoolAt = null
        move(b.at, 'nurturing')
        push('nurtured', b.at, handOf(ctx, b.by), LEAD_NOTE.nurtured(b.reasonKey, undefined), {
          reasonId: b.reasonKey,
          parkedFrom,
        })
        break
      }
      case 'reclaimed':
        f.ownerId = b.by
        f.exit = null
        f.recontactOn = null
        move(b.at, 'assigned')
        push('resumed', b.at, handOf(ctx, b.by), LEAD_NOTE.resumed)
        break
      case 'pool-reply': {
        const reply = new Date(Math.min(b.at.getTime() + 1000, ctx.now.getTime()))
        f.exit = null
        f.recontactOn = null
        f.repliedFromPoolAt = b.at
        move(b.at, 'new')
        push('exchange-logged', b.at, handOf(ctx, null), LEAD_NOTE.repliedIntoPool)
        push('customer-replied', reply, handOf(ctx, null), LEAD_NOTE.replied)
        break
      }
      case 'disabled':
        f.disabled = { at: b.at, by: b.by }
        break
      case 'deal-opened':
        move(b.at, 'converted')
        break
      case 'hold-set':
        if (b.on === 'lead') holdSetAt = b.at
        break
      case 'hold-ended':
        if (b.on === 'lead' && b.end === 'resumed' && holdSetAt) {
          /* Resume stops the clock the hold paused, as the hold door does. */
          const held = b.at.getTime() - Math.max(holdSetAt.getTime(), f.stateSince.getTime())
          if (held > 0) f.stateSince = new Date(f.stateSince.getTime() + held)
        }
        break
      default:
    }
  }
  return f
}
