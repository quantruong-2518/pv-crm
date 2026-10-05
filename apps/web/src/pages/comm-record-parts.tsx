import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  Button,
  Check,
  Eye,
  GlassCard,
  Icon,
  Input,
  Modal,
  Save,
  SectionTitle,
  Skeleton,
  Textarea,
  cn,
} from '@pv/ui'
import {
  DEBRIEF_SUMMARY_MAX,
  DEBRIEF_TITLE_MAX,
  type CommVocabularyResponse,
  type DebriefClose,
  type DebriefView,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dmy } from '@/lib/date'
import { RecordShell } from '@/components/record/record-shell'
import { CommFileDrop, CommFileList } from '@/components/comm-files'
import { ChoiceChip } from '@/components/comm-bits'
import { CommNextStepFields } from '@/components/comm-next-step-fields'
import { Field } from '@/components/field-bits'
import { commVocabularyQuery } from '@/data/comm-vocabulary'
import {
  COMM_CARD_SURFACE,
  EMPTY_STEP_DRAFT,
  type StepDraft,
  evaluationBlockerOf,
  stepBlockerOf,
  stepInputOf,
  subjectKindLabel,
  useConfirmComm,
} from '@/data/comm-record-detail'

/** The confirm form of an open comm, and the evaluation block the mobile log
 *  shares (ADR 0074 §2, 0075 §2). The read view of a done comm is
 *  `CommRecordRead` in `components/comm-record-bits.tsx`.
 *
 *  Filled by hand this turn — AI pre-fill is deferred (ADR 0075 §6), so there
 *  is no AI block here and nothing is proposed on the reader's behalf.
 *  Answers are the admin's words, one per active question, never a score. */

type Draft = { title: string; summary: string; picked: Record<string, string>; step: StepDraft }

const draftKey = (id: string) => `comm-draft:${id}`

/** Browser storage can throw or come back empty; a draft is a convenience. */
function readDraft(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(id))
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

function writeDraft(id: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(draftKey(id), JSON.stringify(draft))
    else localStorage.removeItem(draftKey(id))
  } catch {
    /* storage unavailable — the form still works, it just cannot be kept */
  }
}

/** Same float as `ActionBar` (ADR 0078 §1); that one is built for reaching
 *  contacts, this one carries the form's own verbs. */
function FormBar({
  onPreview,
  onSave,
  onConfirm,
  disabled,
}: {
  onPreview: () => void
  onSave: () => void
  onConfirm: () => void
  disabled: boolean
}) {
  return (
    <div
      data-action-bar
      className="pointer-events-none fixed inset-x-4 bottom-[calc(84px+env(safe-area-inset-bottom)+12px)] z-20 flex justify-center lg:bottom-6 lg:right-24"
    >
      <div
        role="group"
        aria-label="Thao tác liên hệ"
        className="glass-overlay pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-lg p-2"
      >
        <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={() => onPreview}>
          <Icon icon={Eye} size={16} />
          Xem trước
        </Button>
        <Button size="md" variant="secondary" className="pointer-coarse:h-12" onClick={onSave}>
          <Icon icon={Save} size={16} />
          Lưu nháp
        </Button>
        <Button size="md" className="pointer-coarse:h-12" disabled={disabled} onClick={onConfirm}>
          Xác nhận
        </Button>
      </div>
    </div>
  )
}

/** The owner's working screen for an open comm: text in the main column, files,
 *  evaluation and the step's due date in the rail, the verbs in the floating
 *  bar. A draft is kept in this browser only; the server stores title and
 *  content when the owner confirms. */
export function ConfirmWorkspace({
  record,
  strip,
  header,
  turns,
}: {
  record: DebriefView
  strip: ReactNode
  header: ReactNode
  turns: ReactNode
}) {
  const vocab = useQuery(commVocabularyQuery)
  const confirm = useConfirmComm()
  const target = record.stepTarget
  const current = target?.currentStep ?? null
  const saved = useMemo(() => readDraft(record.id), [record.id])

  const [title, setTitle] = useState(saved?.title ?? '')
  const [summary, setSummary] = useState(saved?.summary ?? '')
  const [picked, setPicked] = useState<Record<string, string>>(saved?.picked ?? {})
  const [draft, setDraft] = useState(saved?.step ?? EMPTY_STEP_DRAFT)
  const [previewing, setPreviewing] = useState(false)

  const blocker =
    (title.trim() === '' ? 'Chưa có tiêu đề.' : null) ??
    (summary.trim() === '' ? 'Chưa có nội dung.' : null) ??
    evaluationBlockerOf(vocab, picked) ??
    (target ? stepBlockerOf(draft) : null)

  const blocked = blocker !== null || confirm.isPending

  const save = () => {
    writeDraft(record.id, { title, summary, picked, step: draft })
    toastDone('Đã lưu nháp trên máy này')
  }

  const submit = () => {
    if (blocker || confirm.isPending) return
    const body: DebriefClose = {
      title: title.trim(),
      summary: summary.trim(),
      answers: (vocab.data?.criteria ?? []).map((c) => ({
        criterionId: c.id,
        answerId: picked[c.id] ?? '',
      })),
      ...(target && { step: stepInputOf(draft, current) }),
    }
    confirm.mutate(
      { id: record.id, body },
      {
        onSuccess: () => {
          writeDraft(record.id, null)
          setPreviewing(false)
          toastDone('Đã xác nhận liên hệ')
        },
      },
    )
  }

  return (
    <RecordShell
      strip={strip}
      header={header}
      main={
        <>
          <GlassCard className="flex flex-col gap-6 p-5 lg:p-6" aria-label="Nội dung liên hệ">
            <Field label="Tiêu đề" note={`${title.length}/${DEBRIEF_TITLE_MAX}`}>
              <Input
                value={title}
                maxLength={DEBRIEF_TITLE_MAX}
                aria-label="Tiêu đề"
                className="pointer-coarse:h-12"
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Nội dung" note={`${summary.length}/${DEBRIEF_SUMMARY_MAX}`}>
              <Textarea
                value={summary}
                autoGrow
                maxLength={DEBRIEF_SUMMARY_MAX}
                className="min-h-[calc(100dvh-18rem)]"
                aria-label="Nội dung"
                onChange={(e) => setSummary(e.target.value)}
              />
            </Field>
            {(confirm.error || blocker) && (
              <p role={confirm.error ? 'alert' : undefined} className="text-warning text-[12px]">
                {confirm.error ? userMessage(confirm.error) : blocker}
              </p>
            )}
          </GlassCard>
          {turns}
        </>
      }
      rail={
        <>
          <GlassCard variant="b" className="flex flex-col gap-4 p-5" aria-label="Tệp">
            <SectionTitle size="detail">Tệp đính kèm</SectionTitle>
            <CommFileDrop id={record.id} />
            <CommFileList id={record.id} canDelete />
          </GlassCard>
          <GlassCard className="p-5" aria-label="Đánh giá">
            <Evaluation vocab={vocab} picked={picked} onPick={setPicked} />
          </GlassCard>
          <GlassCard className="flex flex-col gap-3 p-5" aria-label="Bước tiếp theo">
            {target ? (
              <>
                <span className="text-muted-foreground text-[11px]">
                  Bước tiếp theo · cho {subjectKindLabel(record.subject.code).toLowerCase()}{' '}
                  <span className="font-mono">{record.subject.code}</span>
                </span>
                <CommNextStepFields
                  current={current}
                  kinds={vocab.data?.stepKinds ?? []}
                  draft={draft}
                  onDraft={setDraft}
                />
              </>
            ) : (
              <p className="text-muted-foreground text-[12px] leading-[1.6]">
                {subjectKindLabel(record.subject.code)}{' '}
                <span className="font-mono">{record.subject.code}</span> không nhận bước tiếp theo
                từ lượt liên hệ này.
              </p>
            )}
          </GlassCard>
        </>
      }
      railLabel="Tệp, đánh giá và hạn"
      actionBar={
        <FormBar
          onPreview={() => setPreviewing(true)}
          onSave={save}
          onConfirm={submit}
          disabled={blocked}
        />
      }
    >
      <Modal
        open={previewing}
        onClose={() => setPreviewing(false)}
        title="Xem trước"
        subtitle={record.subject.label}
        footer={
          <Button size="md" disabled={blocked} onClick={submit}>
            Xác nhận
          </Button>
        }
      >
        <Preview {...{ title, summary, picked }} vocab={vocab.data} step={target ? draft : null} />
      </Modal>
    </RecordShell>
  )
}

function Preview({
  title,
  summary,
  vocab,
  picked,
  step,
}: {
  title: string
  summary: string
  vocab: CommVocabularyResponse | undefined
  picked: Record<string, string>
  step: StepDraft | null
}) {
  const none = <span className="text-muted-foreground">Chưa điền</span>
  const kind = vocab?.stepKinds.find((k) => k.id === step?.kindId)?.name
  return (
    <dl className="m-0 flex flex-col gap-4 text-[12.5px] leading-[1.6]">
      <PreviewRow label="Tiêu đề">{title.trim() || none}</PreviewRow>
      <PreviewRow label="Nội dung">{summary.trim() || none}</PreviewRow>
      {(vocab?.criteria ?? []).map((c) => (
        <PreviewRow key={c.id} label={c.name}>
          {c.answers.find((a) => a.id === picked[c.id])?.name ?? none}
        </PreviewRow>
      ))}
      {step && (
        <PreviewRow label="Bước tiếp theo">
          {step.text.trim() ? (
            <>
              {kind && `${kind} · `}
              {step.text} · hạn {step.due ? dmy(step.due) : '—'}
            </>
          ) : (
            none
          )}
        </PreviewRow>
      )}
    </dl>
  )
}

function PreviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-[11px]">{label}</dt>
      <dd className="m-0 whitespace-pre-wrap break-words">{children}</dd>
    </div>
  )
}

/** One fieldset per active question; the answers are the admin's words. */
export function Evaluation({
  vocab,
  picked,
  onPick,
}: {
  vocab: UseQueryResult<CommVocabularyResponse>
  picked: Record<string, string>
  onPick: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const criteria = vocab.data?.criteria ?? []
  return (
    <div className="flex flex-col gap-3">
      <span className="text-muted-foreground text-[11px]">Đánh giá</span>
      {vocab.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : vocab.error ? (
        <p role="alert" className="text-warning text-[12px]">
          Không tải được bộ câu hỏi.{' '}
          {isApiError(vocab.error) ? userMessage(vocab.error) : 'Tải lại trang.'}
        </p>
      ) : criteria.length === 0 ? (
        <p className="text-muted-foreground text-[12px] leading-[1.6]">
          Chưa có câu hỏi đánh giá nào đang bật — phần này để trống.
        </p>
      ) : (
        criteria.map((c) => (
          <fieldset
            key={c.id}
            className={cn('flex flex-col gap-2 rounded-md p-3', COMM_CARD_SURFACE)}
          >
            <legend className="sr-only">{c.name}</legend>
            <span aria-hidden className="text-[12.5px] font-medium">
              {c.name}
            </span>
            <div className="flex flex-wrap gap-2">
              {c.answers.map((a) => (
                <ChoiceChip
                  key={a.id}
                  className="h-8 gap-1 px-2 text-[11.5px]"
                  pressed={picked[c.id] === a.id}
                  icon={picked[c.id] === a.id ? Check : undefined}
                  onClick={() => onPick((p) => ({ ...p, [c.id]: a.id }))}
                >
                  {a.name}
                </ChoiceChip>
              ))}
            </div>
          </fieldset>
        ))
      )}
    </div>
  )
}
