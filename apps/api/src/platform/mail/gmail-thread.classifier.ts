/** WHAT ONE MESSAGE OF A GMAIL THREAD IS, from its headers alone.
 *
 *  Pure, and kept apart from the sweeper because a wrong branch here is silent
 *  either way: `reply` on a bounce tells sales a customer answered, `bounce`
 *  on a reply suppresses a working mailbox. The order below is the rule —
 *  ours first, then machines, and a person is whatever is left.
 *
 *  Header names arrive lower-cased (`GoogleGmail` does it); values are read
 *  case-insensitively. No body exists at this layer and none is asked for. */

export type ThreadHeaders = Readonly<Record<string, string | undefined>>

export type ThreadMessageKind =
  | { kind: 'own' }
  | { kind: 'auto' }
  | { kind: 'bounce'; hard: boolean; failed: string[] }
  | { kind: 'reply'; from: string }

/** A DSN that says "still trying" — the mailbox may yet receive the letter. */
const DELAY = /delay|warning|temporar/i
/** Mail we sent through Gmail is bounced by Gmail's own MTA, so only Google's
 *  daemon may name a dead address: anyone can type `mailer-daemon@` in a From,
 *  and a forged one would otherwise suppress the letter's other recipients. */
const GOOGLE_DAEMONS = new Set(['mailer-daemon@googlemail.com', 'mailer-daemon@google.com'])
const BULK = new Set(['bulk', 'junk', 'auto_reply'])

export function classifyThreadMessage(
  headers: ThreadHeaders,
  senderAddress: string,
  companyDomain: string,
): ThreadMessageKind {
  const from = addressOf(headers['from'])
  /* A colleague's reply-all is our side talking: filed as a reply it would end
     the watch before the customer answers. Exact domain, never a substring. */
  const ours = from.slice(from.lastIndexOf('@') + 1) === companyDomain.toLowerCase()
  if (headers['x-pv-delivery'] !== undefined || from === addressOf(senderAddress) || ours) {
    return { kind: 'own' }
  }

  if (GOOGLE_DAEMONS.has(from)) {
    const failed = (headers['x-failed-recipients'] ?? '')
      .split(',')
      .map(addressOf)
      .filter((address) => address.includes('@'))
    /* Google's daemon is never a person: with nobody named it is noise, not a reply. */
    if (failed.length === 0) return { kind: 'auto' }
    return { kind: 'bounce', hard: !DELAY.test(headers['subject'] ?? ''), failed }
  }

  const auto = headers['auto-submitted']?.trim().toLowerCase()
  if (
    (auto !== undefined && auto !== '' && auto !== 'no') ||
    BULK.has(headers['precedence']?.trim().toLowerCase() ?? '') ||
    headers['x-autoreply'] !== undefined
  ) {
    return { kind: 'auto' }
  }

  /* No readable sender is not a person we can name: never file it as a reply. */
  return from.includes('@') ? { kind: 'reply', from } : { kind: 'auto' }
}

/** The bare mailbox of a `From`-style value, in the ledger's normal form:
 *  `"Name" <A@b.com>` and ` a@B.com ` both give `a@b.com`. */
export function addressOf(value: string | undefined): string {
  const text = (value ?? '').trim()
  const angled = /<([^<>]*)>\s*$/.exec(text)
  return (angled?.[1] ?? text).trim().toLowerCase()
}
