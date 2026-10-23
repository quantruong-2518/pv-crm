import type { ReactNode } from 'react'
import { Badge } from '@pv/ui'
import type { LeadRow } from '@pv/contracts'
import { dmy } from '@/lib/date'
import { BOOK_CARD } from './book-cards'
import { CARD_GRID, CardFoot, CardHead, CardNote, CardTitle, CompanyMark } from './book-card-parts'
import { ClaimLeadButton } from './lead-claim'
import { LabelChips } from './lead-labels'

/** The re-contact tab of the stopped-customers page as cards (ADR 0109, 0125): a parked
 *  lead read who → why it stopped → when to call again. A card keeps the row's
 *  facts but the lead's origin. A parked lead has no holder, so its card ends
 *  on the claim button; a lead a reply brought back is in `new` and is
 *  assigned the usual way, so its card ends on the reply's day. */

/* Pinned to Vietnam time as the table's `MomentCell`, so the day printed is
   the day the entry-day filter matches. */
const DAY = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const dayOf = (iso?: string | null) => {
  const at = new Date(iso ?? '')
  return Number.isNaN(at.getTime()) ? '—' : DAY.format(at)
}

const dayNo = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000

/** The re-contact day against `today` (both Vietnam days): late, today, later, or none. */
export function RecontactCell({ on, today }: { on?: string | null; today: string }) {
  if (!on) return <span className="text-muted-foreground text-[13px]">Không hẹn</span>
  const late = dayNo(today) - dayNo(on)
  if (late > 0) return <Badge tone="danger">Trễ {late} ngày</Badge>
  if (late === 0) return <Badge tone="warning">Hôm nay</Badge>
  return <span className="tnum font-num text-[13px]">{dmy(on)}</span>
}

/** A labelled value, in `CardPerson`'s type so a row of them reads as one line. */
function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-[12px]">
      {label}
      <span className="tnum font-num text-foreground">{children}</span>
    </span>
  )
}

export function LeadNurtureCards({
  rows,
  replied,
  today,
  reasonName,
  canClaim,
}: {
  rows: readonly LeadRow[]
  /** The just-replied group: no reason, no re-contact day, no claim. */
  replied: boolean
  today: string
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
          {!replied && <CardNote>{reasonName(l.exitReason)}</CardNote>}
          {!replied && (
            <Labelled label="Liên hệ lại">
              <RecontactCell on={l.recontactOn} today={today} />
            </Labelled>
          )}
          <LabelChips labels={l.labels} max={2} className="flex-nowrap" />
          <CardFoot>
            {replied ? (
              <Labelled label="Ngày phản hồi">{dayOf(l.repliedFromPoolAt)}</Labelled>
            ) : (
              <Labelled label="Ngày vào nhóm">{dayOf(l.exitedAt)}</Labelled>
            )}
            {/* Lifts the button over the title's stretched link. */}
            {canClaim && !replied && (
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
