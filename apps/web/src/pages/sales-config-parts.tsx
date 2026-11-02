import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { EmptyState, GlassCard, Input, Select, Skeleton, TriangleAlert, cn } from '@pv/ui'
import {
  FIRST_TOUCH_UNITS,
  firstTouchToMinutes,
  splitFirstTouch,
  type FirstTouchUnit,
  type MotionPolicy,
  type MotionPolicyPatch,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, useI18n, type Message } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { useMyConfigProposals } from '@/data/sales-config'
import { leadMotionLabel } from '@/data/sales-labels-i18n'
import { salesMotionsQuery, useProposeMotion } from '@/data/sales-motions'
import {
  MOTION_LINE,
  MOTION_NAME,
  MOTION_ROW,
  MotionCell,
  MotionHead,
  MotionSend,
} from './lead-origins-motions'
import { motionWaiting } from './sales-config-model'
import { WaitingNote } from './sales-config-section'
import { sentCopy } from './sales-config-copy'

/** Section 5.9 · how fast each of the six lead motions must be first
 *  touched. Each row proposes on its own and answers with a receipt.
 *
 *  Rows are NOT repainted on success: the change happens when somebody
 *  approves it, which arrives through a different screen.
 *
 *  Only `firstTouchMinutes` is shown. Receiving role, cold mail and
 *  self-filled form stay in the data but are hidden: no code reads them yet
 *  (ADR 0093 §5).
 *
 *  EMPTY IS A VALUE HERE. A box starts empty and reads as undeclared, because
 *  an invented placeholder would be read as agreed policy a month later.
 *  Clearing a box sends `null`, which un-declares the field. */
export function MotionSection() {
  const { t } = useI18n()
  const { data: rows, isPending, error, refetch } = useQuery(salesMotionsQuery())

  if (isPending) return <Skeleton className="h-64" />

  if (error || !rows) {
    return (
      <EmptyState
        tone="danger"
        icon={TriangleAlert}
        message={
          isApiError(error) ? `${t(COULD_NOT_LOAD)} ${userMessage(error)}` : t(COULD_NOT_LOAD)
        }
        action={{
          label: t(message('Thử lại', 'Try again', '다시 시도')),
          onClick: () => void refetch(),
        }}
        className="py-12"
      />
    )
  }

  /* Law 8 · the six rows are one list on one glass-b. */
  return (
    <GlassCard variant="b" className="flex flex-col gap-2 p-4">
      <MotionHead
        cols={POLICY_COLS}
        labels={[t(message('Phương án tiếp cận', 'Outreach motion', '접근 방식')), t(FIRST_TOUCH)]}
      />
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <MotionRow key={row.motion} row={row} />
        ))}
      </ul>
    </GlassCard>
  )
}

/** Fractions only — see `PICKER_COLS` in `lead-origins-motions.tsx`. */
const POLICY_COLS = 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]'

const COULD_NOT_LOAD = message(
  'Không tải được hạn liên hệ.',
  'Could not load the contact deadlines.',
  '연락 기한을 불러오지 못했습니다.',
)

const FIRST_TOUCH = message('Liên hệ lần đầu trong', 'First contact within', '첫 연락 기한')
const NOT_SET = message('chưa đặt', 'not set', '미설정')

const UNIT_LABEL: Record<FirstTouchUnit, Message> = {
  minute: message('phút', 'minutes', '분'),
  hour: message('giờ', 'hours', '시간'),
  day: message('ngày', 'days', '일'),
}

/** The stored deadline in words, for a reader who cannot propose. */
function firstTouchText(minutes: number | null, t: (copy: Message) => string): string {
  if (minutes === null) return t(NOT_SET)
  const { value, unit } = splitFirstTouch(minutes)
  return `${value} ${t(UNIT_LABEL[unit])}`.trim()
}

function MotionRow({ row }: { row: MotionPolicy }) {
  /* The route needs only `config.view`; without `config.propose` the row is
     plain text, the same rule `DeadlineBox` follows. */
  const { t, lang } = useI18n()
  const canPropose = useCan('config.propose')
  const split = row.firstTouchMinutes === null ? null : splitFirstTouch(row.firstTouchMinutes)

  const [value, setValue] = useState(split === null ? '' : String(split.value))
  const [unit, setUnit] = useState<FirstTouchUnit>(split?.unit ?? 'hour')

  const propose = useProposeMotion(row.motion)
  const name = row.label ?? leadMotionLabel(row.motion, lang)
  const waiting = motionWaiting(useMyConfigProposals(), row.motion)
  /* Sent is not saved: the boxes fall back to the stored row, so the row
     stops saying "not sent" and a second press cannot file a duplicate. */
  const sent = () => {
    setValue(split === null ? '' : String(split.value))
    setUnit(split?.unit ?? 'hour')
    toastDone(sentCopy())
  }

  /* Only a value that differs from the stored row travels. */
  const patch: MotionPolicyPatch = {}
  const minutes = value.trim() === '' ? null : firstTouchToMinutes(Number(value), unit)
  if (minutes !== row.firstTouchMinutes) patch.firstTouchMinutes = minutes

  const bad = value.trim() !== '' && !(Number(value) > 0)

  return (
    <li className={MOTION_ROW}>
      <div className={cn(MOTION_LINE, POLICY_COLS)}>
        <div className={MOTION_NAME}>
          <span className="text-[12.5px] font-semibold">{name}</span>
        </div>

        <MotionCell label={t(FIRST_TOUCH)}>
          {canPropose ? (
            <div className="flex gap-2">
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="numeric"
                placeholder={t(NOT_SET)}
                invalid={bad}
                aria-label={`${t(FIRST_TOUCH)} — ${name}`}
                className="pointer-coarse:h-12 tnum min-w-0 flex-1"
              />
              <Select
                label={`${t(message('Đơn vị', 'Unit', '단위'))} — ${name}`}
                hideLabel
                className="pointer-coarse:[&>button]:h-12"
                value={unit}
                onChange={(v) => setUnit(v as FirstTouchUnit)}
                options={FIRST_TOUCH_UNITS.map((u) => ({
                  value: u.unit,
                  label: t(UNIT_LABEL[u.unit]),
                }))}
              />
            </div>
          ) : (
            <span className="tnum font-num text-[12.5px]">
              {firstTouchText(row.firstTouchMinutes, t)}
            </span>
          )}
        </MotionCell>
      </div>
      <WaitingNote words={waiting.length > 0 ? waiting.join(' · ') : null} />

      {/* Sent, never saved: the row on screen is still the stored one, and it
          stays that way until somebody approves. */}
      {canPropose && (
        <MotionSend
          changed={Object.keys(patch).length}
          blocked={bad || propose.isPending}
          failure={isApiError(propose.error) ? userMessage(propose.error) : null}
          onSend={() => propose.mutate(patch, { onSuccess: sent })}
        />
      )}
    </li>
  )
}
