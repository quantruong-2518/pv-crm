import { Check, Checkbox, Input } from '@pv/ui'
import { NEXT_STEP_TEXT_MAX, type CommVocabularyOption } from '@pv/contracts'
import { dmy } from '@/lib/date'
import { todayDay, type CurrentStep, type StepDraft } from '@/data/comm-record-detail'
import { Field } from './field-bits'
import { ChoiceChip } from './comm-bits'

/** The next-step part of a comm confirm — kind chip, text, due by date picker
 *  (no quick-due buttons), and "the step before is done" when the subject has
 *  one. One component for the record page and the mobile log (ADR 0074 §2). */
export function CommNextStepFields({
  current,
  kinds,
  draft,
  onDraft,
}: {
  current: CurrentStep
  kinds: readonly CommVocabularyOption[]
  draft: StepDraft
  onDraft: (next: StepDraft) => void
}) {
  const set = (patch: Partial<StepDraft>) => onDraft({ ...draft, ...patch })

  return (
    <div className="flex flex-col gap-4">
      {current && (
        <Checkbox
          checked={draft.previousDone}
          onChange={(previousDone) => set({ previousDone })}
          wrap
          label={`Việc trước đã xong: ${current.text}`}
          hint={`Hạn ${dmy(current.due)}`}
          className="pointer-coarse:min-h-12"
        />
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Loại việc">
        {kinds.map((k) => (
          <ChoiceChip
            key={k.id}
            pressed={draft.kindId === k.id}
            icon={draft.kindId === k.id ? Check : undefined}
            onClick={() => set({ kindId: k.id })}
          >
            {k.name}
          </ChoiceChip>
        ))}
      </div>
      <Field label="Nội dung" note={`${draft.text.length}/${NEXT_STEP_TEXT_MAX}`}>
        <Input
          value={draft.text}
          maxLength={NEXT_STEP_TEXT_MAX}
          aria-label="Nội dung bước tiếp theo"
          className="pointer-coarse:h-12"
          onChange={(e) => set({ text: e.target.value })}
        />
      </Field>
      <Field label="Hạn">
        <Input
          type="date"
          value={draft.due}
          min={todayDay()}
          aria-label="Hạn của bước tiếp theo"
          className="h-12"
          onChange={(e) => set({ due: e.target.value })}
        />
      </Field>
    </div>
  )
}
