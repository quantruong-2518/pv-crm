import { useQuery } from '@tanstack/react-query'
import { Select, Textarea } from '@pv/ui'
import { LEAD_STOP_REASON_OTHER } from '@pv/contracts'
import { leadStopReasonsQuery } from '@/data/leads'

/** The reason picker of the park dialog (`lead-state-actions.tsx`, ADR 0070).
 *  One catalogue, `EXIT_REASON`, plus the virtual `'other'` key which demands
 *  a note — the contract's own refine, mirrored here so the confirm button
 *  already knows before the press. */
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
          <span className="text-destructive-foreground" aria-hidden="true">
            {' '}
            *
          </span>
        </span>
        <Select
          label="Lý do chuyển vào nhóm chờ"
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
            <span className="text-destructive-foreground" aria-hidden="true">
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
          placeholder={notePlaceholder ?? 'Ai nói, nói khi nào…'}
          onChange={(e) => onNoteChange(e.target.value)}
        />
      </label>
    </div>
  )
}
