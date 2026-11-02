import { useEffect, useState } from 'react'
import { Button, Modal } from '@pv/ui'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { useDisableLeads } from '@/data/lead-disable'
import { appliedMessage, useRestoreLeads } from './lead-restore'

/** Switching leads off and back on (`lead.disable`) — the confirm, the restore
 *  and the selection bar's action. The lead book and the lead profile both
 *  mount these, so the two doors ask the same question in the same words.
 *
 *  Off is confirmed because it reaches the lead's deals and contracts too;
 *  on is not, because it only puts back what was there. */

export function DisableLeadsDialog({
  codes,
  open,
  onClose,
  onDone,
}: {
  codes: string[]
  open: boolean
  onClose: () => void
  /** After the write landed and the dialog closed. */
  onDone?: () => void
}) {
  const { t } = useI18n()
  const write = useDisableLeads()
  const { reset } = write

  /* A refusal belongs to the press that earned it, not to the next opening. */
  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="h-auto max-h-[90dvh] self-end rounded-t-lg sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[480px] sm:self-center"
      title={t(
        message(
          `Vô hiệu hoá ${codes.length} lead?`,
          `Disable ${codes.length} ${codes.length === 1 ? 'lead' : 'leads'}?`,
          `리드 ${codes.length}개를 비활성화할까요?`,
        ),
      )}
      footer={
        <div className="flex flex-col gap-3">
          {write.error && (
            <p role="alert" className="text-destructive-foreground m-0 text-[12.5px] leading-[1.5]">
              {userMessage(write.error)}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button size="lg" variant="ghost" type="button" onClick={onClose}>
              {t(message('Huỷ', 'Cancel', '취소'))}
            </Button>
            <Button
              size="lg"
              variant="destructive"
              type="button"
              disabled={write.isPending}
              onClick={() =>
                write.mutate(
                  { codes, disabled: true },
                  {
                    onSuccess: ({ changed, cancelledMeetings }) => {
                      toastDone(
                        appliedMessage('disable', changed.length, codes.length),
                        cancelledMeetings > 0
                          ? t(
                              message(
                                `Đã huỷ ${cancelledMeetings} lịch họp sắp tới.`,
                                `Cancelled ${cancelledMeetings} upcoming ${cancelledMeetings === 1 ? 'meeting' : 'meetings'}.`,
                                `예정된 회의 ${cancelledMeetings}건을 취소했습니다.`,
                              ),
                            )
                          : undefined,
                      )
                      onClose()
                      onDone?.()
                    },
                  },
                )
              }
            >
              {t(message('Vô hiệu hoá', 'Disable', '비활성화'))}
            </Button>
          </div>
        </div>
      }
    >
      <p className="m-0 text-[13px] leading-[1.6]">
        {t(
          message(
            'Lead, cơ hội và hợp đồng đi kèm sẽ ẩn với mọi người. Thư đang chờ gửi bị giữ lại. Khôi phục ở mục Đã vô hiệu, thư đã giữ không tự gửi lại. Lịch họp sắp tới sẽ huỷ.',
            'The lead and its opportunities and contracts will be hidden from everyone. Emails waiting to send are held. Restore it under Disabled; held emails are not sent again on their own. Upcoming meetings are cancelled.',
            '리드와 연결된 기회 및 계약이 모두에게 숨겨집니다. 발송 대기 중인 이메일은 보류됩니다. 비활성화됨 목록에서 복원할 수 있으며, 보류된 이메일은 자동으로 다시 발송되지 않습니다. 예정된 회의는 취소됩니다.',
          ),
        )}
      </p>
    </Modal>
  )
}

/** The lead book's bulk action: restore on the switched-off tab, where it is
 *  the bar's one action; switch off, beside the mail button, everywhere else. */
export function LeadDisableAction({
  codes,
  restoring,
  onDone,
}: {
  codes: string[]
  restoring: boolean
  onDone: () => void
}) {
  const { t } = useI18n()
  const [asking, setAsking] = useState(false)
  const { pending, restore } = useRestoreLeads()

  if (restoring) {
    return (
      <Button size="lg" disabled={pending} onClick={() => restore(codes, onDone)}>
        {t(message('Khôi phục', 'Restore', '복원'))}
      </Button>
    )
  }
  return (
    <>
      <Button size="lg" variant="destructive" onClick={() => setAsking(true)}>
        {t(message('Vô hiệu hoá', 'Disable', '비활성화'))}
      </Button>
      <DisableLeadsDialog
        codes={codes}
        open={asking}
        onClose={() => setAsking(false)}
        onDone={onDone}
      />
    </>
  )
}
