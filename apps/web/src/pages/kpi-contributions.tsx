import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Accordion, GlassCard, Icon, SectionTitle, cn } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  type KpiContribution,
  type KpiContributionKind,
  type KpiContributionsResponse,
  type KpiMetricDef,
  type KpiPersonContributions,
  type RoleId,
} from '@pv/contracts'
import { isApiError } from '@/app/api'
import { useCan } from '@/app/auth'
import { StackTable, type StackColumn, type StackRow } from '@/components/stack-table'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { contributionHref, kpiContributionsQuery } from '@/data/kpi-contributions'
import { ROLE_LABEL } from '@/data/users'
import { dmy } from '@/lib/date'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import {
  ADJUSTMENT_ICON,
  adjustmentSentence,
  DASH,
  FROZEN_NOTE,
  printCell,
  printSigned,
} from './kpi-model'
import { QueryBlock } from './kpi-parts'

/** The records each KPI figure of one person counted — shared by the person
 *  screen and the reader's own screen (ADR 0099 §5).
 *
 *  Grouped by (role, metric) in the effective catalog's order; a group whose
 *  metric is no longer in force is dropped, as on every card. Only the
 *  primary metric opens by default. The heading counts records; the figure
 *  itself is on the card above, and nothing here adds the records up.
 *  A row carrying a closed month's change is marked and signed (ADR 0115). */

type Group = { def: KpiMetricDef; group: KpiPersonContributions }
type RoleBlock = { role: RoleId; groups: Group[] }

function blocksOf(catalog: KpiCatalog, data: KpiContributionsResponse): RoleBlock[] {
  const roles = [...new Set(data.groups.map((g) => g.role))]
  return roles.flatMap((role) => {
    const groups = catalog[role].flatMap((def) => {
      const group = data.groups.find((g) => g.role === role && g.metricKey === def.key)
      return group ? [{ def, group }] : []
    })
    return groups.length > 0 ? [{ role, groups }] : []
  })
}

function summaryOf({ group }: Group): string {
  const adjusted = group.items.filter((i) => i.adjustment !== null).length
  const n = num(group.items.length - adjusted)
  const records = group.truncated ? `Hơn ${n} bản ghi` : `${n} bản ghi`
  return adjusted > 0 ? `${records} · ${num(adjusted)} điều chỉnh` : records
}

/** Which kinds the reader may open; the route gate would refuse the rest anyway. */
function useOpenable(): Record<KpiContributionKind, boolean> {
  const lead = useCan('lead.view')
  const opportunity = useCan('opportunity.view')
  const contract = useCan('contract.view')
  return { lead, opportunity, contract, installment: contract, meeting: false }
}

const COLUMNS: StackColumn[] = [
  { header: 'Bản ghi', width: 'minmax(0,1fr)' },
  { header: 'Nội dung', width: 'minmax(0,1.4fr)' },
  { header: 'Ngày', width: 'minmax(0,.8fr)' },
]
const VALUE_COLUMN: StackColumn = { header: 'Giá trị', width: 'minmax(0,1fr)', align: 'right' }

const FIGURE = 'tnum font-num'

/** What the record says, or for an adjustment the mark and what happened to it. */
function ContentCell({ item }: { item: KpiContribution }) {
  if (item.adjustment === null) return <span>{item.label}</span>
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <span className="inline-flex items-center gap-1 font-semibold">
        <Icon icon={ADJUSTMENT_ICON} size={14} className="shrink-0" />
        Điều chỉnh
      </span>
      <span className={cn(NOTE, FIGURE)}>{adjustmentSentence(item.kind, item.adjustment)}</span>
    </span>
  )
}

type OpenTo = (kind: KpiContributionKind, code: string) => (() => void) | undefined

function rowsOf(
  items: readonly KpiContribution[],
  def: KpiMetricDef,
  valued: boolean,
  openTo: OpenTo,
): StackRow[] {
  return items.map((item, i) => {
    const onOpen = openTo(item.kind, item.code)
    /* A meeting's code is a bare id: it names nothing a reader could look up. */
    const code =
      item.kind === 'meeting' ? (
        <span key="code">Buổi họp</span>
      ) : (
        <span
          key="code"
          className={cn('font-mono text-[11.5px]', onOpen && 'text-accent-foreground')}
        >
          {item.code}
        </span>
      )
    const cells = [
      code,
      <ContentCell key="label" item={item} />,
      <span key="at" className={FIGURE}>
        {item.at ? dmy(item.at) : DASH}
      </span>,
    ]
    if (valued) {
      cells.push(
        <span key="value" className={cn(FIGURE, item.adjustment && 'font-semibold')}>
          {item.adjustment && item.value !== null
            ? printSigned(def.unit, item.value)
            : printCell(def.unit, item.value)}
        </span>,
      )
    }
    return { id: `${item.kind}/${item.code}/${i}`, cells, onOpen }
  })
}

/** In a closed month, adjustments sourced from it are outside its frozen figure
 *  (ADR 0115 §4): they sit apart, so the rows above add up to that figure. */
function GroupBody({
  entry: { def, group },
  period,
  openTo,
}: {
  entry: Group
  period: string
  /** The open action for a record, or undefined where it opens nothing. */
  openTo: OpenTo
}) {
  if (group.items.length === 0) {
    return <p className="py-2 text-[12.5px] leading-5">Chưa có bản ghi nào tính vào chỉ số này.</p>
  }
  const after = group.items.filter((i) => i.adjustment?.sourcePeriod === period)
  const inside = group.items.filter((i) => i.adjustment?.sourcePeriod !== period)
  const records = group.items.filter((i) => i.adjustment === null).length
  const valued = group.items.some((i) => i.value !== null)
  const table = (items: readonly KpiContribution[]) => (
    <StackTable
      from="md"
      rowHeight="min-h-12 py-2"
      tableClassName="min-w-md"
      columns={valued ? [...COLUMNS, VALUE_COLUMN] : COLUMNS}
      rows={rowsOf(items, def, valued, openTo)}
    />
  )
  return (
    <div className="flex flex-col gap-2">
      {inside.length > 0 && table(inside)}
      {group.truncated && (
        <p className={cn(NOTE, FIGURE)}>Chỉ hiện {num(records)} bản ghi mới nhất.</p>
      )}
      {after.length > 0 && (
        <>
          <p className="m-0 pt-2 text-[12.5px] font-semibold leading-5">Sau điều chỉnh</p>
          {table(after)}
        </>
      )}
    </div>
  )
}

function Blocks({
  blocks,
  period,
  openTo,
}: {
  blocks: RoleBlock[]
  period: string
  openTo: OpenTo
}) {
  if (blocks.length === 0) {
    return <p className="text-[12.5px] leading-5">Chưa có bản ghi nào tính vào chỉ số.</p>
  }
  const titled = blocks.length > 1
  return (
    <div className="flex flex-col gap-4">
      {blocks.map(({ role, groups }) => (
        <div key={role} className="flex flex-col gap-2">
          {titled && <SectionTitle size="md">{ROLE_LABEL[role]}</SectionTitle>}
          <GlassCard variant="b" className="flex flex-col px-4 py-2">
            {groups.map((entry) => (
              <Accordion
                key={entry.def.key}
                title={KPI_METRIC_LABEL[entry.def.key]}
                summary={summaryOf(entry)}
                defaultOpen={entry.def.primary}
              >
                <GroupBody entry={entry} period={period} openTo={openTo} />
              </Accordion>
            ))}
          </GlassCard>
        </div>
      ))}
    </div>
  )
}

/** The frozen-copy note, once per screen: the contributions read says whether
 *  this month's lists and weekly series come from the copy frozen at close. */
export function FrozenNote({ period, actorId }: { period: string; actorId: string }) {
  const query = useQuery(kpiContributionsQuery(period, actorId))
  return query.data?.frozen ? <p className={NOTE}>{FROZEN_NOTE}</p> : null
}

export function ContributionsPanel({
  catalog,
  period,
  actorId,
}: {
  catalog: KpiCatalog
  period: string
  actorId: string
}) {
  const query = useQuery(kpiContributionsQuery(period, actorId))
  const navigate = useNavigate()
  const openable = useOpenable()
  const denied = isApiError(query.error) && query.error.kind === 'forbidden'

  const openTo = (kind: KpiContributionKind, code: string) => {
    const href = openable[kind] ? contributionHref(kind, code) : null
    return href ? () => navigate(href) : undefined
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle size="lg">Bản ghi tính vào chỉ số</SectionTitle>
      {denied ? (
        <p className="text-[12.5px] leading-5">Bạn không có quyền xem các bản ghi này.</p>
      ) : (
        <QueryBlock query={query} what="bản ghi tính vào chỉ số" variant="b">
          {(data) => (
            <Blocks blocks={blocksOf(catalog, data)} period={data.period} openTo={openTo} />
          )}
        </QueryBlock>
      )}
    </section>
  )
}
