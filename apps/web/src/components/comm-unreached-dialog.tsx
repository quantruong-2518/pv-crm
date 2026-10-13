import { useEffect } from 'react'
import { Button, Modal } from '@pv/ui'
import type { DebriefView } from '@pv/contracts'
import { commCreateFailure, useMarkCommUnreached } from '@/data/comm-records'

/** Asked before the unreached close because the record closes for good, and
 *  a reopen is not offered. The refusal shows the server's own sentence: it
 *  words each of its 403 and 409 differently, and a canned line would hide which. */
export function CommUnreachedDialog({
  record,
  open,
  onClose,
}: {
  record: DebriefView
  open: boolean
  onClose: () => void
}) {
  const write = useMarkCommUnreached()
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
      title="Đóng lượt liên hệ này?"
      subtitle={record.subject.label}
      footer={
        <div className="flex flex-col gap-3">
          {write.error && (
            <p role="alert" className="text-destructive-foreground m-0 text-[12.5px] leading-[1.5]">
              {commCreateFailure(write.error)}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              size="lg"
              variant="ghost"
              type="button"
              disabled={write.isPending}
              onClick={onClose}
            >
              Huỷ
            </Button>
            <Button
              size="lg"
              variant="destructive"
              type="button"
              disabled={write.isPending}
              onClick={() => write.mutate(record.id)}
            >
              Đóng lượt liên hệ
            </Button>
          </div>
        </div>
      }
    >
      <p className="m-0 text-[13px] leading-[1.6]">
        Ghi là không liên lạc được. Lượt này đóng không có nội dung và không mở lại được.
      </p>
    </Modal>
  )
}
