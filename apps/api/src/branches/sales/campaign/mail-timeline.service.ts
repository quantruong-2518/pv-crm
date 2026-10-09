import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  MAIL_DOOR_LABEL,
  MailSubjectTimelineResponse,
  type MailAddressee,
  type MailLetterState,
  type MailSubjectKind,
  type MailSubjectTimelineRow,
} from '@pv/contracts'
import { denied, notFound } from '@api/platform/http/problem'
import { senderOf } from '@api/platform/mail/mas-letter'
import { ContractRepository } from '../contract/contract.repository'
import { LeadRepository } from '../lead/lead.repository'
import { OpportunityRepository } from '../opportunity/opportunity.repository'
import { MailTimelineRepository, type SubjectLetterRead } from './mail-timeline.repository'
import { isoOf } from './mas.service'

/** The letters on one subject's activity line (G8) — three routes, one query.
 *
 *  Each door is scoped through its OWN book's `byCode`: a deal is held through
 *  `opportunity_owner`, a contract through its owner, a lead through
 *  `owner_id` — one axis per book, never borrowed from the lead. 404 and 403
 *  stay apart, as `LeadService.mailTimeline` argues. The lead line shows only
 *  letters filed on the lead (owner default: no roll-up). */
@Injectable()
export class MailTimelineService {
  constructor(
    private readonly repo: MailTimelineRepository,
    private readonly leads: LeadRepository,
    private readonly deals: OpportunityRepository,
    private readonly contracts: ContractRepository,
  ) {}

  async of(who: Actor, kind: MailSubjectKind, code: string): Promise<MailSubjectTimelineResponse> {
    const found =
      kind === 'lead'
        ? await this.leads.byCode(who, code)
        : kind === 'opportunity'
          ? await this.deals.byCode(who, code)
          : await this.contracts.byCode(who, code)
    if (!found) throw notFound(MAIL_DOOR_LABEL[kind].toLowerCase(), code)
    if (!found.inScope) {
      throw denied('out-of-scope', `${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }

    const rows = await this.repo.of(kind, code)
    return MailSubjectTimelineResponse.parse({ rows: rows.map((row) => toLine(who, row)) })
  }
}

/** One ledger row → one activity line. `canEdit` is the G8 door exactly:
 *  the caller made it, nothing has left, and it is not a campaign wave — the
 *  broadcast holder edits everything else from the run book. */
function toLine(who: Actor, row: SubjectLetterRead): MailSubjectTimelineRow {
  const mine = row.created_by === who.id
  const scheduledAt = isoOf(row.scheduled_at)
  const sentAt = isoOf(row.sent_at)
  const named = row.addresses.map((a) => addressee(a.address, a.name))
  const to =
    row.kind === 'group'
      ? named.filter((_, i) => row.addresses[i]?.role === 'to')
      : [addressee(row.recipient, row.recipient_name)]
  const cc = [
    ...named.filter((_, i) => row.addresses[i]?.role === 'cc'),
    ...row.run_cc.map((email) => addressee(email, null)),
  ]

  const state = stateOf(row)
  const mailbox = senderOf(row.from_address, '').address
  /* A thread id is per mailbox: only the creator's own Gmail can open it. */
  const threadUrl =
    mine && row.thread_id
      ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#all/${row.thread_id}`
      : null

  return {
    runId: row.run_id,
    subject: row.subject,
    state,
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(sentAt ? { sentAt } : {}),
    to,
    cc,
    createdBy: { actorId: row.created_by, name: row.created_by_name ?? row.created_by },
    mine,
    canEdit: mine && row.editable && !row.campaign_wave,
    transport: row.transport,
    fromAddress: mailbox,
    threadUrl,
    failureReason: failureOf(row, state),
  }
}

/** Codes whose stored summary was written for a person to read: the Gmail
 *  driver's permanent refusals and the sweeper's bounce. */
const READABLE: Record<string, true | undefined> = {
  'gmail-unlinked': true,
  'gmail-no-consent': true,
  'gmail-rejected': true,
  'gmail-unverified': true,
  'gmail.bounced': true,
}

/** The reason a letter failed, for ANY viewer of the record — a whitelist on
 *  the error code, because every other summary is a provider's sentence, an
 *  exception message or an operator note. `gmail-unavailable` promises a retry
 *  in its stored text, which is untrue once the delivery gave up: fixed words. */
function failureOf(row: SubjectLetterRead, state: MailLetterState): string | null {
  const gaveUp = row.delivery_state === 'dead' || FAILED[row.delivery_state]
  const failed = state === 'BOUNCED' || state === 'SUPPRESSED' || (state === 'CANCELLED' && gaveUp)
  if (!failed || row.transport !== 'gmail' || !row.error_code) return null
  if (READABLE[row.error_code]) return row.error_summary
  return row.error_code === 'gmail-unavailable' && gaveUp
    ? 'Gmail không nhận thư sau nhiều lần thử — thư chưa được gửi.'
    : null
}

const LEFT: Record<string, true | undefined> = { accepted: true, delayed: true, delivered: true }
const FAILED: Record<string, true | undefined> = {
  bounced: true,
  complained: true,
  failed_permanent: true,
}

/** Strongest fact first. A letter that left keeps its outcome even if its run
 *  was cancelled afterwards; `dead` is a cancel only when the run says so,
 *  otherwise the retries ran out. `suppressed` never left and was refused, not
 *  returned; `withheld` (G6) never left: CANCELLED. A group letter has no open
 *  tracking, so it never reads OPENED. */
function stateOf(row: SubjectLetterRead): MailLetterState {
  const d = row.delivery_state
  if (d === 'suppressed') return 'SUPPRESSED'
  if (FAILED[d] || (d === 'dead' && row.run_state !== 'CANCELLED')) return 'BOUNCED'
  if (row.reply_count > 0) return 'REPLIED'
  if (LEFT[d]) return row.kind === 'bulk' && row.open_count > 0 ? 'OPENED' : 'SENT'
  if (d === 'dead' || d === 'withheld' || row.run_state === 'CANCELLED') return 'CANCELLED'
  return row.run_state === 'SCHEDULED' ? 'SCHEDULED' : 'SENDING'
}

function addressee(email: string, name: string | null): MailAddressee {
  return name ? { name, email } : { email }
}
