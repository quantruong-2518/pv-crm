import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Modal, Skeleton, cn } from '@pv/ui'
import type { KpiMonthClose } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { kpiCloseGateQuery, useCloseKpiMonth } from '@/data/kpi-close'
import { dm } from '@/lib/date'
import { NOTE } from './home-tiles'
import { CloseGate, GateAtClose } from './kpi-close-gate'
import { monthEnded, monthText, monthWord } from './kpi-model'

/** The month-close control (ADR 0100): the closed line for everyone, on the
 *  company and targets screens; the note and button for a head only on the
 *  targets screen's waiting list, once the month has ended. Closing is final,
 *  so it asks first and shows the close gate (ADR 0116) above the button: what
 *  is pending and what looks unusual, asking for nothing more. */

const ALERT = 'text-destructive-foreground m-0 text-[12.5px] leading-[1.5]'

function CloseDialog({
  period,
  open,
  onClose,
}: {
  period: string
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  const month = monthText(period)
  const gate = useQuery(kpiCloseGateQuery(period, open))
  const close = useCloseKpiMonth(period)
  const { reset } = close
  /* Confirm waits for the gate, so nobody presses it before the list appears. */
  const checking = gate.isPending

  /* A refusal belongs to the press that earned it, not to the next opening. */
  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="h-auto max-h-[90dvh] self-end rounded-t-lg sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[480px] sm:self-center"
      title={t(
        message(
          `Chốt KPI tháng ${month}?`,
          `Close KPIs for month ${month}?`,
          `${monthWord(period)} KPI를 마감하시겠습니까?`,
        ),
      )}
      footer={
        <div className="flex flex-col gap-3">
          {close.error && (
            <p role="alert" className={ALERT}>
              {userMessage(close.error)}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button size="lg" variant="ghost" type="button" onClick={onClose}>
              {t(message('Huỷ', 'Cancel', '취소'))}
            </Button>
            <Button
              size="lg"
              type="button"
              disabled={close.isPending || checking}
              onClick={() =>
                close.mutate(undefined, {
                  onSuccess: () => {
                    toastDone(
                      t(
                        message(
                          `Đã chốt KPI tháng ${month}`,
                          `KPIs for month ${month} closed`,
                          `${monthWord(period)} KPI를 마감했습니다`,
                        ),
                      ),
                    )
                    onClose()
                  },
                })
              }
            >
              {t(message('Chốt tháng', 'Close month', '월 마감'))}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[13px] leading-[1.6]">
          {t(
            message(
              'Sau khi chốt, số liệu tháng này không đổi nữa. Thay đổi sau đó tính vào tháng đang chạy.',
              'Once closed, this month’s figures no longer change. Later changes count toward the running month.',
              '마감 후에는 이번 달 수치가 더 이상 바뀌지 않습니다. 이후 변경은 진행 중인 달에 반영됩니다.',
            ),
          )}
        </p>
        {checking && <Skeleton className="h-10 w-full" />}
        {gate.error && (
          <p className={ALERT}>
            {t(
              message(
                'Không tải được các mục chờ xử lý.',
                'Could not load the pending items.',
                '처리 대기 항목을 불러오지 못했습니다.',
              ),
            )}
          </p>
        )}
        {gate.data && <CloseGate gate={gate.data} onNavigate={onClose} />}
      </div>
    </Modal>
  )
}

export function MonthCloseBar({
  period,
  monthClose,
}: {
  period: string
  /** Absent while the screen's read is still loading: nothing is drawn yet. */
  monthClose: KpiMonthClose | undefined
}) {
  const { t } = useI18n()
  const canClose = useCan('kpi.set-target')
  const [asking, setAsking] = useState(false)

  if (monthClose) {
    return (
      <div className="flex flex-col gap-1">
        <p className={cn(NOTE, 'tnum font-num m-0')}>
          {t(
            message(
              `Đã chốt ${dm(monthClose.closedAt)}`,
              `Closed ${dm(monthClose.closedAt)}`,
              `${dm(monthClose.closedAt)} 마감`,
            ),
          )}{' '}
          · {monthClose.closedBy.name}
        </p>
        {canClose && <GateAtClose period={period} />}
      </div>
    )
  }
  if (monthClose === undefined || !canClose || !monthEnded(period)) return null

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="m-0 text-[12.5px] font-semibold leading-5">
        {t(
          message(
            `Tháng ${monthText(period)} chưa chốt`,
            `Month ${monthText(period)} not closed`,
            `${monthWord(period)} 미마감`,
          ),
        )}
      </p>
      <Button variant="secondary" className="pointer-coarse:h-12" onClick={() => setAsking(true)}>
        {t(message('Chốt tháng', 'Close month', '월 마감'))}
      </Button>
      <CloseDialog period={period} open={asking} onClose={() => setAsking(false)} />
    </div>
  )
}
