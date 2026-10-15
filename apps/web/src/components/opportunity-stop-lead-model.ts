import { LEAD_STOP_REASON_OTHER, type LeadAfterStop, type LeadAfterStopChoice } from '@pv/contracts'

/** The stop drawer's draft of where the lead goes (`opportunity-stop-lead.tsx`).
 *  An empty `holderId` means the first holder the server offers, so a profile
 *  re-read never leaves it stale. */
export type LeadAfterDraft = {
  to: '' | 'waiting' | 'stop'
  holderId: string
  reasonKey: string
  note: string
}

export const LEAD_AFTER_EMPTY: LeadAfterDraft = { to: '', holderId: '', reasonKey: '', note: '' }

/** The choices this reader has: waiting needs a holder on offer, stop needs
 *  `canStop`. With one choice it is taken without asking. */
export function leadAfterChoices(after: LeadAfterStop): ('waiting' | 'stop')[] {
  return [
    ...(after.holders.length > 0 ? (['waiting'] as const) : []),
    ...(after.canStop ? (['stop'] as const) : []),
  ]
}

export function leadAfterTo(d: LeadAfterDraft, after: LeadAfterStop): LeadAfterDraft['to'] {
  const choices = leadAfterChoices(after)
  return choices.length === 1 ? (choices[0] ?? '') : d.to
}

/** What the footer asks for while the choice is incomplete; `null` = complete. */
export function leadAfterMissing(d: LeadAfterDraft, after: LeadAfterStop): string | null {
  if (leadAfterChoices(after).length === 0) {
    return 'Bạn không chọn được nơi cho lead này. Liên hệ trưởng phòng.'
  }
  const to = leadAfterTo(d, after)
  if (to === '') return 'Chọn lead này đi đâu.'
  if (to === 'waiting') return null
  if (d.reasonKey === '') return 'Chọn lý do ngừng chăm sóc lead.'
  if (d.reasonKey === LEAD_STOP_REASON_OTHER && d.note.trim() === '') {
    return 'Chọn "Khác" thì phải ghi rõ lý do ngừng chăm sóc lead.'
  }
  return null
}

/** The stop body's `lead`, read off a complete draft. */
export function leadAfterChoiceOf(d: LeadAfterDraft, after: LeadAfterStop): LeadAfterStopChoice {
  if (leadAfterTo(d, after) === 'waiting') {
    return { to: 'waiting', holderId: d.holderId || (after.holders[0]?.id ?? '') }
  }
  const note = d.note.trim()
  return { to: 'stop', reasonKey: d.reasonKey, ...(note === '' ? {} : { note }) }
}
