import { useState } from 'react'
import { Button, SegmentedControl, Textarea } from '@pv/ui'
import { AssistantReportBody, AssistantReportReason } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useI18n } from '@/app/i18n'
import { toastFail } from '@/app/toast'
import { useReportMessage } from '@/data/assistant'
import { ASSISTANT_COPY as C, REASON_COPY } from '@/data/assistant-copy'

/** "Report a wrong answer": a reason, an optional note, and the send. It opens
 *  under the answer's footer and closes itself on send or cancel. */

const TOUCH = 'pointer-coarse:h-12'
const NOTE_MAX = AssistantReportBody.shape.note.unwrap().maxLength ?? undefined

export function ReportForm({
  messageId,
  onClose,
}: {
  messageId: string
  onClose: (sent: boolean) => void
}) {
  const { t } = useI18n()
  const [reason, setReason] = useState<AssistantReportReason | ''>('')
  const [note, setNote] = useState('')
  const report = useReportMessage()
  const send = () => {
    if (!reason) return
    report.mutate(
      { id: messageId, body: { reason, ...(note.trim() ? { note: note.trim() } : {}) } },
      { onSuccess: () => onClose(true), onError: (error) => toastFail(userMessage(error)) },
    )
  }

  return (
    <div className="bg-surface-ink/5 flex flex-col gap-3 rounded-lg p-4">
      <SegmentedControl
        label={t(C.report)}
        value={reason}
        size="sm"
        tone="quiet"
        className="pointer-coarse:[&_button]:min-h-12"
        options={AssistantReportReason.options.map((value) => ({
          value,
          label: t(REASON_COPY[value]),
        }))}
        onChange={(value) => setReason(AssistantReportReason.parse(value))}
      />
      <Textarea
        rows={2}
        autoGrow
        maxLength={NOTE_MAX}
        aria-label={t(C.reportNote)}
        placeholder={t(C.reportNote)}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className={TOUCH} disabled={!reason || report.isPending} onClick={send}>
          {t(C.reportSend)}
        </Button>
        <Button variant="ghost" size="sm" className={TOUCH} onClick={() => onClose(false)}>
          {t(C.cancel)}
        </Button>
      </div>
    </div>
  )
}
