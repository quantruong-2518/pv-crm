import type {
  ConditionSide,
  DocState,
  InstallmentStatus,
  OverdueReasonState,
  RecordChannel,
} from '@pv/contracts'
import { getLang, message, translate, type Lang, type Message } from '@/app/i18n'

/** Words the installment screens share: who owes a condition, how a chase went
 *  out, how a paper stands. Same keys as the Vietnamese maps in `@pv/contracts`. */
const CHANNEL: Record<RecordChannel, Message> = {
  email: message('Gửi mail', 'Email', '메일 발송'),
  'zalo-oa': message('Zalo', 'Zalo', 'Zalo'),
  'in-app': message('Nhắn trong PV One', 'Message in PV One', 'PV One 메시지'),
  call: message('Gọi điện', 'Phone call', '전화'),
}

const SIDE: Record<ConditionSide, Message> = {
  ours: message('Bên mình', 'Our side', '당사 측'),
  customer: message('Bên khách', 'Customer side', '고객 측'),
}

/** The same two sides inside a sentence, lower case. */
const SIDE_INLINE: Record<ConditionSide, Message> = {
  ours: message('bên ta', 'our side', '당사 측'),
  customer: message('bên khách', 'customer side', '고객 측'),
}

const DOC: Record<DocState, Message> = {
  complete: message('Đủ', 'Complete', '완료'),
  'awaiting-signature': message('Chờ ký', 'Awaiting signature', '서명 대기'),
  missing: message('Chưa có', 'Missing', '없음'),
}

const REASON_STATE: Record<OverdueReasonState, Message> = {
  waiting: message('Chờ duyệt', 'Awaiting approval', '승인 대기'),
  approved: message('Đã duyệt', 'Approved', '승인됨'),
  rejected: message('Bị từ chối', 'Rejected', '반려됨'),
}

const STATUS: Record<InstallmentStatus, Message> = {
  paid: message('Đã thu', 'Collected', '수금 완료'),
  overdue: message('Quá hạn', 'Overdue', '기한 초과'),
  upcoming: message('Chưa đến hạn', 'Not yet due', '기한 전'),
}

export const recordChannelText = (channel: RecordChannel, lang: Lang = getLang()) =>
  translate(CHANNEL[channel], lang)
export const conditionSideText = (side: ConditionSide, lang: Lang = getLang()) =>
  translate(SIDE[side], lang)
export const conditionSideInline = (side: ConditionSide, lang: Lang = getLang()) =>
  translate(SIDE_INLINE[side], lang)
export const docStateText = (state: DocState, lang: Lang = getLang()) => translate(DOC[state], lang)
export const overdueReasonStateText = (state: OverdueReasonState, lang: Lang = getLang()) =>
  translate(REASON_STATE[state], lang)
export const installmentStatusText = (status: InstallmentStatus, lang: Lang = getLang()) =>
  translate(STATUS[status], lang)

/** How many days, said the way a person would say it. */
export function daysPhraseText(daysLeft: number, lang: Lang = getLang()): string {
  const days = Math.abs(daysLeft)
  return translate(
    daysLeft > 0
      ? message(`còn ${days} ngày`, `${days} days left`, `${days}일 남음`)
      : daysLeft === 0
        ? message('đến hạn hôm nay', 'due today', '오늘 기한')
        : message(`trễ ${days} ngày`, `${days} days late`, `${days}일 지남`),
    lang,
  )
}

/** Read-only note on a contract, by who holds it and whether the reader collects. */
export function contractReadOnlyCopy(
  holder: string | null | undefined,
  collects: boolean,
  lang: Lang = getLang(),
): string {
  if (collects) {
    return translate(
      message(
        'Bạn được ghi thu tiền, không sửa được hợp đồng này.',
        'You can record payments, but cannot edit this contract.',
        '수금은 기록할 수 있지만 이 계약은 수정할 수 없습니다.',
      ),
      lang,
    )
  }
  return translate(
    holder
      ? message(
          `Bạn chỉ xem được hợp đồng này. ${holder}, trưởng phòng hoặc giám đốc mới sửa được.`,
          `You can only view this contract. ${holder}, a sales manager or a director can edit it.`,
          `이 계약은 보기만 할 수 있습니다. ${holder}, 영업 관리자 또는 임원만 수정할 수 있습니다.`,
        )
      : message(
          'Trưởng phòng hoặc giám đốc mới sửa được hợp đồng này.',
          'Only a sales manager or a director can edit this contract.',
          '영업 관리자 또는 임원만 이 계약을 수정할 수 있습니다.',
        ),
    lang,
  )
}

export const MARKED_DONE = message('Đã đánh dấu xong.', 'Marked as done.', '완료로 표시했습니다.')
export const MARK_FAILED = message(
  'Không đánh dấu được.',
  'Could not mark as done.',
  '완료로 표시하지 못했습니다.',
)

const STANDING: Record<'danger' | 'success' | 'running', Message> = {
  danger: message('Quá hạn', 'Overdue', '기한 초과'),
  success: message('Đã thu đủ', 'Fully collected', '수금 완료'),
  running: message('Đang thu', 'Collecting', '수금 중'),
}

/** How a schedule stands, by the tone `standingOf` gives it. */
export const standingText = (tone: 'danger' | 'success' | 'running', lang: Lang = getLang()) =>
  translate(STANDING[tone], lang)

export const QUOTE_PENDING = message('Chờ khách', 'Awaiting customer', '고객 응답 대기')
