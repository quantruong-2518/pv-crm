import { useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Avatar,
  Button,
  CalendarDays,
  Check,
  GlassCard,
  Icon,
  Input,
  MetaPill,
  Pencil,
  Plus,
  SectionTitle,
  Select,
  Skeleton,
  Textarea,
  Trash2,
} from '@pv/ui'
import {
  NEXT_STEP_TEXT_MAX,
  type NextStep,
  type NextStepSetBody,
  type StepOptionsResponse,
  type StepTemplateOption,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { dmy } from '@/lib/date'
import { message, useI18n } from '@/app/i18n'
import { useSalesPeople } from '@/data/directory'
import {
  dueOnPick,
  nextStepQuery,
  stepOptionsQuery,
  useClearNextStep,
  useFinishNextStep,
  useSetNextStep,
  type StepSubject,
} from '@/data/next-step'
import { DueBadge } from '@/components/contract-bits'
import { Field } from '@/components/field-bits'
import { EmptyFrameNote, PickedStepLine, TemplateChips } from './step-templates'

/** Module 2 · The one thing that has to happen next on a lead or an
 *  opportunity (flow G1–G3, ADR 0069 §10). The record names its subject.
 *
 *  Deliberately not a todo list: ONE sentence, one day, one doer, replaced the
 *  next time it is saved. Stored on the server (`data/next-step.ts`); the level
 *  pill is the server's grade, never derived here. No step is not a warning
 *  (G2) — the card just offers to set one.
 *
 *  "Xong" asks for the NEXT step in the same breath and sends both in one
 *  request, so no other tab ever reads a gap between two steps. `embedded`
 *  draws the step as the row under a record's stepper (`TodoCard`), with no
 *  primary button of its own: a record's primary moves sit in its header. */

const NEXT_TASK = message('Việc tiếp theo', 'Next task', '다음 업무')
const RETRY = message('Thử lại', 'Try again', '다시 시도')
const CANCEL = message('Huỷ', 'Cancel', '취소')
const EDIT = message('Sửa', 'Edit', '수정')
const DONE = message('Xong', 'Done', '완료')
const TASK = message('Việc cần làm', 'Task to do', '할 일')
const DOER = message('Người làm', 'Assignee', '담당자')
const EXAMPLE_TASK = message(
  'Ví dụ: Gọi lại để chốt lịch khảo sát.',
  'Example: Call back to confirm the survey schedule.',
  '예: 다시 전화해 현장 조사 일정을 확정하기.',
)
const SAVE_AND_FINISH = message(
  'Xong và lưu việc mới',
  'Done and save new task',
  '완료하고 새 업무 저장',
)
const SAVE_TASK = message('Lưu việc', 'Save task', '업무 저장')
const finishedNote = (text: string) =>
  message(
    `Đã xong “${text}”. Việc tiếp theo là gì? Chưa có thì chọn “Xong, không đặt việc mới”.`,
    `“${text}” is done. What is the next task? If there is none, choose “Done, no new task”.`,
    `“${text}”을(를) 완료했습니다. 다음 업무는 무엇인가요? 없으면 “완료, 새 업무 없음”을 선택하세요.`,
  )

/** The create door's stand-in: named, and saying it opens once the lead exists. */
export function NextActionCard() {
  const { t } = useI18n()
  return (
    <StepShell>
      <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
        {t(
          message(
            'Có sau khi tạo lead.',
            'Available once the lead is created.',
            '리드를 만든 후에 사용할 수 있습니다.',
          ),
        )}
      </p>
    </StepShell>
  )
}

/** `closedNote` replaces the whole body: a stopped or signed deal has no step
 *  and refuses writes (409), so the card says why instead of reading `null`. */
export function NextStepCard({
  subject,
  canEdit,
  closedNote,
  embedded = false,
}: {
  subject: StepSubject
  canEdit: boolean
  closedNote?: string
  embedded?: boolean
}) {
  const { t } = useI18n()
  if (embedded) {
    return (
      <div aria-label={t(NEXT_TASK)} role="group" className="flex min-w-0 flex-col gap-1">
        <p className="text-muted-foreground m-0 text-[12px] font-semibold">{t(NEXT_TASK)}</p>
        <StepBody subject={subject} canEdit={canEdit} embedded />
      </div>
    )
  }
  return (
    <StepShell>
      {closedNote ? (
        <p className="text-muted-foreground text-[12.5px] leading-[1.6]">{closedNote}</p>
      ) : (
        <StepBody subject={subject} canEdit={canEdit} />
      )}
    </StepShell>
  )
}

function StepShell({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label={t(NEXT_TASK)}>
      <SectionTitle size="detail">{t(NEXT_TASK)}</SectionTitle>
      {children}
    </GlassCard>
  )
}

/** `finish` is the edit form opened by "Xong": same boxes, empty, different doors. */
type Mode = 'view' | 'edit' | 'finish'

function StepBody({
  subject,
  canEdit,
  embedded = false,
}: {
  subject: StepSubject
  canEdit: boolean
  embedded?: boolean
}) {
  const { t } = useI18n()
  const { data, isPending, error } = useQuery(nextStepQuery(subject.kind, subject.code))
  const [mode, setMode] = useState<Mode>('view')

  if (isPending) return <Skeleton className={embedded ? 'h-10 w-full' : 'h-16 w-full'} />
  if (!data) {
    return (
      <p className="text-destructive-foreground text-[12.5px] leading-[1.6]">
        {t(
          message(
            `Không đọc được việc tiếp theo. ${isApiError(error) ? userMessage(error) : 'Thử lại.'}`,
            `Could not load the next task. ${isApiError(error) ? userMessage(error) : 'Try again.'}`,
            `다음 업무를 불러오지 못했습니다. ${isApiError(error) ? userMessage(error) : '다시 시도하세요.'}`,
          ),
        )}
      </p>
    )
  }

  const step = data.step
  if (canEdit && mode !== 'view') {
    return (
      <NextStepForm
        subject={subject}
        step={step}
        finishing={mode === 'finish'}
        onClose={() => setMode('view')}
      />
    )
  }
  if (!step) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
          {t(
            message(
              'Chưa đặt việc tiếp theo.',
              'No next task set.',
              '다음 업무가 설정되지 않았습니다.',
            ),
          )}
        </p>
        {canEdit && (
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => setMode('edit')}
          >
            <Icon icon={Plus} size={16} />
            {t(message('Đặt việc tiếp theo', 'Set next task', '다음 업무 설정'))}
          </Button>
        )}
      </div>
    )
  }
  const View = embedded ? StepRow : StepView
  return (
    <View
      step={step}
      canEdit={canEdit}
      onEdit={() => setMode('edit')}
      onFinish={() => setMode('finish')}
    />
  )
}

type ViewProps = { step: NextStep; canEdit: boolean; onEdit: () => void; onFinish: () => void }

/** The embedded step as the row under the stepper shows it: kind pill and step on one
 *  line, due and doer under it; a quiet change and a secondary done beside. */
function StepRow({ step, canEdit, onEdit, onFinish }: ViewProps) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-1 basis-64 flex-col">
        <span className="flex flex-wrap items-center gap-2">
          {step.kind && <MetaPill>{step.kind.name}</MetaPill>}
          <span className="text-foreground break-words text-[14px] font-semibold leading-[1.5]">
            {step.text}
          </span>
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px] tabular-nums leading-[1.5]">
          {t(message(`Hạn ${dmy(step.due)}`, `Due ${dmy(step.due)}`, `기한 ${dmy(step.due)}`))}
          <DueBadge level={step.dueLevel} />
          <span className="min-w-0 break-words">· {step.doer.name}</span>
        </span>
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onEdit}>
            <Icon icon={Pencil} size={16} />
            {t(EDIT)}
          </Button>
          <Button size="sm" variant="secondary" className="pointer-coarse:h-12" onClick={onFinish}>
            <Icon icon={Check} size={16} />
            {t(DONE)}
          </Button>
        </div>
      )}
    </div>
  )
}

function StepView({ step, canEdit, onEdit, onFinish }: ViewProps) {
  const { t } = useI18n()
  return (
    <>
      <p className="text-foreground break-words text-[13px] leading-[1.6]">{step.text}</p>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        {/* Kind first: it names the work, the date and doer say when and who. */}
        {step.kind && <MetaPill>{step.kind.name}</MetaPill>}
        <span className="text-muted-foreground inline-flex items-center gap-2 tabular-nums">
          <Icon icon={CalendarDays} size={16} />
          {dmy(step.due)}
        </span>
        {/* Case and tracking reset: the contract screens' uppercase breaks law 6. */}
        <DueBadge level={step.dueLevel} />
        <span className="text-muted-foreground inline-flex min-w-0 items-center gap-2">
          <Avatar name={step.doer.name} size="sm" />
          <span className="min-w-0 break-words">{step.doer.name}</span>
        </span>
      </div>
      {canEdit && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={onEdit}>
            <Icon icon={Pencil} size={16} />
            {t(EDIT)}
          </Button>
          <Button size="md" className="pointer-coarse:h-12" onClick={onFinish}>
            <Icon icon={Check} size={16} />
            {t(DONE)}
          </Button>
        </div>
      )}
    </>
  )
}

type FormProps = {
  subject: StepSubject
  step: NextStep | null
  finishing: boolean
  onClose: () => void
}

/** Set, edit, or — when `finishing` — name what comes after the step just done.
 *  Mounted fresh on every open, so its boxes seed from props without a reseed.
 *  Exported for the deal profile's event follow-up, which sets the step in place.
 *  Waits for the state's frame (ADR 0080): drawing the free box first would
 *  offer a step the server may refuse. */
export function NextStepForm(props: FormProps) {
  const { t } = useI18n()
  const options = useQuery(stepOptionsQuery(props.subject.kind, props.subject.code))
  if (options.data) return <StepForm {...props} options={options.data} />
  if (options.isPending) return <Skeleton className="h-16 w-full" />
  return (
    <div className="flex flex-col gap-3">
      <p role="alert" className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]">
        {t(
          message(
            `Không đọc được danh sách bước tiếp theo. ${isApiError(options.error) ? userMessage(options.error) : 'Thử lại.'}`,
            `Could not load the list of next steps. ${isApiError(options.error) ? userMessage(options.error) : 'Try again.'}`,
            `다음 단계 목록을 불러오지 못했습니다. ${isApiError(options.error) ? userMessage(options.error) : '다시 시도하세요.'}`,
          ),
        )}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={props.onClose}>
          {t(CANCEL)}
        </Button>
        <Button
          size="md"
          variant="secondary"
          className="pointer-coarse:h-12"
          onClick={() => void options.refetch()}
        >
          {t(RETRY)}
        </Button>
      </div>
    </div>
  )
}

function StepForm({
  subject,
  step,
  finishing,
  onClose,
  options,
}: FormProps & { options: StepOptionsResponse }) {
  const { t } = useI18n()
  const seed = finishing ? null : step
  const [text, setText] = useState(seed?.text ?? '')
  /* Empty rather than today: a pre-filled day is a deadline nobody chose. */
  const [due, setDue] = useState(seed?.due ?? '')
  const [dueAuto, setDueAuto] = useState(false)
  const [templateId, setTemplateId] = useState(seed?.templateId)
  const { canAssign, holder } = subject
  /* Without the right to assign, the doer IS the holder, so the form never offers another. */
  const [doerId, setDoerId] = useState((canAssign ? seed?.doer.id : null) ?? holder?.id ?? '')
  const box = useRef<HTMLTextAreaElement>(null)

  const set = useSetNextStep(subject.kind, subject.code)
  const finish = useFinishNextStep(subject.kind, subject.code)
  const clear = useClearNextStep(subject.kind, subject.code)
  const busy = set.isPending || finish.isPending || clear.isPending
  const failure = set.error ?? finish.error ?? clear.error

  const linked = linkedTemplate(options, templateId, seed)
  const locked = !options.freeEntry
  const empty = locked && options.templates.length === 0
  /* A chip replaces the box's words, so it stands down once somebody has
     typed their own: one mis-tap must not cost them. */
  const offering = locked || text === '' || text === linked?.name
  /* Words that are no longer the template's are a typed step: the server
     stores a template only while the text still equals its name. */
  const type = (next: string) => {
    setText(next)
    if (linked && next.trim() !== linked.name) setTemplateId(undefined)
  }

  const pick = (template: StepTemplateOption | null) => {
    setTemplateId(template?.id)
    if (!template) return
    setText(template.name)
    const next = dueOnPick(template, due, dueAuto)
    setDue(next.due)
    setDueAuto(next.dueAuto)
    box.current?.focus()
  }

  /* The holder is sent as "absent": the server resolves it at write time, so a
     hand-over since this profile was read cannot leave a stale id behind. */
  const body: NextStepSetBody = {
    text: locked ? (linked?.name ?? '') : text.trim(),
    due,
    ...(doerId !== holder?.id && { doerId }),
    ...(linked && { kindId: linked.kind.id, templateId: linked.id }),
  }
  const ready = body.text !== '' && due !== '' && doerId !== '' && !busy
  const done = { onSuccess: onClose }
  /* The step the person saw: a double-sent "done" then finds another and is refused. */
  const closing = step && { text: step.text, due: step.due }
  const save = () =>
    finishing && closing ? finish.mutate({ closing, next: body }, done) : set.mutate(body, done)

  return (
    <div className="flex flex-col gap-4">
      {finishing && step && (
        <p className="text-muted-foreground break-words text-[12.5px] leading-[1.6]">
          {t(finishedNote(step.text))}
        </p>
      )}

      {empty && options.address ? (
        <EmptyFrameNote address={options.address} />
      ) : (
        <>
          {offering && <TemplateChips options={options} pickedId={linked?.id} onPick={pick} />}

          {locked ? (
            <Field label={t(TASK)}>
              <PickedStepLine picked={linked} />
            </Field>
          ) : (
            <Field label={t(TASK)} note={`${text.length}/${NEXT_STEP_TEXT_MAX}`}>
              <Textarea
                ref={box}
                value={text}
                rows={2}
                autoGrow
                maxLength={NEXT_STEP_TEXT_MAX}
                placeholder={t(EXAMPLE_TASK)}
                aria-label={t(TASK)}
                onChange={(e) => type(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && ready) save()
                }}
              />
            </Field>
          )}

          {/* Two columns only while the card is wide; the xl side column clips them. */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <DueField
              value={due}
              onChange={(next) => {
                setDue(next)
                setDueAuto(false)
              }}
            />
            {canAssign ? (
              <DoerPicker subject={subject} step={step} value={doerId} onChange={setDoerId} />
            ) : (
              <HolderLine subject={subject} />
            )}
          </div>
        </>
      )}

      {failure && (
        <p role="alert" className="text-destructive-foreground text-[12.5px] leading-[1.6]">
          {userMessage(failure)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {step && !finishing && (
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            disabled={busy}
            onClick={() => clear.mutate(undefined, done)}
          >
            <Icon icon={Trash2} size={16} />
            {t(message('Xoá', 'Delete', '삭제'))}
          </Button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            disabled={busy}
            onClick={onClose}
          >
            {t(CANCEL)}
          </Button>
          {finishing && (
            <Button
              size="md"
              variant="ghost"
              className="pointer-coarse:h-12"
              disabled={busy}
              onClick={() => closing && finish.mutate({ closing }, done)}
            >
              {t(message('Xong, không đặt việc mới', 'Done, no new task', '완료, 새 업무 없음'))}
            </Button>
          )}
          {!empty && (
            <Button size="md" className="pointer-coarse:h-12" disabled={!ready} onClick={save}>
              <Icon icon={Check} size={16} />
              {t(finishing ? SAVE_AND_FINISH : SAVE_TASK)}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function DueField({ value, onChange }: { value: string; onChange: (day: string) => void }) {
  const { t } = useI18n()
  return (
    <Field label={t(message('Hạn', 'Due', '기한'))}>
      <Input
        type="date"
        value={value}
        aria-label={t(
          message('Hạn của việc tiếp theo', 'Due date of the next task', '다음 업무의 기한'),
        )}
        className="h-12"
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

/** The template a step is tied to. The standing step keeps its own even when
 *  this state's list no longer offers it, so changing only the day or the doer
 *  does not cut the link; a listed-only state still refuses it, and says so. */
function linkedTemplate(
  options: StepOptionsResponse,
  templateId: string | undefined,
  seed: NextStep | null,
): StepTemplateOption | undefined {
  const offered = options.templates.find((t) => t.id === templateId)
  if (offered || !seed?.kind || !seed.templateId || seed.templateId !== templateId) return offered
  return { id: seed.templateId, name: seed.text, kind: seed.kind }
}

function HolderLine({ subject: { holder, holderHint, noHolder } }: { subject: StepSubject }) {
  const { t } = useI18n()
  return (
    <Field label={t(DOER)} hint={holderHint}>
      <p className="text-foreground flex min-h-12 min-w-0 items-center gap-2 text-[12.5px]">
        {holder ? (
          <>
            <Avatar name={holder.name} size="sm" />
            <span className="min-w-0 break-words">{holder.name}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{noHolder}</span>
        )}
      </p>
    </Field>
  )
}

function DoerPicker({
  subject,
  step,
  value,
  onChange,
}: {
  subject: StepSubject
  step: NextStep | null
  value: string
  onChange: (id: string) => void
}) {
  const { t } = useI18n()
  const options = useDoerOptions(subject.holder, step)
  return (
    <Field label={t(DOER)}>
      <Select
        label={t(DOER)}
        hideLabel
        size="lg"
        className="w-full"
        value={value}
        neutralValue=""
        options={options}
        onChange={onChange}
      />
    </Field>
  )
}

/** Sales people, plus the holder and the current doer when the roster lacks
 *  them — a select whose value is not among its options prints a bare id. The
 *  empty first row exists only for a record with no holder, so no default doer. */
function useDoerOptions(holder: StepSubject['holder'], step: NextStep | null) {
  const { t } = useI18n()
  const options = useSalesPeople().map((a) => ({ value: a.id, label: a.name }))
  const known = [step?.doer, holder]
  for (const person of known) {
    if (person && !options.some((o) => o.value === person.id)) {
      options.unshift({ value: person.id, label: person.name })
    }
  }
  return holder
    ? options
    : [
        { value: '', label: t(message('Chọn người làm', 'Choose an assignee', '담당자 선택')) },
        ...options,
      ]
}
