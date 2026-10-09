import type { StepSubject } from '@/data/next-step'

/** Module 3 · a deal's next step as both of its doors build it — the profile
 *  card and the journey drawer — so the two never offer different doers for
 *  the same deal. What the picker offers is the server's answer for the stage
 *  the deal stands in (ADR 0080), not this file's.
 *
 *  `canAssign` stays on for deals: the door names any doer, and the default is
 *  the row's server-computed holder (ADR 0069 §10, 0071 §5). */
export function dealStepSubject(code: string, holder: StepSubject['holder']): StepSubject {
  return {
    kind: 'opportunity',
    code,
    holder,
    canAssign: true,
    holderHint: 'Người giữ cơ hội.',
    noHolder: 'Cơ hội chưa có ai đứng đơn hay nhận PIC.',
  }
}
