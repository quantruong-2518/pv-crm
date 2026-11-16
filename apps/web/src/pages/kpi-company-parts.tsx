import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, GlassCard, Icon, Skeleton, cn, percent } from '@pv/ui'
import type { KpiCompanyDeskResponse } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { KpiCardError } from '@/components/kpi-tabs'
import { NOTE, TILE } from './home-tiles'
import { printTile } from './kpi-model'

/** Two small blocks of the company tab: the heads' committed forecast and a plain link. */

/** What the heads committed this week, and how right last month's forecast was. */
export function CommittedTile({ desk }: { desk: UseQueryResult<KpiCompanyDeskResponse> }) {
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
