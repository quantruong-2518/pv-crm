import type { EventPayload, NotificationRule } from './e4-notifications'

/** E4 · the bell rule table — which event tells which audience what.
 *
 *  Data, not code: adding a notification is adding a row here and a kind in
 *  `@pv/contracts`. A module reports WHAT HAPPENED under its own event name
 *  and resolves who each audience is; it never picks a kind. Event names are
 *  exported so a caller cannot hand-type a string that matches no rule. */

export const LEAD_POOLED = 'sales.lead.pooled'
export const LEAD_HANDED_OVER = 'sales.lead.handed-over'
export const LEAD_RE_ENTERED = 'sales.lead.re-entered'
export const LEAD_STOPPED = 'sales.lead.stopped'
export const LEAD_SCAN_READY = 'sales.lead-scan.ready'
export const LEAD_SCAN_COMMITTED = 'sales.lead-scan.committed'
export const LEAD_SCAN_FAILED = 'sales.lead-scan.failed'
/** One event for "an opportunity came into existence or ended"; `data.lost`
 *  and `data.accepted` are facts about the row, read by `when` below. */
export const OPPORTUNITY_OPENED = 'sales.opportunity.opened'
export const OPPORTUNITY_ACCEPTED = 'sales.opportunity.accepted'
export const OPPORTUNITY_OWNERS_CHANGED = 'sales.opportunity.owners-changed'
export const OPPORTUNITY_STAGE_MOVED = 'sales.opportunity.stage-moved'
export const OPPORTUNITY_PRIMARY_CHANGED = 'sales.opportunity.primary-changed'
export const CONTRACT_SIGNED = 'sales.contract.signed'
/** `data.superseded` tells a round that replaced a waiting one from a plain new round. */
export const QUOTATION_RECORDED = 'sales.quotation.recorded'
export const INSTALLMENT_PAID = 'sales.contract.installment-paid'
export const INSTALLMENT_UNDONE = 'sales.contract.installment-undone'
export const SCHEDULE_REPLACED = 'sales.contract.schedule-replaced'
export const CONDITION_DONE = 'sales.contract.condition-done'
export const CAMPAIGN_STOPPED = 'sales.campaign.stopped'
export const CAMPAIGN_FINISHED = 'sales.campaign.finished'
export const KPI_TARGET_PROPOSED = 'sales.kpi.target-proposed'
export const KPI_TARGET_AGREED = 'sales.kpi.target-agreed'
export const COMM_CLOSED_FOR_OWNER = 'platform.comm.closed-for-owner'
export const LEAD_NURTURED = 'sales.lead.nurtured'
export const LEAD_RESUMED = 'sales.lead.resumed'
export const LEAD_REOPENED = 'sales.lead.reopened'
export const ROLE_GRANTS_REPLACED = 'platform.role.grants-replaced'
export const NEXT_STEP_SET = 'sales.next-step.set'
export const NEXT_STEP_DONE = 'sales.next-step.done'
export const APPROVAL_WAITING = 'platform.approval.waiting'
export const APPROVAL_DECIDED = 'platform.approval.decided'
export const MAIL_RUN_FINISHED = 'platform.mail-run.finished'
export const MAIL_RUN_CANCELLED = 'platform.mail-run.cancelled'
export const MAIL_FAILED = 'platform.mail.failed'
/** `data.bulk` is true when the letter belonged to a bulk run: the same reply
 *  then collapses into one `mail-run-replied` line per run and day. */
export const MAIL_REPLIED = 'platform.mail.replied'
export const USER_ACCESS_CHANGED = 'platform.user.access-changed'
export const USER_PASSWORD_RESET = 'platform.user.password-reset'
export const GOOGLE_LINK_BROKEN = 'platform.google.link-broken'

const flag = (key: string, want: boolean) => (payload: EventPayload) =>
  (payload.data?.[key] === true) === want

const bell = (
  kind: string,
  event: string,
  audience: string,
  when?: NotificationRule['when'],
): NotificationRule => ({
  id: `${kind}:${audience}`,
  event,
  when,
  channel: 'in-app',
  kind,
  audience,
})

export const NOTIFICATION_RULES: readonly NotificationRule[] = [
  bell('lead-pooled', LEAD_POOLED, 'pool-watchers'),
  bell('lead-received', LEAD_HANDED_OVER, 'new-holder'),
  bell('lead-removed', LEAD_HANDED_OVER, 'previous-holder'),
  bell('lead-re-entered', LEAD_RE_ENTERED, 'holder'),
  bell('lead-stopped', LEAD_STOPPED, 'holder'),
  bell('lead-scan-ready', LEAD_SCAN_READY, 'uploader'),
  bell('lead-scan-committed', LEAD_SCAN_COMMITTED, 'uploader'),
  bell('lead-scan-failed', LEAD_SCAN_FAILED, 'uploader'),

  /* Three rules on ONE event, told apart by two facts about the row. A deal
     booked already accepted rings nobody to accept it, and a deal booked
     already lost is the same news as one lost later. */
  bell(
    'opportunity-awaiting-accept',
    OPPORTUNITY_OPENED,
    'acceptors',
    (p) => p.data?.lost !== true && p.data?.accepted !== true,
  ),
  bell('opportunity-lost', OPPORTUNITY_OPENED, 'holders', flag('lost', true)),
  bell('opportunity-accepted', OPPORTUNITY_ACCEPTED, 'holders'),
  bell('opportunity-assigned', OPPORTUNITY_OWNERS_CHANGED, 'added'),
  bell('opportunity-unassigned', OPPORTUNITY_OWNERS_CHANGED, 'removed'),

  bell('opportunity-stage-moved', OPPORTUNITY_STAGE_MOVED, 'owners'),
  bell('opportunity-primary-changed', OPPORTUNITY_PRIMARY_CHANGED, 'old-primary'),
  bell('opportunity-primary-changed', OPPORTUNITY_PRIMARY_CHANGED, 'new-primary'),
  bell('quotation-new-round', QUOTATION_RECORDED, 'owners', flag('superseded', false)),
  bell('quotation-superseded', QUOTATION_RECORDED, 'owners', flag('superseded', true)),
  bell('contract-signed', CONTRACT_SIGNED, 'director'),
  bell('contract-signed', CONTRACT_SIGNED, 'owners'),
  bell('contract-signed', CONTRACT_SIGNED, 'commission-owner'),

  /* The four schedule events share one audience pair; a person who is both
     owner and participant is told once because the event key ignores audience. */
  bell('contract-installment-paid', INSTALLMENT_PAID, 'owner'),
  bell('contract-installment-paid', INSTALLMENT_PAID, 'participants'),
  bell('contract-installment-undone', INSTALLMENT_UNDONE, 'owner'),
  bell('contract-installment-undone', INSTALLMENT_UNDONE, 'participants'),
  bell('contract-schedule-replaced', SCHEDULE_REPLACED, 'owner'),
  bell('contract-schedule-replaced', SCHEDULE_REPLACED, 'participants'),
  bell('contract-condition-done', CONDITION_DONE, 'owner'),
  bell('contract-condition-done', CONDITION_DONE, 'participants'),

  bell('campaign-stopped', CAMPAIGN_STOPPED, 'owner'),
  bell('campaign-finished', CAMPAIGN_FINISHED, 'owner'),
  bell('kpi-target-proposed', KPI_TARGET_PROPOSED, 'setters'),
  bell('kpi-target-agreed', KPI_TARGET_AGREED, 'proposers'),
  bell('comm-closed-by-other', COMM_CLOSED_FOR_OWNER, 'owner'),
  bell('lead-nurtured', LEAD_NURTURED, 'holder'),
  bell('lead-resumed', LEAD_RESUMED, 'holder'),
  bell('lead-reopened', LEAD_REOPENED, 'holder'),

  bell('next-step-assigned', NEXT_STEP_SET, 'doer'),
  bell('next-step-done', NEXT_STEP_DONE, 'setter'),

  bell('approval-waiting', APPROVAL_WAITING, 'approver'),
  bell('approval-approved', APPROVAL_DECIDED, 'requester', flag('approved', true)),
  bell('approval-rejected', APPROVAL_DECIDED, 'requester', flag('approved', false)),

  bell('mail-run-sent', MAIL_RUN_FINISHED, 'sender'),
  bell('mail-run-cancelled', MAIL_RUN_CANCELLED, 'sender'),
  bell('mail-failed', MAIL_FAILED, 'sender'),
  bell('mail-failed', MAIL_FAILED, 'holder'),
  bell('customer-replied', MAIL_REPLIED, 'holder', flag('bulk', false)),
  bell('customer-replied', MAIL_REPLIED, 'pool-watchers', flag('bulk', false)),
  bell('mail-run-replied', MAIL_REPLIED, 'holder', flag('bulk', true)),
  bell('mail-run-replied', MAIL_REPLIED, 'pool-watchers', flag('bulk', true)),

  bell('access-changed', USER_ACCESS_CHANGED, 'user'),
  bell('access-changed', ROLE_GRANTS_REPLACED, 'holders'),
  bell('password-reset-by-admin', USER_PASSWORD_RESET, 'user'),
  bell('google-link-broken', GOOGLE_LINK_BROKEN, 'user'),
]
