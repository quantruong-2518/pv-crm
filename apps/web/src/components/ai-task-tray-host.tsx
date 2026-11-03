import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AiTaskTray, type AiTaskItem, type AiTaskStep } from '@pv/ui'
import {
  COMM_AI_JOB_STEPS,
  LEAD_AI_JOB_STEPS,
  type CommAiJob,
  type CommAiJobStepKey,
  type LeadAiJob,
  type LeadAiJobResult,
  type LeadAiJobStepKey,
} from '@pv/contracts'
import { userMessage, type ApiError } from '@/app/api'
import { formatNumber, message, translate, useI18n, type Message } from '@/app/i18n'
import { toast, toastFail } from '@/app/toast'
import {
  COMM_AI_JOB_FAILED,
  isCommJobActive,
  useCommAiJobs,
  useDismissFinishedCommAiJobs,
} from '@/data/comm-ai-job'
import { inlineLabel } from '@/data/lead-ai-fill'
import {
  isActive,
  refreshLeadReads,
  refusalLine,
  useAiJobs,
  useAiJobTurns,
  useAiTray,
  useDismissFinishedAiJobs,
  usePressAiFill,
  useUndoAiJob,
} from '@/data/lead-ai-job'
import { useAiTraySlot } from '@/components/ai-tray-slot-store'
import { router } from '@/routes'

/** The one mounted AI task tray (ADR 0131 §8): the caller's fill jobs and
 *  recording reports (ADR 0135) mapped onto `AiTaskItem`. Outside the router like
 *  the toasts, so opening a record goes through `router` itself. A reader with
 *  neither `lead.edit` nor `comm.view` has no jobs, so the tray draws nothing. */

const STEP_LABEL: Record<LeadAiJobStepKey, Message> = {
  'read-lead': message('Đọc hồ sơ lead', 'Read the lead profile', '리드 프로필 읽기'),
  'web-search': message('Tìm thông tin trên web', 'Search the web', '웹에서 정보 검색'),
  'tax-lookup': message('Tra cứu mã số thuế', 'Look up the tax ID', '세금번호 조회'),
  'dup-check': message('Kiểm tra trùng công ty', 'Check for duplicate companies', '중복 회사 확인'),
  write: message('Điền vào lead', 'Fill in the lead', '리드에 입력'),
}

const COMM_STEP_LABEL: Record<CommAiJobStepKey, Message> = {
  'read-sources': message('Đọc ghi chú và tệp', 'Read the notes and files', '메모와 파일 읽기'),
  listen: message('Nghe ghi âm', 'Listen to the recording', '녹음 듣기'),
  write: message('Viết tóm tắt và biên bản', 'Write the summary and minutes', '요약과 회의록 작성'),
}

const FILL_FAILED = message(
  'Chưa điền được. Thử lại sau ít phút.',
  'Could not fill in. Try again in a few minutes.',
  '자동 입력하지 못했습니다. 잠시 후 다시 시도하세요.',
)

const LEAD_KIND = message('Điền thông tin lead', 'Fill in lead details', '리드 정보 입력')
const COMM_KIND = message('Báo cáo liên hệ', 'Contact report', '연락 보고서')

const TOTAL = LEAD_AI_JOB_STEPS.length
const COMM_TOTAL = COMM_AI_JOB_STEPS.length

const seconds = (ms: number) => {
  const n = formatNumber(ms / 1000, undefined, { maximumFractionDigits: ms < 10_000 ? 1 : 0 })
  return translate(message(`${n} giây`, `${n} s`, `${n}초`))
}

type Moving = Pick<LeadAiJob, 'state' | 'step' | 'stepMs'>

function stepsOf<Key extends string>(
  job: Moving,
  keys: readonly Key[],
  labels: Record<Key, Message>,
): AiTaskStep[] {
  return keys.map((key, i) => {
    const label = translate(labels[key])
    if (i < job.step) return { label, state: 'done', note: seconds(job.stepMs[i] ?? 0) }
    if (i === job.step && job.state === 'RUNNING') {
      return { label, state: 'now', note: translate(message('đang chạy', 'running', '진행 중')) }
    }
    return { label, state: 'wait' }
  })
}

function runningBadge(job: Moving, total: number) {
  const at = Math.min(job.step + 1, total)
  return translate(
    job.state === 'QUEUED'
      ? message('Đang chờ', 'Waiting', '대기 중')
      : message(`Bước ${at}/${total}`, `Step ${at}/${total}`, `${at}/${total}단계`),
  )
}

function elapsed(job: Moving) {
  const time = seconds(job.stepMs.reduce((sum, ms) => sum + ms, 0))
  return translate(
    message(
      `${job.step} bước · ${time}`,
      `${job.step} ${job.step === 1 ? 'step' : 'steps'} · ${time}`,
      `${job.step}단계 · ${time}`,
    ),
  )
}

function stoppedAt(job: Moving, total: number) {
  const at = Math.min(job.step + 1, total)
  return translate(
    message(
      `Dừng ở bước ${at}/${total}`,
      `Stopped at step ${at}/${total}`,
      `${at}/${total}단계에서 멈췄어요`,
    ),
  )
}

function summaryOf(result: LeadAiJobResult): string {
  const filled = result.filled.length
  const unsure = result.filled.filter((entry) => entry.unsure).length
  const clash = result.conflicts.map((c) =>
    translate(
      message(
        `Mã số thuế ${c.value} đã thuộc ${c.accountName}.`,
        `Tax ID ${c.value} already belongs to ${c.accountName}.`,
        `세금번호 ${c.value}은(는) 이미 ${c.accountName}에 속해 있습니다.`,
      ),
    ),
  )
  if (filled === 0) {
    return clash.length > 0
      ? clash.join(' ')
      : translate(
          message(
            'Không tìm thấy thông tin công khai của công ty này.',
            'No public information found for this company.',
            '이 회사의 공개 정보를 찾지 못했습니다.',
          ),
        )
  }
  const names = result.notFound.map((key) => inlineLabel(key)).join(', ')
  const missing =
    result.notFound.length > 0
      ? translate(
          message(
            `Không tìm thấy ${names}.`,
            `Could not find ${names}.`,
            `${names}을(를) 찾지 못했습니다.`,
          ),
        )
      : ''
  const done = translate(
    unsure > 0
      ? message(
          `Đã điền ${filled} ô, ${unsure} ô chưa chắc.`,
          `Filled ${filled} ${filled === 1 ? 'field' : 'fields'}, ${unsure} unsure.`,
          `${filled}개 항목을 입력했고, ${unsure}개는 불확실합니다.`,
        )
      : message(
          `Đã điền ${filled} ô.`,
          `Filled ${filled} ${filled === 1 ? 'field' : 'fields'}.`,
          `${filled}개 항목을 입력했습니다.`,
        ),
  )
  return [done, missing, ...clash].filter(Boolean).join(' ')
}

type Doors = {
  openLead: (code: string) => void
  retry: (code: string) => void
  undo: (id: string) => void
  retrying: (code: string) => boolean
  undoing: (id: string) => boolean
}

function itemOf(job: LeadAiJob, doors: Doors): AiTaskItem {
  const title = job.leadName
  const kind = translate(LEAD_KIND)
  const open = {
    label: translate(message('Mở lead', 'Open lead', '리드 열기')),
    onClick: () => doors.openLead(job.leadCode),
    primary: true,
  }
  if (job.state === 'QUEUED' || job.state === 'RUNNING') {
    return {
      id: job.id,
      title,
      kind,
      status: 'running',
      badge: runningBadge(job, TOTAL),
      steps: stepsOf(job, LEAD_AI_JOB_STEPS, STEP_LABEL),
    }
  }
  if (job.state === 'FAILED') {
    const retryable = job.errorKind === 'busy' || job.errorKind === 'failed'
    return {
      id: job.id,
      title,
      kind,
      status: 'failed',
      badge: translate(message('Lỗi', 'Error', '오류')),
      summary: job.error ?? translate(FILL_FAILED),
      /* Refused before any step (route off, limit): no step to blame. */
      meta: retryable ? stoppedAt(job, TOTAL) : undefined,
      actions: [
        ...(retryable
          ? [
              {
                label: translate(message('Thử lại', 'Retry', '다시 시도')),
                onClick: () => doors.retry(job.leadCode),
                primary: true,
                busy: doors.retrying(job.leadCode),
              },
            ]
          : []),
        { ...open, primary: false },
      ],
    }
  }
  if (job.undoneAt) {
    const badge = translate(message('Đã hoàn tác', 'Undone', '실행 취소됨'))
    return { id: job.id, title, kind, status: 'done', badge, actions: [open] }
  }
  const undo = job.canUndo
    ? [
        {
          label: translate(message('Hoàn tác', 'Undo', '실행 취소')),
          onClick: () => doors.undo(job.id),
          busy: doors.undoing(job.id),
        },
      ]
    : []
  return {
    id: job.id,
    title,
    kind,
    status: 'done',
    badge: translate(message('Xong', 'Done', '완료')),
    summary: job.result ? summaryOf(job.result) : undefined,
    meta: elapsed(job),
    actions: [open, ...undo],
  }
}

/** No retry here: a press needs the note in the form and the word on the recording. */
function commItemOf(job: CommAiJob, openComm: (id: string) => void): AiTaskItem {
  const base = {
    id: job.id,
    title: job.subjectCode,
    titleMono: true,
    kind: translate(COMM_KIND),
  }
  if (isCommJobActive(job)) {
    return {
      ...base,
      status: 'running',
      badge: runningBadge(job, COMM_TOTAL),
      steps: stepsOf(job, COMM_AI_JOB_STEPS, COMM_STEP_LABEL),
    }
  }
  const actions = [
    {
      label: translate(message('Mở liên hệ', 'Open contact', '연락처 열기')),
      onClick: () => openComm(job.debriefId),
      primary: true,
    },
  ]
  return job.state === 'FAILED'
    ? {
        ...base,
        status: 'failed',
        badge: translate(message('Lỗi', 'Error', '오류')),
        summary: job.error ?? translate(COMM_AI_JOB_FAILED),
        meta: stoppedAt(job, COMM_TOTAL),
        actions,
      }
    : {
        ...base,
        status: 'done',
        badge: translate(message('Xong', 'Done', '완료')),
        summary: translate(
          message(
            'Đã có tóm tắt và biên bản.',
            'The summary and minutes are ready.',
            '요약과 회의록이 준비되었습니다.',
          ),
        ),
        meta: elapsed(job),
        actions,
      }
}

export function AiTaskTrayHost() {
  const { t } = useI18n()
  const client = useQueryClient()
  const jobs = useAiJobs()
  const open = useAiTray((s) => s.open)
  const setOpen = useAiTray((s) => s.setOpen)
  const slot = useAiTraySlot()
  const press = usePressAiFill()
  const undo = useUndoAiJob()
  const clear = useDismissFinishedAiJobs()
  const commJobs = useCommAiJobs()
  const clearComm = useDismissFinishedCommAiJobs()

  /* Here, not on the lead page: a fill or an undo must reach the book and the
     profile whichever screen is open. */
  const refresh = useCallback((job: LeadAiJob) => refreshLeadReads(client, job.leadCode), [client])
  useAiJobTurns(jobs, refresh)

  const doors: Doors = {
    openLead: (code) => {
      setOpen(false)
      void router.navigate(`/sales/leads/${encodeURIComponent(code)}`)
    },
    retry: (code) =>
      press.mutate(code, {
        onError: (error) => toast(refusalLine(error) ?? t(FILL_FAILED), { tone: 'danger' }),
      }),
    undo: (id) =>
      undo.mutate(id, {
        onError: (error) =>
          toastFail(
            t(message('Chưa hoàn tác được.', 'Could not undo.', '실행 취소하지 못했습니다.')),
            userMessage(error),
          ),
      }),
    retrying: (code) => press.isPending && press.variables === code,
    undoing: (id) => undo.isPending && undo.variables === id,
  }

  const openComm = (id: string) => {
    setOpen(false)
    void router.navigate(`/comms/${encodeURIComponent(id)}`)
  }

  /* Each door only when it has rows: a reader with one permission would be refused
     at the other, and the toast would blame a clear that worked. */
  const clearDone = () => {
    const onError = (error: ApiError) =>
      toastFail(
        t(message('Chưa xoá được.', 'Could not clear.', '삭제하지 못했습니다.')),
        userMessage(error),
      )
    if (!jobs.every(isActive)) clear.mutate(undefined, { onError })
    if (!commJobs.every(isCommJobActive)) clearComm.mutate(undefined, { onError })
  }

  return (
    <AiTaskTray
      tasks={[
        ...jobs.map((job) => itemOf(job, doors)),
        ...commJobs.map((job) => commItemOf(job, openComm)),
      ]}
      open={open}
      onOpenChange={setOpen}
      onClearDone={clearDone}
      slot={slot}
      copy={{
        title: t(message('Việc AI', 'AI tasks', 'AI 작업')),
        running: (n) => t(message(`${n} đang chạy`, `${n} running`, `${n}건 진행 중`)),
        failed: (n) => t(message(`${n} lỗi`, `${n} failed`, `${n}건 오류`)),
        done: (n) => t(message(`${n} xong`, `${n} done`, `${n}건 완료`)),
        clear: t(message('Xoá việc đã xong', 'Clear finished tasks', '완료된 작업 지우기')),
        collapse: t(message('Thu gọn khay', 'Collapse tray', '트레이 접기')),
        steps: (n) => t(message(`Xem ${n} bước`, `Show ${n} steps`, `${n}단계 보기`)),
        hideSteps: t(message('Ẩn các bước', 'Hide steps', '단계 숨기기')),
        progress: t(message('Tiến độ', 'Progress', '진행률')),
      }}
    />
  )
}
