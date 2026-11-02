import type { ReactNode } from 'react'
import { Badge } from '@pv/ui'
import type { LeadRow } from '@pv/contracts'
import { formatDate, message, useI18n, type Lang } from '@/app/i18n'
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
const DAY: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}

const dayOf = (iso: string | null | undefined, lang: Lang) => {
  const at = new Date(iso ?? '')
  return Number.isNaN(at.getTime()) ? '—' : formatDate(at, lang, DAY)
}

const dayNo = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000

/** The re-contact day against `today` (both Vietnam days): late, today, later, or none. */
export function RecontactCell({ on, today }: { on?: string | null; today: string }) {
  const { t } = useI18n()
  if (!on) {
    return (
      <span className="text-muted-foreground text-[13px]">
        {t(message('Không hẹn', 'Not set', '일정 없음'))}
      </span>
    )
  }
  const late = dayNo(today) - dayNo(on)
  if (late > 0) {
    return (
      <Badge tone="danger">
        {t(message(`Trễ ${late} ngày`, `${late} days late`, `${late}일 지연`))}
      </Badge>
    )
  }
  if (late === 0) return <Badge tone="warning">{t(message('Hôm nay', 'Today', '오늘'))}</Badge>
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
  const { t, lang } = useI18n()
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
            <Labelled label={t(message('Liên hệ lại', 'Re-contact', '재연락'))}>
              <RecontactCell on={l.recontactOn} today={today} />
            </Labelled>
          )}
          <LabelChips labels={l.labels} max={2} className="flex-nowrap" />
          <CardFoot>
            {replied ? (
              <Labelled label={t(message('Ngày phản hồi', 'Reply date', '응답일'))}>
                {dayOf(l.repliedFromPoolAt, lang)}
              </Labelled>
            ) : (
              <Labelled label={t(message('Ngày vào nhóm', 'Date entered group', '그룹 진입일'))}>
                {dayOf(l.exitedAt, lang)}
              </Labelled>
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
