import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  COMM_MAX_AUDIO_BYTES,
  COMM_MAX_FILE_BYTES,
  CommAttachmentDeclareResponse,
  CommAttachmentMime,
  CommAttachmentsResponse,
  DebriefCountsResponse,
  DebriefTargetResponse,
  DebriefView,
  PendingDebriefResponse,
  type CommRecordState,
  type CommVocabularyResponse,
  type DebriefClose,
  type DebriefStepInput,
  type DebriefSummary,
} from '@pv/contracts'
import { api, type ApiError } from '@/app/api'
import { COMMS_KEY, COMM_VIEW_NEED } from '@/data/comms'
import { nextStepKey } from '@/data/next-step'
import { chainPath } from '@/data/opportunities'
import { putOnceMore } from '@/data/lead-scan-run'

/** Comm records — the doors under `/comms/debriefs` (ADR 0074, 0075).
 *
 *  No `load:`: every door is real. All of them sit on a bare `comm.view`, the
 *  same reasoning `data/comms.ts` gives — `comm.view-content` cuts a field
 *  (`summary.state`), not a request, and the owner fence lives server-side.
 *
 *  Every key starts with `['comm-records', …]`, the convention shared with the
 *  lead/opportunity screens, so any write here can drop the whole module's
 *  cache in one call and the queue, the counts and the menu badge agree. */

export const COMM_RECORDS_KEY = ['comm-records'] as const

/** One page holds the whole queue: `PageQuery` caps at 200, and a person with
 *  more than that unconfirmed has a problem no second page would solve. */
const QUEUE_SIZE = 200

/** The queue moves behind the reader's back (a meeting ends, a colleague's
 *  button press) — so it re-asks, unlike the app-wide `staleTime: Infinity`. */
const QUEUE_FRESH_MS = 60_000

/** My open records; `workstreamCode` narrows to one sales run (mobile step 2). */
export const pendingCommsQuery = (workstreamCode: string | null = null) =>
  queryOptions({
    queryKey: [...COMM_RECORDS_KEY, 'pending', workstreamCode] as const,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ size: String(QUEUE_SIZE) })
      if (workstreamCode) params.set('workstreamCode', workstreamCode)
      return api.read(`/comms/debriefs/pending?${params}`, {
        need: COMM_VIEW_NEED,
        schema: PendingDebriefResponse,
        signal,
      })
    },
    staleTime: QUEUE_FRESH_MS,
    refetchInterval: QUEUE_FRESH_MS,
    refetchOnWindowFocus: true,
  })

/** Pending per owner. An `ownOnly` seat gets its own row back, so "more than
 *  my own row" is what tells the screen it is looking at a team. */
export const commCountsQuery = queryOptions({
  queryKey: [...COMM_RECORDS_KEY, 'counts'] as const,
  queryFn: ({ signal }) =>
    api.read('/comms/debriefs/counts', {
      need: COMM_VIEW_NEED,
      schema: DebriefCountsResponse,
      signal,
    }),
  staleTime: QUEUE_FRESH_MS,
  refetchInterval: QUEUE_FRESH_MS,
  refetchOnWindowFocus: true,
})

export const commRecordQuery = (id: string) =>
  queryOptions({
    queryKey: [...COMM_RECORDS_KEY, 'record', id] as const,
    queryFn: ({ signal }) =>
      api.read(`/comms/debriefs/${encodeURIComponent(id)}`, {
        need: COMM_VIEW_NEED,
        schema: DebriefView,
        signal,
      }),
  })

/** Presigned GETs die within minutes, and every read of a content-bearing
 *  list writes an audit line — so no timer: the list is read when a screen
 *  opens it, and re-read on the next open once the URLs may have died. */
const FILE_URL_SAFE_MS = 2 * 60_000

export const commFilesQuery = (id: string) =>
  queryOptions({
    queryKey: [...COMM_RECORDS_KEY, 'files', id] as const,
    queryFn: ({ signal }) =>
      api.read(`/comms/debriefs/${encodeURIComponent(id)}/attachments`, {
        need: COMM_VIEW_NEED,
        schema: CommAttachmentsResponse,
        signal,
      }),
    staleTime: FILE_URL_SAFE_MS,
    refetchOnWindowFocus: false,
  })

/** What a new comm on this subject would ask, read before anything is written:
 *  the step target, and whether this caller could confirm it at all. Asked on
 *  demand (a dialog opening, step 4 showing), never once per row of a page. */
export const commTargetQuery = (subjectCode: string) =>
  queryOptions({
    queryKey: [...COMM_RECORDS_KEY, 'target', subjectCode] as const,
    queryFn: ({ signal }) =>
      api.read(`/comms/debriefs/target?subjectCode=${encodeURIComponent(subjectCode)}`, {
        need: COMM_VIEW_NEED,
        schema: DebriefTargetResponse,
        signal,
      }),
    staleTime: QUEUE_FRESH_MS,
  })

/** A write can move a record's state, the queue, the counts and the badge at
 *  once; dropping the prefix is one line and never misses one of them. */
function recordsMoved(client: QueryClient) {
  void client.invalidateQueries({ queryKey: COMM_RECORDS_KEY })
}

/** The confirm button — the record page and the mobile log's one-go save.
 *  The id rides in the variables because the mobile flow learns it only after
 *  creating the record. No `retry`: a replayed close finds the record already
 *  done and answers 409, which would read as a failure of a success. */
export function useConfirmComm() {
  const client = useQueryClient()

  return useMutation<DebriefView, ApiError, { id: string; body: DebriefClose }>({
    mutationFn: ({ id, body }) =>
      api.write(`/comms/debriefs/${encodeURIComponent(id)}/close`, {
        body,
        need: COMM_VIEW_NEED,
        schema: DebriefView,
      }),
    onSuccess: (view) => commClosed(client, view),
  })
}

/** After any close — this one or the meeting's (`data/meeting-today.ts`). */
export function commClosed(client: QueryClient, view: DebriefView) {
  client.setQueryData(commRecordQuery(view.id).queryKey, view)
  recordsMoved(client)
  /* The step landed on the subject through the sales hook, and a step
     marked done wrote a touch there too. */
  void client.invalidateQueries({ queryKey: nextStepKey(view.subject.code) })
  void client.invalidateQueries({ queryKey: ['sales', 'lead-touches'] })
  void client.invalidateQueries({ queryKey: ['sales', 'ops-touches'] })
  void client.invalidateQueries({ queryKey: COMMS_KEY })
}

// ---------------------------------------------------------------------------
// FILES ON A RECORD — declare → PUT → uploaded
// ---------------------------------------------------------------------------

/** Extension → wire mime, for the browsers that hand `File.type` back empty or
 *  under an alias. Keys double as the picker's `accept` list. */
const EXTENSION_MIME: Record<string, CommAttachmentMime> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/x-m4a',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

export const COMM_FILE_EXTENSIONS = Object.keys(EXTENSION_MIME)

/** The larger cap, for a picker that has not looked at the type yet. */
export const COMM_FILE_PICK_CAP = Math.max(COMM_MAX_AUDIO_BYTES, COMM_MAX_FILE_BYTES)

export function commMimeOf(file: File): CommAttachmentMime | null {
  const typed = CommAttachmentMime.safeParse(file.type)
  if (typed.success) return typed.data
  const dot = file.name.lastIndexOf('.')
  return dot < 0 ? null : (EXTENSION_MIME[file.name.slice(dot).toLowerCase()] ?? null)
}

/** The contract's own split: a recording may be longer than any document. */
export const commCapOf = (mime: CommAttachmentMime) =>
  mime.startsWith('audio/') ? COMM_MAX_AUDIO_BYTES : COMM_MAX_FILE_BYTES

/** "1,2 MB" · "340 KB" — comma decimal (law 6), never locale-dependent. */
export function fileSizeLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1
    ? `${mb.toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** A picked file against the contract — its wire mime, or the sentence why not. */
export function checkCommFile(file: File): { mime: CommAttachmentMime } | { problem: string } {
  const mime = commMimeOf(file)
  if (!mime) return { problem: `Không nhận loại tệp của “${file.name}”.` }
  const cap = commCapOf(mime)
  if (file.size > cap) {
    return {
      problem: `“${file.name}” nặng ${fileSizeLabel(file.size)}, vượt ${fileSizeLabel(cap)} cho loại tệp này.`,
    }
  }
  return { mime }
}

async function sha256Of(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** One file onto one record. `uploaded` is called only after the PUT landed,
 *  because a declared file whose bytes never arrived must not lift the record
 *  out of `empty` (contract docblock). Callable outside a hook so
 *  the mobile flow can upload once the record it just created has an id. */
export async function uploadCommFile(
  id: string,
  file: File,
  mime: CommAttachmentMime,
): Promise<string> {
  const base = `/comms/debriefs/${encodeURIComponent(id)}/attachments`
  const declared = await api.write(base, {
    body: { name: file.name, mime, bytes: file.size, sha256: await sha256Of(file) },
    need: COMM_VIEW_NEED,
    schema: CommAttachmentDeclareResponse,
  })
  await putOnceMore(declared.putUrl, file, mime)
  await api.write(`${base}/${encodeURIComponent(declared.id)}/uploaded`, { need: COMM_VIEW_NEED })
  return declared.id
}

/** Owner only, and only while the comm is not done; the server refuses the rest. */
export const deleteCommFile = (id: string, attachmentId: string) =>
  api.write<void>(
    `/comms/debriefs/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: 'DELETE', need: COMM_VIEW_NEED },
  )

export function useAttachCommFile(id: string) {
  const client = useQueryClient()

  return useMutation<void, ApiError, { file: File; mime: CommAttachmentMime }>({
    mutationFn: async ({ file, mime }) => {
      await uploadCommFile(id, file, mime)
    },
    onSettled: () => recordsMoved(client),
  })
}

/** Owner only, and only while the record is not done; the server refuses the rest. */
export function useDeleteCommFile(id: string) {
  const client = useQueryClient()

  return useMutation<void, ApiError, string>({
    mutationFn: (attachmentId) => deleteCommFile(id, attachmentId),
    onSettled: () => recordsMoved(client),
  })
}

/** The one surface a comm card or row sits on. A faint ink fill in Aurora;
 *  none in stone, where every pill on even a 5% fill fell under 4.5:1 (law 13)
 *  and the shadow alone draws the edge. Late and selected never add a fill. */
export const COMM_CARD_SURFACE = 'bg-surface-ink/5 stone:bg-transparent shadow-control'

/** Keyboard focus on a comm card or a bare button: a dashed outline set off
 *  the edge, so it never reads as the solid `ring` that marks the selection. */
export const COMM_FOCUS =
  'focus-visible:outline-foreground focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-offset-4'

/** The dot of a comm state — one map, so the rail card and the axis agree
 *  with the pill's tone (`empty` is the furthest from done, hence `bad`; a
 *  booked meeting is still ahead, hence `next`). */
export const COMM_STATE_DOT = {
  empty: 'bad',
  unconfirmed: 'warning',
  done: 'ok',
  scheduled: 'next',
} as const satisfies Record<CommRecordState, string>

/** A booked meeting past its end and not closed out. Judged at render against
 *  `useMinuteClock()` — required, so the mark turns over without a reload. A
 *  mark only: no notification. */
export function meetingOverdue(
  record: { state: CommRecordState; meeting: { endsAt: string } | null },
  now: number,
): boolean {
  return (
    record.state === 'scheduled' &&
    record.meeting !== null &&
    now > Date.parse(record.meeting.endsAt)
  )
}

const SUBJECT_KIND: Record<string, string> = { LD: 'Lead', OP: 'Cơ hội', HĐ: 'Hợp đồng' }

/** The kind's display label for a code like `OP-0231` — read off the prefix,
 *  the one place the kind of a `LinkableCode` is written down. */
export function subjectKindLabel(code: string): string {
  return SUBJECT_KIND[code.split('-')[0] ?? ''] ?? 'Hồ sơ'
}

/** The subject's own screen, or undefined while its module is parked. */
export const subjectPath = (code: string) => chainPath(code.split('-')[0] ?? '', code)

/** `hidden` and `none` must not read alike: one is a permission, the other
 *  an open record with nothing written yet. */
export function summaryTextOf(summary: DebriefSummary): string {
  if (summary.state === 'visible') return summary.text
  return summary.state === 'hidden' ? 'Tóm tắt bị ẩn theo quyền của bạn.' : 'Chưa có tóm tắt.'
}

/** The line a comm row prints: a booked meeting has no summary yet, so its
 *  title (the meeting's own) stands in; every other row prints the summary. */
export function titleOf(row: Pick<DebriefView, 'state' | 'title' | 'summary'>) {
  if (row.state === 'scheduled' && row.title) return { title: row.title, titleMuted: false }
  return { title: summaryTextOf(row.summary), titleMuted: row.summary.state !== 'visible' }
}

/** The next-step part of a confirm, as typed. `previousDone` claims the step
 *  the person saw is finished, so it starts unticked. */
export type StepDraft = { kindId: string; text: string; due: string; previousDone: boolean }
export const EMPTY_STEP_DRAFT: StepDraft = { kindId: '', text: '', due: '', previousDone: false }

/** The step the closer saw on the subject — `DebriefStepTarget.currentStep`. */
export type CurrentStep = { text: string; due: string } | null

export function stepBlockerOf(draft: StepDraft): string | null {
  if (draft.kindId === '') return 'Chưa chọn loại bước tiếp theo.'
  if (draft.text.trim() === '') return 'Chưa ghi nội dung bước tiếp theo.'
  return draft.due === '' ? 'Chưa chọn hạn của bước tiếp theo.' : null
}

export function stepInputOf(draft: StepDraft, current: CurrentStep): DebriefStepInput {
  return {
    kindId: draft.kindId,
    text: draft.text.trim(),
    due: draft.due,
    ...(draft.previousDone && current ? { previousDone: current } : {}),
  }
}

/** Today as `YYYY-MM-DD` in the reader's zone — the floor of a due picker. */
export function todayDay(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** One sentence per way a confirm is not ready; a grey button alone says nothing. */
export function evaluationBlockerOf(
  vocab: UseQueryResult<CommVocabularyResponse>,
  picked: Record<string, string>,
): string | null {
  if (!vocab.data) {
    return vocab.error ? 'Không tải được bộ câu hỏi đánh giá.' : 'Đang tải bộ câu hỏi đánh giá.'
  }
  const unanswered = vocab.data.criteria.filter((c) => !picked[c.id]).length
  return unanswered > 0 ? `Còn ${unanswered} câu đánh giá chưa trả lời.` : null
}
