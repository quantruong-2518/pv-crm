import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  MailRunListResponse,
  MailRunPatchResponse,
  MailRunRecipientsResponse,
  MailTemplateCreateResponse,
  MailTemplateListResponse,
  MailTemplatePatchResponse,
  MasPreflightResponse,
  MasPreviewResponse,
  MasSendResponse,
  type MailMergeKey,
  type MailRunListQuery,
  type MailRunPatch,
  type MailRunState,
  type MailTemplateCreate,
  type MailTemplatePatch,
  type MasPreflightRequest,
  type MasPreviewRequest,
  type MasRecipient,
  type MasRecipientBlock,
  type MailRunRecipientRow,
  type MasSendRequest,
} from '@pv/contracts'
import { brandAssetUrl, ENV, type Env } from '@api/platform/config/env'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, invalid, notFound } from '@api/platform/http/problem'
import { MAIL_ENQUEUE, type MailEnqueue, type MailIntent } from '@api/platform/mail/mail.contract'
import { renderMasLetter, senderOf } from '@api/platform/mail/mas-letter'
import { MailRunRepository } from '@api/platform/mail/mail-run.repository'
import { MasRepository, type MasLeadRow, type MasRecipientRead } from './mas.repository'

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

    return MasPreflightResponse.parse(this.report(codes, this.decide(codes, rows)))
  }

  /** The letter as it will actually look, rendered through the worker's own
   *  renderer. Writes nothing and sends nothing.
   *
   *  ------------------------------------------------------------------
   *  THE MERGE COMES FROM `mergeOf`, THE SAME CALL THE SEND USES
   *  ------------------------------------------------------------------
   *  `intentOf` builds a recipient's substitution values with that helper and
   *  so does this. Spelling the four keys out again here would be a second list
   *  to keep in step, and the day they disagree the preview fills a slot the
   *  send leaves blank — a difference nobody can see until the letter is gone.
   *
   *  ------------------------------------------------------------------
   *  NO LEAD IS A VALID REQUEST, AND SO IS A LEAD THIS ACTOR CANNOT SEE
   *  ------------------------------------------------------------------
   *  Both fall back to `SAMPLE_MERGE` rather than failing. Somebody who has
   *  typed a subject but not yet picked recipients is precisely who most needs
   *  to see the shape of the letter, and a 404 in the middle of writing is a
   *  dead end that teaches people to skip the preview. The scope axis stays on
   *  the read — a name this actor may not see never reaches the render — it
   *  just degrades to sample values instead of to an error. */
  async preview(who: Actor, body: MasPreviewRequest): Promise<MasPreviewResponse> {
    const rows = body.leadCode
      ? await this.repo.audience(this.repo.readonlyHandle, who, true, [body.leadCode])
      : []
    const row = rows[0]

    const letter = await renderMasLetter({
      subject: body.subject,
      body: body.body,
      cta: body.cta,
      ...(body.bookingUrl ? { bookingUrl: body.bookingUrl } : {}),
      merge: row ? mergeOf(row) : SAMPLE_MERGE,
      unsubscribeUrl: this.previewUnsubscribeUrl(),
      sender: senderOf(
        this.env.PV_EMAIL_MAS_FROM || this.env.PV_EMAIL_FROM,
        this.env.PV_MAS_SENDER_POSTAL,
      ),
      assetBaseUrl: brandAssetUrl(this.env),
    })

    return MasPreviewResponse.parse(letter)
  }

  /** A footer link that goes to the unsubscribe page and unsubscribes nobody.
   *
   *  The real link signs a `email_delivery.id`, and a preview has no delivery.
   *  Minting one to make the footer look finished would mint a token that
   *  cancels somebody's mail; leaving the footer out would hide the one line
   *  the sender is legally answerable for. So the link is real in shape and
   *  inert in effect: the token does not verify, and `UnsubscribeController`
   *  answers it the way it answers any bad token. */
  private previewUnsubscribeUrl(): string {
    const origin = this.env.PV_API_PUBLIC_URL || this.env.PV_APP_URL
    return `${origin.replace(/\/+$/, '')}/mail/unsubscribe/xem-truoc`
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
    /* THE MAS SWITCH, and it is checked HERE rather than on the four routes.
       `PV_MAS_ENABLED` promises to decide "whether the bulk path may be used at
       all" (env.ts), and until this line existed it decided nothing — setting
       it to `false` stopped no send on any machine, which is the worst state a
       switch can be in: an operator who turns it off believes the campaigns
       have stopped.

       Only the WRITE door. `preflight`, the run list and the template list
       write nothing and post nothing, and closing them too would blank the
       screen a person uses to see WHY a batch is not going out. What has to be
       impossible is a letter leaving.

       `conflict` (409) and not `denied` (403), deliberately: this is not about
       the caller. A 403 puts "Bạn không có quyền" on screen and sends somebody
       to ask for a permission that would change nothing — the answer is a
       variable on the server, so the message names the variable. */
    if (!this.env.PV_MAS_ENABLED) {
      throw conflict(
        'Đường gửi hàng loạt đang tắt trên máy chủ này — cần bật PV_MAS_ENABLED. Mail giao dịch không bị ảnh hưởng.',
      )
    }

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
        /* WHAT THE SENDER REVIEWED, not what the template happens to say today.
           This used to read `templateCta(tx, body.templateCode)` — the run
           copied the button straight out of `sales.mail_template`, so the
           person who pressed send had never seen the link that went into two
           hundred letters, and editing the template afterwards changed the
           destination of every batch composed from it since. The run snapshots
           `subject` and `body` for exactly that reason; the button is part of
           the letter and belongs in the same snapshot. The template's pair now
           pre-fills the panel instead — see `MasSendRequest.cta`. */
        cta: body.cta ?? null,
        /* Same snapshot, same argument as the CTA above: the booking link the
           sender saw is the one that goes out. */
        bookingUrl: body.bookingUrl ?? null,
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

  /** STOP A BATCH. The one state transition a person may ask for.
   *
   *  ------------------------------------------------------------------
   *  THE SCOPE AXIS IS CHECKED HERE, IN NODE, AND THAT IS THE EXCEPTION
   *  ------------------------------------------------------------------
   *  Everywhere else in this feature the axis is cut in SQL, because letting a
   *  row out of the database and then discarding it is a leak rather than a
   *  waste (`MasRepository.audience`). A run is the one object where that
   *  argument does not apply: what is read here is `created_by` — an actor id
   *  the caller either matches or does not — and nothing about anybody else's
   *  batch is loaded to reach that verdict. Pushing it into the UPDATE instead
   *  would collapse "no such run" and "not your run" into one non-answer, and
   *  those are the two refusals `LeadService.profile` argues at length must
   *  stay apart: 404 sends somebody to check the id, 403 sends them to whoever
   *  holds it.
   *
   *  ------------------------------------------------------------------
   *  ALREADY CANCELLED IS A SUCCESS, NOT A CONFLICT
   *  ------------------------------------------------------------------
   *  Two people watching a bad batch both press stop; the second request must
   *  not paint an error over a screen that is showing the correct outcome.
   *  `held: 0` is the honest number for it — there was nothing left to withhold
   *  — and the state on the way back is the receipt. `SENT` is the one refusal:
   *  the letters are gone, and answering "đã huỷ" to that would be the single
   *  most misleading sentence this endpoint could produce. */
  async cancel(who: Actor, id: string, patch: MailRunPatch): Promise<MailRunPatchResponse> {
    const run = await this.runs.byId(id)
    if (!run) throw notFound('lô gửi', id)

    if (who.ownOnly && run.createdBy !== who.id) {
      throw denied('out-of-scope', `Lô gửi này không do bạn tạo — hỏi người đã bấm gửi.`)
    }

    if (run.state === 'SENT') {
      throw conflict('Lô này đã gửi xong — không còn thư nào để giữ lại.')
    }

    if (run.state === patch.state) {
      return MailRunPatchResponse.parse({ id: run.id, state: run.state, held: 0 })
    }

    /* The cancel and its audit line are ONE unit of work. A run stopped with
       no record of who stopped it is the half that gets asked about later, and
       `AuditRepository.write` goes through the pool — the same reason
       `LeadWriteRepository.writeBatchNote` exists rather than calling it. */
    const stopped = await this.repo.run(async (tx) => {
      const result = await this.runs.cancel(tx, id)
      if (result) await this.repo.writeCancelNote(tx, { actorId: who.id, runId: id })
      return result
    })

    /* `null` means the row moved out from under the read above — another
       request cancelled it, or the sweeper filed it `SENT` — in the fraction of
       a second between. Report what is actually in the table now rather than
       re-deciding: a second read is cheap and a guess is not. */
    if (!stopped) {
      const now = await this.runs.byId(id)
      if (!now) throw notFound('lô gửi', id)
      if (now.state === 'SENT') {
        throw conflict('Lô này vừa gửi xong — không còn thư nào để giữ lại.')
      }
      return MailRunPatchResponse.parse({ id, state: now.state, held: 0 })
    }

    return MailRunPatchResponse.parse({ id, state: patch.state, held: stopped.held })
  }

  /** WHO this run went to and what became of each letter.
   *
   *  ------------------------------------------------------------------
   *  THE ENTITLEMENT IS SETTLED ON THE RUN, EXACTLY AS `cancel` SETTLES IT
   *  ------------------------------------------------------------------
   *  Same two refusals in the same order and for the reasons written out at
   *  `cancel`: 404 sends somebody to check the id, 403 sends them to whoever
   *  pressed send. Reading `created_by` loads nothing about anybody else's
   *  batch, so this is the one object where deciding in Node rather than in the
   *  WHERE clause leaks nothing — and it is what lets the repository skip a
   *  second cut on `lead.owner_id` that would answer a refusal with an empty
   *  list.
   *
   *  A run with no rows yet is an ordinary answer, not a 404: a `SCHEDULED`
   *  batch has a run and no letters until its hour comes. */
  async recipients(who: Actor, id: string): Promise<MailRunRecipientsResponse> {
    const run = await this.runs.byId(id)
    if (!run) throw notFound('lô gửi', id)

    if (who.ownOnly && run.createdBy !== who.id) {
      throw denied('out-of-scope', `Lô gửi này không do bạn tạo — hỏi người đã bấm gửi.`)
    }

    const rows = await this.repo.recipients(id)
    return MailRunRecipientsResponse.parse({ rows: rows.map(toRunRecipient) })
  }

  async templates(): Promise<MailTemplateListResponse> {
    return MailTemplateListResponse.parse({ rows: await this.repo.templates() })
  }

  /** A NEW TEMPLATE. The duplicate check is asked here rather than left to the
   *  primary key for the reason `campaignExists` gives: the constraint would
   *  refuse the insert anyway, but as a 500 where the honest answer names the
   *  code the person typed and points at the field they typed it into.
   *
   *  It is a race the check does not close — two creates of the same code can
   *  both read "free" — and it does not need to: the PK still refuses the
   *  second one, so the outcome is one row either way. This only decides which
   *  of the two failures a person reads. */
  async createTemplate(input: MailTemplateCreate): Promise<MailTemplateCreateResponse> {
    if (await this.repo.templateByCode(input.code)) {
      throw conflict(`Mã mẫu ${input.code} đã có rồi — chọn mã khác.`, {
        code: ['Mã này đã được dùng cho một mẫu khác.'],
      })
    }

    await this.repo.createTemplate({
      code: input.code,
      name: input.name,
      subject: input.subject,
      body: input.body,
      ctaLabel: input.cta?.label ?? null,
      ctaUrl: input.cta?.url ?? null,
      bookingUrl: input.bookingUrl ?? null,
    })

    return MailTemplateCreateResponse.parse(await this.repo.templateByCode(input.code))
  }

  /** EDIT, RETIRE, OR BOTH — and nothing here touches a letter already sent.
   *
   *  That is a property of the table, not of this method: `mail_run` snapshots
   *  subject and body when the batch is created (`mail-run.schema.ts`), so a
   *  template is only ever a starting point. Editing one changes what the next
   *  person starts from and nothing else.
   *
   *  `cta` carries the three states `MailTemplatePatch` documents. The pair is
   *  split back into two columns HERE rather than in the repository because the
   *  `mail_template_cta_pair` CHECK is about columns while the contract is
   *  about a button — this line is where one becomes the other. */
  async patchTemplate(code: string, input: MailTemplatePatch): Promise<MailTemplatePatchResponse> {
    if (!(await this.repo.templateByCode(code))) throw notFound('mẫu thư', code)

    await this.repo.patchTemplate(code, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.cta !== undefined
        ? { ctaLabel: input.cta?.label ?? null, ctaUrl: input.cta?.url ?? null }
        : {}),
      ...(input.bookingUrl !== undefined ? { bookingUrl: input.bookingUrl } : {}),
    })

    return MailTemplatePatchResponse.parse(await this.repo.templateByCode(code))
  }

  /** WHO GETS A LETTER — the whole decision, in one pass over the picks.
   *
   *  ------------------------------------------------------------------
   *  THE ORDER OF THE FOUR REASONS IS THE DECISION
   *  ------------------------------------------------------------------
   *  A lead can fail more than one test, and `MasRecipient.block` holds one
   *  answer, so the order below is what the person reads:
   *
   *   1 · `EXITED`     — this lead left the funnel, so the question "can we
   *                      write to it" does not arise. It outranks `NO_EMAIL`
   *                      because the two lead to opposite actions: `NO_EMAIL`
   *                      sends somebody off to find a mailbox, and finding one
   *                      for a lead we stopped pursuing is work spent to reach
   *                      a person we decided not to reach.
   *   2 · `NO_EMAIL`   — there is no address, so no other test even applies.
   *   3 · `SUPPRESSED` — the address is refused, and nothing the sender does
   *                      changes that. It has to outrank `DUPLICATE`, because
   *                      `DUPLICATE` means "folded into a letter that IS going
   *                      out" — and telling someone their lead was folded into
   *                      a letter that was never posted is a lie that sends
   *                      them looking for a mail nobody received. Two leads
   *                      sharing one suppressed address therefore BOTH read
   *                      `SUPPRESSED`, which is what actually happened.
   *   4 · `DUPLICATE`  — a letter is going to this address; this pick was
   *                      folded into it.
   *
   *  ------------------------------------------------------------------
   *  AN EXITED LEAD DOES NOT CLAIM ITS ADDRESS EITHER
   *  ------------------------------------------------------------------
   *  `spokenFor` is only ever added to on the sendable branch, so a pick
   *  blocked for ANY of the four reasons leaves the address free for the next
   *  pick that shares it. That matters most here: a dead lead and a live lead
   *  at the same company mailbox must not end with the live one reading
   *  `DUPLICATE` of a letter that was never written.
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
      const block: MasRecipientBlock | undefined = row.exitReason
        ? 'EXITED'
        : !address
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
   *  expandable list shows when somebody asks which three.
   *
   *  `codes` is here for exactly one number. `decided` holds one entry per pick
   *  the query COULD return, so the picks it could not — a code naming no lead,
   *  a code the scope axis cut — are simply missing, and the difference between
   *  the two lengths is the only place that count exists. Without it the panel
   *  prints `sendable + blocked` and quietly loses the rest of what somebody
   *  ticked; see `MasPreflightResponse.hidden`. */
  private report(codes: readonly string[], decided: readonly Decided[]): MasPreflightResponse {
    const recipients: MasRecipient[] = decided.map((d) => ({
      leadCode: d.row.code,
      company: d.row.company,
      contactName: d.row.contactName,
      contactTitle: d.row.contactTitle ?? undefined,
      email: d.row.email ?? undefined,
      block: d.block,
    }))

    return {
      recipients,
      sendable: decided.filter((d) => d.block === undefined).length,
      blocked: decided.filter((d) => d.block !== undefined).length,
      /* Picks that came back in no row at all — see the field and `report`'s
         own docblock. Never negative: `audience()` filters by `IN (codes)`, so
         it cannot return a row for a code nobody asked about. */
      hidden: codes.length - decided.length,
      /* Counted over every pick, blocked ones included — see the field's
         docblock in `@pv/contracts`. It answers "where did this list come
         from", not "how many letters go out", so it can exceed `sendable`. */
      apolloCount: decided.filter((d) => d.row.sourceKind === 'APOLLO').length,
    }
  }

  /** One recipient's promise to send.
   *
   *  `merge` carries account/company and contact-name aliases across the
   *  platform boundary ONCE, here, at enqueue time — that is the entire reason
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
      merge: mergeOf(row),
    }
  }
}

/** The five keys a MAS letter may name, and the ONE place they are listed.
 *
 *  Two aliases per value, and both spellings are load-bearing rather than
 *  sloppy: `{{account}}`/`{{company}}` and `{{contactName}}`/`{{contact_name}}`
 *  are all in circulation — the seeded templates use one pair, hand-written
 *  letters and the compose box's hint text use the other — and a key the merge
 *  does not carry becomes an empty string in a letter that has already left.
 *  Accepting both costs two properties; picking one costs a wrong letter.
 *
 *  `email` is the recipient's own address, and it is here for the CTA url —
 *  a booking page prefills its form from the query string, so `{{email}}` in
 *  the link is what saves the reader from retyping what we already know. See
 *  `MAIL_MERGE_KEYS` in `@pv/contracts`.
 *
 *  The `?? ''` cannot reach a sent letter: `intentOf` takes a row already
 *  narrowed to `email: string`, and a lead without an address is blocked in
 *  `decide` before any delivery exists. It is for `preview`, which renders any
 *  lead the actor can read — including one nobody could send to.
 *
 *  Called by `intentOf` for every real recipient and by `preview` for the one
 *  on screen, so what a person reviews substitutes exactly what the send will. */
function mergeOf(
  row: Pick<MasLeadRow, 'company' | 'contactName' | 'email'>,
): Record<MailMergeKey, string> {
  return {
    company: row.company,
    account: row.company,
    contactName: row.contactName,
    contact_name: row.contactName,
    email: row.email ?? '',
  }
}

/** Substitution values for a preview with no lead picked yet.
 *
 *  Visibly a stand-in, and deliberately not a real company from either
 *  scenario fixture: a preview is the one screen whose only job is to be
 *  believed, and a real customer's name sitting in it is a name somebody will
 *  eventually read as the actual recipient. */
const SAMPLE_MERGE: Record<MailMergeKey, string> = mergeOf({
  company: 'Công ty mẫu',
  contactName: 'anh/chị',
  email: 'nguoi.nhan@congty-mau.vn',
})

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

/** One ledger row → one `MailRunRecipientRow`.
 *
 *  Twin of `toMailTimeline` in `lead.mapper.ts`, and every decision in it is
 *  that function's decision — read there first. The two that are this one's own:
 *
 *   · Both names fall back to `'—'` rather than to the empty string. They are
 *     `.min(1)` in the contract, so a lead deleted out from under a sent run
 *     whose ledger snapshot never carried a merge would otherwise take the
 *     whole list out with a 500 on the way back. A dash is the honest reading
 *     of "we no longer know who this was", and the address beside it still is.
 *   · `failReason` travels only for a state where a reason is MEANINGFUL.
 *     `last_error_summary` is a shared column the retry sweeper also writes, so
 *     a row back in `pending` after being rescued still carries the sentence
 *     from the attempt before — printing it next to a letter that is about to
 *     go out tells the reader it failed. */
function toRunRecipient(read: MasRecipientRead): MailRunRecipientRow {
  const sentAt = isoOf(read.sent_at)
  const deliveredAt = isoOf(read.delivered_at)
  const lastOpenAt = isoOf(read.last_open_at)
  const lastClickAt = isoOf(read.last_click_at)

  return {
    leadCode: read.lead_code,
    company: read.company ?? '—',
    contactName: read.contact_name ?? '—',
    email: read.email,
    deliveryState: read.delivery_state,
    ...(sentAt ? { sentAt } : {}),
    ...(deliveredAt ? { deliveredAt } : {}),
    openCount: read.open_count,
    ...(lastOpenAt ? { lastOpenAt } : {}),
    clickCount: read.click_count,
    ...(lastClickAt ? { lastClickAt } : {}),
    ...(read.fail_reason && FAILED_DELIVERY[read.delivery_state]
      ? { failReason: read.fail_reason }
      : {}),
  }
}

/** Driver moment → the contract's `Moc` (ISO 8601 WITH a zone). Same shape and
 *  same reasoning as `isoOf` in `lead.mapper.ts`: PGlite prints
 *  `2027-01-01 02:00:00+00`, which `Moc` refuses, and an unreadable moment is
 *  dropped rather than allowed to throw out of `toISOString()`. */
function isoOf(at: Date | string | null): string | undefined {
  if (!at) return undefined
  const date = at instanceof Date ? at : new Date(at)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/** Delivery states for which an error sentence is the truth. Spelled out
 *  rather than derived from `MAIL_STATE_RANK` — same call `lead.mapper.ts`
 *  makes, same reason: a branch reading the platform's rank table to answer a
 *  screen's question is a dependency on a detail that may move. */
const FAILED_DELIVERY: Record<string, true | undefined> = {
  bounced: true,
  complained: true,
  failed_permanent: true,
  dead: true,
}
