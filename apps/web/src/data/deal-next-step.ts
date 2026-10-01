import type { StageKey } from '@pv/contracts'
import type { StepSubject } from '@/data/next-step'

/** Module 3 · a deal's next step as both of its doors build it — the profile
 *  card and the journey drawer — so the two never offer different chips or
 *  different doers for the same deal.
 *
 *  The chips are display data per column: what usually follows at that column.
 *  A column without a list (`new`) offers none — nothing is recorded before a
 *  head accepts the deal. */
export const DEAL_STEP_SUGGESTIONS: Partial<Record<StageKey, readonly string[]>> = {
  assigned: ['Gọi khách chốt nhu cầu', 'Hẹn gửi sample', 'Hẹn demo', 'Hẹn khảo sát nhà máy'],
  engaged: ['Theo dõi phản hồi sample', 'Hẹn POC', 'Hẹn demo', 'Gửi báo giá'],
  quotation: ['Theo dõi báo giá', 'Đàm phán điều khoản', 'Đề nghị ký'],
}

/** `canAssign` stays on for deals: the door names any doer, and the default is
 *  the row's server-computed holder (ADR 0069 §10, 0071 §5). */
export function dealStepSubject(
  code: string,
  holder: StepSubject['holder'],
  stage: StageKey | null,
): StepSubject {
  return {
    kind: 'opportunity',
    code,
    holder,
    canAssign: true,
    holderHint: 'Người giữ cơ hội.',
    noHolder: 'Cơ hội chưa có ai đứng đơn hay nhận PIC.',
    suggestions: (stage && DEAL_STEP_SUGGESTIONS[stage]) ?? [],
  }
}
