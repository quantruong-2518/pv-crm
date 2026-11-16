import {
  StepLeadState,
  type LeadState,
  type NextStepDoneBody,
  type NextStepKind,
  type NextStepSetBody,
  type StageKey,
  type StateAddress,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { invalid, PvError } from '@api/platform/http/problem'
import type { NextStepRepository } from './next-step.repository'

/** Rules every next-step writer asks — the lead door, the deal door and the
 *  comm close-out (ADR 0074) — kept as one copy so the three cannot drift.
 *  Plain functions over a handle: the close-out asks them before its
 *  transaction, the doors inside theirs. */

type Step = Pick<NextStepSetBody, 'text' | 'due'>

/** Whether the step under the lock is `want`, null meaning none stands: the closing
 *  check of "done", and an assistant card's `before` (ADR 0162). */
export const standsAs = (current: Step | null | undefined, want: Step | null): boolean =>
  want === null ? !current : !!current && current.text === want.text && current.due === want.due

/** The 409 of a step that is no longer the one the write expected (`closing` or a
 *  card's `before`). Typed, so a card press marks stale on this refusal only, and
 *  any other door refusal leaves the card pending (ADR 0162 §3.4). */
export class StepMoved extends PvError {
  constructor(title: string) {
    super({ kind: 'conflict', status: 409, title })
  }
}

/** A `next` equal to `closing` would pass the closing check on a replay. */
export function assertNextDiffers(
  closing: NextStepDoneBody['closing'],
  next: Pick<NextStepSetBody, 'text' | 'due'> | undefined,
  field = 'next',
): void {
  if (next?.text !== closing.text || next.due !== closing.due) return
  throw invalid(
    { [field]: ['Việc tiếp theo mới trùng việc vừa xong. Đổi nội dung hoặc hạn.'] },
    'Việc tiếp theo mới trùng việc vừa xong.',
  )
}

/** A live `STEP_KIND`: `next_step_kind_fk` knows the row and its list, not
 *  whether it was turned off. */
export async function liveKind(
  repo: NextStepRepository,
  kindId: string,
  handle?: Db,
  field = 'kindId',
): Promise<NextStepKind> {
  const row = await repo.stepKind(kindId, handle)
  if (row?.active) return { id: row.id, name: row.name }
  throw invalid(
    { [field]: ['Loại việc này không có hoặc đã tắt. Chọn loại việc khác.'] },
    'Loại việc không hợp lệ.',
  )
}

/** The frame state an object stands in NOW (ADR 0080), or null when it stands
 *  in none: a lead outside the funnel, a deal stopped, signed or with no stage.
 *  One copy, so the picker and the write doors can never resolve differently. */
export function leadAddress(state: LeadState | undefined): StateAddress | null {
  const open = StepLeadState.safeParse(state)
  return open.success ? { kind: 'lead', state: open.data } : null
}

export function dealAddress(deal: { open: boolean; stage: StageKey | null }): StateAddress | null {
  return deal.open && deal.stage !== null ? { kind: 'opportunity', state: deal.stage } : null
}
