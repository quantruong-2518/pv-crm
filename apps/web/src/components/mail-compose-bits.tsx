import { useEffect, useRef, useState } from 'react'
import { CircleCheck, Info, ListChecks, Mail, TriangleAlert } from '@pv/ui'
import { Badge, GlassCard, Icon, SegmentedControl, Select, Skeleton, cn } from '@pv/ui'
import type { MasPreviewResponse } from '@pv/contracts'
import type { MailHint } from '@/data/mail-hints'

/** The two blocks every compose box in this app now shows under the letter:
 *  what could be better about it, and what it will actually look like. */

// ---------------------------------------------------------------------------
// The checklist
// ---------------------------------------------------------------------------

/** Advice, rendered as a list of short rows a person can work down.
 *
 *  ------------------------------------------------------------------
 *  IT NEVER GROWS AN "OK" STATE THAT COMPETES WITH THE SEND BUTTON
 *  ------------------------------------------------------------------
 *  An empty list draws one quiet line and nothing else. The temptation is a
 *  green "ready to send" panel, and it would be a lie of exactly the kind
 *  this checklist exists to avoid: these rules see spelling, not judgement. A
 *  letter can pass all of them and still be the wrong letter to send.
 *
 *  The count in the header is there so somebody who has scrolled past can tell
 *  whether anything is waiting, without the list having to stay open.
 *
 *  `null` — a letter not yet started — draws nothing at all. See `mailHints`
 *  for why that is a different answer from an empty array. */
export function MailHintList({ hints }: { hints: readonly MailHint[] | null }) {
  if (!hints) return null
  const warnings = hints.filter((hint) => hint.tone === 'warn').length

  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[12.5px] font-semibold">
          <Icon icon={ListChecks} size={16} />
          Nên xem lại trước khi gửi
        </span>
        {hints.length > 0 && (
          <Badge tone={warnings > 0 ? 'warning' : 'draft'}>{`${hints.length} mục`}</Badge>
        )}
      </div>

      {hints.length === 0 ? (
        <p className="text-muted-foreground m-0 flex items-center gap-2 text-[11.5px] leading-[1.5]">
          <Icon icon={CircleCheck} size={14} />
          Không có gì gợn. Đọc lại một lượt rồi gửi.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {hints.map((hint) => (
            <li key={hint.id} className="flex items-start gap-3 rounded-sm bg-white/5 px-3 py-2">
              <Icon
                icon={hint.tone === 'warn' ? TriangleAlert : Info}
                size={14}
                className={cn('mt-1 shrink-0', hint.tone === 'warn' && 'text-warning')}
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span
                  className={cn(
                    'text-[12px] font-semibold leading-[1.4]',
                    hint.tone === 'warn' && 'text-warning',
                  )}
                >
                  {hint.text}
                </span>
                {hint.detail && (
                  <span className="text-muted-foreground text-[11px] leading-[1.5]">
                    {hint.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------
// The preview
// ---------------------------------------------------------------------------

/** How wide the letter is drawn. A real choice, not a gimmick: the shell caps
 *  the card at 560px, so on a desktop the letter floats in a wide grey field
 *  while on a phone it fills the screen edge to edge — and most of these
 *  letters are opened on a phone. A preview that only ever shows one of the two
 *  hides the one people actually get. */
const PHONE_WIDTH = 390

/** Where the frame stops growing and starts scrolling. Tall enough to hold a
 *  normal first-touch letter whole; a letter that overflows it is telling the
 *  writer something the `body-long` hint also says. */
const FRAME_MAX = 560

export type MailPreviewCardProps = {
  letter?: MasPreviewResponse
  pending: boolean
  error: string
  /** Whose data filled the merge slots. Omitted when nothing is picked yet — the
   *  server then renders sample values and the caption says so. */
  recipients?: readonly { code: string; label: string }[]
  recipientCode?: string
  onRecipient?: (code: string) => void
}

export function MailPreviewCard({
  letter,
  pending,
  error,
  recipients,
  recipientCode,
  onRecipient,
}: MailPreviewCardProps) {
  const [view, setView] = useState<'html' | 'text'>('html')
  const [width, setWidth] = useState<'desktop' | 'phone'>('desktop')

  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[12.5px] font-semibold">
          <Icon icon={Mail} size={16} />
          Thư sẽ gửi đi
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {recipients && recipients.length > 1 && onRecipient && (
            <Select
              label="Xem trước theo lead"
              hideLabel
              size="sm"
              value={recipientCode ?? ''}
              onChange={onRecipient}
              options={recipients.map((item) => ({ value: item.code, label: item.label }))}
            />
          )}
          <SegmentedControl
            label="Kiểu hiển thị"
            hideLabel
            size="sm"
            value={view}
            onChange={(value) => setView(value as 'html' | 'text')}
            options={[
              { value: 'html', label: 'Thư' },
              { value: 'text', label: 'Chữ thuần' },
            ]}
          />
          {view === 'html' && (
            <SegmentedControl
              label="Bề ngang"
              hideLabel
              size="sm"
              value={width}
              onChange={(value) => setWidth(value as 'desktop' | 'phone')}
              options={[
                { value: 'desktop', label: 'Máy tính' },
                { value: 'phone', label: 'Điện thoại' },
              ]}
            />
          )}
        </div>
      </div>

      {/* THE SUBJECT SITS OUTSIDE THE FRAME, because it is outside the letter.
          It is the inbox row, not the page — and it is the half of a mass mail
          that decides whether the rest is ever read. Drawing it inside the
          rendered body would put it somewhere it never appears. */}
      <div className="flex min-w-0 flex-col gap-1 rounded-sm bg-white/5 px-3 py-2">
        <span className="text-muted-foreground text-[10.5px]">Tiêu đề trong hộp thư</span>
        <span className="truncate text-[12.5px] font-semibold">{letter?.subject || '—'}</span>
      </div>

      {error ? (
        <p className="text-warning m-0 rounded-sm bg-white/5 px-3 py-2 text-[11.5px] leading-[1.6]">
          <Icon icon={TriangleAlert} size={14} className="mr-2 inline align-middle" />
          {error}
        </p>
      ) : !letter ? (
        <Skeleton height={160} />
      ) : view === 'text' ? (
        /* The plain-text half, and the only place in the product it can be
           seen. Every letter carries one, a share of recipients read that one
           and not the HTML, and until this tab existed nobody had ever looked
           at it. */
        <pre className="text-glass-foreground m-0 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-sm bg-white/5 p-4 font-mono text-[11px] leading-[1.6]">
          {letter.text}
        </pre>
      ) : (
        <LetterFrame html={letter.html} width={width} stale={pending} />
      )}

      <p className="text-muted-foreground m-0 text-[11px] leading-[1.5]">
        {recipients && recipients.length > 0
          ? 'Đây là thư thật, dựng bằng đúng bộ khung máy chủ dùng khi gửi. Mỗi người nhận được thay tên riêng.'
          : 'Chưa chọn người nhận nên tên và công ty đang là dữ liệu mẫu. Bố cục thì đúng như thư gửi đi.'}
      </p>
    </GlassCard>
  )
}

/** The letter itself, in an iframe.
 *
 *  ------------------------------------------------------------------
 *  AN IFRAME AND NOT `dangerouslySetInnerHTML`, FOR TWO REASONS
 *  ------------------------------------------------------------------
 *   · Correctness. The letter is a table layout with its own inline styles and
 *     its own body background. Dropped into the app's DOM it would inherit
 *     Aurora's cascade and reset, and would render as something neither the
 *     app nor a mail client shows. The frame gives it its own document, which
 *     is what every mail client also gives it.
 *   · Containment. The body is text a person typed and the server rendered; it
 *     has no business reaching this page's DOM.
 *
 *  `sandbox` WITHOUT `allow-scripts` is what makes the measurement below safe.
 *  Scripts cannot run in the frame at all, so `allow-same-origin` grants a
 *  privilege to nothing — it exists only so this component may read
 *  `scrollHeight` and size the frame to the letter instead of guessing. Adding
 *  `allow-scripts` alongside it would undo the sandbox entirely; do not. */
function LetterFrame({
  html,
  width,
  stale,
}: {
  html: string
  width: 'desktop' | 'phone'
  stale: boolean
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(FRAME_MAX)

  useEffect(() => {
    const measure = () => {
      const doc = frame.current?.contentDocument
      if (!doc?.body) return
      setHeight(Math.min(doc.body.scrollHeight, FRAME_MAX))
    }
    /* Measured on load rather than on render: `srcDoc` is parsed
       asynchronously, so reading the height in this effect's own tick reads an
       empty document. Fonts landing later can grow it a little, and that is
       what the frame's own scrollbar is for. */
    const node = frame.current
    node?.addEventListener('load', measure)
    measure()
    return () => node?.removeEventListener('load', measure)
  }, [html, width])

  return (
    <div className={cn('motion-std overflow-hidden rounded-sm bg-white/5', stale && 'opacity-60')}>
      <iframe
        ref={frame}
        title="Bản xem trước thư"
        srcDoc={html}
        sandbox="allow-same-origin"
        className="block bg-transparent"
        style={{
          /* An iframe ships with a 2px inset border from the UA stylesheet.
             Removing it applies rule 4 rather than dodging it — it goes in `style`
             rather than a class because `border-0` is itself what
             `aurora/no-box-border` refuses, and the rule reads classes. */
          border: 'none',
          height,
          width: width === 'phone' ? PHONE_WIDTH : '100%',
          maxWidth: '100%',
          margin: width === 'phone' ? '0 auto' : undefined,
        }}
      />
    </div>
  )
}
