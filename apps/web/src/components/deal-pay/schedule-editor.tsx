import type { ReactNode } from 'react'
import { Plus, Trash2 } from '@pv/ui'
import { Button, Icon, Input, cn } from '@pv/ui'
import { CONTRACT_INSTALLMENTS_MAX, type CurrencyCode, type InstallmentEdit } from '@pv/contracts'
import { vnDayOf } from '@/data/quotations-write'
import { momentOfDay, PAY_TEXT_MAX } from '@/data/contracts-write'
import { symbolOf } from '@/components/deal-money/money'
import { NumberBox } from './number-box'
import { FULL_SHARE, scheduleGap, scheduleSummary, type ScheduleSettled } from './schedule-math'

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-[11px] sm:sr-only">{label}</span>
      {children}
    </label>
  )
}

const ROW_GRID =
  'grid grid-cols-2 items-end gap-3 sm:grid-cols-[24px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_48px]'

/** A controlled list of instalment lines. A typed share fills the amount from
 *  the contract's value and a typed amount fills the share; whatever is still
 *  missing is said under the list, and nowhere else. A line keeps the `no` it
 *  came with — that is how the server knows an edited instalment from a new
 *  one. The server judges the sums again. */
export function ScheduleEditor({
  amount,
  currency,
  value,
  onChange,
  settled,
}: {
  amount: number | null
  currency: CurrencyCode | null
  value: InstallmentEdit[]
  onChange: (next: InstallmentEdit[]) => void
  settled?: ScheduleSettled
}) {
  const symbol = symbolOf(currency)
  const summary = scheduleSummary(value, amount, currency, settled)
  const edit = (index: number, patch: Partial<InstallmentEdit>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const setShare = (index: number, share: number) =>
    edit(index, {
      share,
      ...(amount !== null && { amount: Math.round((amount * share) / FULL_SHARE) }),
    })
  const setAmount = (index: number, money: number) =>
    edit(index, {
      amount: money,
      ...(amount !== null &&
        amount > 0 && { share: Math.min(FULL_SHARE, Math.round((money / amount) * FULL_SHARE)) }),
    })

  const add = () => {
    const gap = scheduleGap(value, amount, settled)
    onChange([
      ...value,
      { label: '', share: Math.max(0, gap.share), amount: Math.max(0, gap.amount), due: '' },
    ])
  }

  return (
    <div className="flex flex-col gap-4">
      {value.length === 0 ? (
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">Chưa có đợt nào.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          <li
            aria-hidden
            className={cn(ROW_GRID, 'text-muted-foreground hidden text-[11px] sm:grid')}
          >
            <span />
            <span>Tên đợt</span>
            <span>Tỉ lệ</span>
            <span>Số tiền</span>
            <span>Hạn thu</span>
            <span />
          </li>
          {value.map((row, i) => (
            <li key={i} className={ROW_GRID}>
              <span className="text-muted-foreground tnum col-span-2 self-center text-[12px] sm:col-span-1">
                <span className="sm:hidden">Dòng </span>
                {i + 1}
              </span>
              <div className="col-span-2 sm:col-span-1">
                <Cell label="Tên đợt">
                  <Input
                    aria-label={`Tên đợt, dòng ${i + 1}`}
                    className="pointer-coarse:h-12"
                    maxLength={PAY_TEXT_MAX.label}
                    value={row.label}
                    onChange={(e) => edit(i, { label: e.target.value })}
                  />
                </Cell>
              </div>
              <Cell label="Tỉ lệ">
                <NumberBox
                  label={`Tỉ lệ, dòng ${i + 1}`}
                  unit="%"
                  max={FULL_SHARE}
                  value={row.share === 0 ? null : row.share}
                  onChange={(n) => setShare(i, n ?? 0)}
                />
              </Cell>
              <Cell label="Số tiền">
                <NumberBox
                  label={`Số tiền, dòng ${i + 1}`}
                  unit={symbol}
                  value={row.amount === 0 ? null : row.amount}
                  onChange={(n) => setAmount(i, n ?? 0)}
                />
              </Cell>
              <Cell label="Hạn thu">
                <Input
                  type="date"
                  aria-label={`Hạn thu, dòng ${i + 1}`}
                  className="pointer-coarse:h-12"
                  value={row.due === '' ? '' : vnDayOf(row.due)}
                  onChange={(e) =>
                    edit(i, { due: e.target.value === '' ? '' : momentOfDay(e.target.value) })
                  }
                />
              </Cell>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Xoá dòng ${i + 1}`}
                title="Xoá dòng"
                className="pointer-coarse:size-12 size-8 justify-self-end px-0"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <Icon icon={Trash2} size={16} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {value.length < CONTRACT_INSTALLMENTS_MAX ? (
          <Button size="md" variant="secondary" className="pointer-coarse:h-12" onClick={add}>
            <Icon icon={Plus} size={16} />
            Thêm đợt
          </Button>
        ) : (
          <span className="text-muted-foreground text-[12px]">
            Tối đa {CONTRACT_INSTALLMENTS_MAX} đợt.
          </span>
        )}
        {(value.length > 0 || settled !== undefined) && (
          <span
            role="status"
            className={cn(
              'tnum min-w-0 text-[12.5px] leading-[1.5]',
              summary.balanced ? 'text-foreground' : 'text-warning',
            )}
          >
            {summary.text}
          </span>
        )}
      </div>
    </div>
  )
}
