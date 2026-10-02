import { useEffect, useState } from 'react'
import { Timer, X, type IconGlyph } from '@pv/ui'
import { Button, Drawer, Icon, cn } from '@pv/ui'
import { LEAD_STATE_LABEL, LEAD_STOP_REASON_OTHER, type LeadProfile } from '@pv/contracts'
import { userMessage, type ApiError } from '@/app/api'
import { toastDone } from '@/app/toast'
import { StopReasonField } from '@/components/exit-dialog'
import { useNurtureLead } from '@/data/lead-exit'

/** The drawer behind the PIC's parking step (ADR 0063) — opened from the
 *  lead profile's more menu. Every door answers a 409 when the state moved
 *  under the reader; the drawer prints the server's own sentence and stays
 *  open. */

/** `verifying` | `working` → `nurturing`. Reason and note come from the same
 *  `EXIT_REASON` catalogue the exit door reads (ADR 0070, `StopReasonField`):
 *  parking is a stop event too, so it is counted the same way a disqualify is. */
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
  const nurture = useNurtureLead(profile.code)
  const { reset } = nurture

  useEffect(() => {
    if (open) {
      setReasonKey('')
      setNote('')
      reset()
    }
  }, [open, reset])

  const ready = reasonKey !== '' && (reasonKey !== LEAD_STOP_REASON_OTHER || note.trim() !== '')

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
          what={`khách chưa sẵn sàng. Lead không tự hết hạn ở đây — một lần liên hệ thật sẽ đưa lead quay lại, và chỉ người mới bấm ${LEAD_STATE_LABEL.disqualified} được.`}
        />
      }
      footer={
        <StepFooter
          error={nurture.error}
          pending={nurture.isPending}
          hint={
            ready
              ? 'Ghi ngay, không cần ai duyệt. Bấm Chăm lại khi khách có tín hiệu mới.'
              : 'Chọn một lý do để bật nút.'
          }
          onClose={onClose}
          confirm={{
            icon: Timer,
            label: `Chuyển sang ${LEAD_STATE_LABEL.nurturing}`,
            disabled: !ready,
            onClick: () => {
              const trimmed = note.trim()
              nurture.mutate(
                { reasonKey, ...(trimmed === '' ? {} : { note: trimmed }) },
                {
                  onSuccess: () =>
                    done(`Đã chuyển ${profile.code} sang ${LEAD_STATE_LABEL.nurturing}.`, onClose),
                },
              )
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
      <span className="font-mono">{profile.code}</span> · {profile.company} — {what}
    </>
  )
}

/** Same footer as `ExitDialog`: one live sentence on the left (the server's
 *  refusal wins), cancel and confirm on the right. */
function StepFooter({
  error,
  pending,
  hint,
  onClose,
  confirm,
}: {
  error: ApiError | null
  pending: boolean
  hint: string
  onClose: () => void
  confirm: { icon: IconGlyph; label: string; disabled: boolean; onClick: () => void }
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <span
        className={cn(
          'text-[11.5px] leading-[1.5]',
          error ? 'text-destructive-foreground' : 'text-foreground',
        )}
        aria-live="polite"
      >
        {error ? userMessage(error) : pending ? 'Đang ghi…' : hint}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={onClose}>
          <Icon icon={X} size={16} />
          Huỷ
        </Button>
        <Button
          size="md"
          className="pointer-coarse:h-12"
          disabled={confirm.disabled || pending}
          onClick={confirm.onClick}
        >
          <Icon icon={confirm.icon} size={16} />
          {confirm.label}
        </Button>
      </div>
    </div>
  )
}
