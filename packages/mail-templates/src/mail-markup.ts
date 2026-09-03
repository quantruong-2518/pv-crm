/** THE ONLY MARKUP A MASS-MAIL BODY UNDERSTANDS: bold, italic, bullet list.
 *
 *  Three constructs and no more, deliberately. Every construct added here is
 *  one that has to survive Outlook AND be explainable to somebody who does not
 *  write code. Headings, tables, images and inline links stay out — a link
 *  belongs in the CTA button, which is the one place this system can promise is
 *  clickable (`mail-hints.ts` tells the writer exactly that).
 *
 *  ------------------------------------------------------------------
 *  WHY THIS PARSES INTO DATA AND NEVER INTO AN HTML STRING
 *  ------------------------------------------------------------------
 *  The letter is assembled by React Email, so the renderer turns these blocks
 *  into React elements whose text arrives as CHILDREN — and React escapes
 *  children. A body full of angle brackets therefore reaches the recipient as
 *  angle brackets, and no string a salesperson types, or that merge
 *  substitution pastes in from a lead's own record, can become markup. There is
 *  no HTML string anywhere on this path, which is why the package needs no
 *  sanitizer: there is nothing to sanitise.
 *
 *  ------------------------------------------------------------------
 *  WHY IT RUNS BEFORE MERGE SUBSTITUTION, NOT AFTER
 *  ------------------------------------------------------------------
 *  `mas-letter.ts` parses first and fills `{{key}}` afterwards, into the text of
 *  the runs below. So a company name that happens to contain `**` cannot turn
 *  the rest of a letter bold, and one that starts with `- ` cannot become a
 *  bullet. It is the same rule `substitute` already states for its own output:
 *  what was filled in is never read back as syntax. */

export type MailRun =
  { kind: 'text'; text: string } | { kind: 'bold'; text: string } | { kind: 'italic'; text: string }

/** A paragraph keeps the line breaks the writer typed; a list keeps its items.
 *  Both are arrays of rich lines, which is what lets the renderer and the merge
 *  walk treat the two the same way. */
export type MailBlock =
  { kind: 'paragraph'; lines: MailRun[][] } | { kind: 'list'; items: MailRun[][] }

const BOLD = '**'
const ITALIC = '_'

/** `-` is what a person types. `•` is what lands in the box when that same
 *  person pastes a bulleted list out of Word, which is the case this whole
 *  format exists to serve. */
const BULLETS = new Set(['-', '•'])

/** Letters and digits, Unicode-aware so Vietnamese diacritics count as part of
 *  a word. No `g` flag: a stateless regex has no `lastIndex` to leak between
 *  calls, and this one is tested against a single character at a time. */
const WORD = /[\p{L}\p{N}]/u

export function parseMailBody(body: string): MailBlock[] {
  const blocks: MailBlock[] = []
  let lines: MailRun[][] = []
  let items: MailRun[][] = []

  const closeParagraph = () => {
    if (lines.length > 0) blocks.push({ kind: 'paragraph', lines })
    lines = []
  }
  const closeList = () => {
    if (items.length > 0) blocks.push({ kind: 'list', items })
    items = []
  }

  for (const raw of body.split('\n')) {
    const line = raw.trim()

    /* A blank line ends the block — the rule the compose box shows the writer,
       and the reason `mailBody` in `@pv/contracts` refuses to run the body
       through `textNhap`: collapsing whitespace would turn every paragraph
       break in every mass mail into a space. */
    if (line === '') {
      closeList()
      closeParagraph()
      continue
    }

    const item = bulletText(line)
    if (item !== null) {
      closeParagraph()
      items.push(parseInline(item))
      continue
    }

    closeList()
    lines.push(parseInline(line))
  }

  closeList()
  closeParagraph()
  return blocks
}

/** The text of a bullet line, or `null` when the line is ordinary prose.
 *
 *  The space after the marker is required, and that is the whole guard: without
 *  it a line opening on a hyphenated word or a negative number would silently
 *  become a bullet. */
function bulletText(line: string): string | null {
  const marker = line[0]
  if (marker === undefined || !BULLETS.has(marker)) return null

  const rest = line.slice(1)
  if (!rest.startsWith(' ')) return null

  const text = rest.trim()
  return text === '' ? null : text
}

/** ONE PASS, LEFT TO RIGHT, AND EVERY BRANCH MOVES `i` FORWARD.
 *
 *  Written as a scan and not as a regex for two reasons that both bite on a
 *  server: a pattern of the `\*\*(.+?)\*\*` shape backtracks on a line of
 *  unmatched asterisks, and this runs once per recipient inside the send
 *  worker — a body is capped at 20k characters and a batch at 200 people, so a
 *  quadratic parse is a queue that stops moving. A scan also makes it plain to
 *  read that no input can hang it: every branch below advances.
 *
 *  Bold and italic do not nest. Emphasising one phrase twice is not something
 *  sales letters do, and flat runs are what keep `mapMailText` a one-liner. */
export function parseInline(line: string): MailRun[] {
  const runs: MailRun[] = []
  let plain = ''
  let i = 0

  /* Once the rest of the line holds no further delimiter, no later position can
     close one either — so stop looking rather than rescanning to the end of the
     line at every remaining character. This is what keeps the pass linear on
     the pathological input (a line of nothing but delimiters). */
  let boldAhead = true
  let italicAhead = true

  const flush = () => {
    if (plain !== '') runs.push({ kind: 'text', text: plain })
    plain = ''
  }

  while (i < line.length) {
    if (boldAhead && line.startsWith(BOLD, i)) {
      const close = line.indexOf(BOLD, i + BOLD.length)
      if (close === -1) boldAhead = false
      else if (close > i + BOLD.length) {
        flush()
        runs.push({ kind: 'bold', text: line.slice(i + BOLD.length, close) })
        i = close + BOLD.length
        continue
      }
      /* Unclosed, or `****` with nothing inside: the delimiter is just text.
         Advancing by its full width is what stops an empty pair from being
         read again as an opener on the next turn of the loop. */
      plain += BOLD
      i += BOLD.length
      continue
    }

    if (italicAhead && line[i] === ITALIC && opensItalic(line, i)) {
      const close = closesItalic(line, i + 1)
      if (close === -1) italicAhead = false
      else {
        flush()
        runs.push({ kind: 'italic', text: line.slice(i + 1, close) })
        i = close + 1
        continue
      }
    }

    plain += line[i]
    i += 1
  }

  flush()
  return runs
}

/** An underscore inside a word is punctuation, not emphasis: `bao_gia.pdf` and
 *  `PV_MAS_ENABLED` both turn up in these letters and neither is an attempt to
 *  italicise anything. Same rule at both ends — see `closesItalic`. */
function opensItalic(line: string, at: number): boolean {
  const after = line[at + 1]
  if (after === undefined || after === ' ') return false

  const before = line[at - 1]
  return before === undefined || !WORD.test(before)
}

function closesItalic(line: string, from: number): number {
  for (let k = from; k < line.length; k += 1) {
    if (line[k] !== ITALIC) continue
    if (k === from) continue // `__` — nothing between the pair to emphasise
    if (line[k - 1] === ' ') continue // a dangling opener, not a closer

    const after = line[k + 1]
    if (after !== undefined && WORD.test(after)) continue
    return k
  }
  return -1
}

/** Rewrite every piece of text in place — how `mas-letter.ts` fills `{{key}}`
 *  without the parser ever reading back what was filled in. */
export function mapMailText(
  blocks: readonly MailBlock[],
  map: (text: string) => string,
): MailBlock[] {
  const mapLine = (runs: readonly MailRun[]): MailRun[] =>
    runs.map((run): MailRun => ({ ...run, text: map(run.text) }))

  return blocks.map((block) =>
    block.kind === 'list'
      ? { kind: 'list', items: block.items.map(mapLine) }
      : { kind: 'paragraph', lines: block.lines.map(mapLine) },
  )
}

/** The one line a mail client shows beside the subject in the inbox list. Only
 *  the first block is worth reading there — the rest is never displayed. */
export function mailBlocksPreview(blocks: readonly MailBlock[]): string {
  const first = blocks[0]
  if (first === undefined) return ''

  const lines = first.kind === 'list' ? first.items : first.lines
  return lines
    .map((runs) => runs.map((run) => run.text).join(''))
    .join(' ')
    .trim()
}
