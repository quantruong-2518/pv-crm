import { message, translate } from '@/app/i18n'
import type { AreaKey, SectionId } from './sales-config-model'

const AREAS: Record<AreaKey, [string, string, string]> = {
  frame: ['Khung hành trình', 'Journey framework', '영업 여정 프레임'],
  intake: ['Tiếp nhận lead', 'Lead intake', '리드 접수'],
  assign: ['Phân công', 'Assignment', '담당 배정'],
  care: ['Chăm sóc và liên hệ', 'Follow-up and contact', '후속 관리 및 접점'],
  deal: ['Cơ hội', 'Opportunities', '영업 기회'],
  kpi: ['KPI', 'KPIs', 'KPI'],
}

const SECTIONS: Record<SectionId, [string, string, string]> = {
  'step-frame': ['Bước tiếp theo theo từng trạng thái', 'Next step by status', '상태별 다음 단계'],
  'tier-limits': ['Hạn từng bậc lead', 'Lead tier deadlines', '리드 등급별 기한'],
  motions: ['Phương án tiếp cận', 'Outreach motions', '접근 방식'],
  'motion-policy': ['Hạn liên hệ lần đầu', 'First contact deadline', '첫 접점 기한'],
  industries: ['Nhóm ngành và ngành', 'Industry groups and industries', '산업 분야 및 업종'],
  'stop-reasons': ['Lý do dừng chăm sóc', 'Lead stop reasons', '리드 중단 사유'],
  'waiting-labels': ['Nhãn nhóm chờ', 'Waiting group labels', '대기 그룹 라벨'],
  'comm-criteria': ['Câu hỏi đánh giá liên hệ', 'Contact assessment questions', '접점 평가 질문'],
  'step-kinds': ['Loại bước tiếp theo', 'Next step types', '다음 단계 유형'],
  'recare-cycles': [
    'Kỳ chăm sóc khách đã mua',
    'Customer follow-up cycles',
    '구매 고객 후속 관리 주기',
  ],
  freshness: ['Hoạt động cuối', 'Last activity', '최근 활동'],
  'care-reasons': ['Lý do dừng cơ hội', 'Opportunity stop reasons', '영업 기회 중단 사유'],
  'quote-reasons': ['Lý do báo giá lại', 'Quote revision reasons', '견적 수정 사유'],
  products: ['Sản phẩm/dịch vụ', 'Products and services', '제품 및 서비스'],
  'contract-kinds': ['Loại hợp đồng', 'Contract types', '계약 유형'],
  'kpi-metrics': ['Chỉ số theo vai trò', 'Metrics by role', '역할별 지표'],
  'kpi-alert': ['Ngưỡng cảnh báo', 'Alert thresholds', '경고 기준'],
  'kpi-teams': ['Phòng ban & nhóm', 'Departments and teams', '부서 및 팀'],
}

export const areaCopy = (key: AreaKey) => message(...AREAS[key])
export const sectionCopy = (id: SectionId) => message(...SECTIONS[id])

/** The success toast of every send on the screen. It names no approver: who
 *  approves is the server's chain, not a role this screen may print. */
export const SENT = 'Đã gửi đề nghị · chờ duyệt.'
export const sentCopy = () =>
  translate(message(SENT, 'Proposal sent · awaiting approval.', '제안 전송 완료 · 승인 대기 중'))
