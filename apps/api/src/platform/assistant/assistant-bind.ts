import { ContractCode, CURRENCIES, ObjectCode } from '@pv/contracts'

/** Values are bound, not checked after (ADR 0133 D3): text streams to the screen, so
 *  the model writes ids and the server writes the values.
 *
 *  In a result the model reads, each value under `trusted`, the `hidden` count, the
 *  call's `rows` and each trusted list's `count` become `{ value, cite: '⟦v12⟧' }`:
 *  the model still sees the value to reason with, and cites the id to state it. Ids
 *  hold for one turn, and only for a result that reached the model. `⟦` and `⟧` in
 *  data turn into plain brackets first, so a label cannot carry an id.
 *
 *  On the way out an id becomes its value in Vietnamese form, an unknown or broken id
 *  becomes nothing, and a figure or code the model typed goes through `shown`. Only
 *  the last word of the stream is held back: no id, figure or code spans a space. */

/** What the person reads where the model typed a figure or code nothing vouches for. */
export const UNSURE = '[chưa rõ]'

/* By key, because a JSON value carries no unit: these are the trusted halves' money
   and percent fields, and a money value prints in its own record's currency. */
const MONEY: ReadonlySet<string> = new Set([
  'amount',
  'budget',
  'collectedAmount',
  'refundedAmount',
])
const PERCENT: ReadonlySet<string> = new Set(['probability', 'share'])

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const MOMENT = /^\d{4}-\d{2}-\d{2}T/
/* `\p{N}`, as the summary's gate: a fullwidth or superscript digit is still a figure. */
const DIGIT = /\p{N}/u
const FIGURE = /\p{N}+(?:[.,:/]\p{N}+)*/gu
const CODE = /(?<![\p{L}\p{N}])(?:[A-Z]{1,3}|HĐ)-\p{N}+(?![\p{L}\p{N}])/gu
/* In this order: a whole id, anything else opened with `⟦`, a stray `⟧`, a code, a figure. */
const TOKEN = new RegExp(`⟦v\\p{Nd}{1,6}⟧|⟦[^⟦⟧\\s]*⟧?|⟧|${CODE.source}|${FIGURE.source}`, 'gu')
const SPACE = /\s/u
/* A token that opens with a letter is the code alternative: figures open with a digit. */
const LETTER = /^\p{L}/u

const VN_DAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const PLAIN_NUMBER = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })
const CASH = new Map<string, Intl.NumberFormat>(
  CURRENCIES.map(({ code }) => [
    code,
    new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: code === 'VND' ? 0 : 2,
    }),
  ]),
)

type Bound = { text: string; code: string | null }
type Cited = { value: string | number; cite: string }

/** A result as the model will read it; its ids fill only once `keep` takes it. */
export type Draft = { output: object; values: ReadonlyMap<string, Bound> }

const isCode = (value: unknown): value is string =>
  ObjectCode.safeParse(value).success || ContractCode.safeParse(value).success

const plain = (text: string): string => text.replaceAll('⟦', '[').replaceAll('⟧', ']')

/** A money value with no known currency prints bare: a wrong ₫ would be 26,400 times off. */
function printed(key: string, value: string | number, currency: string | null): string {
  if (typeof value === 'string') {
    const day = DAY.exec(value)
    if (day) return `${day[3]}/${day[2]}/${day[1]}`
    const at = MOMENT.test(value) ? new Date(value) : null
    return at && !Number.isNaN(at.getTime()) ? VN_DAY.format(at) : value
  }
  if (PERCENT.has(key)) return `${PLAIN_NUMBER.format(value)}%`
  const cash = MONEY.has(key) && currency ? CASH.get(currency) : undefined
  return (cash ?? PLAIN_NUMBER).format(value)
}

const lastSpace = (text: string): number => {
  let at = text.length - 1
  while (at >= 0 && !SPACE.test(text[at] as string)) at -= 1
  return at
}

/** One turn's ids, and the filter its answer streams through. */
export class TurnBinding {
  private next = 1
  private held = ''
  private readonly values = new Map<string, Bound>()
  private readonly codes: Set<string>
  private readonly figures: ReadonlySet<string>

  /** Only what the person wrote, and the code of the record the chat is about, may
   *  be echoed (ADR 0136 §5). The context line's clock and screen are not: a figure
   *  from them would pass as vouched, so the model names today in words. */
  constructor(question: string, subjectCode: string | null) {
    this.figures = new Set(question.match(FIGURE))
    this.codes = new Set([...(question.match(CODE) ?? []), ...(subjectCode ? [subjectCode] : [])])
  }

  draft(output: object, rowCount: number | null): Draft {
    const values = new Map<string, Bound>()
    const cite = (key: string, value: string | number, currency: string | null): Cited => {
      const id = `⟦v${this.next++}⟧`
      values.set(id, { text: printed(key, value, currency), code: isCode(value) ? value : null })
      return { value, cite: id }
    }
    const walk = (
      value: unknown,
      key: string,
      trusted: boolean,
      currency: string | null,
    ): unknown => {
      if (typeof value === 'string') {
        const text = plain(value)
        return trusted && DIGIT.test(text) ? cite(key, text, currency) : text
      }
      if (typeof value === 'number' && (trusted || key === 'hidden')) {
        return cite(key, value, currency)
      }
      if (Array.isArray(value)) {
        const items: unknown[] = value.map((item) => walk(item, key, trusted, currency))
        return trusted ? { count: cite('count', value.length, null), items } : items
      }
      if (typeof value !== 'object' || value === null) return value
      const own = (value as { currency?: unknown }).currency
      const money = typeof own === 'string' ? own : currency
      const entries = Object.entries(value).map(([k, item]): [string, unknown] => [
        k,
        walk(item, k, trusted || k === 'trusted', money),
      ])
      return Object.fromEntries(entries)
    }
    const rows = rowCount === null ? {} : { rows: cite('rows', rowCount, null) }
    return { output: { ...rows, ...(walk(output, '', false, null) as object) }, values }
  }

  keep(draft: Draft): void {
    for (const [id, bound] of draft.values) {
      this.values.set(id, bound)
      if (bound.code) this.codes.add(bound.code)
    }
  }

  /** What may be shown now; the last word waits, since it may still grow. */
  push(delta: string): string {
    const space = lastSpace(delta)
    if (space < 0) {
      this.held += delta
      return ''
    }
    const ready = this.held + delta.slice(0, space + 1)
    this.held = delta.slice(space + 1)
    return this.shown(ready)
  }

  /** The held word, at the end of a round: an id still open by then is broken. */
  flush(): string {
    const rest = this.held
    this.held = ''
    return this.shown(rest)
  }

  /* The person's own figures may be echoed, so the answer can name the month asked
     about; a typed code passes only when it is a record read this turn or one the person
     named, since equal codes are the same record. A figure that merely equals a bound
     value does not pass: a 3 the model made up would ride on any count of 3. */
  private shown(text: string): string {
    return text.replace(TOKEN, (token) => {
      if (token.startsWith('⟦') || token === '⟧') return this.values.get(token)?.text ?? ''
      if (LETTER.test(token)) return this.codes.has(token) ? token : UNSURE
      return this.figures.has(token) ? token : UNSURE
    })
  }
}
