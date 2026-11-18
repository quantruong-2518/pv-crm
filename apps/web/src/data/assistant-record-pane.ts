import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  AssistantSubject,
  CurrencyCode,
  LeadState,
  OpportunityProfileResponse,
  OpportunityStatus,
  StageKey,
  WorkstreamJourneyResponse,
} from '@pv/contracts'
import { isApiError, type ApiFailure } from '@/app/api'
import { useCan } from '@/app/auth'
import type { ThreadItem } from './assistant-thread'
import { leadProfileQuery } from './lead-profile'
import { opportunityProfileQuery } from './opportunities'
import { workstreamJourneyQuery } from './workstream-journey'

/** What the page's record pane shows (owner, 18/11): the record the conversation is about,
 *  read through the viewer's own doors. An opportunity ref reads the deal profile, then
 *  the run's journey for the lead's state; a lead ref reads the lead, then the journey for
 *  its deal. A ref the viewer may not read, or one the server refuses (403, 404), is left
 *  out and the page draws no pane: its chips navigate as they did before. Any other
 *  failure draws no pane for now and may read again. */

export type PaneRef = { kind: 'opportunity' | 'lead'; code: string }

export type PaneRung = {
  key: StageKey
  state: 'done' | 'current' | 'rest'
  days: number | null
  limit: number | null
  overdue: boolean
}

export type PaneDeal = {
  name: string
  state: OpportunityStatus
  rungs: PaneRung[]
  contracts: string[]
  owner: string | null
  amount: number | null
  currency: CurrencyCode | null
  expectedClose: string | null
}

export type PaneView = {
  ref: PaneRef
  company: string
  leadCode: string
  leadState: LeadState | null
  deal: PaneDeal | null
}

const paneRefOf = (ref: { kind: string; code: string }): PaneRef | null =>
  ref.kind === 'opportunity' || ref.kind === 'lead' ? { kind: ref.kind, code: ref.code } : null

function fromProfile(op: OpportunityProfileResponse, leadState: LeadState | null): PaneView {
  const late = (op.position?.overdueBy ?? 0) > 0
  return {
    ref: { kind: 'opportunity', code: op.code },
    company: op.account,
    leadCode: op.leadCode,
    leadState,
    deal: {
      name: op.name,
      state: op.state,
      rungs: op.stages.map((s) => {
        const current = s.key === op.stage
        return {
          key: s.key,
          state: current ? 'current' : s.leftAt !== null ? 'done' : 'rest',
          days: s.days,
          limit: s.limitDays,
          overdue: current && late,
        }
      }),
      contracts: op.contractCodes,
      owner: op.holder?.name ?? null,
      amount: op.amount,
      currency: op.currency,
      expectedClose: op.expectedClose,
    },
  }
}

/** The lead's live deal, or its latest one when none is open. */
function fromJourney(
  ref: PaneRef,
  lead: { company: string; state: LeadState },
  journey: WorkstreamJourneyResponse | undefined,
): PaneView {
  const deal = journey?.deals.find((d) => d.outcome === 'open') ?? journey?.deals.at(-1)
  return {
    ref,
    company: lead.company,
    leadCode: ref.code,
    leadState: lead.state,
    deal: deal
      ? {
          name: deal.name,
          state: deal.outcome,
          rungs: deal.rungs.map((r) => ({
            key: r.key,
            state: r.state === 'current' ? 'current' : r.state === 'done' ? 'done' : 'rest',
            days: r.days,
            limit: r.limitDays,
            overdue:
              r.state === 'current' && (r.dueLevel === 'overdue' || r.dueLevel === 'long-overdue'),
          })),
          contracts: deal.contractCodes,
          owner: deal.holder?.name ?? null,
          amount: deal.amount,
          currency: 'VND',
          expectedClose: deal.expectedClose,
        }
      : null,
  }
}

/** The records of the newest answer that names a lead or an opportunity: the pane stays
 *  on them while a later answer is still running or names nothing of the kind. */
function discussed(items: readonly ThreadItem[], subject: AssistantSubject | undefined) {
  for (const item of [...items].reverse()) {
    if (item.kind !== 'answer') continue
    const refs = item.answer.refs.flatMap((ref) => paneRefOf(ref) ?? [])
    if (refs.length > 0) return { key: item.key, refs }
  }
  const own = subject ? paneRefOf(subject) : null
  return { key: 'subject', refs: own ? [own] : [] }
}

/** Only these say the record is not for this viewer; a timeout or a 500 may clear. */
const REFUSED: ReadonlySet<ApiFailure> = new Set(['forbidden', 'not-found'])

export type RecordPane = {
  /** Null: no pane (no permission, nothing named, or the server refused). */
  view: PaneView | null
  /** The selected record is still being read. */
  loading: boolean
  /** Selects a record in the pane; false = the pane cannot show it, so navigate instead. */
  select: (ref: { kind: string; code: string }) => boolean
}

export function useRecordPane(
  items: readonly ThreadItem[],
  subject: AssistantSubject | undefined,
): RecordPane {
  const canDeal = useCan('opportunity.view')
  const canLead = useCan('lead.view')
  const canRun = useCan('workstream.view')
  const [picked, setPicked] = useState<{ ref: PaneRef; at: string } | null>(null)
  const [refused, setRefused] = useState<ReadonlySet<string>>(() => new Set())
  const { key, refs } = discussed(items, subject)

  const allowed = (r: PaneRef) =>
    !refused.has(r.code) && (r.kind === 'opportunity' ? canDeal : canLead && canRun)
  const current =
    picked && picked.at === key && allowed(picked.ref) ? picked.ref : (refs.find(allowed) ?? null)
  const isDeal = current?.kind === 'opportunity'

  const deal = useQuery({ ...opportunityProfileQuery(current?.code ?? ''), enabled: isDeal })
  const lead = useQuery({
    ...leadProfileQuery(current?.code ?? ''),
    enabled: current?.kind === 'lead',
  })
  const runCode = isDeal ? deal.data?.workstream?.code : lead.data?.workstreamCode
  const journey = useQuery({
    ...workstreamJourneyQuery(runCode ?? ''),
    enabled: Boolean(runCode) && canRun,
  })

  const failure = isDeal ? deal.error : (lead.error ?? journey.error)
  const broken = current !== null && failure !== null
  const refusal = broken && isApiError(failure) && REFUSED.has(failure.kind)
  const code = current?.code
  useEffect(() => {
    if (refusal && code) setRefused((prev) => new Set(prev).add(code))
  }, [refusal, code])

  let view: PaneView | null = null
  if (current && isDeal && deal.data) {
    view = fromProfile(deal.data, journey.data?.lead.state ?? null)
  } else if (current && lead.data && !(runCode && journey.isPending)) {
    view = fromJourney(current, lead.data, journey.data)
  }
  const loading = current !== null && !broken && view === null

  return {
    view,
    loading,
    select: (ref) => {
      const next = paneRefOf(ref)
      if (!next || !allowed(next)) return false
      setPicked({ ref: next, at: key })
      return true
    },
  }
}
