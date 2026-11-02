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
import { router } from '@/routes'

/** The one mounted AI task tray (ADR 0131 §8): the caller's fill jobs and
 *  recording reports (ADR 0135) mapped onto `AiTaskItem`. Outside the router like
 *  the toasts, so opening a record goes through `router` itself. A reader with
 *  neither `lead.edit` nor `comm.view` has no jobs, so the tray draws nothing. */

const STEP_LABEL: Record<LeadAiJobStepKey, string> = {
  'read-lead': 'Đọc hồ sơ lead',
  'web-search': 'Tìm thông tin trên web',
  'tax-lookup': 'Tra cứu mã số thuế',
  'dup-check': 'Kiểm tra trùng công ty',
  write: 'Điền vào lead',
}

const COMM_STEP_LABEL: Record<CommAiJobStepKey, string> = {
  'read-sources': 'Đọc ghi chú và tệp',
  listen: 'Nghe ghi âm',
  write: 'Viết tóm tắt và biên bản',
}

const TOTAL = LEAD_AI_JOB_STEPS.length
const COMM_TOTAL = COMM_AI_JOB_STEPS.length

const seconds = (ms: number) =>
  `${(ms / 1000).toLocaleString('vi-VN', { maximumFractionDigits: ms < 10_000 ? 1 : 0 })} giây`

type Moving = Pick<LeadAiJob, 'state' | 'step' | 'stepMs'>

function stepsOf<Key extends string>(
  job: Moving,
  keys: readonly Key[],
  labels: Record<Key, string>,
): AiTaskStep[] {
  return keys.map((key, i) => {
    const label = labels[key]
    if (i < job.step) return { label, state: 'done', note: seconds(job.stepMs[i] ?? 0) }
    if (i === job.step && job.state === 'RUNNING') return { label, state: 'now', note: 'đang chạy' }
    return { label, state: 'wait' }
  })
}

const runningBadge = (job: Moving, total: number) =>
  job.state === 'QUEUED' ? 'Đang chờ' : `Bước ${Math.min(job.step + 1, total)}/${total}`

const elapsed = (job: Moving) =>
  `${job.step} bước · ${seconds(job.stepMs.reduce((sum, ms) => sum + ms, 0))}`

function summaryOf(result: LeadAiJobResult): string {
  const filled = result.filled.length
  const unsure = result.filled.filter((entry) => entry.unsure).length
  const clash = result.conflicts.map((c) => `Mã số thuế ${c.value} đã thuộc ${c.accountName}.`)
  if (filled === 0)
    return clash.length > 0
      ? clash.join(' ')
      : 'Không tìm thấy thông tin công khai của công ty này.'
  const missing =
    result.notFound.length > 0
      ? `Không tìm thấy ${result.notFound.map(inlineLabel).join(', ')}.`
      : ''
  return [`Đã điền ${filled} ô${unsure > 0 ? `, ${unsure} ô chưa chắc` : ''}.`, missing, ...clash]
    .filter(Boolean)
    .join(' ')
}

type Doors = {
  openLead: (code: string) => void
  retry: (code: string) => void
  undo: (id: string) => void
  retrying: (code: string) => boolean
  undoing: (id: string) => boolean
}

function itemOf(job: LeadAiJob, doors: Doors): AiTaskItem {
  const title = `Điền hồ sơ · ${job.leadName}`
  const open = { label: 'Mở lead', onClick: () => doors.openLead(job.leadCode), primary: true }
  if (job.state === 'QUEUED' || job.state === 'RUNNING') {
    return {
      id: job.id,
      title,
      status: 'running',
      badge: runningBadge(job, TOTAL),
      steps: stepsOf(job, LEAD_AI_JOB_STEPS, STEP_LABEL),
    }
  }
  if (job.state === 'FAILED') {
    const at = Math.min(job.step, TOTAL - 1)
    const key = LEAD_AI_JOB_STEPS[at] ?? 'write'
    const retryable = job.errorKind === 'busy' || job.errorKind === 'failed'
    return {
      id: job.id,
      title,
      status: 'failed',
      badge: 'Lỗi',
      /* Refused before any step (route off, limit): no step to blame. */
      steps: retryable
        ? [{ label: `Bước ${at + 1}/${TOTAL} · ${STEP_LABEL[key]}`, state: 'fail', note: 'lỗi' }]
        : undefined,
      summary: job.error ?? 'Chưa điền được. Thử lại sau ít phút.',
      actions: retryable
        ? [
            {
              label: 'Thử lại',
              onClick: () => doors.retry(job.leadCode),
              primary: true,
              busy: doors.retrying(job.leadCode),
            },
          ]
        : [],
    }
  }
  if (job.undoneAt)
    return { id: job.id, title, status: 'done', badge: 'Đã hoàn tác', actions: [open] }
  const undo = job.canUndo
    ? [{ label: 'Hoàn tác', onClick: () => doors.undo(job.id), busy: doors.undoing(job.id) }]
    : []
  return {
    id: job.id,
    title,
    status: 'done',
    badge: 'Xong',
    summary: job.result ? summaryOf(job.result) : undefined,
    meta: elapsed(job),
    actions: [open, ...undo],
  }
}

/** No retry here: a press needs the note in the form and the word on the recording. */
function commItemOf(job: CommAiJob, openComm: (id: string) => void): AiTaskItem {
  const base = { id: job.id, title: `Tóm tắt và biên bản · ${job.subjectCode}` }
  if (isCommJobActive(job)) {
    return {
      ...base,
      status: 'running',
      badge: runningBadge(job, COMM_TOTAL),
      steps: stepsOf(job, COMM_AI_JOB_STEPS, COMM_STEP_LABEL),
    }
  }
  const actions = [{ label: 'Mở liên hệ', onClick: () => openComm(job.debriefId), primary: true }]
  return job.state === 'FAILED'
    ? {
        ...base,
        status: 'failed',
        badge: 'Lỗi',
        summary: job.error ?? COMM_AI_JOB_FAILED,
        actions,
      }
    : {
        ...base,
        status: 'done',
        badge: 'Xong',
        summary: 'Đã có tóm tắt và biên bản.',
        meta: elapsed(job),
        actions,
      }
}

export function AiTaskTrayHost() {
  const client = useQueryClient()
  const jobs = useAiJobs()
  const open = useAiTray((s) => s.open)
  const setOpen = useAiTray((s) => s.setOpen)
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
        onError: (error) =>
          toast(refusalLine(error) ?? 'Chưa điền được. Thử lại sau ít phút.', { tone: 'danger' }),
      }),
    undo: (id) =>
      undo.mutate(id, { onError: (error) => toastFail('Chưa hoàn tác được.', userMessage(error)) }),
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
    const onError = (error: ApiError) => toastFail('Chưa xoá được.', userMessage(error))
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
      copy={{
        title: 'Việc AI',
        running: (n) => `${n} đang chạy`,
        failed: (n) => `${n} lỗi`,
        done: (n) => `${n} xong`,
        clear: 'Xoá việc đã xong',
        collapse: 'Thu gọn khay',
      }}
    />
  )
}
