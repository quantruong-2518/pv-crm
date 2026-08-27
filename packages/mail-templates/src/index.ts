import { createElement } from 'react'
import { render } from '@react-email/render'
import { LeadIntakeInternalEmail, type LeadIntakeInternalData } from './lead-intake-internal'

export type { LeadIntakeInternalData, LeadIntakeInternalUtm } from './lead-intake-internal'

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
