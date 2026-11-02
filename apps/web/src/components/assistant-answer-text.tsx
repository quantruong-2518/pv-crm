import type { ReactNode } from 'react'
import { Chip } from '@pv/ui'
import type { AssistantRef } from '@pv/contracts'
import { useI18n } from '@/app/i18n'
import { refPath } from '@/data/assistant'
import { openLabel } from '@/data/assistant-copy'

/** The answer's plain text drawn for reading (ADR 0133), with no markdown library:
 *  blank lines split paragraphs, `- ` and `1. ` runs become lists, a code the answer
 *  names becomes a chip that opens it, the record's name is bold, and money, dates
 *  and percentages are tabular figures. Copy still takes the plain string.
 *
 *  `/16` at rest and `/24` on hover: the chip ink holds 4.8:1 on the AI wash in all
 *  three themes, where the kit chip's `/32` hover falls to 4.2:1 on stone (law 13). */

const CODE = String.raw`[A-Z]{2,4}-\d{3,}`
const UNIT = 'tỷ|triệu|đồng' // i18n-ignore: units a Vietnamese answer writes, matched, never shown
const FIGURE = String.raw`(?<![\d.,])\d{1,3}(?:[.,]\d{3})+(?:,\d+)?\s?(?:₫|đ|VND)(?!\p{L})|(?<![\d.,])\d+(?:\.\d{3})*(?:,\d+)?\s(?:${UNIT})(?!\p{L})|\d{1,2}\/\d{1,2}\/\d{4}|\d+(?:,\d+)?\s?%`
const BULLET = /^\s*[-•*]\s+/
const NUMBERED = /^\s*\d+[.)]\s+/

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A ref's label reads "account · title"; the account is the name worth bolding. */
const nameOf = (ref: AssistantRef) => ref.label.split(' · ')[0]?.trim() ?? ''

type Block = { kind: 'p' | 'ul' | 'ol'; lines: string[] }

function blocksOf(text: string): Block[] {
  const blocks: Block[] = []
  for (const raw of text.split('\n')) {
    const kind = BULLET.test(raw) ? 'ul' : NUMBERED.test(raw) ? 'ol' : raw.trim() ? 'p' : null
    const open = blocks.at(-1)
    if (!kind) {
      if (open) blocks.push({ kind: 'p', lines: [] })
      continue
    }
    const line = raw.replace(kind === 'ul' ? BULLET : kind === 'ol' ? NUMBERED : /^/, '')
    if (open?.kind === kind) open.lines.push(line)
    else blocks.push({ kind, lines: [line] })
  }
  return blocks.filter((b) => b.lines.length > 0)
}

export function AssistantAnswerText({
  text,
  refs,
  openPath,
}: {
  text: string
  refs: readonly AssistantRef[]
  openPath: (path: string) => void
}) {
  const { lang } = useI18n()
  const byCode = new Map(refs.map((ref) => [ref.code, ref]))
  const names = [...new Set(refs.map(nameOf).filter((name) => name.length >= 3))]
  /* Longest first, so a longer code or name is never cut by a shorter one. */
  const alt = (list: string[]) =>
    list
      .sort((a, b) => b.length - a.length)
      .map(escape)
      .join('|')
  const parts = [
    String.raw`\*\*(?<strong>[^*\n]+)\*\*`,
    String.raw`(?<![\w-])(?<code>${[alt([...byCode.keys()]), CODE].filter(Boolean).join('|')})(?![\w-])`,
    names.length ? `(?<name>${alt(names)})` : '',
    `(?<figure>${FIGURE})`,
  ].filter(Boolean)
  const pattern = new RegExp(parts.join('|'), 'gu')

  const inline = (line: string, at: string): ReactNode[] => {
    const out: ReactNode[] = []
    let last = 0
    for (const match of line.matchAll(pattern)) {
      const start = match.index
      if (start > last) out.push(line.slice(last, start))
      const key = `${at}-${start}`
      const g = match.groups ?? {}
      const ref = g.code ? byCode.get(g.code) : undefined
      if (ref) {
        out.push(
          <Chip
            key={key}
            variant="source"
            aria-label={openLabel(ref.code, lang)}
            className="bg-primary/16 hover:bg-primary/24 pointer-coarse:h-auto! px-2 py-0 align-baseline text-[12px] font-semibold"
            onOpen={() => openPath(refPath(ref))}
          >
            {ref.code}
          </Chip>,
        )
      } else if (g.code) {
        out.push(
          <span key={key} className="text-foreground font-mono text-[12px] font-semibold">
            {g.code}
          </span>,
        )
      } else {
        out.push(
          <strong
            key={key}
            className={g.figure ? 'tnum text-on-tint-primary font-semibold' : 'font-semibold'}
          >
            {g.strong ?? g.name ?? g.figure}
          </strong>,
        )
      }
      last = start + match[0].length
    }
    if (last < line.length) out.push(line.slice(last))
    return out
  }

  return (
    <div className="text-foreground flex flex-col gap-3 text-[13.5px] leading-[1.6]">
      {blocksOf(text).map((block, b) => {
        if (block.kind === 'p') {
          return (
            <p key={b} className="m-0 whitespace-pre-line">
              {block.lines.flatMap((line, i) => [
                ...(i ? ['\n'] : []),
                ...inline(line, `${b}-${i}`),
              ])}
            </p>
          )
        }
        const List = block.kind
        /* Chips pad their touch area 12px up and down, so lines part wider on touch. */
        return (
          <List
            key={b}
            className={`marker:text-on-tint-primary-muted pointer-coarse:gap-6 m-0 flex flex-col gap-2 pl-5 ${List === 'ul' ? 'list-disc' : 'list-decimal'}`}
          >
            {block.lines.map((line, i) => (
              <li key={i} className="pl-1">
                {inline(line, `${b}-${i}`)}
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}
