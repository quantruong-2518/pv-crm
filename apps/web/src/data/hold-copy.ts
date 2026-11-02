import type { HoldSubjectType } from '@pv/contracts'
import { formatDate, message, translate, type Lang } from '@/app/i18n'

export const HOLD_COPY = {
  title: message('Tạm hoãn', 'On hold', '보류 중'),
  search: message(
    'Tìm khách hàng, lead hoặc cơ hội…',
    'Search customers, leads or opportunities…',
    '고객, 리드 또는 기회 검색…',
  ),
  all: message('Tất cả', 'All', '전체'),
  needsAction: message('Cần xử lý', 'Needs action', '처리 필요'),
  notDue: message('Chưa tới hạn', 'Not due yet', '예정 전'),
  customer: message('Khách hàng', 'Customer', '고객'),
  currentStep: message('Đang ở bước', 'Current step', '현재 단계'),
  resumeDay: message('Ngày hẹn gặp lại', 'Follow-up date', '다시 연락할 날짜'),
  owner: message('Người phụ trách', 'Owner', '담당자'),
  note: message('Ghi chú', 'Note', '메모'),
  lead: message('Lead', 'Lead', '리드'),
  opportunity: message('Cơ hội', 'Opportunity', '기회'),
  noOwner: message('Chưa có người phụ trách', 'No owner', '담당자 없음'),
  loadFailed: message(
    'Không tải được danh sách tạm hoãn.',
    'Could not load items on hold.',
    '보류 목록을 불러오지 못했습니다.',
  ),
  noMatch: message(
    'Không có mục nào khớp bộ lọc.',
    'No items match these filters.',
    '필터에 맞는 항목이 없습니다.',
  ),
  noItems: message(
    'Chưa có lead hay cơ hội nào đang tạm hoãn.',
    'No leads or opportunities are on hold.',
    '보류 중인 리드나 기회가 없습니다.',
  ),
  viewAll: message('Xem tất cả', 'View all', '전체 보기'),
  retry: message('Tải lại', 'Reload', '다시 불러오기'),
  dueLevel: message('Mức đến hạn', 'Due status', '기한 상태'),
  kind: message('Loại', 'Type', '유형'),
  bothKinds: message('Lead và cơ hội', 'Leads and opportunities', '리드와 기회'),
  itemCount: message('mục', 'items', '개'),
  clearFilters: message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기'),
  changeDay: message('Đổi ngày hẹn', 'Change follow-up date', '다시 연락할 날짜 변경'),
  reminderTail: message(
    '. Có thông báo nhắc khi gần tới và đúng ngày hẹn.',
    '. You are reminded as the date approaches and on the day.',
    '. 날짜가 가까워질 때와 당일에 알림이 옵니다.',
  ),
  pickDay: message(
    'Chọn ngày hẹn gặp lại.',
    'Choose a follow-up date.',
    '다시 연락할 날짜를 선택하세요.',
  ),
  saveDay: message('Lưu ngày hẹn', 'Save follow-up date', '날짜 저장'),
  notePlaceholder: message(
    'Khách hẹn gì, chờ điều gì…',
    'What the customer asked for, what you are waiting on…',
    '고객이 요청한 내용, 기다리는 사항…',
  ),
} as const

export const holdChangedToast = (code: string, lang: Lang) =>
  translate(
    message(
      `Đã đổi ngày hẹn của ${code}.`,
      `Changed the follow-up date of ${code}.`,
      `${code}의 연락 날짜를 변경했습니다.`,
    ),
    lang,
  )

export const holdSetToast = (code: string, lang: Lang) =>
  translate(
    message(`Đã tạm hoãn ${code}.`, `${code} is now on hold.`, `${code}을(를) 보류했습니다.`),
    lang,
  )

export const holdKindText = (kind: HoldSubjectType, lang: Lang) => translate(HOLD_COPY[kind], lang)

export function holdUntilText(day: string, lang: Lang): string {
  const date = formatDate(day, lang)
  return translate(
    message(`Tạm hoãn đến ${date}`, `On hold until ${date}`, `${date}까지 보류`),
    lang,
  )
}
