import type { nextStep } from '@api/branches/sales/next-step/next-step.schema'
import { doneNote } from '@api/branches/sales/next-step/next-step.mapper'
import type { OppStage } from './story.types'
import { beatsOf, stageAt, type DealView } from './emit-deals-view'

/** The deal's next step. `sideBeats` draws it with no look at the close, so a
 *  lost or signed deal can carry an open one; the real stop and sign doors drop
 *  the step, so here an open step survives only on an open deal, and a done
 *  beat after the close is dropped. `subject_code` is the key: the last open wins. */

export type StepRow = typeof nextStep.$inferInsert
export type StepDone = { at: Date; by: string; note: string }

const TEXT: Record<OppStage, [string, string][]> = {
  new: [['Gọi xác nhận nhu cầu với khách', 'Gọi lại']],
  assigned: [
    ['Gọi hẹn lịch trao đổi đầu tiên', 'Gọi lại'],
    ['Hẹn gặp trực tiếp tại nhà máy', 'Hẹn gặp'],
  ],
  engaged: [
    ['Gửi tài liệu giải pháp cho khách', 'Gửi tài liệu'],
    ['Hẹn lịch demo với bộ phận sản xuất', 'Hẹn gặp'],
    ['Gửi mẫu để khách chạy thử', 'Gửi mẫu'],
  ],
  quotation: [
    ['Gọi hỏi phản hồi về báo giá', 'Theo dõi phản hồi'],
    ['Gửi lại báo giá đã chỉnh', 'Gửi báo giá'],
    ['Hẹn khách chốt điều khoản', 'Hẹn gặp'],
  ],
}

type Open = { row: StepRow }

export function dealSteps(v: DealView): { row: StepRow | null; done: StepDone[] } {
  const kinds = new Map((v.ctx.world.config.get('STEP_KIND') ?? []).map((r) => [r.name, r.id]))
  const stamps = [...beatsOf(v.story, 'next-step-open'), ...beatsOf(v.story, 'next-step-done')]
    .filter((b) => b.on === 'deal' && (!v.closedAt || b.at.getTime() < v.closedAt.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
  const handovers = beatsOf(v.story, 'owner-changed')
  const done: StepDone[] = []
  let current: Open | null = null
  for (const b of stamps) {
    if (b.kind === 'next-step-open') {
      const [text, kind] = v.ctx.rng.pick(TEXT[stageAt(v, b.at)])
      /* The hand-over door gives the giver's open steps to the receiver. */
      const doer = handovers.reduce(
        (id, h) => (h.at.getTime() > b.at.getTime() && h.from === id ? h.to : id),
        b.doer,
      )
      const kindId = kinds.get(kind)
      current = {
        row: {
          subjectCode: v.op,
          text,
          due: b.due,
          doerId: doer,
          createdBy: b.by,
          createdAt: b.at,
          updatedAt: b.at,
          ...(kindId ? { kindId } : {}),
        },
      }
    } else if (current) {
      done.push({ at: b.at, by: b.by, note: doneNote(current.row.text) })
      current = null
    }
  }
  return { row: current?.row ?? null, done }
}
