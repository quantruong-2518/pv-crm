import { useEffect, useState } from 'react'
import { Drawer, Timer } from '@pv/ui'
import { LEAD_STATE_LABEL, LEAD_STOP_REASON_OTHER, type LeadProfile } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { StopReasonField } from '@/components/exit-dialog'
import { StepFooter } from '@/components/step-footer'
import { LabelPicker } from '@/components/lead-labels'
import { useNurtureLead } from '@/data/lead-exit'
import { useEndLeadHold } from '@/data/holds'
import { sameLabels, useSetLeadLabels } from '@/data/lead-labels'

/** The drawer behind the PIC's parking step (ADR 0063) — opened from the
 *  lead profile's more menu. Every door answers a 409 when the state moved
 *  under the reader; the drawer prints the server's own sentence and stays
 *  open. */

/** Into `nurturing` (ADR 0097 §1). Reason and note come from the same
 *  `EXIT_REASON` catalogue the exit door reads (ADR 0070, `StopReasonField`):
 *  parking is a stop event too, so it is counted the same way a disqualify is.
 *  A held lead goes through `hold/end` instead, which parks it the same way.
 *  Labels ride a second write once the lead is parked — the park body has none. */
export function NurtureDialog({
  profile,
  open,
  onClose,
}: {
  profile: LeadProfile
  open: boolean
  onClose: () => void
}) {
  const [reasonKey, setReasonKey] = useState('')
  const [note, setNote] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const nurture = useNurtureLead(profile.code)
  const endHold = useEndLeadHold(profile.code)
  const saveLabels = useSetLeadLabels(profile.code)
  const held = profile.hold !== null
  const door = held ? endHold : nurture
  const { reset } = nurture
  const { reset: resetEnd } = endHold
  const current = profile.labels.map((l) => l.id)
  const seedLabels = current.join(',')

  useEffect(() => {
    if (open) {
      setReasonKey('')
      setNote('')
      setLabels(seedLabels === '' ? [] : seedLabels.split(','))
      reset()
      resetEnd()
    }
  }, [open, reset, resetEnd, seedLabels])

  const ready = reasonKey !== '' && (reasonKey !== LEAD_STOP_REASON_OTHER || note.trim() !== '')
  const parked = () => {
    const message = `Đã chuyển ${profile.code} sang ${LEAD_STATE_LABEL.nurturing}.`
    if (sameLabels(labels, current)) return done(message, onClose)
    saveLabels.mutate(
      { labelIds: labels },
      {
        onSuccess: () => done(message, onClose),
        onError: (e) => {
          toastFail(`${message} Chưa lưu được nhãn.`, userMessage(e))
          onClose()
        },
      },
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={LEAD_STATE_LABEL.nurturing}
      subtitle={
        <Subject
          profile={profile}
          /* ADR 0068: a parked lead never expires on its own — only a real
             touch wakes it, or a person presses the disqualify button. */
          what="Khách chưa sẵn sàng. Có liên hệ thật thì lead quay lại."
        />
      }
      footer={
        <StepFooter
          error={door.error}
          pending={door.isPending || saveLabels.isPending}
          hint={ready ? 'Ghi ngay, không cần duyệt.' : 'Chọn lý do.'}
          onClose={onClose}
          confirm={{
            icon: Timer,
            label: `Chuyển sang ${LEAD_STATE_LABEL.nurturing}`,
            disabled: !ready,
            onClick: () => {
              const trimmed = note.trim()
              const body = { reasonKey, ...(trimmed === '' ? {} : { note: trimmed }) }
              if (held) endHold.mutate({ to: 'waiting', ...body }, { onSuccess: parked })
              else nurture.mutate(body, { onSuccess: parked })
            },
          }}
        />
      }
    >
      <StopReasonField
        reasonKey={reasonKey}
        onReasonChange={setReasonKey}
        note={note}
        onNoteChange={setNote}
        notePlaceholder="Khách hẹn quay lại khi nào, chờ điều gì…"
      />
      <div className="mt-6 flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">Nhãn nhóm chờ</span>
        <LabelPicker value={labels} onChange={setLabels} disabled={door.isPending} />
      </div>
    </Drawer>
  )
}

function done(message: string, onClose: () => void) {
  toastDone(message)
  onClose()
}

function Subject({ profile, what }: { profile: LeadProfile; what: string }) {
  return (
    <>
      <span className="font-mono">{profile.code}</span> · {profile.company}. {what}
    </>
  )
}
