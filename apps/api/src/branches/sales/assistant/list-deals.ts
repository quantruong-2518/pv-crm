import {
  ListDealsInput,
  NextStep,
  OpportunityBookQuery,
  OpportunityBookRow,
  PipelinePositionView,
  type AssistantRef,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { maskContact } from '@api/platform/assistant/assistant-contact'
import {
  defineTool,
  door,
  type AssistantTool,
  type ToolRead,
} from '@api/platform/assistant/assistant-tools'
import { zod } from '@api/platform/http/zod.pipe'
import { OpportunityController } from '../opportunity/opportunity.controller'
import type { OpportunityService } from '../opportunity/opportunity.service'
import { LIST_SIZE } from './list-my-work-extra'
import { QUIET, READ_SIZE } from './list-my-work-today'
import { shrinkRows } from './shrink-rows'

/** `list_deals`: the open deals the asker may see across the room, read through the
 *  opportunity book as the asker, so its scope is the only fence: no second door, no
 *  repository read. One book call per question.
 *
 *  `closing` is the book's own `expectedTo`. `stale`, `step-due` and the `quiet` order
 *  have no book filter, so they pick from a wider read and say `more` when the book
 *  held rows that read did not reach. `codes` are the kept deals', which `get_record`
 *  and a reload re-check through the same book. */

const DealTrusted = OpportunityBookRow.pick({
  code: true,
  leadCode: true,
  stage: true,
  daysInStage: true,
  amount: true,
  currency: true,
  probability: true,
  expectedClose: true,
  lastActivityAt: true,
  activityFreshness: true,
}).extend({
  nextStep: NextStep.pick({ due: true, dueLevel: true }).nullable(),
  stageOverdueBy: PipelinePositionView.shape.overdueBy,
  stageLimitDays: PipelinePositionView.shape.limitDays,
})

export type DealsDeps = {
  deals: OpportunityService
  refOf: (who: Actor, kind: AssistantRef['kind'], code: string, label: string) => AssistantRef
  mayReach: (who: Actor) => boolean
}

/** A deal never touched is not the quietest one: blanks go last. */
const quietest = (a: OpportunityBookRow, b: OpportunityBookRow) =>
  (a.lastActivityAt ?? '\uffff').localeCompare(b.lastActivityAt ?? '\uffff')

const kept = (input: ListDealsInput) => (r: OpportunityBookRow) => {
  if (input.focus === 'stale') return r.activityFreshness !== null && QUIET.has(r.activityFreshness)
  if (input.focus !== 'step-due') return true
  return r.nextStep !== null && r.nextStep.due <= (input.by ?? '')
}

async function run(d: DealsDeps, who: Actor, input: ListDealsInput): Promise<ToolRead> {
  const sort = input.sort ?? 'amount'
  const wide = input.focus === 'stale' || input.focus === 'step-due' || sort === 'quiet'
  const ask = {
    state: 'open',
    q: input.query,
    expectedTo: input.focus === 'closing' ? input.by : undefined,
    sort: sort === 'expectedClose' ? 'expectedClose' : 'amount',
    dir: sort === 'expectedClose' ? 'asc' : 'desc',
    size: wide ? READ_SIZE : LIST_SIZE,
  }
  const page = await d.deals.book(
    who,
    zod(OpportunityBookQuery).transform(
      Object.fromEntries(Object.entries(ask).filter(([, value]) => value !== undefined)),
    ),
  )
  const picked = page.rows.filter(kept(input))
  const all = sort === 'quiet' ? picked.sort(quietest) : picked
  const rows = all.slice(0, LIST_SIZE)
  const raw = rows.map((r) => ({
    name: r.name,
    account: r.account,
    holder: r.holder?.name,
    nextStep: r.nextStep?.text,
  }))
  const shown = d.mayReach(who) ? raw : (maskContact(raw) as typeof raw)
  const withheld = JSON.stringify(shown) !== JSON.stringify(raw)
  return {
    data: {
      deals: {
        trusted: { more: page.total > page.rows.length || all.length > LIST_SIZE },
        rows: rows.map((r, i) => ({
          trusted: DealTrusted.parse({
            ...r,
            stageOverdueBy: r.position?.overdueBy ?? null,
            stageLimitDays: r.position?.limitDays ?? null,
          }),
          untrusted: shown[i],
        })),
      },
      ...(withheld && { contactInfoWithheld: true }),
    },
    codes: rows.map((r) => r.code),
    rowCount: rows.length,
    hidden: page.hidden,
    refs: rows.map((r) => d.refOf(who, 'opportunity', r.code, r.name)),
  }
}

export const listDeals = (d: DealsDeps): AssistantTool =>
  defineTool({
    name: 'list_deals',
    description:
      "The open opportunities the asker may see across the room, not only their own, as codes with stage, amount, probability, expected close, next step, last customer activity, and stageOverdueBy: days past the stage's limit (null: no limit). focus stale: no recent customer activity; step-due: next step due by the day by, or late; closing: expected to close by the day by. sort amount (default), expectedClose, or quiet (oldest activity first). Read one with get_record and its history with get_history.",
    input: ListDealsInput,
    doors: { deals: door(OpportunityController, 'book') },
    doorFor: () => 'deals',
    run: (who, input) => run(d, who, input),
    shrink: (output, fits) => shrinkRows(output, [['deals', 'rows']], fits),
  })
