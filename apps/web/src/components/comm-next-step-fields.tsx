import { useId, useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { CalendarDays, Input, Skeleton, Textarea } from '@pv/ui'
import {
  NEXT_STEP_TEXT_MAX,
  type CommVocabularyOption,
  type StepOptionsResponse,
  type StepTemplateOption,
} from '@pv/contracts'
import { dm } from '@/lib/date'
import { pickedTemplateOf, todayDay, type StepDraft } from '@/data/comm-record-detail'
import { dayAfter, dueOnPick } from '@/data/next-step'
import { EmptyFrameNote, FrameUnread, PickedStepLine, TemplateChips } from './run/step-templates'
import { RadioCard } from './radio-card'

/** The next-step part of a comm confirm — kind, the words of the step and the
 *  day it is due. One component for the record page, the meeting close-out and
 *  the mobile log (ADR 0074 §2).
 *
 *  `options` is the frame of the state the subject stands in (ADR 0080). Where
 *  it allows listed steps only, the step is picked from its templates and read,
 *  not typed; elsewhere it is typed and no template is offered. No data is
 *  "not read", never "no frame": pending draws a skeleton, a failed read says
 *  so and offers the re-read. */

export const STEP_LABEL = 'm-0 p-0 text-[14px] font-semibold leading-[1.5]'

export function CommNextStepFields({
  kinds,
  options: frame,
  draft,
  onDraft,
}: {
  kinds: readonly CommVocabularyOption[]
  options: UseQueryResult<StepOptionsResponse>
  draft: StepDraft
  onDraft: (next: StepDraft) => void
}) {
  const textId = useId()
  const options = frame.data
  const set = (patch: Partial<StepDraft>) => onDraft({ ...draft, ...patch })
  const picked = pickedTemplateOf(draft, options)

  if (!options) {
    return frame.isPending ? (
      <Skeleton className="h-12 w-full" />
    ) : (
      <FrameUnread error={frame.error} onRetry={() => void frame.refetch()} />
    )
  }
  const locked = !options.freeEntry
  if (locked && options.address && options.templates.length === 0) {
    return <EmptyFrameNote address={options.address} />
  }

  const pick = (template: StepTemplateOption | null) =>
    /* A listed-only state has no box to keep the words in, so they go with the pick. */
    set(
      template
        ? {
            templateId: template.id,
            text: template.name,
            kindId: template.kind.id,
            ...dueOnPick(template, draft.due, draft.dueAuto ?? false),
          }
        : { templateId: undefined, text: '', kindId: '' },
    )

  return (
    <div className="flex flex-col gap-6">
      {locked ? (
        <div className="flex flex-col gap-3">
          <span className={STEP_LABEL}>Công việc cụ thể</span>
          <TemplateChips options={options} pickedId={picked?.id} onPick={pick} />
          <PickedStepLine picked={picked} />
        </div>
      ) : (
        <>
          <fieldset className="m-0 min-w-0 p-0">
            <legend className={`${STEP_LABEL} mb-3`}>Loại việc</legend>
            <div className="flex flex-wrap gap-2">
              {kinds.map((k) => (
                <RadioCard
                  key={k.id}
                  shape="chip"
                  name="step-kind"
                  checked={draft.kindId === k.id}
                  onSelect={() => set({ kindId: k.id, templateId: undefined })}
                >
                  {k.name}
                </RadioCard>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-2">
            <label htmlFor={textId} className={STEP_LABEL}>
              Công việc cụ thể
            </label>
            <Textarea
              id={textId}
              rows={3}
              value={draft.text}
              maxLength={NEXT_STEP_TEXT_MAX}
              className="text-[14px]"
              onChange={(e) => set({ text: e.target.value })}
            />
          </div>
        </>
      )}
      <DueChoice due={draft.due} onDue={(due) => set({ due, dueAuto: false })} />
    </div>
  )
}

/** The quick picks a person reaches for most; any other day goes through the date box. */
const DUE_PRESETS = [
  { days: 1, label: 'Ngày mai' },
  { days: 3, label: '3 ngày nữa' },
  { days: 7, label: '1 tuần nữa' },
] as const

function DueChoice({ due, onDue }: { due: string; onDue: (due: string) => void }) {
  const presets = DUE_PRESETS.map((p) => ({ ...p, day: dayAfter(p.days) }))
  const matched = presets.some((p) => p.day === due)
  const [other, setOther] = useState(false)
  /* A day a template or an old draft set that is no quick pick reads as "another day". */
  const otherOn = other || (due !== '' && !matched)

  return (
    <fieldset className="m-0 min-w-0 p-0">
      <legend className={`${STEP_LABEL} mb-3`}>Làm trước ngày</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {presets.map((p) => (
          <RadioCard
            key={p.days}
            name="step-due"
            checked={!otherOn && p.day === due}
            hint={dm(p.day)}
            onSelect={() => {
              setOther(false)
              onDue(p.day)
            }}
          >
            {p.label}
          </RadioCard>
        ))}
        <RadioCard
          name="step-due"
          icon={CalendarDays}
          checked={otherOn}
          onSelect={() => setOther(true)}
        >
          Chọn ngày khác
        </RadioCard>
      </div>
      {otherOn && (
        <Input
          type="date"
          value={due}
          min={todayDay()}
          aria-label="Làm trước ngày"
          className="mt-3 h-12 sm:max-w-60"
          onChange={(e) => onDue(e.target.value)}
        />
      )}
    </fieldset>
  )
}
