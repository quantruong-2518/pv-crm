import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, Button, ContextRail, ScreenHeader, ScreenLayout, Skeleton } from '@pv/ui'
import {
  DEBRIEF_SUMMARY_MAX,
  type CommActionChannel,
  type DebriefClose,
  type PendingDebriefRow,
  type WorkstreamRow,
} from '@pv/contracts'
import { isApiError } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { toastDone } from '@/app/toast'
import { dmhm } from '@/lib/date'
import { CommEvaluation } from '@/components/comm-evaluation'
import { CommNextStepFields } from '@/components/comm-next-step-fields'
import { COMMS_CHANNEL_LABEL } from '@/data/comms'
import { commVocabularyQuery } from '@/data/comm-vocabulary'
import {
  EMPTY_STEP_DRAFT,
  commTargetQuery,
  evaluationBlockerOf,
  stepBlockerOf,
  stepInputOf,
  subjectKindLabel,
  subjectPath,
  deleteCommFile,
  uploadCommFile,
  useConfirmComm,
} from '@/data/comm-record-detail'
import { commCreateFailure, commRecordPath, useCreateCommRecord } from '@/data/comm-records'
import {
  ContentFields,
  PickChannel,
  PickWorkstream,
  StepCard,
  StepDone,
  type PickedFile,
} from './comm-log-parts'

/** The manual log on a phone — four steps (ADR 0075 §3).
 *
 *  1 sales run → 2 channel, or join a pending comm of that run → 3 content
 *  and optional files → 4 evaluation and next step → save. A finished step
 *  folds to one line with an edit button. The subject is the run's live
 *  object, fixed here.
 *
 *  Nothing is written before the save: step 4 reads the server's step target
 *  and whether this caller may confirm (`/comms/debriefs/target`), and blocks
 *  with the reason when not. Saving creates the comm (or takes the pending
 *  one), uploads the files and confirms, the step-3 content becoming the
 *  summary. The comm id and each uploaded file are remembered, so a retry
 *  never creates a second comm. */

type Mode = { kind: 'new'; channel: CommActionChannel } | { kind: 'join'; row: PendingDebriefRow }
type Step = 1 | 2 | 3 | 4

export function CommLogPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [ws, setWs] = useState<WorkstreamRow | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<PickedFile[]>([])
  const save = useSaveLog()

  const subjectCode = mode?.kind === 'join' ? mode.row.subject.code : (ws?.stand.code ?? '')
  const contentBlocker = contentBlockerOf(text)
  const channelLabel =
    mode?.kind === 'join'
      ? `Bổ sung lượt liên hệ ${COMMS_CHANNEL_LABEL[mode.row.thread.channel]} · ${dmhm(mode.row.createdAt)}`
      : mode
        ? COMMS_CHANNEL_LABEL[mode.channel]
        : ''
  const wsPath = ws ? subjectPath(ws.code) : undefined
  const subjectRoute = subjectCode ? subjectPath(subjectCode) : undefined

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout className="mx-auto w-full max-w-[480px]">
        <ScreenHeader
          title="Ghi liên hệ"
          back={{ label: 'Quay lại', onClick: () => navigate(-1) }}
        />
        <ContextRail
          max={3}
          objects={
            ws
              ? [
                  { code: ws.code, ...(wsPath ? { onOpen: () => navigate(wsPath) } : {}) },
                  {
                    code: subjectCode,
                    source: true,
                    ...(subjectRoute ? { onOpen: () => navigate(subjectRoute) } : {}),
                  },
                ]
              : []
          }
        />

        {step > 1 && ws ? (
          <StepDone
            no={1}
            label="Lượt bán"
            value={`${ws.code} · ${ws.customer} · ${subjectKindLabel(subjectCode)} ${subjectCode}`}
            onEdit={() => setStep(1)}
          />
        ) : (
          <StepCard no={1} title="Chọn lượt bán">
            <PickWorkstream
              onPick={(picked) => {
                setWs(picked)
                setMode(null)
                setStep(2)
              }}
            />
          </StepCard>
        )}

        {step > 2 && mode ? (
          <StepDone
            no={2}
            label="Phương thức liên hệ"
            value={channelLabel}
            onEdit={() => setStep(2)}
          />
        ) : step === 2 && ws ? (
          <StepCard no={2} title="Phương thức liên hệ">
            <PickChannel
              workstreamCode={ws.code}
              onNew={(channel) => {
                setMode({ kind: 'new', channel })
                setStep(3)
              }}
              onJoin={(row) => {
                setMode({ kind: 'join', row })
                setStep(3)
              }}
            />
          </StepCard>
        ) : null}

        {step > 3 ? (
          <StepDone
            no={3}
            label="Nội dung trao đổi"
            value={text.trim()}
            onEdit={() => setStep(3)}
          />
        ) : step === 3 && mode ? (
          <StepCard no={3} title="Nội dung trao đổi">
            <ContentFields text={text} onText={setText} files={files} onFiles={setFiles} />
            {contentBlocker && <p className="text-warning m-0 text-[12px]">{contentBlocker}</p>}
            <Button size="lg" disabled={contentBlocker !== null} onClick={() => setStep(4)}>
              Tiếp tục
            </Button>
          </StepCard>
        ) : null}

        {step === 4 && mode && (
          <SaveStep
            subjectCode={subjectCode}
            busy={save.busy}
            failure={save.failure}
            onSave={(close) =>
              save.run(mode, subjectCode, files, { ...close, summary: text.trim() }, (id) => {
                toastDone('Đã lưu liên hệ')
                navigate(commRecordPath(id))
              })
            }
          />
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default CommLogPage

/** The content is the comm's summary, so it carries the summary's cap. */
function contentBlockerOf(text: string): string | null {
  const length = text.trim().length
  if (length === 0) return 'Chưa ghi nội dung trao đổi — đây là tóm tắt của lượt liên hệ.'
  return length > DEBRIEF_SUMMARY_MAX
    ? `Nội dung dài ${length.toLocaleString('vi-VN')} ký tự, tóm tắt tối đa ${DEBRIEF_SUMMARY_MAX.toLocaleString('vi-VN')} ký tự — rút gọn lại.`
    : null
}

/** Step 4: the evaluation, the step when the server says the subject takes
 *  one, and save — or, when this caller could not confirm, the reason and no
 *  way forward, before anything is written. */
function SaveStep({
  subjectCode,
  busy,
  failure,
  onSave,
}: {
  subjectCode: string
  busy: boolean
  failure: string | null
  onSave: (close: Omit<DebriefClose, 'summary'>) => void
}) {
  const vocab = useQuery(commVocabularyQuery)
  const target = useQuery(commTargetQuery(subjectCode))
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState(EMPTY_STEP_DRAFT)
  const step = target.data?.stepTarget ?? null
  const kind = subjectKindLabel(subjectCode)

  const blocker = !target.data
    ? target.error
      ? 'Không đọc được điều kiện xác nhận của lượt liên hệ này.'
      : 'Đang đọc điều kiện xác nhận.'
    : !target.data.confirmable
      ? `Bạn không xác nhận được lượt liên hệ trên ${kind.toLowerCase()} ${subjectCode}, nên không lưu được ở đây.`
      : (evaluationBlockerOf(vocab, picked) ?? (step ? stepBlockerOf(draft) : null))

  const save = () =>
    onSave({
      answers: Object.entries(picked).map(([criterionId, answerId]) => ({ criterionId, answerId })),
      ...(step && { step: stepInputOf(draft, step.currentStep) }),
    })

  return (
    <StepCard no={4} title="Đánh giá và bước tiếp theo">
      {target.data?.confirmable && (
        <>
          <CommEvaluation vocab={vocab} picked={picked} onPick={setPicked} />
          {step ? (
            <>
              <span className="text-muted-foreground text-[11px]">
                Bước tiếp theo · cho {kind.toLowerCase()}{' '}
                <span className="font-mono">{subjectCode}</span>
              </span>
              <CommNextStepFields
                current={step.currentStep}
                kinds={vocab.data?.stepKinds ?? []}
                draft={draft}
                onDraft={setDraft}
              />
            </>
          ) : (
            <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
              {kind} {subjectCode} không nhận bước tiếp theo từ lượt liên hệ này.
            </p>
          )}
        </>
      )}
      {target.isPending && <Skeleton className="h-24 w-full" />}
      {(failure || blocker) && (
        <p role={failure ? 'alert' : undefined} className="text-warning m-0 text-[12px]">
          {failure ?? blocker}
        </p>
      )}
      <Button size="lg" className="w-full" disabled={blocker !== null || busy} onClick={save}>
        Lưu liên hệ
      </Button>
    </StepCard>
  )
}

/** Create (or take) the comm → sync files → close, remembering what landed.
 *  The memory is keyed by subject and channel: re-picking the same pair after
 *  a failed save reuses the comm already created instead of making a second. */
function useSaveLog() {
  const create = useCreateCommRecord()
  const confirm = useConfirmComm()
  const done = useRef<{ key: string; id: string | null; files: Map<string, string> }>({
    key: '',
    id: null,
    files: new Map(),
  })
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const run = async (
    mode: Mode,
    subjectCode: string,
    files: PickedFile[],
    body: DebriefClose,
    onDone: (id: string) => void,
  ) => {
    if (busy) return
    setBusy(true)
    setFailure(null)
    const key = `${subjectCode}|${mode.kind === 'join' ? mode.row.id : mode.channel}`
    const same =
      done.current.key === key || (mode.kind === 'join' && done.current.id === mode.row.id)
    if (!same) done.current = { key, id: null, files: new Map() }
    const memory = done.current
    try {
      memory.id ??=
        mode.kind === 'join'
          ? mode.row.id
          : (await create.mutateAsync({ channel: mode.channel, subjectCode })).debriefId
      const id = memory.id
      /* A file uploaded by a failed try and removed since must not stay attached. */
      for (const [fileKey, attachmentId] of memory.files) {
        if (files.some((f) => f.key === fileKey)) continue
        await deleteCommFile(id, attachmentId)
        memory.files.delete(fileKey)
      }
      for (const f of files) {
        if (memory.files.has(f.key)) continue
        memory.files.set(f.key, await uploadCommFile(id, f.file, f.mime))
      }
      await confirm.mutateAsync({ id, body })
      onDone(id)
    } catch (error) {
      setFailure(isApiError(error) ? commCreateFailure(error) : 'Chưa lưu xong. Thử lại.')
    } finally {
      setBusy(false)
    }
  }

  return { run, busy, failure }
}
