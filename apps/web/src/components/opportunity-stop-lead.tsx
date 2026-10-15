import { SegmentedControl, Select } from '@pv/ui'
import { LEAD_STATE_LABEL, type LeadAfterStop } from '@pv/contracts'
import { StopReasonField } from './exit-dialog'
import { Field } from './ops-fields'
import { leadAfterChoices, leadAfterTo, type LeadAfterDraft } from './opportunity-stop-lead-model'

/** Where the lead goes — the stop drawer asks it when this deal is the lead's
 *  last live one with nothing signed (owner, 15/10/2026). The holders and the
 *  default are the server's `leadAfterStop`; the reasons are the lead exit
 *  door's `EXIT_REASON` catalogue (`StopReasonField`). With one choice open to
 *  this reader the question is not asked; the field names where the lead goes. */
export function LeadAfterStopField({
  after,
  draft,
  onChange,
}: {
  after: LeadAfterStop
  draft: LeadAfterDraft
  onChange: (draft: LeadAfterDraft) => void
}) {
  const set = (patch: Partial<LeadAfterDraft>) => onChange({ ...draft, ...patch })
  const asked = leadAfterChoices(after).length === 2
  const to = leadAfterTo(draft, after)

  return (
    <div className="flex flex-col gap-4">
      {asked && (
        <Field label="Lead này đi đâu?" required plain>
          <SegmentedControl
            label="Lead này đi đâu?"
            hideLabel
            tone="quiet"
            value={draft.to}
            onChange={(to) => set({ to: to === 'stop' ? 'stop' : 'waiting' })}
            options={[
              { value: 'waiting', label: `Chuyển sang ${LEAD_STATE_LABEL.nurturing}` },
              { value: 'stop', label: `${LEAD_STATE_LABEL.disqualified} lead` },
            ]}
          />
        </Field>
      )}
      {to === 'waiting' && (
        <Field
          label="Lead PIC"
          required
          plain
          hint={asked ? undefined : `Lead chuyển sang ${LEAD_STATE_LABEL.nurturing}.`}
        >
          <Select
            label="Lead PIC"
            hideLabel
            value={draft.holderId || (after.holders[0]?.id ?? '')}
            onChange={(holderId) => set({ holderId })}
            options={after.holders.map((h) => ({ value: h.id, label: h.name }))}
            size="lg"
            className="w-full"
          />
        </Field>
      )}
      {to === 'stop' && !asked && (
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          Lead chuyển sang {LEAD_STATE_LABEL.disqualified}.
        </p>
      )}
      {to === 'stop' && (
        <StopReasonField
          reasonKey={draft.reasonKey}
          onReasonChange={(reasonKey) => set({ reasonKey })}
          note={draft.note}
          onNoteChange={(note) => set({ note })}
          size="lg"
          label="Lý do ngừng chăm sóc lead"
        />
      )}
    </div>
  )
}
