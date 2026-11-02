import { useId, useState } from 'react'
import { Button, GlassCard, Input, Select, Textarea, cn } from '@pv/ui'
import { KpiCounterBody, type RoleId } from '@pv/contracts'
import { kpiMetricText } from '@/data/kpi-i18n'
import { message, useI18n } from '@/app/i18n'
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

function typedProblem(
  line: MyLine,
  typed: number | null | undefined,
  t: (copy: ReturnType<typeof message>) => string,
): string | undefined {
  if (typed === null) {
    return line.def.unit === 'ratio'
      ? t(
          message(
            'Nhập phần trăm, tối đa 100.',
            'Enter a percentage up to 100.',
            '100 이하의 백분율을 입력하세요.',
          ),
        )
      : t(
          message(
            'Nhập số, hàng nghìn ngăn bằng dấu chấm.',
            'Enter a number, using commas for thousands.',
            '숫자를 입력하세요. 천 단위는 쉼표를 사용합니다.',
          ),
        )
  }
  if (typed === line.value)
    return t(
      message(
        'Mức đề xuất đang bằng mức được giao.',
        'The proposed value matches the assigned target.',
        '제안 값이 배정된 목표와 같습니다.',
      ),
    )
  return undefined
}

const TEXT = {
  acknowledgeOrProposeADifferent: message(
    'Xác nhận hoặc đề xuất mức khác',
    'Acknowledge or propose a different value',
    '확인 또는 다른 값 제안',
  ),
  proposalSentWaitingForManager: message(
    'Đã gửi đề xuất · chờ quản lý phản hồi.',
    'Proposal sent · waiting for manager response.',
    '제안을 제출했습니다 · 관리자 응답 대기 중',
  ),
  targetAcknowledged: message('Đã xác nhận chỉ tiêu', 'Target acknowledged', '목표를 확인했습니다'),
}

function confirmLabelOf(
  lines: readonly [MyLine, ...MyLine[]],
  line: MyLine,
  t: (copy: ReturnType<typeof message>) => string,
) {
  return lines.length === 1
    ? t(
        message(
          `Xác nhận đã nhận ${printValue(line.def.unit, line.value, true)}`,
          `Acknowledge ${printValue(line.def.unit, line.value, true)}`,
          `${printValue(line.def.unit, line.value, true)} 확인`,
        ),
      )
    : t(
        message(
          `Xác nhận đã nhận ${num(lines.length)} chỉ tiêu`,
          `Acknowledge ${num(lines.length)} targets`,
          `목표 ${num(lines.length)}개 확인`,
        ),
      )
}

function counterLabelOf(
  line: MyLine,
  typed: number | null | undefined,
  problem: string | undefined,
  t: (copy: ReturnType<typeof message>) => string,
) {
  return typeof typed === 'number' && problem === undefined
    ? t(
        message(
          `Gửi đề xuất ${printValue(line.def.unit, typed, true)}`,
          `Submit proposal ${printValue(line.def.unit, typed, true)}`,
          `${printValue(line.def.unit, typed, true)} 제안 제출`,
        ),
      )
    : t(message('Gửi đề xuất', 'Submit proposal', '제안 제출'))
}

function ProposedValue({
  ids,
  text,
  unit,
  problem,
  onChange,
}: {
  ids: { value: string; problem: string }
  text: string
  unit: MyLine['def']['unit']
  /** Already hidden while the box is empty. */
  problem: string | undefined
  onChange: (text: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={ids.value} className={LABEL}>
        {t(message('Mức đề xuất', 'Proposed value', '제안 값'))}
      </label>
      {/* The unit beside the box, not `suffix`: the suffix shell is fixed at 40px, under law 13's 48. */}
      <span className="flex items-center gap-2">
        <Input
          id={ids.value}
          inputMode="decimal"
          aria-describedby={problem ? ids.problem : undefined}
          className="tnum font-num h-12 text-right"
          value={text}
          invalid={problem !== undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className={cn(NOTE, 'w-8 shrink-0')}>{UNIT_WORD[unit]}</span>
      </span>
      {problem && (
        <span id={ids.problem} className="text-destructive-foreground text-[11px] leading-4">
          {problem}
        </span>
      )}
    </div>
  )
}

function ReasonField({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (reason: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className={LABEL}>
          {t(message('Lý do', 'Reason', '사유'))}
        </label>
        {REASON_MAX !== undefined && (
          <span className="text-muted-foreground font-mono text-[11px]">
            {num(value.length)}/{num(REASON_MAX)}
          </span>
        )}
      </div>
      <Textarea
        id={id}
        autoGrow
        rows={3}
        maxLength={REASON_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
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
  const { t } = useI18n()
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
  const problem = typedProblem(line, typed, t)
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

  const confirmLabel = confirmLabelOf(lines, line, t)
  const counterLabel = counterLabelOf(line, typed, problem, t)

  return (
    <GlassCard className={cn(TILE, 'gap-4')}>
      <h3 className="text-[13px] font-semibold leading-5">
        {t(TEXT.acknowledgeOrProposeADifferent)}
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {lines.length > 1 && (
          <Field label={t(message('Chỉ số', 'Metric', '지표'))}>
            <Select
              label={t(message('Chỉ số', 'Metric', '지표'))}
              hideLabel
              className="w-full"
              size="lg"
              value={line.metricKey}
              options={lines.map((l) => ({
                value: l.metricKey,
                label: kpiMetricText(l.metricKey),
              }))}
              onChange={(key) => {
                setPicked(key as MyLine['metricKey'])
                setText('')
              }}
            />
          </Field>
        )}
        <ProposedValue
          ids={ids}
          text={text}
          unit={line.def.unit}
          problem={shownProblem}
          onChange={setText}
        />
      </div>

      <ReasonField id={ids.reason} value={reason} onChange={setReason} />

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
                    toastDone(t(TEXT.proposalSentWaitingForManager))
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
                acknowledge.mutate(
                  {},
                  {
                    onSuccess: () => toastDone(t(TEXT.targetAcknowledged)),
                  },
                ),
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
