import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer, Lock, Select } from '@pv/ui'
import type { UserHoldingsResponse, UserRow } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { useLockUser, usersQuery } from '@/data/users'
import { StepFooter } from '@/components/step-footer'

/** Locking someone who still holds open sales work (ADR 0097 §7): the lock
 *  reads `GET /users/:id/holdings` first; nothing held locks as before,
 *  anything held asks who receives it and sends `handoverTo` with the lock.
 *  The server moves every lead, deal and next step in the same write. */

/** Who receives the work. Only active Sales accounts are offered; whatever
 *  the server still refuses (a role that cannot hold deals) prints under the
 *  picker as its field error. */
export function HandoverDrawer({
  user,
  holdings,
  onClose,
  onLocked,
}: {
  user: UserRow
  /** `null` = closed. */
  holdings: UserHoldingsResponse | null
  onClose: () => void
  onLocked: (row: UserRow) => void
}) {
  const [receiver, setReceiver] = useState('')
  const lock = useLockUser()
  const { reset } = lock
  const { data } = useQuery(usersQuery)
  const open = holdings !== null

  useEffect(() => {
    if (!open) return
    setReceiver('')
    reset()
  }, [open, reset])

  const options = (data?.rows ?? [])
    .filter((u) => u.id !== user.id && u.disabledAt === null && u.branches.includes('Sales'))
    .map((u) => ({ value: u.id, label: `${u.name} · ${u.role}` }))
  const fieldError = lock.error?.errors?.handoverTo?.[0]
  /* A 409 carries its own sentence (a deal still waiting for sign approval),
     so it shows even beside a field error — unless it only repeats it. */
  const footerError =
    lock.error &&
    (!fieldError || (lock.error.kind === 'conflict' && userMessage(lock.error) !== fieldError))
      ? lock.error
      : null
  const receiverName = data?.rows.find((u) => u.id === receiver)?.name

  const confirm = () =>
    lock.mutate(
      { id: user.id, disabled: true, handoverTo: receiver },
      {
        onSuccess: (row) => {
          toastDone(
            'Đã khoá tài khoản',
            `${row.name} không đăng nhập được nữa. Việc đã chuyển cho ${receiverName ?? 'người nhận'}.`,
          )
          onLocked(row)
          onClose()
        },
      },
    )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Khoá ${user.name}`}
      subtitle={
        holdings &&
        heldLine(holdings) && <span className="tnum">Đang phụ trách {heldLine(holdings)}.</span>
      }
      footer={
        <StepFooter
          error={footerError}
          pending={lock.isPending}
          hint={
            receiver === '' ? 'Chọn người nhận việc.' : `${user.name} không đăng nhập được nữa.`
          }
          onClose={onClose}
          confirm={{
            icon: Lock,
            label: 'Khoá và chuyển việc',
            disabled: receiver === '',
            onClick: confirm,
          }}
        />
      }
    >
      <div className="flex flex-col gap-2">
        {options.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">Chưa có ai khác ở Sales để nhận việc.</p>
        ) : (
          <Select
            label="Người nhận việc"
            size="lg"
            value={receiver}
            options={[{ value: '', label: 'Chọn người' }, ...options]}
            onChange={(v) => {
              setReceiver(v)
              reset()
            }}
          />
        )}
        <p
          role={fieldError ? 'alert' : undefined}
          className={
            fieldError
              ? 'text-destructive-foreground m-0 text-[11.5px]'
              : 'text-muted-foreground m-0 text-[11.5px]'
          }
        >
          {fieldError ??
            'Lead, cơ hội và việc tiếp theo chuyển sang người này. Cơ hội đang chờ duyệt ký giữ nguyên.'}
        </p>
        {holdings && offLine(holdings) ? (
          <p className="text-muted-foreground tnum m-0 text-[11.5px]">
            {heldLine(holdings)
              ? `Kèm ${offLine(holdings)}.`
              : `${capitalize(offLine(holdings))} chuyển sang người này.`}
          </p>
        ) : null}
      </div>
    </Drawer>
  )
}

/** The counted work, a kind at zero left out — switched-off leads have their own note. */
const heldLine = (h: UserHoldingsResponse) =>
  [
    [h.leads, 'lead'],
    [h.opportunities, 'cơ hội'],
    [h.nextSteps, 'việc tiếp theo'],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, noun]) => `${Number(n).toLocaleString('vi-VN')} ${noun}`)
    .join(', ')

/** Work on switched-off leads: the leads when the leaver holds some, else
 *  only deals or steps on them, which have no count of their own. */
const offLine = (h: UserHoldingsResponse) =>
  h.switchedOffLeads > 0
    ? `${h.switchedOffLeads.toLocaleString('vi-VN')} lead đã vô hiệu`
    : h.switchedOffOther > 0
      ? 'việc trên lead đã vô hiệu'
      : ''

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
