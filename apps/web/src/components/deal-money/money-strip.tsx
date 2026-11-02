import type { ReactNode } from 'react'
import { GlassCard, Separator, cn } from '@pv/ui'
import type { OpportunityMoneyNegotiation, OpportunityProfileResponse } from '@pv/contracts'
import { daysUntil } from '@pv/engines'
import { message, useI18n, type Lang, type Message } from '@/app/i18n'
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
  const { t, lang } = useI18n()
  const resolveKind = useContractKindLabel()
  const text = (amount: number) => compactMoney(amount, totals.currency)
  const collecting = money.paymentsVisible && money.contracts.length > 0
  const waiting = money.open.filter((n) => n.pendingId !== null)
  const validity = validityOf(waiting)
  const quoting = quotingLine(waiting, resolveKind, lang, t)

  const quoted = waiting.length > 0
  const top = collecting || quoted

  return (
    <GlassCard
      role="group"
      aria-label={t(message('Tiền của cơ hội', 'Money of this opportunity', '기회 금액'))}
      className="flex flex-col gap-6 p-5 sm:p-6"
    >
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
              label={t(message('Còn phải thu', 'Outstanding', '미수금'))}
              value={text(totals.outstanding)}
              large
              className="sm:col-span-2 lg:col-span-1"
            >
              {totals.overdue.count > 0 && (
                <span className="text-destructive-foreground">{overdueNote(totals, text, t)}</span>
              )}
              {totals.notYetDue.count > 0 && (
                <span className="text-muted-foreground">{notDueNote(totals, text, t)}</span>
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
            <Tile
              label={t(message('Đã thu', 'Collected', '수금액'))}
              value={text(totals.collected)}
            >
              {totals.collectedShare !== null && (
                <span className="text-muted-foreground">
                  {t(
                    message(
                      `${totals.collectedShare}% · ${totals.installments.paid} / ${totals.installments.total} đợt`,
                      `${totals.collectedShare}% · ${totals.installments.paid} / ${totals.installments.total} payments`,
                      `${totals.collectedShare}% · ${totals.installments.paid} / ${totals.installments.total}회`,
                    ),
                  )}
                </span>
              )}
            </Tile>
          )}
          {collecting && (
            <Tile label={t(message('Đã ký', 'Signed', '계약 체결'))} value={text(totals.signed)}>
              {totals.contracts > 0 && (
                <span className="text-muted-foreground">
                  {t(
                    message(
                      `${totals.contracts} hợp đồng`,
                      `${totals.contracts} contracts`,
                      `계약 ${totals.contracts}건`,
                    ),
                  )}
                </span>
              )}
            </Tile>
          )}
          {quoted && (
            <Tile
              label={t(message('Đang báo giá', 'Quoting', '견적 진행 중'))}
              value={text(totals.quoting)}
              large={!collecting}
            >
              {quoting && <span className="text-muted-foreground">{quoting}</span>}
            </Tile>
          )}
          {!collecting && validity && (
            <Tile
              label={t(message('Hiệu lực báo giá', 'Quotation validity', '견적서 유효기간'))}
              value={validityValue(validity, t)}
            >
              <span className="text-muted-foreground">{validityDay(validity, t)}</span>
            </Tile>
          )}
        </div>
      )}

      {top && <Separator />}
      <EstimateRow
        op={op}
        label={t(
          collecting
            ? message('Đã ký so với dự kiến', 'Signed vs. estimate', '체결 대비 예상')
            : message('Đang báo giá so với dự kiến', 'Quoting vs. estimate', '견적 대비 예상'),
        )}
        shown={collecting ? totals.signed : totals.quoting}
        onEdit={onEdit}
      />
    </GlassCard>
  )
}

type Totals = OpportunityProfileResponse['money']['totals']
type Say = (copy: Message) => string
type Validity = NonNullable<ReturnType<typeof validityOf>>

function overdueNote(totals: Totals, text: (amount: number) => string, t: Say) {
  const { amount, count, maxDaysLate } = totals.overdue
  return t(
    message(
      `Quá hạn ${text(amount)} · ${count} đợt · trễ nhất ${maxDaysLate} ngày`,
      `Overdue ${text(amount)} · ${count} installments · up to ${maxDaysLate} days late`,
      `기한 초과 ${text(amount)} · 납부 회차 ${count}개 · 최대 ${maxDaysLate}일 지연`,
    ),
  )
}

function notDueNote(totals: Totals, text: (amount: number) => string, t: Say) {
  const { amount, nearestDays } = totals.notYetDue
  return t(
    nearestDays === 0
      ? message(
          `Chưa đến hạn ${text(amount)} · gần nhất đến hạn hôm nay`,
          `Not yet due ${text(amount)} · next one due today`,
          `기한 전 ${text(amount)} · 가장 가까운 건은 오늘 기한`,
        )
      : message(
          `Chưa đến hạn ${text(amount)} · gần nhất còn ${nearestDays} ngày`,
          `Not yet due ${text(amount)} · next one in ${nearestDays} days`,
          `기한 전 ${text(amount)} · 가장 가까운 건은 ${nearestDays}일 남음`,
        ),
  )
}

function validityValue(validity: Validity, t: Say) {
  if (validity.expired) return t(message('Hết hiệu lực', 'Expired', '만료됨'))
  if (validity.days === 0) return t(message('Hết hiệu lực hôm nay', 'Expires today', '오늘 만료'))
  return t(
    message(`còn ${validity.days} ngày`, `${validity.days} days left`, `${validity.days}일 남음`),
  )
}

function validityDay(validity: Validity, t: Say) {
  const day = dmy(validity.day)
  return t(
    validity.expired
      ? message(`từ ${day}`, `since ${day}`, `${day}부터`)
      : message(`đến ${day}`, `until ${day}`, `${day}까지`),
  )
}

/** One quote reads kind and round; several read as a count. */
function quotingLine(
  waiting: OpportunityMoneyNegotiation[],
  resolveKind: (code: string) => string,
  lang: Lang,
  t: (copy: Message) => string,
): string | null {
  const only = waiting.length === 1 ? waiting[0] : undefined
  if (!only) {
    return waiting.length === 0
      ? null
      : t(
          message(
            `${waiting.length} báo giá đang chờ`,
            `${waiting.length} quotations waiting`,
            `견적서 ${waiting.length}건 대기 중`,
          ),
        )
  }
  const round = only.rounds.find((r) => r.id === only.pendingId)
  return [
    kindLabel(only.kind, resolveKind, lang),
    round && t(message(`lần ${round.roundNo}`, `round ${round.roundNo}`, `${round.roundNo}차`)),
  ]
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
