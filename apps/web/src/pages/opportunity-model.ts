import {
  OPPORTUNITY_STAGE_LABEL,
  type OpportunityProfileResponse,
  type OpportunityStageSpan,
} from '@pv/contracts'
import { dm } from '@/lib/date'
import { OVERDUE_WORD, refusalOf } from '@/data/opportunities'
import type { MenuChoice } from '@/components/record/menu-button'
import type { TodoRung } from '@/components/record/todo-card'

/** Module 3 · what the deal profile derives before it paints — no JSX here.
 *
 *  Every verdict is the server's (`acts`, `stages`, `position`, ADR 0076 §4);
 *  this file only words them: which marker a column wears, which caption,
 *  which one stage button is primary, which doors the more menu holds. */

type Profile = OpportunityProfileResponse

/** The run's customer tag, new or returning with its ordinal (ADR 0076 §3);
 *  `null` when the run has no account to judge. */
export function customerTagOf(op: Pick<Profile, 'workstream'>): string | null {
  const run = op.workstream
  if (!run?.customer) return null
  return run.customer === 'new' ? 'Khách mới' : `Khách cũ · lượt bán thứ ${run.ordinal}`
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

function stageStep(op: Profile, s: OpportunityStageSpan, i: number): TodoRung {
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

/** The date only: how many signed and what waits are the money block's. */
function contractStep(op: Profile): TodoRung {
  const base = { key: 'contract', label: 'Hợp đồng', late: false }
  const last = op.contracts.at(-1)
  if (last) return { ...base, mark: 'done', caption: dm(last.signedAt) }
  return { ...base, mark: op.pendingSign ? 'waiting' : 'future', caption: null }
}

/** The four columns from `stages`, then the contract step. */
export const statusStepsOf = (op: Profile): TodoRung[] => [
  ...op.stages.map((s, i) => stageStep(op, s, i)),
  contractStep(op),
]

/** The ONE primary button of the header — the move that takes the deal to
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

/** What the header's action slot draws: the stage move, and the quote and
 *  sign doors beside it — each one press away, in the header only. */
export type DealPrimaryState = {
  move: PrimaryMove
  /** The record door of the quotation ledger. */
  quote: boolean
  /** `win` closes an open deal, `again` adds a contract to a won one. */
  sign: 'win' | 'again' | null
  /** Why the sign is shut, or why nobody here can move the deal. */
  note: string | null
  /** The accept modal is mounted on the permission, not the verdict, so it
   *  outlives the accept that shuts the act. */
  acceptMounted: boolean
}

/** Whether any move draws; the header leaves its action slot empty otherwise. */
export const hasDealMoves = (state: DealPrimaryState) =>
  state.move === 'accept' ||
  state.move === 'assign' ||
  state.quote ||
  state.sign !== null ||
  state.acceptMounted

export function primaryStateOf(
  op: Profile,
  can: { accept: boolean; close: boolean },
): DealPrimaryState {
  const move = primaryMoveOf(op, can)
  const again = op.state === 'won' && can.close && !op.pendingSign
  const signWhy = move === 'sign' || again ? refusalOf(op.acts.sign) : null
  const open = signWhy === null && !op.pendingSign
  /* An open deal nobody here can move says why once, in the server's words. */
  const idle =
    op.state === 'open' && move === null && !op.acts.activity.ok && !op.acts.quotation.ok
      ? refusalOf(op.acts.activity)
      : null
  return {
    move,
    quote: op.acts.quotation.ok,
    sign: !open ? null : move === 'sign' ? 'win' : again ? 'again' : null,
    note: signWhy ?? idle,
    acceptMounted: op.state === 'open' && can.accept,
  }
}

/** One label for the quote door wherever it stands: the modal decides which
 *  negotiation the round joins. */
export const QUOTE_LABEL = 'Ghi báo giá'

/** The floating bar's more menu: the activity record, the owners' drawer and
 *  the stop. Quoting and signing are the header's, and the seller swap is the
 *  rail's door, so neither repeats here. A stop is final, so a lost deal
 *  offers nothing. */
export function dealMoreChoices(
  op: Profile,
  doors: {
    onRecord: () => void
    onEditOwners: () => void
    onStop: () => void
  },
): MenuChoice[] {
  if (op.state === 'lost') return []
  const choices: MenuChoice[] = []
  if (op.acts.activity.ok) {
    choices.push({
      key: 'activity',
      label: 'Ghi hoạt động',
      onSelect: doors.onRecord,
    })
  }
  if (op.acts.editDetails.ok) {
    choices.push({
      key: 'owners',
      label: 'Sửa người chịu trách nhiệm',
      onSelect: doors.onEditOwners,
    })
  }
  if (op.acts.stop.ok) {
    choices.push({ key: 'stop', label: 'Dừng cơ hội', tone: 'danger', onSelect: doors.onStop })
  }
  return choices
}

/** The history card's DOM id; `historyRungId` names one rung inside it. */
export const HISTORY_ID = 'deal-history'
export const historyRungId = (rung: string) => `${HISTORY_ID}-${rung}`

/** The door to a waiting sign request: it hangs on the quotation rung of the
 *  history card, as the retired drawer opened it. Focus moves to the card so a
 *  keyboard lands there too. */
export function viewSignRequest() {
  const card = document.getElementById(HISTORY_ID)
  const rung = document.getElementById(historyRungId('quotation')) ?? card
  rung?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  card?.focus({ preventScroll: true })
}
