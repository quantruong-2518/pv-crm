import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  MAIL_DOOR_LABEL,
  MAIL_NAME_MAX,
  MailGroupPreflightResponse,
  MailGroupSendResponse,
  MasPreviewResponse,
  SALES_INBOX,
  type MailGroupBlock,
  type MailGroupPreflightRequest,
  type MailGroupPreviewRequest,
  type MailGroupRecipient,
  type MailGroupSendRequest,
  type MailRunState,
  type MailSubjectKind,
} from '@pv/contracts'
import { ENV, type Env } from '@api/platform/config/env'
import type { Db } from '@api/platform/db/db.module'
import { conflict, denied, invalid, notFound } from '@api/platform/http/problem'
import {
  MAIL_ENQUEUE,
  MAS_GROUP_TEMPLATE,
  type MailAddressIntent,
  type MailEnqueue,
} from '@api/platform/mail/mail.contract'
import { renderMasLetter } from '@api/platform/mail/mas-letter'
import { MailRunRepository } from '@api/platform/mail/mail-run.repository'
import { LeadRepository } from '../lead/lead.repository'
import { LEAD_GONE_STATES, LEAD_GONE_WORDS, LeadStateWriter } from '../lead/lead-state'
import {
  MailLetterRepository,
  type FiledLetter,
  type LetterContact,
  type LetterSubject,
} from './mail-letter.repository'
import { MasRepository } from './mas.repository'
import { eventKeyOf, mergeOf, previewFrame } from './mas.service'

/** One judged To contact; `email` is set exactly when it will receive. */
type Judged = { contact: LetterContact; block?: MailGroupBlock }

/** A door's label as it reads mid-sentence in a problem title: lower case. */
const subjectLabel = (door: MailSubjectKind): string => MAIL_DOOR_LABEL[door].toLowerCase()

/** THE GROUP LETTER (G1/G7) — one letter every recipient sees in To/CC, sent
 *  from a detail door: `/sales/mail/letters{,/preflight,/preview}`.
 *
 *  Scope is proven on the SUBJECT'S LEAD whatever the door (owner decision 7):
 *  `lead.send-email` is a right over leads, and a deal or a contract is written
 *  to through its lead. To = contacts of the subject's company, by code — the
 *  server resolves the addresses, so suppression is judged on what it trusts,
 *  once at preflight and again inside the send transaction.
 *
 *  Idempotent on the client's `letterId`, carried in the event key: a retried
 *  POST finds the letter it already filed. Same MAS switch as the bulk path —
 *  the letter rides the same run, identity and worker. */
@Injectable()
export class MailLetterService {
  constructor(
    private readonly repo: MailLetterRepository,
    private readonly mas: MasRepository,
    private readonly leads: LeadRepository,
    private readonly runs: MailRunRepository,
    @Inject(MAIL_ENQUEUE) private readonly mail: MailEnqueue,
    @Inject(ENV) private readonly env: Env,
    private readonly states: LeadStateWriter,
  ) {}

  async preflight(
    who: Actor,
    body: MailGroupPreflightRequest,
  ): Promise<MailGroupPreflightResponse> {
    const subject = await this.subjectFor(who, body.door, body.subjectCode)
    const judged = await this.judge(this.repo.readonlyHandle, subject, body.to)
    return MailGroupPreflightResponse.parse({
      recipients: judged.map(toRecipient),
      sendable: judged.filter((j) => !j.block).length,
      blocked: judged.filter((j) => j.block).length,
    })
  }

  /** `{{contactName}}` is the FIRST To that will receive (owner decision) —
   *  one copy, one name. Blocked-only lists still preview, on the first pick. */
  async preview(who: Actor, body: MailGroupPreviewRequest): Promise<MasPreviewResponse> {
    const subject = await this.subjectFor(who, body.door, body.subjectCode)
    const judged = await this.judge(this.repo.readonlyHandle, subject, body.to)
    const first = (judged.find((j) => !j.block) ?? judged[0])?.contact
    const frame = previewFrame(this.env)

    const letter = await renderMasLetter({
      subject: body.subject,
      body: body.body,
      cta: body.cta,
      merge: mergeOf({
        company: subject.company,
        contactName: first?.name ?? 'anh/chị',
        email: first?.email ?? null,
      }),
      unsubscribeUrl: frame.unsubscribeUrl,
      sender: frame.sender,
      assetBaseUrl: frame.assetBaseUrl,
    })
    return MasPreviewResponse.parse({ ...letter, from: frame.from })
  }

  async send(who: Actor, body: MailGroupSendRequest): Promise<MailGroupSendResponse> {
    if (!this.env.PV_MAS_ENABLED) {
      throw conflict('Đường gửi thư đang tắt trên máy chủ này — cần bật PV_MAS_ENABLED.')
    }
    const subject = await this.subjectFor(who, body.door, body.subjectCode)
    const eventKey = eventKeyOf(body.door, body.letterId, 'letter')
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null

    const filed = await this.repo.filedLetter(eventKey)
    if (filed) {
      if (filed.createdBy !== who.id || !sameLetter(filed, body, scheduledAt)) {
        throw conflict(
          'Mã thư này đã được dùng cho một thư khác — mở lại khung soạn để gửi thư mới.',
        )
      }
      return reply(filed.runId, filed.toCount, body.to.length, filed.state)
    }

    if (scheduledAt && scheduledAt <= new Date()) {
      throw invalid(
        { scheduledAt: ['Thời gian đặt lịch phải sau thời điểm hiện tại.'] },
        'Không thể đặt lịch gửi trong quá khứ.',
      )
    }
    const state: MailRunState = scheduledAt ? 'SCHEDULED' : 'SENDING'
    /* G3: the run is named "subject code · template name" — the book's label. */
    const template = body.templateCode
      ? await this.mas.templateByCode(body.templateCode)
      : undefined

    const queued = await this.repo.run(async (tx) => {
      const judged = await this.judge(tx, subject, body.to)
      const to = judged.filter((j) => !j.block)
      const cc = await this.ccOf(tx, body.ccActorIds)
      const addresses = addressesOf(to, cc)
      const first = to[0]?.contact
      if (!first?.email) {
        throw invalid(
          { to: ['Không còn người nhận nào nhận được thư — kiểm tra email của từng người.'] },
          'Không còn người nhận hợp lệ.',
        )
      }

      const mailRunId = await this.runs.create(tx, {
        label: `${body.subjectCode} · ${template?.name ?? body.subject}`.slice(0, MAIL_NAME_MAX),
        templateCode: body.templateCode ?? null,
        subject: body.subject,
        body: body.body,
        cta: body.cta ?? null,
        fromAddress: this.env.PV_EMAIL_MAS_FROM || this.env.PV_EMAIL_FROM,
        replyTo: this.env.PV_EMAIL_MAS_REPLY_TO || null,
        ccAddresses: [SALES_INBOX],
        kind: 'group',
        bccCopyTo: null,
        awaitsRelease: false,
        state,
        scheduledAt,
        audienceCount: 1,
        createdBy: who.id,
      })
      const deliveryId = await this.mail.enqueueLetter(
        tx,
        {
          eventKey,
          eventType: 'sales.mail.letter.queued',
          aggregateType: body.door,
          aggregateId: body.subjectCode,
          template: MAS_GROUP_TEMPLATE,
          templateVersion: 1,
          recipient: first.email,
          mailRunId,
          role: 'recipient',
          merge: mergeOf({ company: subject.company, contactName: first.name, email: first.email }),
          addresses,
        },
        { nextAttemptAt: scheduledAt },
      )
      /* Null = the same key landed between the read above and this insert —
         a concurrent retry. Roll this copy back; the other one stands. */
      if (!deliveryId) throw conflict('Thư này vừa được gửi bởi một yêu cầu khác — tải lại để xem.')

      /* Timed = care scheduled; sent now moves nothing here — the letter going
         out does, in the worker (`LeadMailSentHook`, ADR 0068 §1–2). */
      if (body.door === 'lead' && scheduledAt) {
        await this.states.mailTimed(tx, [subject.leadCode], who)
      }
      await this.mas.writeRunNote(tx, {
        actorId: who.id,
        runId: mailRunId,
        note: `tạo thư nhóm · ${subjectLabel(body.door)} ${body.subjectCode} · ${to.length} người nhận`,
      })
      return { mailRunId, toCount: to.length }
    })

    return reply(queued.mailRunId, queued.toCount, body.to.length, state)
  }

  /** 404 for a subject that does not exist, 403 when its lead is not the
   *  caller's — the two refusals `LeadService.guard` keeps apart — and 409 when
   *  a person stopped caring for that lead: it is never mailed (ADR 0068 §5). */
  private async subjectFor(
    who: Actor,
    door: MailSubjectKind,
    code: string,
  ): Promise<LetterSubject> {
    const subject = await this.repo.subjectOf(door, code)
    if (!subject) throw notFound(subjectLabel(door), code)
    const found = await this.leads.byCode(who, subject.leadCode)
    const via = door === 'lead' ? '' : ` (của ${subjectLabel(door)} ${code})`
    if (!found?.inScope) {
      throw denied(
        'out-of-scope',
        `Lead ${subject.leadCode}${via} không đứng tên bạn — hỏi người đang giữ nó.`,
      )
    }
    if ((LEAD_GONE_STATES as readonly string[]).includes(found.row.state)) {
      throw conflict(
        `Lead ${subject.leadCode}${via} đang ở trạng thái ${LEAD_GONE_WORDS} — không gửi thư được.`,
      )
    }
    return subject
  }

  /** The verdict per To pick, in the order picked. A code outside the
   *  subject's company is refused outright — a code is not an address the
   *  client may choose freely. Reason order as `MasService.decide`. */
  private async judge(
    handle: Db,
    subject: LetterSubject,
    codes: readonly string[],
  ): Promise<Judged[]> {
    const rows = await this.repo.contacts(handle, subject, codes)
    const byCode = new Map(rows.map((row) => [row.code, row]))
    const outside = codes.filter((code) => !byCode.get(code)?.belongs)
    if (outside.length > 0) {
      throw invalid(
        { to: [`Không thuộc công ty của đối tượng này: ${outside.join(', ')}.`] },
        'Người nhận phải là liên hệ của công ty đang gửi.',
      )
    }

    const spokenFor = new Set<string>([SALES_INBOX])
    return codes.map((code) => {
      const contact = byCode.get(code) as LetterContact
      const block: MailGroupBlock | undefined = !contact.email
        ? 'NO_EMAIL'
        : contact.suppressedReason
          ? 'SUPPRESSED'
          : spokenFor.has(contact.email)
            ? 'DUPLICATE'
            : undefined
      if (!block && contact.email) spokenFor.add(contact.email)
      return { contact, block }
    })
  }

  /** Colleagues copied in: every id must be an active account — a CC that
   *  quietly vanished is a colleague who believes they were copied. */
  private async ccOf(tx: Db, ids: readonly string[]) {
    const found = await this.repo.colleagues(tx, ids)
    const missing = ids.filter((id) => !found.some((f) => f.id === id))
    if (missing.length > 0) {
      throw invalid(
        { ccActorIds: [`Không tìm thấy hoặc đã khoá: ${missing.join(', ')}.`] },
        'Có đồng nghiệp CC không còn hoạt động.',
      )
    }
    return ids.map((id) => found.find((f) => f.id === id) as (typeof found)[number])
  }
}

/** To first, in pick order; a colleague already on the letter is not copied
 *  twice, and the locked inbox stays on the run, not in these rows. */
function addressesOf(
  to: readonly Judged[],
  cc: readonly { id: string; name: string; email: string }[],
): MailAddressIntent[] {
  const out: MailAddressIntent[] = to.map((j) => ({
    role: 'to',
    address: j.contact.email as string,
    displayName: j.contact.name,
    ref: `contact:${j.contact.code}`,
  }))
  const seen = new Set([SALES_INBOX, ...out.map((a) => a.address)])
  for (const c of cc) {
    if (seen.has(c.email)) continue
    seen.add(c.email)
    out.push({ role: 'cc', address: c.email, displayName: c.name, ref: `actor:${c.id}` })
  }
  return out
}

/** A replayed `letterId` returns the filed letter only for the same intent —
 *  `sameSequenceWave`'s rule for the bulk path. The stored To is what survived
 *  suppression, so it must be drawn from the posted picks, not equal them. */
function sameLetter(
  filed: FiledLetter,
  body: MailGroupSendRequest,
  scheduledAt: Date | null,
): boolean {
  const filedAt = filed.scheduledAt === null ? null : new Date(filed.scheduledAt).getTime()
  const to = new Set(body.to)
  const cc = new Set(body.ccActorIds)
  return (
    filed.subject === body.subject &&
    filed.body === body.body &&
    filed.ctaLabel === (body.cta?.label ?? null) &&
    filed.ctaUrl === (body.cta?.url ?? null) &&
    filed.templateCode === (body.templateCode ?? null) &&
    filedAt === (scheduledAt?.getTime() ?? null) &&
    filed.toCodes.every((code) => to.has(code)) &&
    filed.ccActorIds.every((id) => cc.has(id))
  )
}

function toRecipient(j: Judged): MailGroupRecipient {
  return {
    contactCode: j.contact.code,
    name: j.contact.name,
    ...(j.contact.email ? { email: j.contact.email } : {}),
    ...(j.block ? { block: j.block } : {}),
    ...(j.block === 'SUPPRESSED' && j.contact.suppressedReason
      ? { suppressedReason: j.contact.suppressedReason }
      : {}),
  }
}

/** `queued + skipped` = the To picks posted, the identity `MasSendResponse`
 *  gives the bulk path. */
function reply(mailRunId: string, queued: number, posted: number, state: MailRunState) {
  return MailGroupSendResponse.parse({
    mailRunId,
    queued,
    skipped: Math.max(posted - queued, 0),
    state,
  })
}
