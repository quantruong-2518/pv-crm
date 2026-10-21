import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Drawer, Timer } from '@pv/ui'
import { LEAD_STATE_LABEL, LEAD_STOP_REASON_OTHER, type LeadProfile } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { MeetingsCancelNote } from '@/components/meetings-cancel-note'
import { StopReasonField } from '@/components/stop-reason-field'
import { StepFooter } from '@/components/step-footer'
import { LabelPicker } from '@/components/lead-labels'
import { useNurtureLead } from '@/data/lead-exit'
import { useEndLeadHold } from '@/data/holds'
import { sameLabels, useSetLeadLabels } from '@/data/lead-labels'
import { meetingsCancelled } from '@/data/meetings'

/** The drawer behind the one park door (ADR 0109) — opened from the lead
 *  profile's more menu and from a hold's strip. The door answers a 409 when
 *  the state moved under the reader; the drawer prints the server's own
 *  sentence and stays open. */

/** Into the nurturing pool, which has no holder. Reason and note come from the
 *  `EXIT_REASON` catalogue (ADR 0070, `StopReasonField`). A held lead goes
 *  through `hold/end` instead, which parks it the same way. Labels ride a
 *  second write once the lead is parked — the park body has none. */
export function NurtureDialog({
  profile,
  open,
  onClose,
}: {
  profile: LeadProfile
  open: boolean
  onClose: () => void
}) {
  const client = useQueryClient()
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
    meetingsCancelled(client)
    const message = `Đã chuyển ${profile.code} vào ${LEAD_STATE_LABEL.nurturing}.`
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
      title={`Chuyển vào ${LEAD_STATE_LABEL.nurturing}`}
      subtitle={
        <>
          <span className="font-mono">{profile.code}</span> · {profile.company}. Lead về kho chung,
          ai cũng nhận lại được.
        </>
      }
      footer={
        <StepFooter
          error={door.error}
          pending={door.isPending || saveLabels.isPending}
          hint={ready ? 'Ghi ngay, không cần duyệt.' : 'Chọn lý do.'}
          onClose={onClose}
          confirm={{
            icon: Timer,
            label: `Chuyển vào ${LEAD_STATE_LABEL.nurturing}`,
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
      <div className="mt-6 empty:hidden">
        <MeetingsCancelNote enabled={open} subjects={[{ kind: 'lead', code: profile.code }]} />
      </div>
    </Drawer>
  )
}

function done(message: string, onClose: () => void) {
  toastDone(message)
  onClose()
}
