import { useQuery } from '@tanstack/react-query'
import { Button, GlassCard, Kanban, Skeleton, Users, cn, percent, type IconGlyph } from '@pv/ui'
import {
  LEAD_ACTIVE_STATES,
  LEAD_STATE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  StageKey,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { DEFAULT_LEAD_BOOK_QUERY } from '@/app/url'
import { leadFacetsQuery } from '@/data/leads'
import {
  DEFAULT_OPPORTUNITY_BOOK_QUERY,
  facetsQueryOf,
  opportunityFacetQuery,
} from '@/data/opportunities'
import { FIGURE, InsightCell, SUB } from './home-funnel'
import { fullestOf, leadStateHref, num, openStageHref } from './home-model'

/** The lead step and the pipeline column holding the most items right now, each
 *  a link to the list it counts. A snapshot of the books, not a period figure,
 *  so it stands outside the funnel (which the week grain replaces) and shows at
 *  every grain. Each cell is gated on its own permission. */

type Fullest = { count: number; share: number; name: string; to: string }

/** One cell. `top` is undefined until read, null when every count is zero. */
function FullestCell({
  icon,
  title,
  tint,
  unit,
  whole,
  empty,
  top,
  failed,
  onRetry,
}: {
  icon: IconGlyph
  title: string
  tint: string
  unit: string
  /** The words that follow the share, naming the whole it is a share of. */
  whole: string
  empty: string
  top: Fullest | null | undefined
  failed: boolean
  onRetry: () => void
}) {
  /* Data wins over an error: a failed background refetch keeps the last good figures. */
  if (top === undefined) {
    return (
      <InsightCell icon={icon} title={title} tint={tint}>
        {failed ? (
          <div className="flex flex-col items-start gap-2">
            <span className={SUB}>Không tải được.</span>
            <Button variant="ghost" size="sm" className="pointer-coarse:h-12" onClick={onRetry}>
              Thử lại
            </Button>
          </div>
        ) : (
          <>
            <Skeleton height={32} width="60%" />
            <Skeleton />
            <Skeleton height={16} width="40%" />
          </>
        )}
      </InsightCell>
    )
  }
  return (
    <InsightCell icon={icon} title={title} tint={tint} to={top?.to}>
      {top && (
        <span className="text-foreground text-[14px] font-semibold leading-5">{top.name}</span>
      )}
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={cn(FIGURE, 'text-foreground')}>
          {top ? `${num(top.count)} ${unit}` : '—'}
        </span>
        {top && (
          <span className={cn(SUB, 'tnum font-num')}>
            · {percent(top.share)} {whole}
          </span>
        )}
      </div>
      {!top && <span className={SUB}>{empty}</span>}
    </InsightCell>
  )
}

/** Counts come from the lead book's own facets, so the number equals the list it opens. */
function FullestLeads() {
  const can = useCan('lead.view')
  const read = useQuery({ ...leadFacetsQuery(DEFAULT_LEAD_BOOK_QUERY), enabled: can })
  if (!can) return null
  const found = read.data && fullestOf(LEAD_ACTIVE_STATES, (s) => read.data.byState[s])
  const top =
    found === undefined
      ? undefined
      : found && {
          ...found,
          name: LEAD_STATE_LABEL[found.key],
          to: leadStateHref(found.key),
        }
  return (
    <FullestCell
      icon={Users}
      title="Bước có nhiều lead nhất"
      tint="from-warning/20 to-warning/5 text-on-tint-warning"
      unit="lead"
      whole="số lead đang hoạt động"
      empty="Chưa có lead đang hoạt động."
      top={top}
      failed={read.isError}
      onRetry={() => void read.refetch()}
    />
  )
}

/** Counts come from the opportunity book's own facets (`byStage`), so the number
 *  equals the `state=open&stage=` list it opens, for every scope. */
function FullestDeals() {
  const can = useCan('opportunity.view')
  const read = useQuery({
    ...opportunityFacetQuery(facetsQueryOf(DEFAULT_OPPORTUNITY_BOOK_QUERY)),
    enabled: can,
  })
  if (!can) return null
  const found = read.data && fullestOf(StageKey.options, (s) => read.data.byStage[s])
  const top =
    found === undefined
      ? undefined
      : found && {
          ...found,
          name: OPPORTUNITY_STAGE_LABEL[found.key],
          to: openStageHref(found.key),
        }
  return (
    <FullestCell
      icon={Kanban}
      title="Bước có nhiều cơ hội nhất"
      tint="from-primary/20 to-primary/5 text-on-tint-primary"
      unit="cơ hội"
      whole="số cơ hội đang mở"
      empty="Chưa có cơ hội đang mở."
      top={top}
      failed={read.isError}
      onRetry={() => void read.refetch()}
    />
  )
}

/* No hover lift on the card: only a linked cell moves, so the lift means "press me". */
export function FullestTile({ className }: { className?: string }) {
  return (
    <GlassCard
      className={cn(
        'starting:translate-y-3 starting:opacity-0 flex min-w-0 flex-col gap-5 rounded-3xl p-6 transition-[opacity,translate] duration-500 ease-out motion-reduce:transition-none',
        className,
      )}
    >
      <h3 className="text-[16px] font-semibold leading-6">Lead và cơ hội đang dồn ở đâu</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3">
        <FullestLeads />
        <FullestDeals />
      </div>
    </GlassCard>
  )
}
