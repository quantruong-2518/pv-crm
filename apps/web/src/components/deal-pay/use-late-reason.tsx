import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Textarea } from '@pv/ui'
import { OVERDUE_REASON_TEXT_MAX, OverdueReasonBody } from '@pv/contracts'
import type { ApiError } from '@/app/api'
import { overdueReasonsQuery, useWriteOverdueReason } from '@/data/overdue-reasons'
import { Field } from '@/components/field-bits'

/** Collecting a late installment asks why it is late, through the overdue
 *  reason door (ADR 0100). The reason goes first: once paid, the installment is
 *  no longer overdue and the door refuses it. A reason already waiting or
 *  approved covers this due, so nothing more is asked. */
export function useLateReason(code: string, no: number, late: boolean) {
  const reasons = useQuery({ ...overdueReasonsQuery(code, no), enabled: late })
  const write = useWriteOverdueReason(code, no)
  const [text, setText] = useState('')
  const parsed = OverdueReasonBody.safeParse({ reason: text })
  const current = reasons.data?.current
  const asks = late && current !== 'waiting' && current !== 'approved'
  const canWrite = reasons.data?.canWrite === true

  const blocker = !asks
    ? ''
    : reasons.isPending
      ? 'Đang tải lý do quá hạn.'
      : !reasons.data
        ? 'Chưa tải được lý do quá hạn.'
        : !canWrite
          ? 'Bạn không ghi được lý do quá hạn cho đợt này.'
          : !parsed.success
            ? 'Đợt đã quá hạn. Ghi lý do để thu tiền.'
            : ''

  return {
    blocker,
    busy: write.isPending,
    field: asks && canWrite && (
      <Field label="Lý do quá hạn" note={`${text.length}/${OVERDUE_REASON_TEXT_MAX}`}>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={OVERDUE_REASON_TEXT_MAX}
          rows={3}
          aria-label="Lý do quá hạn"
        />
      </Field>
    ),
    /** Writes the reason when one is asked, then runs `then`. */
    submit: (then: () => void, failed: (e: ApiError) => void) => {
      if (!asks) return then()
      if (parsed.success) write.mutate(parsed.data, { onSuccess: then, onError: failed })
    },
  }
}
