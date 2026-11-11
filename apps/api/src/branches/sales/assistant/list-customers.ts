import {
  AfterSaleBookQuery,
  AfterSaleRow,
  AfterSaleTemperatureReading,
  ListCustomersInput,
  NextStep,
  type AssistantRef,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { maskContact } from '@api/platform/assistant/assistant-contact'
import {
  defineTool,
  door,
  inPool,
  type AssistantTool,
  type ToolRead,
} from '@api/platform/assistant/assistant-tools'
import { denied, PvError } from '@api/platform/http/problem'
import { zod } from '@api/platform/http/zod.pipe'
import { AfterSaleController } from '../after-sale/after-sale.controller'
import type { AfterSaleService } from '../after-sale/after-sale.service'
import { LeadController } from '../lead/lead.controller'

/** `list_customers`: the bought customers the asker may see in the after-sale book.
 *
 *  That door asks `contract.view` but prints lead data, so both doors must pass and
 *  each row's lead is read again as the asker: in the lead book, and for a code the
 *  book left out, through the lead read fence, which also admits a carer or a deal
 *  holder (ADR 0121 §6-7). A row no door returns is dropped and counted in `hidden`.
 *  No `collected`: the door sums every contract of the lead, past an ownOnly scope.
 *
 *  `codes` are the kept rows' lead codes, which `get_record` re-checks: a run code maps
 *  to no kind. No `count` in `trusted`: the door's total counts rows this re-check may
 *  drop, so `rows` and `hidden` give the counts and `more` says only that a page follows.
 *  `hidden` and `more` come from the `contract.view` book, so any page with a row is
 *  withheld from a reader who loses that permission, even if every row was dropped. */

/** Rows per call: a longer book says `more` and the model asks narrower. */
const LIST_SIZE = 20
/** Profile reads at once for the codes the book left out. */
const READ_PARALLEL = 4

const CustomerTrusted = AfterSaleRow.pick({
  code: true,
  leadCode: true,
  lastContactAt: true,
  nextCareOn: true,
  careDue: true,
  completedAt: true,
}).extend({
  temperature: AfterSaleTemperatureReading.pick({ value: true, at: true }).nullable(),
  nextStep: NextStep.pick({ due: true, dueLevel: true }).nullable(),
})

export type CustomerDoors = {
  customers: AfterSaleService
  /** The lead book as the asker; the after-sale book holds live leads only. */
  bookLeads: (
    who: Actor,
    ask: { codes: string; size: number },
  ) => Promise<{ rows: readonly { code: string }[] }>
  /** The lead read fence as the asker: it throws 403 or 404 for a lead not theirs. */
  openLead: (who: Actor, code: string) => Promise<unknown>
  refOf: (who: Actor, kind: AssistantRef['kind'], code: string, label: string) => AssistantRef
  mayReach: (who: Actor) => boolean
}

/** The lead codes the asker may open: the book's answer, then the profile door for
 *  the rest. Only a 403 or 404 shuts a code; any other failure fails the call. */
async function reachable(
  d: CustomerDoors,
  who: Actor,
  codes: readonly string[],
  open: ReadonlySet<string>,
): Promise<Set<string>> {
  const reach = new Set<string>()
  if (codes.length === 0) return reach
  const book = await d.bookLeads(who, { codes: codes.join(','), size: codes.length })
  for (const { code } of book.rows) reach.add(code)
  if (!open.has('profile')) return reach
  await inPool(
    codes.filter((code) => !reach.has(code)),
    READ_PARALLEL,
    async (code) => {
      try {
        await d.openLead(who, code)
        reach.add(code)
      } catch (error) {
        if (!(error instanceof PvError) || ![403, 404].includes(error.getStatus())) throw error
      }
    },
  )
  return reach
}

async function run(
  d: CustomerDoors,
  who: Actor,
  input: ListCustomersInput,
  open: ReadonlySet<string>,
): Promise<ToolRead> {
  /* Either door alone must not read the book: the lead half is the lead door's data. */
  if (!open.has('customers') || !open.has('leads')) throw denied('permission-denied')
  const ask = {
    temperature: input.temperature,
    care: input.care,
    q: input.query,
    carer: input.mine ? who.id : undefined,
    size: LIST_SIZE,
  }
  const page = await d.customers.book(
    who,
    zod(AfterSaleBookQuery).transform(
      Object.fromEntries(Object.entries(ask).filter(([, value]) => value !== undefined)),
    ),
  )
  const reach = await reachable(d, who, [...new Set(page.rows.map((r) => r.leadCode))], open)
  /* A row with no lead read back could never be re-checked once stored: not shown at all. */
  const kept = page.rows.filter((r) => reach.has(r.leadCode))
  const raw = kept.map((r) => ({
    customer: r.customer,
    carers: r.carers.map((c) => c.name),
    temperatureBy: r.temperature?.by.name,
    nextStep: r.nextStep?.text,
  }))
  const shown = d.mayReach(who) ? raw : (maskContact(raw) as typeof raw)
  const withheld = JSON.stringify(shown) !== JSON.stringify(raw)
  const leads = new Map(kept.map((r) => [r.leadCode, r.customer]))
  return {
    data: {
      customers: {
        trusted: { more: page.total > page.rows.length },
        rows: kept.map((r, i) => ({
          trusted: CustomerTrusted.parse(r),
          untrusted: shown[i],
        })),
      },
      ...(withheld && { contactInfoWithheld: true }),
    },
    codes: [...leads.keys()],
    rowCount: kept.length,
    hidden: page.hidden + page.rows.length - kept.length,
    refs: [...leads].map(([code, customer]) => d.refOf(who, 'lead', code, customer)),
    revealsContent: page.rows.length > 0,
  }
}

export const listCustomers = (d: CustomerDoors): AssistantTool =>
  defineTool({
    name: 'list_customers',
    description:
      'The bought customers the asker may see in the after-sale book, as lead codes with their temperature, care day and next step. Filter by temperature, by care (due or upcoming), by a name or code, or mine for the ones the asker looks after. Read one with get_record.',
    input: ListCustomersInput,
    doors: {
      customers: door(AfterSaleController, 'list'),
      leads: door(LeadController, 'book'),
      profile: door(LeadController, 'profile'),
    },
    doorFor: () => ['customers', 'leads', 'profile'],
    reveals: 'contract.view',
    run: (who, input, open) => run(d, who, input, open),
  })
