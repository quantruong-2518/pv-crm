import type { ContractPenaltyDirection } from '@pv/contracts'
import type { DueLevel } from '@pv/engines'
import { formatDate, formatNumber, getLang, message, translate, type Lang } from '@/app/i18n'

export const CONTRACT_COPY = {
  bookTitle: message('Hợp đồng', 'Contracts', '계약'),
  bookSearch: message(
    'Tìm mã hợp đồng hoặc tên khách hàng…',
    'Search by contract code or customer…',
    '계약 코드 또는 고객명 검색…',
  ),
  collectionStatus: message('Tình trạng thu', 'Collection status', '수금 상태'),
  all: message('Tất cả', 'All', '전체'),
  bookCount: message('hợp đồng', 'contracts', '건'),
  totalValue: message('Tổng giá trị hợp đồng', 'Total contract value', '총 계약 금액'),
  amountMissing: message('chưa nhập giá trị', 'without an amount', '금액 미입력'),
  collectedAmount: message('Đã thu tiền', 'Collected', '수금액'),
  noInstallments: message('Chưa có đợt thanh toán nào', 'No installments yet', '납부 회차 없음'),
  scheduledTotal: message('tổng tiền theo lịch thu', 'of scheduled payments', '예정 금액 대비'),
  overdueAmount: message('Tiền quá hạn', 'Overdue payments', '연체 금액'),
  overdueInstallments: message(
    'đợt thanh toán cần xử lý',
    'installments need attention',
    '건의 납부 회차 처리 필요',
  ),
  noOverdueAmount: message('Không có khoản thu quá hạn', 'No overdue payments', '연체 금액 없음'),
  overdueConditions: message('Điều kiện quá hạn', 'Overdue conditions', '기한 초과 조건'),
  noOverdueConditions: message(
    'Không có điều kiện nào quá hạn',
    'No overdue conditions',
    '기한 초과 조건 없음',
  ),
  fromCustomer: message('từ khách hàng', 'customer', '고객'),
  fromTeam: message('từ nội bộ', 'internal', '내부'),
  loadFailed: message(
    'Không tải được danh sách hợp đồng.',
    'Could not load contracts.',
    '계약 목록을 불러오지 못했습니다.',
  ),
  retry: message('Thử lại.', 'Try again.', '다시 시도하세요.'),
  noMatch: message(
    'Không có hợp đồng nào khớp bộ lọc.',
    'No contracts match these filters.',
    '필터에 맞는 계약이 없습니다.',
  ),
  clearFilters: message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기'),
  noContracts: message('Chưa có hợp đồng nào.', 'No contracts yet.', '아직 계약이 없습니다.'),
  viewOpportunities: message('Xem sổ cơ hội', 'View opportunities', '기회 보기'),
  customerAndKind: message(
    'Khách hàng / Loại hợp đồng',
    'Customer / Contract type',
    '고객 / 계약 유형',
  ),
  signedDay: message('Ngày ký', 'Signed on', '서명일'),
  closer: message('Người chốt', 'Deal owner', '계약 담당자'),
  noCloser: message('Chưa có người chốt', 'No deal owner', '계약 담당자 없음'),
  noSale: message('Chưa có Sale', 'No salesperson', '영업 담당자 없음'),
  saleAndBd: message('Sale / BD', 'Sales / BD', '영업 / BD'),
  estimatedValue: message('Giá trị ước đoán', 'Estimated value', '예상 금액'),
  collectedProgress: message('Tiến độ thu', 'Collection progress', '수금 진행'),
  nextPayment: message('Đợt thu tiếp theo', 'Next installment', '다음 납부 회차'),
  convertedWhy: message(
    'Bộ lọc và thứ tự sắp xếp so số tiền đã quy ra đồng',
    'Filters and sorting use the amount converted to VND',
    '필터와 정렬은 동으로 환산한 금액을 사용합니다',
  ),
  noSignedDay: message('Chưa ghi ngày ký', 'No signing date', '서명일 없음'),
  noAmount: message(
    'Hợp đồng chưa nhập giá trị',
    'Contract amount not entered',
    '계약 금액 미입력',
  ),
  contractKind: message('Loại hợp đồng', 'Contract type', '계약 유형'),
  valueVnd: message('Giá trị (₫)', 'Value (₫)', '금액 (₫)'),
  value: message('Giá trị', 'Value', '금액'),
  collected: message('Đã thu đủ', 'Paid in full', '전액 수금'),
  collecting: message('Đang thu', 'Collecting', '수금 중'),
  overdue: message('Quá hạn', 'Overdue', '연체'),
  terminated: message('Đã chấm dứt', 'Terminated', '종료됨'),
  done: message('Đã thu', 'Collected', '수금 완료'),
  upcoming: message('Chưa tới', 'Upcoming', '예정'),
  dueSoon: message('Gần hạn', 'Due soon', '기한 임박'),
  due: message('Đến hạn', 'Due', '기한 도래'),
  longOverdue: message('Quá hạn lâu', 'Long overdue', '장기 연체'),
  ours: message('Ta', 'Us', '우리 쪽'),
  customer: message('Khách', 'Customer', '고객'),
  oursAction: message('Ta phải làm', 'Action for us', '우리 쪽 처리'),
  customerAction: message('Khách phải làm', 'Action for customer', '고객 처리'),
  customerPaysPenalty: message('Khách trả phạt', 'Customer pays penalty', '고객 위약금 지급'),
  companyPaysPenalty: message('Công ty trả phạt', 'Company pays penalty', '회사 위약금 지급'),
  customerPenaltyDone: message('Đã thu', 'Collected', '수금 완료'),
  customerPenaltyWait: message('Chưa thu', 'Not collected', '미수금'),
  companyPenaltyDone: message('Đã trả', 'Paid', '지급 완료'),
  companyPenaltyWait: message('Chưa trả', 'Not paid', '미지급'),
  missingInstallmentAmount: message('Đợt chưa nhập số tiền', 'Amount not entered', '금액 미입력'),
  notCollected: message('Chưa thu', 'Not collected', '미수금'),
  percentOfValue: message('giá trị', 'of value', '계약 금액'),
} as const

const LEVEL_COPY: Record<DueLevel, (typeof CONTRACT_COPY)[keyof typeof CONTRACT_COPY]> = {
  done: CONTRACT_COPY.done,
  upcoming: CONTRACT_COPY.upcoming,
  'due-soon': CONTRACT_COPY.dueSoon,
  due: CONTRACT_COPY.due,
  overdue: CONTRACT_COPY.overdue,
  'long-overdue': CONTRACT_COPY.longOverdue,
}

export const dueLevelText = (level: DueLevel, lang: Lang = getLang()) =>
  translate(LEVEL_COPY[level], lang)

export function penaltyDirectionText(direction: ContractPenaltyDirection, lang: Lang) {
  return translate(
    direction === 'customer-pays'
      ? CONTRACT_COPY.customerPaysPenalty
      : CONTRACT_COPY.companyPaysPenalty,
    lang,
  )
}

export function penaltyStatusText(direction: ContractPenaltyDirection, done: boolean, lang: Lang) {
  return translate(
    direction === 'customer-pays'
      ? done
        ? CONTRACT_COPY.customerPenaltyDone
        : CONTRACT_COPY.customerPenaltyWait
      : done
        ? CONTRACT_COPY.companyPenaltyDone
        : CONTRACT_COPY.companyPenaltyWait,
    lang,
  )
}

export function daysUntilText(daysLeft: number, lang: Lang): string {
  if (daysLeft === 0) return translate(CONTRACT_COPY.due, lang)
  const n = formatNumber(Math.abs(daysLeft), lang)
  const text =
    daysLeft > 0
      ? message(`còn ${n} ngày`, `${n} days left`, `${n}일 남음`)
      : message(`trễ ${n} ngày`, `${n} days late`, `${n}일 지남`)
  return translate(text, lang)
}

export function installmentCaption(no: number, due: string, daysLeft: number, lang: Lang): string {
  const day = formatDate(due, lang)
  const relative = daysUntilText(daysLeft, lang)
  return translate(
    message(
      `${relative} · đợt ${no} · ${day}`,
      `${relative} · installment ${no} · ${day}`,
      `${relative} · 납부 회차 ${no} · ${day}`,
    ),
    lang,
  )
}
