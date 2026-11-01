import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Icon, Modal, Send } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  type KpiAssignmentPageResponse,
  type KpiAssignmentSum,
  type KpiMetricDef,
} from '@pv/contracts'
import { overTitle, sumFigures, sumWord } from './kpi-assign-model'

/** The send button and the question it may ask first (ADR 0120 §4): a sum flagged `over`
 *  is still allowed, so the head confirms it before anything is sent instead of
 *  reading a warning after. Whether it is over comes from the shared sum rule. The
 *  button lives here with the dialog so the page holds no open state of its own. */

export function SendDown({
  page,
  defs,
  sums,
  disabled,
  onSend,
}: {
  page: KpiAssignmentPageResponse
  defs: readonly KpiMetricDef[]
  sums: readonly KpiAssignmentSum[]
  disabled: boolean
  onSend: () => void
}) {
  const [open, setOpen] = useState(false)
  /* Stable: Modal pulls focus back to the panel whenever `onClose` changes. */
  const close = useCallback(() => setOpen(false), [])
  /* The Modal keeps drawing this footer through its exit animation, so a
     double-click would reach `onSend` twice, and each is a real send. */
  const fired = useRef(false)
  useEffect(() => {
    if (open) fired.current = false
  }, [open])
  const over = sums.flatMap((sum) => {
    const def = defs.find((d) => d.key === sum.metricKey)
    return def && sum.flag === 'over' ? [{ def, sum }] : []
  })

  return (
    <>
      <Button
        className="pointer-coarse:h-12"
        disabled={disabled}
        onClick={() => (over.length > 0 ? setOpen(true) : onSend())}
      >
        <Icon icon={Send} size={16} />
        Gửi xuống
      </Button>
      <Modal
        open={open}
        onClose={close}
        className="h-auto max-h-[90dvh] self-end rounded-t-lg sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[480px] sm:self-center"
        title={overTitle(page)}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button size="lg" variant="secondary" type="button" onClick={close}>
              Sửa lại
            </Button>
            <Button
              size="lg"
              type="button"
              onClick={() => {
                if (fired.current) return
                fired.current = true
                close()
                onSend()
              }}
            >
              Vẫn gửi xuống
            </Button>
          </div>
        }
      >
        <ul className="tnum font-num flex flex-col gap-2 text-[13px] leading-5">
          {over.map(({ def, sum }) => (
            <li key={def.key}>
              {KPI_METRIC_LABEL[def.key]} · {sumFigures(def, sum)} · {sumWord(page, def, sum).text}
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}
