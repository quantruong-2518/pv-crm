import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  COMM_CONFIRM_WITHIN_HOURS,
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
  type DebriefEdit,
  type DebriefStepInput,
  type DebriefSummary,
  type MessageDirection,
  type StepOptionsResponse,
  type StepTemplateOption,
  type ThreadChannel,
} from '@pv/contracts'
import { FileText, ImageFrame, type IconGlyph } from '@pv/ui'
import { api, type ApiError } from '@/app/api'
import { cacheTier } from '@/app/query-client'
import { COMMS_KEY, COMM_VIEW_NEED, threadMessagesQuery } from '@/data/comms'
import { AFTER_SALE_BOOK_KEY } from '@/data/after-sale'
import { getLang, message, translate, type Lang, type Message } from '@/app/i18n'
import {
  NEXT_STEP_KEY,
  nextStepKey,
  rereadOptionsOnRefusal,
  stepOptionsMoved,
} from '@/data/next-step'
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
 *  button press) — so it re-asks on a clock, not only on remount. */
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
    ...cacheTier.live(QUEUE_FRESH_MS),
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
  ...cacheTier.live(QUEUE_FRESH_MS),
})

export const commRecordQuery = (id: string) =>
  queryOptions({
    queryKey: [...COMM_RECORDS_KEY, 'record', id] as const,
    /* Each read files an audit line (who read this content), so it is re-read
       only when a write drops it — not on a clock or a tab switch. */
    staleTime: Infinity,
    queryFn: ({ signal }) =>
      api.read(`/comms/debriefs/${encodeURIComponent(id)}`, {
        need: COMM_VIEW_NEED,
        schema: DebriefView,
        signal,
      }),
  })

/** Presigned GETs die within minutes, and every read of a content-bearing
 *  list writes an audit line — so no timer and no focus refetch: the list is
 *  read when a screen opens it, and re-read on the next open once the URLs may
 *  have died. `gcTime` matches, so a list left closed longer than that is
 *  dropped, not shown again. */
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
    gcTime: FILE_URL_SAFE_MS,
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
    onError: rereadOptionsOnRefusal(client),
    onSuccess: (view) => commClosed(client, view),
  })
}

/** After any close — this one or the meeting's (`data/meeting-today.ts`). */
export function commClosed(client: QueryClient, view: DebriefView) {
  client.setQueryData(commRecordQuery(view.id).queryKey, view)
  recordsMoved(client)
  /* The step landed on the subject through the sales hook. */
  void client.invalidateQueries({ queryKey: nextStepKey(view.subject.code) })
  /* A first real touch can move the lead's state, and with it the frame on offer. */
  stepOptionsMoved(client)
  void client.invalidateQueries({ queryKey: ['sales', 'lead-touches'] })
  void client.invalidateQueries({ queryKey: COMMS_KEY })
}

/** The owner's change to a confirmed record (ADR 0122). A 409 means the step
 *  it set has moved on, so the record is read again and that part locks. */
export function useEditComm() {
  const client = useQueryClient()

  return useMutation<DebriefView, ApiError, { id: string; body: DebriefEdit }>({
    mutationFn: ({ id, body }) =>
      api.write(`/comms/debriefs/${encodeURIComponent(id)}/edit`, {
        body,
        need: COMM_VIEW_NEED,
        schema: DebriefView,
      }),
    onError: (error, { id }) => {
      rereadOptionsOnRefusal(client)(error)
      if (error.kind === 'conflict') {
        void client.invalidateQueries({ queryKey: commRecordQuery(id).queryKey })
      }
    },
    onSuccess: (view) => {
      commClosed(client, view)
      /* A bought customer's step and temperature sit on its lead, not on the subject. */
      void client.invalidateQueries({ queryKey: NEXT_STEP_KEY })
      void client.invalidateQueries({ queryKey: ['sales', 'workstreams', 'journey'] })
      void client.invalidateQueries({ queryKey: AFTER_SALE_BOOK_KEY })
    },
  })
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
export function checkCommFile(
  file: File,
  lang: Lang = getLang(),
): { mime: CommAttachmentMime } | { problem: string } {
  const mime = commMimeOf(file)
  if (!mime) {
    return {
      problem: translate(
        message(
          `Không nhận loại tệp của “${file.name}”.`,
          `“${file.name}” is not a supported file type.`,
          `“${file.name}” 파일 형식은 지원되지 않습니다.`,
        ),
        lang,
      ),
    }
  }
  const cap = commCapOf(mime)
  if (file.size > cap) {
    const size = fileSizeLabel(file.size)
    const limit = fileSizeLabel(cap)
    return {
      problem: translate(
        message(
          `“${file.name}” nặng ${size}, vượt ${limit} cho loại tệp này.`,
          `“${file.name}” is ${size}, over the ${limit} limit for this file type.`,
          `“${file.name}” 파일은 ${size}로, 이 형식의 한도 ${limit}를 초과합니다.`,
        ),
        lang,
      ),
    }
  }
  return { mime }
}

export async function sha256Of(file: File): Promise<string> {
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

/** Owner only — while the comm is open, or while editing it once done (ADR 0122). */
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

/** Owner only; the server refuses everybody else. */
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

const STATE_COPY: Record<CommRecordState, Message> = {
  empty: message('Chưa điền nội dung', 'Not filled in', '내용 미입력'),
  unconfirmed: message('Chưa xác nhận', 'Unconfirmed', '미확인'),
  done: message('Đã hoàn thiện', 'Completed', '완료'),
  scheduled: message('Đã hẹn', 'Scheduled', '예정'),
  unreached: message('Không liên lạc được', 'Could not reach', '연락되지 않음'),
  cancelled: message('Đã huỷ', 'Cancelled', '취소됨'),
}

/** Web-side wording of the contract's state labels, one per language. */
export const commStateLabel = (state: CommRecordState, lang: Lang = getLang()) =>
  translate(STATE_COPY[state], lang)

/** The dot of a comm state — one map, so the rail card and the axis agree
 *  with the pill's tone (`empty` is the furthest from done, hence `bad`; a
 *  booked meeting is still ahead, hence `next`; `unreached` borrows `next`
 *  only because `StatusDot` has no neutral closed state, nor does `cancelled`). */
export const COMM_STATE_DOT = {
  empty: 'bad',
  unconfirmed: 'warning',
  done: 'ok',
  scheduled: 'next',
  unreached: 'next',
  cancelled: 'next',
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

const SUBJECT_KIND: Record<string, Message> = {
  LD: message('Lead', 'Lead', '리드'),
  OP: message('Cơ hội', 'Opportunity', '기회'),
  HĐ: message('Hợp đồng', 'Contract', '계약'),
}

/** The kind's display label for a code like `OP-0231` — read off the prefix,
 *  the one place the kind of a `LinkableCode` is written down. */
export function subjectKindLabel(code: string, lang: Lang = getLang()): string {
  return translate(
    SUBJECT_KIND[code.split('-')[0] ?? ''] ?? message('Hồ sơ', 'Record', '레코드'),
    lang,
  )
}

/** The subject's own screen, or undefined while its module is parked. */
export const subjectPath = (code: string) => chainPath(code.split('-')[0] ?? '', code)

/** The unsent form of a comm is kept in this browser under one key; a write that
 *  closes the record without the form must drop it too. */
export const commDraftKey = (id: string) => `comm-draft:${id}`

export function clearCommDraft(id: string) {
  try {
    localStorage.removeItem(commDraftKey(id))
  } catch {
    /* storage unavailable — nothing was kept */
  }
}

/** The owner's unsent form, as the draft button keeps it. */
export type CommDraft = {
  title: string
  summary: string
  picked: Record<string, string>
  step: StepDraft
}

/** Browser storage can throw or come back empty; a draft is a convenience. */
export function readCommDraft(id: string): CommDraft | null {
  try {
    const raw = localStorage.getItem(commDraftKey(id))
    return raw ? (JSON.parse(raw) as CommDraft) : null
  } catch {
    return null
  }
}

export function writeCommDraft(id: string, draft: CommDraft) {
  try {
    localStorage.setItem(commDraftKey(id), JSON.stringify(draft))
  } catch {
    /* storage unavailable — the form still works, it just cannot be kept */
  }
}

/** What one comm is called inside a sentence (the header, the step titles);
 *  every chat channel is one conversation, whatever app carried it. */
export function commNoun(channel: ThreadChannel, lang: Lang = getLang()): string {
  const copy: Record<ThreadChannel, ReturnType<typeof message>> = {
    phone: message('cuộc gọi', 'call', '통화'),
    meeting: message('buổi gặp', 'meeting', '미팅'),
    email: message('thư', 'email', '이메일'),
    'zalo-oa': message('cuộc trò chuyện', 'conversation', '대화'),
    telegram: message('cuộc trò chuyện', 'conversation', '대화'),
    whatsapp: message('cuộc trò chuyện', 'conversation', '대화'),
    'in-app': message('cuộc trò chuyện', 'conversation', '대화'),
  }
  return translate(copy[channel], lang)
}

/** What an unreached record says in place of a summary, in rows and on its page. */
export const unreachedLine = (lang: Lang = getLang()) =>
  translate(
    message('Đóng không có nội dung.', 'Closed without a summary.', '내용 없이 종료됨.'),
    lang,
  )

/** The opening words of the header's time line: the noun, and for a call or a
 *  mail which way it went.
 *  `direction` is the anchor turn's; unknown while the turns are read. */
export function commKindLine(
  channel: ThreadChannel,
  direction: MessageDirection | null,
  lang: Lang = getLang(),
): string {
  const noun = commNoun(channel, lang)
  const head = noun.charAt(0).toUpperCase() + noun.slice(1)
  const out = direction === 'out'
  if (channel === 'phone' && direction)
    return translate(
      message(
        `${head} ${out ? 'đi' : 'đến'}`,
        `${out ? 'Outgoing' : 'Incoming'} ${head}`,
        `${head} · ${out ? '발신' : '수신'}`,
      ),
      lang,
    )
  if (channel === 'email' && direction)
    return translate(
      message(
        `${head} ${out ? 'gửi đi' : 'nhận'}`,
        `${out ? 'Sent' : 'Received'} ${head}`,
        `${head} · ${out ? '발신' : '수신'}`,
      ),
      lang,
    )
  return head
}

const HOUR_MS = 3_600_000

/** Whole hours left of the confirm window, or null once it has run out —
 *  the screen then shows the late mark, whatever the server's flag says yet. */
export function confirmHoursLeft(createdAt: string, now: number): number | null {
  const end = Date.parse(createdAt) + COMM_CONFIRM_WITHIN_HOURS * HOUR_MS
  return end <= now ? null : Math.ceil((end - now) / HOUR_MS)
}

/** `hidden` and `none` must not read alike: one is a permission, the other
 *  an open record with nothing written yet. */
export function summaryTextOf(summary: DebriefSummary, lang: Lang = getLang()): string {
  if (summary.state === 'visible') return summary.text
  return translate(
    summary.state === 'hidden'
      ? message(
          'Tóm tắt bị ẩn theo quyền của bạn.',
          'The summary is hidden by your permissions.',
          '권한에 따라 요약이 숨겨져 있습니다.',
        )
      : message('Chưa có tóm tắt.', 'No summary yet.', '요약이 아직 없습니다.'),
    lang,
  )
}

/** The line a comm row prints: its title (a meeting's is the meeting's own),
 *  so every channel reads alike; only a record closed untitled prints the summary. */
export function titleOf(
  row: Pick<DebriefView, 'state' | 'title' | 'summary'>,
  lang: Lang = getLang(),
) {
  if (row.title) return { title: row.title, titleMuted: row.state === 'cancelled' }
  if (row.state === 'unreached') return { title: unreachedLine(lang), titleMuted: true }
  return { title: summaryTextOf(row.summary, lang), titleMuted: row.summary.state !== 'visible' }
}

/** The next-step part of a confirm, as typed. `templateId` and `dueAuto`
 *  (the day came from a template) are optional: drafts kept in the browser
 *  before ADR 0080 carry neither. Older drafts may still hold `previousDone`;
 *  it is ignored, the form no longer marks the step before as done. */
export type StepDraft = {
  kindId: string
  text: string
  due: string
  templateId?: string
  dueAuto?: boolean
}
export const EMPTY_STEP_DRAFT: StepDraft = { kindId: '', text: '', due: '' }

/** The draft's template, only while the state still offers it: a pick kept
 *  from before the frame changed counts as no pick. */
export function pickedTemplateOf(
  draft: Pick<StepDraft, 'templateId'>,
  options: StepOptionsResponse | undefined,
): StepTemplateOption | undefined {
  return options?.templates.find((t) => t.id === draft.templateId)
}

export function stepBlockerOf(
  draft: StepDraft,
  options: UseQueryResult<StepOptionsResponse>,
  lang: Lang = getLang(),
): string | null {
  const m = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  if (!options.data) {
    return options.error
      ? m(
          'Không tải được danh sách bước tiếp theo.',
          'Could not load the list of next steps.',
          '다음 단계 목록을 불러오지 못했습니다.',
        )
      : m(
          'Đang tải danh sách bước tiếp theo.',
          'Loading the list of next steps.',
          '다음 단계 목록을 불러오는 중입니다.',
        )
  }
  if (!options.data.freeEntry) {
    if (options.data.templates.length === 0)
      return m(
        'Chưa có bước nào trong khung để chọn.',
        'The frame has no step to choose from.',
        '선택할 수 있는 단계가 프레임에 없습니다.',
      )
    if (!pickedTemplateOf(draft, options.data))
      return m(
        'Chưa chọn bước tiếp theo trong danh sách.',
        'Pick the next step from the list.',
        '목록에서 다음 단계를 선택해 주세요.',
      )
  } else if (draft.kindId === '') {
    return m(
      'Chưa chọn loại bước tiếp theo.',
      'Choose the type of the next step.',
      '다음 단계 유형을 선택해 주세요.',
    )
  } else if (draft.text.trim() === '') {
    return m(
      'Chưa ghi nội dung bước tiếp theo.',
      'Write what the next step is.',
      '다음 단계 내용을 입력해 주세요.',
    )
  }
  return draft.due === ''
    ? m(
        'Chưa chọn hạn của bước tiếp theo.',
        'Choose the due date of the next step.',
        '다음 단계 기한을 선택해 주세요.',
      )
    : null
}

export function stepInputOf(
  draft: StepDraft,
  options: StepOptionsResponse | undefined,
): DebriefStepInput {
  /* Listed-only: the template's own words and kind, whatever an older draft
     still holds — the server refuses any other pair. Free entry may reword a pick;
     the server keeps the template only while the words still match. */
  const picked = pickedTemplateOf(draft, options)
  const fixed = options?.freeEntry === false ? picked : undefined
  return {
    kindId: fixed?.kind.id ?? draft.kindId,
    text: fixed?.name ?? draft.text.trim(),
    due: draft.due,
    ...(picked && { templateId: picked.id }),
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
  lang: Lang = getLang(),
): string | null {
  const m = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  if (!vocab.data) {
    return vocab.error
      ? m(
          'Không tải được bộ câu hỏi đánh giá.',
          'Could not load the evaluation questions.',
          '평가 질문을 불러오지 못했습니다.',
        )
      : m(
          'Đang tải bộ câu hỏi đánh giá.',
          'Loading the evaluation questions.',
          '평가 질문을 불러오는 중입니다.',
        )
  }
  const unanswered = vocab.data.criteria.filter((c) => !picked[c.id]).length
  return unanswered > 0
    ? m(
        `Còn ${unanswered} câu đánh giá chưa trả lời.`,
        `${unanswered} evaluation ${unanswered === 1 ? 'question is' : 'questions are'} still unanswered.`,
        `답변하지 않은 평가 질문이 ${unanswered}개 남아 있습니다.`,
      )
    : null
}

/** The steps every comm is filled and read in; their count is this list's length. */
export const commStepTitles = (record: Pick<DebriefView, 'channel'>, lang: Lang = getLang()) => {
  const noun = commNoun(record.channel, lang)
  const capitalizedNoun = noun.charAt(0).toUpperCase() + noun.slice(1)
  return [
    translate(message(`Nội dung ${noun}`, `${capitalizedNoun} details`, `${noun} 내용`), lang),
    translate(message(`Đánh giá ${noun}`, `${capitalizedNoun} evaluation`, `${noun} 평가`), lang),
    translate(message('Bước tiếp theo', 'Next step', '다음 단계'), lang),
  ] as const
}

/** In-page anchor of a read step card, for the stepper's links. */
export const commStepAnchor = (index: number) => `comm-step-${index + 1}`

/** The turn the record is anchored on: its direction and, for a call, how long it ran. */
export function useAnchorTurn(record: Pick<DebriefView, 'threadId' | 'messageId'>) {
  const { data } = useQuery(threadMessagesQuery(record.threadId))
  return data?.rows.find((row) => row.id === record.messageId) ?? null
}

const KIND: Record<string, Message> = {
  'text/plain': message('Văn bản', 'Text', '텍스트'),
  'application/pdf': message('PDF', 'PDF', 'PDF'),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': message(
    'Word',
    'Word',
    'Word',
  ),
}

/** A file's type as a person names it, and its glyph. */
export function commFileKindOf(
  mime: CommAttachmentMime,
  lang: Lang = getLang(),
): { label: string; icon: IconGlyph } {
  if (mime.startsWith('audio/'))
    return { label: translate(message('Ghi âm', 'Recording', '녹음'), lang), icon: FileText }
  if (mime.startsWith('image/'))
    return { label: translate(message('Ảnh', 'Image', '이미지'), lang), icon: ImageFrame }
  const kind = KIND[mime]
  return { label: kind ? translate(kind, lang) : mime, icon: FileText }
}
