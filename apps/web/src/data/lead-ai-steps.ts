import { LEAD_AI_JOB_STEPS, type LeadAiJob, type LeadAiJobStepKey } from '@pv/contracts'
import { message, type Message } from '@/app/i18n'

/** The five steps of an AI fill, named once: the tray (`ai-task-tray-host.tsx`)
 *  and the line on the lead form both read them from here. */
export const LEAD_STEP_LABEL: Record<LeadAiJobStepKey, Message> = {
  'read-lead': message('Đọc hồ sơ lead', 'Read the lead profile', '리드 프로필 읽기'),
  'web-search': message('Tìm thông tin trên web', 'Search the web', '웹에서 정보 검색'),
  'tax-lookup': message('Tra cứu mã số thuế', 'Look up the tax ID', '세금번호 조회'),
  'dup-check': message('Kiểm tra trùng công ty', 'Check for duplicate companies', '중복 회사 확인'),
  write: message('Điền vào lead', 'Fill in the lead', '리드에 입력'),
}

export const LEAD_STEP_TOTAL = LEAD_AI_JOB_STEPS.length

/** The step a moving job is on, counted from 1 and never past the last. */
export const stepAt = (job: Pick<LeadAiJob, 'step'>) => Math.min(job.step + 1, LEAD_STEP_TOTAL)

export const stepLabelOf = (job: Pick<LeadAiJob, 'step'>) =>
  LEAD_STEP_LABEL[LEAD_AI_JOB_STEPS[stepAt(job) - 1]!]
