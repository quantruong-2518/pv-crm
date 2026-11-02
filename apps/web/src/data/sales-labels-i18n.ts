/* i18n-ignore-file: tuple keys below are lookup keys, each paired with its own message() */
import {
  LEAD_STATE_LABEL,
  OPPORTUNITY_CONTACT_ROLE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STATE_LABEL,
  OPPORTUNITY_MILESTONE_LABEL,
  SOURCE_KIND_LABEL,
  type LeadMotion,
  type LeadSource,
  type LeadState,
  type LeadSourceKind,
  type OpportunityContactRole,
  type OpportunityMilestoneKind,
  type OpportunityStatus,
  type StageKey,
} from '@pv/contracts'
import { message, translate, type Lang, type Message } from '@/app/i18n'

const LEAD_STATE: Record<LeadState, Message> = {
  new: message(LEAD_STATE_LABEL.new, 'New', '신규'),
  assigned: message(LEAD_STATE_LABEL.assigned, 'Assigned', '담당자 배정됨'),
  working: message(LEAD_STATE_LABEL.working, 'In follow-up', '후속 연락 중'),
  nurturing: message(LEAD_STATE_LABEL.nurturing, 'Nurturing', '육성 대기'),
  converted: message(LEAD_STATE_LABEL.converted, 'Converted to opportunity', '기회로 전환됨'),
}

const STAGE: Record<StageKey, Message> = {
  new: message(OPPORTUNITY_STAGE_LABEL.new, 'New', '신규'),
  assigned: message(OPPORTUNITY_STAGE_LABEL.assigned, 'Assigning', '담당자 배정 중'),
  engaged: message(OPPORTUNITY_STAGE_LABEL.engaged, 'In follow-up', '후속 연락 중'),
  quotation: message(OPPORTUNITY_STAGE_LABEL.quotation, 'Quotation', '견적'),
}

const OPPORTUNITY_STATE: Record<OpportunityStatus, Message> = {
  open: message(OPPORTUNITY_STATE_LABEL.open, 'Open', '진행 중'),
  lost: message(OPPORTUNITY_STATE_LABEL.lost, 'Closed', '종료'),
  won: message(OPPORTUNITY_STATE_LABEL.won, 'Contract signed', '계약 체결'),
  terminated: message(OPPORTUNITY_STATE_LABEL.terminated, 'Terminated', '해지됨'),
}

const CONTACT_ROLE: Record<OpportunityContactRole, Message> = {
  'decision-maker': message(
    OPPORTUNITY_CONTACT_ROLE_LABEL['decision-maker'],
    'Decision maker',
    '의사 결정자',
  ),
  user: message(OPPORTUNITY_CONTACT_ROLE_LABEL.user, 'User', '사용자'),
  influencer: message(OPPORTUNITY_CONTACT_ROLE_LABEL.influencer, 'Influencer', '영향력자'),
}

const SOURCE_KIND: Record<LeadSourceKind, Message> = {
  MANUAL: message(SOURCE_KIND_LABEL.MANUAL, 'Manual entry', '직접 입력'),
  IMPORT: message(SOURCE_KIND_LABEL.IMPORT, 'Bulk import', '일괄 가져오기'),
  APOLLO: message(SOURCE_KIND_LABEL.APOLLO, 'Apollo', 'Apollo'),
  LANDING_PAGE: message(SOURCE_KIND_LABEL.LANDING_PAGE, 'Website landing page', '웹 랜딩 페이지'),
  SCAN: message(SOURCE_KIND_LABEL.SCAN, 'Image scan', '이미지 스캔'),
}

const MILESTONE: Record<OpportunityMilestoneKind, Message> = {
  sample: message(OPPORTUNITY_MILESTONE_LABEL.sample, 'Sample', '샘플'),
  poc: message(OPPORTUNITY_MILESTONE_LABEL.poc, 'POC', 'POC'),
  demo: message(OPPORTUNITY_MILESTONE_LABEL.demo, 'Demo', '데모'),
  'site-visit': message(OPPORTUNITY_MILESTONE_LABEL['site-visit'], 'Site visit', '현장 방문'),
  quotation: message(OPPORTUNITY_MILESTONE_LABEL.quotation, 'Quotation', '견적'),
}

const MOTION: Record<LeadMotion, Message> = {
  INBOUND: message('Khách chủ động', 'Inbound', '인바운드'),
  OUTBOUND: message('Chủ động tiếp cận', 'Outbound', '아웃바운드'),
  EVENT: message('Sự kiện', 'Event', '이벤트'),
  REFERRAL: message('Được giới thiệu', 'Referral', '소개'),
  PARTNER: message('Đối tác', 'Partner', '파트너'),
  RECYCLE: message('Chăm sóc lại', 'Recycled', '재접촉'),
}

const byVietnameseLabel = new Map<string, Message>([
  ...Object.values(LEAD_STATE).map((copy) => [copy.vi, copy] as const),
  ...Object.values(STAGE).map((copy) => [copy.vi, copy] as const),
  ...Object.values(OPPORTUNITY_STATE).map((copy) => [copy.vi, copy] as const),
  ...Object.values(CONTACT_ROLE).map((copy) => [copy.vi, copy] as const),
  ...Object.values(SOURCE_KIND).map((copy) => [copy.vi, copy] as const),
  ...Object.values(MILESTONE).map((copy) => [copy.vi, copy] as const),
  ['Đã thu', message('Đã thu', 'Collected', '수납 완료')],
  ['Chưa tới', message('Chưa tới', 'Upcoming', '예정')],
  ['Gần hạn', message('Gần hạn', 'Due soon', '기한 임박')],
  ['Đến hạn', message('Đến hạn', 'Due', '기한')],
  ['Quá hạn', message('Quá hạn', 'Overdue', '기한 초과')],
  ['Quá hạn lâu', message('Quá hạn lâu', 'Long overdue', '장기 연체')],
  ['Chờ duyệt ký', message('Chờ duyệt ký', 'Pending signature approval', '서명 승인 대기')],
  ['Giai đoạn', message('Giai đoạn', 'Stage', '단계')],
  ['Cơ hội đã kết thúc', message('Cơ hội đã kết thúc', 'Opportunity closed', '기회 종료')],
])

export const leadStateLabel = (state: LeadState, lang: Lang) => translate(LEAD_STATE[state], lang)
export const opportunityStageLabel = (stage: StageKey, lang: Lang) => translate(STAGE[stage], lang)
export const opportunityStatusLabel = (state: OpportunityStatus, lang: Lang) =>
  translate(OPPORTUNITY_STATE[state], lang)
export const opportunityContactRoleLabel = (role: OpportunityContactRole, lang: Lang) =>
  translate(CONTACT_ROLE[role], lang)
export const opportunityMilestoneLabel = (kind: OpportunityMilestoneKind, lang: Lang) =>
  translate(MILESTONE[kind], lang)
export const opportunityContactRoleUnknown = (lang: Lang) =>
  translate(message('Chưa nêu vai', 'Role not specified', '역할 미지정'), lang)
export const leadSourceKindLabel = (kind: LeadSourceKind | undefined, lang: Lang) =>
  kind
    ? translate(SOURCE_KIND[kind], lang)
    : translate(message('Chưa rõ nguồn', 'Unknown source', '출처 미상'), lang)
export const leadMotionLabel = (motion: LeadMotion, lang: Lang) => translate(MOTION[motion], lang)

/** Translate known product enum labels while leaving configured/user names intact. */
export const salesLabel = (label: string, lang: Lang) => {
  const copy = byVietnameseLabel.get(label)
  return copy ? translate(copy, lang) : label
}

/** Origin names and campaign names are user-authored data; preserve them verbatim. */
export const leadOriginLabel = (name: string | undefined, lang: Lang) =>
  name ?? translate(message('Chưa rõ nguồn', 'Unknown origin', '출처 미상'), lang)

export const campaignSourceLabel = (source: LeadSource, lang: Lang) =>
  source.campaignName ??
  translate(
    source.campaignId
      ? message('Chiến dịch không tra được', 'Campaign unavailable', '캠페인을 찾을 수 없음')
      : message('Không thuộc chiến dịch', 'No campaign', '캠페인 없음'),
    lang,
  )
