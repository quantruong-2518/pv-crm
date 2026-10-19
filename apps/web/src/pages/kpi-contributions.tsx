import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Accordion,
  DataTable,
  GlassCard,
  SectionTitle,
  cn,
  type TableColumn,
  type TableRowModel,
} from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  type KpiContributionKind,
  type KpiContributionsResponse,
  type KpiMetricDef,
  type KpiPersonContributions,
  type RoleId,
} from '@pv/contracts'
import { isApiError } from '@/app/api'
import { useCan } from '@/app/auth'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { contributionHref, kpiContributionsQuery } from '@/data/kpi-contributions'
import { ROLE_LABEL } from '@/data/users'
import { dmy } from '@/lib/date'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import { DASH, FROZEN_NOTE, printCell } from './kpi-model'
import { QueryBlock } from './kpi-parts'

/** The records each KPI figure of one person counted — shared by the person
 *  screen and the reader's own screen (ADR 0099 §5).
 *
 *  Grouped by (role, metric) in the effective catalog's order; a group whose
 *  metric is no longer in force is dropped, as on every card. Only the
 *  primary metric opens by default. The heading counts records; the figure
 *  itself is on the card above, and nothing here adds the records up. */

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
  const n = num(group.items.length)
  return group.truncated ? `Hơn ${n} bản ghi` : `${n} bản ghi`
}

/** Which kinds the reader may open; the route gate would refuse the rest anyway. */
function useOpenable(): Record<KpiContributionKind, boolean> {
  const lead = useCan('lead.view')
  const opportunity = useCan('opportunity.view')
  const contract = useCan('contract.view')
  return { lead, opportunity, contract, installment: contract, meeting: false }
}

const COLUMNS: TableColumn[] = [
  { header: 'Bản ghi', width: 'minmax(0,1fr)' },
  { header: 'Nội dung', width: 'minmax(0,1.4fr)' },
  { header: 'Ngày', width: 'minmax(0,.8fr)' },
]
const VALUE_COLUMN: TableColumn = { header: 'Giá trị', width: 'minmax(0,1fr)', align: 'right' }

const FIGURE = 'tnum font-num'

function GroupBody({
  entry: { def, group },
  openTo,
}: {
  entry: Group
  /** The open action for a record, or undefined where it opens nothing. */
  openTo: (kind: KpiContributionKind, code: string) => (() => void) | undefined
}) {
  if (group.items.length === 0) {
    return <p className="py-2 text-[12.5px] leading-5">Chưa có bản ghi nào tính vào chỉ số này.</p>
  }
  const valued = group.items.some((i) => i.value !== null)
  const rows: TableRowModel[] = group.items.map((item, i) => {
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
      <span key="label">{item.label}</span>,
      <span key="at" className={FIGURE}>
        {item.at ? dmy(item.at) : DASH}
      </span>,
    ]
    if (valued) {
      cells.push(
        <span key="value" className={FIGURE}>
          {printCell(def.unit, item.value)}
        </span>,
      )
    }
    return { id: `${item.kind}/${item.code}/${i}`, cells, onOpen }
  })
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <DataTable
          rowHeight="min-h-12 py-2"
          className="min-w-md"
          columns={valued ? [...COLUMNS, VALUE_COLUMN] : COLUMNS}
          rows={rows}
        />
      </div>
      {group.truncated && (
        <p className={cn(NOTE, FIGURE)}>Chỉ hiện {num(group.items.length)} bản ghi mới nhất.</p>
      )}
    </div>
  )
}

function Blocks({
  blocks,
  openTo,
}: {
  blocks: RoleBlock[]
  openTo: (kind: KpiContributionKind, code: string) => (() => void) | undefined
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
                <GroupBody entry={entry} openTo={openTo} />
              </Accordion>
            ))}
          </GlassCard>
        </div>
      ))}
    </div>
  )
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
            <>
              {data.frozen && <p className={NOTE}>{FROZEN_NOTE}</p>}
              <Blocks blocks={blocksOf(catalog, data)} openTo={openTo} />
            </>
          )}
        </QueryBlock>
      )}
    </section>
  )
}
