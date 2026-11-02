import type { ReactNode } from 'react'
import { Plus, Trash2 } from '@pv/ui'
import { Button, Icon, Input, cn } from '@pv/ui'
import { CONTRACT_INSTALLMENTS_MAX, type CurrencyCode, type InstallmentEdit } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
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

function HeaderRow() {
  const { t } = useI18n()
  return (
    <li aria-hidden className={cn(ROW_GRID, 'text-muted-foreground hidden text-[11px] sm:grid')}>
      <span />
      <span>{t(message('Tên đợt', 'Installment name', '회차 이름'))}</span>
      <span>{t(message('Tỉ lệ', 'Share', '비율'))}</span>
      <span>{t(message('Số tiền', 'Amount', '금액'))}</span>
      <span>{t(message('Hạn thu', 'Due date', '수금 기한'))}</span>
      <span />
    </li>
  )
}

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
  const { t } = useI18n()
  const symbol = symbolOf(currency)
  const colName = t(message('Tên đợt', 'Installment name', '회차 이름'))
  const colShare = t(message('Tỉ lệ', 'Share', '비율'))
  const colAmount = t(message('Số tiền', 'Amount', '금액'))
  const colDue = t(message('Hạn thu', 'Due date', '수금 기한'))
  const rowNo = (i: number) => t(message(`dòng ${i + 1}`, `row ${i + 1}`, `${i + 1}행`))
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
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          {t(message('Chưa có đợt nào.', 'No installments yet.', '등록된 회차가 없습니다.'))}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          <HeaderRow />
          {value.map((row, i) => (
            <li key={i} className={ROW_GRID}>
              <span className="text-muted-foreground tnum col-span-2 self-center text-[12px] sm:col-span-1">
                <span className="sm:hidden">{t(message('Dòng', 'Row', '행'))} </span>
                {i + 1}
              </span>
              <div className="col-span-2 sm:col-span-1">
                <Cell label={colName}>
                  <Input
                    aria-label={`${colName}, ${rowNo(i)}`}
                    className="pointer-coarse:h-12"
                    maxLength={PAY_TEXT_MAX.label}
                    value={row.label}
                    onChange={(e) => edit(i, { label: e.target.value })}
                  />
                </Cell>
              </div>
              <Cell label={colShare}>
                <NumberBox
                  label={`${colShare}, ${rowNo(i)}`}
                  unit="%"
                  max={FULL_SHARE}
                  value={row.share === 0 ? null : row.share}
                  onChange={(n) => setShare(i, n ?? 0)}
                />
              </Cell>
              <Cell label={colAmount}>
                <NumberBox
                  label={`${colAmount}, ${rowNo(i)}`}
                  unit={symbol}
                  value={row.amount === 0 ? null : row.amount}
                  onChange={(n) => setAmount(i, n ?? 0)}
                />
              </Cell>
              <Cell label={colDue}>
                <Input
                  type="date"
                  aria-label={`${colDue}, ${rowNo(i)}`}
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
                aria-label={t(
                  message(`Xoá dòng ${i + 1}`, `Delete row ${i + 1}`, `${i + 1}행 삭제`),
                )}
                title={t(message('Xoá dòng', 'Delete row', '행 삭제'))}
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
            {t(message('Thêm đợt', 'Add installment', '회차 추가'))}
          </Button>
        ) : (
          <span className="text-muted-foreground text-[12px]">
            {t(
              message(
                `Tối đa ${CONTRACT_INSTALLMENTS_MAX} đợt.`,
                `At most ${CONTRACT_INSTALLMENTS_MAX} installments.`,
                `회차는 최대 ${CONTRACT_INSTALLMENTS_MAX}개입니다.`,
              ),
            )}
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
