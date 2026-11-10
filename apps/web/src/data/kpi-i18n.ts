import type {
  KpiAckState,
  KpiAllocationStatus,
  KpiLayer,
  KpiMetricKey,
  KpiVerdict,
  RoleId,
} from '@pv/contracts'
import { message, translate, type Lang, type Message } from '@/app/i18n'

const METRIC: Record<KpiMetricKey, Message> = {
  'leads-sourced': message('Lead đưa về', 'Leads sourced', '유입 리드'),
  'lead-to-opportunity-rate': message(
    'Tỷ lệ lead thành cơ hội',
    'Lead-to-opportunity rate',
    '리드의 기회 전환율',
  ),
  'sourced-signed-value': message(
    'Giá trị ký từ lead của mình',
    'Signed value from sourced leads',
    '유입 리드 계약 금액',
  ),
  'opportunities-opened': message('Cơ hội đã mở', 'Opportunities opened', '생성된 기회'),
  'first-response-hours': message(
    'Thời gian phản hồi lead đầu tiên',
    'First lead response time',
    '최초 리드 응답 시간',
  ),
  'opportunity-accept-rate': message(
    'Tỷ lệ cơ hội được nhận',
    'Opportunity acceptance rate',
    '기회 수락률',
  ),
  'demos-joined': message('Buổi demo đã tham gia', 'Demos attended', '참석한 데모'),
  'signed-value': message('Giá trị hợp đồng đã ký', 'Signed contract value', '체결 계약 금액'),
  'win-rate': message('Tỷ lệ thắng', 'Win rate', '수주율'),
  'debriefs-closed': message('Trao đổi đã ghi nhận xong', 'Debriefs completed', '완료된 상담 기록'),
  'overdue-receivables': message('Tiền quá hạn chưa thu', 'Overdue receivables', '미수 연체 금액'),
  'accept-lag-days': message(
    'Thời gian nhận cơ hội',
    'Opportunity acceptance time',
    '기회 수락 소요 시간',
  ),
  'collected-value': message('Tiền đã thu', 'Collected value', '수금액'),
  'approval-turnaround-hours': message(
    'Thời gian duyệt',
    'Approval turnaround time',
    '승인 소요 시간',
  ),
  'quotes-sent': message('Báo giá đã gửi', 'Quotes sent', '발송한 견적'),
  'sales-cycle-days': message('Thời gian chốt cơ hội', 'Median sales cycle', '기회 체결 소요 기간'),
}

const LAYER: Record<KpiLayer, Message> = {
  activity: message('Hành động', 'Activity', '활동'),
  conversion: message('Chuyển đổi', 'Conversion', '전환'),
  result: message('Kết quả', 'Result', '결과'),
  guardrail: message('Giới hạn phải giữ', 'Guardrail', '준수 기준'),
}

const ROLE: Record<RoleId, Message> = {
  director: message('Giám đốc', 'Director', '이사'),
  'head-of-sales': message('Trưởng phòng Kinh doanh', 'Head of Sales', '영업 부서장'),
  marketing: message('Marketing', 'Marketing', '마케팅'),
  bd: message('BD', 'Business development', '사업 개발'),
  presales: message('Presales', 'Presales', '프리세일즈'),
  sale: message('Sale', 'Sales', '영업'),
  'account-executive': message('Account Executive', 'Account executive', '어카운트 매니저'),
}

const VERDICT: Record<KpiVerdict, Message> = {
  'no-data': message('Chưa có dữ liệu', 'No data', '데이터 없음'),
  unset: message('Chưa đặt chỉ tiêu', 'Target not set', '목표 미설정'),
  met: message('Đạt', 'Met', '달성'),
  'on-track': message('Đúng tiến độ', 'On track', '진행 중'),
  behind: message('Chậm tiến độ', 'Behind', '지연'),
  missed: message('Không đạt', 'Missed', '미달'),
}

const PACKAGE: Record<KpiAllocationStatus, Message> = {
  draft: message('Bản nháp', 'Draft', '초안'),
  submitted: message('Chờ duyệt', 'Pending review', '검토 대기'),
  returned: message('Bị trả lại', 'Returned', '반려됨'),
  agreed: message('Đã duyệt', 'Approved', '승인됨'),
  superseded: message('Đang áp dụng', 'Current', '현재 적용 중'),
}

const ACK: Record<KpiAckState, Message> = {
  pending: message('Chưa xác nhận', 'Not acknowledged', '미확인'),
  countered: message('Xin đổi mức', 'Change requested', '변경 요청'),
  acknowledged: message('Đã xác nhận', 'Acknowledged', '확인됨'),
  lapsed: message('Nhận mặc định', 'Default applied', '기본값 적용'),
}

export const kpiMetricText = (key: KpiMetricKey, lang?: Lang) => translate(METRIC[key], lang)
export const kpiLayerText = (layer: KpiLayer, lang?: Lang) => translate(LAYER[layer], lang)
export const kpiRoleText = (role: RoleId, lang?: Lang) => translate(ROLE[role], lang)
export const kpiVerdictText = (verdict: KpiVerdict, lang?: Lang) =>
  translate(VERDICT[verdict], lang)
export const kpiPackageText = (status: KpiAllocationStatus, lang?: Lang) =>
  translate(PACKAGE[status], lang)
export const kpiAckText = (state: KpiAckState, lang?: Lang) => translate(ACK[state], lang)
