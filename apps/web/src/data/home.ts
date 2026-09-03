import { useQuery } from '@tanstack/react-query'
import type { ContractRow, LeadRow, OpportunityRow, StageKey } from '@pv/contracts'
import {
  createObjectGraph,
  daysUntil,
  dueLevelOf,
  needsAttention,
  systemClock,
  type Edge,
  type ObjectRef,
} from '@pv/engines'
import { useCan, useSession } from '@/app/auth'
import { DEFAULT_LEAD_BOOK_QUERY } from '@/app/url'
import { contractBookQuery, contractSummaryQuery } from './contracts'
import { leadBookQuery, leadScorecardQuery } from './leads'
import { leaderboardQuery } from './leaderboard'
import {
  DEFAULT_OPPORTUNITY_BOOK_QUERY,
  opportunityBookQuery,
  opportunityHistogramQuery,
  opportunityScorecardQuery,
} from './opportunities'

/** The home screen — the only one that reads across all three books at once.
 *
 *  It owns no numbers. Every figure is either a server aggregate (the two
 *  scorecards, the contract summary, the histogram, the leaderboard) or
 *  something derived from rows through `@pv/engines` — never a fourth count of
 *  a thing two screens already count, because a fourth count is a fourth chance
 *  to disagree.
 *
 *  ------------------------------------------------------------------
 *  EVERY QUERY IS GATED, BECAUSE THE SCREEN ITSELF IS NOT
 *  ------------------------------------------------------------------
 *  `/` is the one route in `routes.tsx` with no `permission` — everybody who is
 *  signed in lands here. But the five aggregates behind it answer to four
 *  DIFFERENT permissions, and `marketing` holds only two of them — it may read
 *  the lead book and the performance figures, but neither deals nor contracts.
 *
 *  A query fired unconditionally would therefore be refused by `requireAccess`
 *  in `app/api/client.ts` before it left the browser, and the home page of a
 *  marketing account would be an error banner. Each query carries its own
 *  `enabled`, asking E2 the same question the interceptor is about to ask, and
 *  the screen says plainly which blocks it left out — hiding them silently
 *  would read as an empty desk rather than as a closed door.
 *
 *  The two halves are fetched separately on purpose: the desk half is unscoped
 *  and identical for everyone, the work half is one person's rows. One hook for
 *  both would make a Sale's "pipeline" mean something different from a head of
 *  sales' under the same label. */

/** How many rows of a book to scan for the work queue.
 *
 *  Not a page the user turns — the queue shows what is late and links into the
 *  book for the rest. If someone is further behind than this, the alert cards
 *  still carry the full count, because those come from the server's aggregate
 *  rather than from this scan. */
const WORK_SCAN = 50

// ---------------------------------------------------------------------------
// THE DESK — unscoped, same figures for everybody who may see them
// ---------------------------------------------------------------------------

export function useDesk() {
  const canOps = useCan('cơ-hội.xem')
  const canLead = useCan('lead.xem')
  const canContract = useCan('hợp-đồng.xem')
  const canPeople = useCan('hiệu-suất.xem')

  const scorecard = useQuery({ ...opportunityScorecardQuery, enabled: canOps })
  const histogram = useQuery({ ...opportunityHistogramQuery, enabled: canOps })
  const funnel = useQuery({ ...leadScorecardQuery, enabled: canLead })
  const contracts = useQuery({ ...contractSummaryQuery, enabled: canContract })
  const people = useQuery({ ...leaderboardQuery, enabled: canPeople })

  const parts = [scorecard, histogram, funnel, contracts, people]

  return {
    scorecard: scorecard.data,
    histogram: histogram.data,
    funnel: funnel.data,
    contracts: contracts.data,
    people: people.data?.rows,
    can: { ops: canOps, lead: canLead, contract: canContract, people: canPeople },
    /* `isPending` stays true for a DISABLED query, so it cannot be the signal
       here — a marketing account would wait forever on a call nobody is going
       to make. Only queries actually in flight count. */
    isPending: parts.some((p) => p.isFetching),
    /* The first failure, not a list. Five red banners for one dead session is
       five copies of one sentence. */
    error: parts.find((p) => p.error)?.error ?? null,
  }
}

/** Stage limits, keyed. The histogram already carries the configured limit per
 *  column, so the work queue reads it from there instead of joining
 *  `config_entry` a second time on the client — and the queue and the chart
 *  therefore cannot disagree about which deals are late. A stage absent from
 *  the map has no limit configured, and nothing in it can be judged. */
export function limitsOf(
  buckets: { stage: StageKey; limitDays: number | null }[] | undefined,
): Map<StageKey, number> {
  const out = new Map<StageKey, number>()
  for (const b of buckets ?? []) if (b.limitDays !== null) out.set(b.stage, b.limitDays)
  return out
}

/** Column labels, from the same response. Keeps the screen from importing a
 *  customer fixture just to find out what a column is called. */
export function labelsOf(
  buckets: { stage: StageKey; label: string }[] | undefined,
): (stage: StageKey) => string {
  const map = new Map((buckets ?? []).map((b) => [b.stage, b.label]))
  return (stage) => map.get(stage) ?? stage
}

// ---------------------------------------------------------------------------
// THE WORK QUEUE — one person's rows, three books, one order
// ---------------------------------------------------------------------------

export type WorkKind = 'thu-tien' | 'co-hoi' | 'lead'

/** One thing on this desk that had a deadline and passed it.
 *
 *  Three books produce one shape so the screen can sort them against each
 *  other: an installment eleven days late outranks a deal two days over its
 *  column, and nothing could see that while the three lived in three tables. */
export type WorkItem = {
  id: string
  kind: WorkKind
  code: string
  title: string
  /** Second line — the customer, or which column the row is stuck in. */
  meta: string
  amountVnd: number | null
  /** Days past the limit. Always positive: a row inside its limit is not work. */
  daysLate: number
  href: string
}

/** Money that was due and has not landed.
 *
 *  The level comes from `@pv/engines/contract-due`, the same ladder the
 *  contract book paints with, so a row reading as overdue there cannot read
 *  anything else here. */
export function collectionWork(rows: ContractRow[], mine: string, today: string): WorkItem[] {
  const out: WorkItem[] = []
  for (const c of rows) {
    if (c.ownerId !== mine) continue
    for (const i of c.installments ?? []) {
      if (!needsAttention(dueLevelOf(i.due, today, i.paidAt))) continue
      const left = daysUntil(i.due, today)
      /* `needsAttention` also accepts the near-due and due-today levels. Those
         belong on the alert card, not in a queue headed "overdue" — only money
         that is actually late becomes a row here. */
      if (left >= 0) continue
      out.push({
        id: `${c.code}-${i.no}`,
        kind: 'thu-tien',
        code: c.code,
        title: `Đợt ${i.no} · ${i.label}`,
        meta: c.leadCode,
        amountVnd: i.amount,
        daysLate: -left,
        href: `/sales/contracts/${c.code}/dot/${i.no}`,
      })
    }
  }
  return out
}

/** Deals sitting in one column longer than that column allows. */
export function dealWork(
  rows: OpportunityRow[],
  limits: Map<StageKey, number>,
  labelOf: (stage: StageKey) => string,
): WorkItem[] {
  const out: WorkItem[] = []
  for (const o of rows) {
    /* `daysInStage === null` means the deal has left the board, and a closed
       deal has no column left to rot in. */
    if (o.stage === null || o.daysInStage === null) continue
    const limit = limits.get(o.stage)
    if (limit === undefined || o.daysInStage <= limit) continue
    out.push({
      id: o.code,
      kind: 'co-hoi',
      code: o.code,
      title: o.name,
      meta: `${o.account} · ${labelOf(o.stage)}`,
      amountVnd: o.amount,
      daysLate: o.daysInStage - limit,
      href: `/sales/opportunities/${o.code}`,
    })
  }
  return out
}

/** Leads stuck past their stage limit — the same rule as a deal, one book
 *  earlier. Judged by `daysHere` against the SAME `STAGE` limits rather than a
 *  second threshold invented for leads: one configured number, two books. */
export function leadWork(
  rows: LeadRow[],
  limits: Map<StageKey, number>,
  labelOf: (stage: StageKey) => string,
): WorkItem[] {
  const out: WorkItem[] = []
  for (const l of rows) {
    if (l.signed || l.exitReason !== undefined || l.stage === undefined) continue
    const limit = limits.get(l.stage)
    if (limit === undefined || l.daysHere <= limit) continue
    out.push({
      id: l.code,
      kind: 'lead',
      code: l.code,
      title: l.company,
      meta: `${l.contactName} · ${labelOf(l.stage)}`,
      amountVnd: null,
      daysLate: l.daysHere - limit,
      href: `/sales/leads/${l.code}`,
    })
  }
  return out
}

/** Latest first, then by money, then by code so two equally late rows do not
 *  swap places between renders. */
export function orderWork(items: WorkItem[]): WorkItem[] {
  return [...items].sort(
    (a, b) =>
      b.daysLate - a.daysLate ||
      (b.amountVnd ?? 0) - (a.amountVnd ?? 0) ||
      a.code.localeCompare(b.code),
  )
}

/** What is late on the signed-in person's own desk.
 *
 *  Scoped by id rather than by trusting the scope axis: `ownOnly` already
 *  narrows a Sale's books to themselves, but a head of sales has no `ownOnly`
 *  and would otherwise read the whole department’s late work under a heading
 *  that says it is showing only their own. */
export function useMyWork(limits: Map<StageKey, number>, labelOf: (stage: StageKey) => string) {
  const actor = useSession((s) => s.actor)
  const mine = actor?.id ?? ''

  const canOps = useCan('cơ-hội.xem')
  const canLead = useCan('lead.xem')
  const canContract = useCan('hợp-đồng.xem')

  const today = systemClock()

  const contracts = useQuery({
    ...contractBookQuery({ page: 1, size: WORK_SCAN }),
    enabled: mine !== '' && canContract,
  })
  const deals = useQuery({
    ...opportunityBookQuery({ ...DEFAULT_OPPORTUNITY_BOOK_QUERY, size: WORK_SCAN, sale: mine }),
    enabled: mine !== '' && canOps,
  })
  const leads = useQuery({
    ...leadBookQuery({ ...DEFAULT_LEAD_BOOK_QUERY, size: WORK_SCAN, owner: mine }),
    enabled: mine !== '' && canLead,
  })

  const contractRows = contracts.data?.rows ?? []

  const items = orderWork([
    ...collectionWork(contractRows, mine, today),
    ...dealWork(deals.data?.rows ?? [], limits, labelOf),
    ...leadWork(leads.data?.rows ?? [], limits, labelOf),
  ])

  const parts = [contracts, deals, leads]

  return {
    items,
    /* Handed back so the rail can climb from the top item up to the deal and
       lead above it without a second read of the same page. */
    contractRows,
    isPending: parts.some((p) => p.isFetching),
    error: parts.find((p) => p.error)?.error ?? null,
  }
}

// ---------------------------------------------------------------------------
// THE RAIL — rule 10, built from real rows
// ---------------------------------------------------------------------------

const KIND_OF: Record<WorkKind, ObjectRef['kind']> = {
  'thu-tien': 'HĐ',
  'co-hoi': 'OP',
  lead: 'LD',
}

/** ContextRail for whatever is most urgent right now.
 *
 *  Rule 10 says the rail comes out of `E1.story()` and never out of a
 *  hand-written chip list, and that still holds now that nothing here is a
 *  fixture: `createObjectGraph` is a pure function, so the graph is built from
 *  rows the server just returned and `story()` walks it exactly as it walks the
 *  frozen one. Taking its objects as an argument is the whole point of E1.
 *
 *  Empty desk, empty rail — the screen then has nothing to anchor on and says
 *  so, rather than inventing a code to fill the row. */
export function deskStory(top: WorkItem | undefined, contracts: ContractRow[]) {
  if (top === undefined) return []

  const objects: ObjectRef[] = []
  const edges: Edge[] = []
  const seen = new Set<string>()
  const add = (ref: ObjectRef) => {
    if (seen.has(ref.code)) return
    seen.add(ref.code)
    objects.push(ref)
  }

  /* A contract carries both codes above it, so a collection row draws the whole
     chain lead to deal to contract. The other two kinds only know themselves,
     and a one-chip rail is honest about that. */
  const contract = contracts.find((c) => c.code === top.code)
  if (contract === undefined) {
    add({ code: top.code, kind: KIND_OF[top.kind], branch: 'Sales', label: top.title })
  } else {
    add({ code: contract.leadCode, kind: 'LD', branch: 'Sales', label: contract.leadCode })
    add({
      code: contract.opportunityCode,
      kind: 'OP',
      branch: 'Sales',
      label: contract.opportunityCode,
    })
    add({
      code: contract.code,
      kind: 'HĐ',
      branch: 'Sales',
      label: contract.code,
      amount: contract.amount ?? undefined,
    })
    edges.push(
      { from: contract.leadCode, to: contract.opportunityCode, kind: 'sinh-ra' },
      { from: contract.opportunityCode, to: contract.code, kind: 'sinh-ra' },
    )
  }

  return createObjectGraph(objects, edges)
    .story(top.code)
    .map((o) => ({ code: o.code, source: o.code === top.code }))
}
