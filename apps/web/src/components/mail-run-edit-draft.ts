import type { MailRunDetail, MailRunEdit } from '@pv/contracts'
import { emptyComposerState, type ComposerState } from '@/components/mail-sequence/wave-draft'
import { localInput } from '@/lib/date'

/** THE BATCH AS A FORM, AND THE FORM BACK AS A PATCH.
 *
 *  The run editor reuses `WaveComposer`, so a batch read off the server has to
 *  become a `ComposerState` on the way in and a `MailRunEdit` on the way out.
 *  Both directions live here rather than in the panel because the outward one
 *  is the only place in the web app where "absent" and `null` mean different
 *  things, and that distinction is worth reading on its own. */

export function composerFromRun(run: MailRunDetail): ComposerState {
  return {
    ...emptyComposerState(),
    ...(run.templateCode ? { templateCode: run.templateCode } : {}),
    label: run.label,
    subject: run.subject,
    body: run.body,
    ctaLabel: run.cta?.label ?? '',
    ctaUrl: run.cta?.url ?? '',
    bookingUrl: run.bookingUrl ?? '',
    timing: run.scheduledAt ? 'later' : 'now',
    at: run.scheduledAt ? localInput(run.scheduledAt) : '',
  }
}

/** The control only expresses minutes, so a batch held at 09:10:30 must not
 *  read as changed the moment the form shows 09:10. */
const sameMinute = (a: string, b: string) =>
  Math.floor(Date.parse(a) / 60_000) === Math.floor(Date.parse(b) / 60_000)

/** WHAT ACTUALLY CHANGED, in the three states `MailRunEdit` tells apart:
 *  absent = leave it · `null` = take it away · a value = write it.
 *
 *  Every field is compared against the batch AS IT WAS READ, and one nobody
 *  touched never appears in the body. Not for tidiness: two people fixing two
 *  different fields of the same batch would otherwise overwrite each other,
 *  and the schema is `.strict()` — a key carrying `undefined` is a claim about
 *  intent that was never made.
 *
 *  `{}` is a legitimate answer and means there is nothing to save; the panel
 *  keeps its button off rather than posting a body the `.refine` would reject. */
export function mailRunEditFrom(run: MailRunDetail, form: ComposerState): MailRunEdit {
  const edit: MailRunEdit = {}

  const label = form.label.trim()
  if (label !== run.label) edit.label = label

  const subject = form.subject.trim()
  if (subject !== run.subject) edit.subject = subject

  const body = form.body.trim()
  if (body !== run.body) edit.body = body

  /* One object, not two fields: a half-filled pair is not a button, so an
     incomplete CTA reads as "no button" and clearing either half removes the
     whole thing. */
  const ctaLabel = form.ctaLabel.trim()
  const ctaUrl = form.ctaUrl.trim()
  const cta = ctaLabel !== '' && ctaUrl !== '' ? { label: ctaLabel, url: ctaUrl } : null
  if (cta?.label !== run.cta?.label || cta?.url !== run.cta?.url) edit.cta = cta

  const bookingUrl = form.bookingUrl.trim()
  if (bookingUrl !== (run.bookingUrl ?? '')) edit.bookingUrl = bookingUrl === '' ? null : bookingUrl

  /* `null` is "drop the hold, go out on the next sweep" — exactly what the
     person picked by moving the switch back to sending now. */
  const at = form.timing === 'later' && form.at !== '' ? new Date(form.at).toISOString() : null
  const was = run.scheduledAt ?? null
  const sameAt = at === null ? was === null : was !== null && sameMinute(at, was)
  if (!sameAt) edit.scheduledAt = at

  return edit
}
