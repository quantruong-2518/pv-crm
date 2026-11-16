import { GlassCard, cn, percent } from '@pv/ui'
import {
  KPI_COVERAGE_LOW,
  type KpiAssignmentChild,
  type KpiAssignmentPageResponse,
  type KpiAssignmentSum,
  type KpiMetricDef,
} from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { kpiMetricText } from '@/data/kpi-i18n'
import { COVERAGE_AXIS_MAX } from '@/lib/kpi-scale'
import { num } from './home-model'
import { NEUTRAL_MARK, NOTE, TILE } from './home-tiles'
import { additiveOf, keyOfChild, type Fields } from './kpi-assign-model'
import { parseTyped, printShort } from './kpi-model'
import { Meter, StackBar, Swatch } from './kpi-unit-meter'

/** Three pictures over the page's own figures, redrawn as the boxes are typed:
 *  how the received total splits by person, the pipeline over the total handed
 *  down, and (own card, a list) each person's last month against the suggestion
 *  and what is typed. Nothing here is sent: the draft and the send read the boxes. */

const FIGURE = 'tnum font-num'
/** Full-strength tones only: a faded brand blue fell under 3:1 on the card.
 *  Past four people the smallest share one tone and one "others" entry. */
const TONES = ['bg-primary', 'bg-primary-strong', NEUTRAL_MARK, 'bg-foreground']
const REST = 'bg-surface-ink/20'

const nameOf = (c: KpiAssignmentChild) => (c.kind === 'unit' ? c.unit.name : c.person.name)

type Row = {
  name: string
  last: number | null
  suggested: number | null
  pipeline: number | null
  assigned: number
}

function rowsOf(page: KpiAssignmentPageResponse, def: KpiMetricDef, { textOf }: Fields): Row[] {
  return page.children.map((c) => {
    const typed = parseTyped(def.unit, textOf(keyOfChild(c, def.key), def))
    const s = c.kind === 'person' ? c.suggestions.find((x) => x.metricKey === def.key) : undefined
    return {
      name: nameOf(c),
      last: c.lastActuals.find((a) => a.metricKey === def.key)?.value ?? null,
      suggested: s?.ramped ?? null,
      pipeline: s?.pipeline ?? null,
      assigned: typeof typed === 'number' ? typed : 0,
    }
  })
}

function Allocation({
  rows,
  def,
  received,
}: {
  rows: readonly Row[]
  def: KpiMetricDef
  received: number
}) {
  const { t } = useI18n()
  const given = rows.reduce((n, r) => n + r.assigned, 0)
  const whole = Math.max(received, given)
  if (whole <= 0) return null
  const ranked = rows.filter((r) => r.assigned > 0).sort((x, y) => y.assigned - x.assigned)
  const named = ranked.length > TONES.length ? ranked.slice(0, TONES.length - 1) : ranked
  const others = ranked.slice(named.length)
  const othersSum = others.reduce((n, r) => n + r.assigned, 0)
  const parts = [
    ...named.map((r) => ({ key: r.name, label: r.name, value: r.assigned })),
    ...(others.length > 0
      ? [
          {
            key: 'others',
            label: t(
              message(
                `${num(others.length)} người khác`,
                `${num(others.length)} others`,
                `외 ${num(others.length)}명`,
              ),
            ),
            value: othersSum,
          },
        ]
      : []),
  ].map((p, i) => ({ ...p, tone: TONES[i]!, share: p.value / whole }))
  const left = Math.max(received - given, 0)
  return (
    <div className="flex flex-col gap-3">
      <StackBar className="gap-1" segments={[...parts, { share: left / whole, tone: REST }]} />
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p, i) => (
          <li key={p.key} className={cn(NOTE, FIGURE, 'inline-flex items-center gap-2')}>
            <Swatch tone={p.tone} />
            {`${p.label} ${printShort(def.unit, p.value)}`}
            {i === 0 && parts.length > 1 && ` · ${percent(p.share)}`}
          </li>
        ))}
        {left > 0 && (
          <li className={cn(NOTE, FIGURE, 'inline-flex items-center gap-2')}>
            <Swatch tone={REST} />
            {t(
              message(
                `Chưa giao ${printShort(def.unit, left)}`,
                `Not yet assigned ${printShort(def.unit, left)}`,
                `미배정 ${printShort(def.unit, left)}`,
              ),
            )}
          </li>
        )}
      </ul>
    </div>
  )
}

/** Each figure carries its word, since the three bars differ by tone alone. */
function Compare({ rows, def }: { rows: readonly Row[]; def: KpiMetricDef }) {
  const { t } = useI18n()
  const axis = Math.max(...rows.flatMap((r) => [r.last ?? 0, r.suggested ?? 0, r.assigned]), 1)
  const lines = [
    { id: 'last', word: message('Tháng trước', 'Last month', '지난달'), tone: NEUTRAL_MARK },
    { id: 'suggested', word: message('Gợi ý', 'Suggested', '제안'), tone: 'bg-foreground/70' },
    { id: 'assigned', word: message('Giao', 'Assigned', '배정'), tone: 'bg-primary' },
  ] as const
  const valueOf = (r: Row, id: (typeof lines)[number]['id']) =>
    id === 'last' ? r.last : id === 'suggested' ? r.suggested : r.assigned
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((r) => (
        <li
          key={r.name}
          className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]"
        >
          <span className="min-w-0 truncate font-semibold">{r.name}</span>
          <span className="flex flex-col gap-1">
            {lines.map((l) => {
              const value = valueOf(r, l.id)
              return (
                <span
                  key={l.id}
                  className="grid grid-cols-[5.5rem_minmax(0,1fr)_5rem] items-center gap-3"
                >
                  <span className={NOTE}>{t(l.word)}</span>
                  <Meter size="sm" fill={value === null ? 0 : value / axis} tone={l.tone} />
                  <span className={cn(NOTE, FIGURE, 'text-right')}>
                    {value === null ? '–' : printShort(def.unit, value)}
                  </span>
                </span>
              )
            })}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Pipeline over what is typed, on the shared coverage axis with the warning line on it. */
function Coverage({ rows, def }: { rows: readonly Row[]; def: KpiMetricDef }) {
  const { t } = useI18n()
  const seen = rows.filter((r) => r.pipeline !== null)
  const given = rows.reduce((n, r) => n + r.assigned, 0)
  if (seen.length === 0 || given <= 0) return null
  const pipeline = seen.reduce((n, r) => n + (r.pipeline ?? 0), 0)
  const ratio = pipeline / given
  const low = ratio < KPI_COVERAGE_LOW
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold">
          {t(message('Pipeline ÷ số giao', 'Pipeline ÷ assigned', '파이프라인 ÷ 배정'))}
        </span>
        <span className={cn(FIGURE, 'font-semibold', low && 'text-on-tint-warning')}>
          {`${num(Math.round(ratio * 10) / 10)} ${t(message('lần', 'x', '배'))}`}
        </span>
      </div>
      <Meter
        size="lg"
        fill={ratio / COVERAGE_AXIS_MAX}
        mark={KPI_COVERAGE_LOW / COVERAGE_AXIS_MAX}
        tone={low ? 'bg-warning' : 'bg-success'}
      />
      <span className={cn(NOTE, FIGURE)}>
        {t(
          message(
            `Pipeline ${printShort(def.unit, pipeline)} trên ${printShort(def.unit, given)} đã giao. Dưới ${KPI_COVERAGE_LOW} lần là thấp.`,
            `Pipeline ${printShort(def.unit, pipeline)} over ${printShort(def.unit, given)} assigned. Under ${KPI_COVERAGE_LOW}x is low.`,
            `파이프라인 ${printShort(def.unit, pipeline)} / 배정 ${printShort(def.unit, given)}. ${KPI_COVERAGE_LOW}배 미만은 낮음.`,
          ),
        )}
      </span>
    </div>
  )
}

export function AssignViz({
  page,
  defs,
  fields,
  sums,
}: {
  page: KpiAssignmentPageResponse
  defs: readonly KpiMetricDef[]
  fields: Fields
  sums: readonly KpiAssignmentSum[]
}) {
  const { t } = useI18n()
  const additive = additiveOf(defs)
  const def = additive.find((d) => d.primary) ?? additive[0]
  if (!def || page.children.length === 0) return null
  const rows = rowsOf(page, def, fields)
  const received = sums.find((s) => s.metricKey === def.key)?.received ?? 0
  const given = rows.reduce((n, r) => n + r.assigned, 0)
  const share = received > 0 ? given / received : null
  return (
    <>
      <GlassCard className={cn(TILE, 'gap-5')}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-[14px] font-semibold">
            {t(
              message(
                `${kpiMetricText(def.key)} chia theo người`,
                `${kpiMetricText(def.key)} split by person`,
                `${kpiMetricText(def.key)} 인원별 배분`,
              ),
            )}
          </h3>
          {share !== null && (
            <span className={cn(NOTE, FIGURE)}>
              {t(
                message(
                  `Đã giao ${percent(share)} · ${printShort(def.unit, given)} / ${printShort(def.unit, received)}`,
                  `Assigned ${percent(share)} · ${printShort(def.unit, given)} / ${printShort(def.unit, received)}`,
                  `배정 ${percent(share)} · ${printShort(def.unit, given)} / ${printShort(def.unit, received)}`,
                ),
              )}
            </span>
          )}
        </div>
        <Allocation rows={rows} def={def} received={received} />
        <Coverage rows={rows} def={def} />
      </GlassCard>
      <GlassCard variant="b" className={cn(TILE, 'gap-4')}>
        <h3 className="font-display text-[14px] font-semibold">
          {t(message('Từng người', 'Person by person', '개인별'))}
        </h3>
        <Compare rows={rows} def={def} />
      </GlassCard>
    </>
  )
}
