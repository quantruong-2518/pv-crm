import type { AfterSaleCareStatus, AfterSaleTemperatureFilter } from '@pv/contracts'
import { message, translate, type Lang } from '@/app/i18n'

/** The bought-customer journey: list, filters, cards, table and repeat deal. */
export const AFTER_SALE_COPY = {
  title: message('Khách đã mua', 'Paid customers', '결제 완료 고객'),
  search: message(
    'Tìm mã hành trình hoặc tên công ty…',
    'Search by journey code or company…',
    '진행 기록 코드 또는 회사명 검색…',
  ),
  carePeriod: message('Kỳ chăm sóc', 'Follow-up period', '후속 관리 시기'),
  temperature: message('Mức quan tâm', 'Interest level', '관심도'),
  anyTemperature: message('Mọi mức quan tâm', 'All interest levels', '모든 관심도'),
  carer: message('Người chăm sóc', 'Account owner', '고객 담당자'),
  anyCarer: message('Mọi người chăm sóc', 'All account owners', '모든 고객 담당자'),
  completedDay: message('Ngày hoàn tất', 'Completion date', '완료일'),
  completed: message('Hoàn tất', 'Completed', '완료'),
  customer: message('Khách hàng', 'Customer', '고객'),
  nextStep: message('Việc tiếp theo', 'Next action', '다음 할 일'),
  lastContact: message('Liên hệ gần nhất', 'Last contact', '최근 연락'),
  nextCare: message('Kỳ chăm sóc tới', 'Next follow-up', '다음 후속 관리'),
  collected: message('Đã thu (₫)', 'Collected (₫)', '수금액 (₫)'),
  collectedShort: message('đã thu', 'collected', '수금'),
  action: message('Thao tác', 'Action', '작업'),
  due: message('Đến kỳ', 'Due', '예정일 도래'),
  noCarer: message('Chưa có người chăm sóc', 'No account owner', '고객 담당자 없음'),
  noStep: message('Chưa có việc tiếp theo', 'No next action', '다음 할 일 없음'),
  noContact: message('Chưa liên hệ', 'No contact yet', '연락 내역 없음'),
  noCompletedDay: message('Chưa ghi ngày hoàn tất', 'No completion date', '완료일 없음'),
  openDeal: message('Mở cơ hội mới', 'Open a new opportunity', '새 영업 기회 만들기'),
  customerCount: message('khách', 'customers', '명'),
  loadFailed: message(
    'Không tải được danh sách khách đã mua.',
    'Could not load paid customers.',
    '결제 완료 고객 목록을 불러오지 못했습니다.',
  ),
  retry: message('Thử lại.', 'Try again.', '다시 시도하세요.'),
  noMatch: message(
    'Không có khách nào khớp bộ lọc.',
    'No customers match these filters.',
    '필터에 맞는 고객이 없습니다.',
  ),
  clearFilters: message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기'),
  noCustomers: message(
    'Chưa có khách hàng nào đã thanh toán đủ.',
    'No customers have paid in full yet.',
    '대금을 모두 결제한 고객이 아직 없습니다.',
  ),
  viewContracts: message('Xem sổ hợp đồng', 'View contracts', '계약 보기'),
  careAll: message('Tất cả', 'All', '전체'),
  careDue: message('Đến kỳ chăm sóc', 'Follow-up due', '후속 관리 필요'),
  careUpcoming: message('Chưa đến kỳ', 'Not due yet', '예정 전'),
  hot: message('Quan tâm cao', 'High interest', '관심 높음'),
  warm: message('Có quan tâm', 'Interested', '관심 있음'),
  cold: message('Ít quan tâm', 'Low interest', '관심 낮음'),
  unread: message('Chưa đánh giá', 'Not assessed', '평가 전'),
  dueOn: message('hạn', 'due', '기한'),
} as const

const CARE_COPY: Record<
  AfterSaleCareStatus,
  (typeof AFTER_SALE_COPY)[keyof typeof AFTER_SALE_COPY]
> = {
  all: AFTER_SALE_COPY.careAll,
  due: AFTER_SALE_COPY.careDue,
  upcoming: AFTER_SALE_COPY.careUpcoming,
}

const TEMPERATURE_COPY: Record<
  AfterSaleTemperatureFilter,
  (typeof AFTER_SALE_COPY)[keyof typeof AFTER_SALE_COPY]
> = {
  hot: AFTER_SALE_COPY.hot,
  warm: AFTER_SALE_COPY.warm,
  cold: AFTER_SALE_COPY.cold,
  none: AFTER_SALE_COPY.unread,
}

export const careStatusText = (value: AfterSaleCareStatus, lang: Lang) =>
  translate(CARE_COPY[value], lang)

export const temperatureText = (value: AfterSaleTemperatureFilter | null, lang: Lang) =>
  translate(value ? TEMPERATURE_COPY[value] : AFTER_SALE_COPY.unread, lang)
