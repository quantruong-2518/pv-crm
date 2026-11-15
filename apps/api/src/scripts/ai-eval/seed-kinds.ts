import { eq } from 'drizzle-orm'
import { campaign } from '@api/branches/sales/campaign/campaign.schema'
import { hold } from '@api/branches/sales/hold/hold.schema'
import { lead } from '@api/branches/sales/lead/lead.schema'
import { meeting } from '@api/branches/sales/meeting/meeting.schema'
import { contract } from '@api/branches/sales/contract/contract.schema'
import { opportunity } from '@api/branches/sales/opportunity/opportunity.schema'
import { workstream } from '@api/branches/sales/workstream/workstream.schema'
import { approval, approvalLink } from '@api/platform/approval/approval.schema'
import type { Db } from '@api/platform/db/db.module'
import { canariesOf, FIRST_LEAD, NAMED_SEATS, ROLE_SEATS, wideSeatId } from './seed-data'
import type { Chain } from './seed'

/** What the contact, campaign, journey, approval, hold and meeting reads need on top of a
 *  chain: one row of each, all of one seller, so every cell has a seat that owns them and
 *  seats that must not. Written straight into the tables, as `seed-customers.ts` is. */

export type KindsSeeded = {
  contact: string
  campaign: string
  workstream: string
  /** A journey on `kinds-paper`, whose contract is opened by its closer and collector only. */
  paperWorkstream: string
  /** The seat the approval waits on. */
  approver: string
}

const OPENED_AT = new Date('2026-09-01T08:00:00.000Z')
const HELD_UNTIL = '2099-01-01'
const SEAT = NAMED_SEATS.kinds.id
/* Digits the code shapes accept, clear of the customer seed's `WS-9001…`. */
const WORKSTREAM = 'WS-9500'
const PAPER_WORKSTREAM = 'WS-9501'
const CAMPAIGN = 'CP-9500'

export async function seedKinds(db: Db, chain: Chain, paper: Chain): Promise<KindsSeeded> {
  const c = canariesOf(chain.n)
  const approver = ROLE_SEATS.find((s) => s.id === wideSeatId('director'))
  if (!approver) throw new Error('seed: no director seat')

  await db.transaction(async (tx) => {
    await tx.insert(workstream).values({
      code: WORKSTREAM,
      openedAt: OPENED_AT,
      standKind: 'LD',
      standKey: 'working',
      standCode: chain.lead,
      standLeadKey: 'working',
    })
    await tx.update(lead).set({ workstreamCode: WORKSTREAM }).where(eq(lead.code, chain.lead))
    await tx
      .update(opportunity)
      .set({ workstreamCode: WORKSTREAM })
      .where(eq(opportunity.code, chain.opportunity))
  })
  await db.transaction(async (tx) => {
    await tx.insert(workstream).values({
      code: PAPER_WORKSTREAM,
      openedAt: OPENED_AT,
      closedAt: OPENED_AT,
      closeReason: 'WON',
      standKind: 'LD',
      standKey: 'converted',
      standCode: paper.lead,
    })
    await tx.update(lead).set({ workstreamCode: PAPER_WORKSTREAM }).where(eq(lead.code, paper.lead))
    await tx
      .update(opportunity)
      .set({ workstreamCode: PAPER_WORKSTREAM })
      .where(eq(opportunity.code, paper.opportunity))
    await tx
      .update(contract)
      .set({ workstreamCode: PAPER_WORKSTREAM })
      .where(eq(contract.code, paper.contract ?? ''))
  })
  await db.insert(campaign).values({
    code: CAMPAIGN,
    name: `Chiến dịch ${c.legalName}`,
    ownerId: SEAT,
    state: 'RUNNING',
  })
  await db.insert(hold).values({
    subjectType: 'lead',
    subjectCode: chain.lead,
    untilDay: HELD_UNTIL,
    note: `Chờ khách ${c.touchNote}`,
    setBy: SEAT,
  })
  const [request] = await db
    .insert(approval)
    .values({
      kind: 'config-change',
      raisedById: SEAT,
      raisedBy: NAMED_SEATS.kinds.name,
      consequence: `Đổi cấu hình ${c.summary}`,
      payload: {},
      chain: [{ role: 'director', person: approver.name, personId: approver.id, state: 'waiting' }],
    })
    .returning({ id: approval.id })
  if (!request) throw new Error('seed: no approval returned')
  await db
    .insert(approvalLink)
    .values({ requestId: request.id, objectCode: chain.lead, objectLabel: `Công ty ${c.company}` })
  /* Now, for two hours: `MeetingService.today` reads the real clock. */
  await db.insert(meeting).values({
    subjectCode: chain.lead,
    at: new Date(),
    durationMinutes: 120,
    title: `Họp ${c.meetingTitle}`,
    by: NAMED_SEATS.kinds.name,
    createdBy: SEAT,
  })
  return {
    contact: `CT-${FIRST_LEAD + chain.n}`,
    campaign: CAMPAIGN,
    workstream: WORKSTREAM,
    paperWorkstream: PAPER_WORKSTREAM,
    approver: approver.id,
  }
}
