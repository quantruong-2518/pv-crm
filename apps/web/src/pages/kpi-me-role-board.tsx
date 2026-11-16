import { useQuery } from '@tanstack/react-query'
import type { KpiPeriodKey } from '@pv/contracts'
import { kpiCatalogFor, withCatalog } from '@/data/kpi-catalog'
import {
  kpiBdOriginsQuery,
  kpiFunnelQuery,
  kpiMarketingSourcesQuery,
  kpiPresalesCollectionQuery,
  kpiTrendQuery,
} from '@/data/kpi-board'
import { BdOriginsCard } from './kpi-me-role-bd'
import { BdOpportunities } from './kpi-me-role-bd-table'
import { FunnelCard } from './kpi-me-role-funnel'
import { BOARD_READ } from './kpi-me-role-i18n'
import { MarketingSourcesCard } from './kpi-me-role-marketing'
import type { BoardRole } from './kpi-me-role-model'
import { PresalesCollectionCard } from './kpi-me-role-presales'
import { RatesCard } from './kpi-me-role-rates'
import { TrendCard } from './kpi-me-role-trend'
import { QueryBlock } from './kpi-parts'

/** The Marketing, BD and Presales sections of the "mine" tab (ADR 0160 §8–9), drawn under
 *  the hero and score card: funnel, rates, six-month trend and the role's own card.
 *
 *  Metric rows come from the catalog of the month asked for, so an old month keeps
 *  the set it was read under; a part the month has no figures for draws nothing.
 *  Each part loads and fails on its own. */

const GRID = 'grid grid-cols-1 gap-4 xl:grid-cols-2'

function MarketingPart({ period, actorId }: { period: KpiPeriodKey; actorId: string }) {
  const read = useQuery(kpiMarketingSourcesQuery(period, actorId))
  return (
    <QueryBlock query={read} what={BOARD_READ.sources} variant="b">
      {(data) => <MarketingSourcesCard period={period} data={data} />}
    </QueryBlock>
  )
}

function BdPart({ period, actorId }: { period: KpiPeriodKey; actorId: string }) {
  const read = useQuery(kpiBdOriginsQuery(period, actorId))
  return (
    <QueryBlock query={read} what={BOARD_READ.origins}>
      {(data) => <BdOriginsCard period={period} data={data} />}
    </QueryBlock>
  )
}

function PresalesPart({ period, actorId }: { period: KpiPeriodKey; actorId: string }) {
  const read = useQuery(kpiPresalesCollectionQuery(period, actorId))
  return (
    <QueryBlock query={read} what={BOARD_READ.collection} variant="b">
      {(data) => <PresalesCollectionCard data={data} />}
    </QueryBlock>
  )
}

export function KpiMeRoleBoard({
  period,
  actorId,
  role,
}: {
  period: KpiPeriodKey
  actorId: string
  role: BoardRole
}) {
  const funnel = useQuery(kpiFunnelQuery(period, actorId, role))
  const trend = useQuery(kpiTrendQuery(period, actorId, role))
  const catalog = useQuery(kpiCatalogFor(period))
  const shaped = withCatalog(trend, catalog)
  return (
    <div className="flex flex-col gap-4">
      <div className={GRID}>
        <QueryBlock query={funnel} what={BOARD_READ.funnel}>
          {(data) => <FunnelCard role={role} steps={data.steps} />}
        </QueryBlock>
        <QueryBlock query={shaped} what={BOARD_READ.rates}>
          {([data, cat]) => <RatesCard defs={cat[role]} trend={data} />}
        </QueryBlock>
      </div>
      <div className={GRID}>
        <QueryBlock query={shaped} what={BOARD_READ.trend} quiet>
          {([data, cat]) => <TrendCard period={period} defs={cat[role]} trend={data} />}
        </QueryBlock>
        {role === 'marketing' && <MarketingPart period={period} actorId={actorId} />}
        {role === 'bd' && <BdPart period={period} actorId={actorId} />}
        {role === 'presales' && <PresalesPart period={period} actorId={actorId} />}
      </div>
      {role === 'bd' && <BdOpportunities period={period} actorId={actorId} />}
    </div>
  )
}
