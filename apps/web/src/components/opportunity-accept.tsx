import { useRef, useState } from 'react'
import { UserPlus } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import { OPPORTUNITY_STAGE_LABEL } from '@pv/contracts'
import { toastDone } from '@/app/toast'
import { focusSoon } from '@/lib/focus'
import { useAcceptDeal } from '@/data/opportunities-write'
import { SellerModal } from './seller-modal'

/** Module 3 · the accept act — a head of sales takes a `new` deal off the queue
 *  (ADR 0071 §3). One button that owns its own confirm, so the deal profile's
 *  bar, the book row and the journey drawer draw the same act from one place.
 *
 *  The Sale pick is OPTIONAL and ADDS to the lane, never replaces it — the
 *  contract's own rule; replacing is the assign act (`opportunity-assign.tsx`).
 *  Both pick through `SellerModal`, sellers only.
 *
 *  `show` hides the button but keeps the modal mounted: the accept moves the
 *  stage before the call settles, and an unmounted modal would lose its exit
 *  animation and the toast. The accept hides its own opener, so the caller names
 *  where focus lands (`returnFocus`), taken once the opener has gone. */

export function AcceptDealButton({
  code,
  show = true,
  size = 'md',
  className,
  returnFocus,
  onAccepted,
}: {
  code: string
  show?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  returnFocus?: () => HTMLElement | null | undefined
  /** Runs once the accept landed, before focus moves (the drawer re-picks). */
  onAccepted?: () => void
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [sellers, setSellers] = useState<string[]>([])
  const accept = useAcceptDeal(code)

  const close = () => {
    setOpen(false)
    setSellers([])
    accept.reset()
  }

  const submit = () =>
    accept.mutate(sellers.length === 0 ? {} : { saleOwners: sellers }, {
      onSuccess: () => {
        toastDone(`Đã nhận PIC ${code}.`)
        close()
        onAccepted?.()
        /* About four seconds of frames: the book re-reads over the network. */
        if (returnFocus) focusSoon(() => (trigger.current?.isConnected ? null : returnFocus()), 240)
      },
    })

  return (
    <>
      {show && (
        <Button ref={trigger} size={size} className={className} onClick={() => setOpen(true)}>
          <Icon icon={UserPlus} size={16} />
          Nhận PIC
        </Button>
      )}

      <SellerModal
        open={open}
        onClose={close}
        title="Nhận PIC cơ hội"
        subtitle={
          <>
            Chuyển <span className="font-mono">{code}</span> sang cột{' '}
            {OPPORTUNITY_STAGE_LABEL.assigned} và ghi bạn là người nhận.
          </>
        }
        fieldLabel="Giao thêm Sale đứng đơn"
        fieldHint="Tuỳ chọn. Người chọn ở đây được thêm vào đơn, không thay ai đang đứng."
        sellers={sellers}
        onChange={setSellers}
        note={
          sellers.length === 0
            ? 'Có thể giao Sale sau — cơ hội cần một Sale trước khi Chốt thắng.'
            : ''
        }
        error={accept.error}
        busy={accept.isPending}
        icon={UserPlus}
        submitLabel="Nhận PIC"
        busyLabel="Đang nhận…"
        onSubmit={submit}
      />
    </>
  )
}
