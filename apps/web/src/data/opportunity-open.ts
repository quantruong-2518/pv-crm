import { queryOptions } from '@tanstack/react-query'
import type {
  OpportunityContactPick,
  OpportunityContactRole,
  OpportunityOpenContext,
  StageKey,
} from '@pv/contracts'
import type { OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import { api } from '@/app/api'
import { missingOf, OPPORTUNITY_BOOK_KEY } from '@/data/opportunities'
import { OPPORTUNITY_WRITE_NEED } from '@/data/opportunities-write'

/** Module 3 · what the "open an opportunity" drawer knows beyond the form.
 *
 *  The context read, the contact-pick rules and the close-date chips live here
 *  because they are rules of the ticket, not layout. Picks are plain wire
 *  objects (`OpportunityContactPick`) so the submit sends exactly what the
 *  list holds, with no second shape to translate through. */

/** `GET /sales/opportunities/open-context` — same permission and scope as the
 *  create door it prepares for. Under the book key so a created deal refreshes
 *  it, and `staleTime: 0` because the app default is `Infinity` while this
 *  answer (the run's standing deal above all) changes with every deal opened. */
export const openContextQuery = (leadCode: string, enabled: boolean) =>
  queryOptions({
    queryKey: [...OPPORTUNITY_BOOK_KEY, 'open-context', leadCode] as const,
    queryFn: ({ signal }) =>
      api.read<OpportunityOpenContext>(
        `/sales/opportunities/open-context?leadCode=${encodeURIComponent(leadCode)}`,
        { need: OPPORTUNITY_WRITE_NEED, signal },
      ),
    enabled,
    staleTime: 0,
  })

// ---------------------------------------------------------------------------
// Close-date chips
// ---------------------------------------------------------------------------

export type CloseChip = { label: string; day: string }

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar day as `YYYY-MM-DD`. Never `toISOString`: at +07 it would
 *  print yesterday for anything before 07:00. */
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Chips counted from the REAL `today` the caller hands in — the frozen
 *  fixture clock is for seeded content, not for a date a person picks now. */
const daysAhead = (today: Date, days: number) =>
  dayOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days))

export function closeChips(today: Date): CloseChip[] {
  const ahead = (days: number) => daysAhead(today, days)
  const quarterEnd = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 + 3, 0)
  return [
    { label: '30 ngày', day: ahead(30) },
    { label: '45 ngày', day: ahead(45) },
    { label: '90 ngày', day: ahead(90) },
    { label: 'Cuối quý', day: dayOf(quarterEnd) },
  ]
}

// ---------------------------------------------------------------------------
// Contact picks — exactly one primary, whatever order things are ticked in
// ---------------------------------------------------------------------------

/** The first ticked person becomes primary on its own; unticking the primary
 *  hands the mark to the next one still ticked, so the list never has none. */
export function toggledPick(
  picks: OpportunityContactPick[],
  contactCode: string,
): OpportunityContactPick[] {
  if (!picks.some((p) => p.contactCode === contactCode))
    return [...picks, { contactCode, role: null, primary: picks.length === 0 }]
  const rest = picks.filter((p) => p.contactCode !== contactCode)
  const first = rest[0]
  if (!first || rest.some((p) => p.primary)) return rest
  return rest.map((p) => (p === first ? { ...p, primary: true } : p))
}

export const primaryPick = (picks: OpportunityContactPick[], contactCode: string) =>
  picks.map((p) => ({ ...p, primary: p.contactCode === contactCode }))

export const rolePick = (
  picks: OpportunityContactPick[],
  contactCode: string,
  role: OpportunityContactRole | null,
) => picks.map((p) => (p.contactCode === contactCode ? { ...p, role } : p))

/** Pre-ticks the only candidate. With two or more the choice is the BD's: a
 *  guess here would attach somebody to a deal they never heard of. */
export function seededPicks(context: OpportunityOpenContext): OpportunityContactPick[] {
  const only = context.contacts.length === 1 ? context.contacts[0] : undefined
  return only ? [{ contactCode: only.code, role: null, primary: true }] : []
}

// ---------------------------------------------------------------------------
// The ticket's rules
// ---------------------------------------------------------------------------

/** The stage a new deal is born at: an accept-holder's own deal skips `new`
 *  (ADR 0071 §3). */
export const bornStage = (canAccept: boolean): StageKey => (canAccept ? 'assigned' : 'new')

/** `missingOf` plus the two things only this door asks. Owners are checked
 *  here because the server refuses a deal with both lanes empty and no
 *  acceptor (ADR 0071 §2). */
export function missingForOpen(
  draft: OpportunityDraft,
  picks: OpportunityContactPick[],
  canAccept: boolean,
): string[] {
  const missing = missingOf(draft)
  if (picks.length === 0) missing.push('người liên hệ của cơ hội')
  const noOwner = draft.bdOwners.length + draft.saleOwners.length === 0
  if (noOwner && !canAccept) missing.push('người chịu trách nhiệm')
  return missing
}

/** May the BD lane lose this person? Not when it would leave a deal with no
 *  one on it (ADR 0071 §2): the Sale lane empty and no acceptor to stand in. */
export const lastBdLocked = (draft: OpportunityDraft, canAccept: boolean) =>
  !canAccept && draft.saleOwners.length === 0 && draft.bdOwners.length === 1
