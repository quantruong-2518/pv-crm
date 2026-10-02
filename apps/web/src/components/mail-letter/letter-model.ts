import {
  MAS_RECIPIENT_BLOCK_LABEL,
  type MailGroupPreflightResponse,
  type MailGroupRecipient,
  type MailGroupSendRequest,
  type MailGroupSendResponse,
  type MailLetterState,
  type MailTemplateRow,
} from '@pv/contracts'
import type { StatusDotState } from '@pv/ui'
import { isHttpUrl } from '@/data/http-url'
import type { MailHint } from '@/data/mail-hints'
import type { LetterContact } from '@/data/mail-letters'
import { dmhm } from '@/lib/date'

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
export function letterBlocker(form: LetterForm, picked: number, sendable?: number): string | null {
  if (picked === 0) return 'Chưa có ai trong To.'
  if (sendable === 0) return 'Chưa có ai trong To nhận được thư.'
  const gaps = [
    form.subject.trim() ? null : 'tiêu đề',
    form.body.trim() ? null : 'nội dung',
  ].filter((gap) => gap !== null)
  if (gaps.length > 0) return `Còn thiếu ${gaps.join(', ')}.`
  const ctaTouched = form.ctaLabel.trim() !== '' || form.ctaUrl.trim() !== ''
  if (ctaTouched && !letterCta(form)) {
    return 'Nút trong email cần đủ nhãn và địa chỉ bắt đầu bằng http/https.'
  }
  if (form.timing === 'later' && !(new Date(form.at) > new Date())) {
    return 'Giờ hẹn gửi phải sau lúc này.'
  }
  return null
}

/** The footer's plain sentence once nothing blocks. */
export function letterReadyNote(report: MailGroupPreflightResponse): string {
  const lost = report.blocked > 0 ? ` · ${report.blocked} người không nhận` : ''
  return `${report.sendable} người trong To sẽ nhận${lost} · một thư.`
}

/** A group letter fills `{{contactName}}` once, from the first To — worth one
 *  advisory line whenever more than one person reads that copy. */
export function withGroupHint(hints: MailHint[] | null, picked: number, body: string) {
  if (!hints || picked < 2 || !/\{\{\s*contactName\s*\}\}/.test(body)) return hints
  return [
    ...hints,
    {
      id: 'group-name',
      tone: 'warn' as const,
      text: 'Thư nhóm chỉ điền được một tên',
      detail: `Có ${picked} người trong To; tên người nhận lấy người đầu tiên.`,
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

export function toCell(
  code: string,
  pool: ReadonlyMap<string, LetterContact>,
  verdict: MailGroupRecipient | undefined,
  checking: boolean,
): ToCell {
  const contact = pool.get(code)
  const name = contact?.name ?? verdict?.name ?? code
  const email = verdict?.email ?? contact?.email
  const block = verdict && !checking ? verdict.block : email ? undefined : 'NO_EMAIL'
  if (!block) return { code, name, line: email ?? '', ok: Boolean(verdict) && !checking }
  const why = block === 'NO_EMAIL' ? 'thiếu email' : MAS_RECIPIENT_BLOCK_LABEL[block].toLowerCase()
  return { code, name, line: `${why} · không nhận`, flag: why, ok: false }
}

/** The default To: a deal letter's own primary contact (`OpportunityRow.primaryContact`),
 *  else the lead's primary person, else its first with an address. */
export function seedTo(
  rows: readonly LetterContact[],
  leadCode: string,
  dealPrimary?: string | null,
): string[] {
  if (dealPrimary) return [dealPrimary]
  const home = rows.filter((row) => row.leadCode === leadCode)
  const first = home.find((row) => row.isPrimary) ?? home.find((row) => row.email) ?? home[0]
  return first ? [first.code] : []
}

/** Queued, never "sent": the run is filed and a worker posts it seconds later. */
export function queuedToast(state: MailGroupSendResponse['state'], at: string) {
  return state === 'SCHEDULED'
    ? {
        title: 'Đã đặt lịch 1 email',
        detail: `Thư đi lúc ${dmhm(new Date(at).toISOString())} · Dừng được ngay tại dòng hoạt động.`,
      }
    : { title: 'Đã xếp hàng 1 email', detail: 'Email sẽ rời hệ thống sau vài chục giây.' }
}

export const sendLabel = (form: LetterForm) =>
  form.timing === 'later' && form.at !== '' ? `Hẹn gửi ${dmhm(form.at)}` : 'Gửi thư'

// ---------------------------------------------------------------------------
// One letter line on an activity timeline (G8)
// ---------------------------------------------------------------------------

export const LETTER_TONE: Record<
  MailLetterState,
  { badge: 'draft' | 'warning' | 'success' | 'running' | 'danger'; dot: StatusDotState }
> = {
  SCHEDULED: { badge: 'warning', dot: 'next' },
  SENDING: { badge: 'running', dot: 'current' },
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
