import type { NextStepDoneBody, NextStepKind, NextStepSetBody } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { invalid } from '@api/platform/http/problem'
import type { NextStepRepository } from './next-step.repository'

/** Rules every next-step writer asks — the lead door, the deal door and the
 *  comm close-out (ADR 0074) — kept as one copy so the three cannot drift.
 *  Plain functions over a handle: the close-out asks them before its
 *  transaction, the doors inside theirs. */

/** A `next` equal to `closing` would pass the closing check on a replay. */
export function assertNextDiffers(
  closing: NextStepDoneBody['closing'],
  next: Pick<NextStepSetBody, 'text' | 'due'> | undefined,
  field = 'next',
): void {
  if (next?.text !== closing.text || next.due !== closing.due) return
  throw invalid(
    { [field]: ['Việc tiếp theo mới trùng với việc vừa xong — đổi nội dung hoặc hạn.'] },
    'Việc tiếp theo mới trùng với việc vừa xong.',
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
    { [field]: ['Loại việc không có trong danh mục hoặc đã tắt — chọn loại việc khác.'] },
    'Loại việc không hợp lệ.',
  )
}
