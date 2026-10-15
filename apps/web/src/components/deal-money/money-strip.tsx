import type { ReactNode } from 'react'
import { GlassCard, Separator, cn } from '@pv/ui'
import type { OpportunityMoneyNegotiation, OpportunityProfileResponse } from '@pv/contracts'
import { daysUntil } from '@pv/engines'
import { vnToday } from '@/data/opportunities'
import { useContractKindLabel } from '@/data/sales-config'
import { dmy } from '@/lib/date'
import { EstimateRow } from './estimate-row'
import { barWidth, compactMoney, kindLabel } from './money'

/** The deal's money in ONE block. Top row, most pressing first: what is still
 *  owed, then collected, signed and quoted — every amount is `money.totals` as
 *  sent; the bar only sets widths from it. The quote tile draws only while a
 *  quote waits, with its days left (counted here from the round's day). Below
 *  a thin line: the estimate row. The collection tiles need a signed paper and
 *  a reader who may see payments (`paymentsVisible`); the totals leave out
 *  every contract that reader may not, so without that the signed tile goes
 *  too rather than read zero. With nothing to show on top, the row is skipped. */
export function MoneyStrip({ op, onEdit }: { op: OpportunityProfileResponse; onEdit: () => void }) {
  const { money } = op
  const { totals } = money
  const resolveKind = useContractKindLabel()
  const text = (amount: number) => compactMoney(amount, totals.currency)
  const collecting = money.paymentsVisible && money.contracts.length > 0
  const waiting = money.open.filter((n) => n.pendingId !== null)
  const validity = validityOf(waiting)
  const quoting = quotingLine(waiting, resolveKind)

  const quoted = waiting.length > 0
  const top = collecting || quoted

  return (
    <GlassCard role="group" aria-label="Tiền của cơ hội" className="flex flex-col gap-6 p-5 sm:p-6">
      {top && (
        <div
          className={cn(
            'grid gap-x-8 gap-y-6 sm:grid-cols-2',
            collecting &&
              (quoted
                ? 'lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]'
                : 'lg:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]'),
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
                  {totals.collectedShare}% · {totals.installments.paid} /{' '}
                  {totals.installments.total} đợt
                </span>
              )}
            </Tile>
          )}
          {collecting && (
            <Tile label="Đã ký" value={text(totals.signed)}>
              {totals.contracts > 0 && (
                <span className="text-muted-foreground">{totals.contracts} hợp đồng</span>
              )}
            </Tile>
          )}
          {quoted && (
            <Tile label="Đang báo giá" value={text(totals.quoting)} large={!collecting}>
              {quoting && <span className="text-muted-foreground">{quoting}</span>}
            </Tile>
          )}
          {!collecting && validity && (
            <Tile
              label="Hiệu lực báo giá"
              value={
                validity.expired
                  ? 'Hết hiệu lực'
                  : validity.days === 0
                    ? 'Hết hiệu lực hôm nay'
                    : `còn ${validity.days} ngày`
              }
            >
              <span className="text-muted-foreground">
                {validity.expired ? 'từ' : 'đến'} {dmy(validity.day)}
              </span>
            </Tile>
          )}
        </div>
      )}

      {top && <Separator />}
      <EstimateRow
        op={op}
        label={collecting ? 'Đã ký so với dự kiến' : 'Đang báo giá so với dự kiến'}
        shown={collecting ? totals.signed : totals.quoting}
        onEdit={onEdit}
      />
    </GlassCard>
  )
}

/** One quote reads kind and round; several read as a count. */
function quotingLine(
  waiting: OpportunityMoneyNegotiation[],
  resolveKind: (code: string) => string,
): string | null {
  const only = waiting.length === 1 ? waiting[0] : undefined
  if (!only) return waiting.length === 0 ? null : `${waiting.length} báo giá đang chờ`
  const round = only.rounds.find((r) => r.id === only.pendingId)
  return [kindLabel(only.kind, resolveKind), round && `lần ${round.roundNo}`]
    .filter(Boolean)
    .join(' · ')
}

/** The pending round that lapses first; none when no round names a day. */
function validityOf(waiting: OpportunityMoneyNegotiation[]) {
  const rounds = waiting.flatMap((n) => n.rounds.filter((r) => r.id === n.pendingId))
  const dated = rounds.flatMap((r) =>
    r.validUntil ? [{ day: r.validUntil, expired: r.expired }] : [],
  )
  const first = dated.sort((a, b) => a.day.localeCompare(b.day))[0]
  return first && { ...first, days: Math.max(daysUntil(first.day, vnToday()), 0) }
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
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
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
