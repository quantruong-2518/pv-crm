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
import { message, translate, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { dmhm } from '@/lib/date'
import { CommEvaluation } from '@/components/comm-evaluation'
import { CommNextStepFields } from '@/components/comm-next-step-fields'
import { TemperaturePick } from '@/components/temperature-pick'
import { COMMS_CHANNEL_LABEL } from '@/data/comms'
import { commVocabularyQuery } from '@/data/comm-vocabulary'
import {
  EMPTY_STEP_DRAFT,
  evaluationBlockerOf,
  subjectKindLabel,
  subjectPath,
  deleteCommFile,
  uploadCommFile,
  useConfirmComm,
} from '@/data/comm-record-detail'
import { commCreateFailure, commRecordPath, useCreateCommRecord } from '@/data/comm-records'
import { useCloseStep } from '@/data/customer-close'
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
  const { t, lang } = useI18n()
  const chrome = useAppChrome({
    searchPlaceholder: t(
      message(
        'Tìm khách hàng, cơ hội, báo giá, hồ sơ…',
        'Search accounts, opportunities, quotes, and profiles…',
        '고객사, 기회, 견적 및 프로필 검색…',
      ),
    ),
  })
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [ws, setWs] = useState<WorkstreamRow | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<PickedFile[]>([])
  const save = useSaveLog()

  const subjectCode = mode?.kind === 'join' ? mode.row.subject.code : (ws?.stand.code ?? '')
  const contentBlocker = contentBlockerOf(text, lang)
  const channelLabel =
    mode?.kind === 'join'
      ? t(
          message(
            `Bổ sung lượt liên hệ ${COMMS_CHANNEL_LABEL[mode.row.thread.channel]} · ${dmhm(mode.row.createdAt)}`,
            `Add to ${channelName(mode.row.thread.channel, t)} interaction · ${dmhm(mode.row.createdAt)}`,
            `${channelName(mode.row.thread.channel, t)} 연락 기록 추가 · ${dmhm(mode.row.createdAt)}`,
          ),
        )
      : mode
        ? channelName(mode.channel, t)
        : ''
  const wsPath = ws ? subjectPath(ws.code) : undefined
  const subjectRoute = subjectCode ? subjectPath(subjectCode) : undefined

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout className="mx-auto w-full max-w-[480px]">
        <ScreenHeader
          title={t(message('Ghi liên hệ', 'Log an interaction', '연락 기록'))}
          back={{ label: t(message('Quay lại', 'Back', '뒤로')), onClick: () => navigate(-1) }}
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
            label={t(message('Lượt bán', 'Workstream', '영업 건'))}
            value={`${ws.code} · ${ws.customer} · ${subjectKindLabel(subjectCode)} ${subjectCode}`}
            onEdit={() => setStep(1)}
          />
        ) : (
          <StepCard
            no={1}
            title={t(message('Chọn lượt bán', 'Choose a workstream', '영업 건 선택'))}
          >
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
            label={t(message('Phương thức liên hệ', 'Contact method', '연락 방법'))}
            value={channelLabel}
            onEdit={() => setStep(2)}
          />
        ) : step === 2 && ws ? (
          <StepCard no={2} title={t(message('Phương thức liên hệ', 'Contact method', '연락 방법'))}>
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
            label={t(message('Nội dung trao đổi', 'Interaction details', '연락 내용'))}
            value={text.trim()}
            onEdit={() => setStep(3)}
          />
        ) : step === 3 && mode ? (
          <StepCard
            no={3}
            title={t(message('Nội dung trao đổi', 'Interaction details', '연락 내용'))}
          >
            <ContentFields text={text} onText={setText} files={files} onFiles={setFiles} />
            {contentBlocker && <p className="text-warning m-0 text-[12px]">{contentBlocker}</p>}
            <Button size="lg" disabled={contentBlocker !== null} onClick={() => setStep(4)}>
              {t(message('Tiếp tục', 'Continue', '계속'))}
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
                toastDone(t(message('Đã lưu liên hệ', 'Interaction saved', '연락 기록 저장 완료')))
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
function contentBlockerOf(text: string, lang: ReturnType<typeof useI18n>['lang']): string | null {
  const m = (vi: string, en: string, ko: string) => ({ vi, en, ko })[lang]
  const length = text.trim().length
  if (length === 0)
    return m(
      'Chưa ghi nội dung trao đổi.',
      'Add interaction details before continuing.',
      '계속하기 전에 연락 내용을 입력하세요.',
    )
  return length > DEBRIEF_SUMMARY_MAX
    ? m(
        `Nội dung dài ${length.toLocaleString('vi-VN')} ký tự, tối đa ${DEBRIEF_SUMMARY_MAX.toLocaleString('vi-VN')} ký tự. Rút gọn lại.`,
        `This is ${length.toLocaleString('en-US')} characters. The limit is ${DEBRIEF_SUMMARY_MAX.toLocaleString('en-US')}. Shorten it to continue.`,
        `내용이 ${length.toLocaleString('ko-KR')}자입니다. 최대 ${DEBRIEF_SUMMARY_MAX.toLocaleString('ko-KR')}자까지 입력할 수 있습니다. 줄여 주세요.`,
      )
    : null
}

function channelName(channel: string, t: (copy: ReturnType<typeof message>) => string) {
  const copy = {
    email: message('Email', 'Email', '이메일'),
    'zalo-oa': message('Zalo', 'Zalo', 'Zalo'),
    telegram: message('Telegram', 'Telegram', '텔레그램'),
    whatsapp: message('WhatsApp', 'WhatsApp', 'WhatsApp'),
    'in-app': message('Trong ứng dụng', 'In-app', '앱 내'),
    phone: message('Điện thoại', 'Phone', '전화'),
    meeting: message('Gặp mặt', 'Meeting', '대면 미팅'),
  } as const
  return t(copy[channel as keyof typeof copy] ?? message(channel, channel, channel))
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
  const { t } = useI18n()
  const vocab = useQuery(commVocabularyQuery)
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState(EMPTY_STEP_DRAFT)
  const close = useCloseStep(subjectCode)
  const { target } = close
  const kind = subjectKindLabel(subjectCode)
  const stepCode = close.stepCode

  const blocker = !target.data
    ? target.error
      ? t(
          message(
            'Không tải được điều kiện xác nhận.',
            'Could not load confirmation requirements.',
            '확인 조건을 불러오지 못했습니다.',
          ),
        )
      : t(
          message(
            'Đang tải điều kiện xác nhận.',
            'Loading confirmation requirements…',
            '확인 조건 불러오는 중…',
          ),
        )
    : !target.data.confirmable
      ? t(
          message(
            `Bạn không xác nhận được lượt liên hệ trên ${kind.toLowerCase()} ${subjectCode}.`,
            `You cannot confirm the interaction for ${kind.toLowerCase()} ${subjectCode}.`,
            `${kind} ${subjectCode}의 연락을 확인할 권한이 없습니다.`,
          ),
        )
      : (evaluationBlockerOf(vocab, picked) ?? close.temperatureGap ?? close.gapOf(draft))

  const save = () =>
    onSave({
      answers: Object.entries(picked).map(([criterionId, answerId]) => ({ criterionId, answerId })),
      ...close.inputOf(draft),
    })

  return (
    <StepCard
      no={4}
      title={t(
        message('Đánh giá và bước tiếp theo', 'Evaluation and next step', '평가 및 다음 단계'),
      )}
    >
      {target.data?.confirmable && (
        <>
          <CommEvaluation vocab={vocab} picked={picked} onPick={setPicked} />
          {close.customer && (
            <TemperaturePick value={close.temperature} onPick={close.setTemperature} />
          )}
          {close.takesStep ? (
            close.stepShown && (
              <>
                <span className="text-muted-foreground text-[11px]">
                  {t(message('Bước tiếp theo · cho', 'Next step · for', '다음 단계 · 대상'))}{' '}
                  {subjectKindLabel(stepCode).toLowerCase()}{' '}
                  <span className="font-mono">{stepCode}</span>
                </span>
                <CommNextStepFields
                  kinds={vocab.data?.stepKinds ?? []}
                  options={close.options}
                  draft={draft}
                  onDraft={setDraft}
                />
              </>
            )
          ) : (
            <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
              {t(
                message(
                  `${kind} ${subjectCode} không nhận bước tiếp theo từ lượt liên hệ này.`,
                  `${kind} ${subjectCode} does not accept a next step from this interaction.`,
                  `${kind} ${subjectCode}에는 이 연락에서 다음 단계를 지정할 수 없습니다.`,
                ),
              )}
            </p>
          )}
        </>
      )}
      {target.isPending && <Skeleton className="h-24 w-full" />}
      {(failure || blocker) && (
        <p
          role={failure ? 'alert' : undefined}
          className={
            failure ? 'text-destructive-foreground m-0 text-[12px]' : 'text-warning m-0 text-[12px]'
          }
        >
          {failure ?? blocker}
        </p>
      )}
      <Button size="lg" className="w-full" disabled={blocker !== null || busy} onClick={save}>
        {t(message('Lưu liên hệ', 'Save interaction', '연락 기록 저장'))}
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
      setFailure(
        isApiError(error)
          ? commCreateFailure(error)
          : translate(
              message(
                'Không lưu được. Thử lại.',
                'Could not save. Try again.',
                '저장하지 못했습니다. 다시 시도해 주세요.',
              ),
            ),
      )
    } finally {
      setBusy(false)
    }
  }

  return { run, busy, failure }
}
