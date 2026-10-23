import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, cn } from '@pv/ui'
import type {
  CustomerTemperature,
  DebriefEdit,
  DebriefView,
  StepOptionsResponse,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { CommRecordFrame, CommStepCard } from '@/components/comm-record-frame'
import {
  COMM_FOCUS,
  subjectKindLabel,
  subjectPath,
  useEditComm,
  type StepDraft,
} from '@/data/comm-record-detail'
import { editSeedOf, useCommForm, type CommForm } from '@/data/comm-record-form'
import { NextStepStep } from './comm-record-fill-steps'
import { BAR_BUTTON, CommFormBar, CommFormSteps, type FormProblem } from './comm-record-form'
import { ReadMeta, StepRow } from './comm-record-read'

/** The owner's edit of a confirmed comm (ADR 0122): the fill form again,
 *  started from the record, with no draft and no "unreached". Files save as
 *  they are added or removed; the rest waits for the save button.
 *
 *  The step and the temperature are sent only when changed, and change only
 *  while the step this record set still stands (`stepTarget` non-null);
 *  otherwise that card reads as it was and links to where the step is edited. */

export function CommEditWorkspace({
  record,
  onClose,
}: {
  record: DebriefView
  onClose: () => void
}) {
  const edit = useEditComm()
  const seed = useMemo(() => editSeedOf(record), [record])
  const form = useCommForm(record, seed, record.meeting === null)
  const { close, at, titles } = form
  const baseTemperature = useSeededTemperature(form)
  const stepEditable = record.stepTarget !== null && record.step !== null
  const draft = withMatchedTemplate(form.draft, close.options.data)

  const stepChanged =
    draft.kindId !== seed.step.kindId ||
    draft.text !== seed.step.text ||
    draft.due !== seed.step.due
  const temperatureChanged = baseTemperature !== undefined && close.temperature !== baseTemperature
  const stepSent = stepEditable && (stepChanged || temperatureChanged)
  const answers = form.answers()
  const dirty =
    (form.titled && form.title.trim() !== seed.title) ||
    form.summary.trim() !== seed.summary ||
    answers.length !== record.answers.length ||
    answers.some((a) => a.answerId !== seed.picked[a.criterionId]) ||
    stepSent

  const gaps = [
    form.contentGap,
    form.answersGap ?? (stepSent ? close.temperatureGap : null),
    stepSent ? close.gapOf(draft) : null,
  ]
  const blocker = gaps.find((gap) => gap !== null) ?? null
  const shortfall = gaps[at] ?? blocker
  const problem: FormProblem = edit.error
    ? { text: userMessage(edit.error), failed: true }
    : shortfall === null
      ? null
      : { text: shortfall }

  const submit = () => {
    if (blocker || !dirty || edit.isPending) return
    const body: DebriefEdit = {
      ...(form.titled && { title: form.title.trim() }),
      summary: form.summary.trim(),
      answers,
      ...(stepSent && close.inputOf(draft)),
    }
    edit.mutate(
      { id: record.id, body },
      {
        onSuccess: () => {
          toastDone('Đã lưu thay đổi')
          onClose()
        },
      },
    )
  }

  return (
    <CommRecordFrame
      record={record}
      title="Sửa lượt liên hệ"
      meta={<ReadMeta record={record} />}
      bar={
        <CommFormBar problem={problem}>
          <Button size="md" variant="ghost" className={BAR_BUTTON} onClick={onClose}>
            Huỷ
          </Button>
          <Button
            size="md"
            className={BAR_BUTTON}
            disabled={blocker !== null || !dirty || edit.isPending}
            onClick={submit}
          >
            Lưu thay đổi
          </Button>
        </CommFormBar>
      }
    >
      <CommFormSteps
        record={record}
        form={form}
        gaps={gaps}
        fileNote="lưu ngay khi tải lên hoặc xoá"
        stepCard={
          stepEditable ? (
            <NextStepStep
              record={record}
              heading={titles[2]}
              kinds={form.vocab.data?.stepKinds ?? []}
              close={close}
              draft={draft}
              onDraft={form.setDraft}
            />
          ) : (
            <StandingStep record={record} form={form} />
          )
        }
      />
    </CommRecordFrame>
  )
}

/** The customer's reading arrives with the target and seeds the pick once;
 *  `undefined` until then, so an unread target never counts as a change. */
function useSeededTemperature(form: CommForm) {
  const { close } = form
  const [base, setBase] = useState<CustomerTemperature | null>()
  const known = close.target.data ? (close.customer?.temperature ?? null) : undefined
  if (base === undefined && known !== undefined) {
    setBase(known)
    if (known) close.setTemperature(known)
  }
  return base
}

/** A copy carries no template id; on a listed-only frame the copy's own
 *  template is found by its words, so the card shows it as picked. */
function withMatchedTemplate(
  draft: StepDraft,
  options: StepOptionsResponse | undefined,
): StepDraft {
  if (draft.templateId || !options || options.freeEntry) return draft
  const match = options.templates.find((t) => t.name === draft.text && t.kind.id === draft.kindId)
  return match ? { ...draft, templateId: match.id } : draft
}

/** The step part once it cannot change here: as it was set, and where it now lives. */
function StandingStep({ record, form }: { record: DebriefView; form: CommForm }) {
  const code = form.close.target.data?.customer?.leadCode ?? record.subject.code
  const path = subjectPath(code)
  return (
    <CommStepCard index={2} title={form.titles[2]}>
      {record.step ? (
        <>
          <StepRow step={record.step} />
          <p className="text-muted-foreground m-0 text-[13px] leading-[1.6]">
            Bước tiếp theo sửa tại {subjectKindLabel(code).toLowerCase()}{' '}
            {path ? (
              <Link
                to={path}
                className={cn(
                  'text-foreground pointer-coarse:min-h-12 inline-flex items-center rounded-sm font-mono hover:underline',
                  COMM_FOCUS,
                )}
              >
                {code}
              </Link>
            ) : (
              <span className="font-mono">{code}</span>
            )}
            .
          </p>
        </>
      ) : (
        <p className="text-muted-foreground m-0 text-[13px]">Không đặt bước tiếp theo.</p>
      )}
    </CommStepCard>
  )
}
