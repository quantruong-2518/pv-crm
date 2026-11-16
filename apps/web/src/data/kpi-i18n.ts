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

/** How each metric is counted, one sentence; the vi side is `KPI_METRIC_HOW` in @pv/contracts. */
const METRIC_HOW: Record<KpiMetricKey, Message> = {
  'leads-sourced': message(
    'Số lead mới tạo trong tháng mà bạn là người đưa về.',
    'New leads created this month that you sourced.',
    '이번 달 새로 생성된 리드 중 직접 유입한 리드 수입니다.',
  ),
  'lead-to-opportunity-rate': message(
    'Trong các lead bạn đưa về trong tháng, tỷ lệ đã thành cơ hội.',
    'Of the leads you sourced this month, the share that became opportunities.',
    '이번 달 유입한 리드 중 기회로 전환된 비율입니다.',
  ),
  'sourced-signed-value': message(
    'Giá trị hợp đồng đã ký từ các lead bạn đưa về, tính theo tháng ký.',
    'Value of contracts signed from the leads you sourced, by month of signing.',
    '유입한 리드에서 체결된 계약 금액으로, 체결 월 기준입니다.',
  ),
  'opportunities-opened': message(
    'Số cơ hội bạn mở trong tháng.',
    'Opportunities you opened this month.',
    '이번 달 직접 생성한 기회 수입니다.',
  ),
  'first-response-hours': message(
    'Số giờ từ lúc lead về tay bạn đến lần trao đổi đầu tiên với khách; lead chưa trả lời vẫn tính.',
    'Hours from a lead reaching you to your first conversation with the customer; leads not yet answered still count.',
    '리드를 받은 때부터 고객과 첫 상담까지의 시간입니다. 아직 응답하지 않은 리드도 포함됩니다.',
  ),
  'opportunity-accept-rate': message(
    'Trong các cơ hội bạn mở trong tháng, tỷ lệ đã được nhận.',
    'Of the opportunities you opened this month, the share that was accepted.',
    '이번 달 생성한 기회 중 수락된 비율입니다.',
  ),
  'demos-joined': message(
    'Số buổi demo bạn có mặt trong tháng.',
    'Demos you attended this month.',
    '이번 달 참석한 데모 수입니다.',
  ),
  'signed-value': message(
    'Tổng giá trị hợp đồng bạn ký trong tháng, theo phần được chia nếu hợp đồng chia công.',
    'Total value of contracts you signed this month, by your share where a contract is split.',
    '이번 달 체결한 계약 금액의 합계이며, 분할 계약은 내 몫 기준입니다.',
  ),
  'win-rate': message(
    'Trong các cơ hội đã chốt trong tháng, tỷ lệ ký được hợp đồng; hợp đồng đã chấm dứt không tính là thắng.',
    'Of the opportunities closed this month, the share that ended in a signed contract; a terminated contract is not a win.',
    '이번 달 종료된 기회 중 계약이 체결된 비율이며, 해지된 계약은 수주로 보지 않습니다.',
  ),
  'debriefs-closed': message(
    'Số cuộc trao đổi bạn ghi nhận xong trong tháng; cuộc không liên lạc được hoặc đã huỷ không tính.',
    'Conversations you finished recording this month; unreachable or cancelled ones do not count.',
    '이번 달 기록을 마친 상담 수이며, 연락 불가나 취소된 상담은 제외됩니다.',
  ),
  'overdue-receivables': message(
    'Tổng tiền các đợt thanh toán đã quá hạn mà chưa thu, tính tại ngày đang xem.',
    'Total of payments past due and not yet collected, as of the day you are viewing.',
    '조회 시점 기준, 기한이 지났으나 아직 수금하지 못한 결제 금액의 합계입니다.',
  ),
  'accept-lag-days': message(
    'Số ngày từ lúc cơ hội được mở đến lúc bạn nhận, cho các cơ hội bạn nhận trong tháng.',
    'Days from an opportunity being opened to you accepting it, for those you accepted this month.',
    '이번 달 수락한 기회에 대해, 기회가 생성된 때부터 수락까지 걸린 일수입니다.',
  ),
  'collected-value': message(
    'Tổng tiền đã thu trong tháng, trừ tiền hoàn lại khi hợp đồng chấm dứt.',
    'Total collected this month, less refunds when a contract is terminated.',
    '이번 달 수금한 금액의 합계에서 계약 해지 시 환불액을 뺀 값입니다.',
  ),
  'approval-turnaround-hours': message(
    'Số giờ từ lúc có yêu cầu đến lúc được duyệt hoặc từ chối, cho các yêu cầu xử lý trong tháng.',
    'Hours from a request being made to it being approved or declined, for requests handled this month.',
    '이번 달 처리한 요청에 대해, 요청부터 승인 또는 거절까지 걸린 시간입니다.',
  ),
  'quotes-sent': message(
    'Số báo giá bạn đã gửi trong tháng; mỗi lần gửi tính một báo giá.',
    'Quotes you sent this month; each send counts as one quote.',
    '이번 달 발송한 견적 수이며, 발송할 때마다 한 건으로 셉니다.',
  ),
  'sales-cycle-days': message(
    'Số ngày từ lúc mở cơ hội đến lúc ký hợp đồng đầu tiên, cho các hợp đồng ký trong tháng.',
    'Days from opening an opportunity to its first signed contract, for contracts signed this month.',
    '이번 달 체결된 계약에 대해, 기회 생성부터 첫 계약 체결까지 걸린 일수입니다.',
  ),
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
export const metricHowOf = (key: KpiMetricKey, lang?: Lang) => translate(METRIC_HOW[key], lang)
export const kpiLayerText = (layer: KpiLayer, lang?: Lang) => translate(LAYER[layer], lang)
export const kpiRoleText = (role: RoleId, lang?: Lang) => translate(ROLE[role], lang)
export const kpiVerdictText = (verdict: KpiVerdict, lang?: Lang) =>
  translate(VERDICT[verdict], lang)
export const kpiPackageText = (status: KpiAllocationStatus, lang?: Lang) =>
  translate(PACKAGE[status], lang)
export const kpiAckText = (state: KpiAckState, lang?: Lang) => translate(ACK[state], lang)
