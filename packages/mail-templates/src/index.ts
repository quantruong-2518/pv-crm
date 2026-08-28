import { createElement } from 'react'
import { render } from '@react-email/render'
import { LeadIntakeInternalEmail, type LeadIntakeInternalData } from './lead-intake-internal'
import { MasShellEmail, type MasShellData } from './mas-shell'
import { OpportunityLostEmail, type OpportunityLostData } from './opportunity-lost'
import { OpportunityOpenedEmail, type OpportunityOpenedData } from './opportunity-opened'
import { PasswordResetEmail, type PasswordResetData } from './password-reset'

export type { LeadIntakeInternalData, LeadIntakeInternalUtm } from './lead-intake-internal'
export type { MasShellData } from './mas-shell'
export type { OpportunityLostData } from './opportunity-lost'
export type { OpportunityOpenedData } from './opportunity-opened'
export type { PasswordResetData } from './password-reset'

/** Strips CRLF from a value before it goes into the Subject header.
 *
 *  `company`/`contactName` come from a public, unauthenticated landing-page
 *  form (see `apps/api/src/branches/sales/lead/lead-intake.guard.ts`). A
 *  newline inside a header value is how header injection forges extra
 *  headers (e.g. a second `Bcc:`) — stripping it here is the same defense a
 *  mail library would apply, just done before the string ever reaches one. */
function sanitizeSubjectPart(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

/** The one door out of this package: props in, a ready-to-send mail out.
 *
 *  `apps/api` cannot import React (eslint blocks it), so it never touches
 *  `LeadIntakeInternalEmail` directly — it calls this plain async function and
 *  gets back the three strings `MailMessage` actually wants. `html` and
 *  `text` are rendered from the SAME element so they can never drift apart. */
export async function renderLeadIntakeInternal(
  data: LeadIntakeInternalData,
): Promise<{ subject: string; html: string; text: string }> {
  const subject = `Lead landing page mới · ${sanitizeSubjectPart(data.company)} · ${sanitizeSubjectPart(data.contactName)}`
  const element = createElement(LeadIntakeInternalEmail, data)
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}

/** The one door out of this package for the MAS marketing shell — same shape
 *  as `renderLeadIntakeInternal`: props in, `{subject, html, text}` out,
 *  `html`/`text` rendered from the SAME element so they can never drift.
 *
 *  `subject` is sanitized the same way: it ends up in bulk sends built from
 *  campaign content, and a stray newline there is still a header-injection
 *  vector even though it isn't public-form input like the lead intake case. */
export async function renderMasShell(
  data: MasShellData,
): Promise<{ subject: string; html: string; text: string }> {
  const subject = sanitizeSubjectPart(data.subject)
  const element = createElement(MasShellEmail, data)
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}

/** Module 3 · hai mail của sổ cơ hội. Cùng hình với hai hàm trên — props vào,
 *  `{subject, html, text}` ra, và `html`/`text` dựng từ CÙNG một element nên
 *  không có đường nào cho hai bản lệch nhau.
 *
 *  Tiêu đề đi qua `sanitizeSubjectPart` như mọi tiêu đề khác. Ở đây tên khách
 *  KHÔNG tới từ form công khai — nó đọc từ `sales.lead` — nhưng chính cột đó
 *  nhận được dữ liệu từ cửa landing page, nên chuỗi vẫn là chuỗi người ngoài
 *  gõ, chỉ đi vòng một bảng. Lọc theo nguồn gốc chứ không theo đường đi. */
export async function renderOpportunityOpened(
  data: OpportunityOpenedData,
): Promise<{ subject: string; html: string; text: string }> {
  const subject = `Cơ hội mới · ${sanitizeSubjectPart(data.account)} · ${data.opCode}`
  const element = createElement(OpportunityOpenedEmail, data)
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}

export async function renderOpportunityLost(
  data: OpportunityLostData,
): Promise<{ subject: string; html: string; text: string }> {
  const subject = `Đơn thua · ${sanitizeSubjectPart(data.account)} · ${data.opCode}`
  const element = createElement(OpportunityLostEmail, data)
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}

/** The set-password letter — an invitation or a reset, same door as the four
 *  above: props in, `{subject, html, text}` out, both bodies rendered from the
 *  SAME element so the plain-text half cannot quietly stop matching the HTML.
 *
 *  ------------------------------------------------------------------
 *  THE SUBJECT CARRIES NO ACCOUNT DETAIL, ON PURPOSE
 *  ------------------------------------------------------------------
 *  Unlike the other four this subject interpolates nothing. Subjects are the
 *  one part of a mail that travels furthest from the mailbox: they surface on
 *  lock screens, in desktop toast notifications, in the `Subject:` line every
 *  relay in the chain writes to its own logs, and in the mail-client search
 *  index of whatever machine the mailbox is also open on. A subject naming the
 *  account would put "this address holds a PV One login" in all of them, which
 *  is precisely the fact `/auth/forgot-password` refuses to confirm over HTTP.
 *  The address belongs in the body, where the recipient already is.
 *
 *  `sanitizeSubjectPart` stays anyway, on a value it cannot currently change.
 *  It guards the ACT of building a subject in this file rather than today's
 *  particular string: the moment somebody interpolates a name here — and
 *  `platform.actor.name` is typed by a manager, not validated as a header — the
 *  CRLF strip has to already be in the path. A guard added back later is a
 *  guard that was missing in between. */
export async function renderPasswordReset(
  data: PasswordResetData,
): Promise<{ subject: string; html: string; text: string }> {
  const subject = sanitizeSubjectPart(
    data.purpose === 'invite' ? 'Tài khoản PV One của bạn đã được mở' : 'Đặt lại mật khẩu PV One',
  )
  const element = createElement(PasswordResetEmail, data)
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}
