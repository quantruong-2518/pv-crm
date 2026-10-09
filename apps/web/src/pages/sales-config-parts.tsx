import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { EmptyState, GlassCard, Input, MetaPill, Select, Skeleton, TriangleAlert, cn } from '@pv/ui'
import {
  FIRST_TOUCH_UNITS,
  firstTouchToMinutes,
  splitFirstTouch,
  type FirstTouchUnit,
  type MotionPolicy,
  type MotionPolicyPatch,
  type RoleId,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { ROLE_OPTIONS } from '@/data/users'
import { motionLabelOf, salesMotionsQuery, useProposeMotion } from '@/data/sales-motions'
import {
  MOTION_LINE,
  MOTION_NAME,
  MOTION_ROW,
  MotionCell,
  MotionHead,
  MotionSend,
} from './lead-origins-motions'
import { SENT } from './sales-config-section'

/** Section 5.9 · what each of the six lead motions declares. Each row
 *  proposes on its own and answers with a receipt.
 *
 *  Rows are NOT repainted on success, and that is the point rather than an
 *  omission: the change has not happened. It happens when somebody approves it,
 *  which arrives through a different screen.
 *
 *  EMPTY IS A VALUE HERE. Every box starts empty and reads as undeclared,
 *  because these numbers do not exist yet and must not be invented: a
 *  placeholder showing "3" would be an invented policy that somebody reads as
 *  agreed a month later. Clearing a box is its own decision: it sends `null`,
 *  which un-declares the field rather than leaving it untouched. */
export function MotionSection() {
  const { data: rows, isPending, error, refetch } = useQuery(salesMotionsQuery())

  if (isPending) return <Skeleton className="h-64" />

  if (error || !rows) {
    return (
      <EmptyState
        icon={TriangleAlert}
        message={`Không đọc được thiết lập luồng. ${
          isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
        }`}
        action={{ label: 'Thử lại', onClick: () => void refetch() }}
        className="py-12"
      />
    )
  }

  /* Law 8 · the six rows are one list on one glass-b. */
  return (
    <GlassCard variant="b" className="flex flex-col gap-2 p-4">
      <MotionHead
        cols={POLICY_COLS}
        labels={[
          'Phương án',
          'Chạm đầu trong',
          'Người nhận',
          'Vào chiến dịch mail lạnh',
          'Form khách tự điền tính là đủ ô',
        ]}
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
const POLICY_COLS = 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]'

/** `Select` sizes its own trigger, so the touch height has to reach inside. */
const SELECT_FILL = 'pointer-coarse:[&>button]:h-12 w-full'

/** Three answers, and "not declared" is one of them.
 *
 *  `''` on the wire of a `<select>` is the absent answer — a tri-state that a
 *  checkbox cannot carry, which is why these are selects. */
const TRI = (yes: string, no: string) => [
  { value: '', label: 'chưa khai' },
  { value: 'yes', label: yes },
  { value: 'no', label: no },
]

const triOf = (v: boolean | null): string => (v === null ? '' : v ? 'yes' : 'no')
const triBack = (v: string): boolean | null => (v === '' ? null : v === 'yes')

function MotionRow({ row }: { row: MotionPolicy }) {
  const split = row.firstTouchMinutes === null ? null : splitFirstTouch(row.firstTouchMinutes)

  const [value, setValue] = useState(split === null ? '' : String(split.value))
  const [unit, setUnit] = useState<FirstTouchUnit>(split?.unit ?? 'hour')
  const [owner, setOwner] = useState<RoleId | ''>(row.ownerRoleId ?? '')
  const [cold, setCold] = useState(triOf(row.coldMailAllowed))
  const [selfServe, setSelfServe] = useState(triOf(row.selfServeCountsAsInitData))

  const propose = useProposeMotion(row.motion)
  const name = motionLabelOf(row)
  /* Sent is not saved: the boxes fall back to the stored row, so the row
     stops saying "not sent" and a second press cannot file a duplicate. */
  const sent = () => {
    setValue(split === null ? '' : String(split.value))
    setUnit(split?.unit ?? 'hour')
    setOwner(row.ownerRoleId ?? '')
    setCold(triOf(row.coldMailAllowed))
    setSelfServe(triOf(row.selfServeCountsAsInitData))
    toastDone(SENT)
  }

  /* Only what actually differs from the stored row travels. Sending every box
     every time would make a request that claims to change four things when the
     person moved one — and the approver reads that claim. */
  const patch: MotionPolicyPatch = {}
  const minutes = value.trim() === '' ? null : firstTouchToMinutes(Number(value), unit)
  if (minutes !== row.firstTouchMinutes) patch.firstTouchMinutes = minutes
  if ((owner || null) !== row.ownerRoleId) patch.ownerRoleId = owner === '' ? null : owner
  if (triBack(cold) !== row.coldMailAllowed) patch.coldMailAllowed = triBack(cold)
  if (triBack(selfServe) !== row.selfServeCountsAsInitData) {
    patch.selfServeCountsAsInitData = triBack(selfServe)
  }

  const bad = value.trim() !== '' && !(Number(value) > 0)

  return (
    <li className={MOTION_ROW}>
      <div className={cn(MOTION_LINE, POLICY_COLS)}>
        <div className={MOTION_NAME}>
          <span className="text-[12.5px] font-semibold">{name}</span>
          {row.firstTouchMinutes === null &&
          row.ownerRoleId === null &&
          row.coldMailAllowed === null &&
          row.selfServeCountsAsInitData === null ? (
            <MetaPill>chưa khai gì</MetaPill>
          ) : null}
        </div>

        <MotionCell label="Chạm đầu trong">
          <div className="flex gap-2">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="numeric"
              placeholder="chưa khai"
              invalid={bad}
              aria-label={`Chạm đầu trong — ${name}`}
              className="pointer-coarse:h-12 tnum min-w-0 flex-1"
            />
            <Select
              label={`Đơn vị — ${name}`}
              hideLabel
              className="pointer-coarse:[&>button]:h-12"
              value={unit}
              onChange={(v) => setUnit(v as FirstTouchUnit)}
              options={FIRST_TOUCH_UNITS.map((u) => ({ value: u.unit, label: u.label }))}
            />
          </div>
        </MotionCell>

        <MotionCell label="Người nhận">
          <Select
            label={`Người nhận — ${name}`}
            hideLabel
            className={SELECT_FILL}
            value={owner}
            /* `Select` speaks strings; the seven ids are the only values it is
               given, so the cast narrows rather than assumes. */
            onChange={(v) => setOwner(v as RoleId | '')}
            options={[{ value: '', label: 'chưa khai' }, ...ROLE_OPTIONS]}
          />
        </MotionCell>

        <MotionCell label="Vào chiến dịch mail lạnh">
          <Select
            label={`Vào chiến dịch mail lạnh — ${name}`}
            hideLabel
            className={SELECT_FILL}
            value={cold}
            onChange={setCold}
            options={TRI('được', 'KHÔNG được')}
          />
        </MotionCell>

        <MotionCell label="Form khách tự điền tính là đủ ô">
          <Select
            label={`Form khách tự điền tính là đủ ô — ${name}`}
            hideLabel
            className={SELECT_FILL}
            value={selfServe}
            onChange={setSelfServe}
            options={TRI('tính', 'không tính')}
          />
        </MotionCell>
      </div>

      {/* Sent, never saved: the row on screen is still the stored one, and it
          stays that way until somebody approves. */}
      <MotionSend
        changed={Object.keys(patch).length}
        blocked={bad || propose.isPending}
        failure={isApiError(propose.error) ? userMessage(propose.error) : null}
        onSend={() => propose.mutate(patch, { onSuccess: sent })}
      />
    </li>
  )
}
