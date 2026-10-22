import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer, Input, Save, Select } from '@pv/ui'
import { KpiAbsenceCreate, vnDayOf, type KpiAbsence } from '@pv/contracts'
import { toastDone } from '@/app/toast'
import { StepFooter } from '@/components/step-footer'
import { kpiStandInsQuery, useKpiAbsenceWrite } from '@/data/kpi-absence'

/** Declare an absence, or move the end of one (ADR 0117). With `editing` only the
 *  end day is open: a running absence cannot start earlier or later (default 4).
 *  `actorId` is set when a target setter declares for someone else.
 *
 *  The form checks what the contract's refine can know; today, overlap and who is
 *  eligible are the server's, and its refusal prints in the footer. */

const NONE = ''
const LABEL = 'text-muted-foreground text-[11px]'

/** The first sentence the contract has against the form, or the missing field. */
function hintOf(fromDay: string, toDay: string, standInId: string, actorId?: string): string {
  if (fromDay === '' || toDay === '') return 'Chọn ngày bắt đầu và ngày kết thúc.'
  const parsed = KpiAbsenceCreate.safeParse({ actorId, fromDay, toDay, standInId })
  return parsed.success ? '' : (parsed.error.issues[0]?.message ?? '')
}

export function AbsenceForm({
  open,
  onClose,
  actorId,
  who,
  editing,
}: {
  open: boolean
  onClose: () => void
  /** Someone else's absence, declared by a target setter. */
  actorId?: string
  /** That person's name, for the subtitle. */
  who?: string
  editing: KpiAbsence | null
}) {
  const [fromDay, setFromDay] = useState('')
  const [toDay, setToDay] = useState('')
  const [standInId, setStandInId] = useState(NONE)
  const write = useKpiAbsenceWrite()
  const { reset } = write
  const candidates = useQuery(kpiStandInsQuery(actorId, open && editing === null))
  const today = vnDayOf(new Date())

  const seedTo = editing?.toDay ?? ''
  useEffect(() => {
    if (!open) return
    setFromDay('')
    setToDay(seedTo)
    setStandInId(NONE)
    reset()
  }, [open, seedTo, reset])

  const options = candidates.data?.candidates ?? []
  const nobody = candidates.isSuccess && options.length === 0
  const hint = editing
    ? hintOf(editing.fromDay, toDay, editing.standIn.actorId)
    : nobody
      ? 'Không có ai làm thay được.'
      : hintOf(fromDay, toDay, standInId, actorId)
  const unchanged = editing !== null && toDay === editing.toDay
  const finish = (message: string) => {
    toastDone(message)
    onClose()
  }
  const submit = () =>
    editing
      ? write.mutate(
          { kind: 'end', absenceId: editing.id, toDay },
          { onSuccess: () => finish('Đã đổi ngày kết thúc.') },
        )
      : write.mutate(
          { kind: 'declare', body: { actorId, fromDay, toDay, standInId } },
          { onSuccess: () => finish('Đã khai vắng.') },
        )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? 'Sửa ngày kết thúc' : 'Khai vắng'}
      subtitle={who}
      footer={
        <StepFooter
          error={write.error}
          pending={write.isPending}
          hint={hint}
          onClose={onClose}
          confirm={{
            icon: Save,
            label: 'Lưu',
            disabled: hint !== '' || unchanged,
            onClick: submit,
          }}
        />
      }
    >
      <div className="flex flex-col gap-6">
        {!editing && (
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Từ ngày</span>
            <Input
              type="date"
              value={fromDay}
              min={today}
              aria-required
              className="h-12"
              onChange={(e) => setFromDay(e.target.value)}
            />
          </label>
        )}
        <label className="flex flex-col gap-2">
          <span className={LABEL}>Đến ngày</span>
          <Input
            type="date"
            value={toDay}
            min={editing ? (editing.fromDay > today ? editing.fromDay : today) : fromDay || today}
            aria-required
            className="h-12"
            onChange={(e) => setToDay(e.target.value)}
          />
        </label>
        {!editing && (
          <Select
            label="Người làm thay"
            size="lg"
            required
            value={standInId}
            onChange={setStandInId}
            options={[
              { value: NONE, label: 'Chọn người làm thay' },
              ...options.map((c) => ({ value: c.actorId, label: c.name })),
            ]}
          />
        )}
      </div>
    </Drawer>
  )
}
