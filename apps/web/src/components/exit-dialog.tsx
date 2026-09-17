import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlert, X } from '@pv/ui'
import { Button, Drawer, Icon, Select, Textarea, cn } from '@pv/ui'
import { ExitReason, type LeadProfile } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { exitReasonRows, salesCatalogQuery } from '@/data/sales-config'
import { useExitLead } from '@/data/lead-exit'

/** Take a lead out of the funnel — a dialog, not a card sitting on the screen.
 *
 *  A rare action, so it costs one extra step: a toolbar button, then a reason
 *  here. It writes at once with no approval, and the profile's "Mở lại lead"
 *  undoes it (`docs/decisions/0057-seven-sales-pipeline-decisions.md`, decision 2).
 *
 *  Reasons are a CLOSED enum (`ExitReason`): the key goes on the wire, the label
 *  comes from config (`exitReasonRows`), where it can be renamed. The note tells
 *  this lead's story; it never adds a reason. A 409 (open deal, already signed)
 *  prints the server's sentence and the dialog stays open. */
export function ExitDialog({
  profile,
  open,
  onClose,
}: {
  profile: LeadProfile
  open: boolean
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const exit = useExitLead(profile.code)
  const { reset } = exit
  const { data: catalog } = useQuery(salesCatalogQuery)

  /* Reopening starts fresh: the previous Cancel was an answer, and a refusal
     from last time is about a state that may have changed since. */
  useEffect(() => {
    if (open) {
      setReason('')
      setNote('')
      reset()
    }
  }, [open, reset])

  const picked = ExitReason.safeParse(reason)

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
                : !picked.success
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
              disabled={!picked.success || exit.isPending}
              onClick={() => {
                if (!picked.success) return
                const trimmed = note.trim()
                exit.mutate(
                  { reason: picked.data, ...(trimmed === '' ? {} : { note: trimmed }) },
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
            label="Lý do ra khỏi luồng"
            hideLabel
            value={reason}
            neutralValue=""
            onChange={setReason}
            className="w-full"
            options={[
              { value: '', label: '— chọn một lý do —' },
              ...exitReasonRows(catalog).map((r) => ({ value: r.key, label: r.label })),
            ]}
          />
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Ghi rõ thêm</span>
          <Textarea
            autoGrow
            rows={3}
            value={note}
            aria-label="Ghi rõ thêm về lý do"
            placeholder="Chi tiết của riêng lead này — ai nói, nói khi nào…"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
    </Drawer>
  )
}
