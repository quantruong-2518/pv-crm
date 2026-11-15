import type { ModuleRef } from '@nestjs/core'
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
  type FooterReads,
  type ToolDoor,
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
import {
  EXTRA_DOORS,
  LIST_SIZE,
  readExtra,
  SECTION_OF_DOOR,
  type ExtraDoor,
  type ExtraSection,
} from './list-my-work-extra'
import { shrinkRows } from './shrink-rows'

/** `list_my_work`: the asker's own open leads, open deals and next steps, never
 *  all a role may read, so a director gets their own desk and not the company.
 *  Approvals, holds and today's meetings are three more sections in
 *  `list-my-work-extra.ts`, each behind its own door and read only when its kind is named.
 *
 *  Leads: the lead book with `owner` = the asker. Deals: the deal book once per
 *  lane, `sale` and `bd` = the asker, the book's own "my deals" filters. Steps:
 *  each listed record's step through its own door, kept where the asker is the
 *  doer. No door lists steps by doer, so a step the asker does on someone else's
 *  record is missed. Trusted fields only (D5): no name, no text, never phone or
 *  email; the screen shows names from `refs`, which never reach the model. The extra
 *  sections are the one place free text appears, in an `untrusted` block. */

/** Step doors read per call, each a few queries. */
const STEP_READS = 20
const STEP_PARALLEL = 4

type Door = 'lead' | 'opportunity' | 'lead-step' | 'opportunity-step' | ExtraDoor
type Kind = NonNullable<ListMyWorkInput['kind']>

const DESK: readonly Door[] = ['lead', 'opportunity', 'lead-step', 'opportunity-step']
const DOORS: Record<Kind | 'all', readonly Door[]> = {
  lead: ['lead'],
  opportunity: ['opportunity'],
  'next-step': ['lead', 'lead-step', 'opportunity', 'opportunity-step'],
  approval: ['approvalWaiting', 'approvalRaised'],
  parked: ['hold'],
  meeting: ['meeting'],
  /* The extra sections are named, never defaulted: a plain call keeps the desk's size. */
  all: DESK,
}

/** Every row list `list_my_work` prints, for `shrink`; a kind not read leaves its path empty. */
const WORK_LISTS = [
  ['trusted', 'leads'],
  ['trusted', 'opportunities'],
  ['trusted', 'nextSteps'],
  ['approvals', 'waitingOnMe', 'rows'],
  ['approvals', 'raisedByMe', 'rows'],
  ['holds', 'rows'],
] as const

/** What the model is told was not read: a step door is a lead or deal part. */
const SECTION_OF: Record<Door, 'lead' | 'opportunity' | ExtraSection> = {
  lead: 'lead',
  'lead-step': 'lead',
  opportunity: 'opportunity',
  'opportunity-step': 'opportunity',
  ...SECTION_OF_DOOR,
}

/** The kinds that read the lead and deal books; the others read none of them. */
const onDesk = (kind: ListMyWorkInput['kind']): boolean =>
  kind === undefined || kind === 'lead' || kind === 'opportunity' || kind === 'next-step'

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
  /** The approval, hold and meeting services are fetched through it, per section. */
  modules: ModuleRef
  mayReach: (who: Actor) => boolean
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

/** `run`'s counts read backwards: with every desk kind, the books' rows each carry one
 *  distinct code and the steps none; every row of a named section or step list is one read. */
const readsOf = (
  { kind }: ListMyWorkInput,
  { rowCount, codes }: { rowCount: number; codes: readonly string[] },
): FooterReads => {
  switch (kind) {
    case undefined:
      return { 'next-step': Math.max(0, rowCount - codes.length) }
    case 'next-step':
      return { 'next-step': rowCount }
    case 'approval':
      return { approval: rowCount }
    case 'parked':
      return { hold: rowCount }
    case 'meeting':
      return { meeting: rowCount }
    default:
      return {}
  }
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
    kind === 'lead' || kind === 'opportunity' || !onDesk(kind)
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
  const extra = await readExtra(d, who, kind, open)
  const books = onDesk(kind) && kind !== 'next-step' ? [leads, deals] : []
  const deskRefs = kind === 'next-step' ? steps.map((s) => s.ref) : [...leadRefs, ...dealRefs]
  const refs = [...(onDesk(kind) ? deskRefs : []), ...extra.refs]
  /* A kind behind a refused door is unknown, not empty: the model must say so. */
  const shut = DOORS[kind ?? 'all']
    .filter((door) => !open.has(door))
    .map((door) => SECTION_OF[door])
  const skipped = [...new Set([...shut, ...extra.refused])]
  const desk = {
    leads: books.length > 0 ? leads.rows.map((r) => LeadTrusted.parse(r)) : [],
    opportunities: books.length > 0 ? deals.rows.map((r) => DealTrusted.parse(r)) : [],
    nextSteps: steps.map(({ ref, step }) => StepTrusted.parse({ ...step, code: ref.code })),
    /* A step list is cut when its books were, or when the step budget ran out. */
    more: leads.more || deals.more || cut,
  }
  const rowCount = desk.leads.length + desk.opportunities.length + steps.length + extra.rowCount
  return {
    data: { trusted: onDesk(kind) ? { skipped, ...desk } : { skipped }, ...extra.data },
    codes: [...new Set(refs.map((r) => r.code))],
    rowCount,
    hidden: books.length > 0 ? leads.hidden + deals.hidden : null,
    refs,
  }
}

const DOOR_MAP: Record<Door, ToolDoor> = {
  lead: door(LeadController, 'book'),
  opportunity: door(OpportunityController, 'book'),
  'lead-step': door(NextStepController, 'get'),
  'opportunity-step': door(OpportunityStepController, 'get'),
  ...EXTRA_DOORS,
}

export const listMyWork = (d: WorkDoors): AssistantTool =>
  defineTool({
    name: 'list_my_work',
    description:
      "The asker's own open leads, open opportunities and next steps they must do, as codes, states and dates. No names on those rows: read one with get_record. Approval, parked and meeting are read only when named: approval = requests waiting for their decision and ones they raised; parked = their own holds; meeting = their next meeting today and how many follow.",
    input: ListMyWorkInput,
    doors: DOOR_MAP,
    /* A service-level refusal of a section is reported in `skipped`, not as a failed call. */
    optional: Object.keys(EXTRA_DOORS) as ExtraDoor[],
    doorFor: (input) => DOORS[input.kind ?? 'all'],
    run: (who, input, open) => run(d, who, input, open),
    readsOf,
    /* These sections are counted by `readsOf`; their refs must not count a second time. */
    refsCounted: (input) =>
      input.kind === 'approval' || input.kind === 'parked' || input.kind === 'meeting'
        ? 'none'
        : 'all',
    shrink: (output, fits) => shrinkRows(output, WORK_LISTS, fits),
  })
