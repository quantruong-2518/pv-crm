import type {
  LeadScanResponse,
  ScanBatchState,
  ScanConfidence,
  ScanFile,
  ScanFileKind,
  ScanGroup,
  ScanOutcome,
} from '@pv/contracts'
import type { RailObject } from '@pv/ui'
import type { ReplaceJob } from '@/data/lead-scan-replace'
import type { LocalFile, ScanRun } from '@/data/lead-scan-run'

/** What the scan screen shows, derived — no JSX, no fetching.
 *
 *  The step is read off the SERVER's batch state, never kept on the screen:
 *  a resumed `/scan/:code` must land on the same step the uploader left, and
 *  the only thing both of them can see is that state. The local run only
 *  fills the gap before the server has a batch, and the upload rows after. */

export const SCAN_STEPS = [
  { key: 'drop', label: 'Thả tệp' },
  { key: 'read', label: 'AI đọc' },
  { key: 'preview', label: 'Xem trước & tạo' },
]

export type ScanView = 'drop' | 'reading' | 'preview' | 'result' | 'failed'

export const STEP_OF: Partial<Record<ScanView, number>> = { drop: 0, reading: 1, preview: 2 }

export function viewOf(state: ScanBatchState, committing: boolean): ScanView {
  if (state === 'FAILED') return 'failed'
  if (state === 'COMMITTING' || state === 'DONE') return 'result'
  if (state === 'READY') return committing ? 'result' : 'preview'
  return 'reading'
}

export const REDIRECT_MS = 5000

export const KIND_LABEL: Record<ScanFileKind, string> = {
  BUSINESS_CARD: 'Danh thiếp',
  CARD_BACK: 'Mặt sau danh thiếp',
  CARD_SHEET: 'Tờ nhiều danh thiếp',
  COMPANY_PROFILE: 'Hồ sơ công ty',
  OTHER: 'Khác',
}

export type BadgeTone = 'draft' | 'warning' | 'success' | 'running' | 'danger'

/** A row still moving shows a spinner and words; a settled row shows a pill. */
export type RowStatus = { moving: string } | { tone: BadgeTone; text: string }

export type Bucket = 'read' | 'reading' | 'queued' | 'failed'

export type FileRow = {
  key: string
  name: string
  type: string
  status: RowStatus
  bucket: Bucket
  result: string
  /** Set on a server row that read FAILED — the id a replace-file targets. */
  failedId: string | null
}

const SERVER_STATUS: Record<ScanFile['state'], { status: RowStatus; bucket: Bucket }> = {
  QUEUED: { status: { tone: 'draft', text: 'Chờ đọc' }, bucket: 'queued' },
  READING: { status: { moving: 'Đang đọc…' }, bucket: 'reading' },
  READ: { status: { tone: 'success', text: 'Đã đọc' }, bucket: 'read' },
  EMPTY: { status: { tone: 'draft', text: 'Không có lead' }, bucket: 'read' },
  FAILED: { status: { tone: 'danger', text: 'Không đọc được' }, bucket: 'failed' },
}

const LOCAL_STATUS: Record<Exclude<LocalFile['phase'], 'uploading'>, RowStatus> = {
  preparing: { moving: 'Đang nén…' },
  uploaded: { tone: 'draft', text: 'Đã tải lên' },
  failed: { tone: 'danger', text: 'Tải lên hỏng' },
}

const fromLocal = (f: LocalFile): FileRow => ({
  key: f.key,
  name: f.name,
  type: f.pdf ? 'PDF' : 'Ảnh',
  status:
    f.phase === 'uploading'
      ? { moving: `Đang tải lên · ${Math.round(f.progress * 100)}%` }
      : LOCAL_STATUS[f.phase],
  bucket: f.phase === 'failed' ? 'failed' : 'queued',
  result: f.error ?? '—',
  failedId: null,
})

const fromServer = (f: ScanFile): FileRow => ({
  key: f.id,
  name: f.name,
  type: f.kind ? KIND_LABEL[f.kind] : f.mime === 'application/pdf' ? 'PDF' : 'Ảnh',
  ...SERVER_STATUS[f.state],
  result: f.error ?? f.note ?? '—',
  failedId: f.state === 'FAILED' ? f.id : null,
})

const REPLACE_STATUS: Record<Exclude<ReplaceJob['phase'], 'uploading'>, string> = {
  preparing: 'Đang chuẩn bị tệp thay…',
  starting: 'Đang gửi đọc lại…',
}

/** A row being replaced shows the replace's progress, not its old FAILED pill. */
export const rowStatus = (row: FileRow, job: ReplaceJob | undefined): RowStatus =>
  !job
    ? row.status
    : {
        moving:
          job.phase === 'uploading'
            ? `Đang tải tệp thay · ${Math.round(job.progress * 100)}%`
            : REPLACE_STATUS[job.phase],
      }

/** Step 3's "could not read" block: the FAILED files only, same row shape as step 2. */
export const failedRows = (batch: LeadScanResponse): FileRow[] =>
  batch.files.filter((f) => f.state === 'FAILED').map(fromServer)

/** Before `start` the browser knows more than the server; after, the server
 *  does — plus the files that never made it up, which it has never heard of. */
export function fileRows(batch: LeadScanResponse | undefined, run: ScanRun | null): FileRow[] {
  if (run && (!run.started || !batch)) return run.files.map(fromLocal)
  const server = (batch?.files ?? []).map(fromServer)
  const lost = (run?.files ?? []).filter((f) => f.phase === 'failed').map(fromLocal)
  return [...server, ...lost]
}

export function countRows(rows: readonly FileRow[]): Record<Bucket, number> {
  const counts: Record<Bucket, number> = { read: 0, reading: 0, queued: 0, failed: 0 }
  for (const row of rows) counts[row.bucket] += 1
  return counts
}

/** The bar: upload share while the browser works, read share after. */
export function progressOf(run: ScanRun | null, counts: Record<Bucket, number>, total: number) {
  if (total === 0) return { label: 'Đang chuẩn bị', value: 0 }
  if (run && !run.started) {
    const sent = run.files.reduce((sum, f) => sum + (f.phase === 'uploaded' ? 1 : f.progress), 0)
    return { label: 'Đã tải lên', value: sent / total }
  }
  return { label: 'Đã đọc', value: (counts.read + counts.failed) / total }
}

export const OUTCOME_FACE: Record<ScanOutcome, { tone: BadgeTone; text: string }> = {
  NEW_LEAD: { tone: 'success', text: 'Tạo 1 lead mới' },
  MERGE_INTO_LEAD: { tone: 'running', text: 'Nhập vào lead' },
  HELD_MISSING_CONTACT: { tone: 'warning', text: 'Không tạo — thiếu email người liên hệ' },
  HELD_OTHER_OWNER: { tone: 'draft', text: 'Ngoài phạm vi của bạn' },
}

export const outcomeText = (group: ScanGroup) =>
  group.outcome === 'NEW_LEAD'
    ? `${OUTCOME_FACE.NEW_LEAD.text} · ${group.people.length} contact`
    : OUTCOME_FACE[group.outcome].text

export const CONFIDENCE_FACE: Record<ScanConfidence, { tone: BadgeTone; text: string }> = {
  SURE: { tone: 'success', text: 'Chắc' },
  INFERRED: { tone: 'draft', text: 'Chưa chắc' },
  CONFLICT: { tone: 'warning', text: 'Hai cách đọc' },
}

/** The not-creating line of step 3 — zero counts are left out, not printed as 0. */
export function notCreatedPills(batch: LeadScanResponse): string[] {
  const groups = batch.preview?.groups ?? []
  const count = (outcome: ScanOutcome) => groups.filter((g) => g.outcome === outcome).length
  const skipped = batch.preview?.skipped ?? { noLead: 0, unreadable: 0 }
  const lines: [number, string][] = [
    [count('MERGE_INTO_LEAD'), 'công ty — nhập vào lead có sẵn'],
    [count('HELD_MISSING_CONTACT'), 'công ty — thiếu email người liên hệ, không tạo'],
    [count('HELD_OTHER_OWNER'), 'công ty — đã có trong sổ, ngoài phạm vi của bạn'],
    [skipped.noLead, 'tệp không chứa lead'],
    [skipped.unreadable, 'tệp không đọc được'],
  ]
  return lines.filter(([n]) => n > 0).map(([n, text]) => `${n} ${text}`)
}

export const mergeCount = (batch: LeadScanResponse) =>
  (batch.preview?.groups ?? []).filter((g) => g.outcome === 'MERGE_INTO_LEAD').length

export const BOOK_PATH = '/sales/leads'

/** Law 10: the batch is the story's object from step 2 on — its campaign
 *  before it, the leads it wrote after it. Step 1 has no object yet. */
export function scanRail(batch: LeadScanResponse, go: (path: string) => void): RailObject[] {
  const lead = (code: string): RailObject => ({ code, onOpen: () => go(`/sales/leads/${code}`) })
  return [
    ...(batch.campaignCode
      ? [{ code: batch.campaignCode, onOpen: () => go(`/sales/campaigns/${batch.campaignCode}`) }]
      : []),
    { code: batch.code, source: true, onOpen: () => go(`/sales/leads/scan/${batch.code}`) },
    ...(batch.result?.created ?? []).map(lead),
    ...(batch.result?.mergedInto ?? []).map(lead),
  ]
}
