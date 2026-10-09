import { DELIVERY_HEADER, type GmailFailure, type GoogleGmail } from '../google/google-gmail.client'
import { buildRfc822, Rfc822AddressError } from './gmail-rfc822'
import { addressOf } from './gmail-thread.classifier'
import type { MailMessage, MailPort, MailSendResult } from './mail.contract'

/** `MailPort` over ONE PERSON'S Gmail — `flow: 'personal'` and nothing else.
 *
 *  Gmail has no idempotency key, so `idempotencyKey` is unused here and the
 *  duplicate guard is `findSent`: on any attempt after the first, the SENT
 *  label is searched for this delivery's `X-PV-Delivery` before anything is
 *  posted. A lookup that fails is a retry, never a send on a guess.
 *
 *  A failure here is one person's link or one letter. It is therefore never
 *  `wide` and never `rate-limit`: both park the single global queue in
 *  `MailConsumer`, and password mail rides that queue. `PersonalFailure` has
 *  no field that could say either. */

type PersonalFailure = { ok: false; kind: 'retry' | 'permanent'; code: string; summary: string }

/** `MailConsumer` gives up on a letter after 23 h; nothing older can be ours. */
const REPLAY_LOOKBACK_MS = 24 * 60 * 60 * 1_000

export class GmailMailDriver implements MailPort {
  constructor(private readonly gmail: GoogleGmail) {}

  async send(message: MailMessage, _idempotencyKey: string): Promise<MailSendResult> {
    const deliveryId = message.headers?.[DELIVERY_HEADER]
    if (message.flow !== 'personal' || !message.senderActorId || !deliveryId) {
      return {
        ok: false,
        kind: 'permanent',
        code: 'gmail-misrouted',
        summary:
          'Thư không đủ thông tin người gửi để đi qua Gmail cá nhân — báo quản trị hệ thống.',
      }
    }

    /* The mailbox frozen on the run. The client refuses any other link. */
    const mailbox = addressOf(message.from)
    let raw: string
    try {
      raw = buildRfc822(message, new Date())
    } catch (error) {
      if (!(error instanceof Rfc822AddressError)) throw error
      return {
        ok: false,
        kind: 'permanent',
        code: 'gmail-rejected',
        summary:
          'Thư có địa chỉ người gửi hoặc người nhận không hợp lệ nên không gửi được — kiểm tra lại danh sách địa chỉ rồi soạn thư mới.',
      }
    }

    if (message.replay) {
      const since = new Date(Date.now() - REPLAY_LOOKBACK_MS)
      const earlier = await this.gmail.findSent(message.senderActorId, mailbox, deliveryId, since)
      /* The link is gone, so nobody can say whether the first try arrived. */
      if (!earlier.ok && earlier.kind === 'unlinked') return UNVERIFIED
      if (!earlier.ok) return failureOf(earlier)
      if (earlier.found) {
        return { ok: true, providerEmailId: earlier.found.id, threadId: earlier.found.threadId }
      }
    }

    const sent = await this.gmail.send(message.senderActorId, mailbox, raw)
    return sent.ok
      ? { ok: true, providerEmailId: sent.id, threadId: sent.threadId }
      : failureOf(sent)
  }
}

const UNVERIFIED: PersonalFailure = {
  ok: false,
  kind: 'permanent',
  code: 'gmail-unverified',
  summary:
    'Không xác nhận được thư đã gửi hay chưa vì tài khoản Google của người gửi đã ngắt kết nối — kiểm tra hộp Thư đã gửi trước khi gửi lại.',
}

/** Vietnamese, for the person who pressed send: what happened and what to do.
 *  Built from the failure KIND only — Google's own text can quote an address. */
function failureOf(failure: GmailFailure): PersonalFailure {
  switch (failure.kind) {
    case 'unlinked':
      return {
        ok: false,
        kind: 'permanent',
        code: 'gmail-unlinked',
        summary: 'Tài khoản Google của người gửi đã ngắt kết nối — kết nối lại rồi soạn thư mới.',
      }
    case 'no_consent':
      return {
        ok: false,
        kind: 'permanent',
        code: 'gmail-no-consent',
        summary:
          'Tài khoản Google của người gửi chưa cấp quyền gửi thư — kết nối lại và chọn đủ quyền Gmail.',
      }
    case 'transient':
      return {
        ok: false,
        kind: 'retry',
        code: 'gmail-unavailable',
        summary: 'Gmail tạm thời không nhận thư — hệ thống sẽ thử lại.',
      }
    case 'rejected':
      return {
        ok: false,
        kind: 'permanent',
        code: 'gmail-rejected',
        summary: `Gmail từ chối thư này (mã ${failure.status ?? 'không rõ'}).`,
      }
  }
}
