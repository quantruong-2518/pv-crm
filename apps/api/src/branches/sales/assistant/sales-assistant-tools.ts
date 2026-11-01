import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  AssistantRecordKind,
  ContractCode,
  ContractDetailResponse,
  ContractTermination,
  GetRecordInput,
  InstallmentRow,
  LeadProfile,
  ObjectCode,
  OpportunityProfileResponse,
  SearchQuery,
  SearchRecordsInput,
  type SearchResult,
} from '@pv/contracts'
import { z } from 'zod'
import {
  defineTool,
  door,
  type AssistantTool,
  type AssistantToolSource,
  type ToolRead,
} from '@api/platform/assistant/assistant-tools'
import { zod } from '@api/platform/http/zod.pipe'
import { ContractController } from '../contract/contract.controller'
import { ContractService } from '../contract/contract.service'
import { LeadController } from '../lead/lead.controller'
import { LeadService } from '../lead/lead.service'
import { OpportunityController } from '../opportunity/opportunity.controller'
import { OpportunityService } from '../opportunity/opportunity.service'
import { SearchController } from '../search/search.controller'
import { SearchService } from '../search/search.service'

/** The Sales branch's tools (ADR 0133 D2, wave 0): four door methods, each taking
 *  the `Actor` first and fencing rows itself, never a sub-service.
 *
 *  A tool repeats its door's pipe (`zod(...)`), because the pipe is the door's
 *  first fence and a wrapper would skip it. A `trusted` half is the contract's own
 *  zod types picked to whitelisted ones (D5): a code, enum, date or number, so
 *  `.parse` drops the rest. All other text is `untrusted`, labels included: public
 *  intake writes `company` and the AI fill writes `legalName` from the web.
 *
 *  Phone and email come from a single-record read only. None of these four doors
 *  reports `hidden`: search drops a row it may not show, uncounted, and a profile
 *  is one row. It stays null here rather than being worked out from those. */

const LeadTrusted = LeadProfile.pick({
  code: true,
  workstreamCode: true,
  state: true,
  tier: true,
  sizeBand: true,
  signed: true,
  daysHere: true,
  stateSince: true,
  lastTouchAt: true,
  budget: true,
  currency: true,
  deadline: true,
  recontactOn: true,
  createdAt: true,
})

const OpportunityTrusted = OpportunityProfileResponse.pick({
  code: true,
  leadCode: true,
  state: true,
  contractCodes: true,
  stage: true,
  daysInStage: true,
  quotationRounds: true,
  expectedClose: true,
  amount: true,
  currency: true,
  probability: true,
  stoppedAtStage: true,
  createdAt: true,
  closedAt: true,
})

const ContractTrusted = ContractDetailResponse.pick({
  code: true,
  opportunityCode: true,
  leadCode: true,
  kind: true,
  amount: true,
  currency: true,
  signedAt: true,
}).extend({
  installments: InstallmentRow.pick({
    no: true,
    share: true,
    amount: true,
    due: true,
    paidAt: true,
  }).array(),
  termination: ContractTermination.pick({
    terminatedAt: true,
    collectedAmount: true,
    refundedAmount: true,
  }).nullable(),
})

/** A hit's `code` is a bare string in the contract: re-checked here to earn `trusted`. */
const HitTrusted = z.object({ kind: AssistantRecordKind, code: ContractCode.or(ObjectCode) })

const oneRecord = (code: string, trusted: object, untrusted: object): ToolRead => ({
  data: { trusted, untrusted },
  codes: [code],
  rowCount: 1,
  hidden: null,
})

const leadRead = (p: LeadProfile): ToolRead =>
  oneRecord(p.code, LeadTrusted.parse(p), {
    company: p.company,
    legalName: p.legalName,
    taxCode: p.taxCode,
    contactName: p.contactName,
    contactTitle: p.contactTitle,
    email: p.email,
    phone: p.phone,
    province: p.province,
    address: p.address,
    website: p.website,
    mainProduct: p.mainProduct,
    category: p.category?.name,
    industries: p.industries.map((i) => i.name),
    ownerName: p.ownerName,
    pain: p.pain,
    currentStack: p.currentStack,
    decisionMaker: p.decisionMaker,
    approver: p.approver,
  })

const opportunityRead = (p: OpportunityProfileResponse): ToolRead =>
  oneRecord(p.code, OpportunityTrusted.parse(p), {
    name: p.name,
    account: p.account,
    holder: p.holder?.name,
    owners: p.owners.map((o) => ({ name: o.name, role: o.role })),
    products: p.products.map((x) => x.name),
    description: p.description,
    nextStep: p.nextStep && { text: p.nextStep.text, due: p.nextStep.due },
    contacts: p.contacts.map((c) => ({
      name: c.name,
      title: c.title,
      role: c.role,
      phone: c.phone,
      email: c.email,
      primary: c.primary,
    })),
    stopReason: p.stopReasonLabel,
    stopNote: p.stopNote,
  })

const contractRead = (p: ContractDetailResponse): ToolRead =>
  oneRecord(p.code, ContractTrusted.parse(p), {
    customer: p.customer,
    ownerName: p.ownerName,
    collectorName: p.collectorName,
    contact: p.contact,
    contactRole: p.contactRole,
    installments: p.installments.map((i) => i.label),
    terminationReason: p.termination?.reasonLabel,
    terminationNote: p.termination?.note,
  })

/** `matched` and `score` stay behind: `matched.text` is the phone or email on a
 *  contact hit, and a deal's contact name on a deal hit. */
function searchRead(result: SearchResult): ToolRead {
  const hits = result.groups.flatMap((g) => g.hits)
  return {
    data: {
      trusted: { more: result.groups.filter((g) => g.more).map((g) => g.kind) },
      hits: hits.map((h) => ({
        trusted: HitTrusted.parse(h),
        untrusted: { title: h.title, subtitle: h.subtitle },
      })),
    },
    codes: hits.map((h) => h.code),
    rowCount: hits.length,
    hidden: null,
  }
}

@Injectable()
export class SalesAssistantTools implements AssistantToolSource {
  constructor(
    private readonly leads: LeadService,
    private readonly opportunities: OpportunityService,
    private readonly contracts: ContractService,
    private readonly searches: SearchService,
  ) {}

  tools(): readonly AssistantTool[] {
    return [
      defineTool({
        name: 'search_records',
        description:
          'Find leads, opportunities and contracts by name, code or tax code. Returns codes and names; read one with get_record.',
        input: SearchRecordsInput,
        doors: { find: door(SearchController, 'find') },
        doorFor: () => 'find',
        run: (who, input) => this.search(who, input),
      }),
      defineTool({
        name: 'get_record',
        description: 'Read one lead, opportunity or contract by its code.',
        input: GetRecordInput,
        doors: {
          lead: door(LeadController, 'profile'),
          opportunity: door(OpportunityController, 'profile'),
          contract: door(ContractController, 'profile'),
        },
        doorFor: (input) => input.kind,
        run: (who, input) => this.read(who, input),
      }),
    ]
  }

  /** The kinds go in every time: the door reads an absent `kinds` as all seven,
   *  and the `contact` kind matches on phone and email. */
  private async search(who: Actor, input: SearchRecordsInput): Promise<ToolRead> {
    const q = zod(SearchQuery).transform({
      q: input.query,
      kinds: (input.kinds ?? AssistantRecordKind.options).join(','),
    })
    return searchRead(await this.searches.search(who, q))
  }

  private async read(who: Actor, { kind, code }: GetRecordInput): Promise<ToolRead> {
    switch (kind) {
      case 'lead':
        return leadRead(await this.leads.profile(who, zod(ObjectCode).transform(code)))
      case 'opportunity':
        return opportunityRead(
          await this.opportunities.profile(who, zod(ObjectCode).transform(code)),
        )
      case 'contract':
        return contractRead(await this.contracts.profile(who, zod(ContractCode).transform(code)))
    }
  }
}
