import { useState } from 'react'
import { Button, Textarea } from '@pv/ui'
import type { ApprovalRequestView } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { message, useI18n } from '@/app/i18n'
import { useDecideApproval } from '@/data/approvals'

/** The decision bar pinned under the detail: reject and the screen's single
 *  filled primary (approve), drawn only for who holds `approval.decide`. Keyed
 *  by request id upstream, so a half-typed reason never follows a selection.
 *  On `lg` it keeps clear of the floating assistant button, which sits over the
 *  frame's right edge; on a phone it sticks above the bottom nav. */
export function ApprovalDecisionBar({ request }: { request: ApprovalRequestView }) {
  const { t } = useI18n()
  const mayDecide = useCan('approval.decide')
  const decide = useDecideApproval(request.id)
  /* The refusal box opens on demand: a textarea permanently under a request
     the reader means to approve reads like an obligation. */
  const [refusing, setRefusing] = useState(false)
  const [reason, setReason] = useState('')

  if (!mayDecide) return null

  const failure = isApiError(decide.error) ? userMessage(decide.error) : null

  const send = (body: Parameters<typeof decide.mutate>[0], done: string) => {
    decide.mutate(body, {
      onSuccess: () => {
        toastDone(done)
        setRefusing(false)
        setReason('')
      },
    })
  }

  return (
    <div className="max-md:bg-popover px-5 pb-5 pt-3 max-md:sticky max-md:bottom-[calc(84px+env(safe-area-inset-bottom)+12px)] max-md:z-20 max-md:rounded-lg max-md:shadow-[var(--shadow-dock)] md:px-6">
      <div className="flex flex-col gap-3 lg:mr-12">
        {failure ? (
          <p role="alert" className="text-destructive-foreground m-0 text-[12px] leading-[1.5]">
            {failure}
          </p>
        ) : null}

        {refusing ? (
          <>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t(message('Lý do từ chối', 'Reason for rejection', '거절 사유'))}
              rows={3}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                className="pointer-coarse:h-12"
                onClick={() => setRefusing(false)}
              >
                {t(message('Hủy', 'Cancel', '취소'))}
              </Button>
              <Button
                variant="destructive"
                className="pointer-coarse:h-12"
                disabled={reason.trim() === '' || decide.isPending}
                onClick={() =>
                  send(
                    { decision: 'rejected', reason: reason.trim() },
                    t(message('Đã từ chối yêu cầu.', 'Request rejected.', '요청을 거절했습니다.')),
                  )
                }
              >
                {t(message('Xác nhận từ chối', 'Reject request', '요청 거절'))}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex gap-2 md:justify-end">
            <Button
              variant="secondary"
              className="pointer-coarse:h-12 max-md:flex-1"
              disabled={decide.isPending}
              onClick={() => setRefusing(true)}
            >
              {t(message('Từ chối', 'Reject', '거절'))}
            </Button>
            <Button
              className="pointer-coarse:h-12 max-md:flex-1"
              disabled={decide.isPending}
              onClick={() =>
                send(
                  { decision: 'approved' },
                  t(message('Đã duyệt yêu cầu.', 'Request approved.', '요청을 승인했습니다.')),
                )
              }
            >
              {t(message('Phê duyệt', 'Approve', '승인'))}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
