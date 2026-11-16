import {
  KPI_FUNNEL_STEP_LABEL,
  KPI_METRIC_HOW,
  KPI_METRIC_LABEL,
  type KpiAckState,
  type KpiAllocationStatus,
  type KpiFunnelStep,
  type KpiLayer,
  type KpiMetricKey,
  type KpiVerdict,
  type RoleId,
} from '@pv/contracts'
import { message, translate, type Lang, type Message } from '@/app/i18n'

/** Vietnamese comes from @pv/contracts so the server's approval sentence and
 *  this screen print one word; only English and Korean live here. */
const METRIC: Record<KpiMetricKey, Message> = {
  'leads-sourced': message(KPI_METRIC_LABEL['leads-sourced'], 'Leads sourced', '유입 리드'),
  'lead-to-opportunity-rate': message(
    KPI_METRIC_LABEL['lead-to-opportunity-rate'],
    'Lead-to-opportunity rate',
    '리드의 기회 전환율',
  ),
  'sourced-signed-value': message(
    KPI_METRIC_LABEL['sourced-signed-value'],
    'Signed value from sourced leads',
    '유입 리드 계약 금액',
  ),
  'opportunities-opened': message(
    KPI_METRIC_LABEL['opportunities-opened'],
    'Opportunities opened',
    '생성된 기회',
  ),
  'first-response-hours': message(
    KPI_METRIC_LABEL['first-response-hours'],
    'First lead response time',
    '최초 리드 응답 시간',
  ),
  'opportunity-accept-rate': message(
    KPI_METRIC_LABEL['opportunity-accept-rate'],
    'Opportunity acceptance rate',
    '기회 수락률',
  ),
  'demos-joined': message(KPI_METRIC_LABEL['demos-joined'], 'Demos attended', '참석한 데모'),
  'signed-value': message(
    KPI_METRIC_LABEL['signed-value'],
    'Signed contract value',
    '체결 계약 금액',
  ),
  'win-rate': message(KPI_METRIC_LABEL['win-rate'], 'Win rate', '수주율'),
  'debriefs-closed': message(
    KPI_METRIC_LABEL['debriefs-closed'],
    'Debriefs completed',
    '완료된 상담 기록',
  ),
  'overdue-receivables': message(
    KPI_METRIC_LABEL['overdue-receivables'],
    'Overdue receivables',
    '미수 연체 금액',
  ),
  'accept-lag-days': message(
    KPI_METRIC_LABEL['accept-lag-days'],
    'Opportunity acceptance time',
    '기회 수락 소요 시간',
  ),
  'collected-value': message(KPI_METRIC_LABEL['collected-value'], 'Collected value', '수금액'),
  'approval-turnaround-hours': message(
    KPI_METRIC_LABEL['approval-turnaround-hours'],
    'Approval turnaround time',
    '승인 소요 시간',
  ),
  'quotes-sent': message(KPI_METRIC_LABEL['quotes-sent'], 'Quotes sent', '발송한 견적'),
  'sales-cycle-days': message(
    KPI_METRIC_LABEL['sales-cycle-days'],
    'Median sales cycle',
    '기회 체결 소요 기간',
  ),
  'mql-reached': message(KPI_METRIC_LABEL['mql-reached'], 'MQLs reached', 'MQL 달성'),
  'lead-to-mql-rate': message(
    KPI_METRIC_LABEL['lead-to-mql-rate'],
    'Lead-to-MQL rate',
    '리드의 MQL 전환율',
  ),
  'cost-per-mql': message(KPI_METRIC_LABEL['cost-per-mql'], 'Cost per MQL', 'MQL당 비용'),
  'presales-signed-value': message(
    KPI_METRIC_LABEL['presales-signed-value'],
    'Signed value',
    '체결 금액',
  ),
  'on-time-collection-rate': message(
    KPI_METRIC_LABEL['on-time-collection-rate'],
    'On-time collection',
    '기한 내 수금',
  ),
  'solution-days': message(
    KPI_METRIC_LABEL['solution-days'],
    'Time to send solution',
    '솔루션 발송 소요 시간',
  ),
}

/** How each metric is counted, one sentence; same single Vietnamese source. */
const METRIC_HOW: Record<KpiMetricKey, Message> = {
  'leads-sourced': message(
    KPI_METRIC_HOW['leads-sourced'],
    'New leads created this month that you sourced.',
    '이번 달 새로 생성된 리드 중 직접 유입한 리드 수입니다.',
  ),
  'lead-to-opportunity-rate': message(
    KPI_METRIC_HOW['lead-to-opportunity-rate'],
    'Of the leads you sourced this month, the share that became opportunities.',
    '이번 달 유입한 리드 중 기회로 전환된 비율입니다.',
  ),
  'sourced-signed-value': message(
    KPI_METRIC_HOW['sourced-signed-value'],
    'Value of contracts signed from the leads you sourced, by month of signing.',
    '유입한 리드에서 체결된 계약 금액으로, 체결 월 기준입니다.',
  ),
  'opportunities-opened': message(
    KPI_METRIC_HOW['opportunities-opened'],
    'Opportunities you opened this month.',
    '이번 달 직접 생성한 기회 수입니다.',
  ),
  'first-response-hours': message(
    KPI_METRIC_HOW['first-response-hours'],
    'Hours from a lead reaching you to your first conversation with the customer; leads not yet answered still count.',
    '리드를 받은 때부터 고객과 첫 상담까지의 시간입니다. 아직 응답하지 않은 리드도 포함됩니다.',
  ),
  'opportunity-accept-rate': message(
    KPI_METRIC_HOW['opportunity-accept-rate'],
    'Of the opportunities you opened this month, the share that was accepted.',
    '이번 달 생성한 기회 중 수락된 비율입니다.',
  ),
  'demos-joined': message(
    KPI_METRIC_HOW['demos-joined'],
    'Demos you attended this month.',
    '이번 달 참석한 데모 수입니다.',
  ),
  'signed-value': message(
    KPI_METRIC_HOW['signed-value'],
    'Total value of contracts you signed this month, by your share where a contract is split.',
    '이번 달 체결한 계약 금액의 합계이며, 분할 계약은 내 몫 기준입니다.',
  ),
  'win-rate': message(
    KPI_METRIC_HOW['win-rate'],
    'Of the opportunities closed this month, the share that ended in a signed contract; a terminated contract is not a win.',
    '이번 달 종료된 기회 중 계약이 체결된 비율이며, 해지된 계약은 수주로 보지 않습니다.',
  ),
  'debriefs-closed': message(
    KPI_METRIC_HOW['debriefs-closed'],
    'Conversations you finished recording this month; unreachable or cancelled ones do not count.',
    '이번 달 기록을 마친 상담 수이며, 연락 불가나 취소된 상담은 제외됩니다.',
  ),
  'overdue-receivables': message(
    KPI_METRIC_HOW['overdue-receivables'],
    'Total of payments past due and not yet collected, as of the day you are viewing.',
    '조회 시점 기준, 기한이 지났으나 아직 수금하지 못한 결제 금액의 합계입니다.',
  ),
  'accept-lag-days': message(
    KPI_METRIC_HOW['accept-lag-days'],
    'Days from an opportunity being opened to you accepting it, for those you accepted this month.',
    '이번 달 수락한 기회에 대해, 기회가 생성된 때부터 수락까지 걸린 일수입니다.',
  ),
  'collected-value': message(
    KPI_METRIC_HOW['collected-value'],
    'Total collected this month, less refunds when a contract is terminated.',
    '이번 달 수금한 금액의 합계에서 계약 해지 시 환불액을 뺀 값입니다.',
  ),
  'approval-turnaround-hours': message(
    KPI_METRIC_HOW['approval-turnaround-hours'],
    'Hours from a request being made to it being approved or declined, for requests handled this month.',
    '이번 달 처리한 요청에 대해, 요청부터 승인 또는 거절까지 걸린 시간입니다.',
  ),
  'quotes-sent': message(
    KPI_METRIC_HOW['quotes-sent'],
    'Quotes you sent this month; each send counts as one quote.',
    '이번 달 발송한 견적 수이며, 발송할 때마다 한 건으로 셉니다.',
  ),
  'sales-cycle-days': message(
    KPI_METRIC_HOW['sales-cycle-days'],
    'Days from opening an opportunity to its first signed contract, for contracts signed this month.',
    '이번 달 체결된 계약에 대해, 기회 생성부터 첫 계약 체결까지 걸린 일수입니다.',
  ),
  'mql-reached': message(
    KPI_METRIC_HOW['mql-reached'],
    'Leads you brought in that first reached MQL level this month, including leads created already at MQL.',
    '이번 달 내가 유입한 리드 중 처음 MQL 단계에 오른 수이며, 처음부터 MQL 단계로 생성된 리드도 포함합니다.',
  ),
  'lead-to-mql-rate': message(
    KPI_METRIC_HOW['lead-to-mql-rate'],
    'MQLs this month ÷ leads you brought in this month.',
    '이번 달 MQL 수 ÷ 이번 달 내가 유입한 리드 수입니다.',
  ),
  'cost-per-mql': message(
    KPI_METRIC_HOW['cost-per-mql'],
    'Spend this month on the sources you manage ÷ your MQLs. Lower is better.',
    '이번 달 담당 소스에 지출한 금액 ÷ 내 MQL 수입니다. 낮을수록 좋습니다.',
  ),
  'presales-signed-value': message(
    KPI_METRIC_HOW['presales-signed-value'],
    'Value of contracts signed this month from opportunities you built the solution for, at full value.',
    '이번 달 내가 솔루션을 담당한 기회에서 체결된 계약 금액이며, 전액 기준입니다.',
  ),
  'on-time-collection-rate': message(
    KPI_METRIC_HOW['on-time-collection-rate'],
    'Money from payments due this month collected on time ÷ money due, on contracts you built the solution for.',
    '이번 달 도래한 결제 중 기한 내 수금한 금액 ÷ 도래한 금액이며, 내가 솔루션을 담당한 계약 기준입니다.',
  ),
  'solution-days': message(
    KPI_METRIC_HOW['solution-days'],
    'Days from the first site survey to sending the solution, median for this month.',
    '첫 현장 조사부터 솔루션 발송까지의 일수이며, 이번 달 중앙값입니다.',
  ),
}

/** Vietnamese from contracts, so the approval sentence and the screens agree. */
const FUNNEL: Record<KpiFunnelStep, Message> = {
  lead: message(KPI_FUNNEL_STEP_LABEL.lead, 'New leads', '신규 리드'),
  mql: message(KPI_FUNNEL_STEP_LABEL.mql, 'MQL', 'MQL'),
  sql: message(KPI_FUNNEL_STEP_LABEL.sql, 'SQL', 'SQL'),
  opportunity: message(KPI_FUNNEL_STEP_LABEL.opportunity, 'Opportunities', '기회'),
  'lead-received': message(KPI_FUNNEL_STEP_LABEL['lead-received'], 'Leads received', '수신 리드'),
  contacted: message(KPI_FUNNEL_STEP_LABEL.contacted, 'Contacted', '연락 완료'),
  accepted: message(KPI_FUNNEL_STEP_LABEL.accepted, 'Accepted by Sale', '영업 수락'),
  met: message(KPI_FUNNEL_STEP_LABEL.met, 'Met, surveyed', '미팅·현장 조사'),
  solution: message(KPI_FUNNEL_STEP_LABEL.solution, 'Solution, demo', '솔루션·데모'),
  quotation: message(KPI_FUNNEL_STEP_LABEL.quotation, 'Quotation', '견적'),
  signed: message(KPI_FUNNEL_STEP_LABEL.signed, 'Contract signed', '계약 체결'),
  new: message(KPI_FUNNEL_STEP_LABEL.new, 'Created', '생성'),
  assigned: message(KPI_FUNNEL_STEP_LABEL.assigned, 'Assigning', '배정 중'),
  engaged: message(KPI_FUNNEL_STEP_LABEL.engaged, 'In care', '관리 중'),
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
export const kpiFunnelStepText = (step: KpiFunnelStep, lang?: Lang) => translate(FUNNEL[step], lang)
export const kpiLayerText = (layer: KpiLayer, lang?: Lang) => translate(LAYER[layer], lang)
export const kpiRoleText = (role: RoleId, lang?: Lang) => translate(ROLE[role], lang)
export const kpiVerdictText = (verdict: KpiVerdict, lang?: Lang) =>
  translate(VERDICT[verdict], lang)
export const kpiPackageText = (status: KpiAllocationStatus, lang?: Lang) =>
  translate(PACKAGE[status], lang)
export const kpiAckText = (state: KpiAckState, lang?: Lang) => translate(ACK[state], lang)
