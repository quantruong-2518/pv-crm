import { message as m, type Message } from './i18n'

/** Screen entry copy lives by route, so a label and its description move together. */
export const CHROME_ENTRY_COPY: Record<string, { label: Message; description?: Message }> = {
  '/': { label: m('Trang chủ', 'Home', '홈') },
  '/approvals': { label: m('Phê duyệt', 'Approvals', '승인') },
  '/notifications': { label: m('Thông báo', 'Notifications', '알림') },
  '/account': {
    label: m('Tài khoản của tôi', 'My account', '내 계정'),
    description: m(
      'Thông tin cá nhân, mật khẩu, Google và yêu cầu đã gửi',
      'Profile, password, Google connection and requests',
      '프로필, 비밀번호, Google 연결 및 요청',
    ),
  },
  '/settings': { label: m('Cài đặt', 'Settings', '설정') },
  '/admin/users': {
    label: m('Người dùng', 'Users', '사용자'),
    description: m('Mở tài khoản và gán vai trò', 'Manage accounts and roles', '계정과 역할 관리'),
  },
  '/admin/roles': {
    label: m('Vai trò', 'Roles', '역할'),
    description: m('Quyền của từng vai trò', 'Permissions by role', '역할별 권한'),
  },
  '/admin/notifications': {
    label: m('Thông báo theo vai trò', 'Notification rules', '역할별 알림'),
    description: m(
      'Chọn thông báo cho từng vai trò',
      'Choose notifications for each role',
      '역할별 알림 선택',
    ),
  },
  '/admin/costs': {
    label: m('Chi phí', 'Costs', '비용'),
    description: m('Chi phí AI và bảng giá', 'AI costs and pricing', 'AI 비용 및 요금'),
  },
  '/admin/assistant-reports': {
    label: m('Câu trả lời bị báo sai', 'Reported answers', '신고된 답변'),
    description: m(
      'Xem ai báo câu nào sai và vì sao',
      'See who reported which answer, and why',
      '누가 어떤 답변을 왜 신고했는지 봅니다',
    ),
  },
  '/admin/lead-origins': {
    label: m('Nguồn lead', 'Lead sources', '리드 유입 경로'),
    description: m(
      'Nguồn lead và quy tắc bán hàng',
      'Lead sources and sales rules',
      '리드 유입 경로 및 영업 규칙',
    ),
  },
  '/admin/partners': {
    label: m('Đối tác', 'Partners', '파트너'),
    description: m('Đối tác giới thiệu lead', 'Lead referral partners', '리드 추천 파트너'),
  },
  '/sales/config/mail-templates': { label: m('Mẫu thư', 'Email templates', '이메일 템플릿') },
  '/sales/leads': {
    label: m('Lead', 'Leads', '리드'),
    description: m('Thu nhận và phân công lead', 'Capture and assign leads', '리드 수집 및 배정'),
  },
  '/sales/accounts': {
    label: m('Công ty', 'Companies', '회사'),
    description: m(
      'Hồ sơ và lịch sử của công ty',
      'Company records and history',
      '회사 기록 및 이력',
    ),
  },
  '/sales/contacts': {
    label: m('Người liên hệ', 'Contacts', '담당자'),
    description: m('Người liên hệ tại các công ty', 'People at your companies', '회사 담당자'),
  },
  '/sales/after-sale': {
    label: m('Khách đã mua', 'Customers', '구매 고객'),
    description: m(
      'Khách đã mua và lịch chăm sóc lại',
      'Customers and follow-up dates',
      '구매 고객 및 후속 연락 일정',
    ),
  },
  '/sales/nurturing': {
    label: m('Khách đã dừng', 'Stopped leads', '중단된 리드'),
    description: m('Lead chờ liên hệ lại', 'Leads to contact again', '재연락할 리드'),
  },
  '/sales/opportunities': {
    label: m('Cơ hội', 'Opportunities', '기회'),
    description: m(
      'Theo dõi cơ hội đến khi ký',
      'Track opportunities through signing',
      '계약 체결까지 기회 추적',
    ),
  },
  '/sales/holds': {
    label: m('Tạm hoãn', 'On hold', '보류'),
    description: m(
      'Lead và cơ hội đang tạm hoãn',
      'Leads and opportunities on hold',
      '보류 중인 리드와 기회',
    ),
  },
  '/sales/contracts': {
    label: m('Hợp đồng', 'Contracts', '계약'),
    description: m(
      'Thanh toán và điều kiện hợp đồng',
      'Payments and contract terms',
      '대금 및 계약 조건',
    ),
  },
  '/sales/campaigns': {
    label: m('Chiến dịch', 'Campaigns', '캠페인'),
    description: m(
      'Tạo và đo kết quả chiến dịch',
      'Create campaigns and measure results',
      '캠페인 만들기 및 결과 확인',
    ),
  },
  '/sales/kpi/me': {
    label: m('KPI của tôi', 'My KPIs', '내 KPI'),
    description: m('Tiến độ chỉ tiêu của tôi', 'My target progress', '내 목표 진행 현황'),
  },
  '/sales/kpi/company': {
    label: m('KPI công ty', 'Company KPIs', '회사 KPI'),
    description: m('Tiến độ của toàn phòng', 'Team-wide progress', '팀 전체 진행 현황'),
  },
  '/sales/kpi/targets': {
    label: m('Chỉ tiêu tháng', 'Monthly targets', '월간 목표'),
    description: m('Chỉ tiêu đang chờ xử lý', 'Targets awaiting action', '처리가 필요한 목표'),
  },
  '/sales/plan': {
    label: m('Kế hoạch', 'Planning', '계획'),
    description: m(
      'Số liệu và kế hoạch kỳ tới',
      'Results and next-period plans',
      '실적 및 다음 기간 계획',
    ),
  },
  '/sales/config': {
    label: m('Thiết lập bán hàng', 'Sales settings', '영업 설정'),
    description: m('Danh mục và quy tắc bán hàng', 'Sales lists and rules', '영업 목록 및 규칙'),
  },
}

export const CHROME_MISC = {
  leadBook: m('Sổ lead', 'Lead book', '리드 목록'),
  customers: m('Khách hàng', 'Customers', '고객'),
  customersDescription: m(
    'Công ty, người liên hệ và đối tác',
    'Companies, contacts and partners',
    '회사, 담당자 및 파트너',
  ),
  reports: m('Báo cáo', 'Reports', '보고서'),
  reportsDescription: m(
    'KPI, chỉ tiêu và kế hoạch',
    'KPIs, targets and plans',
    'KPI, 목표 및 계획',
  ),
  guest: m('Khách', 'Guest', '게스트'),
  assistant: m('Trợ lý', 'Assistant', '도우미'),
  search: m(
    'Tìm khách hàng, cơ hội, báo giá, hồ sơ…',
    'Search customers, opportunities, quotes, records…',
    '고객, 기회, 견적, 기록 검색…',
  ),
  whatsNew: m('Có gì mới', "What's new", '새 소식'),
  signOut: m('Đăng xuất', 'Sign out', '로그아웃'),
}
