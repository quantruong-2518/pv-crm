import { useRef, useState } from 'react'
import { UserPlus } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import type { OpportunityOwner } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { focusSoon } from '@/lib/focus'
import { useDirectory } from '@/data/directory'
import { SALE_LANE, primaryFit, salePrimaryIn } from '@/data/opportunities'
import { useAcceptDeal } from '@/data/opportunities-write'
import { opportunityStageLabel } from '@/data/sales-labels-i18n'
import { SellerModal } from './seller-modal'

/** Module 3 · the accept act — a head of sales takes a `new` deal off the queue
 *  (ADR 0071 §3). One button that owns its own confirm, so the deal profile's
 *  bar, the book row and the journey drawer draw the same act from one place.
 *
 *  The Sale pick is OPTIONAL and ADDS to the lane, never replaces it — the
 *  contract's own rule; replacing is the assign act (`opportunity-assign.tsx`).
 *  Both pick through `SellerModal`, sellers only. The primary is chosen from
 *  the lane as it will stand — who is on it plus who is added (ADR 0086),
 *  offering only people the server accepts. Two or more of them with none
 *  chosen keeps Save shut; the primary is sent only when it moves.
 *
 *  `show` hides the button but keeps the modal mounted: the accept moves the
 *  stage before the call settles, and an unmounted modal would lose its exit
 *  animation and the toast. The accept hides its own opener, so the caller names
 *  where focus lands (`returnFocus`), taken once the opener has gone. */

export function AcceptDealButton({
  code,
  owners,
  show = true,
  size = 'md',
  variant = 'default',
  className,
  iconOnly = false,
  returnFocus,
  onAccepted,
}: {
  code: string
  /** The deal's people as stored; the SALE ones are the lane accept adds to. */
  owners: readonly OpportunityOwner[]
  show?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** `ghost` for a book row: `default` paints a gradient image that a
   *  `bg-transparent` class cannot clear. */
  variant?: 'default' | 'ghost'
  className?: string
  /** The glyph alone, the words in `aria-label`/`title` — a book row's cell. */
  iconOnly?: boolean
  returnFocus?: () => HTMLElement | null | undefined
  /** Runs once the accept landed, before focus moves (the drawer re-picks). */
  onAccepted?: () => void
}) {
  const { t } = useI18n()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [sellers, setSellers] = useState<string[]>([])
  const [primaryPick, setPrimaryPick] = useState<string | null>(null)
  const directory = useDirectory()
  const accept = useAcceptDeal(code)
  const standing = owners.filter((o) => o.role === 'SALE')
  const lane = [...new Set([...standing.map((o) => o.id), ...sellers])]
  const storedPrimary = standing.find((o) => o.primary)?.id
  /* Only the fit people can be primary; a stored one who is not fit counts as none. */
  const fit = primaryFit(lane, directory)
  const primary = salePrimaryIn(fit, primaryPick, storedPrimary)
  const needsPrimary = SALE_LANE.primary && fit.length > 1 && primary === undefined

  const close = () => {
    setOpen(false)
    setSellers([])
    setPrimaryPick(null)
    accept.reset()
  }

  const takeLabel = t(message('Nhận PIC', 'Take ownership', '담당 맡기'))
  const [subtitleHead, subtitleTail] = t(
    message(
      `Chuyển {code} sang cột ${opportunityStageLabel('assigned', 'vi')} và ghi bạn là người nhận.`,
      `Move {code} to ${opportunityStageLabel('assigned', 'en')} and record you as the owner.`,
      `{code}을(를) ${opportunityStageLabel('assigned', 'ko')} 단계로 옮기고 본인을 담당자로 기록합니다.`,
    ),
  ).split('{code}')

  const submit = () => {
    const body = {
      ...(sellers.length > 0 && { saleOwners: sellers }),
      ...(primary !== undefined && primary !== storedPrimary && { salePrimary: primary }),
    }
    accept.mutate(body, {
      onSuccess: () => {
        toastDone(
          t(
            message(
              `Đã nhận PIC ${code}.`,
              `${code}: ownership taken.`,
              `${code} 담당을 맡았습니다.`,
            ),
          ),
        )
        close()
        onAccepted?.()
        /* About four seconds of frames: the book re-reads over the network. */
        if (returnFocus) focusSoon(() => (trigger.current?.isConnected ? null : returnFocus()), 240)
      },
    })
  }

  return (
    <>
      {show && (
        <Button
          ref={trigger}
          size={size}
          variant={variant}
          className={className}
          aria-label={iconOnly ? takeLabel : undefined}
          title={iconOnly ? takeLabel : undefined}
          onClick={() => setOpen(true)}
        >
          <Icon icon={UserPlus} size={16} />
          {!iconOnly && takeLabel}
        </Button>
      )}

      <SellerModal
        open={open}
        onClose={close}
        title={t(message('Nhận PIC cơ hội', 'Take ownership of opportunity', '기회 담당 맡기'))}
        subtitle={
          <>
            {subtitleHead}
            <span className="font-mono">{code}</span>
            {subtitleTail}
          </>
        }
        fieldLabel={t(
          message('Giao thêm Sale đứng đơn', 'Add salespeople to the deal', '영업 담당자 추가'),
        )}
        fieldHint={t(message('Không bắt buộc.', 'Optional.', '선택 사항입니다.'))}
        sellers={sellers}
        onChange={setSellers}
        names={new Map(standing.map((o) => [o.id, o.name]))}
        primary={{ lane: fit, value: primary, onChange: setPrimaryPick }}
        note={
          needsPrimary
            ? t(
                message(
                  'Chọn Sale chính.',
                  'Choose the primary salesperson.',
                  '주 영업 담당자를 선택하세요.',
                ),
              )
            : sellers.length === 0
              ? t(
                  message(
                    'Giao Sale sau cũng được. Cần có Sale trước khi Chốt thắng.',
                    'You can add a salesperson later, but one is needed before closing as won.',
                    '영업 담당자는 나중에 지정해도 되지만, 수주 확정 전에는 반드시 있어야 합니다.',
                  ),
                )
              : ''
        }
        error={accept.error}
        busy={accept.isPending}
        submitDisabled={needsPrimary}
        icon={UserPlus}
        submitLabel={takeLabel}
        busyLabel={t(message('Đang nhận…', 'Taking…', '맡는 중…'))}
        onSubmit={submit}
      />
    </>
  )
}
