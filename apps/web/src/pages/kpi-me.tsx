import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell, Button, GlassCard, ScreenHeader, ScreenLayout, SectionTitle, cn } from '@pv/ui'
import type { KpiForecastResponse, KpiScorecard } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { toastDone, toastFail } from '@/app/toast'
import { kpiMeQuery, useAcknowledgeKpi } from '@/data/kpi'
import { kpiAllocationsQuery } from '@/data/kpi-allocation'
import { kpiCatalogQuery, withCatalog, type KpiCatalog } from '@/data/kpi-catalog'
import { flagsOf } from '@/data/kpi-forecast'
import { answerable, kpiForecastMeQuery, myPackages } from '@/data/kpi-personal'
import { ROLE_LABEL } from '@/data/users'
import { keyOf } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { ContributionsPanel } from './kpi-contributions'
import { DESCRIPTION, acknowledgementOf, monthPick, needsAcknowledgement } from './kpi-model'
import {
  ForecastFlags,
  NewTargetsCard,
  PersonalBoard,
  SideFailure,
  ThresholdNote,
} from './kpi-me-parts'
import { MonthPicker, QueryBlock } from './kpi-parts'

/** The personal KPI screen — what the reader is short of, per role they hold,
 *  read live from `GET /sales/kpi/:period/me`, with the ADR 0098 reads beside
 *  it: new allocation lines to answer, slip / hit flags, the weekly chart.
 *  No fixture and no scenario; every figure and every verdict is the server's.
 *
 *  The two side reads never block the board: their failure is one line. A
 *  role with a package is received through the receipt screen, which records
 *  both books; the role-target button is for a role without one, and shows
 *  only while an agreed target is unreceived or changed, never on a closed month.
 *
 *  No ContextRail (law 10 debt, as on the overview): a scorecard is a sum over
 *  many records and opens no single object a chain could be anchored on. */

function RoleBoard({
  catalog,
  period,
  closed,
  card,
  allocated,
  forecast,
}: {
  catalog: KpiCatalog
  period: string
  closed: boolean
  card: KpiScorecard
  /** The reader holds lines of a package for this role. */
  allocated: boolean
  forecast: KpiForecastResponse | undefined
}) {
  const acknowledge = useAcknowledgeKpi(period, card.role)
  const ack = acknowledgementOf(card)

  return (
    <section className="flex flex-col gap-4">
      {/* The button is a sibling, not `actions`: below `sm` it takes its own row. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <SectionTitle
          size="lg"
          hint={allocated ? undefined : <span className="tnum font-num">{ack.text}</span>}
        >
          {ROLE_LABEL[card.role]}
        </SectionTitle>
        {!closed && !allocated && needsAcknowledgement(ack) && (
          <Button
            className="pointer-coarse:h-12 shrink-0 self-start"
            disabled={acknowledge.isPending}
            onClick={() =>
              acknowledge.mutate(undefined, {
                onSuccess: () => toastDone('Đã nhận chỉ tiêu'),
                onError: (e) => toastFail(userMessage(e)),
              })
            }
          >
            Xác nhận đã nhận chỉ tiêu
          </Button>
        )}
      </div>
      {/* A closed month projects its own value: a flag there would warn about nothing. */}
      {!closed && forecast && (
        <ForecastFlags catalog={catalog} role={card.role} forecast={forecast} />
      )}
      <PersonalBoard catalog={catalog} period={period} role={card.role} readings={card.readings} />
    </section>
  )
}

export function KpiMePage() {
  const chrome = useAppChrome()
  const [pick, setPick] = useState(monthPick)
  const period = keyOf(pick)
  const me = useQuery(kpiMeQuery(period))
  const catalog = useQuery(kpiCatalogQuery)
  const allocations = useQuery(kpiAllocationsQuery(period))
  const forecast = useQuery(kpiForecastMeQuery(period))
  const actorId = useSession((s) => s.actor?.id)

  const packs =
    allocations.data && catalog.data ? myPackages(catalog.data, allocations.data, actorId) : []
  const pending = packs
    .filter(answerable)
    .flatMap((p) => p.lines)
    .filter((l) => l.ackState === 'pending').length
  const allocatedRoles = new Set(packs.map((p) => p.role))
  const seen = forecast.data

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="KPI của tôi"
          description={DESCRIPTION}
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />

        <QueryBlock query={withCatalog(me, catalog)} what="KPI của bạn">
          {([data, defs]) => {
            /* Flags are not drawn on a closed month, so neither is their legend. */
            const legend =
              !data.closed &&
              seen &&
              data.scorecards.some((c) => flagsOf(defs, c.role, seen).length > 0)
            return (
              <>
                {data.closed && (
                  <p className={NOTE}>Tháng đã kết thúc, chỉ tiêu không đổi được nữa.</p>
                )}
                {!data.closed && pending > 0 && (
                  <NewTargetsCard period={period} pending={pending} />
                )}
                {allocations.error && (
                  <SideFailure what="chỉ tiêu mới giao" retry={() => void allocations.refetch()} />
                )}
                {forecast.error && (
                  <SideFailure
                    what="cảnh báo sắp trượt, sắp đạt"
                    retry={() => void forecast.refetch()}
                  />
                )}
                {legend && seen && <ThresholdNote thresholds={seen.thresholds} />}
                {data.scorecards.length === 0 && (
                  <GlassCard className={cn(TILE, 'text-[12.5px]')}>
                    Bạn chưa được giao chỉ tiêu KPI nào.
                  </GlassCard>
                )}
                {data.scorecards.map((card) => (
                  <RoleBoard
                    key={card.role}
                    catalog={defs}
                    period={data.period}
                    closed={data.closed}
                    card={card}
                    allocated={allocatedRoles.has(card.role)}
                    forecast={forecast.data}
                  />
                ))}
                {actorId && data.scorecards.length > 0 && (
                  <ContributionsPanel catalog={defs} period={data.period} actorId={actorId} />
                )}
              </>
            )
          }}
        </QueryBlock>
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiMePage
