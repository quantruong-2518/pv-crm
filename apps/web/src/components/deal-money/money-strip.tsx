import type { ReactNode } from 'react'
import { GlassCard, cn } from '@pv/ui'
import type { OpportunityMoney } from '@pv/contracts'
import { barWidth, compactMoney } from './money'

/** The deal's money in one row, most pressing first: what is still owed, then
 *  collected, signed and quoted. Every figure is `money.totals` as sent; the bar
 *  only sets widths from it. The collection tiles need a signed paper and a
 *  reader who may see payments (`paymentsVisible`); the totals leave out every
 *  contract that reader may not, so with none visible the signed tile goes too
 *  rather than read zero above the papers listed. */
export function MoneyStrip({ money }: { money: OpportunityMoney }) {
  const { totals } = money
  const text = (amount: number) => compactMoney(amount, totals.currency)
  const collecting = money.paymentsVisible && money.contracts.length > 0

  return (
    <GlassCard
      role="group"
      aria-label="Tiền của cơ hội"
      className={cn(
        'grid gap-x-8 gap-y-5 p-4 sm:grid-cols-2 sm:p-5',
        collecting && 'lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]',
      )}
    >
      {collecting && (
        <Tile
          label="Còn phải thu"
          value={text(totals.outstanding)}
          large
          className="sm:col-span-2 lg:col-span-1"
        >
          {totals.overdue.count > 0 && (
            <span className="text-destructive-foreground">
              Quá hạn {text(totals.overdue.amount)} · {totals.overdue.count} đợt · trễ nhất{' '}
              {totals.overdue.maxDaysLate} ngày
            </span>
          )}
          {totals.notYetDue.count > 0 && (
            <span className="text-muted-foreground">
              Chưa đến hạn {text(totals.notYetDue.amount)} ·{' '}
              {totals.notYetDue.nearestDays === 0
                ? 'gần nhất đến hạn hôm nay'
                : `gần nhất còn ${totals.notYetDue.nearestDays} ngày`}
            </span>
          )}
          {totals.signed > 0 && (
            <span className="bg-surface-ink/12 flex h-2 overflow-hidden rounded-sm" aria-hidden>
              <span
                className="bg-success"
                style={{ width: barWidth(totals.collected, totals.signed) }}
              />
              <span
                className="bg-destructive"
                style={{ width: barWidth(totals.overdue.amount, totals.signed) }}
              />
            </span>
          )}
        </Tile>
      )}
      {collecting && (
        <Tile label="Đã thu" value={text(totals.collected)}>
          {totals.collectedShare !== null && (
            <span className="text-muted-foreground">
              {totals.collectedShare}% · {totals.installments.paid} / {totals.installments.total}{' '}
              đợt
            </span>
          )}
        </Tile>
      )}
      <Tile label="Đã ký" value={text(totals.signed)}>
        {totals.contracts > 0 && (
          <span className="text-muted-foreground">{totals.contracts} hợp đồng</span>
        )}
      </Tile>
      <Tile label="Đang báo giá" value={text(totals.quoting)} />
    </GlassCard>
  )
}

function Tile({
  label,
  value,
  large = false,
  className,
  children,
}: {
  label: string
  value: string
  large?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <span className="text-muted-foreground text-[12px] font-medium">{label}</span>
      <span
        className={cn(
          'tnum font-num font-semibold leading-none',
          large ? 'text-[42px] tracking-[-1.5px]' : 'text-[30px] tracking-[-1px]',
        )}
      >
        {value}
      </span>
      {children && (
        <span className="tnum flex flex-col gap-1 text-[12px] leading-[1.5]">{children}</span>
      )}
    </div>
  )
}
