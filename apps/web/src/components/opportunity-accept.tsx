import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Inbox, UserPlus } from '@pv/ui'
import { Button, Icon, Modal, cn } from '@pv/ui'
import { isSellerRole, OPPORTUNITY_STAGE_LABEL } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { useSalesPeople } from '@/data/directory'
import {
  DEFAULT_OPPORTUNITY_BOOK_QUERY,
  opportunityBookQueryToParams,
  opportunityHistogramQuery,
  toggled,
} from '@/data/opportunities'
import { useAcceptDeal } from '@/data/opportunities-write'
import { PersonTokenField } from './person-token-field'
import { Field } from './ops-fields'

/** Module 3 · the accept act — a head of sales takes a `new` deal off the queue
 *  (ADR 0071 §3). One button that owns its own confirm, so the deal profile's
 *  bar and the journey drawer draw the same act from one place.
 *
 *  The Sale pick is OPTIONAL and ADDS to the lane, never replaces it — the
 *  contract's own rule — and lists only `isSellerRole` people, the ones the
 *  server accepts there. The deal form's picker stays wider on purpose.
 *
 *  `show` hides the button but keeps the modal mounted: the accept moves the
 *  stage before the call settles, and an unmounted modal would lose its exit
 *  animation, the focus return and the toast. */

export function AcceptDealButton({
  code,
  show = true,
  size = 'md',
  className,
}: {
  code: string
  show?: boolean
  size?: 'md' | 'lg'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [sellers, setSellers] = useState<string[]>([])
  const accept = useAcceptDeal(code)
  const people = useSalesPeople().filter((a) => isSellerRole(a.roleId))
  const busy = accept.isPending

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
      },
    })

  return (
    <>
      {show && (
        <Button size={size} className={className} onClick={() => setOpen(true)}>
          <Icon icon={UserPlus} size={16} />
          Nhận PIC
        </Button>
      )}

      <Modal
        open={open}
        onClose={close}
        className="sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[560px]"
        title="Nhận PIC cơ hội"
        subtitle={
          <>
            Chuyển <span className="font-mono">{code}</span> sang cột{' '}
            {OPPORTUNITY_STAGE_LABEL.assigned} và ghi bạn là người nhận.
          </>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              className={cn(
                'min-w-0 flex-1 text-[11.5px] leading-[1.5]',
                accept.error ? 'text-destructive-foreground' : 'text-muted-foreground',
              )}
              aria-live="polite"
            >
              {accept.error
                ? userMessage(accept.error)
                : busy
                  ? 'Đang nhận…'
                  : sellers.length === 0
                    ? 'Có thể giao Sale sau — cơ hội cần một Sale trước khi đề nghị ký.'
                    : ''}
            </span>
            <div className="flex shrink-0 gap-3">
              <Button size="lg" variant="ghost" disabled={busy} onClick={close}>
                Quay lại
              </Button>
              <Button size="lg" disabled={busy} onClick={submit}>
                <Icon icon={UserPlus} size={16} />
                {busy ? 'Đang nhận…' : 'Nhận PIC'}
              </Button>
            </div>
          </div>
        }
      >
        <Field
          label="Giao thêm Sale đứng đơn"
          hint="Tuỳ chọn. Người chọn ở đây được thêm vào đơn, không thay ai đang đứng."
          plain
        >
          <PersonTokenField
            variant="inline"
            label="Giao thêm Sale đứng đơn"
            placeholder="Gõ tên để tìm…"
            tokens={sellers.map((id) => ({
              id,
              name: people.find((a) => a.id === id)?.name ?? id,
            }))}
            suggestions={people
              .filter((a) => !sellers.includes(a.id))
              .map((a) => ({ id: a.id, name: a.name, note: a.role }))}
            onPick={(id) => setSellers((list) => toggled(list, id))}
            onRemove={(id) => setSellers((list) => toggled(list, id))}
            emptyNote="Không còn Sale nào để thêm."
          />
        </Field>
      </Modal>
    </>
  )
}

/** The deal book, open deals still at `new` — the column a head accepts from. */
const QUEUE_PATH = `/sales/opportunities?${opportunityBookQueryToParams({
  ...DEFAULT_OPPORTUNITY_BOOK_QUERY,
  state: 'open',
  stage: 'new',
})}`

/** The head's queue on the deal book: how many deals wait for an accept. The
 *  count is the histogram's `new` bucket — unscoped, like a head's reach. */
export function AcceptQueueLink() {
  const navigate = useNavigate()
  const { data } = useQuery(opportunityHistogramQuery)
  const waiting = data?.buckets.find((b) => b.stage === 'new')?.count ?? 0

  return (
    <Button
      size="md"
      variant="secondary"
      className="pointer-coarse:h-12 max-sm:flex-1"
      onClick={() => navigate(QUEUE_PATH)}
    >
      <Icon icon={Inbox} size={16} />
      Chờ nhận PIC · {waiting}
    </Button>
  )
}
