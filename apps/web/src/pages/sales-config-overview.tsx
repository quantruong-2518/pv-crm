import { Button, GlassCard } from '@pv/ui'
import { message, useI18n, type Message } from '@/app/i18n'
import { useQuery } from '@tanstack/react-query'
import type { ConfigBundle, MotionPolicy } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { kpiAlertQuery, kpiRoleMetricsQuery } from '@/data/kpi-config'
import { kpiTeamRosterQuery } from '@/data/kpi-team-roster'
import { orgTreeQuery } from '@/data/org-tree'
import { activityFreshnessQuery, ladderRows, recareCyclesQuery } from '@/data/sales-config'
import { salesMotionsQuery } from '@/data/sales-motions'
import { FRAME_STATES, stepFrameQuery, templatesAt } from '@/data/step-frame'
import { keyOf } from './home-model'
import { monthPick } from './kpi-model'
import { CONFIG_AREAS, type AreaKey, type SectionId } from './sales-config-model'
import { isBeforeTree } from './sales-config-org-model'
import { areaCopy, sectionCopy } from './sales-config-copy'
import {
  NONE_YET,
  freshnessLine,
  industriesLine,
  itemsCount,
  kpiAlertLine,
  labelsCount,
  metricsOffLine,
  motionsActiveLine,
  motionsDeclaredLine,
  orgUnitsLine,
  questionsCount,
  reasonsCount,
  recareLine,
  stepFrameLine,
  teamsThisMonth,
  tierLimitsLine,
  typesCount,
} from './sales-config-overview-copy'

/** Printed for a value that is still loading or failed to read: a zero there
 *  would be a statement about the configuration that nobody has checked. */
const UNREAD = '—'

/** Only the field section 5.9 shows; the other three are hidden (ADR 0093 §5). */
const isDeclared = (m: MotionPolicy) => m.firstTouchMinutes !== null

/** What each section currently holds, in one line. Every figure is counted
 *  from a read the section itself makes; `undefined` is "not read". */
function useSectionValues(catalog: ConfigBundle): Record<SectionId, string | undefined> {
  const { t, number } = useI18n()
  const { data: freshness } = useQuery(activityFreshnessQuery)
  const { data: recare } = useQuery(recareCyclesQuery)
  const { data: motions } = useQuery(salesMotionsQuery())
  const { data: frame } = useQuery(stepFrameQuery)
  const { data: kpiMetrics } = useQuery(kpiRoleMetricsQuery)
  const { data: kpiAlert } = useQuery(kpiAlertQuery)
  const { data: roster } = useQuery(kpiTeamRosterQuery(keyOf(monthPick())))
  const { data: org } = useQuery(orgTreeQuery(keyOf(monthPick())))
  /* Only a view-all holder is sent the whole tree; anyone else would count their own path. */
  const seeAll = useCan('kpi.view-all')
  const orgCount = (kind: 'department' | 'team') =>
    org?.units.filter((u) => u.kind === kind).length ?? 0
  /* Distinct metrics and roles, not cells: one metric off in two roles is one metric. */
  const offIn = kpiMetrics?.roles.filter((r) => r.metrics.some((m) => !m.enabled))
  const offKeys = new Set(
    offIn?.flatMap((r) => r.metrics.filter((m) => !m.enabled).map((m) => m.metricKey)),
  )

  const tiers = ladderRows(catalog, 'TIER')
  const states = Object.values(FRAME_STATES).flat()

  const orNone = (n: number, line: (n: number) => Message) => t(n === 0 ? NONE_YET : line(n))

  return {
    'step-frame':
      frame &&
      t(
        stepFrameLine(
          number(states.length),
          number(
            states.flatMap((at) => templatesAt(frame, at)).filter((step) => step.active).length,
          ),
        ),
      ),
    'tier-limits': orNone(tiers.length, (total) =>
      tierLimitsLine(tiers.filter((tier) => tier.limitDays !== null).length, total),
    ),
    motions:
      motions && t(motionsActiveLine(motions.filter((m) => m.active).length, motions.length)),
    'motion-policy':
      motions && t(motionsDeclaredLine(motions.filter(isDeclared).length, motions.length)),
    industries: t(
      industriesLine(
        catalog.CATEGORY.filter((c) => c.active).length,
        catalog.INDUSTRY.filter((i) => i.active).length,
      ),
    ),
    'stop-reasons': t(reasonsCount(catalog.EXIT_REASON.length)),
    'waiting-labels': orNone(catalog.WAITING_LABEL.length, labelsCount),
    'comm-criteria': t(questionsCount(catalog.COMM_CRITERION.length)),
    'step-kinds': orNone(catalog.STEP_KIND.length, typesCount),
    'recare-cycles': recare && t(recareLine(recare)),
    freshness: freshness && t(freshnessLine(freshness)),
    'care-reasons': t(reasonsCount(catalog.LOSS_REASON.length)),
    'quote-reasons': orNone(catalog.QUOTE_REVISION_REASON.length, reasonsCount),
    products: orNone(catalog.PRODUCT.length, itemsCount),
    'contract-kinds': orNone(catalog.CONTRACT_KIND.length, typesCount),
    'kpi-metrics':
      offIn &&
      (offIn.length === 0
        ? t(message('Đang tính đủ', 'All metrics enabled', '모든 지표 사용 중'))
        : t(metricsOffLine(offKeys.size, offIn.length))),
    'kpi-alert': kpiAlert && t(kpiAlertLine(kpiAlert)),
    /* A month before the org tree still reads the old team roster (ADR 0118 §7).
       Without view-all both reads hold only the reader's own path, so no count. */
    'kpi-teams': !seeAll
      ? undefined
      : org && !isBeforeTree(org)
        ? t(orgUnitsLine(number(orgCount('department')), number(orgCount('team'))))
        : roster && orNone(roster.teams.length, teamsThisMonth),
  }
}

/** The landing view: every area as a card, every section as a row carrying its
 *  current value, so the whole configuration reads on one screen before any
 *  area is opened. A row opens its area AND lands on its section. */
export function ConfigOverview({
  catalog,
  onOpen,
}: {
  catalog: ConfigBundle
  onOpen: (area: AreaKey, section?: SectionId) => void
}) {
  const { t } = useI18n()
  const values = useSectionValues(catalog)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {CONFIG_AREAS.map((a) => (
        <GlassCard key={a.key} className="flex flex-col gap-3 p-5 lg:p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold">
              {a.step !== null && (
                <span className="text-muted-foreground tnum font-num">{a.step}</span>
              )}
              {t(areaCopy(a.key))}
            </h2>
            <Button variant="ghost" className="pointer-coarse:h-12" onClick={() => onOpen(a.key)}>
              {t(message('Mở', 'Open', '열기'))}
            </Button>
          </div>
          <ul className="flex flex-col gap-1">
            {a.sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onOpen(a.key, s.id)}
                  className="motion-std bg-surface-ink/5 hover:bg-surface-ink/8 flex min-h-12 w-full items-center justify-between gap-4 rounded-sm px-3 py-2 text-left text-[12px]"
                >
                  {t(sectionCopy(s.id))}
                  <span className="text-muted-foreground tnum font-num whitespace-nowrap">
                    {values[s.id] ?? UNREAD}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </GlassCard>
      ))}
    </div>
  )
}
