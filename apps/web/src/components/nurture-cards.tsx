import type { ReactNode } from 'react'
import type { ContractRow, LeadRow, OpportunityBookRow } from '@pv/contracts'
import { saleOwnersOf } from '@/data/opportunities'
import { BOOK_CARD } from './book-cards'
import {
  CARD_GRID,
  CardFoot,
  CardHead,
  CardNote,
  CardPerson,
  CardStat,
  CardTitle,
  CompanyMark,
} from './book-card-parts'
import { moneyIn } from './deal-money/money'
import { ClaimLeadButton } from './lead-claim'
import { LabelChips } from './lead-labels'

/** The nurturing page's three tabs as cards (ADR 0109): a parked lead, a
 *  stopped deal, a terminated contract, read who → why it left → when. A card
 *  keeps the row's facts but two: the lead's origin, and every Sale on a deal
 *  but the primary. The pool has no holder, so the lead card ends on the claim
 *  button the row carries. */

/* Pinned to Vietnam time as the table's `MomentCell`, so the day printed is
   the day the entry-day filter matches. */
const DAY = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const dayOf = (iso?: string) => {
  const at = new Date(iso ?? '')
  return Number.isNaN(at.getTime()) ? '—' : DAY.format(at)
}

/** A labelled date in the foot, in `CardPerson`'s type so the two read as one row. */
function FootDate({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-[12px]">
      {label}
      <span className="tnum font-num text-foreground">{children}</span>
    </span>
  )
}

export function LeadNurtureCards({
  rows,
  reasonName,
  canClaim,
}: {
  rows: readonly LeadRow[]
  reasonName: (id?: string) => string | undefined
  canClaim: boolean
}) {
  return (
    <div className={CARD_GRID}>
      {rows.map((l) => (
        <article key={l.code} className={BOOK_CARD}>
          <CardHead
            mark={<CompanyMark name={l.company} />}
            title={
              <CardTitle to={`/sales/leads/${encodeURIComponent(l.code)}`} title={l.company}>
                {l.company}
              </CardTitle>
            }
            subtitle={l.contactName}
            code={l.code}
          />
          <CardNote>{reasonName(l.exitReason)}</CardNote>
          <LabelChips labels={l.labels} max={2} className="flex-nowrap" />
          <CardFoot>
            <FootDate label="Ngày vào nhóm">{dayOf(l.exitedAt)}</FootDate>
            {/* Lifts the button over the title's stretched link. */}
            {canClaim && (
              <span className="relative z-[1]">
                <ClaimLeadButton code={l.code} />
              </span>
            )}
          </CardFoot>
        </article>
      ))}
    </div>
  )
}

/** The seller the card names: the primary on the Sale lane, else its first. */
const sellerOf = (op: OpportunityBookRow) => {
  const sale = saleOwnersOf(op)
  return (sale.find((o) => o.primary) ?? sale[0])?.name
}

/** `stopDate` is the table's own date cell, handed in so card and row print one date. */
export function DealNurtureCards({
  rows,
  stopDate,
}: {
  rows: readonly OpportunityBookRow[]
  stopDate: (op: OpportunityBookRow) => ReactNode
}) {
  return (
    <div className={CARD_GRID}>
      {rows.map((op) => (
        <article key={op.code} className={BOOK_CARD}>
          <CardHead
            mark={<CompanyMark name={op.account} />}
            title={
              <CardTitle
                to={`/sales/opportunities/${encodeURIComponent(op.code)}`}
                title={op.account}
              >
                {op.account}
              </CardTitle>
            }
            subtitle={op.name}
            code={op.code}
          />
          <CardNote>{op.stopReasonLabel ?? undefined}</CardNote>
          <CardFoot>
            <CardPerson name={sellerOf(op)} label="Sale phụ trách" empty="Chưa có Sale phụ trách" />
            <FootDate label="Ngày dừng">{stopDate(op)}</FootDate>
          </CardFoot>
        </article>
      ))}
    </div>
  )
}

/* A contract has no name of its own: the customer is the title, as the table's
   bold line, and the code rides in the chip. */
export function ContractNurtureCards({ rows }: { rows: readonly ContractRow[] }) {
  return (
    <div className={CARD_GRID}>
      {rows.map((c) => {
        const t = c.termination
        const money = moneyIn(c.currency)
        return (
          <article key={c.code} className={BOOK_CARD}>
            <CardHead
              mark={<CompanyMark name={c.customer} />}
              title={
                <CardTitle to={`/sales/contracts/${encodeURIComponent(c.code)}`} title={c.customer}>
                  {c.customer}
                </CardTitle>
              }
              code={c.code}
            />
            <CardNote>{t?.reasonLabel}</CardNote>
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
              <CardStat value={t ? money(t.collectedAmount) : '—'} label="đã thu" />
              <CardStat value={t ? money(t.refundedAmount) : '—'} label="đã hoàn" />
            </span>
            <CardFoot>
              <CardPerson name={t?.byName} label="Người chấm dứt" empty="Chưa ghi người chấm dứt" />
              <FootDate label="Ngày chấm dứt">{t ? dayOf(t.terminatedAt) : '—'}</FootDate>
            </CardFoot>
          </article>
        )
      })}
    </div>
  )
}
