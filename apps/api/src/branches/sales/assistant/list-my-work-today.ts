import {
  AssistantReadKind,
  ContractBookQuery,
  ContractRow,
  LinkableCode,
  Moment,
  OpportunityBookQuery,
  OpportunityBookRow,
  PendingDebriefQuery,
  PendingDebriefRow,
  type AssistantRef,
  type ListMyWorkInput,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { z } from 'zod'
import { door, type WorkItem } from '@api/platform/assistant/assistant-tools'
import { maskContact } from '@api/platform/assistant/assistant-contact'
import { DebriefController } from '@api/platform/comms/debrief.controller'
import { DebriefService } from '@api/platform/comms/debrief.service'
import { zod } from '@api/platform/http/zod.pipe'
import { ContractController } from '../contract/contract.controller'
import type { ContractService } from '../contract/contract.service'
import { OpportunityController } from '../opportunity/opportunity.controller'
import type { OpportunityService } from '../opportunity/opportunity.service'
import { LIST_SIZE, soft, type Extra, type ExtraDeps } from './list-my-work-extra'
import { kindOfCode } from './record-read-kit'

/** The three sections of `list_my_work` that ADR 0154 added: deals gone quiet, debriefs
 *  past their day and overdue contracts. Each is read only when named, behind its own
 *  door key even where another section shares the handler, so a service refusal reads
 *  as `refused` and never fails the call.
 *
 *  Stored codes are those the re-check door reaches for the same asker: a deal through
 *  the deal book, a contract through the contract book, whose fence admits the closer and
 *  the payment PIC alike. A debrief's subject is NOT stored: its owner may not see that
 *  record's book, and one code the door misses would withhold the whole chat. */

export type TodaySection = 'stale-deal' | 'late-debrief' | 'overdue-contract'

export const TODAY_DOORS = {
  staleDeal: door(OpportunityController, 'book'),
  lateDebrief: door(DebriefController, 'pending'),
  overdueContract: door(ContractController, 'book'),
} as const
export type TodayDoor = keyof typeof TODAY_DOORS

export const SECTION_OF_TODAY_DOOR: Record<TodayDoor, TodaySection> = {
  staleDeal: 'stale-deal',
  lateDebrief: 'late-debrief',
  overdueContract: 'overdue-contract',
}
const DOOR_OF: Record<TodaySection, TodayDoor> = {
  'stale-deal': 'staleDeal',
  'late-debrief': 'lateDebrief',
  'overdue-contract': 'overdueContract',
}

export type TodayDeps = ExtraDeps & {
  opportunities: OpportunityService
  contracts: ContractService
}

/** A page reads wider than the list: the quiet, late or overdue ones are picked after it. */
export const READ_SIZE = 100
export const QUIET: ReadonlySet<string> = new Set(['warn', 'alert'])

const StaleTrusted = OpportunityBookRow.pick({
  code: true,
  stage: true,
  activityFreshness: true,
  lastActivityAt: true,
  daysInStage: true,
})
const OverdueTrusted = ContractRow.pick({ code: true, amount: true, currency: true }).extend({
  nextDue: Moment.nullable(),
})
const DebriefTrusted = PendingDebriefRow.pick({ anchorAt: true, state: true }).extend({
  subject: z.object({ kind: AssistantReadKind, code: LinkableCode }),
})

type Part = Pick<Extra<TodaySection>, 'data' | 'rowCount' | 'refs' | 'workItems'> & {
  keep: boolean
  /** The page the door gave was smaller than what it holds, so the items undercount. */
  cut: boolean
}

const byOldest = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').localeCompare(b ?? '')

async function staleDeals(d: TodayDeps, who: Actor): Promise<Part | null> {
  const lane = (key: 'sale' | 'bd') =>
    d.opportunities.book(
      who,
      zod(OpportunityBookQuery).transform({ [key]: who.id, state: 'open', size: READ_SIZE }),
    )
  const pages = await soft(() => Promise.all([lane('sale'), lane('bd')]))
  if (!pages) return null
  const merged = new Map(pages.flatMap((p) => p.rows).map((r) => [r.code, r]))
  const quiet = [...merged.values()]
    .filter((r) => r.activityFreshness && QUIET.has(r.activityFreshness))
    .sort((a, b) => byOldest(a.lastActivityAt, b.lastActivityAt))
  const rows = quiet.slice(0, LIST_SIZE)
  const cut = pages.some((p) => p.total > p.rows.length)
  return {
    data: {
      staleDeals: {
        rows: rows.map((r) => ({ trusted: StaleTrusted.parse(r) })),
        more: cut || quiet.length > LIST_SIZE,
      },
    },
    rowCount: rows.length,
    refs: rows.map((r) => d.refOf(who, 'opportunity', r.code, r.name)),
    workItems: quiet.map((r) => ({ section: 'stale-deal', code: r.code })),
    keep: true,
    cut,
  }
}

async function overdueContracts(d: TodayDeps, who: Actor): Promise<Part | null> {
  const read = (key: 'owner' | 'collector') =>
    d.contracts.book(
      who,
      zod(ContractBookQuery).transform({ status: 'overdue', [key]: who.id, size: READ_SIZE }),
    )
  const pages = await soft(() => Promise.all([read('owner'), read('collector')]))
  if (!pages) return null
  /* The earliest unpaid installment is the one that fell overdue first. */
  const nextDue = (r: (typeof pages)[number]['rows'][number]) =>
    r.installments
      ?.filter((i) => !i.paidAt)
      .map((i) => i.due)
      .sort(byOldest)[0] ?? null
  const merged = new Map(pages.flatMap((p) => p.rows).map((r) => [r.code, r]))
  const all = [...merged.values()].sort((a, b) => byOldest(nextDue(a), nextDue(b)))
  const rows = all.slice(0, LIST_SIZE)
  const cut = pages.some((p) => p.total > p.rows.length)
  return {
    data: {
      overdueContracts: {
        rows: rows.map((r) => ({ trusted: OverdueTrusted.parse({ ...r, nextDue: nextDue(r) }) })),
        more: cut || all.length > LIST_SIZE,
      },
    },
    rowCount: rows.length,
    refs: rows.map((r) => d.refOf(who, 'contract', r.code, r.customer)),
    workItems: all.map((r) => ({ section: 'overdue-contract', code: r.code })),
    keep: true,
    cut,
  }
}

/** One item per late debrief; a subject's first carries its code, so the chip prints once. */
function debriefItems(late: readonly { subject: { code: string } }[]): WorkItem[] {
  const seen = new Set<string>()
  return late.map(({ subject }) => {
    const first = !seen.has(subject.code)
    seen.add(subject.code)
    return {
      section: 'late-debrief',
      code: first && kindOfCode(subject.code) ? subject.code : null,
    }
  })
}

async function lateDebriefs(d: TodayDeps, who: Actor): Promise<Part | null> {
  const page = await soft(() =>
    d.modules
      .get(DebriefService, { strict: false })
      .pending(who, zod(PendingDebriefQuery).transform({ size: READ_SIZE })),
  )
  if (!page) return null
  const lateAll = page.rows.filter((r) => r.late)
  const late = lateAll.flatMap((r) => {
    const kind = kindOfCode(r.subject.code)
    return kind ? [{ row: r, kind }] : []
  })
  const rows = late.slice(0, LIST_SIZE)
  const shown = d.mayReach(who) ? <T>(v: T) => v : <T>(v: T) => maskContact(v) as T
  /* One chip per subject, however many debriefs wait on it. */
  const refs = new Map<string, AssistantRef>(
    rows.map(({ row, kind }) => [
      row.subject.code,
      d.refOf(who, kind, row.subject.code, row.subject.label),
    ]),
  )
  return {
    data: {
      lateDebriefs: {
        rows: rows.map(({ row, kind }) => ({
          trusted: DebriefTrusted.parse({ ...row, subject: { kind, code: row.subject.code } }),
          untrusted: shown({ subject: row.subject.label }),
        })),
        more: page.total > page.rows.length || late.length > LIST_SIZE,
      },
    },
    rowCount: rows.length,
    refs: [...refs.values()],
    workItems: debriefItems(lateAll),
    keep: false,
    cut: page.total > page.rows.length,
  }
}

const READERS: Record<TodaySection, (d: TodayDeps, who: Actor) => Promise<Part | null>> = {
  'stale-deal': staleDeals,
  'late-debrief': lateDebriefs,
  'overdue-contract': overdueContracts,
}

/** Reads the one named section, if its door is open; any other kind reads nothing. */
export async function readToday(
  d: TodayDeps,
  who: Actor,
  kind: ListMyWorkInput['kind'],
  open: { has(door: TodayDoor): boolean },
): Promise<Extra<TodaySection>> {
  const empty: Extra<TodaySection> = {
    data: {},
    refused: [],
    rowCount: 0,
    refs: [],
    codes: [],
    workItems: [],
    workCut: [],
  }
  if (kind !== 'stale-deal' && kind !== 'late-debrief' && kind !== 'overdue-contract') return empty
  if (!open.has(DOOR_OF[kind])) return empty
  const part = await READERS[kind](d, who)
  if (!part) return { ...empty, refused: [kind] }
  const { keep, cut, ...rest } = part
  return {
    ...empty,
    ...rest,
    codes: keep ? rest.refs.map((r) => r.code) : [],
    workCut: cut ? [kind] : [],
  }
}
