import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, GlassCard, Icon, Skeleton, cn, percent } from '@pv/ui'
import type { KpiCompanyDeskResponse } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { KpiCardError } from '@/components/kpi-tabs'
import { NOTE, TILE } from './home-tiles'
import { printShort, printTile } from './kpi-model'
import { StackBar, Swatch } from './kpi-unit-meter'

/** Two small blocks of the company tab: the heads' committed forecast and a plain link. */

const SIGNED = 'bg-primary'
const FORECAST = 'bg-primary/35'
const MISSING = 'bg-surface-ink/20'

/** The committed figure is the whole month's forecast, signed money included, so
 *  "forecast on top" is the commit minus what is already signed. */
function CommittedStack({
  signed,
  target,
  amount,
}: {
  signed: number
  target: number
  amount: number
}) {
  const { t } = useI18n()
  if (target <= 0) return null
  const more = Math.max(amount - signed, 0)
  const missing = Math.max(target - Math.max(amount, signed), 0)
  const whole = Math.max(target, signed + more)
  const parts = [
    {
      share: signed / whole,
      tone: SIGNED,
      text: t(message('Đã ký', 'Signed', '계약 체결')),
      value: signed,
    },
    {
      share: more / whole,
      tone: FORECAST,
      text: t(message('Dự báo thêm', 'Forecast on top', '추가 예상')),
      value: more,
    },
    {
      share: missing / whole,
      tone: MISSING,
      text: t(message('Còn thiếu', 'Still missing', '부족분')),
      value: missing,
    },
  ]
  return (
    <div className="flex flex-col gap-2">
      <StackBar segments={parts} />
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <li key={p.text} className={cn(NOTE, 'tnum font-num inline-flex items-center gap-2')}>
            <Swatch tone={p.tone} />
            {`${p.text} ${printShort('money', p.value)}`}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** What the heads committed this week, and how right last month's forecast was.
 *  `signed` and `target` come from the company's signed-value reading, which
 *  only a `kpi.view-all` reader holds; without them the figure stands alone. */
export function CommittedTile({
  desk,
  signed = null,
  target = null,
}: {
  desk: UseQueryResult<KpiCompanyDeskResponse>
  signed?: number | null
  target?: number | null
}) {
  const { t } = useI18n()
  if (desk.isPending) return <Skeleton className="h-40 w-full" />
  if (desk.error) {
    return (
      <GlassCard className={TILE}>
        <KpiCardError error={desk.error} onRetry={() => void desk.refetch()} />
      </GlassCard>
    )
  }
  const committed = desk.data?.committed
  if (!committed) return null
  const accuracy = committed.accuracyLastMonth
  return (
    <GlassCard className={TILE}>
      <h3 className="text-[13px] font-semibold leading-5">
        {t(message('Dự báo đã chốt tuần này', 'Forecast committed this week', '이번 주 확정 예상'))}
      </h3>
      <div className="mt-auto flex flex-col gap-2">
        <span className="tnum font-num text-[34px] font-semibold leading-none tracking-[-1.2px]">
          {printTile('money', committed.amount)}
        </span>
        {signed !== null && target !== null && (
          <CommittedStack signed={signed} target={target} amount={committed.amount} />
        )}
        <span className={cn(NOTE, 'tnum font-num')}>
          {t(
            message(
              'Tổng số các trưởng đã chốt.',
              'Total the heads committed.',
              '책임자 확정 합계.',
            ),
          )}
          {accuracy !== null &&
            ` ${t(
              message(
                `Tháng trước dự báo đúng ${percent(accuracy)}.`,
                `Last month's forecast was ${percent(accuracy)} right.`,
                `지난달 예상 적중률 ${percent(accuracy)}.`,
              ),
            )}`}
        </span>
      </div>
    </GlassCard>
  )
}

export function LinkButton({ label, to }: { label: string; to: string }) {
  return (
    <Link
      to={to}
      className="text-accent-foreground pointer-coarse:min-h-12 inline-flex items-center gap-2 text-[13px] font-semibold underline underline-offset-2"
    >
      {label}
      <Icon icon={ArrowRight} size={16} />
    </Link>
  )
}

/** How many units have sent their targets for the month after: the company
 *  step's own count, drawn as one pip per unit. */
export function AssignTile({
  units,
  monthLabel,
  to,
}: {
  units: { sent: number; sentByDefault: number; notSent: number }
  monthLabel: string
  to: string
}) {
  const { t } = useI18n()
  const total = units.sent + units.sentByDefault + units.notSent
  if (total === 0) return null
  const done = units.sent + units.sentByDefault
  return (
    <GlassCard className={cn(TILE, 'gap-3')}>
      <span className={NOTE}>
        {t(
          message(
            `Tình trạng giao tháng ${monthLabel}`,
            `Assignment status, month ${monthLabel}`,
            `${monthLabel}월 배정 현황`,
          ),
        )}
      </span>
      <span className="tnum font-num text-[24px] font-semibold leading-none tracking-[-.6px]">
        {t(
          message(
            `${done} / ${total} đơn vị`,
            `${done} / ${total} units`,
            `${done} / ${total} 조직`,
          ),
        )}
      </span>
      <span aria-hidden className="flex flex-wrap gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'inline-block size-3 rounded-sm',
              i < done ? 'bg-primary' : 'bg-surface-ink/20',
            )}
          />
        ))}
      </span>
      <LinkButton
        label={t(message('Xem tình trạng giao', 'Open assignment status', '배정 현황 보기'))}
        to={to}
      />
    </GlassCard>
  )
}
