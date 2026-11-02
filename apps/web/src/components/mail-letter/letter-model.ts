import {
  COMPANY_MAIL_DOMAIN,
  MAIL_PERSONAL_WINDOW_HOURS,
  type GoogleLinkStatus,
  type MailGroupPreflightResponse,
  type MailGroupRecipient,
  type MailGroupSendRequest,
  type MailGroupSendResponse,
  type MailLetterState,
  type MasRecipientBlock,
  type MailTemplateRow,
} from '@pv/contracts'
import type { StatusDotState } from '@pv/ui'
import { isHttpUrl } from '@/data/http-url'
import type { MailHint } from '@/data/mail-hints'
import type { LetterContact } from '@/data/mail-letters'
import { dmhm } from '@/lib/date'
import { getLang, message, translate, type Lang, type Message } from '@/app/i18n'

/** The one-screen composer's arithmetic — what the form holds, what blocks
 *  Send, what each line says. No JSX, so the shell only assembles. */

export type LetterForm = {
  templateCode: string
  subject: string
  body: string
  ctaLabel: string
  ctaUrl: string
  timing: 'now' | 'later'
  /** `datetime-local` value, machine-local — see `localSlot`. */
  at: string
}

export const EMPTY_FORM: LetterForm = {
  templateCode: '',
  subject: '',
  body: '',
  ctaLabel: '',
  ctaUrl: '',
  timing: 'now',
  at: '',
}

/** Picking a template replaces the letter, its button included: a button left
 *  over from the previous template would go out under the new text. */
export function withTemplate(form: LetterForm, template?: MailTemplateRow): LetterForm {
  return {
    ...form,
    templateCode: template?.code ?? '',
    ...(template ? { subject: template.subject, body: template.body } : {}),
    ctaLabel: template?.cta?.label ?? '',
    ctaUrl: template?.cta?.url ?? '',
  }
}

/** The button travels only as a complete pair with a real URL, as `MailCta` asks. */
export function letterCta(form: LetterForm): MailGroupSendRequest['cta'] {
  const label = form.ctaLabel.trim()
  const url = form.ctaUrl.trim()
  return label !== '' && isHttpUrl(url) ? { label, url } : undefined
}

export const letterWritten = (form: LetterForm) =>
  form.subject.trim() !== '' && form.body.trim() !== ''

/** Why Send is shut, in one sentence; `null` = only the server's verdict is
 *  still owed. Order follows what a person fixes first. */
export function letterBlocker(
  form: LetterForm,
  picked: number,
  sendable?: number,
  /** Why the chosen mailbox cannot send this letter (`senderFault`). */
  senderFault?: string,
  lang: Lang = getLang(),
): string | null {
  const m = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  if (senderFault) return senderFault
  if (picked === 0) return m('Chưa có ai trong To.', 'No one in To.', 'To에 받는 사람이 없습니다.')
  if (sendable === 0) {
    return m(
      'Chưa có ai trong To nhận được thư.',
      'No one in To can receive the letter.',
      'To의 수신자 중 메일을 받을 수 있는 사람이 없습니다.',
    )
  }
  const gaps = [
    form.subject.trim() ? null : m('tiêu đề', 'subject', '제목'),
    form.body.trim() ? null : m('nội dung', 'body', '내용'),
  ].filter((gap) => gap !== null)
  if (gaps.length > 0) {
    const list = gaps.join(', ')
    return m(`Còn thiếu ${list}.`, `Missing ${list}.`, `${list}을(를) 입력해 주세요.`)
  }
  const ctaTouched = form.ctaLabel.trim() !== '' || form.ctaUrl.trim() !== ''
  if (ctaTouched && !letterCta(form)) {
    return m(
      'Nút trong email cần đủ nhãn và địa chỉ bắt đầu bằng http/https.',
      'The email button needs both a label and an address starting with http/https.',
      '이메일 버튼에는 이름과 http/https로 시작하는 주소가 모두 필요합니다.',
    )
  }
  if (form.timing === 'later' && !(new Date(form.at) > new Date())) {
    return m(
      'Giờ hẹn gửi phải sau lúc này.',
      'The scheduled time must be after now.',
      '예약 시각은 현재 이후여야 합니다.',
    )
  }
  return null
}

/** The footer's plain sentence once nothing blocks. */
export function letterReadyNote(
  report: MailGroupPreflightResponse,
  lang: Lang = getLang(),
): string {
  const { sendable, blocked } = report
  const has = blocked > 0
  return translate(
    message(
      `${sendable} người trong To sẽ nhận${has ? ` · ${blocked} người không nhận` : ''} · một thư.`,
      `${sendable} in To will receive it${has ? ` · ${blocked} will not` : ''} · one letter.`,
      `To의 ${sendable}명이 받습니다${has ? ` · ${blocked}명 제외` : ''} · 메일 1통.`,
    ),
    lang,
  )
}

/** A group letter fills `{{contactName}}` once, from the first To — worth one
 *  advisory line whenever more than one person reads that copy. */
export function withGroupHint(
  hints: MailHint[] | null,
  picked: number,
  body: string,
  lang: Lang = getLang(),
) {
  if (!hints || picked < 2 || !/\{\{\s*contactName\s*\}\}/.test(body)) return hints
  return [
    ...hints,
    {
      id: 'group-name',
      tone: 'warn' as const,
      text: translate(
        message(
          'Thư nhóm chỉ điền được một tên',
          'A group letter can only fill in one name',
          '그룹 메일에는 이름을 하나만 채울 수 있습니다',
        ),
        lang,
      ),
      detail: translate(
        message(
          `Có ${picked} người trong To. Tên điền theo người đầu tiên.`,
          `There are ${picked} people in To. The name is filled from the first one.`,
          `To에 ${picked}명이 있습니다. 이름은 첫 번째 사람 기준으로 채워집니다.`,
        ),
        lang,
      ),
    },
  ]
}

/** One To pick as a cell draws it: the contact book gives the name, the
 *  server's verdict (once it answered for this list) gives the line under it. */
export type ToCell = {
  code: string
  name: string
  /** The address, or why this person gets nothing. */
  line: string
  /** Short reason drawn on the one-line chip, set only for a refused pick. */
  flag?: string
  ok: boolean
}

const BLOCK_COPY: Record<MasRecipientBlock, Message> = {
  SUPPRESSED: message('Đã chặn', 'Blocked', '차단됨'),
  NO_EMAIL: message('Thiếu email', 'Missing email', '이메일 없음'),
  DUPLICATE: message('Trùng địa chỉ', 'Duplicate address', '중복 주소'),
  UNDELIVERABLE: message(
    'Tên miền không nhận thư',
    'Domain does not accept mail',
    '메일을 받지 않는 도메인',
  ),
}

/** Web-side wording of the contract's block reasons, one per language. */
export const recipientBlockLabel = (block: MasRecipientBlock, lang: Lang = getLang()) =>
  translate(BLOCK_COPY[block], lang)

export function toCell(
  code: string,
  pool: ReadonlyMap<string, LetterContact>,
  verdict: MailGroupRecipient | undefined,
  checking: boolean,
  lang: Lang = getLang(),
): ToCell {
  const contact = pool.get(code)
  const name = contact?.name ?? verdict?.name ?? code
  const email = verdict?.email ?? contact?.email
  const block = verdict && !checking ? verdict.block : email ? undefined : 'NO_EMAIL'
  if (!block) return { code, name, line: email ?? '', ok: Boolean(verdict) && !checking }
  const why = recipientBlockLabel(block, lang).toLowerCase()
  /* The one block the person can clear by correcting the address, so say that. */
  const line = translate(
    block === 'UNDELIVERABLE'
      ? message(
          `${why} · kiểm tra lại địa chỉ email`,
          `${why} · check the email address`,
          `${why} · 이메일 주소를 다시 확인하세요`,
        )
      : message(`${why} · không nhận`, `${why} · will not receive`, `${why} · 수신 안 됨`),
    lang,
  )
  return { code, name, line, flag: why, ok: false }
}

/** The To: the contact the letter was opened from, else the lead's primary
 *  person, else its first with an address. */
export function seedTo(
  rows: readonly LetterContact[],
  leadCode: string,
  contactCode?: string | null,
): string[] {
  if (contactCode) return [contactCode]
  const home = rows.filter((row) => row.leadCode === leadCode)
  const first = home.find((row) => row.isPrimary) ?? home.find((row) => row.email) ?? home[0]
  return first ? [first.code] : []
}

/** Queued, never "sent": the run is filed and a worker posts it seconds later. */
export function queuedToast(
  state: MailGroupSendResponse['state'],
  at: string,
  lang: Lang = getLang(),
) {
  const m = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  if (state !== 'SCHEDULED') {
    return {
      title: m('Đã xếp hàng 1 email', '1 email queued', '이메일 1통을 대기열에 추가했습니다'),
      detail: m(
        'Email gửi đi sau vài chục giây.',
        'The email goes out in a few dozen seconds.',
        '이메일은 수십 초 후 발송됩니다.',
      ),
    }
  }
  const when = dmhm(new Date(at).toISOString())
  return {
    title: m('Đã đặt lịch 1 email', '1 email scheduled', '이메일 1통을 예약했습니다'),
    detail: m(
      `Thư đi lúc ${when}. Dừng được ở dòng hoạt động.`,
      `The letter goes out at ${when}. You can stop it from the activity line.`,
      `메일은 ${when}에 발송됩니다. 활동 기록에서 중단할 수 있습니다.`,
    ),
  }
}

export const sendLabel = (form: LetterForm, lang: Lang = getLang()) => {
  const later = form.timing === 'later' && form.at !== ''
  return translate(
    later
      ? message(
          `Hẹn gửi ${dmhm(form.at)}`,
          `Schedule for ${dmhm(form.at)}`,
          `${dmhm(form.at)} 예약 발송`,
        )
      : message('Gửi thư', 'Send letter', '메일 보내기'),
    lang,
  )
}

// ---------------------------------------------------------------------------
// One letter line on an activity timeline (G8)
// ---------------------------------------------------------------------------

export const LETTER_TONE: Record<
  MailLetterState,
  { badge: 'draft' | 'warning' | 'success' | 'running' | 'danger'; dot: StatusDotState }
> = {
  SCHEDULED: { badge: 'warning', dot: 'next' },
  SENDING: { badge: 'running', dot: 'warning' },
  SENT: { badge: 'success', dot: 'ok' },
  OPENED: { badge: 'success', dot: 'ok' },
  REPLIED: { badge: 'success', dot: 'ok' },
  BOUNCED: { badge: 'danger', dot: 'bad' },
  SUPPRESSED: { badge: 'danger', dot: 'bad' },
  CANCELLED: { badge: 'draft', dot: 'next' },
}

/** Names, not addresses, where the ledger has one — the address is the title. */
export const addresseeLine = (list: readonly { name?: string; email: string }[]) =>
  list.map((a) => a.name ?? a.email).join(', ')

// ---------------------------------------------------------------------------
// The sender choice — why the own mailbox cannot send, and what to press
// ---------------------------------------------------------------------------

export const CONNECT_GOOGLE = message(
  'Kết nối tài khoản Google',
  'Connect Google account',
  'Google 계정 연결',
)
export const RECONNECT_GOOGLE = message(
  'Kết nối lại tài khoản Google',
  'Reconnect Google account',
  'Google 계정 다시 연결',
)

/** The footer's reason and the row's button for an own mailbox the server
 *  will not send from. The last branch is a link the status read calls ready
 *  (or could not read) while the server does not — a token revoked mid-day:
 *  it still names an action, so Send is never shut with nothing to press. */
export function unreadySender(
  link: GoogleLinkStatus | undefined,
  lang: Lang = getLang(),
): {
  fault: string
  action: string
} {
  const m = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  const domain = COMPANY_MAIL_DOMAIN
  if (link && !link.connected) {
    return {
      fault: m(
        `Chưa kết nối tài khoản Google công ty (@${domain}) nên chưa gửi được từ hộp thư của bạn.`,
        `Your company Google account (@${domain}) is not connected, so mail cannot be sent from your mailbox yet.`,
        `회사 Google 계정(@${domain})이 연결되지 않아 내 메일함에서 아직 발송할 수 없습니다.`,
      ),
      action: translate(CONNECT_GOOGLE, lang),
    }
  }
  const email = link?.email ? ` (${link.email})` : ''
  const why =
    link?.mail === 'needs_consent'
      ? m(
          `Tài khoản Google đã kết nối${email} chưa cấp quyền gửi thư qua Gmail nên chưa gửi được từ hộp thư của bạn.`,
          `The connected Google account${email} has not granted permission to send mail through Gmail, so mail cannot be sent from your mailbox yet.`,
          `연결된 Google 계정${email}에 Gmail 발송 권한이 없어 내 메일함에서 아직 발송할 수 없습니다.`,
        )
      : link?.mail === 'wrong_domain'
        ? m(
            `Tài khoản Google đã kết nối${email} không phải tài khoản @${domain} nên chưa gửi được từ hộp thư của bạn.`,
            `The connected Google account${email} is not an @${domain} account, so mail cannot be sent from your mailbox yet.`,
            `연결된 Google 계정${email}은 @${domain} 계정이 아니어서 내 메일함에서 아직 발송할 수 없습니다.`,
          )
        : m(
            'Tài khoản Google đã kết nối chưa gửi được thư. Kết nối lại để gửi từ hộp thư của bạn.',
            'The connected Google account cannot send mail yet. Reconnect it to send from your mailbox.',
            '연결된 Google 계정으로 아직 메일을 발송할 수 없습니다. 다시 연결하면 내 메일함에서 보낼 수 있습니다.',
          )
  return { fault: why, action: translate(RECONNECT_GOOGLE, lang) }
}

export const allowanceSpent = (lang: Lang = getLang()) =>
  translate(
    message(
      `Hộp thư của bạn đã hết hạn mức gửi trong ${MAIL_PERSONAL_WINDOW_HOURS} giờ gần nhất.`,
      `Your mailbox has used up its sending limit for the last ${MAIL_PERSONAL_WINDOW_HOURS} hours.`,
      `최근 ${MAIL_PERSONAL_WINDOW_HOURS}시간 동안의 내 메일함 발송 한도를 모두 사용했습니다.`,
    ),
    lang,
  )

export const allowanceLeft = (remaining: number, lang: Lang = getLang()) =>
  translate(
    message(
      `Trong ${MAIL_PERSONAL_WINDOW_HOURS} giờ gần nhất còn gửi được tới ${remaining} địa chỉ (tính cả To và CC)`,
      `In the last ${MAIL_PERSONAL_WINDOW_HOURS} hours you can still send to ${remaining} addresses (To and CC combined)`,
      `최근 ${MAIL_PERSONAL_WINDOW_HOURS}시간 동안 ${remaining}개 주소까지 더 보낼 수 있습니다 (To와 CC 포함)`,
    ),
    lang,
  )

const LETTER_STATE_COPY: Record<MailLetterState, Message> = {
  SCHEDULED: message('Hẹn giờ', 'Scheduled', '예약됨'),
  SENDING: message('Đang gửi', 'Sending', '발송 중'),
  SENT: message('Đã gửi', 'Sent', '발송됨'),
  OPENED: message('Đã mở', 'Opened', '열람됨'),
  REPLIED: message('Đã trả lời', 'Replied', '답장됨'),
  BOUNCED: message('Bị trả lại', 'Bounced', '반송됨'),
  SUPPRESSED: message('Bị chặn', 'Blocked', '차단됨'),
  CANCELLED: message('Đã huỷ', 'Cancelled', '취소됨'),
}

/** Web-side wording of the contract's letter states, one per language. */
export const letterStateLabel = (state: MailLetterState, lang: Lang = getLang()) =>
  translate(LETTER_STATE_COPY[state], lang)
