import {
  LeadBookQuery,
  LeadRow,
  ListMyWorkInput,
  NextStep,
  ObjectCode,
  OpportunityBookQuery,
  OpportunityRow,
  type AssistantRef,
  type NextStepResponse,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import {
  defineTool,
  door,
  inPool,
  type AssistantTool,
  type ToolRead,
} from '@api/platform/assistant/assistant-tools'
import { PvError } from '@api/platform/http/problem'
import { zod } from '@api/platform/http/zod.pipe'
import { LeadController } from '../lead/lead.controller'
import type { LeadService } from '../lead/lead.service'
import { OpportunityStepController } from '../next-step/next-step-opportunity.controller'
import type { OpportunityStepService } from '../next-step/next-step-opportunity.service'
import { NextStepController } from '../next-step/next-step.controller'
import type { NextStepService } from '../next-step/next-step.service'
import { OpportunityController } from '../opportunity/opportunity.controller'
import type { OpportunityService } from '../opportunity/opportunity.service'

/** `list_my_work`: the asker's own open leads, open deals and next steps, never
 *  all a role may read, so a director gets their own desk and not the company.
 *
 *  Leads: the lead book with `owner` = the asker. Deals: the deal book once per
 *  lane, `sale` and `bd` = the asker, the book's own "my deals" filters. Steps:
 *  each listed record's step through its own door, kept where the asker is the
 *  doer. No door lists steps by doer, so a step the asker does on someone else's
 *  record is missed. Trusted fields only (D5): no name, no text, never phone or
 *  email; the screen shows names from `refs`, which never reach the model. */

/** Rows per book: a desk longer than this says `more` and the model asks narrower. */
const LIST_SIZE = 20
/** Step doors read per call, each a few queries. */
const STEP_READS = 20
const STEP_PARALLEL = 4

type Door = 'lead' | 'opportunity' | 'lead-step' | 'opportunity-step'
type Kind = NonNullable<ListMyWorkInput['kind']>

const DOORS: Record<Kind | 'all', readonly Door[]> = {
  lead: ['lead'],
  opportunity: ['opportunity'],
  'next-step': ['lead', 'lead-step', 'opportunity', 'opportunity-step'],
  all: ['lead', 'opportunity', 'lead-step', 'opportunity-step'],
}

/** Exported for the company read, which keeps the same fields of the same books. */
export const LeadTrusted = LeadRow.pick({
  code: true,
  state: true,
  tier: true,
  sizeBand: true,
  signed: true,
  daysHere: true,
  stateSince: true,
  lastTouchAt: true,
  recontactOn: true,
  createdAt: true,
})

export const DealTrusted = OpportunityRow.pick({
  code: true,
  leadCode: true,
  stage: true,
  daysInStage: true,
  quotationRounds: true,
  expectedClose: true,
  amount: true,
  currency: true,
  probability: true,
})

const StepTrusted = NextStep.pick({ due: true, dueLevel: true }).extend({ code: ObjectCode })

type Book<R> = { rows: R[]; hidden: number; more: boolean }
type Step = { ref: AssistantRef; read: () => Promise<NextStepResponse> }

const EMPTY: Book<never> = { rows: [], hidden: 0, more: false }

export type WorkDoors = {
  leads: LeadService
  opportunities: OpportunityService
  leadSteps: NextStepService
  dealSteps: OpportunityStepService
  /** A chip as `get_record` makes it, masked by the live `data.export` grant. */
  refOf: (who: Actor, kind: AssistantRef['kind'], code: string, label: string) => AssistantRef
}

async function myLeads(d: WorkDoors, who: Actor): Promise<Book<LeadRow>> {
  const q = zod(LeadBookQuery).transform({ owner: who.id, state: 'open', size: LIST_SIZE })
  const page = await d.leads.book(who, q)
  return { rows: page.rows, hidden: page.hidden, more: page.total > page.rows.length }
}

async function myDeals(d: WorkDoors, who: Actor): Promise<Book<OpportunityRow>> {
  const lane = (key: 'sale' | 'bd') =>
    d.opportunities.book(
      who,
      zod(OpportunityBookQuery).transform({ [key]: who.id, state: 'open', size: LIST_SIZE }),
    )
  const [sale, bd] = await Promise.all([lane('sale'), lane('bd')])
  const rows = new Map([...sale.rows, ...bd.rows].map((r) => [r.code, r]))
  const more = [sale, bd].some((p) => p.total > p.rows.length) || rows.size > LIST_SIZE
  return { rows: [...rows.values()].slice(0, LIST_SIZE), hidden: sale.hidden + bd.hidden, more }
}

/** Lead and deal steps taken in turn, so a long lead list cannot starve the deals;
 *  `cut` = the budget ran out first. A record that left the asker's reach since its
 *  book page is skipped, not a failure. */
async function mySteps(who: Actor, leads: readonly Step[], deals: readonly Step[]) {
  const all = Array.from({ length: Math.max(leads.length, deals.length) }, (_, i) => [
    leads[i],
    deals[i],
  ])
    .flat()
    .filter((s): s is Step => s !== undefined)
  const read = await inPool(all.slice(0, STEP_READS), STEP_PARALLEL, async (s) => {
    const { step } = await s.read().catch((error: unknown) => {
      if (error instanceof PvError) return { step: null }
      throw error
    })
    return step?.doer.id === who.id ? { ref: s.ref, step } : null
  })
  return { steps: read.filter((s) => s !== null), cut: all.length > STEP_READS }
}

/** `run`'s counts read backwards: with every kind, the books' rows each carry one
 *  distinct code and the steps none; with `next-step`, every row is a step. */
function stepsOf(kind: ListMyWorkInput['kind'], rowCount: number, codes: number): number {
  if (kind === 'next-step') return rowCount
  return kind === undefined ? Math.max(0, rowCount - codes) : 0
}

async function run(
  d: WorkDoors,
  who: Actor,
  { kind }: ListMyWorkInput,
  open: ReadonlySet<Door>,
): Promise<ToolRead> {
  const [leads, deals] = await Promise.all([
    open.has('lead') && kind !== 'opportunity' ? myLeads(d, who) : EMPTY,
    open.has('opportunity') && kind !== 'lead' ? myDeals(d, who) : EMPTY,
  ])
  const leadRefs = leads.rows.map((r) => d.refOf(who, 'lead', r.code, r.company))
  const dealRefs = deals.rows.map((r) => d.refOf(who, 'opportunity', r.code, r.name))
  const { steps, cut } =
    kind === 'lead' || kind === 'opportunity'
      ? { steps: [], cut: false }
      : await mySteps(
          who,
          (open.has('lead-step') ? leadRefs : []).map((ref) => ({
            ref,
            read: () => d.leadSteps.get(who, ref.code),
          })),
          (open.has('opportunity-step') ? dealRefs : []).map((ref) => ({
            ref,
            read: () => d.dealSteps.get(who, ref.code),
          })),
        )
  const books = kind === 'next-step' ? [] : [leads, deals]
  const refs = kind === 'next-step' ? steps.map((s) => s.ref) : [...leadRefs, ...dealRefs]
  /* A kind behind a refused door is unknown, not empty: the model must say so. */
  const shut = DOORS[kind ?? 'all'].filter((door) => !open.has(door))
  const trusted = {
    skipped: [...new Set(shut.map((door) => (door.startsWith('lead') ? 'lead' : 'opportunity')))],
    leads: books.length > 0 ? leads.rows.map((r) => LeadTrusted.parse(r)) : [],
    opportunities: books.length > 0 ? deals.rows.map((r) => DealTrusted.parse(r)) : [],
    nextSteps: steps.map(({ ref, step }) => StepTrusted.parse({ ...step, code: ref.code })),
    /* A step list is cut when its books were, or when the step budget ran out. */
    more: leads.more || deals.more || cut,
  }
  const rowCount = trusted.leads.length + trusted.opportunities.length + steps.length
  return {
    data: { trusted },
    codes: [...new Set(refs.map((r) => r.code))],
    rowCount,
    hidden: books.length > 0 ? leads.hidden + deals.hidden : null,
    refs,
    steps: steps.length,
  }
}

export const listMyWork = (d: WorkDoors): AssistantTool =>
  defineTool({
    name: 'list_my_work',
    description:
      "The asker's own open leads, open opportunities and next steps they must do, as codes, states and dates. No names: read one with get_record.",
    input: ListMyWorkInput,
    doors: {
      lead: door(LeadController, 'book'),
      opportunity: door(OpportunityController, 'book'),
      'lead-step': door(NextStepController, 'get'),
      'opportunity-step': door(OpportunityStepController, 'get'),
    },
    doorFor: (input) => DOORS[input.kind ?? 'all'],
    run: (who, input, open) => run(d, who, input, open),
    stepsOf: ({ kind }, { rowCount, codes }) => stepsOf(kind, rowCount, codes.length),
  })
