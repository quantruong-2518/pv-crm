import { formatDate, formatNumber, message, translate, type Lang } from '@/app/i18n'
import { daysUntilText } from './contract-copy'

export const CONTRACT_DETAIL_COPY = {
  search: message(
    'Tìm hợp đồng, khách hàng hoặc hoá đơn…',
    'Search contracts, customers or invoices…',
    '계약, 고객 또는 청구서 검색…',
  ),
  notFound: message(
    'Không mở được hợp đồng này. Kiểm tra mã hoặc mở lại từ sổ hợp đồng.',
    'Could not open this contract. Check the code or open it from the contract list.',
    '이 계약을 열 수 없습니다. 코드를 확인하거나 계약 목록에서 다시 여세요.',
  ),
  loadFailed: message(
    'Không mở được hợp đồng này.',
    'Could not open this contract.',
    '계약을 열 수 없습니다.',
  ),
  backToBook: message('Về sổ hợp đồng', 'Back to contracts', '계약 목록으로'),
  aiEmpty: message('Chưa soạn thư.', 'No email drafted yet.', '아직 작성한 메일이 없습니다.'),
  draftMail: message('Soạn thư', 'Draft email', '메일 작성'),
  openInstallment: message('Mở đợt', 'Open payment', '납부 내역 열기'),
  rail: message(
    'Liên hệ, người liên hệ và tài liệu của hợp đồng',
    'Contract activity, contacts and documents',
    '계약 연락 내역, 연락처 및 문서',
  ),
  actions: message('Thao tác hợp đồng', 'Contract actions', '계약 작업'),
  terminate: message('Chấm dứt hợp đồng', 'Terminate contract', '계약 종료'),
  onlyCollector: message(
    'Bạn được ghi thu tiền, không sửa được hợp đồng này.',
    'You can record payments, but cannot edit this contract.',
    '수금은 기록할 수 있지만 계약은 수정할 수 없습니다.',
  ),
  onlyView: message(
    'Bạn chỉ xem được hợp đồng này.',
    'You can view this contract only.',
    '이 계약은 보기만 할 수 있습니다.',
  ),
  managerEdits: message(
    'Trưởng phòng hoặc giám đốc mới sửa được.',
    'A sales manager or director can edit it.',
    '영업 관리자 또는 임원만 수정할 수 있습니다.',
  ),
  noReply: message(
    'Lượt nhắc gần nhất chưa có trả lời',
    'No reply to the last reminder',
    '마지막 알림에 답장이 없습니다',
  ),
  rungs: message('Các bậc của hợp đồng', 'Contract milestones', '계약 단계'),
  skipped: message('bỏ qua', 'skipped', '건너뜀'),
  elapsed: message('đã', 'elapsed', '경과'),
  runDenied: message(
    'Vai của bạn không xem được hành trình của hợp đồng.',
    'Your role cannot view this contract journey.',
    '현재 권한으로는 계약 진행 과정을 볼 수 없습니다.',
  ),
  runUnread: message(
    'Không tải được các bậc của hợp đồng.',
    'Could not load contract milestones.',
    '계약 단계를 불러오지 못했습니다.',
  ),
  nextPayment: message('Đợt thu sắp tới', 'Next payment', '다음 수금'),
  paymentDue: message('Hạn', 'Due', '기한'),
  rungSigned: message('Đã ký', 'Signed', '서명 완료'),
  rungDeploy: message('Triển khai', 'Delivery', '이행'),
  rungAccept: message('Nghiệm thu', 'Acceptance', '검수'),
  rungCollect: message('Thu tiền', 'Collection', '수금'),
  rungDone: message('Hoàn tất', 'Completed', '완료'),
} as const

export function contractReadOnlyText(
  holder: string | null | undefined,
  collects: boolean,
  lang: Lang,
) {
  if (collects) return translate(CONTRACT_DETAIL_COPY.onlyCollector, lang)
  const canEdit = holder
    ? lang === 'ko'
      ? `${holder}, 영업 관리자 또는 임원만 수정할 수 있습니다.`
      : lang === 'en'
        ? `${holder}, a sales manager or a director can edit it.`
        : `${holder}, trưởng phòng hoặc giám đốc mới sửa được.`
    : translate(CONTRACT_DETAIL_COPY.managerEdits, lang)
  return holder ? `${translate(CONTRACT_DETAIL_COPY.onlyView, lang)} ${canEdit}` : canEdit
}

export function installmentNoText(no: number, lang: Lang) {
  const n = formatNumber(no, lang)
  if (lang === 'ko') return `${n}차 납부`
  if (lang === 'en') return `Payment ${n}`
  return `Đợt ${n}`
}

export function aiSuggestionText(contact: string, what: string, no: number, lang: Lang) {
  const payment = installmentNoText(no, lang)
  if (lang === 'ko')
    return `${contact}에게 ${what} 완료와 ${payment} 송금일을 요청하는 메일을 작성할까요?`
  if (lang === 'en')
    return `Draft an email asking ${contact} to complete ${what} and confirm the transfer date for ${payment.toLowerCase()}?`
  return `Soạn thư nhắc ${contact} hoàn tất ${what} và cho biết ngày chuyển tiền ${payment.toLowerCase()}?`
}

export function blockedLateText(what: string, days: number, lang: Lang) {
  const n = formatNumber(Math.max(0, days), lang)
  if (lang === 'ko') return `"${what}" 조건 ${n}일 지남`
  if (lang === 'en') return `"${what}" is ${n} days late`
  return `điều kiện "${what}" trễ ${n} ngày`
}

export function paymentBasisText(no: number, days: number, lang: Lang) {
  return `${installmentNoText(no, lang)} ${daysUntilText(days, lang)}`
}

export function elapsedDaysText(days: number, lang: Lang) {
  const n = formatNumber(days, lang)
  if (lang === 'ko') return `${n}일 경과`
  if (lang === 'en') return `${n} days elapsed`
  return `đã ${n} ngày`
}

export const contractRungText = (
  key: 'signed' | 'deploy' | 'accept' | 'collect' | 'done',
  lang: Lang,
) =>
  translate(
    CONTRACT_DETAIL_COPY[
      `rung${key[0]?.toUpperCase()}${key.slice(1)}` as keyof typeof CONTRACT_DETAIL_COPY
    ],
    lang,
  )

export function paymentDueText(day: string, days: number, lang: Lang) {
  const date = formatDate(day, lang)
  const relative = daysUntilText(days, lang)
  if (lang === 'ko') return `${date} 기한 · ${relative}`
  if (lang === 'en') return `Due ${date} · ${relative}`
  return `Hạn ${date} · ${relative}`
}
