import {
  AssistantReadKind,
  CampaignProfile,
  ContactBookRow,
  JourneyContract,
  JourneyDeal,
  JourneyDealRung,
  JourneyLead,
  JourneyLeadRung,
  ObjectCode,
  WorkstreamJourneyResponse,
  type AssistantRef,
  type JourneyRungState,
} from '@pv/contracts'
import { z } from 'zod'
import { inPool, RECHECK_PARALLEL, type ToolRead } from '@api/platform/assistant/assistant-tools'
import { maskContact } from '@api/platform/assistant/assistant-contact'
import { PvError } from '@api/platform/http/problem'
import { zod } from '@api/platform/http/zod.pipe'
import type { Actor } from '@pv/engines'
import type { CampaignService } from '../campaign/campaign.service'
import type { ContactService } from '../contact/contact.service'
import type { WorkstreamService } from '../workstream/workstream.service'
import { oneRecord, reachOf, refOf } from './record-read-kit'

/** `get_record` for a person, a campaign and a journey, each through the service its
 *  screen's profile door calls (the door has fenced the row: a scoped asker gets a 404
 *  or 403 there). None of the three book queries takes `codes`, so a stored answer is
 *  re-checked one profile per code.
 *
 *  A campaign comes as counts only, never its members or waves: the audience list is
 *  a door of its own. A journey carries no money: amounts and installments belong to
 *  the contract door's `paymentsVisible` fence, so only rungs and dates cross.
 *
 *  A journey names no child code but its own. It shows a deal or contract the asker may
 *  open as closer or collector, while the deal, contract and lead books re-check by the
 *  holder's scope: a code stored from here could be refused on reload, and one refused
 *  code withholds that answer and every later one in the chat. */

/** The kinds this file reads; `lead`, `opportunity`, `contract` and `account` stay in the tools file. */
export const ProfileKind = AssistantReadKind.extract(['contact', 'campaign', 'workstream'])
export type ProfileKind = z.infer<typeof ProfileKind>

export type ProfileDoors = {
  contacts: ContactService
  campaigns: CampaignService
  workstreams: WorkstreamService
}

/** `list` caps a journey's deals and contracts, as the company read caps its child lists. */
export type ProfileAsk = { doors: ProfileDoors; mayReach: boolean; list: number }

const ContactTrusted = ContactBookRow.pick({
  code: true,
  leadCode: true,
  channel: true,
  isPrimary: true,
  lastContact: true,
  createdAt: true,
  updatedAt: true,
})

const CampaignTrusted = CampaignProfile.pick({
  code: true,
  state: true,
  endsOn: true,
  audienceCount: true,
  waveCount: true,
  waveTotals: true,
  createdAt: true,
  updatedAt: true,
})

/** The response carries a `.refine`, which `.pick` refuses; its own shape has none. */
const JourneyHead = z.object(WorkstreamJourneyResponse.shape).pick({
  code: true,
  ordinal: true,
  status: true,
  closeReason: true,
  openedAt: true,
  closedAt: true,
})

const JourneyLeadTrusted = JourneyLead.pick({ state: true }).extend({
  rung: JourneyLeadRung.shape.key.nullable(),
})

const JourneyDealTrusted = JourneyDeal.pick({
  outcome: true,
  outcomeAt: true,
  expectedClose: true,
}).extend({ rung: JourneyDealRung.shape.key.nullable() })

const JourneyPaperTrusted = JourneyContract.pick({ kind: true, signedAt: true })

/** The lead's code stays in `trusted` and in `codes`: the contact door (lead owner, live
 *  lead) sits inside the lead book's scope, so the reload re-checks it as a lead. The
 *  account code is left out: it would re-check through `account.view`, a narrower door. */
const contactRead = (p: ContactBookRow, mayReach: boolean): ToolRead => {
  const read = oneRecord(
    refOf('contact', p.code, p.name, mayReach),
    ContactTrusted.parse(p),
    {
      name: p.name,
      title: p.title,
      company: p.company,
      accountName: p.accountName,
      ownerName: p.ownerName,
      note: p.note,
      ...reachOf(p, mayReach),
    },
    mayReach,
    [p],
  )
  return {
    ...read,
    codes: [...read.codes, p.leadCode],
    refs: [...(read.refs ?? []), refOf('lead', p.leadCode, p.company, mayReach)],
  }
}

const campaignRead = (p: CampaignProfile, mayReach: boolean): ToolRead =>
  oneRecord(
    refOf('campaign', p.code, p.name, mayReach),
    CampaignTrusted.parse(p),
    { name: p.name, slogan: p.slogan, ownerName: p.ownerName, sourceName: p.sourceName },
    mayReach,
  )

/** The rung the journey stands on now; null when none is `current` (a closed run). */
const standingOn = <K>(rungs: readonly { key: K; state: JourneyRungState }[]): K | null =>
  rungs.find((r) => r.state === 'current')?.key ?? null

function workstreamRead(p: WorkstreamJourneyResponse, mayReach: boolean, list: number): ToolRead {
  const deals = p.deals.slice(0, list)
  const papers = p.contracts.slice(0, list)
  const row = (trusted: object, untrusted: object) => ({
    trusted,
    untrusted: mayReach ? untrusted : maskContact(untrusted),
  })
  const read = oneRecord(
    refOf('workstream', p.code, p.customer, mayReach),
    {
      ...JourneyHead.parse(p),
      lead: JourneyLeadTrusted.parse({ ...p.lead, rung: standingOn(p.lead.rungs) }),
    },
    { customer: p.customer, leadHolder: p.lead.holder?.name },
    mayReach,
  )
  return {
    ...read,
    data: {
      ...read.data,
      /* `hiddenDeals` stays out: a count of cut deals says the run has more than the asker may open. */
      deals: {
        trusted: { more: p.deals.length > deals.length },
        rows: deals.map((d) =>
          row(JourneyDealTrusted.parse({ ...d, rung: standingOn(d.rungs) }), {
            name: d.name,
            holder: d.holder?.name,
          }),
        ),
      },
      contracts: {
        trusted: { more: p.contracts.length > papers.length },
        rows: papers.map((c) => row(JourneyPaperTrusted.parse(c), {})),
      },
    },
    rowCount: read.rowCount + deals.length + papers.length,
  }
}

export async function readProfile(
  who: Actor,
  kind: ProfileKind,
  code: string,
  { doors, mayReach, list }: ProfileAsk,
): Promise<ToolRead> {
  const objectCode = zod(ObjectCode).transform(code)
  switch (kind) {
    case 'contact':
      return contactRead(await doors.contacts.profile(who, objectCode), mayReach)
    case 'campaign':
      return campaignRead(await doors.campaigns.profile(who, objectCode), mayReach)
    case 'workstream':
      return workstreamRead(await doors.workstreams.profile(who, objectCode), mayReach, list)
  }
}

/** One profile per code, as the asker. A code the door refuses (404, or a campaign's
 *  403 for another owner) is "not readable" and dropped; any other failure is thrown,
 *  so the caller can tell it from a refusal. */
export async function profilesOf<P>(
  codes: readonly string[],
  open: (code: string) => Promise<P>,
): Promise<P[]> {
  const read = await inPool(codes, RECHECK_PARALLEL, (code) =>
    open(code).catch((error: unknown) => {
      if (error instanceof PvError && (error.getStatus() === 404 || error.getStatus() === 403)) {
        return null
      }
      throw error
    }),
  )
  return read.filter((p) => p !== null)
}

export async function rereadProfiles(
  who: Actor,
  kind: ProfileKind,
  codes: readonly string[],
  { doors, mayReach }: ProfileAsk,
): Promise<AssistantRef[]> {
  const asCode = (code: string) => zod(ObjectCode).transform(code)
  switch (kind) {
    case 'contact':
      return (await profilesOf(codes, (c) => doors.contacts.profile(who, asCode(c)))).map((p) =>
        refOf('contact', p.code, p.name, mayReach),
      )
    case 'campaign':
      return (await profilesOf(codes, (c) => doors.campaigns.profile(who, asCode(c)))).map((p) =>
        refOf('campaign', p.code, p.name, mayReach),
      )
    case 'workstream':
      return (await profilesOf(codes, (c) => doors.workstreams.profile(who, asCode(c)))).map((p) =>
        refOf('workstream', p.code, p.customer, mayReach),
      )
  }
}
