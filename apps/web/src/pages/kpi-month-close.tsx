import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Modal, Skeleton, cn } from '@pv/ui'
import type { KpiMonthClose } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { kpiCloseGateQuery, useCloseKpiMonth } from '@/data/kpi-close'
import { dm } from '@/lib/date'
import { NOTE } from './home-tiles'
import { CloseGate, GateAtClose } from './kpi-close-gate'
import { monthEnded, monthText } from './kpi-model'

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
      title={`Chốt KPI tháng ${monthText(period)}?`}
      footer={
        <div className="flex flex-col gap-3">
          {close.error && (
            <p role="alert" className={ALERT}>
              {userMessage(close.error)}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button size="lg" variant="ghost" type="button" onClick={onClose}>
              Huỷ
            </Button>
            <Button
              size="lg"
              type="button"
              disabled={close.isPending || checking}
              onClick={() =>
                close.mutate(undefined, {
                  onSuccess: () => {
                    toastDone(`Đã chốt KPI tháng ${monthText(period)}`)
                    onClose()
                  },
                })
              }
            >
              Chốt tháng
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[13px] leading-[1.6]">
          Sau khi chốt, số liệu tháng này không đổi nữa. Thay đổi sau đó tính vào tháng đang chạy.
        </p>
        {checking && <Skeleton className="h-10 w-full" />}
        {gate.error && <p className={ALERT}>Không tải được các mục chờ xử lý.</p>}
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
  const canClose = useCan('kpi.set-target')
  const [asking, setAsking] = useState(false)

  if (monthClose) {
    return (
      <div className="flex flex-col gap-1">
        <p className={cn(NOTE, 'tnum font-num m-0')}>
          Đã chốt {dm(monthClose.closedAt)} · {monthClose.closedBy.name}
        </p>
        {canClose && <GateAtClose period={period} />}
      </div>
    )
  }
  if (monthClose === undefined || !canClose || !monthEnded(period)) return null

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="m-0 text-[12.5px] font-semibold leading-5">
        Tháng {monthText(period)} chưa chốt
      </p>
      <Button variant="secondary" className="pointer-coarse:h-12" onClick={() => setAsking(true)}>
        Chốt tháng
      </Button>
      <CloseDialog period={period} open={asking} onClose={() => setAsking(false)} />
    </div>
  )
}
