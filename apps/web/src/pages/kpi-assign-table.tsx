import { Link } from 'react-router-dom'
import { Avatar, Badge, GlassCard, cn } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  kpiAssignmentDeadline,
  type KpiAssignmentChild,
  type KpiAssignmentPageResponse,
  type KpiAssignmentSum,
  type KpiMetricDef,
  type KpiMetricKey,
} from '@pv/contracts'
import type { ApiError } from '@/app/api'
import { StackTable, type StackColumn } from '@/components/stack-table'
import { dm } from '@/lib/date'
import { NOTE } from './home-tiles'
import { FailLine } from './kpi-allocate-parts'
import { ValueCell } from './kpi-allocate-teams'
import {
  PERSON_STATE_LABEL,
  UNIT_STATE_LABEL,
  additiveOf,
  assignHref,
  childId,
  keyOfChild,
  sumWord,
  type Fields,
} from './kpi-assign-model'
import { printValue } from './kpi-model'

/** The right card of the assignment page: one row per child unit (its head
 *  under the name) and per direct member, one field per additive metric, the
 *  row's state last; under it, each additive metric's sum against what was
 *  received. A unit's name opens that unit's own page. Sits on `.glass-b` (law 8). */

/* On a card a field takes the full width, so the box is wide enough to type in. */
const columnsOf = (defs: readonly KpiMetricDef[], editable: boolean): StackColumn[] => [
  { header: 'Giao cho', width: 'minmax(200px,1.4fr)' },
  ...defs.map((def) => ({
    header: KPI_METRIC_LABEL[def.key],
    width: 'minmax(168px,1fr)',
    align: 'right' as const,
    stack: editable ? ('wide' as const) : undefined,
  })),
  { header: 'Trạng thái', width: 'minmax(140px,0.8fr)', align: 'right' as const },
]

function WhoCell({
  child,
  period,
  role,
}: {
  child: KpiAssignmentChild
  period: string
  role: KpiAssignmentPageResponse['role']
}) {
  if (child.kind === 'person') {
    return (
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={child.person.name} size="sm" />
        <span className="truncate font-semibold">{child.person.name}</span>
      </span>
    )
  }
  const { unit } = child
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <Link
        to={assignHref(period, role, unit.id)}
        className="pointer-coarse:min-h-12 inline-flex min-w-0 items-center font-semibold hover:underline focus-visible:underline"
      >
        <span className="truncate">{unit.name}</span>
      </Link>
      <span className={NOTE}>{unit.head?.name ?? 'Chưa có trưởng đơn vị'}</span>
    </span>
  )
}

function StateCell({ child, period }: { child: KpiAssignmentChild; period: string }) {
  if (child.kind === 'person') {
    const label = PERSON_STATE_LABEL[child.state]
    return <Badge tone={label.tone}>{label.text}</Badge>
  }
  const label = UNIT_STATE_LABEL[child.state]
  const due =
    child.state === 'not-sent' ? ` · hạn ${dm(kpiAssignmentDeadline(period, child.unit.kind))}` : ''
  return <Badge tone={label.tone}>{`${label.text}${due}`}</Badge>
}

function SumLine({
  def,
  sum,
  refused,
}: {
  def: KpiMetricDef
  sum: KpiAssignmentSum
  /** Named by a refused send: the sum is short of what was received. */
  refused: boolean
}) {
  const word = sumWord(def, sum)
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-[12.5px] font-semibold">{KPI_METRIC_LABEL[def.key]}</span>
      <span className="tnum font-num text-[12.5px]">
        {printValue(def.unit, sum.assigned, true)} / {printValue(def.unit, sum.received, true)}
      </span>
      <Badge tone={refused ? 'danger' : word.tone}>{word.text}</Badge>
    </li>
  )
}

export function ChildrenTable({
  page,
  defs,
  editable,
  fields,
  saved,
  sums,
  refused,
  errors,
  onEdit,
}: {
  page: KpiAssignmentPageResponse
  defs: readonly KpiMetricDef[]
  editable: boolean
  fields: Fields
  saved: ReadonlyMap<string, number>
  sums: readonly KpiAssignmentSum[]
  refused: readonly KpiMetricKey[]
  errors: readonly (ApiError | null)[]
  onEdit: (key: string, text: string) => void
}) {
  const additive = additiveOf(defs)
  const cell = (child: KpiAssignmentChild, def: KpiMetricDef) => {
    const key = keyOfChild(child, def.key)
    const text = fields.textOf(key, def)
    const name = child.kind === 'unit' ? child.unit.name : child.person.name
    return (
      <ValueCell
        key={def.key}
        def={def}
        label={`${KPI_METRIC_LABEL[def.key]} giao ${name}`}
        editable={editable}
        text={text}
        saved={saved.get(key) ?? null}
        last={null}
        onChange={(t) => onEdit(key, t)}
      />
    )
  }

  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 self-start py-4">
      {page.children.length === 0 ? (
        <p className={cn(NOTE, 'px-5')}>Không có đơn vị hay người nào giữ vai trò này.</p>
      ) : (
        <StackTable
          from="lg"
          flush
          rowHeight="min-h-16 py-2"
          tableClassName={additive.length > 2 ? 'min-w-4xl' : 'min-w-2xl'}
          columns={columnsOf(additive, editable)}
          rows={page.children.map((child) => ({
            id: `${child.kind}|${childId(child)}`,
            cells: [
              <WhoCell key="who" child={child} period={page.period} role={page.role} />,
              ...additive.map((def) => cell(child, def)),
              <StateCell key="state" child={child} period={page.period} />,
            ],
          }))}
        />
      )}
      {sums.length > 0 && (
        <section aria-label="Tổng giao so với mức nhận" className="flex flex-col gap-3 px-5">
          <h3 className="text-muted-foreground text-[12px] font-semibold leading-4">
            Tổng giao / mức nhận
          </h3>
          <ul className="flex flex-col gap-2">
            {sums.flatMap((sum) => {
              const def = additive.find((d) => d.key === sum.metricKey)
              return def
                ? [
                    <SumLine
                      key={def.key}
                      def={def}
                      sum={sum}
                      refused={refused.includes(def.key)}
                    />,
                  ]
                : []
            })}
          </ul>
        </section>
      )}
      {errors.some(Boolean) && (
        <div className="flex flex-col gap-1 px-5">
          {errors.map((error, i) => (
            <FailLine key={i} error={error} />
          ))}
        </div>
      )}
    </GlassCard>
  )
}
