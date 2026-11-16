import { audit, edge, objectRef } from '@api/platform/db/platform.schema'
import { approval, approvalLink } from '@api/platform/approval/approval.schema'
import { aiCall } from '@api/platform/ai/ai-cost.schema'
import { assistantMessage, assistantSession } from '@api/platform/assistant/assistant.schema'
import {
  debrief,
  debriefAnswer,
  identity,
  link,
  message,
  messageParty,
  thread,
} from '@api/platform/comms/comms.schema'
import { fxRate } from '@api/platform/fx/fx-rate.schema'
import {
  emailDelivery,
  emailDeliveryAddress,
  emailSuppression,
  mailEvent,
  mailReply,
} from '@api/platform/mail/mail.schema'
import { mailRun } from '@api/platform/mail/mail-run.schema'
import { notification } from '@api/platform/notification/notification.schema'
import { attachment } from '@api/platform/storage/attachment.schema'
import { account } from '@api/branches/sales/account/account.schema'
import { customerTemperature } from '@api/branches/sales/after-sale/customer-temperature.schema'
import { campaign, campaignMember } from '@api/branches/sales/campaign/campaign.schema'
import { sourceCost, sourceEvent, sourceFollower } from '@api/branches/sales/campaign/source.schema'
import { contact } from '@api/branches/sales/contact/contact.schema'
import {
  contract,
  contractCondition,
  contractDocument,
  contractInstallment,
  contractNote,
  contractRecord,
  installmentOverdueReason,
} from '@api/branches/sales/contract/contract.schema'
import { contractCredit } from '@api/branches/sales/contract/contract-credit.schema'
import { contractParticipant } from '@api/branches/sales/contract/contract-participant.schema'
import { contractTermination } from '@api/branches/sales/contract/contract-termination.schema'
import { hold } from '@api/branches/sales/hold/hold.schema'
import { kpiAbsence } from '@api/branches/sales/kpi/kpi-absence.schema'
import {
  kpiAllocation,
  kpiAllocationLine,
  kpiAllocationShare,
  kpiCounter,
} from '@api/branches/sales/kpi/kpi-allocation.schema'
import { kpiAssignment, kpiAssignmentLine } from '@api/branches/sales/kpi/kpi-assignment.schema'
import { kpiMarketingBudget } from '@api/branches/sales/kpi/kpi-config.schema'
import { kpiTeam, kpiTeamMember, kpiTeamRoster } from '@api/branches/sales/kpi/kpi-team.schema'
import { kpiAcknowledgement, kpiTarget } from '@api/branches/sales/kpi/kpi.schema'
import { lead, leadIndustry, leadLabel } from '@api/branches/sales/lead/lead.schema'
import { leadAiJob } from '@api/branches/sales/lead/lead-ai-job.schema'
import { scanBatch, scanFile } from '@api/branches/sales/lead/lead-scan.schema'
import { mailSequence, mailSequenceRun } from '@api/branches/sales/mail-sequence.schema'
import { meeting, meetingAttendee } from '@api/branches/sales/meeting/meeting.schema'
import { nextStep } from '@api/branches/sales/next-step/next-step.schema'
import {
  opportunity,
  opportunityContact,
  opportunityOwner,
  opportunityProduct,
  opportunityStageEvent,
} from '@api/branches/sales/opportunity/opportunity.schema'
import { partner } from '@api/branches/sales/partner/partner.schema'
import { quotation } from '@api/branches/sales/quotation/quotation.schema'
import { touch } from '@api/branches/sales/touch/touch.schema'
import { workstream } from '@api/branches/sales/workstream/workstream.schema'

/** Every table an emitter may write, keyed by the name `plan.<key>` uses (the
 *  drizzle export name, except `object` for `objectRef`). Declaration order IS
 *  the insert order; the harness checks it against the live foreign keys, so a
 *  table in the wrong place fails there, not on Neon.
 *
 *  Known cycle: lead -> partner -> contact -> lead. Partner goes first, so an
 *  emitter must leave `partner.contact_code` NULL and set it in `afterWrite`. */

export const TABLES = {
  object: objectRef,
  partner,
  campaign,
  account,
  workstream,
  scanBatch,
  attachment,
  scanFile,
  lead,
  leadIndustry,
  leadLabel,
  contact,
  edge,
  campaignMember,
  sourceCost,
  sourceEvent,
  sourceFollower,
  mailRun,
  mailSequence,
  mailSequenceRun,
  identity,
  emailDelivery,
  emailDeliveryAddress,
  mailEvent,
  mailReply,
  emailSuppression,
  opportunity,
  opportunityOwner,
  opportunityContact,
  opportunityProduct,
  opportunityStageEvent,
  contract,
  contractParticipant,
  contractCredit,
  touch,
  quotation,
  approval,
  approvalLink,
  hold,
  nextStep,
  meeting,
  meetingAttendee,
  contractInstallment,
  installmentOverdueReason,
  contractTermination,
  contractDocument,
  contractCondition,
  contractRecord,
  contractNote,
  thread,
  message,
  messageParty,
  link,
  debrief,
  debriefAnswer,
  customerTemperature,
  kpiTarget,
  kpiAcknowledgement,
  kpiAbsence,
  kpiTeam,
  kpiTeamRoster,
  kpiTeamMember,
  kpiAssignment,
  kpiAssignmentLine,
  kpiAllocation,
  kpiAllocationLine,
  kpiAllocationShare,
  kpiCounter,
  kpiMarketingBudget,
  notification,
  aiCall,
  assistantSession,
  assistantMessage,
  leadAiJob,
  fxRate,
  audit,
} as const

export type TableKey = keyof typeof TABLES
export const ORDER = Object.keys(TABLES) as TableKey[]
