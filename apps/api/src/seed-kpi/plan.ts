import type { TouchKind } from '@pv/contracts'
import type { approval, approvalLink } from '@api/platform/approval/approval.schema'
import type { debrief, link, message, thread } from '@api/platform/comms/comms.schema'
import type { edge, objectRef } from '@api/platform/db/platform.schema'
import type { account } from '@api/branches/sales/account/account.schema'
import type { campaign, campaignMember } from '@api/branches/sales/campaign/campaign.schema'
import type { contact } from '@api/branches/sales/contact/contact.schema'
import type {
  contract,
  contractInstallment,
  installmentOverdueReason,
} from '@api/branches/sales/contract/contract.schema'
import type { lead } from '@api/branches/sales/lead/lead.schema'
import type { meeting, meetingAttendee } from '@api/branches/sales/meeting/meeting.schema'
import type {
  opportunity,
  opportunityOwner,
  opportunityStageEvent,
} from '@api/branches/sales/opportunity/opportunity.schema'
import type { quotation } from '@api/branches/sales/quotation/quotation.schema'
import type { touch } from '@api/branches/sales/touch/touch.schema'
import type { workstream } from '@api/branches/sales/workstream/workstream.schema'
import type { contractParticipant } from '@api/branches/sales/contract/contract-participant.schema'

/** The rows one run of the book writes, grouped by table in insert order,
 *  plus what builds them: a code minter and the names of every hand. */

type Ins<T extends { $inferInsert: unknown }> = T['$inferInsert'][]

export type Plan = {
  campaigns: Ins<typeof campaign>
  objects: Ins<typeof objectRef>
  accounts: Ins<typeof account>
  workstreams: Ins<typeof workstream>
  leads: Ins<typeof lead>
  contacts: Ins<typeof contact>
  edges: Ins<typeof edge>
  members: Ins<typeof campaignMember>
  deals: Ins<typeof opportunity>
  owners: Ins<typeof opportunityOwner>
  moves: Ins<typeof opportunityStageEvent>
  contracts: Ins<typeof contract>
  participants: Ins<typeof contractParticipant>
  terms: Ins<typeof contractInstallment>
  excuses: Ins<typeof installmentOverdueReason>
  quotations: Ins<typeof quotation>
  touches: Ins<typeof touch>
  meetings: Ins<typeof meeting>
  attendees: Ins<typeof meetingAttendee>
  /** One member identity per seeded owner of a logged exchange, by actor id. */
  speakers: string[]
  threads: Ins<typeof thread>
  /** `from_identity_id` is resolved at write time from `fromActorId`. */
  messages: (Omit<Ins<typeof message>[number], 'fromIdentityId'> & { fromActorId: string })[]
  links: Ins<typeof link>
  debriefs: Ins<typeof debrief>
  approvals: Ins<typeof approval>
  approvalLinks: Ins<typeof approvalLink>
}

export const emptyPlan = (): Plan => ({
  campaigns: [],
  objects: [],
  accounts: [],
  workstreams: [],
  leads: [],
  contacts: [],
  edges: [],
  members: [],
  deals: [],
  owners: [],
  moves: [],
  contracts: [],
  participants: [],
  terms: [],
  excuses: [],
  quotations: [],
  touches: [],
  meetings: [],
  attendees: [],
  speakers: [],
  threads: [],
  messages: [],
  links: [],
  debriefs: [],
  approvals: [],
  approvalLinks: [],
})

/** The human code families the book mints, each off its own sequence. */
export const SEQUENCES = {
  AC: 'sales.account_code_seq',
  WS: 'sales.workstream_code_seq',
  LD: 'sales.lead_code_seq',
  CT: 'sales.contact_code_seq',
  OP: 'sales.opportunity_code_seq',
  HĐ: 'sales.contract_code_seq',
  CP: 'sales.campaign_code_seq',
} as const
export type CodeKind = keyof typeof SEQUENCES
export type Mint = (kind: CodeKind) => string

/** A person as a row names them: the id keeps the book, the name is a snapshot. */
export type Hand = { id: string; name: string }

export type Ctx = {
  plan: Plan
  mint: Mint
  hand: (id: string) => Hand
  /** `lead_origin.id` by its name; absent names are left NULL. */
  origin: ReadonlyMap<string, string>
  /** The campaign each seeded marketer's leads join. */
  campaignOf: ReadonlyMap<string, string>
}

export function pushTouch(
  ctx: Ctx,
  subject: { code: string; kind: 'lead' | 'opportunity' },
  kind: TouchKind,
  at: Date,
  by: Hand | null,
  note: string,
  extra: Partial<Ins<typeof touch>[number]> = {},
): void {
  ctx.plan.touches.push({
    subjectCode: subject.code,
    subjectKind: subject.kind,
    kind,
    at,
    /* The machine's own moves (a lead parked when its last deal stopped) name nobody. */
    by: by?.name ?? 'Trợ lý AI',
    actorId: by?.id ?? null,
    note,
    ...extra,
  })
}
