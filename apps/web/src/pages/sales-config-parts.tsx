import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Send, TriangleAlert } from '@pv/ui'
import { Button, EmptyState, Icon, Input, MetaPill, Select, Skeleton } from '@pv/ui'
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
import { ROLE_LABEL, ROLE_OPTIONS } from '@/data/users'
import { salesMotionsQuery, useProposeMotion } from '@/data/sales-motions'

/** Section 5.9 · what each of the six lead motions declares.
 *
 *  ------------------------------------------------------------------
 *  THE ONLY SECTION ON THIS SCREEN THAT REACHES THE SERVER
 *  ------------------------------------------------------------------
 *  The eight sections above it collect changes into a local array and a send
 *  button that clears the array — the propose-then-approve shape, acted rather
 *  than wired, because until 14/09 there was nowhere to put a request. There is
 *  now (`platform.approval`), so this section does the real thing: each row
 *  proposes on its own and answers with a receipt.
 *
 *  Rows are NOT repainted on success, and that is the point rather than an
 *  omission: the change has not happened. It happens when somebody approves it,
 *  which arrives through a different screen. Anything else would be the same
 *  lie the sections above tell, only with a network call behind it.
 *
 *  ------------------------------------------------------------------
 *  EMPTY IS A VALUE HERE
 *  ------------------------------------------------------------------
 *  Every box starts empty and reads as undeclared, because §8.5 of
 *  `docs/tam-nhin-pipeline-toan-he.md` says these numbers do not exist yet and
 *  must not be invented. A placeholder showing "3" would be an invented policy
 *  that somebody reads as agreed a month later. Clearing a box is its own
 *  decision: it sends `null`, which un-declares the field rather than leaving
 *  it untouched. */
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

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <MotionRow key={row.motion} row={row} />
      ))}
    </div>
  )
}

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

  const dirty = Object.keys(patch).length > 0
  const bad = value.trim() !== '' && !(Number(value) > 0)
  const failure = isApiError(propose.error) ? userMessage(propose.error) : null

  return (
    <div className="glass-b flex flex-col gap-3 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display text-[13.5px] font-semibold">{row.motion}</span>
        {row.firstTouchMinutes === null &&
        row.ownerRoleId === null &&
        row.coldMailAllowed === null &&
        row.selfServeCountsAsInitData === null ? (
          <MetaPill>chưa khai gì</MetaPill>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Chạm đầu trong</span>
          <div className="flex gap-2">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="numeric"
              placeholder="chưa khai"
              invalid={bad}
              aria-label={`Chạm đầu trong — ${row.motion}`}
              className="min-w-0 flex-1"
            />
            <Select
              label="Đơn vị"
              hideLabel
              value={unit}
              onChange={(v) => setUnit(v as FirstTouchUnit)}
              options={FIRST_TOUCH_UNITS.map((u) => ({ value: u.unit, label: u.label }))}
            />
          </div>
        </div>

        <Select
          label="Người nhận"
          value={owner}
          /* `Select` speaks strings; the seven ids are the only values it is
             given, so the cast narrows rather than assumes. */
          onChange={(v) => setOwner(v as RoleId | '')}
          options={[{ value: '', label: 'chưa khai' }, ...ROLE_OPTIONS]}
        />

        <Select
          label="Vào chiến dịch mail lạnh"
          value={cold}
          onChange={setCold}
          options={TRI('được', 'KHÔNG được')}
        />

        <Select
          label="Form khách tự điền tính là đủ ô"
          value={selfServe}
          onChange={setSelfServe}
          options={TRI('tính', 'không tính')}
        />
      </div>

      {failure ? (
        <p role="alert" className="text-destructive-foreground text-[11.5px] leading-[1.5]">
          {failure}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="md"
          disabled={!dirty || bad || propose.isPending}
          onClick={() =>
            propose.mutate(patch, {
              /* Sent, never saved: the row on screen is still the stored one,
                 and it stays that way until somebody approves. */
              onSuccess: () => toastDone('Đã gửi đề nghị · chờ Giám đốc gật.'),
            })
          }
        >
          <Icon icon={Send} size={16} />
          Gửi đề nghị
        </Button>

        {dirty ? (
          <span className="text-muted-foreground text-[11.5px]">
            {Object.keys(patch).length} ô đổi · chưa gửi
          </span>
        ) : null}

        {row.ownerRoleId ? (
          <span className="text-muted-foreground text-[11.5px]">
            đang khai: {ROLE_LABEL[row.ownerRoleId]}
          </span>
        ) : null}
      </div>
    </div>
  )
}
