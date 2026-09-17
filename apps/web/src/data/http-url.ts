/** A web address the screen is willing to put behind an `href`.
 *
 *  The same question `MeetingLink` and `MailCta` ask on the wire, asked on the
 *  screen so the answer arrives while the field is still in focus instead of as
 *  a 400 after the whole form is filled in. Two doors had a private copy of
 *  this four-line function; a scheme check that says yes in one of them and no
 *  in the other is a bug nobody would think to look for. */
export function isHttpUrl(raw: string): boolean {
  try {
    return /^https?:$/.test(new URL(raw).protocol)
  } catch {
    return false
  }
}
