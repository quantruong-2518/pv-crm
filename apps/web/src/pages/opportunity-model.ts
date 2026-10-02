import { vnd } from '@pv/ui'
import {
  OPPORTUNITY_STAGE_LABEL,
  type CurrencyCode,
  type OpportunityProfileResponse,
  type OpportunityStageSpan,
} from '@pv/contracts'
import { dm } from '@/lib/date'
import { OVERDUE_WORD } from '@/data/opportunities'

/** Module 3 · what the deal profile derives before it paints — no JSX here.
 *
 *  Every verdict is the server's (`acts`, `stages`, `position`, ADR 0076 §4);
 *  this file only words them: which marker a column wears, which caption,
 *  which one stage button is primary. */

type Profile = OpportunityProfileResponse

/** A figure in its own currency; other currencies are never converted here
 *  (ADR 0077 §1). A legacy deal with no currency prints the bare figure. */
export function moneyText(amount: number, currency: CurrencyCode | null): string {
  if (currency === 'VND') return vnd(amount)
  const figure = amount.toLocaleString('vi-VN')
  return currency === null ? figure : `${figure} ${currency}`
}

/** The run's customer tag, new or returning with its ordinal (ADR 0076 §3);
 *  `null` when the run has no account to judge. */
export function customerTagOf(op: Pick<Profile, 'workstream'>): string | null {
  const run = op.workstream
  if (!run?.customer) return null
  return run.customer === 'new' ? 'Khách mới' : `Khách cũ · lượt bán thứ ${run.ordinal}`
}

export type StepMark = 'done' | 'current' | 'stopped' | 'skipped' | 'future' | 'waiting'

export type StatusStep = {
  key: string
  label: string
  mark: StepMark
  /** Under the label; `null` = nothing to say. */
  caption: string | null
  /** The caption is a lateness sentence. */
  late: boolean
}

const span = (from: string, to: string | null) => {
  const a = dm(from)
  const b = to ? dm(to) : a
  return a === b ? a : `${a} – ${b}`
}

/** The current column's clock in the design's words. The lateness verdict is
 *  the server's `position.overdueBy` when it has one. */
function clockCaption(s: OpportunityStageSpan, overdueBy: number | null) {
  if (s.days === null) return { caption: null, late: false }
  const here = `đã ${s.days} ngày`
  if (s.limitDays === null) return { caption: `${here} · chưa đặt hạn`, late: false }
  const over = overdueBy ?? s.days - s.limitDays
  return over > 0
    ? { caption: `${here} · ${OVERDUE_WORD} ${over} ngày`, late: true }
    : { caption: `${here} · hạn ${s.limitDays} ngày`, late: false }
}

function stageStep(op: Profile, s: OpportunityStageSpan, i: number): StatusStep {
  const label = OPPORTUNITY_STAGE_LABEL[s.key]
  const base = { key: s.key, label, late: false }
  if (op.state === 'lost' && op.stoppedAtStage === s.key) {
    const at = op.closedAt ?? s.leftAt
    return { ...base, mark: 'stopped', caption: at ? `dừng ${dm(at)}` : 'dừng' }
  }
  if (s.enteredAt && (s.leftAt || op.state !== 'open')) {
    return { ...base, mark: 'done', caption: span(s.enteredAt, s.leftAt) }
  }
  if (s.enteredAt) {
    return { ...base, mark: 'current', ...clockCaption(s, op.position?.overdueBy ?? null) }
  }
  /* Never entered, yet a later column was: the deal went past it. */
  const passed = op.stages.slice(i + 1).some((later) => later.enteredAt !== null)
  return passed || op.state === 'won'
    ? { ...base, mark: 'skipped', caption: 'bỏ qua' }
    : { ...base, mark: 'future', caption: null }
}

function contractStep(op: Profile): StatusStep {
  const base = { key: 'contract', label: 'Hợp đồng', late: false }
  const last = op.contracts.at(-1)
  const signed = last ? `${op.contracts.length} hợp đồng · ${dm(last.signedAt)}` : null
  const waiting = op.pendingSign ? '1 đề nghị chờ duyệt' : null
  const caption = [signed, waiting].filter(Boolean).join(' · ') || null
  if (signed) return { ...base, mark: 'done', caption }
  return { ...base, mark: waiting ? 'waiting' : 'future', caption }
}

/** The four columns from `stages`, then the contract step. */
export const statusStepsOf = (op: Profile): StatusStep[] => [
  ...op.stages.map((s, i) => stageStep(op, s, i)),
  contractStep(op),
]

/** The ONE primary button of the action bar — the move that takes the deal to
 *  its next column. `null` on a closed deal and when this reader holds none. */
export type PrimaryMove = 'accept' | 'assign' | 'quote' | 'sign' | null

export function primaryMoveOf(op: Profile, can: { accept: boolean; close: boolean }): PrimaryMove {
  if (op.state !== 'open') return null
  if (op.stage === 'new') return can.accept && op.acts.accept.ok ? 'accept' : null
  /* No seller blocks the sign, so the head's assign outranks every later move. */
  if (!op.hasSeller && op.acts.assign.ok) return 'assign'
  if (op.stage === 'quotation') return can.close ? 'sign' : null
  return op.acts.quotation.ok ? 'quote' : null
}

/** The journey drawer's pick for this deal: the column it stands in, else the
 *  one it stopped in, else the quotation rung where signatures hang. */
export const journeyRungOf = (op: Profile) => op.stage ?? op.stoppedAtStage ?? 'quotation'
