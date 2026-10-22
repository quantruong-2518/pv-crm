import { useId, useState } from 'react'
import { Button, GlassCard, Input, Select, Textarea, cn } from '@pv/ui'
import { KPI_METRIC_LABEL, KpiCounterBody, type RoleId } from '@pv/contracts'
import { toastDone } from '@/app/toast'
import { Field } from '@/components/field-bits'
import { useAcknowledgeAllocation, useCounterAllocation, type MyLine } from '@/data/kpi-personal'
import { num } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { MOVED } from './kpi-allocate-model'
import { FailLine } from './kpi-allocate-parts'
import { UNIT_WORD, parseTyped, printValue } from './kpi-model'

/** The holder's two answers to the lines still waiting on them: confirm
 *  them all, or propose another value for one line with a reason.
 *
 *  Confirming sends no keys, so the server confirms every line not under a
 *  counter: the label names the value only when exactly one line is open.
 *  A counter equal to the assigned value is refused here, as it asks nothing.
 *  A refused write is said beside the buttons, where it was pressed. */

/** `KpiCounterBody.reason`'s ceiling, read from the contract. */
const REASON_MAX = KpiCounterBody.shape.reason.maxLength ?? undefined

const LABEL = 'text-muted-foreground text-[11px]'

function typedProblem(line: MyLine, typed: number | null | undefined): string | undefined {
  if (typed === null) {
    return line.def.unit === 'ratio'
      ? 'Nhập phần trăm, tối đa 100.'
      : 'Nhập số, hàng nghìn ngăn bằng dấu chấm.'
  }
  if (typed === line.value) return 'Mức đề xuất đang bằng mức được giao.'
  return undefined
}

export function AnswerBlock({
  period,
  role,
  lines,
}: {
  period: string
  role: RoleId
  /** Lines still `pending`. */
  lines: readonly [MyLine, ...MyLine[]]
}) {
  const acknowledge = useAcknowledgeAllocation(period, role)
  const counter = useCounterAllocation(period, role)
  const [picked, setPicked] = useState(
    () => (lines.find((l) => l.def.primary) ?? lines[0]).metricKey,
  )
  const [text, setText] = useState('')
  const [reason, setReason] = useState('')
  const ids = { value: useId(), problem: useId(), reason: useId() }

  /* The picked line can leave `lines` after a write; fall back to the first. */
  const line = lines.find((l) => l.metricKey === picked) ?? lines[0]
  const typed = parseTyped(line.def.unit, text)
  const problem = typedProblem(line, typed)
  const shownProblem = text === '' ? undefined : problem
  const body = KpiCounterBody.safeParse({
    metricKey: line.metricKey,
    proposedValue: problem === undefined ? typed : undefined,
    reason,
  })
  const busy = acknowledge.isPending || counter.isPending
  const write = (run: () => void) => {
    acknowledge.reset()
    counter.reset()
    run()
  }

  const confirmLabel =
    lines.length === 1
      ? `Xác nhận đã nhận ${printValue(line.def.unit, line.value, true)}`
      : `Xác nhận đã nhận ${num(lines.length)} chỉ tiêu`
  const counterLabel =
    typeof typed === 'number' && problem === undefined
      ? `Gửi đề xuất ${printValue(line.def.unit, typed, true)}`
      : 'Gửi đề xuất'

  return (
    <GlassCard className={cn(TILE, 'gap-4')}>
      <h3 className="text-[13px] font-semibold leading-5">Xác nhận hoặc đề xuất mức khác</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {lines.length > 1 && (
          <Field label="Chỉ số">
            <Select
              label="Chỉ số"
              hideLabel
              className="w-full"
              size="lg"
              value={line.metricKey}
              options={lines.map((l) => ({
                value: l.metricKey,
                label: KPI_METRIC_LABEL[l.metricKey],
              }))}
              onChange={(key) => {
                setPicked(key as MyLine['metricKey'])
                setText('')
              }}
            />
          </Field>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={ids.value} className={LABEL}>
            Mức đề xuất
          </label>
          {/* The unit beside the box, not `suffix`: the suffix shell is fixed at 40px, under law 13's 48. */}
          <span className="flex items-center gap-2">
            <Input
              id={ids.value}
              inputMode="decimal"
              aria-describedby={shownProblem ? ids.problem : undefined}
              className="tnum font-num h-12 text-right"
              value={text}
              invalid={shownProblem !== undefined}
              onChange={(e) => setText(e.target.value)}
            />
            <span className={cn(NOTE, 'w-8 shrink-0')}>{UNIT_WORD[line.def.unit]}</span>
          </span>
          {shownProblem && (
            <span id={ids.problem} className="text-destructive-foreground text-[11px] leading-4">
              {shownProblem}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={ids.reason} className={LABEL}>
            Lý do
          </label>
          {REASON_MAX !== undefined && (
            <span className="text-muted-foreground font-mono text-[11px]">
              {num(reason.length)}/{num(REASON_MAX)}
            </span>
          )}
        </div>
        <Textarea
          id={ids.reason}
          autoGrow
          rows={3}
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <div className="flex flex-col items-end gap-2">
        <FailLine error={counter.error ?? acknowledge.error} conflict={MOVED} />
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            variant="secondary"
            className="pointer-coarse:h-12"
            disabled={!body.success || busy}
            onClick={() =>
              body.success &&
              write(() =>
                counter.mutate(body.data, {
                  onSuccess: () => {
                    setText('')
                    setReason('')
                    toastDone('Đã gửi đề xuất · chờ quản lý phản hồi.')
                  },
                }),
              )
            }
          >
            {counterLabel}
          </Button>
          <Button
            className="pointer-coarse:h-12"
            disabled={busy}
            onClick={() =>
              write(() =>
                acknowledge.mutate({}, { onSuccess: () => toastDone('Đã xác nhận chỉ tiêu') }),
              )
            }
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}
