import { mapMailText, parseMailBody, renderMasShell } from '@pv/mail-templates'

/** BUILDING THE BODY OF ONE MAS LETTER — the step both the worker and the
 *  preview run, so that neither can show the other's letter.
 *
 *  ==================================================================
 *  WHY THIS IS A FILE AND NOT A PRIVATE METHOD OF THE COMPOSER
 *  ==================================================================
 *  Two callers need the identical answer and they sit on opposite sides of the
 *  platform/branch line:
 *
 *   · `MasMailComposer` (platform, in the worker) — composes a letter that is
 *     about to leave the building, from a `mail_run` and a delivery's merge.
 *   · `MasService.preview` (Sales branch, in a request) — composes the letter
 *     somebody is looking at before they press send, from the text on screen
 *     and one lead's merge.
 *
 *  Before this file existed only the first path existed, and the panel drew its
 *  own approximation of the letter in the browser. That approximation agreed
 *  with the real letter on the words and on nothing else — a different shell, a
 *  fake button, no footer, no unsubscribe line. The person reviewing had read a
 *  paraphrase. A preview that renders through a SECOND implementation is
 *  exactly that failure with better styling: the two drift the first time
 *  either is edited, and the drift is invisible until a recipient sees it.
 *
 *  So the render is here, once, and the two callers differ only in where they
 *  got their inputs — which is the only thing they should differ in. */

/** `{{account}}`, `{{contact_name}}` (and two legacy aliases) — a key may carry
 *  spaces around its name.
 *
 *  Deliberately narrow: letters, digits and underscore. A pattern that accepted
 *  dots or brackets would be a small expression language, and an expression
 *  language in a mail body is a place for a sender to put things nobody
 *  reviewed. */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

export type MasLetterInput = {
  subject: string
  body: string
  cta?: { label: string; url: string }
  /** The booking link, still carrying its `{{…}}` slots. Escaped exactly like
   *  the CTA url below — it is the same grammar and the same danger. */
  bookingUrl?: string
  /** This recipient's substitution values. Keys absent here become the empty
   *  string and are reported back in `missing` — see `substitute`. */
  merge: Record<string, string>
  unsubscribeUrl: string
  sender: { name: string; address: string }
  assetBaseUrl: string
}

export type MasLetter = {
  subject: string
  html: string
  text: string
  /** Merge keys the letter names that this recipient had no value for. The
   *  worker logs them; the preview shows them. Neither guesses. */
  missing: string[]
}

export async function renderMasLetter(input: MasLetterInput): Promise<MasLetter> {
  const missing = new Set<string>()
  const fill = (value: string): string => substitute(value, input.merge, missing)

  /* The CTA URL is the one field where a merge value lands in a DIFFERENT
     grammar, so it gets a different escape: `?c={{company}}` with a company
     name that contains a space does not produce a link with a space in it, it
     produces a broken link. `encodeURIComponent` per value, never over the
     whole URL — encoding the template itself would eat the `?` and the `=`
     the author wrote. */
  const cta = input.cta
    ? {
        label: fill(input.cta.label),
        url: substitute(input.cta.url, input.merge, missing, encodeURIComponent),
      }
    : undefined

  /* PARSE FIRST, FILL SECOND — and that order is the security-relevant half of
     this line. `{{account}}` carries a lead's own company name, which is
     untrusted text this system did not write; filling it into the body BEFORE
     parsing would let a name holding `**` decide where the letter goes bold,
     and one starting with `- ` decide where a list begins. Parsing first means
     merge values land inside runs whose structure is already fixed, which is
     the same rule `substitute` states about never rescanning its own output. */
  const bookingUrl = input.bookingUrl
    ? substitute(input.bookingUrl, input.merge, missing, encodeURIComponent)
    : undefined

  const rendered = await renderMasShell({
    subject: fill(input.subject),
    blocks: mapMailText(parseMailBody(input.body), fill),
    cta,
    ...(bookingUrl ? { bookingUrl } : {}),
    unsubscribeUrl: input.unsubscribeUrl,
    sender: input.sender,
    assetBaseUrl: input.assetBaseUrl,
  })

  return { ...rendered, missing: [...missing] }
}

/** ONE PASS, LEFT TO RIGHT, AND NEVER OVER ITS OWN OUTPUT.
 *
 *  `String.replace` with a FUNCTION is what makes this safe, in two ways that
 *  a naive loop of `split`/`join` gets wrong:
 *
 *   · The replacement is not rescanned. A merge value that happens to contain
 *     `{{price}}` — a customer whose company name is written that way, a body
 *     pasted from another tool — stays literal instead of being substituted a
 *     second time from a key the sender never intended. Nested and adjacent
 *     braces (`{{{{a}}}}`) resolve to exactly one match each and cannot cascade.
 *   · `$&`, `$1` and `$'` in a value are inert. They are only special in the
 *     STRING form of `replace`; a function's return value is inserted verbatim.
 *     A value arriving from a lead's company name is untrusted text, and this
 *     is the difference between it being text and it being a pattern.
 *
 *  A missing key becomes the empty string rather than being left as `{{key}}`:
 *  a letter that goes out greeting the recipient as `{{contactName}}` in plain
 *  sight is worse than one whose greeting simply has a gap where a name should
 *  be. The caller collects the names and decides what to do about them.
 *
 *  `escape` is how the same substitution serves two grammars: prose takes the
 *  value as it is, a URL takes it percent-encoded. It escapes the VALUE only —
 *  the surrounding text is the author's and is never touched. */
function substitute(
  value: string,
  merge: Record<string, string>,
  missing: Set<string>,
  escape: (raw: string) => string = (raw) => raw,
): string {
  return value.replace(PLACEHOLDER, (_match, key: string) => {
    const found = merge[key]
    if (found === undefined) {
      missing.add(key)
      return ''
    }
    return escape(found)
  })
}

/** The footer's identity line, read off the run's own `From`.
 *
 *  `From` is stored the way a mail header spells it — `Display Name <box@host>`
 *  — so the display name and the mailbox are both already there, and neither
 *  of them is invented here.
 *
 *  KNOWN GAP, stated rather than filled: `MasShellData.sender.address` is meant
 *  to be the company's POSTAL address, which commercial mail is legally required
 *  to carry in its footer (CAN-SPAM §7704 and its equivalents elsewhere).
 *
 *  `PV_MAS_SENDER_POSTAL` is that address, and `PV_MAS_ENABLED=true` refuses to
 *  boot without it — so on any machine allowed to send a real batch, this is
 *  always the configured street. The mailbox fallback below is for the
 *  unconfigured case only: it keeps a preview renderable on a dev box, and it
 *  prints something true rather than a fabricated address. It is never what
 *  goes out in production, because production cannot start in that state. */
export function senderOf(fromAddress: string, postal: string): { name: string; address: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(fromAddress)
  const mailbox = match?.[2]?.trim()
  const street = postal.trim()
  if (!mailbox) {
    const bare = fromAddress.trim()
    return { name: bare, address: street || bare }
  }

  /* A quoted display name is how a header carries a comma or a dot — the
     quotes belong to the header grammar, not to the company's name. */
  const name = (match?.[1] ?? '').replace(/^"|"$/g, '').trim()
  return { name: name || mailbox, address: street || mailbox }
}
