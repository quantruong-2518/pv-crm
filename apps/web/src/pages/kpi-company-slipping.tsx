import { Link } from 'react-router-dom'
import { Badge, GlassCard, cn } from '@pv/ui'
import type { KpiCompanyDeskResponse } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { kpiRoleText } from '@/data/kpi-i18n'
import { num } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { NAME_LINK } from './kpi-company-forecast'
import { tickAt } from './kpi-company-i18n'
import { defOfKey, onAxis, toneOf } from './kpi-company-model'
import { personHref, printShort } from './kpi-model'
import { Meter } from './kpi-unit-meter'

/** People behind on their primary metric, widest gap first (ADR 0159 §5). The
 *  gap row carries no metric key, so the unit and the bar come from the same
 *  person's leaderboard row; without one the gap is printed as money, as before. */

const FIGURE = 'tnum font-num'

export function SlippingCard({
  period,
  pace,
  desk,
}: {
  period: string
  pace: number
  desk: KpiCompanyDeskResponse
}) {
  const { t } = useI18n()
  const { slipping, leaderboard } = desk
  if (slipping.length === 0) return null
  const tick = tickAt(period, pace)
  return (
    <GlassCard variant="b" className={cn(TILE, 'gap-4')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[14px] font-semibold">
          {t(message('Người đang trượt', 'People slipping', '미달 인원'))}
        </h3>
        <Badge tone="danger">
          {t(
            message(
              `${num(slipping.length)} người`,
              `${num(slipping.length)} people`,
              `${num(slipping.length)}명`,
            ),
          )}
        </Badge>
      </div>
      <p className={NOTE}>
        {t(
          message(
            'Chỉ người chậm nhịp ở chỉ số chính, xếp theo phần thiếu.',
            'Only people behind pace on the main metric, widest gap first.',
            '핵심 지표가 지연된 사람만, 부족분이 큰 순서로 표시합니다.',
          ),
        )}
      </p>
      <ul className="flex flex-col gap-4">
        {slipping.map((s) => {
          const lead = leaderboard.find((l) => l.actorId === s.actorId)
          const def = lead ? defOfKey(period, lead.primary.key) : undefined
          const unit = def?.unit ?? 'money'
          return (
            <li key={s.actorId} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <Link to={personHref(s.actorId, period)} className={NAME_LINK}>
                    {s.name}
                  </Link>
                  <span className={NOTE}>
                    {[s.unitName, lead && kpiRoleText(lead.role)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className={cn(FIGURE, 'text-destructive-foreground font-semibold')}>
                  {`−${printShort(unit, s.gap)}`}
                </span>
              </div>
              {lead?.percent !== null && lead?.percent !== undefined && (
                <Meter
                  fill={onAxis(lead.percent, 1)}
                  mark={tick}
                  tone={toneOf(lead.primary.verdict)}
                />
              )}
              {lead && def && (
                <span className={cn(NOTE, FIGURE)}>
                  {`${printShort(def.unit, lead.primary.value)} / ${printShort(def.unit, lead.primary.target)}`}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </GlassCard>
  )
}
