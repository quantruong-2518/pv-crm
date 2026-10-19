import { useState, type ReactNode } from 'react'
import {
  BarChart,
  Button,
  ChevronLeft,
  ChevronRight,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  Plus,
  SectionTitle,
  SegmentedControl,
  StatStrip,
  TriangleAlert,
  type BarDatum,
} from '@pv/ui'
import { AI_TASK_LABEL, type AiCostLine, type AiCostReport, type AiPrice } from '@pv/contracts'
import { dm, dmhm, dmy } from '@/lib/date'
import { costText, count, missingText, priceText } from '@/data/ai-costs'
import { keyOf, periodLabel, stepPick, type PeriodPick } from './home-model'

/** The blocks of One Core · Admin · AI cost: month picker, totals, cost by
 *  day, the three breakdowns, the unpriced notice and the price table. */

/** 48px on a finger (law 13), as the KPI picker. */
const STEP = 'pointer-coarse:h-12 pointer-coarse:w-12 w-8 px-0'
const NOTE = 'text-muted-foreground text-[11.5px] leading-[1.5]'

/** The KPI picker steps one month past the running one; spend has no future
 *  month, so this one stops at the current month (`stepPick`). */
export function CostMonthPicker({
  pick,
  onPick,
}: {
  pick: PeriodPick
  onPick: (p: PeriodPick) => void
}) {
  const earlier = stepPick(pick, -1)
  const later = stepPick(pick, 1)
  return (
    <div role="group" aria-label="Chọn tháng" className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className={STEP}
        aria-label="Tháng trước"
        disabled={earlier === null}
        onClick={() => earlier && onPick(earlier)}
      >
        <Icon icon={ChevronLeft} size={16} />
      </Button>
      <span aria-live="polite" className="tnum min-w-32 text-center text-[12.5px] font-semibold">
        {periodLabel(keyOf(pick))}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className={STEP}
        aria-label="Tháng sau"
        disabled={later === null}
        onClick={() => later && onPick(later)}
      >
        <Icon icon={ChevronRight} size={16} />
      </Button>
    </div>
  )
}

export function CostTotals({ line }: { line: AiCostLine }) {
  return (
    <StatStrip
      label="Tổng trong tháng"
      items={[
        { label: 'Chi phí', value: costText(line.costUsd), context: missingText(line) },
        {
          label: 'Lượt dùng AI',
          value: count(line.calls),
          context: line.errorCalls > 0 ? `${count(line.errorCalls)} lượt lỗi` : 'Không có lượt lỗi',
        },
        { label: 'Token vào', value: count(line.tokensIn) },
        { label: 'Token ra', value: count(line.tokensOut) },
      ]}
    />
  )
}

/** `BarChart` floors its scale at 1, and a day of AI spend is cents: widths are
 *  drawn in millionths of a dollar, the printed figure stays in USD. */
const MICRO = 1_000_000

export function CostByDay({ days }: { days: AiCostReport['byDay'] }) {
  /* The contract does not promise an order; a day list reads oldest first. */
  const data: BarDatum[] = [...days]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((d) => ({
      key: d.day,
      label: dm(d.day),
      value: Math.round((d.costUsd ?? 0) * MICRO),
      display: costText(d.costUsd),
      note:
        d.unpricedCalls > 0
          ? `${count(d.unpricedCalls)} lượt chưa có giá`
          : `${count(d.calls)} lượt dùng`,
      tone: d.unpricedCalls > 0 ? 'warning' : 'primary',
    }))
  return (
    <GlassCard variant="b" className="p-4 lg:p-5">
      <BarChart orientation="bar" data={data} source="Theo bảng giá đã đặt" />
    </GlassCard>
  )
}

/** The cost cell: the figure, and under it the calls it leaves out. */
function CostCell({ line }: { line: AiCostLine }) {
  const missing = missingText(line)
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="tnum font-num font-semibold">{costText(line.costUsd)}</span>
      {missing && (
        <span className={`${NOTE} tnum flex items-center gap-1`}>
          <Icon icon={TriangleAlert} size={16} className="text-warning shrink-0" />
          {missing}
        </span>
      )}
    </span>
  )
}

type Cut = 'task' | 'model' | 'actor'

type Named = { id: string; name: ReactNode; line: AiCostLine }

function rowsOf(report: AiCostReport, cut: Cut): Named[] {
  if (cut === 'task')
    return report.byTask.map((t) => ({ id: t.task, name: AI_TASK_LABEL[t.task], line: t }))
  if (cut === 'model')
    return report.byModel.map((m) => ({
      id: m.model,
      name: <span className="font-mono text-[12px]">{m.model}</span>,
      line: m,
    }))
  return report.byActor.map((a) => ({ id: a.actorId ?? 'system', name: a.name, line: a }))
}

const CUT_HEADER: Record<Cut, string> = { task: 'Việc', model: 'Mô hình', actor: 'Người dùng' }

export function CostBreakdown({ report }: { report: AiCostReport }) {
  const [cut, setCut] = useState<Cut>('task')
  const num = (value: number) => <span className="tnum font-num">{count(value)}</span>
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        size="md"
        actions={
          <SegmentedControl
            label="Xem theo"
            hideLabel
            tone="quiet"
            value={cut}
            onChange={(v) => setCut(v as Cut)}
            options={[
              { value: 'task', label: 'Theo việc' },
              { value: 'model', label: 'Theo mô hình' },
              { value: 'actor', label: 'Theo người' },
            ]}
          />
        }
      >
        Chi tiết
      </SectionTitle>
      {/* Law 8: a table sits on glass-b. */}
      <GlassCard variant="b" className="overflow-x-auto p-4 lg:p-5">
        <DataTable
          className="min-w-[720px]"
          rowHeight="min-h-12"
          columns={[
            { header: CUT_HEADER[cut], width: 'minmax(180px,1.6fr)' },
            { header: 'Lượt dùng AI', width: '112px', align: 'right' },
            { header: 'Lượt lỗi', width: '88px', align: 'right' },
            { header: 'Token vào', width: '120px', align: 'right' },
            { header: 'Token ra', width: '120px', align: 'right' },
            { header: 'Chi phí', width: 'minmax(168px,1fr)', align: 'right' },
          ]}
          rows={rowsOf(report, cut).map(({ id, name, line }) => ({
            id,
            cells: [
              <span key="n" className="block truncate py-2">
                {name}
              </span>,
              <span key="c">{num(line.calls)}</span>,
              <span key="e">{num(line.errorCalls)}</span>,
              <span key="i">{num(line.tokensIn)}</span>,
              <span key="o">{num(line.tokensOut)}</span>,
              <CostCell key="$" line={line} />,
            ],
          }))}
        />
      </GlassCard>
    </section>
  )
}

/** One line per model that leaves calls uncosted, each with its own button. */
export function UnpricedNotice({
  models,
  canSet,
  onPrice,
}: {
  models: string[]
  canSet: boolean
  onPrice: (model: string) => void
}) {
  if (models.length === 0) return null
  return (
    <GlassCard role="status" className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span className="flex min-w-0 flex-1 items-start gap-2 text-[12.5px] leading-[1.5]">
        <Icon icon={TriangleAlert} size={16} className="text-warning mt-1 shrink-0" />
        <span>
          Mô hình chưa có giá: <span className="font-mono text-[12px]">{models.join(', ')}</span>
        </span>
      </span>
      {canSet && (
        <span className="flex flex-wrap gap-2">
          {models.map((model) => (
            <Button
              key={model}
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12"
              onClick={() => onPrice(model)}
            >
              <Icon icon={Plus} size={16} />
              {models.length === 1 ? 'Đặt giá' : `Đặt giá ${model}`}
            </Button>
          ))}
        </span>
      )}
    </GlassCard>
  )
}

export function PriceTable({
  rows,
  canSet,
  onAdd,
  onEdit,
}: {
  rows: AiPrice[]
  canSet: boolean
  onAdd: () => void
  onEdit: (row: AiPrice) => void
}) {
  return (
    <GlassCard variant="b" className="overflow-x-auto p-4 lg:p-5">
      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message="Chưa đặt giá cho mô hình nào."
          action={{ label: 'Đặt giá', onClick: canSet ? onAdd : undefined }}
          className="py-8"
        />
      ) : (
        <DataTable
          className="min-w-[840px]"
          rowHeight="min-h-12"
          columns={[
            { header: 'Mô hình', width: 'minmax(180px,1.4fr)' },
            { header: 'Giá token vào', width: '168px', align: 'right' },
            { header: 'Giá token ra', width: '168px', align: 'right' },
            { header: 'Áp dụng từ', width: '112px' },
            { header: 'Người đặt', width: 'minmax(140px,1fr)' },
            { header: 'Lúc đặt', width: '112px' },
          ]}
          rows={rows.map((row) => ({
            id: `${row.model}@${row.effectiveFrom}`,
            onOpen: canSet ? () => onEdit(row) : undefined,
            cells: [
              <span key="m" className="block truncate font-mono text-[12px]">
                {row.model}
              </span>,
              <span key="i" className="tnum font-num">
                {priceText(row.inputUsdPerMTok)}
              </span>,
              <span key="o" className="tnum font-num">
                {priceText(row.outputUsdPerMTok)}
              </span>,
              <span key="f" className="tnum">
                {dmy(row.effectiveFrom)}
              </span>,
              <span key="b" className="block truncate">
                {row.setBy}
              </span>,
              <span key="a" className="tnum">
                {dmhm(row.setAt)}
              </span>,
            ],
          }))}
        />
      )}
    </GlassCard>
  )
}
