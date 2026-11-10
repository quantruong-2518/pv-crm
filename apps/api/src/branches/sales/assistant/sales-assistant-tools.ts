import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  AccountProfile,
  AccountRow,
  AssistantReadKind,
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
  OpportunityRow,
  SearchQuery,
  SearchRecordsInput,
  type AssistantRef,
  type LeadBookResponse,
  type OpportunityBookResponse,
  type SearchHit,
  type SearchResult,
} from '@pv/contracts'
import { z } from 'zod'
import {
  defineTool,
  door,
  inPool,
  type AssistantTool,
  type AssistantToolSource,
  type ToolRead,
} from '@api/platform/assistant/assistant-tools'
import { maskContact } from '@api/platform/assistant/assistant-contact'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, PvError } from '@api/platform/http/problem'
import { zod } from '@api/platform/http/zod.pipe'
import { AccountController } from '../account/account.controller'
import { AccountService } from '../account/account.service'
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
import {
  DealTrusted as BookDealTrusted,
  LeadTrusted as BookLeadTrusted,
  listMyWork,
} from './list-my-work'

/** The Sales branch's tools (ADR 0133 D2): door methods taking the `Actor` first and
 *  fencing rows themselves, never a sub-service. One exception: the company profile
 *  door takes no `Actor` (debt in `docs/status.md`), so only company fields come from
 *  it. `list_my_work` is its own file.
 *
 *  A tool repeats its door's pipe (`zod(...)`), because the pipe is the door's
 *  first fence and a wrapper would skip it. A `trusted` half is the contract's own
 *  zod types picked to whitelisted ones (D5), so `.parse` drops the rest. All other
 *  text is `untrusted`, labels included: public intake writes `company` from the web.
 *
 *  Phone and email reach a model only for a holder of `data.export` (owner, question
 *  147); `maskContact` cuts what was typed into text. The screens are not affected.
 *  Search and a profile report no `hidden`: a row not shown is dropped uncounted, and
 *  a profile is one row. It stays null here rather than being worked out. */

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

const DealTrusted = OpportunityRow.pick({
  code: true,
  state: true,
  stage: true,
  contractCodes: true,
})

/** A company's own fields only: its aggregates and child rows come from an unfenced door. */
const AccountTrusted = AccountRow.pick({
  code: true,
  sizeBand: true,
  headcount: true,
  plants: true,
  createdAt: true,
})

const CompanyDealTrusted = BookDealTrusted.extend(
  OpportunityRow.pick({ state: true, contractCodes: true }).shape,
)

/** Rows per child list of a company read; past it the list says `more`. Kept near
 *  `LEAD_DEALS`: a read stores up to 1 + 2 x this many codes, and `REF_CHECKS` and the
 *  40k tool-token cap were sized for about 40 codes a turn. */
export const ACCOUNT_LIST = 20
/** Codes sent to a book, under the 4000 characters its `codes` filter takes. */
const ACCOUNT_CODES = 200
const RECHECK_PARALLEL = 4

/** A lead's deals read with it: search matches a deal by its own name, not its
 *  lead's company, so "what deals does AIT have" had no other way to an answer. */
const LEAD_DEALS = 20

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
const HitTrusted = z.object({ kind: AssistantReadKind, code: ContractCode.or(ObjectCode) })

const DOORS_OF = {
  lead: ['lead', 'leadDeals'],
  opportunity: 'opportunity',
  contract: 'contract',
  account: ['account', 'accountLeads', 'accountDeals'],
} as const satisfies Record<AssistantReadKind, string | readonly string[]>

/** The prefixes the code sequences print (`seqCodes` in each repository). */
const KIND_OF_PREFIX: readonly (readonly [string, AssistantReadKind])[] = [
  ['AC-', 'account'],
  ['LD-', 'lead'],
  ['OP-', 'opportunity'],
  ['HĐ-', 'contract'],
]

const kindOfCode = (code: string): AssistantReadKind | null =>
  KIND_OF_PREFIX.find(([prefix]) => code.startsWith(prefix))?.[1] ?? null

const shownText = (text: string, mayReach: boolean): string =>
  mayReach ? text : (maskContact(text) as string)

type Reach = { phone?: string | null; email?: string | null }

/** Keys left out rather than nulled: a null tells the model the record has none. */
const reachOf = ({ phone, email }: Reach, mayReach: boolean): Reach =>
  mayReach ? { phone, email } : {}

/** The chip on screen; the model never reads a label (D5). It is still the
 *  assistant speaking, so a phone typed into a name is masked like the rest (0134 §4). */
function refOf(
  kind: AssistantReadKind,
  code: string,
  label: string,
  mayReach: boolean,
): AssistantRef {
  return { kind, code, label: shownText(label, mayReach).trim() || code }
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

/** The deals ride on the lead's read; `hidden` is the book door's own count. */
function withDeals(read: ToolRead, deals: OpportunityBookResponse, mayReach: boolean): ToolRead {
  const trusted = deals.rows.map((r) => DealTrusted.parse(r))
  const name = (r: { name: string }) => shownText(r.name, mayReach)
  return {
    ...read,
    data: {
      ...read.data,
      opportunities: {
        trusted: { more: deals.total > deals.rows.length },
        rows: deals.rows.map((r, i) => ({ trusted: trusted[i], untrusted: { name: name(r) } })),
      },
    },
    codes: [...read.codes, ...trusted.map((t) => t.code)],
    rowCount: read.rowCount + deals.rows.length,
    hidden: deals.hidden,
    refs: [
      ...(read.refs ?? []),
      ...deals.rows.map((r) => refOf('opportunity', r.code, r.name, mayReach)),
    ],
  }
}

type Found<R> = { rows: readonly R[]; total: number } | null

/** A child list of a company: the asker's own book rows, cut at `ACCOUNT_LIST`.
 *  Null = its door was shut, and the key is left out rather than sent empty. */
function childList<R extends { code: string }>(
  found: Found<R>,
  trust: (row: R) => object,
  name: (row: R) => string,
  mayReach: boolean,
) {
  if (!found) return null
  const rows = found.rows.slice(0, ACCOUNT_LIST)
  const list = {
    /* `total` is the book's own scoped count; the profile's lists are never counted. */
    trusted: { count: found.total, more: found.total > rows.length },
    rows: rows.map((r) => ({
      trusted: trust(r),
      untrusted: { name: shownText(name(r), mayReach) },
    })),
  }
  return { rows, list }
}

/** The company's own fields, and the leads, deals and people the book doors gave back.
 *  `hidden` stays null: a count of what was cut would say the company has rows the
 *  asker cannot open (0134 §4). A contact is kept only when its lead was read. */
function accountRead(
  p: AccountProfile,
  found: {
    leads: Found<LeadBookResponse['rows'][number]>
    deals: Found<OpportunityBookResponse['rows'][number]>
  },
  mayReach: boolean,
): ToolRead {
  /* A shut child door is unknown, not empty: the model must say so, as `list_my_work` does. */
  const skipped: ('lead' | 'opportunity')[] = [
    ...(found.leads ? [] : (['lead'] as const)),
    ...(found.deals ? [] : (['opportunity'] as const)),
  ]
  const leads = childList(
    found.leads,
    (r) => BookLeadTrusted.parse(r),
    (r) => r.company,
    mayReach,
  )
  const deals = childList(
    found.deals,
    (r) => CompanyDealTrusted.parse(r),
    (r) => r.name,
    mayReach,
  )
  const own = new Set(leads?.rows.map((r) => r.code))
  const allowed = p.contactRows.filter((c) => own.has(c.leadCode))
  const people = allowed.slice(0, ACCOUNT_LIST)
  const read = oneRecord(
    refOf('account', p.code, p.name, mayReach),
    {
      ...AccountTrusted.parse(p),
      skipped,
      ...(leads && { moreContacts: leads.list.trusted.more || allowed.length > people.length }),
    },
    {
      name: p.name,
      legalName: p.legalName,
      taxCode: p.taxCode,
      address: p.address,
      province: p.province,
      website: p.website,
      category: p.category?.name,
      note: p.note,
      ...(leads && {
        contacts: people.map((c) => ({
          name: c.name,
          title: c.title,
          ...reachOf(c, mayReach),
          primary: c.isPrimary,
        })),
      }),
    },
    mayReach,
    people,
  )
  const rows = [...(leads?.rows ?? []), ...(deals?.rows ?? [])]
  return {
    ...read,
    data: {
      ...read.data,
      ...(leads && { leads: leads.list }),
      ...(deals && { opportunities: deals.list }),
    },
    codes: [...read.codes, ...rows.map((r) => r.code)],
    rowCount: read.rowCount + rows.length,
    refs: [
      ...(read.refs ?? []),
      ...(leads?.rows ?? []).map((r) => refOf('lead', r.code, r.company, mayReach)),
      ...(deals?.rows ?? []).map((r) => refOf('opportunity', r.code, r.name, mayReach)),
    ],
  }
}

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
    private readonly accounts: AccountService,
  ) {}

  tools(): readonly AssistantTool[] {
    return [
      defineTool({
        name: 'search_records',
        description:
          'Find leads, opportunities, contracts and companies by name, code or tax code. Returns codes and names; read one with get_record.',
        input: SearchRecordsInput,
        doors: { find: door(SearchController, 'find') },
        doorFor: () => 'find',
        run: (who, input) => this.search(who, input),
      }),
      defineTool({
        name: 'get_record',
        description:
          "Read one lead, opportunity, contract or company by its code. A lead comes with its opportunities: use it, not search_records, for a lead's opportunities. A company comes with the leads, opportunities and people the asker may see.",
        input: GetRecordInput,
        doors: {
          lead: door(LeadController, 'profile'),
          leadDeals: door(OpportunityController, 'book'),
          opportunity: door(OpportunityController, 'profile'),
          contract: door(ContractController, 'profile'),
          account: door(AccountController, 'profile'),
          accountLeads: door(LeadController, 'book'),
          accountDeals: door(OpportunityController, 'book'),
        },
        doorFor: (input) => DOORS_OF[input.kind],
        run: (who, input, open) => this.read(who, input, open),
        recheck: {
          kindOf: kindOfCode,
          doors: {
            lead: door(LeadController, 'book'),
            opportunity: door(OpportunityController, 'book'),
            contract: door(ContractController, 'book'),
            account: door(AccountController, 'profile'),
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
      kinds: (input.kinds ?? AssistantReadKind.options).join(','),
    })
    return searchRead(await this.searches.search(who, q), this.mayReach(who))
  }

  /** `allows` asks `who.permissions`, the grant resolved from the database for this
   *  session, so a change in the role editor holds; the default matrix would not.
   *  No `ref`: the door has fenced the row, and this is a question about the role. */
  private mayReach(who: Actor): boolean {
    return this.access.allows(who, 'data.export')
  }

  /** Every state, held deals included, a lead's book cut on a live lead. A switched-off
   *  lead is in the book only under `disabled`, and only for `lead.disable`. */
  private async bookLeads(who: Actor, ask: { codes: string; size: number }, withOff = true) {
    const q = (more = {}) => zod(LeadBookQuery).transform({ ...ask, state: 'all', ...more })
    const page = await this.leads.book(who, q())
    if (!withOff || !this.access.allows(who, 'lead.disable')) return page
    const off = await this.leads.book(who, q({ disabled: 'true' }))
    return { rows: [...page.rows, ...off.rows], total: page.total + off.total }
  }

  /** The book doors with `codes`, in the person's scope now, fenced like the profile
   *  door. A company has no book with `codes`, so its profile door is read per code. */
  private async reread(who: Actor, kind: string, codes: readonly string[]) {
    const mayReach = this.mayReach(who)
    const asked = { codes: codes.join(','), size: codes.length }
    const ref = (k: AssistantReadKind) => (r: { code: string }, label: string) =>
      refOf(k, r.code, label, mayReach)
    switch (AssistantReadKind.parse(kind)) {
      case 'lead':
        return (await this.bookLeads(who, asked)).rows.map((r) => ref('lead')(r, r.company))
      case 'opportunity': {
        const q = zod(OpportunityBookQuery).transform(asked)
        return (await this.opportunities.book(who, q)).rows.map((r) =>
          ref('opportunity')(r, r.name),
        )
      }
      case 'contract': {
        const q = zod(ContractBookQuery).transform(asked)
        return (await this.contracts.book(who, q)).rows.map((r) => ref('contract')(r, r.customer))
      }
      case 'account': {
        const read = await inPool(codes, RECHECK_PARALLEL, (code) =>
          this.accounts.profile(zod(ObjectCode).transform(code)).catch((error: unknown) => {
            if (error instanceof PvError && error.getStatus() === 404) return null
            throw error
          }),
        )
        return read.filter((p) => p !== null).map((p) => ref('account')(p, p.name))
      }
    }
  }

  private async read(
    who: Actor,
    { kind, code }: GetRecordInput,
    open: ReadonlySet<string>,
  ): Promise<ToolRead> {
    const mayReach = this.mayReach(who)
    switch (kind) {
      case 'lead': {
        /* The deals door alone open must not read the lead past its own door. */
        if (!open.has('lead')) throw denied('permission-denied')
        const leadCode = zod(ObjectCode).transform(code)
        const read = leadRead(await this.leads.profile(who, leadCode), mayReach)
        if (!open.has('leadDeals')) return read
        const q = zod(OpportunityBookQuery).transform({ leadCode, size: LEAD_DEALS })
        return withDeals(read, await this.opportunities.book(who, q), mayReach)
      }
      case 'account':
        return this.readAccount(who, code, open, mayReach)
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

  /** The company door fences nothing, so only its own fields and the child CODES are
   *  kept from it: the rows come from the lead and deal books, as the asker. */
  private async readAccount(
    who: Actor,
    code: string,
    open: ReadonlySet<string>,
    mayReach: boolean,
  ): Promise<ToolRead> {
    if (!open.has('account')) throw denied('permission-denied')
    const p = await this.accounts.profile(zod(ObjectCode).transform(code))
    const codes = (rows: readonly { code: string }[]) =>
      rows
        .slice(0, ACCOUNT_CODES)
        .map((r) => r.code)
        .join(',')
    const size = ACCOUNT_LIST
    /* No child code, no book call: `codes` takes one at least. An empty list is still a list. */
    const none = { rows: [], total: 0 }
    /* `leadRows` keeps live leads only (`leadLive`), so a switched-off lead read is empty. */
    const [leads, deals] = await Promise.all([
      !open.has('accountLeads')
        ? null
        : p.leadRows.length === 0
          ? none
          : this.bookLeads(who, { codes: codes(p.leadRows), size }, false),
      !open.has('accountDeals')
        ? null
        : p.dealRows.length === 0
          ? none
          : this.opportunities.book(
              who,
              zod(OpportunityBookQuery).transform({ codes: codes(p.dealRows), size }),
            ),
    ])
    return accountRead(p, { leads, deals }, mayReach)
  }
}
