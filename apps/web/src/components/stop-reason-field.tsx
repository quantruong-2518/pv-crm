import { useQuery } from '@tanstack/react-query'
import { Select, Textarea } from '@pv/ui'
import { LEAD_STOP_REASON_OTHER } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
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
  const { t } = useI18n()
  const { data } = useQuery(leadStopReasonsQuery)
  const rows = (data?.rows ?? []).filter((r) => r.active)
  const noteNeeded = reasonKey === LEAD_STOP_REASON_OTHER

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">
          {t(message('Lý do', 'Reason', '사유'))}
          <span className="text-destructive-foreground" aria-hidden="true">
            {' '}
            *
          </span>
        </span>
        <Select
          label={t(
            message(
              'Lý do chuyển vào nhóm chờ',
              'Reason for moving to the waiting group',
              '대기 그룹으로 이동하는 사유',
            ),
          )}
          hideLabel
          value={reasonKey}
          neutralValue=""
          onChange={onReasonChange}
          className="w-full"
          options={[
            {
              value: '',
              label: t(
                message('— chọn một lý do —', '— choose a reason —', '— 사유를 선택하세요 —'),
              ),
            },
            ...rows.map((r) => ({ value: r.id, label: r.name })),
            {
              value: LEAD_STOP_REASON_OTHER,
              label: t(message('Khác (ghi chú)', 'Other (add a note)', '기타 (메모 입력)')),
            },
          ]}
        />
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">
          {t(message('Ghi rõ thêm', 'Add detail', '추가 설명'))}
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
          aria-label={t(
            message('Ghi rõ thêm về lý do', 'Add detail about the reason', '사유에 대한 추가 설명'),
          )}
          aria-required={noteNeeded}
          placeholder={
            notePlaceholder ??
            t(message('Ai nói, nói khi nào…', 'Who said it, and when…', '누가, 언제 말했는지…'))
          }
          onChange={(e) => onNoteChange(e.target.value)}
        />
      </label>
    </div>
  )
}
