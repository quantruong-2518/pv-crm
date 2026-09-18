import { useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck, Timer, X, type IconGlyph } from '@pv/ui'
import { Button, Drawer, Icon, Select, Textarea, cn } from '@pv/ui'
import { LeadTier, type LeadProfile } from '@pv/contracts'
import { userMessage, type ApiError } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { useNurtureLead, useResumeLead, useVerifyLead } from '@/data/lead-exit'
import { LEAD_STATE_FACE, TIER_CHOICES } from '@/data/lead-state'

/** The PIC's own lifecycle steps (ADR 0058) — the one forward step a state
 *  offers, standing in the toolbar, and the two drawers behind them.
 *
 *  Only `verifying` and `nurturing` get a bar button: those are the two states
 *  that wait on a person's call. Parking a lead (`nurture`) is rarer, so it sits
 *  in the `…` menu. Every door answers a 409 when the state moved under the
 *  reader; the drawer prints the server's own sentence and stays open. */
export function LeadStepButton({
  lead,
  canEdit,
  onVerify,
}: {
  lead: LeadProfile
  canEdit: boolean
  onVerify: () => void
}) {
  const resume = useResumeLead(lead.code)
  const locked = canEdit ? undefined : 'Cần quyền sửa lead.'

  if (lead.state === 'verifying') {
    return (
      <Button
        size="md"
        variant="secondary"
        className="pointer-coarse:h-12"
        disabled={!canEdit}
        title={locked}
        onClick={onVerify}
      >
        <Icon icon={ShieldCheck} size={16} />
        Xác minh xong
      </Button>
    )
  }

  if (lead.state !== 'nurturing') return null

  return (
    <Button
      size="md"
      variant="secondary"
      className="pointer-coarse:h-12"
      disabled={!canEdit || resume.isPending}
      title={locked}
      onClick={() =>
        resume.mutate(undefined, {
          /* No tier yet → the server resumes to `verifying`, not `working`. */
          onSuccess: (next) =>
            toastDone(`${lead.code} chuyển sang ${LEAD_STATE_FACE[next.state].label}.`),
          onError: (error) => toastFail('Không chăm lại được lead.', userMessage(error)),
        })
      }
    >
      <Icon icon={RefreshCw} size={16} />
      {resume.isPending ? 'Đang ghi…' : 'Chăm lại'}
    </Button>
  )
}

/** `verifying` → `working`: the tier is REQUIRED here, since this is the one
 *  step that sets it (`LeadVerifyBody`). */
export function VerifyDialog({
  profile,
  open,
  onClose,
}: {
  profile: LeadProfile
  open: boolean
  onClose: () => void
}) {
  const [tier, setTier] = useState('')
  const verify = useVerifyLead(profile.code)
  const { reset } = verify
  const picked = LeadTier.safeParse(tier)

  useEffect(() => {
    if (open) {
      setTier('')
      reset()
    }
  }, [open, reset])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Xác minh xong lead"
      subtitle={<Subject profile={profile} what="chuyển sang Đang chăm, kèm bậc của lead." />}
      footer={
        <StepFooter
          error={verify.error}
          pending={verify.isPending}
          hint={picked.success ? 'Ghi ngay, không cần ai duyệt.' : 'Chọn bậc để bật nút.'}
          onClose={onClose}
          confirm={{
            icon: ShieldCheck,
            label: 'Xác nhận đã xác minh',
            disabled: !picked.success,
            onClick: () => {
              if (!picked.success) return
              verify.mutate(
                { tier: picked.data },
                { onSuccess: () => done(`Đã xác minh ${profile.code}.`, onClose) },
              )
            },
          }}
        />
      }
    >
      <Select
        label="Bậc"
        value={tier}
        neutralValue=""
        onChange={setTier}
        className="w-full"
        options={[
          { value: '', label: '— chọn một bậc —' },
          ...TIER_CHOICES.map((t) => ({ value: t.key, label: t.label })),
        ]}
      />
    </Drawer>
  )
}

/** `verifying` | `working` → `nurturing`. The note is optional: "not ready" is
 *  already the whole reason, and a required box would collect filler. */
export function NurtureDialog({
  profile,
  open,
  onClose,
}: {
  profile: LeadProfile
  open: boolean
  onClose: () => void
}) {
  const [note, setNote] = useState('')
  const nurture = useNurtureLead(profile.code)
  const { reset } = nurture

  useEffect(() => {
    if (open) {
      setNote('')
      reset()
    }
  }, [open, reset])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Nuôi dài hạn"
      subtitle={
        <Subject
          profile={profile}
          what="khách chưa sẵn sàng. Để lâu không chăm lại, hệ thống tự chuyển lead vào Lưu trữ."
        />
      }
      footer={
        <StepFooter
          error={nurture.error}
          pending={nurture.isPending}
          hint="Ghi ngay, không cần ai duyệt. Bấm Chăm lại khi khách có tín hiệu mới."
          onClose={onClose}
          confirm={{
            icon: Timer,
            label: 'Chuyển sang nuôi dài hạn',
            disabled: false,
            onClick: () => {
              const trimmed = note.trim()
              nurture.mutate(trimmed === '' ? {} : { note: trimmed }, {
                onSuccess: () => done(`Đã chuyển ${profile.code} sang nuôi dài hạn.`, onClose),
              })
            },
          }}
        />
      }
    >
      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">Ghi chú</span>
        <Textarea
          autoGrow
          rows={3}
          value={note}
          aria-label="Ghi chú khi chuyển nuôi dài hạn"
          placeholder="Khách hẹn quay lại khi nào, chờ điều gì…"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
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
