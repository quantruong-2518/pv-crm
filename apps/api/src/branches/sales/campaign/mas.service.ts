import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  MailRunListResponse,
  MailTemplateListResponse,
  MasPreflightResponse,
  MasSendResponse,
  type MailRunListQuery,
  type MailRunState,
  type MasPreflightRequest,
  type MasRecipient,
  type MasRecipientBlock,
  type MasSendRequest,
} from '@pv/contracts'
import { ENV, type Env } from '@api/platform/config/env'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, invalid, notFound } from '@api/platform/http/problem'
import { MAIL_ENQUEUE, type MailEnqueue, type MailIntent } from '@api/platform/mail/mail.contract'
import { MailRunRepository } from '@api/platform/mail/mail-run.repository'
import { MasRepository, type MasLeadRow } from './mas.repository'

/** The template this feature composes against — `platform/mail/mas.composer.ts`
 *  answers for exactly this string, and the version is in the name because
 *  `email_delivery.template` is written into rows that outlive this code. */
const TEMPLATE = 'mas-v1'
const TEMPLATE_VERSION = 1

/** THE `eventKey` FORMULA FOR A MAS LETTER — and the one decision in this file
 *  that a reader must not have to reverse-engineer.
 *
 *  ------------------------------------------------------------------
 *  E4's SHAPE, KEPT: `<flow>/<audience>/v<n>/<code>`
 *  ------------------------------------------------------------------
 *  `packages/engines/src/e4-notifications.ts#plan` builds every transactional
 *  key that way, and `email_delivery.event_key` is UNIQUE across BOTH paths —
 *  one ledger, one anti-duplicate spine, reused verbatim as the Resend
 *  idempotency key. A second spelling here would be a second convention in one
 *  unique index, which is how two flows eventually mint the same string.
 *
 *  `plan()` itself is deliberately NOT called. It maps an EVENT to intents
 *  through `NOTIFICATION_RULES`, and a MAS batch is not an event with a rule
 *  behind it — it is a person choosing an audience and typing a letter. There
 *  is no rule to add that would not amount to "whatever the user just did".
 *  What is borrowed is the KEY SHAPE, not the dispatch.
 *
 *  ------------------------------------------------------------------
 *  THE `<code>` SLOT CARRIES THE RUN, THEN THE LEAD
 *  ------------------------------------------------------------------
 *      mas/lead/v1/<mailRunId>:<leadCode>
 *
 *  The lead code ALONE would be wrong in the one way that matters most, and
 *  silently: a campaign fires wave after wave at the same audience, so the
 *  second wave's rows would every one of them collide with the first on
 *  `UNIQUE(event_key)`, `enqueueBatch` would insert nothing, and the screen
 *  would report `queued: 0` for a send that looked perfectly ordinary. A list
 *  can only ever be mailed once, forever.
 *
 *  A random nonce per row would fix that and break the opposite half: a
 *  double-clicked send button, or an HTTP retry after a timeout, would write a
 *  second complete batch and mail two hundred people twice. The run id is what
 *  splits those two cases correctly — it is minted by the server once per act
 *  of sending, so the same request retried keeps it and collides (nothing is
 *  written, `queued` reports zero honestly), while a genuine second wave gets a
 *  new one and reaches the same leads again.
 *
 *  The run comes FIRST inside the slot so every letter of one batch shares one
 *  prefix — "what does this run owe" is a `LIKE 'mas/lead/v1/<id>:%'`, which is
 *  the question a person debugging a batch actually asks.
 *
 *  `:` rather than a fourth `/` so the key still splits into exactly four
 *  segments: anything reading these keys — a log filter, a future parser —
 *  keeps seeing flow · audience · version · code, with the compound key living
 *  entirely inside the last one. */
const MAS_FLOW = 'mas'
const MAS_AUDIENCE = 'lead'

const eventKeyOf = (mailRunId: string, leadCode: string): string =>
  `${MAS_FLOW}/${MAS_AUDIENCE}/v${TEMPLATE_VERSION}/${mailRunId}:${leadCode}`

/** What caused the letter, for `email_delivery.event_type`. Dotted and prefixed
 *  by branch, the same spelling `LEAD_INTAKE_ACCEPTED` uses. Not an E4 constant
 *  because there is no E4 rule to name — see the note above. */
const MAS_EVENT = 'sales.mas.run.queued'

/** One picked lead after the server has judged it. The row is kept beside the
 *  verdict rather than folded into a `MasRecipient`, because the intent needs a
 *  recipient address that the contract's optional `email` cannot promise —
 *  narrowing once here beats a non-null assertion at the call site. */
type Decided = { row: MasLeadRow; block?: MasRecipientBlock }

/** MAS mail from the Sales side — the only place that knows both the repository
 *  and the engine.
 *
 *  ------------------------------------------------------------------
 *  THE PREFLIGHT IS RUN TWICE, AND THE SECOND RUN IS THE REAL ONE
 *  ------------------------------------------------------------------
 *  `POST /sales/mail/preflight` exists so a person can see who will receive
 *  this before composing. `POST /sales/mail/runs` then runs the SAME decision
 *  again, server-side, inside the transaction that writes the rows — it never
 *  reads a verdict off the request. Two reasons, and only the first is about
 *  trust:
 *
 *   · A client that could post "these 37 are fine" could post a suppressed
 *     address, and the block list would be a suggestion.
 *   · A hard bounce can land between the preview and the send. The preview is
 *     a photograph; the ledger is the fact.
 *
 *  That is also why the request carries lead CODES and never addresses — see
 *  `MasSendRequest`. */
@Injectable()
export class MasService {
  constructor(
    private readonly repo: MasRepository,
    private readonly runs: MailRunRepository,
    @Inject(MAIL_ENQUEUE) private readonly mail: MailEnqueue,
    @Inject(ACCESS) private readonly access: AccessControl,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** A dry run that writes nothing — not even a sequence number. */
  async preflight(who: Actor, body: MasPreflightRequest): Promise<MasPreflightResponse> {
    const codes = dedupe(body.leadCodes)
    const rows = await this.repo.audience(this.repo.readonlyHandle, who, true, codes)

    return MasPreflightResponse.parse(this.report(this.decide(codes, rows)))
  }

  /** Open one batch and hand it to the queue. Nothing is sent inside this call.
   *
   *  ------------------------------------------------------------------
   *  TWO PERMISSIONS ON ONE ROUTE, AND `@Need` CAN ONLY DECLARE ONE
   *  ------------------------------------------------------------------
   *  `chiến-dịch.bắn` and `lead.gửi-mail` are two different reaches, not two
   *  names for one (`e2-access.ts` argues it at length): Quick MAS rides trục 3
   *  and reaches only leads the sender already holds, while firing a campaign
   *  reaches the whole audience including everybody else's leads, wave after
   *  wave. Which one this request needs depends on a field of the BODY, and a
   *  decorator is evaluated before any body exists.
   *
   *  Splitting the endpoint in two was the alternative and it was rejected:
   *  `MasSendRequest` is one shape with `campaignCode` optional precisely so
   *  one send path exists (see its docblock), and two routes would be two
   *  places for the run to be created slightly differently.
   *
   *  So the route declares the WEAKER permission and this method raises the bar
   *  when `campaignCode` is present. That ordering is what makes it safe: every
   *  role holding `chiến-dịch.bắn` today also holds `lead.gửi-mail`
   *  (`ROLE_PERMISSIONS`), so the guard never refuses a campaign send it should
   *  have allowed — and the day a role is granted the campaign permission
   *  alone, the failure is a 403 on a send, which is the closed direction.
   *
   *  `allows()` and not `check()`: `check()` weighs all three axes, and the
   *  guard has already settled licence and session for `branch: 'Sales'` on
   *  this very request. The one axis still open is the role, and `allows()` is
   *  the door E2 provides for exactly that question.
   *
   *  ------------------------------------------------------------------
   *  THE CAMPAIGN BRANCH ALSO LIFTS THE SCOPE CEILING
   *  ------------------------------------------------------------------
   *  `scoped` is false for a campaign send, and that is the same decision seen
   *  from the data side rather than the permission side: a campaign's audience
   *  is the campaign's, so cutting it down to the sender's own leads would fire
   *  wave 2 at a different set of people than wave 1 — the exact drift
   *  `campaign_member` freezes membership to prevent. Quick MAS keeps the axis. */
  async send(who: Actor, body: MasSendRequest): Promise<MasSendResponse> {
    if (body.campaignCode !== undefined && !this.access.allows(who, 'chiến-dịch.bắn')) {
      throw denied(
        'permission-denied',
        'Bắn một đợt của chiến dịch cần quyền “chiến-dịch.bắn” — quyền gửi cho lead của mình không đủ.',
      )
    }

    /* The ceiling, before anything is read. `MAS_MAX_RECIPIENTS` in the
       contract has already refused anything over 200 at the zod gate; this is
       the operator's own brake underneath it, and it only bites when it is set
       LOWER than the contract's number. Counted on what the caller posted,
       not on the deduplicated list, because that is the number on their
       screen — telling somebody who selected 260 rows that they selected 258
       is answering a question nobody asked. */
    if (body.leadCodes.length > this.env.PV_MAS_BATCH_MAX) {
      throw invalid(
        {
          leadCodes: [
            `Một lô tối đa ${this.env.PV_MAS_BATCH_MAX} lead — lô này có ${body.leadCodes.length}.`,
          ],
        },
        `Lô vượt trần: ${body.leadCodes.length} lead, trần hiện tại là ${this.env.PV_MAS_BATCH_MAX}.`,
      )
    }

    const codes = dedupe(body.leadCodes)
    const campaignCode = body.campaignCode
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null
    const state: MailRunState = scheduledAt ? 'SCHEDULED' : 'SENDING'

    const queued = await this.repo.run(async (tx) => {
      if (campaignCode !== undefined && !(await this.repo.campaignExists(tx, campaignCode))) {
        throw notFound('chiến dịch', campaignCode)
      }

      /* Read the audience INSIDE the transaction, not before it: the block
         list is the one input to this decision that another connection can
         change, and a suppression written between the check and the insert
         would otherwise produce a letter to an address already refused. */
      const rows = await this.repo.audience(tx, who, campaignCode === undefined, codes)
      const decided = this.decide(codes, rows)
      const sendable = decided.filter(
        (d): d is { row: MasLeadRow & { email: string } } =>
          d.block === undefined && d.row.email !== null,
      )

      const mailRunId = await this.runs.create(tx, {
        label: body.label,
        templateCode: body.templateCode ?? null,
        subject: body.subject,
        body: body.body,
        cta: body.templateCode ? await this.repo.templateCta(tx, body.templateCode) : null,
        /* Snapshotted at creation, never re-resolved at send time — see
           `mail_run.from_address`. The fallback is not a nicety: a machine
           with no marketing identity configured must still be able to rehearse
           a batch end to end, and a run with an empty `From` is two hundred
           letters written by nobody. */
        fromAddress: this.env.PV_EMAIL_MAS_FROM || this.env.PV_EMAIL_FROM,
        replyTo: this.env.PV_EMAIL_MAS_REPLY_TO || null,
        state,
        scheduledAt,
        /* How many recipients survived preflight (`mail_run.audience_count`).
           Equal to `queued` below by construction: the run id is brand new, so
           no `event_key` built from it can already be in the ledger and
           `enqueueBatch` cannot drop a row. */
        audienceCount: sendable.length,
        createdBy: who.id,
      })

      const intents = sendable.map((d) => this.intentOf(mailRunId, d.row))
      /* Every row's retry clock is set to the run's own send time, which is
         how a SCHEDULED batch waits: `pendingBatch()` already refuses a row
         that is not due, so scheduling needs no second scanner. */
      const written = await this.mail.enqueueBatch(tx, intents, { nextAttemptAt: scheduledAt })

      if (campaignCode !== undefined) {
        const waveNo = await this.repo.nextWaveNo(tx, campaignCode)
        await this.repo.linkCampaign(tx, { campaignCode, mailRunId, waveNo })
      }

      return { mailRunId, written }
    })

    return MasSendResponse.parse({
      mailRunId: queued.mailRunId,
      queued: queued.written,
      /* `queued + skipped` equals the number of codes POSTED — the identity
         `MasSendResponse` exists to give a person, so they can see that 40
         picks became 37 letters without counting anything. It therefore
         measures against `body.leadCodes.length` and absorbs every reason a
         pick produced no row: the three block reasons, a code repeated in the
         list, a code naming no lead, and a lead the scope axis cut. */
      skipped: body.leadCodes.length - queued.written,
      state,
    })
  }

  /** The run list. Two things the platform repository cannot do for itself.
   *
   *  ------------------------------------------------------------------
   *  THE CAMPAIGN FILTER, RESOLVED BEFORE IT IS ASKED
   *  ------------------------------------------------------------------
   *  `MailRunRepository.list()` THROWS on `query.campaign` without `onlyIds`,
   *  rather than quietly handing a screen that asked for one campaign every run
   *  in the system. The answer lives in `sales.campaign_run`, which `platform/`
   *  may not read, so this is the half that resolves it. An empty result is a
   *  legitimate answer — "that campaign has never been fired" — and produces an
   *  empty page instead of an unfiltered one.
   *
   *  ------------------------------------------------------------------
   *  AND `hidden`, WHICH THE PLATFORM HARDCODES TO 0 ON PURPOSE
   *  ------------------------------------------------------------------
   *  Luật 7 wants "Bị ẩn theo quyền của bạn" on the screen, and the server is
   *  the only half that can count what it did not send. Permissions are not a
   *  platform-repository decision, so that repository reports 0 and the branch
   *  that owns the endpoint adds its own axis's cut. `page.hidden` is still
   *  added rather than replaced: the day the platform grows a cut of its own,
   *  this line already carries it. */
  async list(who: Actor, query: MailRunListQuery): Promise<MailRunListResponse> {
    const campaignIds = query.campaign
      ? await this.repo.runIdsOfCampaign(query.campaign)
      : undefined

    const scope = await this.repo.visibleRuns(who, query, campaignIds)
    const page = await this.runs.list(query, scope.onlyIds)

    return MailRunListResponse.parse({ ...page, hidden: page.hidden + scope.hidden })
  }

  async templates(): Promise<MailTemplateListResponse> {
    return MailTemplateListResponse.parse({ rows: await this.repo.templates() })
  }

  /** WHO GETS A LETTER — the whole decision, in one pass over the picks.
   *
   *  ------------------------------------------------------------------
   *  THE ORDER OF THE THREE REASONS IS THE DECISION
   *  ------------------------------------------------------------------
   *  A lead can fail more than one test, and `MasRecipient.block` holds one
   *  answer, so the order below is what the person reads:
   *
   *   1 · `NO_EMAIL`   — there is no address, so no other test even applies.
   *   2 · `SUPPRESSED` — the address is refused, and nothing the sender does
   *                      changes that. It has to outrank `DUPLICATE`, because
   *                      `DUPLICATE` means "folded into a letter that IS going
   *                      out" — and telling someone their lead was folded into
   *                      a letter that was never posted is a lie that sends
   *                      them looking for a mail nobody received. Two leads
   *                      sharing one suppressed address therefore BOTH read
   *                      `SUPPRESSED`, which is what actually happened.
   *   3 · `DUPLICATE`  — a letter is going to this address; this pick was
   *                      folded into it.
   *
   *  ------------------------------------------------------------------
   *  FIRST PICK WINS, AND "FIRST" MEANS THE ORDER THE USER SENT
   *  ------------------------------------------------------------------
   *  The loop walks `codes`, not the rows: the request's order is the order the
   *  rows were ticked in the book, so the letter goes to the pick the person
   *  made first and the response comes back in the order they will recognise.
   *  Ordering by `lead.code` instead would be equally deterministic and would
   *  fold a pick into a lead further down a list they never scrolled to.
   *
   *  A code with no row is skipped entirely — it names no lead, or it names one
   *  the scope axis cut in SQL. Neither has a `MasRecipientBlock`, and inventing
   *  a row for the second would print a company name this caller may not read. */
  private decide(codes: readonly string[], rows: readonly MasLeadRow[]): Decided[] {
    const byCode = new Map(rows.map((row) => [row.code, row]))
    /* Addresses that already have a letter in this batch. Lower-cased for the
       same reason `email_delivery.recipient` is: `An@x.vn` and `an@x.vn` are
       one mailbox, and a duplicate check that misses that mails one person
       twice from one batch. */
    const spokenFor = new Set<string>()
    const out: Decided[] = []

    for (const code of codes) {
      const row = byCode.get(code)
      if (!row) continue

      const address = row.email?.toLowerCase()
      const block: MasRecipientBlock | undefined = !address
        ? 'NO_EMAIL'
        : row.suppressed
          ? 'SUPPRESSED'
          : spokenFor.has(address)
            ? 'DUPLICATE'
            : undefined

      if (block === undefined && address) spokenFor.add(address)
      out.push({ row, block })
    }

    return out
  }

  /** Rows AND counts — the redundancy `MasPreflightResponse` asks for on
   *  purpose: the counts are what the send button prints, the rows are what the
   *  expandable list shows when somebody asks which three. */
  private report(decided: readonly Decided[]): MasPreflightResponse {
    const recipients: MasRecipient[] = decided.map((d) => ({
      leadCode: d.row.code,
      company: d.row.company,
      contactName: d.row.contactName,
      email: d.row.email ?? undefined,
      block: d.block,
    }))

    return {
      recipients,
      sendable: decided.filter((d) => d.block === undefined).length,
      blocked: decided.filter((d) => d.block !== undefined).length,
      /* Counted over every pick, blocked ones included — see the field's
         docblock in `@pv/contracts`. It answers "where did this list come
         from", not "how many letters go out", so it can exceed `sendable`. */
      apolloCount: decided.filter((d) => d.row.sourceKind === 'APOLLO').length,
    }
  }

  /** One recipient's promise to send.
   *
   *  `merge` carries `company` and `contactName` across the platform boundary
   *  ONCE, here, at enqueue time — that is the entire reason
   *  `email_delivery.merge` exists. The composer runs in the worker, in
   *  `platform/`, where `sales.lead` is unreadable; a letter that had to look
   *  its own recipient up would drag the platform across the line at every
   *  send. */
  private intentOf(mailRunId: string, row: MasLeadRow & { email: string }): MailIntent {
    return {
      eventKey: eventKeyOf(mailRunId, row.code),
      eventType: MAS_EVENT,
      aggregateType: 'lead',
      aggregateId: row.code,
      template: TEMPLATE,
      templateVersion: TEMPLATE_VERSION,
      recipient: row.email,
      mailRunId,
      merge: { company: row.company, contactName: row.contactName },
    }
  }
}

/** The same code twice in one pick is one recipient, not two letters.
 *
 *  `MasPreflightRequest`/`MasSendRequest` accept a plain array, so a client
 *  that appends on every click can post `LD-0007` twice. Left alone, the
 *  second occurrence would come back marked `DUPLICATE` — technically true and
 *  useless, because it points at itself rather than at another lead sharing a
 *  mailbox, which is the only thing that reason means. Order is preserved: the
 *  first occurrence is the one kept. */
function dedupe(codes: readonly string[]): string[] {
  return [...new Set(codes)]
}
