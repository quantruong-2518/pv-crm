import { useState } from 'react'
import type { JSONContent } from '@tiptap/react'
import { MAIL_MERGE_KEYS, type MailMergeKey } from '@pv/contracts'
import { parseMailBody, type MailRun } from '@pv/mail-templates/markup'

/** MARKDOWN <-> EDITOR DOC for the mail body, and the viewer's editor choice.
 *
 *  The reader IS the server's `parseMailBody` (`@pv/mail-templates/markup`), so
 *  the editor opens a body exactly as the send worker will read it. The writer
 *  only ever emits what that reader parses back to the same doc: bold and
 *  italic never nest, and an italic run that touches a letter is written plain
 *  because `_` inside a word is punctuation to the server. */

export const MERGE_NODE = 'mergeKey'

export const isMergeKey = (key: string): key is MailMergeKey =>
  (MAIL_MERGE_KEYS as readonly string[]).includes(key)

/** Known keys only: an unknown `{{x}}` stays text so the compose warning still sees it. */
export const MERGE_PATTERN = `\\{\\{(${MAIL_MERGE_KEYS.join('|')})\\}\\}`

type Style = MailRun['kind']
type Run = { style: Style; text: string }

const WORD = /[\p{L}\p{N}]/u
const isWord = (char: string | undefined) => char !== undefined && WORD.test(char)

// ---------------------------------------------------------------------------
// Reader — markdown to doc
// ---------------------------------------------------------------------------

export function markdownToDoc(body: string): JSONContent {
  const content = parseMailBody(body).map((block): JSONContent =>
    block.kind === 'paragraph'
      ? paragraph(block.lines)
      : {
          type: 'bulletList',
          content: block.items.map((item) => ({ type: 'listItem', content: [paragraph([item])] })),
        },
  )
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] }
}

function paragraph(lines: MailRun[][]): JSONContent {
  const content: JSONContent[] = []
  lines.forEach((runs, index) => {
    if (index > 0) content.push({ type: 'hardBreak' })
    for (const run of runs) content.push(...inlineNodes({ style: run.kind, text: run.text }))
  })
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' }
}

/** A run's text split around known `{{key}}`s; the chip carries the run's mark. */
function inlineNodes({ style, text }: Run): JSONContent[] {
  const marks = style === 'text' ? {} : { marks: [{ type: style }] }
  const nodes: JSONContent[] = []
  let from = 0
  for (const match of text.matchAll(new RegExp(MERGE_PATTERN, 'g'))) {
    if (match.index > from)
      nodes.push({ type: 'text', text: text.slice(from, match.index), ...marks })
    nodes.push({ type: MERGE_NODE, attrs: { key: match[1] }, ...marks })
    from = match.index + match[0].length
  }
  if (from < text.length) nodes.push({ type: 'text', text: text.slice(from), ...marks })
  return nodes
}

// ---------------------------------------------------------------------------
// Writer — doc to markdown
// ---------------------------------------------------------------------------

export function docToMarkdown(doc: JSONContent): string {
  const blocks: string[] = []
  for (const block of doc.content ?? []) {
    if (block.type === 'bulletList') {
      /* A hard break inside a bullet cannot survive: the next line would read as
         prose and end the list. It becomes a space instead. */
      const items = (block.content ?? [])
        .map((item) =>
          (item.content ?? [])
            .flatMap((p) => lineTexts(p.content))
            .join(' ')
            .trim(),
        )
        .filter((item) => item !== '')
      if (items.length > 0) blocks.push(items.map((item) => `- ${item}`).join('\n'))
      continue
    }
    const text = lineTexts(block.content).join('\n').trim()
    if (text !== '') blocks.push(text)
  }
  return blocks.join('\n\n')
}

/** One markdown line per hard break, each written from runs of one style. */
function lineTexts(nodes: JSONContent[] | undefined): string[] {
  const out: Run[][] = [[]]
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      out.push([])
      continue
    }
    const text = node.type === MERGE_NODE ? `{{${String(node.attrs?.['key'])}}}` : (node.text ?? '')
    const marks = new Set(node.marks?.map((mark) => mark.type))
    const style: Style = marks.has('bold') ? 'bold' : marks.has('italic') ? 'italic' : 'text'
    const line = out[out.length - 1] ?? []
    const last = line[line.length - 1]
    if (last?.style === style) last.text += text
    else line.push({ style, text })
  }
  return out.map((runs) => writeLine(runs).trim())
}

/** Spaces at a run's edge go outside the markers, so `** x**` is never written. */
function writeLine(runs: Run[]): string {
  let out = ''
  runs.forEach((run, index) => {
    const core = run.text.trim()
    if (run.style === 'text' || core === '') {
      out += run.text
      return
    }
    const lead = run.text.slice(0, run.text.indexOf(core))
    const trail = run.text.slice(lead.length + core.length)
    const next = runs[index + 1]
    const after = trail !== '' ? trail : next?.style === 'text' ? next.text : ''
    const marker = run.style === 'bold' ? '**' : '_'
    const italicFits = !isWord((out + lead).slice(-1)) && !isWord(after[0])
    out +=
      run.style === 'bold' || italicFits ? `${lead}${marker}${core}${marker}${trail}` : run.text
  })
  return out
}

// ---------------------------------------------------------------------------
// Which editor this viewer last chose
// ---------------------------------------------------------------------------

export type MailBodyMode = 'markdown' | 'rich'

const MODE_KEY = 'pv-mail-body-mode'

/** The rich editor is the default; markdown stays one tap away for whoever prefers it. */
export function useMailBodyMode(): [MailBodyMode, (mode: MailBodyMode) => void] {
  const [mode, setMode] = useState<MailBodyMode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'markdown' ? 'markdown' : 'rich'
    } catch {
      return 'rich'
    }
  })
  const choose = (next: MailBodyMode) => {
    setMode(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      // Blocked storage: the choice still holds for this visit.
    }
  }
  return [mode, choose]
}
