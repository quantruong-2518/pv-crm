import { useId, useRef } from 'react'
import { Button, Icon, Info, Plus, Textarea } from '@pv/ui'
import type { MailMergeKey } from '@pv/contracts'
import { MERGE_LABEL } from '@/data/mail-hints'

/** The letter's body box with its quick-insert row (G-Bulk · G-Compose).
 *
 *  Buttons rather than a sentence teaching `{{company}}`: a merge key typed by
 *  hand is the one the merge does not know, and it blanks in every letter. The
 *  keys are typed against `MailMergeKey`, so a key the contract drops stops
 *  compiling here instead of inserting a slot the server ignores. */
const QUICK_INSERT: readonly MailMergeKey[] = ['company', 'contactName']

export function BodyField({
  body,
  onBody,
  onOpenGuide,
}: {
  body: string
  onBody: (body: string) => void
  /** The campaign drawer's own `?`; the MAS modal floats its own instead. */
  onOpenGuide?: () => void
}) {
  const id = useId()
  const box = useRef<HTMLTextAreaElement>(null)
  /* Remembered on blur: pressing a button moves focus away, and a box never
     focused has no caret worth trusting — that case appends (fallback: end). */
  const caret = useRef<{ start: number; end: number } | null>(null)

  const insert = (key: MailMergeKey) => {
    const token = `{{${key}}}`
    const { start, end } = caret.current ?? { start: body.length, end: body.length }
    onBody(body.slice(0, start) + token + body.slice(end))
    const at = start + token.length
    caret.current = { start: at, end: at }
    requestAnimationFrame(() => {
      box.current?.focus()
      box.current?.setSelectionRange(at, at)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {/* The label row carries buttons, so it sits OUTSIDE any `<label>`: a
          button inside a label re-focuses the textarea on every click. */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-muted-foreground flex-1 text-[11px]">
          Nội dung
        </label>
        {onOpenGuide && (
          <Button
            size="sm"
            variant="ghost"
            type="button"
            className="pointer-coarse:h-12"
            onClick={onOpenGuide}
          >
            <Icon icon={Info} size={14} />
            Cách viết nội dung
          </Button>
        )}
        <span className="text-muted-foreground text-[11px]">Chèn nhanh</span>
        {QUICK_INSERT.map((key) => (
          <Button
            key={key}
            size="sm"
            variant="ghost"
            type="button"
            className="pointer-coarse:h-12"
            onClick={() => insert(key)}
          >
            <Icon icon={Plus} size={14} />
            {MERGE_LABEL[key]}
          </Button>
        ))}
      </div>
      <Textarea
        id={id}
        ref={box}
        value={body}
        onChange={(e) => onBody(e.target.value)}
        onBlur={(e) => {
          caret.current = { start: e.target.selectionStart, end: e.target.selectionEnd }
        }}
        rows={7}
        placeholder="Thân thư. **đậm**, _nghiêng_, đầu dòng `- ` thành danh sách. Bấm Chèn nhanh để điền tên từng người nhận."
      />
    </div>
  )
}
