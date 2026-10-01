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
  type LeadProfile,
  type NextStep,
  type NextStepSetBody,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { dmy } from '@/lib/date'
import { useSalesPeople } from '@/data/directory'
import {
  nextStepQuery,
  useClearNextStep,
  useFinishNextStep,
  useSetNextStep,
  type StepSubject,
} from '@/data/next-step'
import { DueBadge } from '@/components/contract-bits'
import { Field } from '@/components/field-bits'

/** Module 2 · The one thing that has to happen next on a lead — and, through
 *  `NextStepCard`, on an opportunity (flow G1–G3, ADR 0069 §10).
 *
 *  Deliberately not a todo list: ONE sentence, one day, one doer, replaced the
 *  next time it is saved. Stored on the server (`data/next-step.ts`); the level
 *  pill is the server's grade, never derived here. No step is not a warning
 *  (G2) — the card just offers to set one.
 *
 *  "Xong" asks for the NEXT step in the same breath and sends both in one
 *  request, so no other tab ever reads a gap between two steps. */

/** Openings that cover most of what follows a first conversation. A chip FILLS
 *  the box and saves nothing, and stands down once the box holds anything —
 *  overwriting somebody's typing on one mis-tap is how a screen loses work. */
const LEAD_SUGGESTIONS = ['Gọi lại', 'Gửi hồ sơ năng lực', 'Hẹn khảo sát']

type Props = { lead?: null; locked: true } | { lead: LeadProfile; canEdit: boolean; locked?: false }

export function NextActionCard(props: Props) {
  if (props.locked) {
    return (
      <StepShell>
        <p className="text-muted-foreground text-[12.5px] leading-[1.6]">Có sau khi tạo lead.</p>
      </StepShell>
    )
  }
  return <LeadStep lead={props.lead} canEdit={props.canEdit} />
}

function LeadStep({ lead, canEdit }: { lead: LeadProfile; canEdit: boolean }) {
  const canAssign = useCan('lead.assign')
  const subject: StepSubject = {
    kind: 'lead',
    code: lead.code,
    holder: lead.ownerId ? { id: lead.ownerId, name: lead.ownerName ?? lead.ownerId } : null,
    canAssign,
    holderHint: 'Người giữ lead.',
    noHolder: 'Chưa ai giữ lead, cần giao lead trước.',
    suggestions: LEAD_SUGGESTIONS,
  }
  return <NextStepCard subject={subject} canEdit={canEdit} />
}

/** `closedNote` replaces the whole body: a stopped or signed deal has no step
 *  and refuses writes (409), so the card says why instead of reading `null`. */
export function NextStepCard({
  subject,
  canEdit,
  closedNote,
}: {
  subject: StepSubject
  canEdit: boolean
  closedNote?: string
}) {
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
  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Việc tiếp theo">
      <SectionTitle size="detail" hint="Một bước cụ thể phải làm tiếp.">
        Việc tiếp theo
      </SectionTitle>
      {children}
    </GlassCard>
  )
}

/** `finish` is the edit form opened by "Xong": same boxes, empty, different doors. */
type Mode = 'view' | 'edit' | 'finish'

function StepBody({ subject, canEdit }: { subject: StepSubject; canEdit: boolean }) {
  const { data, isPending, error } = useQuery(nextStepQuery(subject.kind, subject.code))
  const [mode, setMode] = useState<Mode>('view')

  if (isPending) return <Skeleton className="h-16 w-full" />
  if (!data) {
    return (
      <p className="text-warning text-[12.5px] leading-[1.6]">
        Không đọc được việc tiếp theo.{' '}
        {isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}
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
          Chưa đặt việc tiếp theo.
        </p>
        {canEdit && (
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => setMode('edit')}
          >
            <Icon icon={Plus} size={16} />
            Đặt việc tiếp theo
          </Button>
        )}
      </div>
    )
  }
  return (
    <StepView
      step={step}
      canEdit={canEdit}
      onEdit={() => setMode('edit')}
      onFinish={() => setMode('finish')}
    />
  )
}

function StepView({
  step,
  canEdit,
  onEdit,
  onFinish,
}: {
  step: NextStep
  canEdit: boolean
  onEdit: () => void
  onFinish: () => void
}) {
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
        <DueBadge level={step.dueLevel} className="normal-case tracking-normal" />
        <span className="text-muted-foreground inline-flex min-w-0 items-center gap-2">
          <Avatar name={step.doer.name} size="sm" />
          <span className="min-w-0 break-words">{step.doer.name}</span>
        </span>
      </div>
      {canEdit && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={onEdit}>
            <Icon icon={Pencil} size={16} />
            Sửa
          </Button>
          <Button size="md" className="pointer-coarse:h-12" onClick={onFinish}>
            <Icon icon={Check} size={16} />
            Xong
          </Button>
        </div>
      )}
    </>
  )
}

/** Set, edit, or — when `finishing` — name what comes after the step just done.
 *  Mounted fresh on every open, so its boxes seed from props without a reseed.
 *  Exported for the journey drawer, which edits a deal's step in place. */
export function NextStepForm({
  subject,
  step,
  finishing,
  onClose,
}: {
  subject: StepSubject
  step: NextStep | null
  finishing: boolean
  onClose: () => void
}) {
  const seed = finishing ? null : step
  const [text, setText] = useState(seed?.text ?? '')
  /* Empty rather than today: a pre-filled day is a deadline nobody chose. */
  const [due, setDue] = useState(seed?.due ?? '')
  const { canAssign, holder } = subject
  /* Without the right to assign, the doer IS the holder, so the form never offers another. */
  const [doerId, setDoerId] = useState((canAssign ? seed?.doer.id : null) ?? holder?.id ?? '')
  const box = useRef<HTMLTextAreaElement>(null)

  const set = useSetNextStep(subject.kind, subject.code)
  const finish = useFinishNextStep(subject.kind, subject.code)
  const clear = useClearNextStep(subject.kind, subject.code)
  const busy = set.isPending || finish.isPending || clear.isPending
  const failure = set.error ?? finish.error ?? clear.error

  /* The holder is sent as "absent": the server resolves it at write time, so a
     hand-over since this profile was read cannot leave a stale id behind. */
  const body: NextStepSetBody = {
    text: text.trim(),
    due,
    ...(doerId !== holder?.id && { doerId }),
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
          Đã xong “{step.text}”. Việc tiếp theo là gì? Chưa có thì chọn “Xong, không đặt việc mới”.
        </p>
      )}

      {text === '' && subject.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {subject.suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              size="sm"
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={() => {
                setText(suggestion)
                box.current?.focus()
              }}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      )}

      <Field label="Việc cần làm" note={`${text.length}/${NEXT_STEP_TEXT_MAX}`}>
        <Textarea
          ref={box}
          value={text}
          rows={2}
          autoGrow
          maxLength={NEXT_STEP_TEXT_MAX}
          placeholder="Ví dụ: Gọi lại để chốt lịch khảo sát."
          aria-label="Việc cần làm"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && ready) save()
          }}
        />
      </Field>

      {/* Two columns only while the card is wide; the xl side column clips them. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <Field label="Hạn">
          <Input
            type="date"
            value={due}
            aria-label="Hạn của việc tiếp theo"
            className="h-12"
            onChange={(e) => setDue(e.target.value)}
          />
        </Field>
        {canAssign ? (
          <DoerPicker subject={subject} step={step} value={doerId} onChange={setDoerId} />
        ) : (
          <Field label="Người làm" hint={subject.holderHint}>
            <p className="text-foreground flex min-h-12 min-w-0 items-center gap-2 text-[12.5px]">
              {holder ? (
                <>
                  <Avatar name={holder.name} size="sm" />
                  <span className="min-w-0 break-words">{holder.name}</span>
                </>
              ) : (
                <span className="text-muted-foreground">{subject.noHolder}</span>
              )}
            </p>
          </Field>
        )}
      </div>

      {failure && (
        <p role="alert" className="text-warning text-[12.5px] leading-[1.6]">
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
            Xoá
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
            Huỷ
          </Button>
          {finishing && (
            <Button
              size="md"
              variant="ghost"
              className="pointer-coarse:h-12"
              disabled={busy}
              onClick={() => closing && finish.mutate({ closing }, done)}
            >
              Xong, không đặt việc mới
            </Button>
          )}
          <Button size="md" className="pointer-coarse:h-12" disabled={!ready} onClick={save}>
            <Icon icon={Check} size={16} />
            {finishing ? 'Xong và lưu việc mới' : 'Lưu việc'}
          </Button>
        </div>
      </div>
    </div>
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
  const options = useDoerOptions(subject.holder, step)
  return (
    <Field label="Người làm">
      <Select
        label="Người làm"
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
  const options = useSalesPeople().map((a) => ({ value: a.id, label: a.name }))
  const known = [step?.doer, holder]
  for (const person of known) {
    if (person && !options.some((o) => o.value === person.id)) {
      options.unshift({ value: person.id, label: person.name })
    }
  }
  return holder ? options : [{ value: '', label: 'Chọn người làm' }, ...options]
}
