import {
  NOTIFICATION_GROUP_LABEL,
  NOTIFICATION_KIND_LABEL,
  type NotificationGroup,
  type NotificationKind,
} from '@pv/contracts'
import { getLang, type Lang } from '@/app/i18n'

/** Vietnamese copy stays in the contract while API search still indexes it.
 *  The reader's language is applied only at the display boundary. */
const GROUP: Record<NotificationGroup, { en: string; ko: string }> = {
  lead: { en: 'Leads', ko: '리드' },
  opportunity: { en: 'Opportunities', ko: '기회' },
  contract: { en: 'Contracts', ko: '계약' },
  'next-step': { en: 'Next steps', ko: '다음 작업' },
  hold: { en: 'On hold', ko: '보류' },
  approval: { en: 'Approvals', ko: '승인' },
  mail: { en: 'Email', ko: '이메일' },
  account: { en: 'Accounts', ko: '계정' },
  campaign: { en: 'Campaigns', ko: '캠페인' },
  kpi: { en: 'KPIs', ko: 'KPI' },
  comm: { en: 'Communications', ko: '연락' },
}

const KIND: Record<NotificationKind, { en: string; ko: string }> = {
  'lead-pooled': { en: 'New lead in the shared pool', ko: '공동 목록에 새 리드가 있습니다' },
  'lead-received': { en: 'A lead was assigned to you', ko: '리드가 배정되었습니다' },
  'lead-removed': { en: 'A lead is no longer assigned to you', ko: '리드 배정이 해제되었습니다' },
  'lead-re-entered': {
    en: 'Your customer contacted us again',
    ko: '담당 고객이 다시 연락했습니다',
  },
  'lead-scan-ready': {
    en: 'Image import is ready to review',
    ko: '이미지 가져오기를 검토할 수 있습니다',
  },
  'lead-scan-committed': { en: 'Image import added leads', ko: '이미지에서 리드를 추가했습니다' },
  'lead-scan-failed': {
    en: 'Image import failed. Try again.',
    ko: '이미지 가져오기에 실패했습니다. 다시 시도하세요.',
  },
  'opportunity-awaiting-accept': {
    en: 'An opportunity is waiting for you to accept',
    ko: '수락 대기 중인 기회가 있습니다',
  },
  'opportunity-lost': { en: 'Your opportunity was stopped', ko: '담당 기회가 중단되었습니다' },
  'opportunity-accepted': {
    en: 'Your opportunity was accepted',
    ko: '담당 기회가 수락되었습니다',
  },
  'opportunity-assigned': {
    en: 'You were added to an opportunity',
    ko: '기회 담당자로 추가되었습니다',
  },
  'opportunity-unassigned': {
    en: 'You were removed from an opportunity',
    ko: '기회 담당에서 제외되었습니다',
  },
  'next-step-assigned': { en: 'A next step was assigned to you', ko: '다음 작업이 배정되었습니다' },
  'next-step-done': {
    en: 'A next step you assigned is complete',
    ko: '배정한 다음 작업이 완료되었습니다',
  },
  'comm-record-late': { en: 'A contact record is overdue', ko: '연락 기록 보완 기한이 지났습니다' },
  'meeting-cancelled': { en: 'Your meeting was cancelled', ko: '회의가 취소되었습니다' },
  'meeting-calendar-failed': {
    en: 'A meeting could not be added to Google Calendar',
    ko: '회의를 Google Calendar에 추가할 수 없습니다',
  },
  'hold-due-soon': { en: 'A follow-up date is coming soon', ko: '후속 연락일이 다가옵니다' },
  'hold-due': { en: 'A follow-up is due today', ko: '오늘 후속 연락이 예정되어 있습니다' },
  'approval-waiting': {
    en: 'A request is waiting for your approval',
    ko: '승인 대기 중인 요청이 있습니다',
  },
  'approval-approved': { en: 'Your request was approved', ko: '요청이 승인되었습니다' },
  'approval-rejected': { en: 'Your request was rejected', ko: '요청이 거절되었습니다' },
  'mail-run-sent': { en: 'Mail run completed', ko: '이메일 발송이 완료되었습니다' },
  'mail-run-cancelled': { en: 'Mail run stopped', ko: '이메일 발송이 중단되었습니다' },
  'mail-failed': { en: 'Email could not be sent', ko: '이메일을 보낼 수 없습니다' },
  'customer-replied': {
    en: 'A customer replied to your email',
    ko: '고객이 이메일에 답장했습니다',
  },
  'access-changed': { en: 'Your access changed', ko: '접근 권한이 변경되었습니다' },
  'password-reset-by-admin': {
    en: 'An administrator reset your password',
    ko: '관리자가 비밀번호를 재설정했습니다',
  },
  'google-link-broken': {
    en: 'Your Google account was disconnected',
    ko: 'Google 계정 연결이 끊어졌습니다',
  },
  'opportunity-stage-moved': {
    en: 'An opportunity moved to a new stage',
    ko: '기회가 다음 단계로 이동했습니다',
  },
  'opportunity-primary-changed': {
    en: 'The main seller for an opportunity changed',
    ko: '기회의 주 영업 담당자가 변경되었습니다',
  },
  'contract-signed': { en: 'A contract was signed', ko: '계약이 체결되었습니다' },
  'quotation-new-round': {
    en: 'An opportunity has a new quote',
    ko: '기회에 새 견적이 있습니다',
  },
  'quotation-superseded': {
    en: 'A pending quote was replaced',
    ko: '대기 중인 견적이 새 견적으로 대체되었습니다',
  },
  'contract-installment-paid': { en: 'A payment was recorded', ko: '대금 수령이 기록되었습니다' },
  'contract-installment-undone': {
    en: 'A recorded payment was reversed',
    ko: '대금 수령 기록이 취소되었습니다',
  },
  'contract-schedule-replaced': {
    en: 'A contract payment schedule changed',
    ko: '계약 대금 일정이 변경되었습니다',
  },
  'contract-condition-done': {
    en: 'A payment condition was completed',
    ko: '지급 조건이 완료되었습니다',
  },
  'campaign-stopped': { en: 'Your campaign stopped', ko: '담당 캠페인이 중단되었습니다' },
  'campaign-finished': { en: 'Your campaign finished', ko: '담당 캠페인이 완료되었습니다' },
  'kpi-target-proposed': {
    en: 'A KPI target is waiting for approval',
    ko: '승인 대기 중인 KPI 목표가 있습니다',
  },
  'kpi-target-agreed': {
    en: 'Your proposed KPI target was approved',
    ko: '제안한 KPI 목표가 승인되었습니다',
  },
  'comm-closed-by-other': {
    en: 'Someone else closed your contact record',
    ko: '다른 사람이 담당 연락 기록을 마감했습니다',
  },
  'lead-nurtured': {
    en: 'Your lead moved to the follow-up group',
    ko: '담당 리드가 후속 관리 그룹으로 이동했습니다',
  },
  'lead-resumed': {
    en: 'Follow-up resumed for your lead',
    ko: '담당 리드의 후속 관리가 재개되었습니다',
  },
  'mail-run-replied': {
    en: 'A recipient replied to a mail run',
    ko: '수신자가 발송 이메일에 답장했습니다',
  },
  'contract-installment-overdue': {
    en: 'A contract payment is overdue',
    ko: '계약 대금 수령 기한이 지났습니다',
  },
  'kpi-target-allocated': {
    en: 'A new target was assigned to you',
    ko: '새 목표가 배정되었습니다',
  },
  'kpi-counter-resolved': {
    en: 'Your target change request was decided',
    ko: '목표 변경 요청이 처리되었습니다',
  },
  'kpi-allocation-returned': {
    en: 'Your target package was returned',
    ko: '제출한 목표 배분안이 반려되었습니다',
  },
  'kpi-allocation-waiting': {
    en: 'A target package is waiting for approval',
    ko: '승인 대기 중인 목표 배분안이 있습니다',
  },
  'kpi-counter-proposed': {
    en: 'A target change request needs your review',
    ko: '검토할 목표 변경 요청이 있습니다',
  },
  'kpi-month-unclosed': {
    en: 'The month ended. KPIs are not closed yet.',
    ko: '월이 끝났지만 KPI가 아직 마감되지 않았습니다',
  },
  'kpi-about-to-miss': { en: 'You may miss your target', ko: '목표에 미달할 수 있습니다' },
  'kpi-about-to-hit': { en: 'You are close to your target', ko: '목표 달성이 가까워졌습니다' },
  'overdue-reason-waiting': {
    en: 'An overdue payment reason needs approval',
    ko: '연체 사유 승인 요청이 있습니다',
  },
  'overdue-reason-decided': {
    en: 'Your overdue payment reason was decided',
    ko: '제출한 연체 사유가 처리되었습니다',
  },
  'kpi-team-share-assigned': {
    en: 'A target was assigned to your team',
    ko: '팀에 목표가 배정되었습니다',
  },
  'contract-terminated': { en: 'A contract was terminated', ko: '계약이 종료되었습니다' },
  'contract-collector-changed': {
    en: 'The payment collector changed',
    ko: '대금 수령 담당자가 변경되었습니다',
  },
  'contract-penalty-changed': {
    en: 'A contract penalty changed',
    ko: '계약 위약금이 변경되었습니다',
  },
  'kpi-stand-in': {
    en: 'You are covering someone else’s KPI work',
    ko: '다른 사람의 KPI 업무를 대신 맡고 있습니다',
  },
  'kpi-assignment-received': {
    en: 'You received a KPI target assignment',
    ko: 'KPI 목표 배정을 받았습니다',
  },
  'kpi-assignment-late': {
    en: 'A KPI target assignment is overdue',
    ko: 'KPI 목표 배정 기한이 지났습니다',
  },
  'kpi-away-declared': {
    en: 'A KPI absence was recorded for you',
    ko: 'KPI 부재 일정이 등록되었습니다',
  },
  'customer-recare-due': { en: 'A customer follow-up is due', ko: '구매 고객 후속 관리일입니다' },
}

export const notificationGroupLabel = (group: NotificationGroup, lang: Lang = getLang()) =>
  lang === 'vi' ? NOTIFICATION_GROUP_LABEL[group] : GROUP[group][lang]

export const notificationKindLabel = (kind: NotificationKind, lang: Lang = getLang()) =>
  lang === 'vi' ? NOTIFICATION_KIND_LABEL[kind] : KIND[kind][lang]
