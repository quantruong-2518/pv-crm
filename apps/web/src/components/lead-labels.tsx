import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Checkbox, Icon, MetaPill, PenLine, cn } from '@pv/ui'
import type { LeadLabel, LeadProfile } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import { leadLabelOptionsQuery, sameLabels, useSetLeadLabels } from '@/data/lead-labels'
import { RecordCard } from '@/components/record/record-card'

/** Waiting labels on screen (ADR 0097 §5): the chips a lead row or a profile
 *  prints, the closed picker every editor shares (park dialog, profile card,
 *  and later the campaign audience filter), and the profile's own card.
 *  Labels are a catalogue, not free text — hence checkboxes, not `TagInput`. */

/** The labels a lead carries, as quiet tags. `max` keeps a table row to one
 *  line; what is left over reads as "+N" with every name in its tooltip. */
export function LabelChips({
  labels,
  max,
  className,
}: {
  labels: readonly LeadLabel[]
  max?: number
  className?: string
}) {
  if (labels.length === 0) return null
  const shown = max === undefined ? labels : labels.slice(0, max)
  const rest = labels.length - shown.length
  return (
    <span className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {shown.map((l) => (
        <MetaPill key={l.id} title={l.name} className="min-w-0 max-w-full">
          <span className="truncate">{l.name}</span>
        </MetaPill>
      ))}
      {rest > 0 && (
        <MetaPill title={labels.map((l) => l.name).join(', ')} className="shrink-0">
          <span className="tnum">+{rest}</span>
        </MetaPill>
      )}
    </span>
  )
}

/** Pick any number of labels. Offers the active catalogue rows, plus any
 *  switched-off one the lead already carries so it can still be taken off.
 *  `value` is a list of label ids, the shape `PUT …/labels` takes. */
export function LabelPicker({
  value,
  onChange,
  disabled,
}: {
  value: readonly string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const { t } = useI18n()
  const { data, isPending } = useQuery(leadLabelOptionsQuery)
  const rows = (data?.rows ?? []).filter((r) => r.active || value.includes(r.id))

  if (isPending) {
    return (
      <span className="text-muted-foreground text-[12px]">
        {t(message('Đang tải nhãn…', 'Loading labels…', '라벨 불러오는 중…'))}
      </span>
    )
  }
  if (rows.length === 0) {
    return (
      <span className="text-muted-foreground text-[12px]">
        {t(message('Chưa có nhãn nào.', 'No labels yet.', '라벨이 없습니다.'))}
      </span>
    )
  }
  return (
    <div
      role="group"
      aria-label={t(message('Nhãn nhóm chờ', 'Waiting-group labels', '대기 그룹 라벨'))}
      className="flex flex-col gap-1"
    >
      {rows.map((r) => (
        <Checkbox
          key={r.id}
          label={r.name}
          checked={value.includes(r.id)}
          disabled={disabled}
          className="pointer-coarse:min-h-12"
          onChange={(on) => onChange(on ? [...value, r.id] : value.filter((id) => id !== r.id))}
        />
      ))}
    </div>
  )
}

/** The profile card: the chips, and for an editor an inline picker with save
 *  and cancel. Saving sends the whole set, so `[]` takes every label off.
 *  Labels sort the waiting group, so an unlabelled lead outside it gets no
 *  card; one that still carries labels keeps it, to take them off. */
export function LeadLabelsCard({ lead, canEdit }: { lead: LeadProfile; canEdit: boolean }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<string[] | null>(null)
  const save = useSetLeadLabels(lead.code)
  const current = lead.labels.map((l) => l.id)

  if (lead.labels.length === 0 && (!canEdit || lead.state !== 'nurturing')) return null

  const edit = canEdit && draft === null && (
    <Button
      size="sm"
      variant="ghost"
      className="pointer-coarse:h-12"
      onClick={() => setDraft(current)}
    >
      <Icon icon={PenLine} size={16} />
      {t(message('Sửa nhãn', 'Edit labels', '라벨 수정'))}
    </Button>
  )

  return (
    <RecordCard
      title={t(message('Nhãn nhóm chờ', 'Waiting-group labels', '대기 그룹 라벨'))}
      actions={edit}
    >
      {draft === null ? (
        lead.labels.length > 0 ? (
          <LabelChips labels={lead.labels} />
        ) : (
          <span className="text-muted-foreground text-[12px]">
            {t(message('Chưa gắn nhãn nào.', 'No labels attached.', '연결된 라벨이 없습니다.'))}
          </span>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <LabelPicker value={draft} onChange={setDraft} disabled={save.isPending} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="md"
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={() => setDraft(null)}
            >
              {t(message('Huỷ', 'Cancel', '취소'))}
            </Button>
            <Button
              size="md"
              className="pointer-coarse:h-12"
              disabled={save.isPending || sameLabels(draft, current)}
              onClick={() =>
                save.mutate(
                  { labelIds: draft },
                  {
                    onSuccess: () => {
                      toastDone(
                        t(
                          message(
                            `Đã lưu nhãn của ${lead.code}.`,
                            `Saved labels for ${lead.code}.`,
                            `${lead.code}의 라벨을 저장했습니다.`,
                          ),
                        ),
                      )
                      setDraft(null)
                    },
                    onError: (e) =>
                      toastFail(
                        t(
                          message(
                            'Không lưu được nhãn.',
                            'Could not save labels.',
                            '라벨을 저장하지 못했습니다.',
                          ),
                        ),
                        userMessage(e),
                      ),
                  },
                )
              }
            >
              {t(message('Lưu nhãn', 'Save labels', '라벨 저장'))}
            </Button>
          </div>
        </div>
      )}
    </RecordCard>
  )
}
