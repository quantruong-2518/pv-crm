import { ADMISSION_VERDICT_LABEL } from '@pv/contracts'
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
import { message, type Message } from '@/app/i18n'
import { fuzzyRank } from '@/lib/fuzzy-rank'
import type { ReplaceJob } from '@/data/lead-scan-replace'
import type { LocalFile, ScanRun } from '@/data/lead-scan-run'

/** What the scan screen shows, derived — no JSX, no fetching.
 *
 *  The step is read off the SERVER's batch state, never kept on the screen:
 *  a resumed `/scan/:code` must land on the same step the uploader left, and
 *  the only thing both of them can see is that state. The local run only
 *  fills the gap before the server has a batch, and the upload rows after. */

export const SCAN_STEPS = [
  { key: 'drop', label: message('Thả tệp', 'Drop files', '파일 올리기') },
  { key: 'read', label: message('AI đọc', 'AI reads', 'AI 읽기') },
  { key: 'preview', label: message('Xem trước & tạo', 'Preview & create', '미리보기 및 생성') },
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

export const KIND_LABEL: Record<ScanFileKind, Message> = {
  BUSINESS_CARD: message('Danh thiếp', 'Business card', '명함'),
  CARD_BACK: message('Mặt sau danh thiếp', 'Back of business card', '명함 뒷면'),
  CARD_SHEET: message('Tờ nhiều danh thiếp', 'Sheet of business cards', '명함 시트'),
  COMPANY_PROFILE: message('Hồ sơ công ty', 'Company profile', '회사 소개서'),
  OTHER: message('Khác', 'Other', '기타'),
}

const IMAGE_TYPE = message('Ảnh', 'Image', '이미지')
const UPLOAD_FAILED = message('Không tải lên được', 'Upload failed', '업로드하지 못했습니다')

export type BadgeTone = 'draft' | 'warning' | 'success' | 'running' | 'danger'

/** A row still moving shows a spinner and words; a settled row shows a pill. */
export type RowStatus = { moving: Message } | { tone: BadgeTone; text: Message }

export type Bucket = 'read' | 'reading' | 'queued' | 'failed'

export type FileRow = {
  key: string
  name: string
  type: Message
  status: RowStatus
  bucket: Bucket
  result: string
  /** Set on a server row that read FAILED — the id a replace-file targets. */
  failedId: string | null
}

const SERVER_STATUS: Record<ScanFile['state'], { status: RowStatus; bucket: Bucket }> = {
  QUEUED: {
    status: { tone: 'draft', text: message('Chờ đọc', 'Waiting to read', '읽기 대기') },
    bucket: 'queued',
  },
  READING: { status: { moving: message('Đang đọc…', 'Reading…', '읽는 중…') }, bucket: 'reading' },
  READ: { status: { tone: 'success', text: message('Đã đọc', 'Read', '읽음') }, bucket: 'read' },
  EMPTY: {
    status: { tone: 'draft', text: message('Không có lead', 'No lead', '리드 없음') },
    bucket: 'read',
  },
  FAILED: {
    status: { tone: 'danger', text: message('Không đọc được', 'Could not read', '읽지 못함') },
    bucket: 'failed',
  },
}

const LOCAL_STATUS: Record<Exclude<LocalFile['phase'], 'uploading'>, RowStatus> = {
  preparing: { moving: message('Đang nén…', 'Compressing…', '압축 중…') },
  uploaded: { tone: 'draft', text: message('Đã tải lên', 'Uploaded', '업로드됨') },
  failed: { tone: 'danger', text: UPLOAD_FAILED },
}

const PDF_TYPE = message('PDF', 'PDF', 'PDF')

const uploadingText = (progress: number) => {
  const pct = Math.round(progress * 100)
  return message(`Đang tải lên · ${pct}%`, `Uploading · ${pct}%`, `업로드 중 · ${pct}%`)
}

const fromLocal = (f: LocalFile): FileRow => ({
  key: f.key,
  name: f.name,
  type: f.pdf ? PDF_TYPE : IMAGE_TYPE,
  status: f.phase === 'uploading' ? { moving: uploadingText(f.progress) } : LOCAL_STATUS[f.phase],
  bucket: f.phase === 'failed' ? 'failed' : 'queued',
  result: f.error ?? '—',
  failedId: null,
})

const fromServer = (f: ScanFile): FileRow => ({
  key: f.id,
  name: f.name,
  type: f.kind ? KIND_LABEL[f.kind] : f.mime === 'application/pdf' ? PDF_TYPE : IMAGE_TYPE,
  ...SERVER_STATUS[f.state],
  result: f.error ?? f.note ?? '—',
  failedId: f.state === 'FAILED' ? f.id : null,
})

const REPLACE_STATUS: Record<Exclude<ReplaceJob['phase'], 'uploading'>, Message> = {
  preparing: message(
    'Đang chuẩn bị tệp thay…',
    'Preparing the replacement file…',
    '교체 파일 준비 중…',
  ),
  starting: message('Đang gửi đọc lại…', 'Sending to read again…', '다시 읽도록 전송 중…'),
}

const replaceUploadingText = (progress: number) => {
  const pct = Math.round(progress * 100)
  return message(
    `Đang tải tệp thay · ${pct}%`,
    `Uploading the replacement · ${pct}%`,
    `교체 파일 업로드 중 · ${pct}%`,
  )
}

/** A row being replaced shows the replace's progress, not its old FAILED pill. */
export const rowStatus = (row: FileRow, job: ReplaceJob | undefined): RowStatus =>
  !job
    ? row.status
    : {
        moving:
          job.phase === 'uploading'
            ? replaceUploadingText(job.progress)
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
  if (total === 0) return { label: message('Đang chuẩn bị', 'Preparing', '준비 중'), value: 0 }
  if (run && !run.started) {
    const sent = run.files.reduce((sum, f) => sum + (f.phase === 'uploaded' ? 1 : f.progress), 0)
    return { label: message('Đã tải lên', 'Uploaded', '업로드됨'), value: sent / total }
  }
  return { label: message('Đã đọc', 'Read', '읽음'), value: (counts.read + counts.failed) / total }
}

/** The gate's own label for an undecided match, set mid-sentence. */
const REVIEW = message(
  ADMISSION_VERDICT_LABEL['needs-review'],
  'Unsure whether it is a duplicate or new',
  '중복인지 신규인지 불확실',
)
const REVIEW_WORDS = message(
  REVIEW.vi.charAt(0).toLocaleLowerCase('vi') + REVIEW.vi.slice(1),
  REVIEW.en.charAt(0).toLowerCase() + REVIEW.en.slice(1),
  REVIEW.ko,
)

const RETURNING = message(
  ADMISSION_VERDICT_LABEL['returning-account'],
  'Returning customer',
  '기존 고객 재방문',
)
const NEW_LEAD_TEXT = message('Tạo 1 lead mới', 'Create 1 new lead', '새 리드 1개 생성')

export const OUTCOME_FACE: Record<ScanOutcome, { tone: BadgeTone; text: Message }> = {
  NEW_LEAD: { tone: 'success', text: NEW_LEAD_TEXT },
  MERGE_INTO_LEAD: {
    tone: 'running',
    text: message('Nhập vào lead', 'Merge into lead', '리드에 병합'),
  },
  HELD_MISSING_CONTACT: {
    tone: 'warning',
    text: message(
      'Không tạo: thiếu email người liên hệ',
      'Not created: contact email missing',
      '생성 안 함: 연락처 이메일 없음',
    ),
  },
  HELD_OTHER_OWNER: {
    tone: 'draft',
    text: message('Ngoài phạm vi của bạn', 'Outside your scope', '권한 범위 밖'),
  },
  HELD_NEEDS_REVIEW: {
    tone: 'warning',
    text: message(
      `Không tạo: ${REVIEW_WORDS.vi}`,
      `Not created: ${REVIEW_WORDS.en}`,
      `생성 안 함: ${REVIEW_WORDS.ko}`,
    ),
  },
}

/** A new lead on a company already in the book says so in the gate's own
 *  words, and drops the people count: the badge cannot wrap, and the people
 *  are in the next column. */
export const outcomeText = (group: ScanGroup): Message => {
  if (group.outcome !== 'NEW_LEAD') return OUTCOME_FACE[group.outcome].text
  if (group.accountCode) {
    return message(
      `${NEW_LEAD_TEXT.vi} · ${RETURNING.vi}`,
      `${NEW_LEAD_TEXT.en} · ${RETURNING.en}`,
      `${NEW_LEAD_TEXT.ko} · ${RETURNING.ko}`,
    )
  }
  const n = group.people.length
  return message(
    `${NEW_LEAD_TEXT.vi} · ${n} người`,
    `${NEW_LEAD_TEXT.en} · ${n} ${n === 1 ? 'person' : 'people'}`,
    `${NEW_LEAD_TEXT.ko} · ${n}명`,
  )
}

/** Step 3's view filter: outcomes picked in the column header, plus free text
 *  over company, province, people and the lead a group merges into. A view
 *  only — the commit button still applies the whole batch. */
export function filterGroups(
  groups: readonly ScanGroup[],
  f: { q: string; outcome: readonly string[] },
): ScanGroup[] {
  const inOutcome = groups.filter((g) => f.outcome.length === 0 || f.outcome.includes(g.outcome))
  return fuzzyRank(inOutcome, f.q, (g) => {
    const people = g.people.flatMap((p) => [p.name, p.title, p.email])
    const code = g.outcome === 'MERGE_INTO_LEAD' ? g.leadCode : g.accountCode
    return [g.company, g.meta, code, ...people]
  })
}

export const CONFIDENCE_FACE: Record<ScanConfidence, { tone: BadgeTone; text: Message }> = {
  SURE: { tone: 'success', text: message('Chắc', 'Sure', '확실') },
  INFERRED: { tone: 'draft', text: message('Chưa chắc', 'Unsure', '불확실') },
  CONFLICT: { tone: 'warning', text: message('Hai cách đọc', 'Two readings', '두 가지 해석') },
}

/** The not-creating line of step 3 — zero counts are left out, not printed as 0. */
export function notCreatedPills(batch: LeadScanResponse): Message[] {
  const groups = batch.preview?.groups ?? []
  const count = (outcome: ScanOutcome) => groups.filter((g) => g.outcome === outcome).length
  const skipped = batch.preview?.skipped ?? { noLead: 0, unreadable: 0 }
  const lines: [number, (n: number) => Message][] = [
    [
      count('MERGE_INTO_LEAD'),
      (n) =>
        message(
          `${n} công ty nhập vào lead có sẵn`,
          `Companies merged into existing leads: ${n}`,
          `기존 리드에 병합되는 회사 ${n}곳`,
        ),
    ],
    [
      count('HELD_MISSING_CONTACT'),
      (n) =>
        message(
          `${n} công ty thiếu email người liên hệ, không tạo`,
          `Companies missing a contact email, not created: ${n}`,
          `연락처 이메일이 없어 생성하지 않는 회사 ${n}곳`,
        ),
    ],
    [
      count('HELD_OTHER_OWNER'),
      (n) =>
        message(
          `${n} công ty đã có trong sổ, ngoài phạm vi của bạn`,
          `Companies already in the book, outside your scope: ${n}`,
          `이미 목록에 있고 권한 범위 밖인 회사 ${n}곳`,
        ),
    ],
    [
      count('HELD_NEEDS_REVIEW'),
      (n) =>
        message(
          `${n} công ty ${REVIEW_WORDS.vi}, không tạo`,
          `Companies not created, ${REVIEW_WORDS.en}: ${n}`,
          `${REVIEW_WORDS.ko}, 생성하지 않는 회사 ${n}곳`,
        ),
    ],
    [
      skipped.noLead,
      (n) =>
        message(`${n} tệp không chứa lead`, `Files with no lead: ${n}`, `리드가 없는 파일 ${n}개`),
    ],
    [
      skipped.unreadable,
      (n) =>
        message(`${n} tệp không đọc được`, `Unreadable files: ${n}`, `읽을 수 없는 파일 ${n}개`),
    ],
  ]
  return lines.filter(([n]) => n > 0).map(([n, text]) => text(n))
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
