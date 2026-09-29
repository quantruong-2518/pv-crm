import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlert, X } from '@pv/ui'
import { Button, Drawer, Icon, Select, Textarea, cn } from '@pv/ui'
import { LEAD_STOP_REASON_OTHER, type LeadProfile } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { leadStopReasonsQuery } from '@/data/leads'
import { useExitLead } from '@/data/lead-exit'

/** Take a lead out of the funnel — a dialog, not a card sitting on the screen.
 *
 *  A rare action, so it costs one extra step: a toolbar button, then a reason
 *  here. It writes at once with no approval, and the profile's "Mở lại lead"
 *  undoes it (`docs/decisions/0057-seven-sales-pipeline-decisions.md`, decision 2).
 *
 *  Reasons come from the `EXIT_REASON` config catalogue, shared with the
 *  "Nhóm chờ chăm sóc" door (ADR 0070) via `StopReasonField` below. A 409
 *  (open deal, already signed) prints the server's sentence and the dialog
 *  stays open. */
export function ExitDialog({
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
  const exit = useExitLead(profile.code)
  const { reset } = exit

  /* Reopening starts fresh: the previous Cancel was an answer, and a refusal
     from last time is about a state that may have changed since. */
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
      title="Lead có vấn đề"
      subtitle={
        <>
          <span className="font-mono">{profile.code}</span> · {profile.company} — đưa ra khỏi luồng
          là dừng lead lại. Sổ vẫn giữ dòng này, và mở lại được khi khách quay lại.
        </>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            className={cn(
              'text-[11.5px] leading-[1.5]',
              exit.error ? 'text-destructive-foreground' : 'text-foreground',
            )}
            aria-live="polite"
          >
            {exit.error
              ? userMessage(exit.error)
              : exit.isPending
                ? 'Đang ghi…'
                : !ready
                  ? 'Chọn một lý do để bật nút.'
                  : 'Ghi ngay, không cần ai duyệt. Công trạng của nguồn kéo lead về vẫn giữ.'}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="md" variant="ghost" onClick={onClose}>
              <Icon icon={X} size={16} />
              Huỷ
            </Button>
            <Button
              size="md"
              variant="destructive"
              disabled={!ready || exit.isPending}
              onClick={() => {
                if (!ready) return
                const trimmed = note.trim()
                exit.mutate(
                  { reasonKey, ...(trimmed === '' ? {} : { note: trimmed }) },
                  {
                    onSuccess: () => {
                      toastDone(`Đã đưa ${profile.code} ra khỏi luồng.`)
                      onClose()
                    },
                  },
                )
              }}
            >
              <Icon icon={TriangleAlert} size={16} />
              Đưa ra khỏi luồng
            </Button>
          </div>
        </div>
      }
    >
      <StopReasonField
        reasonKey={reasonKey}
        onReasonChange={setReasonKey}
        note={note}
        onNoteChange={setNote}
      />
    </Drawer>
  )
}

/** The reason picker shared by both stop doors (ADR 0070) — this dialog and
 *  `NurtureDialog` (`lead-state-actions.tsx`). One catalogue, `EXIT_REASON`,
 *  plus the virtual `'other'` key which demands a note — the contract's own
 *  refine, mirrored here so the confirm button already knows before the
 *  press. */
export function StopReasonField({
  reasonKey,
  onReasonChange,
  note,
  onNoteChange,
  notePlaceholder,
}: {
  reasonKey: string
  onReasonChange: (key: string) => void
  note: string
  onNoteChange: (note: string) => void
  notePlaceholder?: string
}) {
  /* `leadStopReasonsQuery`, not `salesCatalogQuery`: the picker is open to
     anyone who stops a lead, and that permission (`lead.view`) is not
     `config.view` — an ordinary Sale holds the first, not the second. */
  const { data } = useQuery(leadStopReasonsQuery)
  const rows = (data?.rows ?? []).filter((r) => r.active)
  const noteNeeded = reasonKey === LEAD_STOP_REASON_OTHER

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">
          Lý do
          <span className="text-warning" aria-hidden="true">
            {' '}
            *
          </span>
        </span>
        <Select
          label="Lý do dừng chăm sóc"
          hideLabel
          value={reasonKey}
          neutralValue=""
          onChange={onReasonChange}
          className="w-full"
          options={[
            { value: '', label: '— chọn một lý do —' },
            ...rows.map((r) => ({ value: r.id, label: r.name })),
            { value: LEAD_STOP_REASON_OTHER, label: 'Khác (ghi chú)' },
          ]}
        />
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">
          Ghi rõ thêm
          {noteNeeded && (
            <span className="text-warning" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </span>
        <Textarea
          autoGrow
          rows={3}
          value={note}
          aria-label="Ghi rõ thêm về lý do"
          aria-required={noteNeeded}
          placeholder={notePlaceholder ?? 'Chi tiết của riêng lead này — ai nói, nói khi nào…'}
          onChange={(e) => onNoteChange(e.target.value)}
        />
      </label>
    </div>
  )
}
