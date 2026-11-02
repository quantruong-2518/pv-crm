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
import type { AiCostLine, AiCostReport, AiPrice } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
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
  const { t } = useI18n()
  const earlier = stepPick(pick, -1)
  const later = stepPick(pick, 1)
  return (
    <div
      role="group"
      aria-label={t(message('Chọn tháng', 'Choose month', '월 선택'))}
      className="flex items-center gap-1"
    >
      <Button
        variant="ghost"
        size="sm"
        className={STEP}
        aria-label={t(message('Tháng trước', 'Previous month', '이전 달'))}
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
        aria-label={t(message('Tháng sau', 'Next month', '다음 달'))}
        disabled={later === null}
        onClick={() => later && onPick(later)}
      >
        <Icon icon={ChevronRight} size={16} />
      </Button>
    </div>
  )
}

export function CostTotals({ line }: { line: AiCostLine }) {
  const { t, number } = useI18n()
  return (
    <StatStrip
      label={t(message('Tổng trong tháng', 'Monthly total', '월간 합계'))}
      items={[
        {
          label: t(message('Chi phí', 'Cost', '비용')),
          value: costText(line.costUsd),
          context: missingText(line),
        },
        {
          label: t(message('Lượt dùng AI', 'AI calls', 'AI 호출')),
          value: count(line.calls),
          context:
            line.errorCalls > 0
              ? t(
                  message(
                    `${number(line.errorCalls)} lượt lỗi`,
                    `${number(line.errorCalls)} failed`,
                    `오류 ${number(line.errorCalls)}회`,
                  ),
                )
              : t(message('Không có lượt lỗi', 'No failed calls', '오류 호출 없음')),
        },
        {
          label: t(message('Token vào', 'Input tokens', '입력 토큰')),
          value: count(line.tokensIn),
        },
        {
          label: t(message('Token ra', 'Output tokens', '출력 토큰')),
          value: count(line.tokensOut),
        },
      ]}
    />
  )
}

/** `BarChart` floors its scale at 1, and a day of AI spend is cents: widths are
 *  drawn in millionths of a dollar, the printed figure stays in USD. */
const MICRO = 1_000_000

export function CostByDay({ days }: { days: AiCostReport['byDay'] }) {
  const { t, number } = useI18n()
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
          ? t(
              message(
                `${number(d.unpricedCalls)} lượt chưa có giá`,
                `${number(d.unpricedCalls)} unpriced calls`,
                `가격 미설정 ${number(d.unpricedCalls)}회`,
              ),
            )
          : t(
              message(
                `${number(d.calls)} lượt dùng`,
                `${number(d.calls)} calls`,
                `${number(d.calls)}회 호출`,
              ),
            ),
      tone: d.unpricedCalls > 0 ? 'warning' : 'primary',
    }))
  return (
    <GlassCard variant="b" className="p-4 lg:p-5">
      <BarChart
        orientation="bar"
        data={data}
        source={t(
          message('Theo bảng giá đã đặt', 'Based on configured prices', '설정된 가격 기준'),
        )}
      />
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

function rowsOf(report: AiCostReport, cut: Cut, t: ReturnType<typeof useI18n>['t']): Named[] {
  if (cut === 'task')
    return report.byTask.map((row) => ({
      id: row.task,
      name: t(message('Nạp lead từ ảnh', 'Import leads from image', '이미지에서 리드 가져오기')),
      line: row,
    }))
  if (cut === 'model')
    return report.byModel.map((m) => ({
      id: m.model,
      name: <span className="font-mono text-[12px]">{m.model}</span>,
      line: m,
    }))
  return report.byActor.map((a) => ({ id: a.actorId ?? 'system', name: a.name, line: a }))
}

export function CostBreakdown({ report }: { report: AiCostReport }) {
  const { t } = useI18n()
  const [cut, setCut] = useState<Cut>('task')
  const num = (value: number) => <span className="tnum font-num">{count(value)}</span>
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        size="md"
        actions={
          <SegmentedControl
            label={t(message('Xem theo', 'Group by', '그룹 기준'))}
            hideLabel
            tone="quiet"
            value={cut}
            onChange={(v) => setCut(v as Cut)}
            options={[
              { value: 'task', label: t(message('Theo việc', 'By task', '작업별')) },
              { value: 'model', label: t(message('Theo mô hình', 'By model', '모델별')) },
              { value: 'actor', label: t(message('Theo người', 'By user', '사용자별')) },
            ]}
          />
        }
      >
        {t(message('Chi tiết', 'Details', '세부 정보'))}
      </SectionTitle>
      {/* Law 8: a table sits on glass-b. */}
      <GlassCard variant="b" className="overflow-x-auto p-4 lg:p-5">
        <DataTable
          className="min-w-[720px]"
          rowHeight="min-h-12"
          columns={[
            {
              header: t(
                cut === 'task'
                  ? message('Việc', 'Task', '작업')
                  : cut === 'model'
                    ? message('Mô hình', 'Model', '모델')
                    : message('Người dùng', 'User', '사용자'),
              ),
              width: 'minmax(180px,1.6fr)',
            },
            {
              header: t(message('Lượt dùng AI', 'AI calls', 'AI 호출')),
              width: '112px',
              align: 'right',
            },
            { header: t(message('Lượt lỗi', 'Errors', '오류')), width: '88px', align: 'right' },
            {
              header: t(message('Token vào', 'Input tokens', '입력 토큰')),
              width: '120px',
              align: 'right',
            },
            {
              header: t(message('Token ra', 'Output tokens', '출력 토큰')),
              width: '120px',
              align: 'right',
            },
            {
              header: t(message('Chi phí', 'Cost', '비용')),
              width: 'minmax(168px,1fr)',
              align: 'right',
            },
          ]}
          rows={rowsOf(report, cut, t).map(({ id, name, line }) => ({
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
  const { t } = useI18n()
  if (models.length === 0) return null
  return (
    <GlassCard role="status" className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span className="flex min-w-0 flex-1 items-start gap-2 text-[12.5px] leading-[1.5]">
        <Icon icon={TriangleAlert} size={16} className="text-warning mt-1 shrink-0" />
        <span>
          {t(message('Mô hình chưa có giá:', 'Models without pricing:', '가격 미설정 모델:'))}{' '}
          <span className="font-mono text-[12px]">{models.join(', ')}</span>
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
              {models.length === 1
                ? t(message('Đặt giá', 'Set price', '가격 설정'))
                : t(message(`Đặt giá ${model}`, `Set price for ${model}`, `${model} 가격 설정`))}
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
  const { t } = useI18n()
  return (
    <GlassCard variant="b" className="overflow-x-auto p-4 lg:p-5">
      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message={t(
            message(
              'Chưa đặt giá cho mô hình nào.',
              'No model prices have been set.',
              '설정된 모델 가격이 없습니다.',
            ),
          )}
          action={{
            label: t(message('Đặt giá', 'Set price', '가격 설정')),
            onClick: canSet ? onAdd : undefined,
          }}
          className="py-8"
        />
      ) : (
        <DataTable
          className="min-w-[840px]"
          rowHeight="min-h-12"
          columns={[
            { header: t(message('Mô hình', 'Model', '모델')), width: 'minmax(180px,1.4fr)' },
            {
              header: t(message('Giá token vào', 'Input price', '입력 토큰 가격')),
              width: '168px',
              align: 'right',
            },
            {
              header: t(message('Giá token ra', 'Output price', '출력 토큰 가격')),
              width: '168px',
              align: 'right',
            },
            { header: t(message('Áp dụng từ', 'Effective from', '적용 시작일')), width: '112px' },
            { header: t(message('Người đặt', 'Set by', '설정자')), width: 'minmax(140px,1fr)' },
            { header: t(message('Lúc đặt', 'Set at', '설정 시각')), width: '112px' },
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
