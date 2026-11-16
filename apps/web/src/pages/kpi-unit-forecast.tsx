import { useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Badge, Button, GlassCard, Input, SectionTitle, Skeleton, cn } from '@pv/ui'
import type { KpiUnitForecastResponse } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import { StackTable } from '@/components/stack-table'
import { KpiCardError } from '@/components/kpi-tabs'
import { useCommitKpiUnitForecast } from '@/data/kpi-forecast-commit'
import { dm } from '@/lib/date'
import { NOTE, TILE } from './home-tiles'
import { DASH, grouped, printShort } from './kpi-model'
import { FORECAST_CARD_ID } from './kpi-unit-model'

/** The unit's weekly forecast: what each person saved, their sum, and the
 *  number the head commits (ADR 0158 §1). The number is editable and is never
 *  scored; at month end it is read against the real figure. */

const FIGURE = 'tnum font-num'

/** The week as Monday–Sunday; the contract names a week by its Monday. */
function weekText(monday: string): string {
  const end = new Date(`${monday}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 6)
  return `${dm(monday)} – ${dm(end.toISOString().slice(0, 10))}`
}

function CommitRow({
  data,
  period,
  unitId,
}: {
  data: KpiUnitForecastResponse
  period: string
  unitId: string
}) {
  const { t } = useI18n()
  const commit = useCommitKpiUnitForecast(period, unitId)
  const [text, setText] = useState(String(data.committed?.amount ?? data.sum))
  const amount = /^\d{1,15}$/.test(text) ? Number(text) : null
  const send = () =>
    amount !== null &&
    commit.mutate(
      { amount },
      {
        onSuccess: () =>
          toastDone(
            t(
              message(
                'Đã chốt dự báo đơn vị.',
                'Unit forecast committed.',
                '조직 예측을 확정했습니다.',
              ),
            ),
          ),
        onError: (e) => toastFail(userMessage(e)),
      },
    )
  return (
    <div className="flex flex-col gap-3 px-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-col gap-1">
          <span className={NOTE}>{t(message('Số của đơn vị', 'Unit figure', '조직 수치'))}</span>
          <Input
            inputMode="numeric"
            value={grouped(text)}
            suffix="₫"
            shellClassName="pointer-coarse:h-12"
            onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        <Button
          className="pointer-coarse:h-12"
          disabled={amount === null || commit.isPending}
          onClick={send}
        >
          {t(message('Chốt dự báo đơn vị', 'Commit unit forecast', '조직 예측 확정'))}
        </Button>
        {amount !== null && <span className={cn(NOTE, FIGURE)}>{printShort('money', amount)}</span>}
      </div>
      <p className={NOTE}>
        {t(
          message(
            'Số đơn vị sửa được; không tính điểm.',
            'The unit figure can be edited; it is not scored.',
            '조직 수치는 수정할 수 있으며 점수에는 반영되지 않습니다.',
          ),
        )}
      </p>
    </div>
  )
}

function ForecastBody({
  data,
  period,
  unitId,
}: {
  data: KpiUnitForecastResponse
  period: string
  unitId: string
}) {
  const { t } = useI18n()
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center gap-2 px-5">
        {data.committed ? (
          <Badge tone="success">
            {t(
              message(
                `Đã chốt ${printShort('money', data.committed.amount)} · ${data.committed.byName}`,
                `Committed ${printShort('money', data.committed.amount)} · ${data.committed.byName}`,
                `${printShort('money', data.committed.amount)} 확정 · ${data.committed.byName}`,
              ),
            )}
          </Badge>
        ) : (
          <Badge tone="draft">{t(message('Chưa chốt', 'Not committed', '미확정'))}</Badge>
        )}
        <span className={cn(NOTE, FIGURE)}>
          {t(message('Tổng mọi người', 'Sum of people', '구성원 합계'))}:{' '}
          {printShort('money', data.sum)}
        </span>
      </div>
      <StackTable
        from="md"
        flush
        rowHeight="min-h-12 py-2"
        tableClassName="min-w-md"
        columns={[
          { header: t(message('Người', 'Person', '담당자')), width: 'minmax(0,1fr)' },
          {
            header: t(message('Chắc chắn ký', 'Sure to sign', '확정 예상')),
            width: 'minmax(0,1fr)',
            align: 'right',
          },
          {
            header: t(message('Cơ hội đã chọn', 'Chosen deals', '선택한 기회')),
            width: 'minmax(0,1.6fr)',
          },
        ]}
        rows={data.people.map((p) => ({
          id: p.actorId,
          cells: [
            p.name,
            p.total === null ? (
              <Badge key="t" tone="warning">
                {t(message('Chưa ghi', 'Not yet', '미기록'))}
              </Badge>
            ) : (
              <span key="t" className={cn(FIGURE, 'font-semibold')}>
                {printShort('money', p.total)}
              </span>
            ),
            <span key="c" className="tnum font-mono">
              {p.codes.length > 0 ? p.codes.join(', ') : DASH}
            </span>,
          ],
        }))}
      />
      {data.canCommit && (
        <CommitRow
          key={`${data.committed?.amount ?? 'none'}/${data.sum}`}
          data={data}
          period={period}
          unitId={unitId}
        />
      )}
    </GlassCard>
  )
}

export function ForecastCard({
  query,
  period,
  unitId,
}: {
  query: UseQueryResult<KpiUnitForecastResponse>
  period: string
  unitId: string
}) {
  const { t } = useI18n()
  const data = query.data
  if (!data && !query.error) return <Skeleton height={96} />
  if (!data) {
    return (
      <GlassCard className={TILE}>
        <KpiCardError error={query.error} onRetry={() => void query.refetch()} />
      </GlassCard>
    )
  }
  if (data.people.length === 0) return null
  const week = weekText(data.week)
  return (
    <section id={FORECAST_CARD_ID} className="flex flex-col gap-3">
      <SectionTitle size="lg">
        {t(message(`Dự báo tuần ${week}`, `Forecast for ${week}`, `${week} 주 예측`))}
      </SectionTitle>
      <ForecastBody data={data} period={period} unitId={unitId} />
    </section>
  )
}
