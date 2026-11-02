import type {
  AssistantErrorCode,
  AssistantFooter,
  AssistantReportReason,
  AssistantSuggestion,
  AssistantSuggestionKey,
  RoleId,
} from '@pv/contracts'
import { ASSISTANT_REPORT_REASON_LABEL } from '@pv/contracts'
import { formatDate, formatNumber, message, translate, type Lang, type Message } from '@/app/i18n'

/** Every string the CRM assistant prints (ADR 0133), in the three languages.
 *  The contract keeps the Vietnamese report reasons, and the keys of the
 *  suggestion chips; the words of both, and the sample questions, live here. */

const m = message

export const ASSISTANT_COPY = {
  title: m('Trợ lý', 'Assistant', '도우미'),
  subline: m(
    'Chỉ trả lời về dữ liệu bạn được xem trong PV One',
    'Only answers about PV One data you can see',
    'PV One에서 내가 볼 수 있는 데이터에 대해서만 답합니다',
  ),
  close: m('Đóng', 'Close', '닫기'),
  newChat: m('Cuộc trò chuyện mới', 'New chat', '새 대화'),
  fullScreen: m('Mở toàn màn hình', 'Open full screen', '전체 화면으로 열기'),
  allChats: m('Các cuộc trò chuyện', 'All chats', '전체 대화'),
  placeholder: m(
    'Hỏi về khách, cơ hội, hợp đồng của bạn…',
    'Ask about your customers, opportunities, contracts…',
    '내 고객, 영업 기회, 계약에 대해 물어보세요…',
  ),
  question: m('Câu hỏi', 'Question', '질문'),
  send: m('Gửi', 'Send', '보내기'),
  tryAsking: m('Hỏi thử một câu', 'Try asking', '이렇게 물어보세요'),
  aiLabel: m('Trợ lý trả lời', 'Assistant answer', '도우미 답변'),
  basisLabel: m('Căn cứ', 'Based on', '근거'),
  readOnly: m('Chưa thay đổi gì cả.', 'Nothing was changed.', '아무것도 바꾸지 않았습니다.'),
  copy: m('Sao chép', 'Copy', '복사'),
  copied: m('Đã sao chép câu trả lời', 'Answer copied', '답변을 복사했습니다'),
  copyFailed: m('Không sao chép được', 'Could not copy', '복사하지 못했습니다'),
  report: m('Báo câu trả lời sai', 'Report a wrong answer', '잘못된 답변 신고'),
  reportNote: m('Ghi thêm (không bắt buộc)', 'Add a note (optional)', '메모 추가 (선택)'),
  reportSend: m('Gửi', 'Send', '보내기'),
  reported: m('Đã gửi báo sai', 'Report sent', '신고를 보냈습니다'),
  cancel: m('Huỷ', 'Cancel', '취소'),
  withheld: m('Không còn quyền xem', 'You no longer have access', '더 이상 볼 권한이 없습니다'),
  stop: m('Dừng', 'Stop', '중지'),
  stopFailed: m(
    'Chưa dừng được. Thử lại.',
    'Could not stop. Try again.',
    '중지하지 못했습니다. 다시 시도하세요.',
  ),
  stopped: m('Đã dừng trả lời.', 'Stopped answering.', '답변을 중지했습니다.'),
  notAnswered: m(
    'Chưa trả lời được câu này.',
    'This question was not answered.',
    '이 질문에 답하지 못했습니다.',
  ),
  retry: m('Thử lại', 'Try again', '다시 시도'),
  loadFailed: m(
    'Không tải được cuộc trò chuyện.',
    'Could not load the chat.',
    '대화를 불러오지 못했습니다.',
  ),
  related: m('Hồ sơ trong câu trả lời', 'Records in the answer', '답변에 나온 기록'),
  code: m('Mã', 'Code', '코드'),
  name: m('Tên', 'Name', '이름'),
  answered: m('Trợ lý đã trả lời.', 'The assistant answered.', '도우미가 답했습니다.'),
  unchecked: m(
    'Không hiện được câu trả lời này nữa.',
    'This answer can no longer be shown.',
    '이 답변은 더 이상 표시할 수 없습니다.',
  ),
} as const

export const openLabel = (code: string, lang: Lang) =>
  translate(m(`Mở ${code}`, `Open ${code}`, `${code} 열기`), lang)

/** The wait line, from the tool the current round calls. */
const STEP: Record<string, Message> = {
  search_records: m('Đang tìm hồ sơ…', 'Searching records…', '기록 검색 중…'),
  get_record: m('Đang mở hồ sơ…', 'Opening the record…', '기록 여는 중…'),
  list_my_work: m('Đang xem việc của bạn…', 'Checking your work…', '내 업무 확인 중…'),
}
const WRITING = m('Đang soạn câu trả lời…', 'Writing the answer…', '답변 작성 중…')
const LOOKING = m('Đang tra dữ liệu…', 'Looking up data…', '데이터 조회 중…')

export const stepLabel = (tool: string | undefined, lang: Lang) =>
  translate(tool ? (STEP[tool] ?? LOOKING) : WRITING, lang)

/** The server cuts a phone or mail the reader may not see to this marker (ADR 0136 §3). */
const CONTACT_HIDDEN = m('[liên hệ bị ẩn]', '[contact hidden]', '[연락처 숨김]')

export const shownText = (text: string, lang: Lang) =>
  text.replaceAll('[withheld]', translate(CONTACT_HIDDEN, lang))

export const ERROR_COPY: Record<AssistantErrorCode, Message> = {
  off: m('Trợ lý đang tắt.', 'The assistant is turned off.', '도우미가 꺼져 있습니다.'),
  busy: m(
    'Trợ lý đang trả lời câu trước. Chờ xong rồi hỏi tiếp.',
    'Still answering your last question. Ask again when it finishes.',
    '이전 질문에 답하는 중입니다. 끝난 후 다시 물어보세요.',
  ),
  limit: m(
    'Bạn đã hỏi hết lượt. Thử lại sau.',
    'You have reached the question limit. Try again later.',
    '질문 한도에 도달했습니다. 나중에 다시 시도하세요.',
  ),
  interrupted: m(
    'Câu trả lời bị ngắt giữa chừng.',
    'The answer was cut off.',
    '답변이 중간에 끊겼습니다.',
  ),
  failed: m(
    'Trợ lý chưa trả lời được. Thử lại.',
    'The assistant could not answer. Try again.',
    '도우미가 답하지 못했습니다. 다시 시도하세요.',
  ),
}

/** `off` and `limit` do not clear by asking again in the same minute. */
export const RETRYABLE: ReadonlySet<AssistantErrorCode> = new Set(['busy', 'interrupted', 'failed'])

const L = ASSISTANT_REPORT_REASON_LABEL
export const REASON_COPY: Record<AssistantReportReason, Message> = {
  'wrong-figure': m(L['wrong-figure'], 'Wrong figures', '수치 오류'),
  missing: m(L.missing, 'Missing information', '정보 누락'),
  'off-target': m(L['off-target'], 'Does not answer the question', '질문과 맞지 않음'),
}

type ReadKind = AssistantFooter['read'][number]['kind']

const KIND_COPY: Record<ReadKind, Message> = {
  lead: m('lead', 'leads', '리드'),
  opportunity: m('cơ hội', 'opportunities', '영업 기회'),
  contract: m('hợp đồng', 'contracts', '계약'),
  'next-step': m('việc tiếp theo', 'next steps', '다음 할 일'),
}

const clock = (at: string, lang: Lang) =>
  formatDate(at, lang, { hour: '2-digit', minute: '2-digit', hour12: false })

/** "read 12 leads, 3 contracts · as of 09:42" — lower case, it follows the basis label. */
export function footerLine(footer: AssistantFooter, lang: Lang): string {
  const counts = footer.read
    .map((r) =>
      lang === 'ko'
        ? `${translate(KIND_COPY[r.kind], lang)} ${formatNumber(r.count, lang)}건`
        : `${formatNumber(r.count, lang)} ${translate(KIND_COPY[r.kind], lang)}`,
    )
    .join(', ')
  return counts ? `${readLine(counts, lang)} · ${asOf(footer.at, lang)}` : asOf(footer.at, lang)
}

const readLine = (counts: string, lang: Lang) =>
  translate(m(`đã đọc ${counts}`, `read ${counts}`, `${counts} 확인`), lang)

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** Day and month with a slash: the vi locale prints `02-11`, which reads as a range. */
export const dayMonth = (at: string, lang: Lang) =>
  ['day', 'month']
    .map((part) => formatDate(at, lang, { [part]: '2-digit' }))
    .join(lang === 'ko' ? '.' : '/')

/** The day joins the time once the figures are not from today. */
export const asOf = (at: string, lang: Lang) => {
  const time = clock(at, lang)
  if (sameDay(new Date(at), new Date())) {
    return translate(m(`số liệu lúc ${time}`, `as of ${time}`, `${time} 기준`), lang)
  }
  const day = dayMonth(at, lang)
  return translate(
    m(`số liệu lúc ${time} ngày ${day}`, `as of ${time} on ${day}`, `${day} ${time} 기준`),
    lang,
  )
}

/** Empty-session chips: whole questions about the asker's own desk, which
 *  `list_my_work` answers alone (open deals, open leads, next steps and their
 *  due dates). Steps name no person, so nothing asks "who". */
type SampleId = 'open-deals' | 'open-leads' | 'next-steps' | 'week-steps' | 'overdue-steps'

const SAMPLE_COPY: Record<SampleId, Message> = {
  'open-deals': m(
    'Cơ hội nào của tôi đang chạy?',
    'Which of my opportunities are open?',
    '제 영업 기회 중 진행 중인 것은 무엇인가요?',
  ),
  'open-leads': m(
    'Lead nào tôi đang phụ trách?',
    'Which of my leads are open?',
    '제 리드 중 진행 중인 것은 무엇인가요?',
  ),
  'next-steps': m(
    'Tôi có việc tiếp theo nào cần làm?',
    'What are my next steps?',
    '제가 해야 할 다음 일은 무엇인가요?',
  ),
  'week-steps': m(
    'Tuần này tôi có việc tiếp theo nào?',
    'What are my next steps this week?',
    '이번 주에 할 다음 일은 무엇인가요?',
  ),
  'overdue-steps': m(
    'Việc tiếp theo nào của tôi đã quá hạn?',
    'Which of my next steps are overdue?',
    '기한이 지난 다음 할 일은 무엇인가요?',
  ),
}

/** Presales holds no deal lane, so it is offered no deal question. */
const SAMPLES: Record<RoleId, readonly SampleId[]> = {
  director: ['open-deals', 'open-leads', 'next-steps', 'overdue-steps'],
  'head-of-sales': ['open-deals', 'overdue-steps', 'open-leads', 'week-steps'],
  'account-executive': ['open-deals', 'next-steps', 'overdue-steps', 'week-steps'],
  bd: ['open-leads', 'open-deals', 'overdue-steps', 'week-steps'],
  sale: ['open-leads', 'open-deals', 'next-steps', 'overdue-steps'],
  presales: ['open-leads', 'next-steps', 'overdue-steps', 'week-steps'],
  marketing: ['open-leads', 'next-steps', 'overdue-steps', 'week-steps'],
}

/** The empty-session chips for a role, in the reader's language. */
export function sampleQuestions(role: RoleId | undefined, lang: Lang): string[] {
  return role ? SAMPLES[role].map((id) => translate(SAMPLE_COPY[id], lang)) : []
}

type Worded = { label: Message; question: (code: string) => Message }

/** Suggestion chips, worded here from the key the server picked. */
const SUGGESTION_COPY: Record<AssistantSuggestionKey, Worded> = {
  'overdue-steps': {
    label: m('Việc quá hạn', 'Overdue steps', '기한 지난 할 일'),
    question: () => SAMPLE_COPY['overdue-steps'],
  },
  'stale-leads': {
    label: m('Lead lâu chưa liên hệ', 'Leads not contacted lately', '오래 연락하지 않은 리드'),
    question: () =>
      m(
        'Lead nào của tôi lâu nhất chưa liên hệ?',
        'Which of my leads have gone longest without contact?',
        '가장 오래 연락하지 않은 제 리드는 무엇인가요?',
      ),
  },
  'closing-deals': {
    label: m('Cơ hội sắp chốt', 'Deals closing soon', '곧 마감될 영업 기회'),
    question: () =>
      m(
        'Cơ hội nào của tôi sắp đến ngày chốt dự kiến?',
        'Which of my opportunities are near their expected close date?',
        '예상 마감일이 가까운 제 영업 기회는 무엇인가요?',
      ),
  },
  'lead-converted': {
    label: m('Đã thành cơ hội chưa?', 'Became an opportunity?', '영업 기회로 전환됐나요?'),
    question: (code) =>
      m(
        `Lead ${code} đã thành cơ hội chưa?`,
        `Has lead ${code} become an opportunity?`,
        `리드 ${code}는 영업 기회로 전환됐나요?`,
      ),
  },
  'deal-contract': {
    label: m('Đã có hợp đồng chưa?', 'Has a contract?', '계약이 있나요?'),
    question: (code) =>
      m(
        `Cơ hội ${code} đã có hợp đồng chưa?`,
        `Does opportunity ${code} have a contract yet?`,
        `영업 기회 ${code}에 계약이 있나요?`,
      ),
  },
  'contract-collected': {
    label: m('Đã thu tới đợt nào?', 'Paid up to which installment?', '몇 회차까지 수금됐나요?'),
    question: (code) =>
      m(
        `Hợp đồng ${code} đã thu tiền tới đợt nào?`,
        `Up to which installment has contract ${code} been paid?`,
        `계약 ${code}는 몇 회차까지 수금됐나요?`,
      ),
  },
  'open-first-hit': {
    label: m(
      'Xem chi tiết kết quả đầu tiên',
      'Details of the first result',
      '첫 번째 결과 자세히 보기',
    ),
    question: (code) =>
      m(
        `Cho tôi xem chi tiết ${code}.`,
        `Show me the details of ${code}.`,
        `${code}의 자세한 내용을 보여 주세요.`,
      ),
  },
}

/** Keys whose question names a record; without a code such a chip is not offered. */
const NEEDS_CODE: ReadonlySet<AssistantSuggestionKey> = new Set([
  'lead-converted',
  'deal-contract',
  'contract-collected',
  'open-first-hit',
])

export function suggestionText(s: AssistantSuggestion, lang: Lang) {
  const code = s.params.code
  if (NEEDS_CODE.has(s.key) && !code) return null
  const worded = SUGGESTION_COPY[s.key]
  return {
    label: translate(worded.label, lang),
    question: translate(worded.question(code ?? ''), lang),
  }
}
