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
import { FIELD_EDGE, StackTable, type StackColumn } from '@/components/stack-table'
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
  lastReading,
  receivedWord,
  sumFigures,
  sumWord,
  type Fields,
} from './kpi-assign-model'

/** The right card of the assignment page: one row per child unit (its head
 *  under the name) and per direct member, one field per additive metric, the
 *  row's state last. The last row sums each column against what was received,
 *  so a sum stands under its own figures. A unit's name opens that unit's own
 *  page. Sits on `.glass-b` (law 8). */

const WHO_WIDTH = 200
const FIGURE_WIDTH = 168
const STATE_WIDTH = 140

/* Every track plus the row's `gap-3` and `px-5`: a rounder floor clipped the state column. */
const tableFloor = (metrics: number) =>
  WHO_WIDTH + FIGURE_WIDTH * metrics + STATE_WIDTH + 12 * (metrics + 1) + 40

/* The sum row's own weight: DataTable's row states all mean something else. */
const SUM_TEXT = 'text-[14px] font-bold leading-5'

/* On a card a field takes the full width, so the box is wide enough to type in. */
const columnsOf = (defs: readonly KpiMetricDef[], editable: boolean): StackColumn[] => [
  { header: 'Giao cho', width: `minmax(${WHO_WIDTH}px,1.4fr)` },
  ...defs.map((def) => ({
    header: KPI_METRIC_LABEL[def.key],
    width: `minmax(${FIGURE_WIDTH}px,1fr)`,
    align: 'right' as const,
    stack: editable ? ('wide' as const) : undefined,
  })),
  { header: 'Trạng thái', width: `minmax(${STATE_WIDTH}px,0.8fr)`, align: 'right' as const },
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
  return <Badge tone={label.tone} className="tnum font-num">{`${label.text}${due}`}</Badge>
}

function SumCell({
  page,
  def,
  sum,
  refused,
}: {
  page: KpiAssignmentPageResponse
  def: KpiMetricDef
  sum: KpiAssignmentSum
  /** Named by a refused send: the sum is short of what was received. */
  refused: boolean
}) {
  const word = sumWord(page, def, sum)
  return (
    <span className="flex min-w-0 flex-col items-end gap-1">
      <span className={cn('tnum font-num', SUM_TEXT)}>{sumFigures(def, sum)}</span>
      <Badge tone={refused ? 'danger' : word.tone} className="tnum font-num">
        {word.text}
      </Badge>
    </span>
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
  const word = receivedWord(page)
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
        {...lastReading(page.lastActualPeriod, child.lastActuals, def.key)}
        onChange={(t) => onEdit(key, t)}
      />
    )
  }
  const sumCell = (def: KpiMetricDef) => {
    const sum = sums.find((s) => s.metricKey === def.key)
    return sum ? (
      <SumCell key={def.key} page={page} def={def} sum={sum} refused={refused.includes(def.key)} />
    ) : null
  }
  /* The state cell is `null`, so a card prints no bare label for it. */
  const sumRows =
    sums.length > 0
      ? [
          {
            id: 'sum',
            span: true,
            cells: [
              <span key="who" className={SUM_TEXT}>
                Tổng giao / {word}
              </span>,
              ...additive.map(sumCell),
              null,
            ],
          },
        ]
      : []

  return (
    <GlassCard
      variant="b"
      className={cn('flex min-w-0 flex-col gap-4 self-start py-4', FIELD_EDGE)}
    >
      {page.children.length === 0 ? (
        <p className={cn(NOTE, 'px-5')}>Không có đơn vị hay người nào giữ vai trò này.</p>
      ) : (
        <StackTable
          from="lg"
          flush
          rowHeight="min-h-16 py-2"
          tableStyle={{ minWidth: tableFloor(additive.length) }}
          columns={columnsOf(additive, editable)}
          rows={[
            ...page.children.map((child) => ({
              id: `${child.kind}|${childId(child)}`,
              cells: [
                <WhoCell key="who" child={child} period={page.period} role={page.role} />,
                ...additive.map((def) => cell(child, def)),
                <StateCell key="state" child={child} period={page.period} />,
              ],
            })),
            ...sumRows,
          ]}
        />
      )}
      {editable && sums.some((s) => s.flag === 'below') && (
        <p className={cn(NOTE, 'px-5')}>Tổng giao phải đủ {word} mới gửi được.</p>
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
