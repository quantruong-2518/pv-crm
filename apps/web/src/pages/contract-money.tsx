import { Badge, Chip, ClipboardList, GlassCard, Icon, cn } from '@pv/ui'
import { daysUntil, type DueLevel } from '@pv/engines'
import { message, useI18n } from '@/app/i18n'
import { dm, dmy } from '@/lib/date'
import { dueLevelText, daysUntilText } from '@/data/contract-copy'
import { standingText } from '@/data/installment-copy'
import { opportunityStatusLabel } from '@/data/sales-labels-i18n'
import {
  standingOf,
  today,
  type Contract,
  type Installment,
  type InstallmentCondition,
  type InstallmentView,
} from '@/data/contracts'
import { BADGE_INK } from '@/data/opportunities'
import { useContractKindLabel } from '@/data/sales-config'
import { TintBadge } from '@/components/deal-money/tint-badge'
import { NO_AMOUNT_COPY, compactMoney, kindLabel } from '@/components/deal-money/money'

/** The contract's money block, drawn like the deal's (`PaperDetail`): one well
 *  with the paper's heading, then the installments as tiles that open level 2.
 *  Same tile, same badge, same acceptance line — the two screens read as one.
 *
 *  Ended for good (ADR 0107), an unpaid tile drops its due badge and its late
 *  line: nothing is owed, so nothing is late. */

const LABEL = 'text-muted-foreground text-[12px] font-medium'

const LEVEL_TONE: Record<DueLevel, 'success' | 'draft' | 'warning' | 'danger'> = {
  done: 'success',
  upcoming: 'draft',
  'due-soon': 'warning',
  due: 'warning',
  overdue: 'danger',
  'long-overdue': 'danger',
}

const late = (level: DueLevel) => level === 'overdue' || level === 'long-overdue'

/** The condition that holds the tile up, else the first open one, else the first. */
function acceptanceOf(view: InstallmentView<Installment>): InstallmentCondition | undefined {
  const { conditions } = view.installment
  return view.blocking ?? conditions.find((c) => !c.doneAt) ?? conditions[0]
}

export function ContractMoney({
  contract: c,
  views,
  ended,
  onOpen,
}: {
  contract: Contract
  views: InstallmentView<Installment>[]
  ended: boolean
  onOpen: (no: number) => void
}) {
  const { t, lang } = useI18n()
  const resolveKind = useContractKindLabel()
  const collected = c.installments.filter((d) => d.paidAt).reduce((n, d) => n + d.amount, 0)
  const standing = standingOf(
    views.map((v) => ({ overdue: late(v.level), paid: Boolean(v.installment.paidAt) })),
  )

  return (
    <GlassCard
      variant="b"
      className="flex min-w-0 flex-col p-5 sm:p-6"
      aria-label={t(message('Hợp đồng', 'Contract', '계약'))}
    >
      <div className="bg-surface-ink/5 flex min-w-0 flex-col gap-6 rounded-lg p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="font-display m-0 text-[20px] font-semibold">
            {kindLabel(c.kind, resolveKind)}
          </h2>
          <Chip>{c.code}</Chip>
          {!ended && <Badge tone={standing.tone}>{standingText(standing.tone, lang)}</Badge>}
          <span className="text-muted-foreground tnum text-[12px]">
            {t(
              message(
                `Ký ${dmy(c.signedAt)}`,
                `Signed ${dmy(c.signedAt)}`,
                `서명 ${dmy(c.signedAt)}`,
              ),
            )}
          </span>
          <span className="tnum font-num ml-auto text-[20px] font-semibold">
            {c.amount === null ? t(NO_AMOUNT_COPY) : compactMoney(c.amount, c.currency)}
          </span>
        </div>

        <section
          className="flex min-w-0 flex-col gap-3"
          aria-label={t(message('Lịch thanh toán', 'Payment schedule', '납부 일정'))}
        >
          <span className={LABEL}>
            {t(
              message(
                'Lịch thanh toán · đã thu',
                'Payment schedule · collected',
                '납부 일정 · 수금',
              ),
            )}{' '}
            {compactMoney(collected, c.currency)}
            {c.amount !== null && ` / ${compactMoney(c.amount, c.currency)}`}
          </span>
          {views.length === 0 ? (
            <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
              {t(
                message(
                  'Chưa có lịch thanh toán',
                  'No payment schedule yet',
                  '납부 일정이 없습니다',
                ),
              )}
            </p>
          ) : (
            <div
              role="group"
              aria-label={t(message('Các đợt thanh toán', 'Installments', '납부 회차'))}
              className="-m-1 grid snap-x auto-cols-[max(176px,calc((100%-24px)/3))] grid-flow-col gap-3 overflow-x-auto p-1"
            >
              {views.map((v) => (
                <InstallmentTile
                  key={v.installment.no}
                  view={v}
                  currency={c.currency}
                  dropped={ended && !v.installment.paidAt}
                  onOpen={() => onOpen(v.installment.no)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </GlassCard>
  )
}

function InstallmentTile({
  view,
  currency,
  dropped,
  onOpen,
}: {
  view: InstallmentView<Installment>
  currency: Contract['currency']
  dropped: boolean
  onOpen: () => void
}) {
  const { t, lang } = useI18n()
  const { installment: d, level } = view
  const line = acceptanceOf(view)
  const lineLate = Boolean(line && !line.doneAt && !dropped && daysUntil(line.due, today()) < 0)
  const overdue = !dropped && late(level)

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'motion-std focus-visible:outline-ring shadow-control flex min-h-[148px] snap-start flex-col items-start gap-2 rounded-lg p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2',
        overdue
          ? 'bg-destructive/14 hover:bg-destructive/22 stone:hover:bg-destructive/14'
          : 'bg-surface-ink/9 hover:bg-surface-ink/14 stone:hover:bg-surface-ink/9',
      )}
    >
      <span className="flex w-full items-baseline gap-2">
        <span className="text-[13px] font-semibold">{d.label}</span>
        <span className="text-muted-foreground tnum ml-auto text-[12px]">{d.share}%</span>
      </span>
      <span className="tnum font-num text-[20px] font-semibold leading-[1.3]">
        {compactMoney(d.amount, currency)}
      </span>
      <span className="text-muted-foreground tnum text-[12px]">
        {t(message(`hạn ${dm(d.due)}`, `due ${dm(d.due)}`, `기한 ${dm(d.due)}`))}
      </span>
      <TintBadge
        tone={dropped ? 'draft' : LEVEL_TONE[level]}
        className={cn((dropped || level === 'upcoming') && BADGE_INK)}
      >
        {dropped
          ? opportunityStatusLabel('terminated', lang)
          : d.paidAt
            ? `${dueLevelText('done', lang)} ${dmy(d.paidAt)}`
            : `${dueLevelText(level, lang)} · ${daysUntilText(view.daysLeft, lang)}`}
      </TintBadge>
      {line && (
        <span
          className={cn(
            'mt-auto flex items-center gap-2 text-[12px] leading-[1.5]',
            line.doneAt
              ? 'text-on-tint-success'
              : lineLate
                ? 'text-on-tint-destructive'
                : 'text-on-tint-warning',
          )}
        >
          <Icon icon={ClipboardList} size={14} className="shrink-0" />
          {line.what}
        </span>
      )}
    </button>
  )
}
