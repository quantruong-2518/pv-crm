import { Injectable } from '@nestjs/common'
import { stepLevelOf } from '@pv/engines'
import {
  CARE_ACTIVITY_KINDS,
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  type OpportunityContact,
  type OpportunityRow,
  type TouchKind,
} from '@pv/contracts'
import { customerOf } from './opportunity-opening.service'
import { OpportunityFactsRepository, type ContactRead } from './opportunity-facts.repository'
import { MILESTONE_TOUCH, toContract, type RowFactKey } from './opportunity.mapper'

/** The facts an `OpportunityRow` carries beside its own columns — run, care
 *  counts, quotation rounds, next step, primary contact, stop label — read for
 *  a whole page at once and joined onto `toContract`'s row. Every door that
 *  answers with a row answers through `rows`, so no door forgets one. */

type RowInput = Parameters<typeof toContract>[0]
type RowFacts = Pick<OpportunityRow, RowFactKey>

const QUOTATION: TouchKind = MILESTONE_TOUCH.quotation
const COUNTED: TouchKind[] = [...CARE_ACTIVITY_KINDS.map((k) => MILESTONE_TOUCH[k]), QUOTATION]

@Injectable()
export class OpportunityFacts {
  constructor(private readonly repo: OpportunityFactsRepository) {}

  /** `toContract` plus the facts, one grouped read per fact for the whole list,
   *  in input order. */
  async rows(inputs: readonly RowInput[]): Promise<OpportunityRow[]> {
    const facts = await this.factsOf(inputs)
    return inputs.map((input) => ({ ...toContract(input), ...facts(input) }))
  }

  async row(input: RowInput): Promise<OpportunityRow | undefined> {
    return (await this.rows([input]))[0]
  }

  /** The live `LOSS_REASON` catalogue — the stop drawer's choices. */
  stopReasons() {
    return this.repo.stopReasons()
  }

  /** The deal's own contact list, primary first — or, on a deal opened before
   *  ADR 0073 with none, its lead's first contact standing as the primary. */
  async contacts(input: RowInput): Promise<OpportunityContact[]> {
    const [own, fromLead] = await Promise.all([
      this.repo.dealContacts([input.row.code], false),
      this.repo.leadContacts([input.row.leadCode]),
    ])
    const list = own.length > 0 ? own : fromLead.map((c) => ({ ...c, role: null, primary: true }))
    return list.map(contactOf)
  }

  private async factsOf(inputs: readonly RowInput[]): Promise<(input: RowInput) => RowFacts> {
    const codes = inputs.map((i) => i.row.code)
    const unique = (xs: (string | null)[]) => [...new Set(xs.filter((x) => x !== null))]
    const [counts, steps, contacts, leadContacts, runs, reasons] = await Promise.all([
      this.repo.touchCounts(codes, COUNTED),
      this.repo.nextSteps(codes),
      this.repo.dealContacts(codes, true),
      this.repo.leadContacts(unique(inputs.map((i) => i.row.leadCode))),
      this.repo.runs(unique(inputs.map((i) => i.row.workstreamCode))),
      this.repo.lossReasons(
        unique(inputs.map((i) => i.row.stopReason)).filter(
          (k) => k !== OPPORTUNITY_STOP_REASON_OTHER,
        ),
      ),
    ])
    const tally = (code: string, kind: TouchKind) =>
      counts.find((c) => c.code === code && c.kind === kind)?.n ?? 0

    return ({ row, contractCodes }) => {
      const step = steps.find((s) => s.code === row.code)
      const open = row.state !== 'lost' && contractCodes.length === 0
      const run = runs.find((r) => r.code === row.workstreamCode)
      const primary =
        contacts.find((c) => c.deal === row.code) ??
        leadContacts.find((c) => c.lead === row.leadCode)
      return {
        workstream: run
          ? {
              code: run.code,
              ordinal: run.ordinal,
              customer: customerOf(run.accountCode !== null, run.wonBefore),
            }
          : null,
        activityCounts: Object.fromEntries(
          CARE_ACTIVITY_KINDS.map((k) => [k, tally(row.code, MILESTONE_TOUCH[k])]),
        ) as RowFacts['activityCounts'],
        quotationRounds: tally(row.code, QUOTATION),
        /* A step left on a stopped or signed deal is not shown — next-step's rule. */
        nextStep:
          step && open
            ? { text: step.text, due: step.due, dueLevel: stepLevelOf(step.due, step.today) }
            : null,
        primaryContact: primary
          ? { code: primary.code, name: primary.name, email: blank(primary.email) }
          : null,
        stopReasonLabel: row.stopReason
          ? row.stopReason === OPPORTUNITY_STOP_REASON_OTHER
            ? OPPORTUNITY_STOP_REASON_OTHER_LABEL
            : (reasons.get(row.stopReason)?.name ?? row.stopReason)
          : null,
        stopDoNotContact: row.stopReason
          ? (reasons.get(row.stopReason)?.doNotContact ?? false)
          : null,
      }
    }
  }
}

/** An empty string is "not given" on the wire, never a value. */
const blank = (s: string | null): string | null => (s === null || s.trim() === '' ? null : s)

const contactOf = (c: ContactRead): OpportunityContact => ({
  code: c.code,
  name: c.name,
  title: blank(c.title),
  phone: blank(c.phone),
  email: blank(c.email),
  role: c.role,
  primary: c.primary,
})
