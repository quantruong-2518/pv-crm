import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { AppShell, GlassCard, ScreenHeader, ScreenLayout, Select } from '@pv/ui'
import { isTieredPeriod, stepSalesPeriod, type KpiDeskResponse } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { message, useI18n } from '@/app/i18n'
import { KpiTabs } from '@/components/kpi-tabs'
import { kpiCatalogFor, withCatalog, type KpiCatalog } from '@/data/kpi-catalog'
import { kpiDeskQuery } from '@/data/kpi-desk'
import { kpiUnitForecastQuery } from '@/data/kpi-forecast-commit'
import { dmy } from '@/lib/date'
import { ME_PATH, MONTH_PARAM } from '@/lib/kpi-paths'
import { keyOf } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { useMonthParam } from './kpi-model'
import { MonthPicker, QueryBlock } from './kpi-parts'
import { ForecastCard } from './kpi-unit-forecast'
import { OneOnOneCard } from './kpi-unit-oneonone'
import { MarketingBudgetCard } from './kpi-unit-budget'
import { MembersCard, UnitTotals } from './kpi-unit-parts'
import { useAssignMonthToSend } from './kpi-unit-model'
import { TodoStrip } from './kpi-unit-todo'

/** The "my unit" tab — `/sales/kpi/unit?month=&unit=` (ADR 0159 §1–2, §4, §6–8).
 *  One read, `GET /sales/kpi/:period/desk`, fills the totals, the members and
 *  the 1:1 counts; the weekly forecast has its own read and its own error.
 *
 *  A seat of `above` reads the unit and acts on nothing: the unit's own head does.
 *
 *  No ContextRail (law 10 debt, as on the overview): a scorecard is a sum over
 *  many records and opens no single object a chain could be anchored on. */

const UNIT_PARAM = 'unit'

function SeatLine({ seat }: { seat: KpiDeskResponse['units'][number] }) {
  const { t } = useI18n()
  if (seat.seat === 'holder') return null
  const who = seat.forName ?? ''
  const until = seat.until ? ` ${t(message('tới', 'until', '까지'))} ${dmy(seat.until)}` : ''
  return (
    <p className={NOTE}>
      {seat.seat === 'stand-in'
        ? t(
            message(
              `Bạn đang thay ${who}${until}. Việc của ${who} trong đơn vị này hiện ở đây.`,
              `You are standing in for ${who}${until}. ${who}’s work in this unit is here for now.`,
              `${who}님을 대신하고 있습니다${until}. 이 조직의 ${who}님 업무가 여기에 표시됩니다.`,
            ),
          )
        : t(
            message(
              `Bạn xem đơn vị này từ cấp trên. ${who || 'Người đứng đầu đơn vị'} tự xử lý việc ở đây.`,
              `You view this unit from above. ${who || 'Its own head'} acts on what is here.`,
              `상위에서 이 조직을 보고 있습니다. ${who ? `${who}님이` : '조직장이'} 직접 처리합니다.`,
            ),
          )}
    </p>
  )
}

function UnitBody({
  desk,
  catalog,
  period,
}: {
  desk: KpiDeskResponse
  catalog: KpiCatalog
  period: string
}) {
  const { t } = useI18n()
  const [, setParams] = useSearchParams()
  const view = desk.unit
  const seat = desk.units.find((u) => u.unitId === view?.unitId) ?? desk.units[0]
  const acts = seat !== undefined && seat.seat !== 'above'
  const tiered = isTieredPeriod(period)
  const forecast = useQuery({
    ...kpiUnitForecastQuery(period, view?.unitId ?? ''),
    enabled: tiered && view !== null,
  })
  const assignMonth = useAssignMonthToSend(view?.unitId ?? '', catalog, acts && view !== null)
  const oneMonth = stepSalesPeriod(period, -1)

  if (!view || !seat) {
    return (
      <GlassCard className={TILE}>
        <p className="text-[12.5px] leading-5">
          {t(
            message(
              'Tháng này bạn không phụ trách đơn vị nào.',
              'You hold no unit this month.',
              '이번 달에는 담당 조직이 없습니다.',
            ),
          )}{' '}
          <Link
            to={`${ME_PATH}?${MONTH_PARAM}=${period}`}
            className="pointer-coarse:min-h-12 inline-flex items-center underline underline-offset-2"
          >
            {t(message('Mở KPI của tôi', 'Open my KPIs', '내 KPI 열기'))}
          </Link>
        </p>
      </GlassCard>
    )
  }

  return (
    <>
      {desk.units.length > 1 && (
        <Select
          label={t(message('Đơn vị', 'Unit', '조직'))}
          size="lg"
          value={seat.unitId}
          options={desk.units.map((u) => ({ value: u.unitId, label: u.name }))}
          onChange={(unit) =>
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                next.set(UNIT_PARAM, unit)
                return next
              },
              { replace: true },
            )
          }
        />
      )}
      <SeatLine seat={seat} />
      {acts && (
        <TodoStrip
          period={period}
          view={view}
          members={view.members}
          forecast={forecast.data}
          assignMonth={assignMonth}
          oneMonth={oneMonth}
        />
      )}
      <UnitTotals
        catalog={catalog}
        primary={view.primary}
        coverage={view.coverage}
        coverageLow={view.coverageLow}
        accuracy={view.lastAccuracy}
      />
      {view.members.some((m) => m.role === 'marketing') && (
        <MarketingBudgetCard period={period} unitId={view.unitId} />
      )}
      <MembersCard catalog={catalog} members={view.members} period={period} scoreOf={oneMonth} />
      {tiered && <ForecastCard query={forecast} period={period} unitId={view.unitId} />}
      {view.oneOnOnes && (
        <OneOnOneCard counts={view.oneOnOnes} members={view.members} month={oneMonth} />
      )}
    </>
  )
}

export function KpiUnitPage() {
  const { t } = useI18n()
  const chrome = useAppChrome()
  const [pick, setPick] = useMonthParam()
  const [params] = useSearchParams()
  const period = keyOf(pick)
  const unit = params.get(UNIT_PARAM) ?? undefined
  const desk = useQuery(kpiDeskQuery(period, unit))
  const catalog = useQuery(kpiCatalogFor(period))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title={t(message('Đơn vị của tôi', 'My unit', '내 조직'))}
          description={desk.data?.units.find((u) => u.unitId === desk.data?.unit?.unitId)?.name}
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />
        <KpiTabs period={period} active="unit" />
        <QueryBlock
          query={withCatalog(desk, catalog)}
          what={message('KPI của đơn vị', 'the unit’s KPIs', '조직 KPI')}
        >
          {([data, defs]) => <UnitBody desk={data} catalog={defs} period={period} />}
        </QueryBlock>
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiUnitPage
