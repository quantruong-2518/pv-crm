/** Phone and email shapes the assistant cuts for a person without `data.export`
 *  (owner, question 147). Platform holds them because the stored answers are cut
 *  again on every read, not only the tool results the Sales branch builds. */

/** One digit after at most three separators: "0912 - 345", "(028) 3822". */
const DIGIT = String.raw`(?:[\s.()-]{0,3}\d)`

/** 0 or +84, then 9 to 11 digits counting the 0. `0[1-9]` keeps a `000` group out;
 *  the guards skip a run inside a number, a dotted or spaced amount, and a dd-mm-yyyy.
 *  Group counts are capped so a long hostile run stays linear. */
const PHONE_SHAPE = new RegExp(
  String.raw`(?<!\d|(?<!\d)\d{1,3}(?:\.\d{3}){0,5}\.)` +
    String.raw`(?!(?<=(?<!\d)\d{1,3}\s)\d{3}(?:\s\d{3}){1,5}(?![\s.-]?\d))\(?` +
    String.raw`(?!0\d[\s.-][01]\d[\s.-](?:19|20)\d\d(?![.-]?\d))` +
    String.raw`(?:\+84${DIGIT}|0[1-9])${DIGIT}{7,9}(?!\d)`,
  'g',
)

/** The lookbehind starts it at a token's head, so a long run stays linear. */
const EMAIL_SHAPE = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu

const CONTACT_MASK = '[withheld]'

/** Company data with a phone's shape: a tax code is 10 digits from a 0. */
const NOT_MASKED: ReadonlySet<string> = new Set(['taxCode', 'website'])

/** Mail first, so `0912345678@x.vn` goes whole. A shape, not a proof: a number
 *  spelled out in words or without its 0 passes. */
export function maskContact(value: unknown): unknown {
  if (typeof value === 'string')
    return value.replace(EMAIL_SHAPE, CONTACT_MASK).replace(PHONE_SHAPE, CONTACT_MASK)
  if (Array.isArray(value)) return value.map(maskContact)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      NOT_MASKED.has(key) ? item : maskContact(item),
    ]),
  )
}
