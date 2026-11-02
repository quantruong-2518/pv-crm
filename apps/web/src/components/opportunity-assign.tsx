import { useState } from 'react'
import { UserRoundPlus } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import type { OpportunityBookRow, OpportunityProfileResponse } from '@pv/contracts'
import { message, useI18n, type Message } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { useDirectory } from '@/data/directory'
import {
  CHANGE_SALE_PRIMARY_COPY,
  SALE_LANE,
  primaryFit,
  salePrimaryIn,
} from '@/data/opportunities'
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

const PENDING_NOTE = message(
  'Đang chờ duyệt ký: chỉ đổi được Sale chính.',
  'Awaiting signature approval: only the primary salesperson can be changed.',
  '서명 승인 대기 중: 주 영업 담당자만 변경할 수 있습니다.',
)
/** The code sits between the two halves so Korean can put its particle after it. */
const SUBTITLE_PENDING = message(
  'Chọn Sale chính mới của {code}.',
  'Choose the new primary salesperson for {code}.',
  '{code}의 새 주 영업 담당자를 선택하세요.',
)
const SUBTITLE_REPLACE = message(
  'Danh sách dưới đây thay toàn bộ Sale đứng đơn của {code}.',
  'The list below replaces all salespeople on {code}.',
  '{code}의 영업 담당자 전체를 아래 목록으로 교체합니다.',
)
const SALE_OR_AE = message(
  'Chỉ người vai Sale hoặc AE.',
  'Only people with the Sale or AE role.',
  'Sale 또는 AE 역할만 선택할 수 있습니다.',
)
const CHANGE_PRIMARY = CHANGE_SALE_PRIMARY_COPY

const NOTES = {
  primary: message(
    'Chọn Sale chính.',
    'Choose the primary salesperson.',
    '주 영업 담당자를 선택하세요.',
  ),
  unchanged: message('Chưa có gì thay đổi.', 'Nothing has changed.', '변경된 내용이 없습니다.'),
  reason: message(
    'Nêu lý do đổi Sale chính.',
    'Give a reason for changing the primary salesperson.',
    '주 영업 담당자를 변경하는 사유를 입력하세요.',
  ),
  empty: message(
    'Danh sách trống: cơ hội không còn Sale, chưa Chốt thắng được.',
    'The list is empty: the opportunity has no salesperson and cannot be closed as won.',
    '목록이 비어 있습니다. 영업 담당자가 없어 수주를 확정할 수 없습니다.',
  ),
}

/** The footer's line while the form cannot be sent: the first thing it lacks. */
function noteText(
  t: (copy: Message) => string,
  f: { needsPrimary: boolean; unchanged: boolean; needsReason: boolean; empty: boolean },
) {
  if (f.needsPrimary) return t(NOTES.primary)
  if (f.unchanged) return t(NOTES.unchanged)
  if (f.needsReason) return t(NOTES.reason)
  return f.empty ? t(NOTES.empty) : ''
}

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
  const { t } = useI18n()
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
  const label = pending
    ? t(CHANGE_PRIMARY)
    : hasSeller
      ? t(message('Đổi Sale', 'Change salesperson', '영업 담당자 변경'))
      : t(message('Giao Sale', 'Assign salesperson', '영업 담당자 지정'))
  const open = openProp ?? ownOpen
  const [subtitleHead, subtitleTail] = t(pending ? SUBTITLE_PENDING : SUBTITLE_REPLACE).split(
    '{code}',
  )

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
            t(
              pending
                ? message(
                    `Đã đổi Sale chính của ${op.code}.`,
                    `Primary salesperson of ${op.code} changed.`,
                    `${op.code}의 주 영업 담당자를 변경했습니다.`,
                  )
                : message(
                    `Đã cập nhật Sale đứng đơn ${op.code}.`,
                    `Salespeople of ${op.code} updated.`,
                    `${op.code}의 영업 담당자를 업데이트했습니다.`,
                  ),
            ),
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
          pending
            ? t(CHANGE_PRIMARY)
            : hasSeller
              ? t(message('Đổi Sale đứng đơn', 'Change salespeople', '영업 담당자 변경'))
              : t(message('Giao Sale đứng đơn', 'Assign salespeople', '영업 담당자 지정'))
        }
        subtitle={
          <>
            {subtitleHead}
            <span className="font-mono">{op.code}</span>
            {subtitleTail}
          </>
        }
        fieldLabel={t(message(SALE_LANE.label, 'Salesperson', '영업 담당자'))}
        fieldHint={t(pending ? PENDING_NOTE : SALE_OR_AE)}
        sellers={sellers}
        onChange={setSellers}
        names={new Map(lane.map((o) => [o.id, o.name]))}
        primary={{ lane: fit, value: primary, onChange: setPrimaryPick }}
        pending={pending ? { reason, onReason: setReason } : undefined}
        note={noteText(t, { needsPrimary, unchanged, needsReason, empty: sellers.length === 0 })}
        error={assign.error}
        busy={assign.isPending}
        submitDisabled={unchanged || needsPrimary || needsReason}
        icon={UserRoundPlus}
        submitLabel={label}
        busyLabel={t(message('Đang lưu…', 'Saving…', '저장 중…'))}
        onSubmit={submit}
      />
    </>
  )
}
