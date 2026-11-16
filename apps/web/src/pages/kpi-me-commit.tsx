import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Checkbox, GlassCard, cn } from '@pv/ui'
import type { KpiForecastMeResponse } from '@pv/contracts'
import { KpiCardError } from '@/components/kpi-tabs'
import { StackTable, type StackColumn } from '@/components/stack-table'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { kpiForecastCommitMeQuery, useSaveKpiForecastMe } from '@/data/kpi-forecast-commit'
import { dm } from '@/lib/date'
import { NOTE, TILE } from './home-tiles'
import { printTile } from './kpi-model'
import { FORECAST_ANCHOR } from './kpi-me-model'

/** The weekly forecast form (ADR 0158 §1): tick the opportunities the reader is
 *  sure to sign this month, see the live total, save. A later save replaces the
 *  week's pick. After the week ends the same list is read-only. Only drawn for
 *  months from `TIERED_FROM` and for a `signed-value` holder; the caller gates both.
 *
 *  The body is keyed by the saved pick, so a save re-seeds the ticks from the
 *  server's answer instead of keeping a second copy of it. */

const WEEK_DAYS = 6
const plusDays = (day: string, n: number) =>
  new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10)

function FormBody({ period, data }: { period: string; data: KpiForecastMeResponse }) {
  const { t } = useI18n()
  const [picked, setPicked] = useState(() => new Set(data.picked))
  const save = useSaveKpiForecastMe(period)
  const total = data.candidates
    .filter((c) => picked.has(c.opportunityId))
    .reduce((sum, c) => sum + c.value, 0)
  const toggle = (code: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(code)
      else next.delete(code)
      return next
    })

  const columns: StackColumn[] = [
    {
      header: <span className="sr-only">{t(message('Chọn', 'Pick', '선택'))}</span>,
      width: '64px',
    },
    { header: t(message('Cơ hội', 'Opportunity', '기회')), width: 'minmax(0,1.4fr)' },
    { header: t(message('Khách', 'Customer', '고객')), width: 'minmax(0,1.4fr)' },
    { header: t(message('Giá trị', 'Value', '금액')), width: 'minmax(0,1fr)', align: 'right' },
    {
      header: t(message('Ngày chốt dự kiến', 'Expected close', '예상 체결일')),
      width: 'minmax(0,1fr)',
      align: 'right',
    },
  ]
  const rows = data.candidates.map((c) => ({
    id: c.opportunityId,
    cells: [
      <Checkbox
        key="pick"
        checked={picked.has(c.opportunityId)}
        disabled={!data.editable}
        onChange={(on) => toggle(c.opportunityId, on)}
        label={<span className="sr-only">{`${c.opportunityId} ${c.name}`}</span>}
        className="pointer-coarse:min-h-12 w-full justify-center gap-0 p-0"
      />,
      <span key="code" className="flex min-w-0 flex-col">
        <span className="tnum font-mono">{c.opportunityId}</span>
        <span className={NOTE}>{c.name}</span>
      </span>,
      c.customerName,
      <span key="value" className="tnum font-num">
        {printTile('money', c.value)}
      </span>,
      <span key="close" className="tnum font-num">
        {c.expectedClose ? dm(c.expectedClose) : '—'}
      </span>,
    ],
  }))

  return (
    <>
      <StackTable from="lg" flush rowHeight="min-h-14 py-2" columns={columns} rows={rows} />
      <div className="flex flex-wrap items-center justify-between gap-3 px-5">
        <span className="text-[12.5px]">
          {t(message('Tổng chắc chắn ký:', 'Total you are sure to sign:', '확실한 체결 합계:'))}{' '}
          <b className="tnum font-num">{printTile('money', total)}</b>
        </span>
        {data.editable && (
          <Button
            className="pointer-coarse:h-12"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { opportunityIds: [...picked] },
                {
                  onSuccess: () =>
                    toastDone(t(message('Đã lưu dự báo', 'Forecast saved', '예측을 저장했습니다'))),
                },
              )
            }
          >
            {t(message('Lưu dự báo', 'Save forecast', '예측 저장'))}
          </Button>
        )}
      </div>
      {save.error && (
        <p role="alert" className="text-destructive-foreground m-0 px-5 text-[12px] leading-5">
          {userMessage(save.error)}
        </p>
      )}
    </>
  )
}

export function ForecastForm({ period }: { period: string }) {
  const { t } = useI18n()
  const read = useQuery(kpiForecastCommitMeQuery(period))
  const data = read.data
  const end = data ? plusDays(data.week, WEEK_DAYS) : ''
  return (
    <GlassCard id={FORECAST_ANCHOR} variant="b" className={cn(TILE, 'scroll-mt-4 gap-4 px-0')}>
      <div className="flex flex-col gap-2 px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="tnum font-num text-[13px] font-semibold leading-5">
            {data
              ? t(
                  message(
                    `Dự báo tuần ${dm(data.week)}–${dm(end)}`,
                    `Forecast for the week ${dm(data.week)}–${dm(end)}`,
                    `${dm(data.week)}–${dm(end)} 주간 예측`,
                  ),
                )
              : t(message('Dự báo tuần này', 'This week’s forecast', '이번 주 예측'))}
          </h3>
          {data &&
            (data.savedAt ? (
              <Badge tone="success">
                {t(
                  message(
                    `Đã ghi ${dm(data.savedAt)}`,
                    `Saved ${dm(data.savedAt)}`,
                    `${dm(data.savedAt)} 기록됨`,
                  ),
                )}
              </Badge>
            ) : (
              <Badge tone="draft">{t(message('Chưa ghi', 'Not saved', '미기록'))}</Badge>
            ))}
        </div>
        <p className={NOTE}>
          {data && !data.editable
            ? t(
                message(
                  'Tuần đã kết thúc, chỉ xem.',
                  'The week has ended. View only.',
                  '지난 주라 조회만 가능합니다.',
                ),
              )
            : t(
                message(
                  'Chọn cơ hội bạn chắc chắn ký trong tháng. Người phụ trách đơn vị xem và chốt số của đơn vị.',
                  'Pick the opportunities you are sure to sign this month. Your unit head reviews and commits the unit’s number.',
                  '이번 달 확실히 체결할 기회를 선택하세요. 조직 책임자가 조직 합계를 확인하고 확정합니다.',
                ),
              )}
        </p>
      </div>
      {read.error && !data && (
        <div className="px-5">
          <KpiCardError error={read.error} onRetry={() => void read.refetch()} />
        </div>
      )}
      {data && data.candidates.length === 0 && (
        <p className={cn(NOTE, 'px-5')}>
          {t(
            message(
              'Bạn chưa có cơ hội nào để chọn.',
              'You have no opportunities to pick yet.',
              '선택할 기회가 아직 없습니다.',
            ),
          )}
        </p>
      )}
      {data && data.candidates.length > 0 && (
        <FormBody key={`${data.week}|${data.savedAt}`} period={period} data={data} />
      )}
    </GlassCard>
  )
}
