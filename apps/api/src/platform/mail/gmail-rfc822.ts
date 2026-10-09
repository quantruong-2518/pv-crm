import { randomBytes } from 'node:crypto'

/** A group letter as RFC 822 text, for Gmail's `messages.send` — the one
 *  provider here that takes a finished message instead of fields.
 *
 *  Local on purpose: nothing in `apps/api/package.json` builds MIME, and this
 *  is one fixed shape (multipart/alternative, text + html, both base64).
 *  Pure — the date and the boundary come in — so the test pins every byte.
 *
 *  No Reply-To and no Message-ID: the answer must land in the sender's own
 *  inbox, and Gmail stamps the id it will thread on. */

export type Rfc822Letter = {
  from: string
  to: readonly string[]
  cc?: readonly string[]
  subject: string
  text: string
  html: string
  headers?: Record<string, string>
}

const CRLF = '\r\n'
/** RFC 2047 §2: an encoded-word is at most 75 characters, delimiters included. */
const WORD_PAYLOAD_BYTES = 45

export function buildRfc822(
  letter: Rfc822Letter,
  now: Date,
  boundary = `pv-${randomBytes(12).toString('hex')}`,
): string {
  const lines = [
    `From: ${mailbox(letter.from)}`,
    `To: ${letter.to.map(mailbox).join(`,${CRLF} `)}`,
    ...(letter.cc?.length ? [`Cc: ${letter.cc.map(mailbox).join(`,${CRLF} `)}`] : []),
    `Subject: ${phrase(letter.subject)}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    'MIME-Version: 1.0',
    ...Object.entries(letter.headers ?? {})
      /* A name outside the token grammar could itself smuggle a header in. */
      .filter(([name]) => /^[A-Za-z0-9-]+$/.test(name))
      .map(([name, value]) => `${name}: ${phrase(value)}`),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    part(boundary, 'text/plain', letter.text),
    part(boundary, 'text/html', letter.html),
    `--${boundary}--`,
    '',
  ]
  return lines.join(CRLF)
}

/** A header ends at the first newline; anything after one would become a
 *  header of its own. Same guard as `header()` in `mas.composer.ts`. */
function clean(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

/** Free text in a header: as is when printable ASCII, else RFC 2047 words. */
function phrase(value: string): string {
  const text = clean(value)
  if (/^[\x20-\x7e]*$/.test(text)) return text
  const words: string[] = []
  let chunk = ''
  /* Cut between characters, never inside one: each word must decode alone. */
  for (const char of text) {
    if (Buffer.byteLength(chunk + char, 'utf8') > WORD_PAYLOAD_BYTES) {
      words.push(chunk)
      chunk = ''
    }
    chunk += char
  }
  words.push(chunk)
  return words
    .map((word) => `=?UTF-8?B?${Buffer.from(word, 'utf8').toString('base64')}?=`)
    .join(`${CRLF} `)
}

/** Thrown, never repaired: dropping a bad address silently loses a recipient,
 *  and passing it on lets one entry become two. The message names no address. */
export class Rfc822AddressError extends Error {
  constructor() {
    super('A From/To/Cc entry is not exactly one mailbox.')
    this.name = 'Rfc822AddressError'
  }
}

/** Exactly one `local@domain` token — no list separators, no brackets. */
const ADDRESS = /^[^\s,;<>@]+@[^\s,;<>@]+$/

/** `Name <addr>` or a bare address. The address is never encoded. */
function mailbox(value: string): string {
  const text = clean(value)
  const match = /^([^<>]*)<([^<>]*)>$/.exec(text)
  const address = (match ? (match[2] ?? '') : text).trim()
  if (!ADDRESS.test(address)) throw new Rfc822AddressError()
  if (!match) return address
  const name = (match[1] ?? '').trim().replace(/^"(.*)"$/, '$1')
  if (name === '') return `<${address}>`
  const shown = /^[\x20-\x7e]*$/.test(name) ? `"${name.replace(/(["\\])/g, '\\$1')}"` : phrase(name)
  return `${shown} <${address}>`
}

function part(boundary: string, type: string, body: string): string {
  const encoded = Buffer.from(body, 'utf8').toString('base64')
  return [
    `--${boundary}`,
    `Content-Type: ${type}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    ...(encoded.match(/.{1,76}/g) ?? ['']),
  ].join(CRLF)
}
