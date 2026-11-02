import { GlassCard, cn } from '@pv/ui'
import { kpiMetricShare, type KpiAssignmentPageResponse, type KpiMetricDef } from '@pv/contracts'
import { FIELD_EDGE } from '@/components/stack-table'
import { message, useI18n } from '@/app/i18n'
import { kpiMetricText } from '@/data/kpi-i18n'
import { NOTE } from './home-tiles'
import { ValueCell } from './kpi-allocate-teams'
import {
  COPIED_WORD,
  KIND_WORD,
  cellKey,
  lastReading,
  printTarget,
  type Fields,
} from './kpi-assign-model'
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
  const { t } = useI18n()
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
        {t(
          page.parentSent
            ? message(
                'Chưa nhận chỉ tiêu nào.',
                'No targets received yet.',
                '수령한 목표가 없습니다.',
              )
            : message(
                'Cấp trên chưa giao chỉ tiêu.',
                'The level above has not assigned targets yet.',
                '상위 단위가 아직 목표를 배정하지 않았습니다.',
              ),
        )}
      </p>
    )
  }
  return (
    <>
      {additive.map(({ def, value }) => (
        <div key={def.key} className="bg-surface-ink/5 flex flex-col gap-1 rounded-lg px-4 py-3">
          <span className="text-muted-foreground text-[12.5px]">{kpiMetricText(def.key)}</span>
          <span className={FIGURE}>{printTarget(def, value)}</span>
        </div>
      ))}
      {copied.length > 0 && (
        <>
          <h3 className={cn(SUBHEAD, 'mt-2')}>{t(COPIED_WORD)}</h3>
          <ul className="flex flex-col gap-2">
            {copied.map(({ def, value }) => (
              <li key={def.key} className={ROW}>
                <span className="min-w-0 flex-1 text-[12.5px]">{kpiMetricText(def.key)}</span>
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
  const { t } = useI18n()
  const row = (def: KpiMetricDef) => {
    const key = cellKey('total', '', def.key)
    const text = fields.textOf(key, def)
    const value = parseTyped(def.unit, text)
    return (
      <li key={def.key} className={cn(ROW, 'flex-wrap')}>
        <span className="min-w-32 flex-1 text-[12.5px]">{kpiMetricText(def.key)}</span>
        <span className="ml-auto w-40 shrink-0">
          <ValueCell
            def={def}
            label={kpiMetricText(def.key)}
            editable={editable}
            text={text}
            saved={typeof value === 'number' ? value : null}
            {...lastReading(page.lastActualPeriod, page.lastActualTotals, def.key)}
            onChange={(typed) => onEdit(key, typed)}
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
          <h3 className={cn(SUBHEAD, 'mt-2')}>{t(COPIED_WORD)}</h3>
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
  const { t } = useI18n()
  const company = page.unit.kind === 'company'
  const kind = t(KIND_WORD[page.unit.kind])
  return (
    <GlassCard className={cn('flex flex-col gap-4 self-start p-6', FIELD_EDGE)}>
      <h2 className="text-[14px] font-semibold leading-5">
        {company
          ? t(message('Chỉ tiêu công ty', 'Company targets', '회사 목표'))
          : t(message(`${kind} nhận`, `Received by ${kind.toLowerCase()}`, `${kind} 수령`))}
      </h2>
      {company ? (
        <CompanyTotals
          page={page}
          defs={defs}
          editable={editable}
          fields={fields}
          onEdit={onEdit}
        />
      ) : (
        <Received page={page} defs={defs} />
      )}
    </GlassCard>
  )
}
