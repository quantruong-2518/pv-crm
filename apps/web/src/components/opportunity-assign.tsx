import { useState } from 'react'
import { UserRoundPlus } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import type { OpportunityRow } from '@pv/contracts'
import { toastDone } from '@/app/toast'
import { useAssignSale } from '@/data/opportunities-write'
import { SellerModal } from './seller-modal'

/** Module 3 · the assign act — a head gives or changes a deal's seller after
 *  accept (ADR 0071, `POST …/:code/sale-owners`, the ONLY door to that lane once
 *  past `new`). REPLACES the lane, so the modal opens on the lane as it stands
 *  and whatever is left is the lane; an unchanged list is not sent. The
 *  server's 400/409 lands in the modal's own footer line.
 *
 *  The caller decides who sees it (`opportunity.assign`, open, past `new`, no
 *  signature pending) and says whether a seller stands, which picks the word.
 *  Given `open`, the caller owns the door (a menu row) and no button is drawn. */

type Lane = Pick<OpportunityRow, 'code' | 'owners'>

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id))

export function AssignSaleButton({
  op,
  hasSeller,
  id,
  size = 'md',
  variant = 'secondary',
  className,
  iconOnly = false,
  open: openProp,
  onClose,
}: {
  op: Lane
  hasSeller: boolean
  id?: string
  size?: 'sm' | 'md' | 'lg'
  /** `default` is Button's primary look, for when "Giao Sale" is the deal's one
   *  stage action; `ghost` is a book row's, where `ROW_ICON` clears its tint. */
  variant?: 'default' | 'secondary' | 'ghost'
  className?: string
  /** The glyph alone, the words in `aria-label`/`title` — a book row's cell. */
  iconOnly?: boolean
  /** Set = controlled: the modal follows it and no button is drawn. */
  open?: boolean
  onClose?: () => void
}) {
  const [ownOpen, setOwnOpen] = useState(false)
  /* `null` = untouched, so the modal opens on the lane as it stands. */
  const [picked, setSellers] = useState<string[] | null>(null)
  const assign = useAssignSale(op.code)
  const lane = op.owners.filter((o) => o.role === 'SALE')
  const current = lane.map((o) => o.id)
  const sellers = picked ?? current
  const unchanged = sameSet(sellers, current)
  const label = hasSeller ? 'Đổi Sale' : 'Giao Sale'
  const open = openProp ?? ownOpen

  const close = () => {
    if (openProp === undefined) setOwnOpen(false)
    else onClose?.()
    setSellers(null)
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
      {openProp === undefined && (
        <Button
          id={id}
          size={size}
          variant={variant}
          className={className}
          aria-label={iconOnly ? label : undefined}
          title={iconOnly ? label : undefined}
          onClick={() => setOwnOpen(true)}
        >
          <Icon icon={UserRoundPlus} size={16} />
          {!iconOnly && label}
        </Button>
      )}

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
