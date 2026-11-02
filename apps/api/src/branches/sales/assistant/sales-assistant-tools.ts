import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  AssistantRecordKind,
  ContractBookQuery,
  ContractCode,
  ContractDetailResponse,
  ContractTermination,
  GetRecordInput,
  InstallmentRow,
  LeadBookQuery,
  LeadProfile,
  ObjectCode,
  OpportunityBookQuery,
  OpportunityProfileResponse,
  SearchQuery,
  SearchRecordsInput,
  type AssistantRef,
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
import { maskContact } from '@api/platform/assistant/assistant-contact'
import { ACCESS } from '@api/platform/engines/tokens'
import { zod } from '@api/platform/http/zod.pipe'
import { ContractController } from '../contract/contract.controller'
import { ContractService } from '../contract/contract.service'
import { LeadController } from '../lead/lead.controller'
import { LeadService } from '../lead/lead.service'
import { OpportunityStepService } from '../next-step/next-step-opportunity.service'
import { NextStepService } from '../next-step/next-step.service'
import { OpportunityController } from '../opportunity/opportunity.controller'
import { OpportunityService } from '../opportunity/opportunity.service'
import { SearchController } from '../search/search.controller'
import { SearchService } from '../search/search.service'
import { listMyWork } from './list-my-work'

/** The Sales branch's tools (ADR 0133 D2): door methods, each taking the `Actor`
 *  first and fencing rows itself, never a sub-service. `list_my_work` is its own file.
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

/** The prefixes the code sequences print (`seqCodes` in each repository). */
const KIND_OF_PREFIX: readonly (readonly [string, AssistantRecordKind])[] = [
  ['LD-', 'lead'],
  ['OP-', 'opportunity'],
  ['HĐ-', 'contract'],
]

const kindOfCode = (code: string): AssistantRecordKind | null =>
  KIND_OF_PREFIX.find(([prefix]) => code.startsWith(prefix))?.[1] ?? null

type Reach = { phone?: string | null; email?: string | null }

/** Keys left out rather than nulled: a null tells the model the record has none. */
const reachOf = ({ phone, email }: Reach, mayReach: boolean): Reach =>
  mayReach ? { phone, email } : {}

/** The chip on screen; the model never reads a label (D5). It is still the
 *  assistant speaking, so a phone typed into a name is masked like the rest (0134 §4). */
function refOf(
  kind: AssistantRecordKind,
  code: string,
  label: string,
  mayReach: boolean,
): AssistantRef {
  const shown = mayReach ? label : (maskContact(label) as string)
  return { kind, code, label: shown.trim() || code }
}

const oneRecord = (
  ref: AssistantRef,
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
    codes: [ref.code],
    rowCount: 1,
    hidden: null,
    refs: [ref],
  }
}

const leadRead = (p: LeadProfile, mayReach: boolean): ToolRead =>
  oneRecord(
    refOf('lead', p.code, p.company, mayReach),
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
    refOf('opportunity', p.code, p.name, mayReach),
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
    refOf('contract', p.code, p.customer, mayReach),
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
  const trusted = hits.map((h) => HitTrusted.parse(h))
  return {
    data: {
      trusted: { more: result.groups.filter((g) => g.more).map((g) => g.kind) },
      hits: hits.map((h, i) => ({
        trusted: trusted[i],
        untrusted: mayReach ? text(h) : maskContact(text(h)),
      })),
    },
    codes: hits.map((h) => h.code),
    rowCount: hits.length,
    hidden: null,
    refs: trusted.map((t, i) => refOf(t.kind, t.code, hits[i]?.title ?? '', mayReach)),
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
    private readonly leadSteps: NextStepService,
    private readonly dealSteps: OpportunityStepService,
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
        recheck: {
          kindOf: kindOfCode,
          doors: {
            lead: door(LeadController, 'book'),
            opportunity: door(OpportunityController, 'book'),
            contract: door(ContractController, 'book'),
          },
          read: (who, kind, codes) => this.reread(who, kind, codes),
          one: (code) => {
            const kind = kindOfCode(code)
            return kind ? { kind, code } : null
          },
        },
      }),
      listMyWork({
        leads: this.leads,
        opportunities: this.opportunities,
        leadSteps: this.leadSteps,
        dealSteps: this.dealSteps,
        refOf: (who, kind, code, label) => refOf(kind, code, label, this.mayReach(who)),
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

  /** The book doors with `codes`, in the person's scope now, fenced like the profile
   *  door: every state, held deals included, a lead's book cut on a live lead. A
   *  switched-off lead is in the book only under `disabled`, for `lead.disable`. */
  private async reread(who: Actor, kind: string, codes: readonly string[]) {
    const mayReach = this.mayReach(who)
    const asked = { codes: codes.join(','), size: codes.length }
    const ref = (k: AssistantRecordKind) => (r: { code: string }, label: string) =>
      refOf(k, r.code, label, mayReach)
    if (kind === 'lead') {
      const q = (more = {}) => zod(LeadBookQuery).transform({ ...asked, state: 'all', ...more })
      const { rows } = await this.leads.book(who, q())
      const off = this.access.allows(who, 'lead.disable')
        ? (await this.leads.book(who, q({ disabled: 'true' }))).rows
        : []
      return [...rows, ...off].map((r) => ref('lead')(r, r.company))
    }
    if (kind === 'opportunity') {
      const { rows } = await this.opportunities.book(
        who,
        zod(OpportunityBookQuery).transform(asked),
      )
      return rows.map((r) => ref('opportunity')(r, r.name))
    }
    const { rows } = await this.contracts.book(who, zod(ContractBookQuery).transform(asked))
    return rows.map((r) => ref('contract')(r, r.customer))
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
