import { useState } from 'react'
import { UserRoundPlus } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import type { OpportunityBookRow, OpportunityProfileResponse } from '@pv/contracts'
import { toastDone } from '@/app/toast'
import { useDirectory } from '@/data/directory'
import { CHANGE_SALE_PRIMARY, SALE_LANE, primaryFit, salePrimaryIn } from '@/data/opportunities'
import { useAssignSale } from '@/data/opportunities-write'
import { SellerModal } from './seller-modal'

/** Module 3 · the assign act — a head gives or changes a deal's seller after
 *  accept (ADR 0071, `POST …/:code/sale-owners`, the ONLY door to that lane once
 *  past `new`). REPLACES the lane, so the modal opens on the lane as it stands;
 *  an unchanged list is not sent. Moving only the primary is a change too, and
 *  the picker offers only people the server accepts (ADR 0086). While a sign
 *  request waits only the primary moves, with a reason (ADR 0086 §2).
 *
 *  The caller decides who sees it and says whether a seller stands, which picks
 *  the word. Given `open`, the caller owns the door and no button is drawn. */

/** A book row or a profile: `pendingSign` is a flag on the first, a request on the second. */
type Lane =
  | Pick<OpportunityBookRow, 'code' | 'owners' | 'pendingSign'>
  | Pick<OpportunityProfileResponse, 'code' | 'owners' | 'pendingSign'>

const PENDING_NOTE = 'Đang chờ duyệt ký: chỉ đổi được Sale chính.'

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
  const [primaryPick, setPrimaryPick] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const directory = useDirectory()
  const assign = useAssignSale(op.code)
  const lane = op.owners.filter((o) => o.role === 'SALE')
  const current = lane.map((o) => o.id)
  const pending = Boolean(op.pendingSign)
  const sellers = pending ? current : (picked ?? current)
  const storedPrimary = lane.find((o) => o.primary)?.id
  /* Only the fit people can be primary; a stored one who is not fit counts as none. */
  const fit = primaryFit(sellers, directory)
  const primary = salePrimaryIn(fit, primaryPick, storedPrimary)
  const primaryMoved = primary !== undefined && primary !== storedPrimary
  const unchanged = sameSet(sellers, current) && !primaryMoved
  const needsPrimary = SALE_LANE.primary && fit.length > 1 && primary === undefined
  const needsReason = pending && reason.trim() === ''
  const label = pending ? CHANGE_SALE_PRIMARY : hasSeller ? 'Đổi Sale' : 'Giao Sale'
  const open = openProp ?? ownOpen

  const close = () => {
    if (openProp === undefined) setOwnOpen(false)
    else onClose?.()
    setSellers(null)
    setPrimaryPick(null)
    setReason('')
    assign.reset()
  }
  const submit = () => {
    if (unchanged || needsPrimary || needsReason) return
    assign.mutate(
      {
        saleOwners: sellers,
        ...(primaryMoved && { salePrimary: primary }),
        ...(pending && { reason: reason.trim() }),
      },
      {
        onSuccess: () => {
          toastDone(
            pending ? `Đã đổi Sale chính của ${op.code}.` : `Đã cập nhật Sale đứng đơn ${op.code}.`,
          )
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
        title={
          pending ? CHANGE_SALE_PRIMARY : hasSeller ? 'Đổi Sale đứng đơn' : 'Giao Sale đứng đơn'
        }
        subtitle={
          <>
            {pending
              ? 'Chọn Sale chính mới của'
              : 'Danh sách dưới đây thay toàn bộ Sale đứng đơn của'}{' '}
            <span className="font-mono">{op.code}</span>.
          </>
        }
        fieldLabel={SALE_LANE.label}
        fieldHint={pending ? PENDING_NOTE : 'Chỉ người vai Sale hoặc AE.'}
        sellers={sellers}
        onChange={setSellers}
        names={new Map(lane.map((o) => [o.id, o.name]))}
        primary={{ lane: fit, value: primary, onChange: setPrimaryPick }}
        pending={pending ? { reason, onReason: setReason } : undefined}
        note={
          needsPrimary
            ? 'Chọn Sale chính.'
            : unchanged
              ? 'Chưa có gì thay đổi.'
              : needsReason
                ? 'Nêu lý do đổi Sale chính.'
                : sellers.length === 0
                  ? 'Danh sách trống: cơ hội không còn Sale, chưa Chốt thắng được.'
                  : ''
        }
        error={assign.error}
        busy={assign.isPending}
        submitDisabled={unchanged || needsPrimary || needsReason}
        icon={UserRoundPlus}
        submitLabel={label}
        busyLabel="Đang lưu…"
        onSubmit={submit}
      />
    </>
  )
}
