import { and, eq, inArray } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { Db } from '@api/platform/db/db.module'
import { actor, edge, objectRef } from '@api/platform/db/platform.schema'
import { orgMember, orgNode, orgVersion } from '@api/platform/db/org.schema'
import { approval, approvalLink } from '@api/platform/approval/approval.schema'
import { debrief, identity, link, message, thread } from '@api/platform/comms/comms.schema'
import { account } from '@api/branches/sales/account/account.schema'
import { campaign, campaignMember } from '@api/branches/sales/campaign/campaign.schema'
import { contact } from '@api/branches/sales/contact/contact.schema'
import {
  contract,
  contractInstallment,
  installmentOverdueReason,
} from '@api/branches/sales/contract/contract.schema'
import { contractParticipant } from '@api/branches/sales/contract/contract-participant.schema'
import { kpiAbsence } from '@api/branches/sales/kpi/kpi-absence.schema'
import { kpiAssignment, kpiAssignmentLine } from '@api/branches/sales/kpi/kpi-assignment.schema'
import { kpiTeam } from '@api/branches/sales/kpi/kpi-team.schema'
import { kpiAcknowledgement, kpiTarget } from '@api/branches/sales/kpi/kpi.schema'
import { lead } from '@api/branches/sales/lead/lead.schema'
import { meeting, meetingAttendee } from '@api/branches/sales/meeting/meeting.schema'
import {
  opportunity,
  opportunityOwner,
  opportunityStageEvent,
} from '@api/branches/sales/opportunity/opportunity.schema'
import { quotation } from '@api/branches/sales/quotation/quotation.schema'
import { touch } from '@api/branches/sales/touch/touch.schema'
import { workstream } from '@api/branches/sales/workstream/workstream.schema'
import type { Plan } from './plan'
import type { OrgRows } from './org'
import type { ackRows, absenceRows, targetRows } from './targets'

/** Every planned row, in foreign-key order, inside the caller's transaction.
 *  Returns how many rows each table took, for the closing report. */

export type Extra = {
  actors: (typeof actor.$inferInsert)[]
  version: typeof orgVersion.$inferInsert | null
  org: OrgRows
  targets: ReturnType<typeof targetRows>
  acks: ReturnType<typeof ackRows>
  absences: ReturnType<typeof absenceRows>
}

/** Rows per table name, in write order: the dry run prints the same list. */
export function tally(plan: Plan, extra: Extra): [string, number][] {
  return [
    ['platform.actor', extra.actors.length],
    ['sales.campaign', plan.campaigns.length],
    ['platform.object', plan.objects.length],
    ['sales.account', plan.accounts.length],
    ['sales.workstream', plan.workstreams.length],
    ['sales.lead', plan.leads.length],
    ['sales.contact', plan.contacts.length],
    ['platform.edge', plan.edges.length],
    ['sales.campaign_member', plan.members.length],
    ['sales.opportunity', plan.deals.length],
    ['sales.opportunity_owner', plan.owners.length],
    ['sales.opportunity_stage_event', plan.moves.length],
    ['sales.contract', plan.contracts.length],
    ['sales.contract_participant', plan.participants.length],
    ['sales.contract_installment', plan.terms.length],
    ['sales.installment_overdue_reason', plan.excuses.length],
    ['sales.quotation', plan.quotations.length],
    ['sales.touch', plan.touches.length],
    ['sales.meeting', plan.meetings.length],
    ['sales.meeting_attendee', plan.attendees.length],
    ['comms.identity (tối đa)', plan.speakers.length],
    ['comms.thread', plan.threads.length],
    ['comms.message', plan.messages.length],
    ['comms.link', plan.links.length],
    ['comms.debrief', plan.debriefs.length],
    ['platform.approval', plan.approvals.length],
    ['platform.approval_link', plan.approvalLinks.length],
    ['sales.kpi_target', extra.targets.length],
    ['sales.kpi_acknowledgement', extra.acks.length],
    ['sales.kpi_absence', extra.absences.length],
    ['platform.org_version', extra.version ? 1 : 0],
    ['platform.org_node', extra.org.nodes.length],
    ['platform.org_member', extra.org.members.length],
    ['sales.kpi_team', extra.org.teams.length],
    ['sales.kpi_assignment', extra.org.sets.length],
    ['sales.kpi_assignment_line', extra.org.lines.length],
  ]
}

/** Drizzle refuses an empty VALUES list; a table with nothing new is skipped. */
async function put<T extends PgTable>(tx: Db, table: T, rows: T['$inferInsert'][]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    await tx.insert(table).values(rows.slice(i, i + 500))
  }
}

export async function writeAll(tx: Db, plan: Plan, extra: Extra): Promise<void> {
  await put(tx, actor, extra.actors)
  await put(tx, campaign, plan.campaigns)
  await put(tx, objectRef, plan.objects)
  await put(tx, account, plan.accounts)
  await put(tx, workstream, plan.workstreams)
  await put(tx, lead, plan.leads)
  await put(tx, contact, plan.contacts)
  await put(tx, edge, plan.edges)
  await put(tx, campaignMember, plan.members)
  await put(tx, opportunity, plan.deals)
  await put(tx, opportunityOwner, plan.owners)
  await put(tx, opportunityStageEvent, plan.moves)
  await put(tx, contract, plan.contracts)
  await put(tx, contractParticipant, plan.participants)
  await put(tx, contractInstallment, plan.terms)
  await put(tx, installmentOverdueReason, plan.excuses)
  await put(tx, quotation, plan.quotations)
  await put(tx, touch, plan.touches)
  await put(tx, meeting, plan.meetings)
  await put(tx, meetingAttendee, plan.attendees)
  await writeTalks(tx, plan)
  await put(tx, approval, plan.approvals)
  await put(tx, approvalLink, plan.approvalLinks)
  await put(tx, kpiTarget, extra.targets)
  await put(tx, kpiAcknowledgement, extra.acks)
  await put(tx, kpiAbsence, extra.absences)
  if (extra.version) await put(tx, orgVersion, [extra.version])
  /* Parents before children: the parent key is checked per statement. */
  for (const kind of ['company', 'department', 'team']) {
    await put(
      tx,
      orgNode,
      extra.org.nodes.filter((n) => n.kind === kind),
    )
  }
  await put(tx, orgMember, extra.org.members)
  await put(tx, kpiTeam, extra.org.teams)
  await put(tx, kpiAssignment, extra.org.sets)
  await put(tx, kpiAssignmentLine, extra.org.lines)
}

/** A member identity per speaker — reused when one already holds the mailbox
 *  — then the threads, their turns, links and debriefs. */
async function writeTalks(tx: Db, plan: Plan): Promise<void> {
  if (plan.speakers.length === 0) return
  const mails = await tx
    .select({ id: actor.id, email: actor.email })
    .from(actor)
    .where(inArray(actor.id, plan.speakers))
  await tx
    .insert(identity)
    .values(
      mails.map((m) => ({
        channel: 'email' as const,
        address: m.email,
        side: 'member' as const,
        actorId: m.id,
      })),
    )
    .onConflictDoNothing()
  const known = await tx
    .select({ id: identity.id, actorId: identity.actorId })
    .from(identity)
    .where(and(eq(identity.side, 'member'), inArray(identity.actorId, plan.speakers)))
  const idOf = new Map(known.map((k) => [k.actorId, k.id]))
  const missing = plan.speakers.filter((id) => !idOf.has(id))
  if (missing.length > 0)
    throw new Error(`Hộp thư của ${missing.join(', ')} đã thuộc người khác — dừng.`)
  await put(tx, thread, plan.threads)
  await put(
    tx,
    message,
    plan.messages.map(({ fromActorId, ...m }) => ({
      ...m,
      fromIdentityId: idOf.get(fromActorId)!,
    })),
  )
  await put(tx, link, plan.links)
  await put(tx, debrief, plan.debriefs)
}
