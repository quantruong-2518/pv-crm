import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Button, GlassCard, cn, percent } from '@pv/ui'
import type { KpiCompanyDeskResponse, KpiLeaderboardRow } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { kpiMetricText, kpiRoleText, kpiVerdictText } from '@/data/kpi-i18n'
import { NOTE, TILE } from './home-tiles'
import { tickAt, tickWord } from './kpi-company-i18n'
import { axisMax, defOfKey, onAxis, shareOfPrimary, toneOf } from './kpi-company-model'
import { NAME_LINK } from './kpi-company-forecast'
import { DASH, personHref, printShort } from './kpi-model'
import { Meter } from './kpi-unit-meter'

/** Two comparisons drawn from `GET …/company/desk`: each unit against its own
 *  primary target, and each person against theirs (ADR 0160 §10). Sharing a
 *  percent of one's own target is what makes Marketing and Sale comparable.
 *  The tick is pace while the month runs; the verdict is the server's. */

const FIGURE = 'tnum font-num'
const ROW = 'grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_6rem]'
const PAGE = 10

function Legend({ period, pace }: { period: string; pace: number }) {
  const tick = tickWord(period, pace)
  return tick ? (
    <span className={cn(NOTE, 'inline-flex items-center gap-2')}>
      <span aria-hidden className="bg-foreground h-3 w-0.5 rounded-sm" />
      {tick}
    </span>
  ) : null
}

export function CompareCard({
  period,
  pace,
  units,
}: {
  period: string
  pace: number
  units: KpiCompanyDeskResponse['units']
}) {
  const { t } = useI18n()
  const rows = units
    .flatMap((u) => {
      const share = u.primary ? shareOfPrimary(u.primary) : null
      return u.primary && share !== null ? [{ u, primary: u.primary, share }] : []
    })
    .sort((a, b) => b.share - a.share)
  if (rows.length === 0) return null
  const tick = tickAt(period, pace)
  const axis = axisMax(
    rows.map((r) => r.share),
    tick ?? 0,
  )
  return (
    <GlassCard className={cn(TILE, 'gap-4')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-display text-[14px] font-semibold">
            {t(
              message(
                'So sánh đơn vị · % hoàn thành chỉ số chính',
                'Units compared · % of the main metric done',
                '조직 비교 · 핵심 지표 달성률',
              ),
            )}
          </h3>
          <p className={NOTE}>
            {t(
              message(
                'Mỗi đơn vị so với chỉ tiêu của chính mình, nên Marketing và các nhóm Sale đặt cạnh nhau được.',
                'Each unit against its own target, so Marketing and the Sale teams can sit side by side.',
                '각 조직을 자체 목표와 비교하므로 마케팅과 영업 팀을 나란히 볼 수 있습니다.',
              ),
            )}
          </p>
        </div>
        <Legend period={period} pace={pace} />
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map(({ u, primary, share }) => {
          const def = defOfKey(period, primary.key)
          return (
            <li key={u.unitId} className={ROW}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">{u.name}</span>
                <span className={cn(NOTE, FIGURE)}>
                  {kpiMetricText(primary.key)}
                  {def &&
                    ` · ${printShort(def.unit, primary.value)} / ${printShort(def.unit, primary.target)}`}
                </span>
              </span>
              <Meter
                size="lg"
                fill={onAxis(share, axis)}
                mark={tick === null ? null : onAxis(tick, axis)}
                tone={toneOf(primary.verdict)}
              />
              <span className="flex flex-col sm:items-end">
                <span className={cn(FIGURE, 'font-semibold')}>{percent(share)}</span>
                <span className={NOTE}>{kpiVerdictText(primary.verdict)}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </GlassCard>
  )
}

function Leader({
  row,
  rank,
  period,
  axis,
  tick,
}: {
  row: KpiLeaderboardRow
  rank: number
  period: string
  axis: number
  tick: number | null
}) {
  const def = defOfKey(period, row.primary.key)
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[1.5rem_minmax(0,1.3fr)_minmax(0,2fr)_6rem]">
      <span className={cn(FIGURE, 'text-muted-foreground text-[13px] font-semibold')}>{rank}</span>
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={row.name} size="sm" />
        <span className="flex min-w-0 flex-col items-start">
          <Link to={personHref(row.actorId, period)} className={NAME_LINK}>
            {row.name}
          </Link>
          <span className={NOTE}>
            {[row.unitName, kpiRoleText(row.role)].filter(Boolean).join(' · ')}
          </span>
        </span>
      </span>
      <span className="col-span-2 sm:col-span-1">
        {row.percent !== null && (
          <Meter
            size="lg"
            fill={onAxis(row.percent, axis)}
            mark={tick === null ? null : onAxis(tick, axis)}
            tone={toneOf(row.primary.verdict)}
          />
        )}
      </span>
      <span className="col-span-2 flex flex-col sm:col-span-1 sm:items-end">
        <span className={cn(FIGURE, 'font-semibold')}>
          {row.percent === null ? DASH : percent(row.percent)}
        </span>
        <span className={cn(NOTE, FIGURE)}>
          {def
            ? `${printShort(def.unit, row.primary.value)} / ${printShort(def.unit, row.primary.target)}`
            : DASH}
        </span>
      </span>
    </li>
  )
}

export function LeaderboardCard({
  period,
  pace,
  rows,
}: {
  period: string
  pace: number
  rows: readonly KpiLeaderboardRow[]
}) {
  const { t } = useI18n()
  const [all, setAll] = useState(false)
  if (rows.length === 0) return null
  const tick = tickAt(period, pace)
  const axis = axisMax(
    rows.map((r) => r.percent),
    tick ?? 0,
  )
  const shown = all ? rows : rows.slice(0, PAGE)
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2 px-5">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-display text-[14px] font-semibold">
            {t(message('Thành viên dẫn đầu', 'Top members', '상위 구성원'))}
          </h3>
          <p className={NOTE}>
            {t(
              message(
                'Xếp theo % chỉ tiêu tháng của chỉ số chính từng người, nên so được giữa Sale, BD và Marketing.',
                'Ranked by each person’s share of their own monthly target, so Sale, BD and Marketing compare.',
                '각자 핵심 지표의 월 목표 달성률 순으로, 영업·BD·마케팅을 비교할 수 있습니다.',
              ),
            )}
          </p>
        </div>
        <Legend period={period} pace={pace} />
      </div>
      <ul className="flex flex-col gap-3 px-5">
        {shown.map((row, i) => (
          <Leader
            key={row.actorId}
            row={row}
            rank={i + 1}
            period={period}
            axis={axis}
            tick={tick}
          />
        ))}
      </ul>
      {rows.length > PAGE && (
        <Button
          variant="ghost"
          className="pointer-coarse:h-12 mx-5 self-start"
          onClick={() => setAll(!all)}
        >
          {all
            ? t(message('Chỉ hiện đầu bảng', 'Show the top only', '상위만 보기'))
            : t(
                message(
                  `Xem cả ${rows.length} người`,
                  `Show all ${rows.length} people`,
                  `${rows.length}명 모두 보기`,
                ),
              )}
        </Button>
      )}
    </GlassCard>
  )
}
