import type { StopLogNow } from '@pv/contracts'
import { message, translate, type Lang, type Message } from '@/app/i18n'

/** The stopped-customers page: tabs, re-contact groups, book columns and the stop log. */
export const NURTURING_COPY = {
  title: message('Khách đã dừng', 'Stopped customers', '중단된 고객'),
  chromeSearch: message(
    'Tìm khách hàng, cơ hội, báo giá, hồ sơ…',
    'Search customers, opportunities, quotes, records…',
    '고객, 기회, 견적, 기록 검색…',
  ),
  sections: message('Mục', 'Section', '구분'),
  tabs: {
    recare: message('Cần liên hệ lại', 'To re-contact', '재연락 필요'),
    log: message('Nhật ký dừng', 'Stop log', '중단 기록'),
  } satisfies Record<'recare' | 'log', Message>,
  groupLabel: message('Nhóm', 'Group', '그룹'),
  groups: {
    replied: message('Vừa phản hồi', 'Just replied', '방금 회신'),
    due: message('Đến hạn', 'Due', '기한 도래'),
    later: message('Chưa đến hạn', 'Not due yet', '기한 전'),
    none: message('Không hẹn', 'No date set', '일정 없음'),
  } satisfies Record<'replied' | 'due' | 'later' | 'none', Message>,
  empty: {
    replied: message(
      'Chưa có khách nào vừa phản hồi.',
      'No customer has replied lately.',
      '최근 회신한 고객이 없습니다.',
    ),
    due: message(
      'Không có lead nào đến hạn liên hệ lại.',
      'No leads are due for re-contact.',
      '재연락 기한이 된 리드가 없습니다.',
    ),
    later: message(
      'Không có lead nào hẹn liên hệ lại sau.',
      'No leads are set for a later re-contact.',
      '나중에 재연락하기로 한 리드가 없습니다.',
    ),
    none: message(
      'Mọi lead đều đã có ngày liên hệ lại.',
      'Every lead has a re-contact date.',
      '모든 리드에 재연락 날짜가 있습니다.',
    ),
  } satisfies Record<'replied' | 'due' | 'later' | 'none', Message>,
  search: message(
    'Tìm công ty, người liên hệ, mã lead…',
    'Company, contact or lead code…',
    '회사, 담당자, 리드 코드 검색…',
  ),
  leadNoun: message('lead', 'leads', '리드'),
  stopNoun: message('lần dừng', 'stops', '건'),
  all: message('Tất cả', 'All', '전체'),
  other: message('Khác', 'Other', '기타'),
  filtersMenu: message('Bộ lọc khách đã dừng', 'Stopped-customer filters', '중단 고객 필터'),
  reason: message('Lý do', 'Reason', '사유'),
  dayEntered: message('Ngày vào nhóm', 'Date entered group', '그룹 편입일'),
  label: message('Nhãn', 'Label', '라벨'),
  company: message('Công ty / Người liên hệ', 'Company / Contact', '회사 / 담당자'),
  recontact: message('Liên hệ lại', 'Re-contact', '재연락'),
  leadSource: message('Nguồn lead', 'Lead source', '리드 출처'),
  claimLead: message('Nhận lead', 'Claim lead', '리드 가져오기'),
  repliedAt: message('Phản hồi lúc', 'Replied at', '회신 시각'),
  clearFilters: message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기'),
  leadsFailed: message(
    'Không tải được danh sách lead.',
    'Could not load leads.',
    '리드 목록을 불러오지 못했습니다.',
  ),
  logFailed: message(
    'Không tải được nhật ký dừng.',
    'Could not load the stop log.',
    '중단 기록을 불러오지 못했습니다.',
  ),
  retry: message('Thử lại.', 'Try again.', '다시 시도하세요.'),
  reload: message('Tải lại', 'Reload', '새로고침'),
  noMatch: message(
    'Không có lead nào khớp bộ lọc.',
    'No leads match these filters.',
    '필터에 맞는 리드가 없습니다.',
  ),
  // Stop log
  kindLabel: message('Loại', 'Type', '유형'),
  kinds: {
    all: message('Tất cả', 'All', '전체'),
    lead: message('Lead', 'Leads', '리드'),
    deal: message('Cơ hội', 'Opportunities', '기회'),
    contract: message('Hợp đồng', 'Contracts', '계약'),
  } satisfies Record<'all' | 'lead' | 'deal' | 'contract', Message>,
  rest: message('Còn lại', 'Remaining', '나머지'),
  summary: message('Tổng hợp lần dừng', 'Stop summary', '중단 요약'),
  stoppedAtStep: message('Dừng ở bước', 'Stopped at step', '중단 단계'),
  stoppedBy: message('Người dừng', 'Stopped by', '중단한 사람'),
  pickMonth: message('Chọn tháng', 'Choose month', '월 선택'),
  prevMonth: message('Tháng trước', 'Previous month', '이전 달'),
  nextMonth: message('Tháng sau', 'Next month', '다음 달'),
  date: message('Ngày', 'Date', '날짜'),
  record: message('Hồ sơ', 'Record', '대상'),
  status: message('Tình trạng', 'Status', '상태'),
  notRecorded: message('Chưa có', 'Not recorded', '기록 없음'),
  now: {
    waiting: message('Chờ liên hệ lại', 'Waiting to re-contact', '재연락 대기'),
    reclaimed: message('Đã nhận lại', 'Reclaimed', '다시 가져옴'),
    ended: message('Đã kết thúc', 'Ended', '종료'),
  } satisfies Record<StopLogNow, Message>,
} as const

/** The empty month line; the label is a month name or a day range. */
export const noStopsIn = (label: string, lang: Lang) =>
  translate(
    message(
      `Không có lần dừng nào trong ${label.toLowerCase()}.`,
      `No stops in ${label}.`,
      `${label}에는 중단된 건이 없습니다.`,
    ),
    lang,
  )
