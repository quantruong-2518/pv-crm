import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Textarea } from '@pv/ui'
import { OVERDUE_REASON_TEXT_MAX, OverdueReasonBody } from '@pv/contracts'
import type { ApiError } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { overdueReasonsQuery, useWriteOverdueReason } from '@/data/overdue-reasons'
import { Field } from '@/components/field-bits'

/** Collecting a late installment asks why it is late, through the overdue
 *  reason door (ADR 0100). The reason goes first: once paid, the installment is
 *  no longer overdue and the door refuses it. A reason already waiting or
 *  approved covers this due, so nothing more is asked. */
export function useLateReason(code: string, no: number, late: boolean) {
  const { t } = useI18n()
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
      ? t(
          message(
            'Đang tải lý do quá hạn.',
            'Loading the overdue reason.',
            '연체 사유를 불러오는 중입니다.',
          ),
        )
      : !reasons.data
        ? t(
            message(
              'Chưa tải được lý do quá hạn.',
              'Could not load the overdue reason.',
              '연체 사유를 불러오지 못했습니다.',
            ),
          )
        : !canWrite
          ? t(
              message(
                'Bạn không ghi được lý do quá hạn cho đợt này.',
                'You cannot record an overdue reason for this installment.',
                '이 회차의 연체 사유를 기록할 권한이 없습니다.',
              ),
            )
          : !parsed.success
            ? t(
                message(
                  'Đợt đã quá hạn. Ghi lý do để thu tiền.',
                  'This installment is overdue. Record a reason to collect payment.',
                  '이 회차는 기한이 지났습니다. 수금하려면 사유를 입력하세요.',
                ),
              )
            : ''

  return {
    blocker,
    busy: write.isPending,
    field: asks && canWrite && (
      <Field
        label={t(message('Lý do quá hạn', 'Overdue reason', '연체 사유'))}
        note={`${text.length}/${OVERDUE_REASON_TEXT_MAX}`}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={OVERDUE_REASON_TEXT_MAX}
          rows={3}
          aria-label={t(message('Lý do quá hạn', 'Overdue reason', '연체 사유'))}
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
