import { useEffect, useState } from 'react'
import { Button, Modal } from '@pv/ui'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { useDisableLeads } from '@/data/lead-disable'
import { useRestoreLeads } from './lead-restore'

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
      title={`Vô hiệu hoá ${codes.length} lead?`}
      footer={
        <div className="flex flex-col gap-3">
          {write.error && (
            <p role="alert" className="text-destructive-foreground m-0 text-[12.5px] leading-[1.5]">
              {userMessage(write.error)}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button size="lg" variant="ghost" type="button" onClick={onClose}>
              Huỷ
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
                    onSuccess: ({ changed }) => {
                      toastDone(`Đã vô hiệu hoá ${changed.length} lead`)
                      onClose()
                      onDone?.()
                    },
                  },
                )
              }
            >
              Vô hiệu hoá
            </Button>
          </div>
        </div>
      }
    >
      <p className="m-0 text-[13px] leading-[1.6]">
        Lead sẽ không còn hiện với bất kỳ ai và không thao tác được nữa, kể cả cơ hội và hợp đồng đi
        kèm. Thư đang chờ gửi cho các lead này bị giữ lại và không tự gửi lại khi khôi phục. Có thể
        khôi phục ở mục Đã vô hiệu.
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
  const [asking, setAsking] = useState(false)
  const { pending, restore } = useRestoreLeads()

  if (restoring) {
    return (
      <Button size="lg" disabled={pending} onClick={() => restore(codes, onDone)}>
        Khôi phục
      </Button>
    )
  }
  return (
    <>
      <Button size="lg" variant="destructive" onClick={() => setAsking(true)}>
        Vô hiệu hoá
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
