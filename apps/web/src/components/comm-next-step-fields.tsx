import type { UseQueryResult } from '@tanstack/react-query'
import { Check, Checkbox, Input, Skeleton } from '@pv/ui'
import {
  NEXT_STEP_TEXT_MAX,
  type CommVocabularyOption,
  type StepOptionsResponse,
  type StepTemplateOption,
} from '@pv/contracts'
import { dmy } from '@/lib/date'
import {
  pickedTemplateOf,
  todayDay,
  type CurrentStep,
  type StepDraft,
} from '@/data/comm-record-detail'
import { dueOnPick } from '@/data/next-step'
import { EmptyFrameNote, FrameUnread, PickedStepLine, TemplateChips } from './run/step-templates'
import { Field } from './field-bits'
import { ChoiceChip } from './comm-bits'

/** The next-step part of a comm confirm — the state's templates, kind chip,
 *  text, due by date picker (no quick-due buttons), and "the step before is
 *  done" when the subject has one. One component for the record page, the
 *  meeting close-out and the mobile log (ADR 0074 §2).
 *
 *  `options` is the frame of the state the subject stands in (ADR 0080). Where
 *  it allows listed steps only, kind and text are the picked template's and
 *  are read, not typed. No data is "not read", never "no frame": pending draws
 *  a skeleton, a failed read says so and offers the re-read. */
export function CommNextStepFields({
  current,
  kinds,
  options: frame,
  draft,
  onDraft,
}: {
  current: CurrentStep
  kinds: readonly CommVocabularyOption[]
  options: UseQueryResult<StepOptionsResponse>
  draft: StepDraft
  onDraft: (next: StepDraft) => void
}) {
  const options = frame.data
  const set = (patch: Partial<StepDraft>) => onDraft({ ...draft, ...patch })
  const picked = pickedTemplateOf(draft, options)
  const locked = options?.freeEntry === false
  /* A chip replaces the typed words, so it stands down once they differ. */
  const offering = locked || draft.text === '' || draft.text === picked?.name

  const pick = (template: StepTemplateOption | null) => {
    if (!template) {
      /* A listed-only state has no box to keep the words in, so they go too. */
      set({ templateId: undefined, ...(locked && { text: '', kindId: '' }) })
      return
    }
    set({
      templateId: template.id,
      text: template.name,
      kindId: template.kind.id,
      ...dueOnPick(template, draft.due, draft.dueAuto ?? false),
    })
  }

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
      {!options ? (
        frame.isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <FrameUnread error={frame.error} onRetry={() => void frame.refetch()} />
        )
      ) : locked && options.address && options.templates.length === 0 ? (
        <EmptyFrameNote address={options.address} />
      ) : (
        <>
          {offering && <TemplateChips options={options} pickedId={picked?.id} onPick={pick} />}
          {locked ? (
            <PickedStepLine picked={picked} />
          ) : (
            <>
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
                  onChange={(e) =>
                    /* Words that are no longer the template's are a typed step. */
                    set({
                      text: e.target.value,
                      ...(picked &&
                        e.target.value.trim() !== picked.name && { templateId: undefined }),
                    })
                  }
                />
              </Field>
            </>
          )}
          <Field label="Hạn">
            <Input
              type="date"
              value={draft.due}
              min={todayDay()}
              aria-label="Hạn của bước tiếp theo"
              className="h-12"
              onChange={(e) => set({ due: e.target.value, dueAuto: false })}
            />
          </Field>
        </>
      )}
    </div>
  )
}
