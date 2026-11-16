import { CAST } from './params'
import type { Company, Ctx } from './types'
import type { ActorId, Beat, Knobs, OppStage, Story } from './story.types'

/** One deal journey read out of its beats, so every `emit-deals-*` file asks
 *  the same questions the same way. The deal is gone from the board at the
 *  first of `lost` / `signed`; everything dated after that must be dropped. */

export type BeatOf<K extends Beat['kind']> = Extract<Beat, { kind: K }>
export type DealKnob = NonNullable<Knobs['deal']>
export type Hand = { id: ActorId; name: string }

export type DealView = {
  ctx: Ctx
  story: Story
  d: DealKnob
  op: string
  ld: string
  ws: string
  ac: string
  company: Company
  name: string
  opened: BeatOf<'deal-opened'>
  accepted: BeatOf<'deal-accepted'> | null
  lost: BeatOf<'deal-lost'> | null
  signed: BeatOf<'signed'> | null
  moves: BeatOf<'stage'>[]
  closedAt: Date | null
  /** The sentence behind a loss with reason `other`; null for a catalogue reason. */
  stopNote: string | null
  /** The SALE holder at the end: the receiver of the last hand-over, else the knob. */
  finalSale: ActorId
  /** The SALE holder at instant `t`, before or after the hand-over. */
  saleAt: (t: Date) => ActorId
  hand: (id: ActorId) => Hand
}

export const beatsOf = <K extends Beat['kind']>(s: Story, kind: K): BeatOf<K>[] =>
  s.beats.filter((b): b is BeatOf<K> => b.kind === kind)

export function handOf(ctx: Ctx, id: ActorId): Hand {
  const a = ctx.world.actors.get(id)
  if (!a) throw new Error(`deals: actor ${id} is not in the cast`)
  return { id, name: a.name }
}

const OTHER_NOTES = [
  'Khách tạm dừng toàn bộ dự án đầu tư trong năm nay',
  'Khách đổi người phụ trách, dự án bị xếp lại',
  'Khách sáp nhập với công ty khác, chưa có kế hoạch mới',
  'Khách tự làm nội bộ, không cần nhà cung cấp ngoài',
]

const missing = (what: string, key: string): never => {
  throw new Error(`deals: no ${what} for ${key}; the leads emitter must fill it first`)
}

/** The first lost / signed instant; a deal never has both. */
const closeOf = (lost: BeatOf<'deal-lost'> | null, signed: BeatOf<'signed'> | null): Date | null =>
  lost?.at ?? signed?.at ?? null

export function viewOf(ctx: Ctx, story: Story, op: string, name: string): DealView {
  const d = story.knobs.deal
  if (!d) throw new Error(`deals: ${story.key} has no deal knob`)
  const opened = beatsOf(story, 'deal-opened')[0]
  if (!opened) throw new Error(`deals: ${story.key} has no deal-opened beat`)
  const company = ctx.companies[story.knobs.company]
  if (!company) throw new Error(`deals: ${story.key} names company ${story.knobs.company}`)
  const lost = beatsOf(story, 'deal-lost')[0] ?? null
  const signed = beatsOf(story, 'signed')[0] ?? null
  const owners = beatsOf(story, 'owner-changed')
  return {
    ctx,
    story,
    d,
    op,
    ld: ctx.ids.lead.get(story.key) ?? missing('lead code', story.key),
    ws: ctx.ids.workstream.get(story.key) ?? missing('workstream code', story.key),
    ac: ctx.ids.account[story.knobs.company] ?? missing('account code', story.key),
    company,
    name,
    opened,
    accepted: beatsOf(story, 'deal-accepted')[0] ?? null,
    lost,
    signed,
    moves: beatsOf(story, 'stage'),
    closedAt: closeOf(lost, signed),
    stopNote: lost?.reasonKey === 'other' ? ctx.rng.pick(OTHER_NOTES) : null,
    finalSale: owners.at(-1)?.to ?? d.sale,
    saleAt: (t) => owners.filter((o) => o.at.getTime() <= t.getTime()).at(-1)?.to ?? d.sale,
    hand: (id) => handOf(ctx, id),
  }
}

/** The column the deal stood in at instant `t`: every stage beat is dated, so
 *  the last one at or before `t` wins. */
export function stageAt(v: DealView, t: Date): OppStage {
  let stage: OppStage = 'new'
  for (const m of v.moves) if (m.at.getTime() <= t.getTime()) stage = m.to
  return stage
}

export const COLLECTOR_FALLBACK: ActorId = CAST.collectors[0]
