import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
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
  type SearchHit,
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
import { ACCESS } from '@api/platform/engines/tokens'
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
 *  Phone and email reach a model only for a holder of `data.export`, even on one
 *  record (owner, question 147): others lose the fields, and `maskContact` cuts what
 *  was typed into text. The screens are not affected.
 *  None of these four doors reports `hidden`: search drops a row it may not show,
 *  uncounted, and a profile is one row. It stays null here rather than being worked
 *  out from those. */

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

type Reach = { phone?: string | null; email?: string | null }

/** Keys left out rather than nulled: a null tells the model the record has none. */
const reachOf = ({ phone, email }: Reach, mayReach: boolean): Reach =>
  mayReach ? { phone, email } : {}

/** One digit after at most three separators: "0912 - 345", "(028) 3822". */
const DIGIT = String.raw`(?:[\s.()-]{0,3}\d)`

/** 0 or +84, then 9 to 11 digits counting the 0. `0[1-9]` keeps a `000` group out;
 *  the guards skip a run inside a number, a dotted or spaced amount, and a dd-mm-yyyy.
 *  Group counts are capped so a long hostile run stays linear. */
const PHONE_SHAPE = new RegExp(
  String.raw`(?<!\d|(?<!\d)\d{1,3}(?:\.\d{3}){0,5}\.)` +
    String.raw`(?!(?<=(?<!\d)\d{1,3}\s)\d{3}(?:\s\d{3}){1,5}(?![\s.-]?\d))\(?` +
    String.raw`(?!0\d[\s.-][01]\d[\s.-](?:19|20)\d\d(?![.-]?\d))` +
    String.raw`(?:\+84${DIGIT}|0[1-9])${DIGIT}{7,9}(?!\d)`,
  'g',
)

/** The lookbehind starts it at a token's head, so a long run stays linear. */
const EMAIL_SHAPE = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu

const MASK = '[withheld]'

/** Company data with a phone's shape: a tax code is 10 digits from a 0. */
const NOT_MASKED: ReadonlySet<string> = new Set(['taxCode', 'website'])

/** Mail first, so `0912345678@x.vn` goes whole. A shape, not a proof: a number
 *  spelled out in words or without its 0 passes. */
function maskContact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(EMAIL_SHAPE, MASK).replace(PHONE_SHAPE, MASK)
  if (Array.isArray(value)) return value.map(maskContact)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      NOT_MASKED.has(key) ? item : maskContact(item),
    ]),
  )
}

const oneRecord = (
  code: string,
  trusted: object,
  untrusted: object,
  mayReach: boolean,
  people: readonly Reach[] = [],
): ToolRead => {
  const shown = mayReach ? untrusted : maskContact(untrusted)
  const contactInfoWithheld =
    !mayReach &&
    (people.some((c) => c.phone || c.email) || JSON.stringify(shown) !== JSON.stringify(untrusted))
  return {
    data: { trusted, untrusted: shown, ...(contactInfoWithheld && { contactInfoWithheld }) },
    codes: [code],
    rowCount: 1,
    hidden: null,
  }
}

const leadRead = (p: LeadProfile, mayReach: boolean): ToolRead =>
  oneRecord(
    p.code,
    LeadTrusted.parse(p),
    {
      company: p.company,
      legalName: p.legalName,
      taxCode: p.taxCode,
      contactName: p.contactName,
      contactTitle: p.contactTitle,
      ...reachOf(p, mayReach),
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
    },
    mayReach,
    [p],
  )

const opportunityRead = (p: OpportunityProfileResponse, mayReach: boolean): ToolRead =>
  oneRecord(
    p.code,
    OpportunityTrusted.parse(p),
    {
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
        ...reachOf(c, mayReach),
        primary: c.primary,
      })),
      stopReason: p.stopReasonLabel,
      stopNote: p.stopNote,
    },
    mayReach,
    p.contacts,
  )

/** No contact fields: `contact` is the lead's contact name, so only text can hold one. */
const contractRead = (p: ContractDetailResponse, mayReach: boolean): ToolRead =>
  oneRecord(
    p.code,
    ContractTrusted.parse(p),
    {
      customer: p.customer,
      ownerName: p.ownerName,
      collectorName: p.collectorName,
      contact: p.contact,
      contactRole: p.contactRole,
      installments: p.installments.map((i) => i.label),
      terminationReason: p.termination?.reasonLabel,
      terminationNote: p.termination?.note,
    },
    mayReach,
  )

/** `matched` and `score` stay behind: `matched.text` is the phone or email on a
 *  contact hit, and a deal's contact name on a deal hit. */
function searchRead(result: SearchResult, mayReach: boolean): ToolRead {
  const hits = result.groups.flatMap((g) => g.hits)
  const text = (h: SearchHit) => ({ title: h.title, subtitle: h.subtitle })
  return {
    data: {
      trusted: { more: result.groups.filter((g) => g.more).map((g) => g.kind) },
      hits: hits.map((h) => ({
        trusted: HitTrusted.parse(h),
        untrusted: mayReach ? text(h) : maskContact(text(h)),
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
    @Inject(ACCESS) private readonly access: AccessControl,
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
    return searchRead(await this.searches.search(who, q), this.mayReach(who))
  }

  /** `allows` asks `who.permissions`, the grant resolved from the database for this
   *  session, so a change in the role editor holds; the default matrix would not.
   *  No `ref`: the door has fenced the row, and this is a question about the role. */
  private mayReach(who: Actor): boolean {
    return this.access.allows(who, 'data.export')
  }

  private async read(who: Actor, { kind, code }: GetRecordInput): Promise<ToolRead> {
    const mayReach = this.mayReach(who)
    switch (kind) {
      case 'lead':
        return leadRead(await this.leads.profile(who, zod(ObjectCode).transform(code)), mayReach)
      case 'opportunity':
        return opportunityRead(
          await this.opportunities.profile(who, zod(ObjectCode).transform(code)),
          mayReach,
        )
      case 'contract':
        return contractRead(
          await this.contracts.profile(who, zod(ContractCode).transform(code)),
          mayReach,
        )
    }
  }
}
