import { useState, type MouseEvent } from 'react'
import { Badge, Button, Check, Copy, Icon, cn } from '@pv/ui'
import type { PartnerRow } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { BOOK_CARD, CARD_LINK } from './book-cards'
import { CARD_GRID, CardFoot, CardHead, CardStat, CompanyMark } from './book-card-parts'

/** The partner book as cards. A partner has no profile page: a press opens the
 *  edit modal, so the title is a button that still stretches over the card.
 *
 *  `CopyRef` lives here because the table and the card both carry it, and the
 *  page imports this file, not the other way round. */

/** Copies the ref without opening the row it sits in. */
export function CopyRef({ value, className }: { value: string; className?: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const copy = async (e: MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toastDone(
        t(
          message(
            `Đã chép mã ${value}`,
            `Copied code ${value}`,
            `코드 ${value}을(를) 복사했습니다`,
          ),
        ),
      )
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* Absent on plain http and blocked by some policies; the pill stays selectable. */
    }
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={t(message(`Chép mã ${value}`, `Copy code ${value}`, `코드 ${value} 복사`))}
      className={cn('pointer-coarse:h-12 pointer-coarse:min-w-12', className)}
      onClick={copy}
    >
      <Icon icon={copied ? Check : Copy} size={14} />
    </Button>
  )
}

function PartnerCard({
  partner: p,
  originName,
  onOpen,
}: {
  partner: PartnerRow
  originName: string
  onOpen: () => void
}) {
  const { t } = useI18n()
  return (
    <article className={BOOK_CARD}>
      <CardHead
        mark={<CompanyMark name={p.name} />}
        title={
          <button
            type="button"
            onClick={onOpen}
            title={p.name}
            className={cn(
              CARD_LINK,
              'focus-visible:after:ring-ring min-w-0 truncate text-left text-[13.5px] font-semibold focus-visible:after:ring-2',
            )}
          >
            {p.name}
          </button>
        }
        subtitle={originName}
        code={p.ref}
      />
      <CardFoot>
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <CardStat value={p.leads} label="lead" />
          <CardStat value={p.opportunities} label={t(message('cơ hội', 'opportunities', '기회'))} />
          <CardStat value={p.contracts} label={t(message('hợp đồng', 'contracts', '계약'))} />
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Badge tone={p.active ? 'success' : 'draft'}>
            {p.active
              ? t(message('Đang dùng', 'Active', '사용 중'))
              : t(message('Đã ẩn', 'Hidden', '숨김'))}
          </Badge>
          <CopyRef value={p.ref} className="pointer-coarse:min-h-12 relative z-[1]" />
        </span>
      </CardFoot>
    </article>
  )
}

export function PartnerCardGrid({
  rows,
  originName,
  onOpen,
}: {
  rows: PartnerRow[]
  originName: (originId: string) => string
  onOpen: (code: string) => void
}) {
  return (
    <div className={CARD_GRID}>
      {rows.map((p) => (
        <PartnerCard
          key={p.code}
          partner={p}
          originName={originName(p.originId)}
          onOpen={() => onOpen(p.code)}
        />
      ))}
    </div>
  )
}
