import type { HoldSubjectType } from '@pv/contracts'
import { formatDate, message, translate, type Lang } from '@/app/i18n'

export const HOLD_COPY = {
  title: message('Tạm hoãn', 'On hold', '보류 중'),
  search: message(
    'Tìm khách hàng, lead hoặc cơ hội…',
    'Search customers, leads or opportunities…',
    '고객, 리드 또는 영업 기회 검색…',
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
  opportunity: message('Cơ hội', 'Opportunity', '영업 기회'),
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
    '보류 중인 리드나 영업 기회가 없습니다.',
  ),
  viewAll: message('Xem tất cả', 'View all', '전체 보기'),
  retry: message('Tải lại', 'Reload', '다시 불러오기'),
  dueLevel: message('Mức đến hạn', 'Due status', '기한 상태'),
  kind: message('Loại', 'Type', '유형'),
  bothKinds: message('Lead và cơ hội', 'Leads and opportunities', '리드와 영업 기회'),
  itemCount: message('mục', 'items', '개'),
  clearFilters: message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기'),
} as const

export const holdKindText = (kind: HoldSubjectType, lang: Lang) => translate(HOLD_COPY[kind], lang)

export function holdUntilText(day: string, lang: Lang): string {
  const date = formatDate(day, lang)
  if (lang === 'en') return `On hold until ${date}`
  if (lang === 'ko') return `${date}까지 보류`
  return `Tạm hoãn đến ${date}`
}
