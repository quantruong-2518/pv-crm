import type { CareActivityKind } from '@pv/contracts'
import { MILESTONE_TOUCH, NOTE } from '@api/branches/sales/opportunity/opportunity.mapper'
import type { touch } from '@api/branches/sales/touch/touch.schema'
import type { StepDone } from './emit-deals-steps'
import { beatsOf, handOf, type DealView } from './emit-deals-view'

/** The deal's timeline. A stage move that is also an activity or a quotation
 *  writes only that milestone's touch, as the real doors do; a bare move writes
 *  `stage-changed`. The `signed` touches (deal and lead) belong to the contracts
 *  emitter, the `quotation-sent` ones to `emit-deals-quote.ts`. */

type TouchRow = typeof touch.$inferInsert

const NOTES: Record<CareActivityKind, string[]> = {
  demo: ['Demo cho bộ phận sản xuất', 'Demo trực tuyến, khách hỏi thêm về báo cáo'],
  poc: ['Chạy thử trên một dây chuyền', 'Chạy thử hai tuần với dữ liệu thật'],
  sample: ['Gửi mẫu qua chuyển phát', 'Mang mẫu đến nhà máy'],
  'site-visit': ['Đi khảo sát xưởng cùng bên kỹ thuật', 'Gặp quản đốc tại nhà máy'],
  solution: ['Gửi bản giải pháp sơ bộ', 'Gửi giải pháp theo yêu cầu của khách'],
}

export function emitTouches(v: DealView, done: StepDone[]): void {
  const { ctx, op } = v
  const out = ctx.plan.touch
  const row = (
    at: Date,
    kind: TouchRow['kind'],
    byId: string,
    note: string,
    extra: Partial<TouchRow> = {},
  ): void => {
    const by = v.hand(byId)
    out.push({
      at,
      subjectCode: op,
      subjectKind: 'opportunity',
      kind,
      actorId: by.id,
      by: by.name,
      note,
      ...extra,
    })
  }
  const opener = v.opened.by
  out.push({
    at: v.opened.at,
    subjectCode: v.ld,
    subjectKind: 'lead',
    kind: 'entered-pipeline',
    actorId: opener,
    by: v.hand(opener).name,
    note: NOTE.promoted(op, v.name),
  })
  row(v.opened.at, 'entered-pipeline', opener, NOTE.opened(v.ld))

  const activities = beatsOf(v.story, 'activity')
  const quoteTimes = new Set(beatsOf(v.story, 'quote').map((q) => q.at.getTime()))
  for (const m of v.moves) {
    const covered =
      quoteTimes.has(m.at.getTime()) || activities.some((a) => a.at.getTime() === m.at.getTime())
    if (!covered) row(m.at, 'stage-changed', m.by, NOTE.moved(m.from, m.to))
  }
  for (const a of activities) {
    const pool = NOTES[a.activity]
    const say = pool.length > 0 && ctx.rng.chance(0.5) ? ctx.rng.pick(pool) : undefined
    row(a.at, MILESTONE_TOUCH[a.activity], a.by, NOTE.milestone(a.activity, say))
  }
  for (const h of beatsOf(v.story, 'owner-changed')) {
    const from = handOf(ctx, h.from)
    const to = handOf(ctx, h.to)
    row(h.at, 'handed-over', h.by, NOTE.handedOver(from.name, to.name), {
      fromActorId: from.id,
      fromName: from.name,
      toActorId: to.id,
      toName: to.name,
      toRole: 'sale',
    })
  }
  if (v.lost)
    row(v.lost.at, 'exited', v.lost.by, NOTE.stopped(v.lost.reasonKey, v.stopNote ?? undefined))
  for (const d of done) row(d.at, 'next-step-done', d.by, d.note)
}
