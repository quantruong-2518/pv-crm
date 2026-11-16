import { GlassCard, cn, percent } from '@pv/ui'
import type { KpiPresalesCollectionResponse } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { num } from './home-model'
import { NEUTRAL_MARK, NOTE, TILE } from './home-tiles'
import { DASH, printShort } from './kpi-model'

/** Presales' collection per contract on its lane (ADR 0160 §9): of each contract's
 *  value, how much is collected, overdue and not yet due. The amounts arrive whole,
 *  so the shares are drawn here; the figure at the right is the collected share. */

const PARTS = [
  { key: 'collected', tone: 'bg-success', label: message('Đã thu', 'Collected', '수금') },
  { key: 'overdue', tone: 'bg-destructive', label: message('Quá hạn', 'Overdue', '연체') },
  { key: 'notDue', tone: NEUTRAL_MARK, label: message('Chưa đến hạn', 'Not yet due', '미도래') },
] as const

type Amounts = KpiPresalesCollectionResponse['totals']

/** One stacked bar; a part is a share of the value, so a contract paid in full is all green. */
function Stack({ amounts, tall }: { amounts: Amounts; tall?: boolean }) {
  const value = Math.max(amounts.value, 1)
  return (
    <span
      className={cn('bg-surface-ink/10 flex overflow-hidden rounded-sm', tall ? 'h-4' : 'h-3')}
      aria-hidden
    >
      {PARTS.map((p) => (
        <span
          key={p.key}
          className={p.tone}
          style={{ width: `${Math.min(amounts[p.key] / value, 1) * 100}%` }}
        />
      ))}
    </span>
  )
}

function Legend() {
  const { t } = useI18n()
  return (
    <span className={cn(NOTE, 'flex flex-wrap gap-x-3 gap-y-1')}>
      {PARTS.map((p) => (
        <span key={p.key} className="inline-flex items-center gap-1">
          <span aria-hidden className={cn('rounded-xs size-2', p.tone)} />
          {t(p.label)}
        </span>
      ))}
    </span>
  )
}

export function PresalesCollectionCard({ data }: { data: KpiPresalesCollectionResponse }) {
  const { t } = useI18n()
  const { contracts, totals } = data
  if (contracts.length === 0) return null
  const money = (v: number) => printShort('money', v)
  return (
    <GlassCard variant="b" className={TILE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold leading-5">
          {t(
            message('Tiến độ thu tiền theo hợp đồng', 'Collection by contract', '계약별 수금 현황'),
          )}
        </h3>
        <Legend />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[12.5px] font-semibold">
            {t(
              message(
                `Tổng ${num(contracts.length)} hợp đồng · ${money(totals.value)}`,
                `${num(contracts.length)} contracts in total · ${money(totals.value)}`,
                `계약 ${num(contracts.length)}건 합계 · ${money(totals.value)}`,
              ),
            )}
          </span>
          <span className={cn(NOTE, 'tnum font-num')}>
            {t(
              message(
                `${money(totals.collected)} đã thu · ${money(totals.overdue)} quá hạn · ${money(totals.notDue)} chưa đến hạn`,
                `${money(totals.collected)} collected · ${money(totals.overdue)} overdue · ${money(totals.notDue)} not yet due`,
                `수금 ${money(totals.collected)} · 연체 ${money(totals.overdue)} · 미도래 ${money(totals.notDue)}`,
              ),
            )}
          </span>
        </div>
        <Stack amounts={totals} tall />
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {contracts.map((c) => (
          <li
            key={c.contractCode}
            className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(9rem,1.2fr)_minmax(0,2fr)_3rem] sm:items-center sm:gap-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[12.5px] font-semibold">{c.customerName}</span>
              <span className={cn(NOTE, 'tnum font-num')}>
                {`${c.contractCode} · ${money(c.value)}`}
                {c.overdue > 0 &&
                  ` · ${t(message(`quá hạn ${money(c.overdue)}`, `${money(c.overdue)} overdue`, `연체 ${money(c.overdue)}`))}`}
              </span>
            </span>
            <Stack amounts={c} />
            <span className="tnum font-num text-[12.5px] font-semibold sm:text-right">
              {c.value > 0 ? percent(c.collected / c.value) : DASH}
            </span>
          </li>
        ))}
      </ul>
      <span className={NOTE}>
        {t(
          message(
            'Phần trăm là phần đã thu trên giá trị hợp đồng.',
            'The percentage is the share collected of the contract value.',
            '퍼센트는 계약 금액 대비 수금 비율입니다.',
          ),
        )}
      </span>
    </GlassCard>
  )
}
