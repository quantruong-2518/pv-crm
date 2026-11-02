import { LEAD_NUM, MOTION_LABEL, type LeadMotion, type LeadState } from '@pv/contracts'
import { PIPELINE_STAGES } from '@pv/engines/fixtures/das-vina'
import { message, translate, type Lang, type Message } from '@/app/i18n'
import type { FormField } from '@/data/lead-form'

/** Product copy for the lead book and profile. Names entered by staff stay as entered. */
export const LEAD_COPY = {
  search: message(
    'Tìm công ty, người liên hệ, mã lead hoặc mã số thuế…',
    'Search companies, contacts, lead codes or tax IDs…',
    '회사, 연락처, 리드 코드 또는 세금번호 검색…',
  ),
  bookTitle: message('Khách hàng tiềm năng', 'Leads', '잠재 고객'),
  newTitle: message('Lead mới', 'New lead', '새 리드'),
  newDescription: message(
    'Lead mới vào kho chung, chờ người phụ trách nhận.',
    'The new lead goes to the shared pool for someone to claim.',
    '새 리드는 담당자가 받을 때까지 공용 목록에 표시됩니다.',
  ),
  book: message('Sổ lead', 'Lead list', '리드 목록'),
  backBook: message('Về sổ lead', 'Back to leads', '리드 목록으로'),
  add: message('Thêm lead', 'Add lead', '리드 추가'),
  importFile: message('Nhập từ tệp', 'Import file', '파일 가져오기'),
  importImage: message('Nhập từ ảnh', 'Import image', '이미지에서 가져오기'),
  group: message('Nhóm lead', 'Lead groups', '리드 그룹'),
  myLeads: message('Lead của tôi', 'My leads', '내 리드'),
  pinned: message('Đã ghim', 'Pinned', '고정됨'),
  disabled: message('Đã vô hiệu', 'Disabled', '비활성화됨'),
  all: message('Tất cả', 'All', '전체'),
  active: message('Đang hoạt động', 'Active', '진행 중'),
  held: message('Tạm hoãn', 'On hold', '보류 중'),
  viewAll: message('Xem tất cả lead', 'View all leads', '모든 리드 보기'),
  clearFilters: message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기'),
  retry: message('Tải lại', 'Retry', '다시 시도'),
  noPinned: message(
    'Chưa ghim lead nào. Ghim một lead trong danh sách để xem ở đây.',
    'No pinned leads yet. Pin a lead in the list to see it here.',
    '고정한 리드가 없습니다. 목록에서 리드를 고정하면 여기에 표시됩니다.',
  ),
  noMatch: message(
    'Không có lead nào khớp bộ lọc.',
    'No leads match these filters.',
    '필터에 맞는 리드가 없습니다.',
  ),
  noDisabled: message(
    'Chưa có lead nào bị vô hiệu hóa.',
    'No disabled leads.',
    '비활성화된 리드가 없습니다.',
  ),
  noLeads: message('Chưa có lead nào.', 'No leads yet.', '리드가 없습니다.'),
  loadFailed: message(
    'Không tải được danh sách lead.',
    'Could not load leads.',
    '리드 목록을 불러오지 못했습니다.',
  ),
  fallbackError: message('Thử lại.', 'Try again.', '다시 시도하세요.'),
  missingProfile: message('Không tìm thấy lead', 'Lead not found', '리드를 찾을 수 없습니다'),
  openFailed: message(
    'Không mở được hồ sơ lead.',
    'Could not open this lead.',
    '리드 정보를 열 수 없습니다.',
  ),
  sideLabel: message('Phụ trách và việc tiếp theo', 'Owner and next step', '담당자와 다음 단계'),
  railLabel: message(
    'Lịch sử liên hệ, người liên hệ và tài liệu của lead',
    'Lead activity, contacts and documents',
    '리드의 연락 기록, 담당자 및 문서',
  ),
  actions: message('Thao tác lead', 'Lead actions', '리드 작업'),
  claimDone: message('Đã nhận lead', 'Lead claimed', '리드를 받았습니다'),
  claimFailed: message(
    'Không nhận được lead.',
    'Could not claim lead.',
    '리드를 받을 수 없습니다.',
  ),
  imported: message('Đã thêm lead', 'Leads added', '리드가 추가되었습니다'),
  importedPeople: message(
    'người được gộp vào lead chung',
    'people joined to existing leads',
    '명이 기존 리드에 연결됨',
  ),
  duplicateRows: message(
    'dòng đã có sẵn, không nạp',
    'existing rows skipped',
    '개의 기존 행을 건너뜀',
  ),
  duplicateFile: message(
    'dòng trùng nhau trong tệp',
    'duplicate rows in file',
    '개의 파일 내 중복 행',
  ),
  failedRows: message('dòng không nạp được', 'rows could not be imported', '개 행을 가져오지 못함'),
  sendEmail: message('Sẽ gửi email', 'Emails to send', '발송할 이메일'),
  skipNoEmail: message(
    'bỏ qua lead chưa có email',
    'leads without email skipped',
    '이메일 없는 리드는 건너뜀',
  ),
  profileTitle: message('Thông tin lead', 'Lead details', '리드 정보'),
  profileParts: message('Phần hồ sơ', 'Profile sections', '정보 항목'),
  requiredMark: message(
    'Ô có dấu sao là bắt buộc.',
    'Fields marked * are required.',
    '* 표시 항목은 필수입니다.',
  ),
  note: message('Ghi chú', 'Notes', '메모'),
  notePurpose: message(
    'Điều cần nhớ khi liên hệ khách.',
    'Things to remember when contacting this customer.',
    '고객에게 연락할 때 기억할 사항입니다.',
  ),
  noteAfterCreate: message(
    'Tạo lead xong mới ghi chú được.',
    'Add the lead before writing notes.',
    '리드를 추가한 뒤 메모할 수 있습니다.',
  ),
  noteAria: message('Ghi chú về lead', 'Lead notes', '리드 메모'),
  notePlaceholder: message(
    'Ví dụ: chỉ gọi trước 9 giờ…',
    'For example: call before 9 a.m.…',
    '예: 오전 9시 전에만 전화…',
  ),
  noteLocal: message(
    'Ghi chú chỉ lưu trên máy này. Đồng nghiệp không thấy.',
    'Notes stay on this device. Colleagues cannot see them.',
    '메모는 이 기기에만 저장되며 동료에게 보이지 않습니다.',
  ),
  saving: message('Đang lưu…', 'Saving…', '저장 중…'),
  saved: message('Đã lưu thay đổi', 'Changes saved', '변경 사항이 저장되었습니다'),
  openOpportunity: message('Mở cơ hội', 'Open opportunity', '영업 기회 만들기'),
  disabledSince: message('Lead đã vô hiệu hóa từ', 'Lead disabled since', '리드 비활성화 날짜'),
  restore: message('Khôi phục', 'Restore', '복원'),
  rungs: message('Các bậc của lead', 'Lead stages', '리드 단계'),
  scorecard: message('Thẻ điểm sổ lead', 'Lead summary', '리드 요약'),
  total: message('Tổng lead', 'Total leads', '전체 리드'),
  firstContact: message('Đã liên hệ lần đầu', 'First contact made', '첫 연락 완료'),
  converted: message('Thành cơ hội', 'Converted to opportunity', '영업 기회로 전환'),
  signed: message('Đã ký hợp đồng', 'Contract signed', '계약 체결'),
  noRate: message(
    'Chưa có lead để tính tỷ lệ',
    'No leads to calculate a rate',
    '비율을 계산할 리드가 없습니다',
  ),
  source: message('Nguồn lead', 'Lead source', '리드 유입 경로'),
  status: message('Trạng thái', 'Status', '상태'),
  created: message('Ngày tạo', 'Created', '생성일'),
  creator: message('Người tạo', 'Created by', '생성자'),
  owner: message('Người phụ trách', 'Owner', '담당자'),
  companyContact: message('Công ty / Người liên hệ', 'Company / Contact', '회사 / 연락처'),
  industry: message('Ngành', 'Industry', '업종'),
  industryGroup: message('Nhóm ngành', 'Industry group', '산업 분야'),
  heldUntil: message('Ngày hẹn gặp lại', 'Follow-up date', '후속 연락일'),
  disabledAt: message('Ngày vô hiệu hóa', 'Disabled on', '비활성화 날짜'),
  selectPage: message('Chọn cả trang', 'Select page', '페이지 전체 선택'),
  pin: message('Ghim', 'Pin', '고정'),
  toolbar: message('Thanh công cụ', 'Toolbar', '도구 모음'),
  clearDraft: message('Xóa hết', 'Clear form', '모두 지우기'),
  creating: message('Đang tạo…', 'Creating…', '생성 중…'),
  create: message('Tạo lead', 'Create lead', '리드 만들기'),
  unknownPerson: message('Chưa rõ', 'Unknown', '미확인'),
  noContact: message('Chưa có người liên hệ', 'No contact yet', '연락처 없음'),
  noTitle: message('Chưa rõ chức danh', 'Job title unknown', '직책 미확인'),
  activity: message('Hoạt động', 'Activity', '활동'),
  activityAfterCreate: message(
    'Có sau khi tạo lead.',
    'Available after creating the lead.',
    '리드를 만든 뒤 확인할 수 있습니다.',
  ),
  ownerSource: message('Phụ trách và nguồn', 'Owner and source', '담당자와 유입 경로'),
  poolHint: message(
    'Lead mới nằm ở kho chung.',
    'New leads enter the shared pool.',
    '새 리드는 공용 목록에 들어갑니다.',
  ),
  unclaimed: message('Chưa ai nhận', 'Unclaimed', '담당자 없음'),
  sourceHint: message(
    'Chọn nguồn có sẵn hoặc nhập tên mới.',
    'Choose a source or add one.',
    '기존 유입 경로를 선택하거나 새로 입력하세요.',
  ),
  campaignHint: message(
    'Chọn chiến dịch còn nhận lead.',
    'Choose a campaign accepting leads.',
    '리드를 받고 있는 캠페인을 선택하세요.',
  ),
  referrerHint: message(
    'Nguồn lấy theo mã giới thiệu.',
    'The referral code sets the source.',
    '추천 코드로 유입 경로가 결정됩니다.',
  ),
  firstInbound: message('Bị động', 'Customer initiated', '고객이 먼저 연락'),
  firstOutbound: message('Chủ động', 'We initiated', '먼저 연락함'),
  label: message('Nhãn', 'Label', '라벨'),
  approach: message('Cách tiếp cận', 'Approach', '접근 방식'),
  intakeSource: message('Nguồn nhập', 'Intake source', '등록 경로'),
  campaign: message('Chiến dịch', 'Campaign', '캠페인'),
  selectedSource: message('Nguồn đã chọn', 'Selected source', '선택한 유입 경로'),
  selectedLabel: message('Nhãn đã chọn', 'Selected label', '선택한 라벨'),
  selected: message('đang chọn', 'selected', '선택됨'),
} satisfies Record<string, Message>

const STATE: Record<LeadState, Message> = {
  new: message('Mới', 'New', '신규'),
  assigned: message('Đã giao', 'Assigned', '배정됨'),
  working: message('Đang liên hệ', 'In contact', '연락 중'),
  nurturing: message('Đang chăm sóc', 'Nurturing', '관리 중'),
  converted: LEAD_COPY.converted,
}

export const leadStateText = (state: LeadState, lang: Lang) => translate(STATE[state], lang)

const MOTION: Record<LeadMotion, Message> = {
  INBOUND: message('Inbound', 'Inbound', '인바운드'),
  OUTBOUND: message('Outbound', 'Outbound', '아웃바운드'),
  EVENT: message('Sự kiện', 'Event', '이벤트'),
  REFERRAL: message('Giới thiệu', 'Referral', '소개'),
  PARTNER: message('Đối tác', 'Partner', '파트너'),
  RECYCLE: message('Đánh thức lại', 'Re-engagement', '재접촉'),
}

export function leadMotionText(motion: LeadMotion, storedLabel: string, lang: Lang): string {
  return storedLabel === MOTION_LABEL[motion] ? translate(MOTION[motion], lang) : storedLabel
}

export function leadScoreHint(
  kind: 'contacted' | 'converted' | 'signed',
  done: string,
  total: string,
  lang: Lang,
): string {
  const messages = {
    contacted: message(
      `${done}/${total} lead đã liên hệ lần đầu`,
      `${done} of ${total} leads contacted`,
      `전체 ${total}개 중 ${done}개 리드 첫 연락 완료`,
    ),
    converted: message(
      `${done}/${total} lead đã thành cơ hội`,
      `${done} of ${total} leads converted`,
      `전체 ${total}개 중 ${done}개 리드가 영업 기회로 전환`,
    ),
    signed: message(
      `${done}/${total} lead đã ký hợp đồng`,
      `${done} of ${total} leads signed`,
      `전체 ${total}개 중 ${done}개 리드 계약 체결`,
    ),
  }
  return translate(messages[kind], lang)
}

const SOURCE_KIND: Record<string, Message> = {
  MANUAL: message('Thêm thủ công', 'Added manually', '직접 추가'),
  IMPORT: message('Nạp theo lô', 'Batch import', '일괄 가져오기'),
  APOLLO: message('Apollo', 'Apollo', 'Apollo'),
  LANDING_PAGE: message('Web landing', 'Landing page', '랜딩 페이지'),
  SCAN: message('Nạp từ ảnh', 'Image import', '이미지에서 가져오기'),
}

export const sourceKindText = (kind: string | undefined, lang: Lang): string =>
  kind && SOURCE_KIND[kind]
    ? translate(SOURCE_KIND[kind], lang)
    : translate(message('Chưa rõ nguồn', 'Unknown source', '유입 경로 미확인'), lang)

const GROUP = {
  company: {
    label: message('Doanh nghiệp', 'Company', '회사'),
    purpose: message(
      'Thông tin pháp lý, ngành và quy mô hoạt động.',
      'Legal details, industry and company size.',
      '법인 정보, 업종 및 규모를 입력합니다.',
    ),
  },
  person: {
    label: message('Người liên hệ', 'Contact', '연락처'),
    purpose: message(
      'Thông tin để liên hệ với khách.',
      'How to reach this customer.',
      '고객에게 연락할 정보를 입력합니다.',
    ),
  },
  need: {
    label: message('Nhu cầu', 'Needs', '요구 사항'),
    purpose: message(
      'Vấn đề, ngân sách, người duyệt và thời hạn.',
      'Problem, budget, approver and target date.',
      '문제, 예산, 승인자 및 기한을 입력합니다.',
    ),
  },
  note: { label: LEAD_COPY.note, purpose: LEAD_COPY.notePurpose },
} as const

export const leadGroupText = (key: keyof typeof GROUP, part: 'label' | 'purpose', lang: Lang) =>
  translate(GROUP[key][part], lang)

const FIELD: Partial<
  Record<
    FormField['key'],
    Partial<Record<'label' | 'hint' | 'placeholder' | 'unit' | 'people', Message>>
  >
> = {
  company: { label: message('Tên gọi trong sổ', 'Company name', '회사 이름') },
  legalName: {
    label: message('Tên pháp nhân', 'Legal name', '법인명'),
    hint: message(
      'Hợp đồng ký theo tên này.',
      'Contracts use this name.',
      '계약서에 이 이름이 사용됩니다.',
    ),
  },
  taxCode: {
    label: message('Mã số thuế', 'Tax ID', '세금번호'),
    placeholder: message('10 chữ số', '10 digits', '숫자 10자리'),
  },
  address: { label: message('Địa chỉ nhà máy', 'Factory address', '공장 주소') },
  province: { label: message('Tỉnh', 'Province', '성·시') },
  category: {
    label: message('Nhóm ngành', 'Industry group', '산업 분야'),
    hint: message(
      'Đổi nhóm ngành sẽ bỏ các ngành của nhóm cũ.',
      'Changing the group removes the industries of the old group.',
      '산업 분야를 바꾸면 이전 분야의 업종이 삭제됩니다.',
    ),
  },
  industries: {
    label: message(
      `Ngành · tối đa ${LEAD_NUM.industriesMax}`,
      `Industries · up to ${LEAD_NUM.industriesMax}`,
      `업종 · 최대 ${LEAD_NUM.industriesMax}개`,
    ),
  },
  mainProduct: { label: message('Sản phẩm chính', 'Main product', '주요 제품') },
  sizeBand: { label: message('Quy mô', 'Company size', '기업 규모') },
  website: { label: message('Website', 'Website', '웹사이트') },
  tier: { label: message('Bậc', 'Tier', '등급') },
  contactName: { label: message('Người liên hệ', 'Contact', '연락처 담당자') },
  contactTitle: { label: message('Chức danh', 'Job title', '직책') },
  phone: { label: message('Điện thoại', 'Phone', '전화번호') },
  email: { label: message('Email', 'Email', '이메일') },
  channel: {
    label: message('Kênh gọi lại được', 'Reply channel', '회신 채널'),
    hint: message(
      'Kênh khách dùng để phản hồi.',
      'How the customer replies.',
      '고객이 회신하는 채널입니다.',
    ),
  },
  channelUrl: { label: message('URL kênh liên hệ', 'Contact channel URL', '연락 채널 URL') },
  pain: {
    label: message('Vấn đề cần giải quyết', 'Problem to solve', '해결할 문제'),
    placeholder: message(
      'Ghi theo lời khách…',
      'Use the customer’s words…',
      '고객의 말로 적어 주세요…',
    ),
  },
  currentStack: {
    label: message('Giải pháp đang sử dụng', 'Current solution', '현재 사용 중인 솔루션'),
  },
  decisionMaker: { label: message('Người ký cuối', 'Final signer', '최종 서명자') },
  approver: { label: message('Người duyệt ngân sách', 'Budget approver', '예산 승인자') },
  budget: {
    label: message('Ngân sách dự kiến', 'Expected budget', '예상 예산'),
    hint: message(
      'Ngân sách khách đã cho biết.',
      'Budget shared by the customer.',
      '고객이 알려준 예산입니다.',
    ),
  },
  currency: { label: message('Đồng tiền', 'Currency', '통화') },
  deadline: { label: message('Thời hạn mong muốn', 'Target date', '희망 기한') },
  code: { label: message('Mã lead', 'Lead code', '리드 코드') },
  stage: { label: message('Cột trong sổ cơ hội', 'Opportunity stage', '영업 기회 단계') },
  owner: {
    label: LEAD_COPY.owner,
    people: message(
      'Còn ở kho chung, chưa ai nhận',
      'Unassigned in the shared pool',
      '공용 목록에서 배정 대기 중',
    ),
    hint: message(
      'Đổi người phụ trách có thể đổi cách chia hoa hồng.',
      'Changing the owner may affect commission sharing.',
      '담당자를 바꾸면 수수료 배분이 달라질 수 있습니다.',
    ),
  },
  bdOwner: {
    label: message('BD đã liên hệ', 'BD contact', '연락한 BD'),
    people: message('Chưa có BD liên hệ', 'No BD contact yet', '연락한 BD가 없습니다'),
  },
  marketingOwner: {
    label: message('Marketing phụ trách', 'Marketing owner', '마케팅 담당자'),
    people: message('Không qua Marketing', 'No Marketing owner', '마케팅 담당자 없음'),
  },
  source: { label: LEAD_COPY.source },
  createdAt: { label: LEAD_COPY.created },
  exitReason: { label: message('Lý do vào nhóm chờ', 'Reason for waiting', '대기 사유') },
  motion: {
    label: message('Phương án tiếp cận', 'Approach', '접근 방식'),
    hint: message(
      'Ai chủ động trước.',
      'Who made the first move.',
      '누가 먼저 연락했는지 표시합니다.',
    ),
  },
  origin: { label: message('Nguồn', 'Source', '유입 경로') },
  campaignCode: { label: message('Chiến dịch', 'Campaign', '캠페인') },
  refCode: { label: message('Mã giới thiệu', 'Referral code', '추천 코드') },
}

const OPTION: Partial<Record<FormField['key'], Record<string, Message>>> = {
  category: {
    chip: message('Chip', 'Semiconductors', '반도체'),
    mechanical: message('Cơ khí', 'Mechanical', '기계'),
    automotive: message('Ô tô', 'Automotive', '자동차'),
    pharma: message('Dược', 'Pharmaceuticals', '제약'),
  },
  tier: {
    prospect: message('Đầu mối', 'Prospect', '잠재 고객'),
    mql: message('MQL', 'MQL', 'MQL'),
    sql: message('SQL', 'SQL', 'SQL'),
  },
  channel: {
    '': message('Chưa có kênh liên hệ', 'No reply channel yet', '회신 채널 없음'),
    'in-app': message('Trong app', 'In app', '앱 내'),
  },
  stage: {
    '': message('Chưa vào sổ cơ hội', 'No opportunity yet', '영업 기회 없음'),
    new: message('Khởi tạo', 'New', '신규'),
    assigned: message('Đang phân công', 'Assigning', '배정 중'),
    engaged: message('Chăm sóc', 'Engaged', '상담 중'),
    quotation: message('Báo giá', 'Quotation', '견적'),
  },
}

export function localizeLeadField(field: FormField, lang: Lang): FormField {
  const copy = FIELD[field.key]
  if (!copy) return field
  return {
    ...field,
    label: copy.label ? translate(copy.label, lang) : field.label,
    hint: copy.hint ? translate(copy.hint, lang) : field.hint,
    placeholder: copy.placeholder ? translate(copy.placeholder, lang) : field.placeholder,
    unit: copy.unit ? translate(copy.unit, lang) : field.unit,
    people: copy.people ? translate(copy.people, lang) : field.people,
    options: field.options?.map((option) => {
      const label = OPTION[field.key]?.[option.value]
      const stage =
        field.key === 'stage'
          ? PIPELINE_STAGES.find((entry) => entry.key === option.value)
          : undefined
      if (stage && label) {
        const name = translate(label, lang)
        const days = stage.limitDays
        return {
          ...option,
          label:
            lang === 'vi'
              ? `${name} · hạn ${days} ngày`
              : lang === 'en'
                ? `${name} · ${days}-day limit`
                : `${name} · ${days}일 기한`,
        }
      }
      if (option.value === '' && !label) {
        return { ...option, label: translate(message('— chưa có —', '— none —', '— 없음 —'), lang) }
      }
      return label ? { ...option, label: translate(label, lang) } : option
    }),
  }
}
