import { useState } from 'react'
import { Button, Icon, Modal, Plug, SegmentedControl } from '@pv/ui'
import type { MailTransport } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { useConnectGoogle } from '@/data/google'
import type { useLetterSender } from './letter-form-state'
import { allowanceLeft } from './letter-model'

/** Which mailbox the letter leaves from — the person's choice (owner decision),
 *  not a server rule: the shared system mailbox or their own company Gmail.
 *
 *  Each fact has one place: the address is the preview envelope's, where a
 *  reply lands is the preview caption's, and why the own mailbox cannot send
 *  is the footer's (it is what shuts Send). This row is the choice, the
 *  allowance left, and the button that fixes a link. Own-but-not-linked stays
 *  selectable so the person sees why rather than a dead option.
 *
 *  Connecting is a full navigation to Google that comes back to the home
 *  screen, so the letter is lost: it is always confirmed first. */
export function LetterSenderLine({ line }: { line: ReturnType<typeof useLetterSender>['line'] }) {
  const connect = useConnectGoogle()
  const [asking, setAsking] = useState(false)

  if (line.value === null) {
    return line.reserve ? <div className="pointer-coarse:min-h-14 min-h-10" /> : null
  }
  const go = () =>
    connect.mutate(undefined, {
      onError: (error) =>
        toast(
          isApiError(error) ? userMessage(error) : 'Không mở được trang kết nối tài khoản Google.',
          { tone: 'danger' },
        ),
    })

  return (
    <div className="pointer-coarse:min-h-14 flex min-h-10 min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      <SegmentedControl
        label="Gửi từ"
        value={line.value}
        onChange={(value) => line.pick(value as MailTransport)}
        options={[
          { value: 'resend', label: 'Hộp thư chung' },
          { value: 'gmail', label: 'Hộp thư của tôi' },
        ]}
      />
      {line.remaining !== null && (
        <p className="text-muted-foreground tnum m-0 min-w-0 flex-1 basis-64 text-[12px] leading-5">
          {allowanceLeft(line.remaining)}
        </p>
      )}
      {line.action && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="pointer-coarse:h-12 shrink-0"
          disabled={connect.isPending}
          onClick={() => setAsking(true)}
        >
          <Icon icon={Plug} size={16} />
          {line.action}
        </Button>
      )}
      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        className="h-auto sm:h-auto sm:max-w-[480px]"
        title={line.action ?? ''}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button size="lg" variant="ghost" type="button" onClick={() => setAsking(false)}>
              Tiếp tục soạn thư
            </Button>
            <Button size="lg" type="button" disabled={connect.isPending} onClick={go}>
              Kết nối, bỏ thư đang soạn
            </Button>
          </div>
        }
      >
        <p className="text-muted-foreground m-0 text-[13px] leading-[1.6]">
          Trang kết nối Google mở thay cho màn hình này và quay về trang chủ. Thư đang soạn không
          được lưu.
        </p>
      </Modal>
    </div>
  )
}
