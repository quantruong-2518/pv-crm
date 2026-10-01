import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserMinus, UserRoundPlus } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import type { OpportunityRow } from '@pv/contracts'
import { toastDone } from '@/app/toast'
import { UNASSIGNED_QUEUE } from '@/data/deal-sale'
import { DEFAULT_OPPORTUNITY_BOOK_QUERY, opportunityBookQuery } from '@/data/opportunities'
import { useAssignSale } from '@/data/opportunities-write'
import { BookQueueButton } from './book-queue-button'
import { SellerModal } from './seller-modal'

/** Module 3 · the assign act — a head gives or changes a deal's seller after
 *  accept (ADR 0071, `POST …/:code/sale-owners`, the ONLY door to that lane once
 *  past `new`). REPLACES the lane, so the modal opens on the lane as it stands
 *  and whatever is left is the lane; an unchanged list is not sent. The
 *  server's 400/409 lands in the modal's own footer line.
 *
 *  The caller decides who sees it (`opportunity.assign`, open, past `new`, no
 *  signature pending) and says whether a seller stands, which picks the word. */

type Lane = Pick<OpportunityRow, 'code' | 'owners'>

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id))

export function AssignSaleButton({
  op,
  hasSeller,
  id,
  size = 'md',
  className,
}: {
  op: Lane
  hasSeller: boolean
  id?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [sellers, setSellers] = useState<string[]>([])
  const assign = useAssignSale(op.code)
  const lane = op.owners.filter((o) => o.role === 'SALE')
  const current = lane.map((o) => o.id)
  const unchanged = sameSet(sellers, current)
  const label = hasSeller ? 'Đổi Sale' : 'Giao Sale'

  const start = () => {
    setSellers(current)
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    assign.reset()
  }
  const submit = () => {
    if (unchanged) return
    assign.mutate(
      { saleOwners: sellers },
      {
        onSuccess: () => {
          toastDone(`Đã cập nhật Sale đứng đơn ${op.code}.`)
          close()
        },
      },
    )
  }

  return (
    <>
      <Button id={id} size={size} variant="secondary" className={className} onClick={start}>
        <Icon icon={UserRoundPlus} size={16} />
        {label}
      </Button>

      <SellerModal
        open={open}
        onClose={close}
        title={hasSeller ? 'Đổi Sale đứng đơn' : 'Giao Sale đứng đơn'}
        subtitle={
          <>
            Danh sách dưới đây thay toàn bộ Sale đứng đơn của{' '}
            <span className="font-mono">{op.code}</span>.
          </>
        }
        fieldLabel="Sale đứng đơn"
        fieldHint="Chỉ người vai Sale hoặc AE. Bỏ một người khỏi danh sách là người đó thôi đứng đơn."
        sellers={sellers}
        onChange={setSellers}
        names={new Map(lane.map((o) => [o.id, o.name]))}
        note={
          unchanged
            ? 'Danh sách chưa đổi — thêm hoặc bỏ một người để lưu.'
            : sellers.length === 0
              ? 'Danh sách trống — cơ hội sẽ không còn Sale, và chưa Chốt thắng được.'
              : ''
        }
        error={assign.error}
        busy={assign.isPending}
        submitDisabled={unchanged}
        icon={UserRoundPlus}
        submitLabel={label}
        busyLabel="Đang lưu…"
        onSubmit={submit}
      />
    </>
  )
}

/** The book's "no seller yet" queue for assigners. The count is a `size=1`
 *  read of the same filter, so it is cut by the reader's scope like the book. */
export function UnassignedSaleLink({ active, onPress }: { active: boolean; onPress: () => void }) {
  const { data } = useQuery(
    opportunityBookQuery({ ...DEFAULT_OPPORTUNITY_BOOK_QUERY, ...UNASSIGNED_QUEUE, size: 1 }),
  )
  return (
    <BookQueueButton
      icon={UserMinus}
      label="Chưa giao Sale"
      count={data?.total}
      active={active}
      onPress={onPress}
    />
  )
}
