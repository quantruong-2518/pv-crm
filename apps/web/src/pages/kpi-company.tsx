import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AppShell,
  ArrowRight,
  Button,
  ClipboardList,
  GlassCard,
  Icon,
  ScreenHeader,
  ScreenLayout,
  SectionTitle,
  cn,
} from '@pv/ui'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { kpiCompanyQuery, kpiPeopleQuery, kpiTargetsQuery } from '@/data/kpi'
import { kpiAllocationsQuery } from '@/data/kpi-allocation'
import { kpiCatalogQuery, withCatalog } from '@/data/kpi-catalog'
import { kpiForecastQuery } from '@/data/kpi-forecast'
import { keyOf, num } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { TARGETS_PATH, monthQuery } from './kpi-allocate-model'
import { KpiForecastBlock } from './kpi-company-forecast'
import { AttentionBlock, PeopleHeatmap } from './kpi-company-people'
import { RolesBlock } from './kpi-company-roles'
import { MonthCloseBar } from './kpi-month-close'
import { dayOfMonth, monthPick } from './kpi-model'
import { CompanyStrip, MonthPicker, QueryBlock } from './kpi-parts'
import { queueOf } from './kpi-targets-model'

/** The company KPI screen, read live from `/sales/kpi/:period/…`. No fixture
 *  and no scenario.
 *
 *  Figures before words: the room's strip, who is about to miss or hit, the
 *  roles, what needs handling, every person as a heat map, then the door to
 *  the targets desk — the targets themselves live there, not twice.
 *  The route asks for `performance.view` only, so each block that needs more
 *  is gated on its own permission and a block the reader may not open is
 *  dropped and named, never drawn as a failure.
 *
 *  No ContextRail (law 10 debt, as on the overview): a scorecard is a sum over
 *  many records and opens no single object a chain could be anchored on. */

/** The door to `/sales/kpi/targets`, counting with the desk's own `queueOf`
 *  so the two screens never disagree; until both reads land it shows no count. */
function TargetsDoor({
  period,
  waiting,
  onMe,
}: {
  period: string
  waiting: number | undefined
  /** The reader may approve: the count is what waits on them. */
  onMe: boolean
}) {
  const navigate = useNavigate()
  const whom = onMe ? 'chờ bạn duyệt' : 'chờ duyệt'
  return (
    <GlassCard className={cn(TILE, 'sm:flex-row sm:items-center')}>
      <Icon icon={ClipboardList} size={20} className="text-accent-foreground shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-[13px] font-semibold leading-5">Đặt chỉ tiêu và duyệt</h2>
        {waiting !== undefined && (
          <p className={cn(NOTE, 'tnum font-num')}>
            {waiting > 0 ? `${num(waiting)} mục ${whom}.` : `Không có mục nào ${whom}.`}
          </p>
        )}
      </div>
      <Button
        variant="secondary"
        className="pointer-coarse:h-12 shrink-0 self-start sm:self-center"
        onClick={() => navigate(`${TARGETS_PATH}${monthQuery(period)}`)}
      >
        Mở bảng chỉ tiêu
        <Icon icon={ArrowRight} size={16} />
      </Button>
    </GlassCard>
  )
}

export function KpiCompanyPage() {
  const chrome = useAppChrome()
  const canTargets = useCan('kpi.view')
  const canAll = useCan('kpi.view-all')
  const canSet = useCan('kpi.set-target')
  const me = useSession((s) => s.actor?.id)

  const [pick, setPick] = useState(monthPick)
  const period = keyOf(pick)
  const day = dayOfMonth(period)

  const catalog = useQuery(kpiCatalogQuery)
  const company = useQuery(kpiCompanyQuery(period))
  const targets = useQuery({ ...kpiTargetsQuery(period), enabled: canAll && canTargets })
  const people = useQuery({ ...kpiPeopleQuery(period), enabled: canAll })
  const forecast = useQuery({ ...kpiForecastQuery(period), enabled: canAll })
  const allocations = useQuery({ ...kpiAllocationsQuery(period), enabled: canAll })
  /* Nobody holds a KPI role: the role table says so once; an empty
     exceptions block would read as an all-clear. */
  const nobody = people.data?.people.length === 0
  const onMe = canSet && targets.data?.closed === false
  const waiting =
    targets.data && allocations.data && catalog.data
      ? queueOf(
          catalog.data,
          targets.data.roles,
          allocations.data.allocations,
          onMe ? me : undefined,
        ).length
      : undefined

  const hidden = canAll
    ? []
    : ['dự báo cuối tháng', 'KPI theo vai trò', 'mục cần xử lý', 'chi tiết từng người']

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="KPI công ty"
          description={day && <span className="tnum font-num">{day}</span>}
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />

        <MonthCloseBar period={period} monthClose={company.data?.monthClose} />

        <section className="flex flex-col gap-3">
          <SectionTitle size="lg">Chỉ số phòng Kinh doanh</SectionTitle>
          <QueryBlock query={withCatalog(company, catalog)} what="chỉ số phòng Kinh doanh">
            {([data, defs]) => (
              <CompanyStrip
                catalog={defs}
                role={data.scorecard.role}
                readings={data.scorecard.readings}
              />
            )}
          </QueryBlock>
        </section>

        {canAll && (
          <>
            <section className="flex flex-col gap-3">
              <SectionTitle size="lg">Dự báo cuối tháng</SectionTitle>
              <QueryBlock
                query={withCatalog(forecast, catalog)}
                what="dự báo cuối tháng"
                variant="b"
              >
                {([data, defs]) => <KpiForecastBlock catalog={defs} data={data} />}
              </QueryBlock>
            </section>

            <section className="flex flex-col gap-3">
              <SectionTitle size="lg">Theo vai trò</SectionTitle>
              <QueryBlock query={withCatalog(people, catalog)} what="KPI theo vai trò" variant="b">
                {([data, defs]) => (
                  <RolesBlock catalog={defs} people={data.people} room={company.data?.scorecard} />
                )}
              </QueryBlock>
            </section>

            {!nobody && (
              <section className="flex flex-col gap-3">
                <SectionTitle size="lg">Cần xử lý</SectionTitle>
                <QueryBlock
                  query={withCatalog(people, catalog)}
                  what="danh sách cần xử lý"
                  variant="b"
                  quiet
                >
                  {([data, defs]) => (
                    <AttentionBlock catalog={defs} people={data.people} period={data.period} />
                  )}
                </QueryBlock>
              </section>
            )}

            {!nobody && (
              <section className="flex flex-col gap-3">
                <SectionTitle size="lg">Chi tiết từng người</SectionTitle>
                <QueryBlock
                  query={withCatalog(people, catalog)}
                  what="KPI từng người"
                  variant="b"
                  quiet
                >
                  {([data, defs]) => (
                    <PeopleHeatmap catalog={defs} people={data.people} period={data.period} />
                  )}
                </QueryBlock>
              </section>
            )}

            <TargetsDoor period={period} waiting={waiting} onMe={onMe} />
          </>
        )}

        {hidden.length > 0 && <p className={NOTE}>Bạn không có quyền xem: {hidden.join(' · ')}.</p>}
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiCompanyPage
