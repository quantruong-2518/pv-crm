import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, GlassCard, Input, Skeleton, cn } from '@pv/ui'
import type { KpiMarketingBudgetResponse } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import { KpiCardError } from '@/components/kpi-tabs'
import { kpiMarketingBudgetQuery, useSaveKpiMarketingBudget } from '@/data/kpi-budget'
import { dm } from '@/lib/date'
import { NOTE, TILE } from './home-tiles'
import { notApplicable } from './kpi-company-i18n'
import { printShort } from './kpi-model'
import { Meter } from './kpi-unit-meter'

/** The unit's Marketing budget for the month, beside what its members spent
 *  (ADR 0160 §8). Never scored. The edit form shows when the read says
 *  `canEdit`; whether the write is allowed is the server's answer. */

const FIGURE = 'tnum font-num'
const TITLE = message('Ngân sách Marketing tháng', 'Marketing budget this month', '월 마케팅 예산')

function BudgetForm({ data }: { data: KpiMarketingBudgetResponse }) {
  const { t } = useI18n()
  const save = useSaveKpiMarketingBudget(data.period, data.unitId)
  const [text, setText] = useState(data.amount === null ? '' : String(data.amount))
  const amount = /^\d{1,15}$/.test(text) ? Number(text) : null
  const send = () =>
    amount !== null &&
    save.mutate(
      { amount },
      {
        onSuccess: () =>
          toastDone(t(message('Đã lưu ngân sách.', 'Budget saved.', '예산을 저장했습니다.'))),
        onError: (e) => toastFail(userMessage(e)),
      },
    )
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-48 flex-col gap-1">
        <span className={NOTE}>{t(TITLE)}</span>
        <Input
          inputMode="numeric"
          value={text}
          suffix="₫"
          shellClassName="pointer-coarse:h-12"
          onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
        />
      </label>
      <Button
        className="pointer-coarse:h-12"
        disabled={amount === null || save.isPending}
        onClick={send}
      >
        {t(message('Lưu ngân sách', 'Save budget', '예산 저장'))}
      </Button>
      {amount !== null && <span className={cn(NOTE, FIGURE)}>{printShort('money', amount)}</span>}
    </div>
  )
}

export function MarketingBudgetCard({ period, unitId }: { period: string; unitId: string }) {
  const { t } = useI18n()
  const read = useQuery(kpiMarketingBudgetQuery(period, unitId))
  const data = read.data
  if (!data && !read.error) return <Skeleton height={96} />
  if (!data) {
    return (
      <GlassCard className={TILE}>
        <KpiCardError error={read.error} onRetry={() => void read.refetch()} />
      </GlassCard>
    )
  }
  const over = data.amount !== null && data.spent > data.amount
  return (
    <GlassCard className={cn(TILE, 'gap-4')}>
      <h3 className="text-[13px] font-semibold leading-5">{t(TITLE)}</h3>
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <span className="tnum font-num text-[28px] font-semibold leading-none tracking-[-1px]">
          {data.amount === null ? notApplicable() : printShort('money', data.amount)}
        </span>
        <span className={cn(NOTE, FIGURE)}>
          {t(message('Đã chi', 'Spent', '지출'))} {printShort('money', data.spent)}
        </span>
      </div>
      {data.amount !== null && data.amount > 0 && (
        <Meter
          size="lg"
          fill={data.spent / data.amount}
          tone={over ? 'bg-destructive' : 'bg-primary'}
        />
      )}
      {data.setBy && data.setAt && (
        <span className={NOTE}>
          {t(
            message(
              `${data.setBy.name} đặt ngày ${dm(data.setAt)}`,
              `Set by ${data.setBy.name} on ${dm(data.setAt)}`,
              `${data.setBy.name}님이 ${dm(data.setAt)}에 설정`,
            ),
          )}
        </span>
      )}
      {data.canEdit && <BudgetForm key={`${data.amount ?? 'none'}`} data={data} />}
    </GlassCard>
  )
}
