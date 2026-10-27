import { GlassCard, cn } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  kpiMetricShare,
  type KpiAssignmentPageResponse,
  type KpiMetricDef,
} from '@pv/contracts'
import { NOTE } from './home-tiles'
import { ValueCell } from './kpi-allocate-teams'
import { KIND_WORD, cellKey, printTarget, type Fields } from './kpi-assign-model'
import { parseTyped } from './kpi-model'

/** The left card of the assignment page: what this unit received from the
 *  level above, read-only — the additive figures large, the copied ones as a
 *  list. At the company there is nothing above, so the card holds the company
 *  totals instead, typed by its head (ADR 0120 §4). */

const FIGURE = 'tnum font-num text-[20px] font-semibold leading-7'
const ROW = 'bg-surface-ink/5 flex min-h-12 items-center gap-3 rounded-lg px-4 py-2'
const SUBHEAD = 'text-muted-foreground text-[12px] font-semibold leading-4'

function Received({
  page,
  defs,
}: {
  page: KpiAssignmentPageResponse
  defs: readonly KpiMetricDef[]
}) {
  const word = KIND_WORD[page.unit.kind].toLowerCase()
  const of = (share: 'additive' | 'copied') =>
    page.received.flatMap((r) => {
      const def = defs.find((d) => d.key === r.metricKey)
      return def && r.share === share ? [{ def, value: r.value }] : []
    })
  const additive = of('additive')
  const copied = of('copied')

  if (page.received.length === 0) {
    return (
      <p className={NOTE}>
        {page.parentSent ? 'Chưa nhận chỉ tiêu nào.' : 'Cấp trên chưa giao chỉ tiêu.'}
      </p>
    )
  }
  return (
    <>
      {additive.map(({ def, value }) => (
        <div key={def.key} className="bg-surface-ink/5 flex flex-col gap-1 rounded-lg px-4 py-3">
          <span className="text-muted-foreground text-[12.5px]">{KPI_METRIC_LABEL[def.key]}</span>
          <span className={FIGURE}>{printTarget(def, value)}</span>
        </div>
      ))}
      {copied.length > 0 && (
        <>
          <h3 className={cn(SUBHEAD, 'mt-2')}>Áp chung cho cả {word}</h3>
          <ul className="flex flex-col gap-2">
            {copied.map(({ def, value }) => (
              <li key={def.key} className={ROW}>
                <span className="min-w-0 flex-1 text-[12.5px]">{KPI_METRIC_LABEL[def.key]}</span>
                <span className="tnum font-num text-[12.5px] font-semibold">
                  {printTarget(def, value)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

/** The company's own figure per metric: typed by its head, read by everyone else. */
function CompanyTotals({
  defs,
  editable,
  fields,
  onEdit,
}: {
  defs: readonly KpiMetricDef[]
  editable: boolean
  fields: Fields
  onEdit: (key: string, text: string) => void
}) {
  const row = (def: KpiMetricDef) => {
    const key = cellKey('total', '', def.key)
    const text = fields.textOf(key, def)
    const value = parseTyped(def.unit, text)
    return (
      <li key={def.key} className={ROW}>
        <span className="min-w-0 flex-1 text-[12.5px]">{KPI_METRIC_LABEL[def.key]}</span>
        <span className="w-40 shrink-0">
          <ValueCell
            def={def}
            label={KPI_METRIC_LABEL[def.key]}
            editable={editable}
            text={text}
            saved={typeof value === 'number' ? value : null}
            last={null}
            onChange={(t) => onEdit(key, t)}
          />
        </span>
      </li>
    )
  }
  const copied = defs.filter((d) => kpiMetricShare(d) === 'copied')
  const rest = defs.filter((d) => kpiMetricShare(d) !== 'copied')
  return (
    <>
      {rest.length > 0 && <ul className="flex flex-col gap-2">{rest.map(row)}</ul>}
      {copied.length > 0 && (
        <>
          <h3 className={cn(SUBHEAD, 'mt-2')}>Áp chung cho cả công ty</h3>
          <ul className="flex flex-col gap-2">{copied.map(row)}</ul>
        </>
      )}
    </>
  )
}

export function ReceivedCard({
  page,
  defs,
  editable,
  fields,
  onEdit,
}: {
  page: KpiAssignmentPageResponse
  defs: readonly KpiMetricDef[]
  editable: boolean
  fields: Fields
  onEdit: (key: string, text: string) => void
}) {
  const company = page.unit.kind === 'company'
  return (
    <GlassCard className="flex flex-col gap-4 self-start p-6">
      <h2 className="text-[14px] font-semibold leading-5">
        {company ? 'Chỉ tiêu công ty' : `${KIND_WORD[page.unit.kind]} nhận`}
      </h2>
      {company ? (
        <CompanyTotals defs={defs} editable={editable} fields={fields} onEdit={onEdit} />
      ) : (
        <Received page={page} defs={defs} />
      )}
    </GlassCard>
  )
}
