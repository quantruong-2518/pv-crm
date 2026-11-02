import type { CampaignState } from '@pv/contracts'
import { message, translate, type Lang } from '@/app/i18n'

const STATE = {
  DRAFT: message('Nháp', 'Draft', '초안'),
  RUNNING: message('Đang chạy', 'Running', '진행 중'),
  STOPPED: message('Đã dừng', 'Stopped', '중단됨'),
  DONE: message('Đã hoàn tất', 'Completed', '완료'),
} satisfies Record<CampaignState, ReturnType<typeof message>>

export const campaignStateText = (state: CampaignState, lang: Lang) => translate(STATE[state], lang)
