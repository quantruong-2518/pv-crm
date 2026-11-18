import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Icon, SectionTitle, Skeleton } from '@pv/ui'
import { message, useI18n } from '@/app/i18n'
import { opportunityProfileQuery, stageClockOf } from '@/data/opportunities'
import { opportunityStageLabel } from '@/data/sales-labels-i18n'

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 text-[14px] leading-[1.5]">
      <dt className="text-muted-foreground text-[12px] leading-[1.7]">{label}</dt>
      <dd className="m-0 min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

/** The deal behind a `contract-sign` request, as far as the approver may see.
 *  An approver can lack scope on the deal and get a 404: that renders nothing,
 *  not an error box — the request itself is still theirs to decide. The lead
 *  and contract codes are the ContextRail's, so they are not repeated here. */
export function ApprovalRelated({ code }: { code: string }) {
  const { t, lang, date, currency } = useI18n()
  const { data: op, isPending } = useQuery(opportunityProfileQuery(code))

  if (isPending) return <Skeleton className="h-24" />
  if (!op) return null

  const rounds = op.money.open.flatMap((negotiation) => negotiation.rounds)
  const clock = stageClockOf(op)
  const stageText = op.stage
    ? clock
      ? `${opportunityStageLabel(op.stage, lang)} · ${clock.text}`
      : opportunityStageLabel(op.stage, lang)
    : null

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle size="sm">
        {t(message('Hồ sơ liên quan', 'Related records', '관련 기록'))}
      </SectionTitle>
      <dl className="m-0 flex flex-col gap-2">
        <Fact label={t(message('Khách hàng', 'Customer', '고객'))}>{op.account}</Fact>
        <Fact label={t(message('Cơ hội', 'Opportunity', '영업 기회'))}>{op.name}</Fact>
        {stageText ? (
          <Fact label={t(message('Giai đoạn', 'Stage', '단계'))}>{stageText}</Fact>
        ) : null}
      </dl>

      {rounds.length > 0 ? (
        <div className="flex flex-col gap-2">
          <SectionTitle size="sm">
            {t(message('Báo giá đã gửi', 'Quotations sent', '발송한 견적'))}
          </SectionTitle>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px] leading-[1.5]">
            {rounds.map((round) => (
              <li key={round.id} className="tnum">
                {t(message(`Lần ${round.roundNo}`, `Round ${round.roundNo}`, `${round.roundNo}차`))}
                {' · '}
                {date(round.sentAt, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                {round.amount !== null && round.currency !== null
                  ? ` · ${currency(round.amount, round.currency)}`
                  : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link
        to={`/sales/opportunities/${encodeURIComponent(code)}`}
        className="text-accent-foreground pointer-coarse:min-h-12 inline-flex w-fit items-center gap-2 text-[14px] font-semibold hover:underline"
      >
        {t(message('Mở cơ hội', 'Open opportunity', '영업 기회 열기'))}
        <Icon icon={ArrowRight} size={16} />
      </Link>
    </section>
  )
}
