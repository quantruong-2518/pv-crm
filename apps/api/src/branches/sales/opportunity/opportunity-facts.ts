import { Injectable } from '@nestjs/common'
import { stepLevelOf } from '@pv/engines'
import {
  CARE_ACTIVITY_KINDS,
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  type ActivityFreshness,
  type ActivityFreshnessLevel,
  type OpportunityBookRow,
  type OpportunityContact,
  type OpportunityRow,
  type ThreadChannel,
  type TouchKind,
} from '@pv/contracts'
import type { ApprovalRowDb } from '@api/platform/approval/approval.schema'
import { SettingService } from '@api/platform/setting/setting.service'
import { activityFreshnessOf } from '../config/activity-freshness'
import { vnDay } from './opportunity-lifecycle'
import { customerOf } from './opportunity-opening.service'
import { OpportunityFactsRepository, type ContactRead } from './opportunity-facts.repository'
import { MILESTONE_TOUCH, toContract, type RowFactKey } from './opportunity.mapper'

/** The facts an `OpportunityRow` carries beside its own columns — run, care
 *  counts, quotation rounds, next step, primary contact, stop label — read for
 *  a whole page at once and joined onto `toContract`'s row. Every door that
 *  answers with a row answers through `rows`, so no door forgets one. */

type RowInput = Parameters<typeof toContract>[0]
type RowFacts = Pick<OpportunityRow, RowFactKey>

type BookFacts = Pick<OpportunityBookRow, 'lastActivityAt' | 'activityFreshness' | 'pendingSign'>

const QUOTATION: TouchKind = MILESTONE_TOUCH.quotation
const COUNTED: TouchKind[] = [...CARE_ACTIVITY_KINDS.map((k) => MILESTONE_TOUCH[k]), QUOTATION]
/* The book's last-activity column (ADR 0077 §4): calls, meetings, mail and Zalo with the
   customer, plus care and quotations. Telegram and in-app are not the customer. */
const CUSTOMER_CHANNELS: ThreadChannel[] = ['phone', 'zalo-oa', 'email', 'meeting']
const DAY_MS = 86_400_000

@Injectable()
export class OpportunityFacts {
  constructor(
    private readonly repo: OpportunityFactsRepository,
    private readonly settings: SettingService,
  ) {}

  /** `toContract` plus the facts, one grouped read per fact for the whole list,
   *  in input order. */
  async rows(inputs: readonly RowInput[]): Promise<OpportunityRow[]> {
    const facts = await this.factsOf(inputs)
    return inputs.map((input) => ({ ...toContract(input), ...facts(input) }))
  }

  async row(input: RowInput): Promise<OpportunityRow | undefined> {
    return (await this.rows([input]))[0]
  }

  /** What only the book row carries. Reads once per page by code, so it runs
   *  beside `rows()`; the answer judges each row with its `waiting` approvals. */
  async bookFacts(
    codes: readonly string[],
  ): Promise<(row: OpportunityRow, waiting: readonly ApprovalRowDb[]) => BookFacts> {
    const [last, threshold] = await Promise.all([
      this.repo.lastActivity(codes, COUNTED, CUSTOMER_CHANNELS),
      activityFreshnessOf(this.settings),
    ])
    const today = vnDay(new Date())
    return (row, waiting) => {
      const at = last.get(row.code) ?? null
      return {
        lastActivityAt: at?.toISOString() ?? null,
        /* A deal nobody has worked yet is as stale as it is old. */
        activityFreshness:
          row.state === 'open'
            ? levelOf(at ? vnDay(at) : vnDay(new Date(row.createdAt)), today, threshold)
            : null,
        pendingSign: waiting.some((a) => a.kind === 'contract-sign'),
      }
    }
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

    return ({ row }) => {
      const step = steps.find((s) => s.code === row.code)
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
        nextStep:
          step && row.state === 'open'
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

/** Whole VN calendar days from `since` to `today`, against the two dials. */
function levelOf(since: string, today: string, t: ActivityFreshness): ActivityFreshnessLevel {
  const days = (Date.parse(today) - Date.parse(since)) / DAY_MS
  return days >= t.alertDays ? 'alert' : days >= t.warnDays ? 'warn' : 'fresh'
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
