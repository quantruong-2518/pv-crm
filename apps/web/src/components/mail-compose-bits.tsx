import { Fragment, useEffect, useRef, useState } from 'react'
import { Info, Mail, TriangleAlert } from '@pv/ui'
import { Button, GlassCard, Icon, Select, Separator, Skeleton, cn } from '@pv/ui'
import type { MasPreviewResponse } from '@pv/contracts'
import type { MailHint } from '@/data/mail-hints'

/** What every compose box in this app shows beside the letter: what could be
 *  better about it (the floating corner stack), and what it will actually look
 *  like. */

// ---------------------------------------------------------------------------
// The checklist
// ---------------------------------------------------------------------------

/** The corner stack of every compose panel (G-Bulk): the guide `?`, and a
 *  count of hints that opens their list. `null` hints (nothing written yet)
 *  and `[]` both draw no count — there is nothing to approve.
 *
 *  Floating rather than a block in the column so advice never pushes the letter
 *  down; still advice only — nothing here touches the send button. Square
 *  corners per law 5 — `rounded-full` is reserved for status dots, avatars
 *  and the FAB, and these are neither. */
export function MailFloatingAids({
  hints,
  onGuide,
}: {
  hints: readonly MailHint[] | null
  onGuide: () => void
}) {
  const [open, setOpen] = useState(false)
  const count = hints?.length ?? 0
  const shown = open && count > 0

  return (
    <div className="flex flex-col items-end gap-2">
      {shown && (
        <div
          role="dialog"
          aria-label="Nên xem lại trước khi gửi"
          className="glass-overlay flex w-[360px] max-w-[calc(100vw-48px)] flex-col gap-2 rounded-lg p-4"
        >
          <span className="text-[13px] font-semibold leading-5">
            Nên xem lại · không chặn nút Gửi
          </span>
          <ul className="m-0 flex max-h-[360px] list-none flex-col gap-2 overflow-y-auto p-0">
            {hints?.map((hint) => (
              <li
                key={hint.id}
                className="bg-surface-ink/5 flex flex-col gap-1 rounded-md px-3 py-2"
              >
                <span
                  className={cn(
                    'text-[12px] font-semibold leading-4',
                    hint.tone === 'warn' && 'text-warning',
                  )}
                >
                  {hint.text}
                </span>
                {hint.detail && (
                  <span className="text-muted-foreground text-[12px] leading-4">{hint.detail}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        aria-label="Hướng dẫn gửi email"
        onClick={onGuide}
        className="glass-overlay text-muted-foreground motion-std hover:text-foreground flex size-12 items-center justify-center rounded-md"
      >
        <Icon icon={Info} size={16} />
      </button>
      {count > 0 && (
        <button
          type="button"
          aria-label={`${count} điều nên xem lại`}
          aria-expanded={shown}
          onClick={() => setOpen((value) => !value)}
          className="glass-overlay text-on-tint-warning tnum flex size-12 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--warning)_20%,var(--popover))] text-[15px] font-semibold"
        >
          {count}
        </button>
      )}
    </div>
  )
}

/** Calendly is retired (decision 2): an old run or template keeps its link as
 *  history until somebody clears it here — there is no field to type a new one,
 *  and the preview no longer draws that button, so the card names the link. */
export function OldBookingLink({
  owner,
  url,
  dropped,
  onDrop,
}: {
  /** Whose link it is, as the sentence names it. */
  owner: 'Thư' | 'Mẫu'
  url: string
  dropped: boolean
  onDrop: (drop: boolean) => void
}) {
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-wrap items-center gap-3 p-4">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[12.5px] font-semibold">
          {dropped ? 'Link đặt lịch cũ sẽ bị bỏ khi lưu' : `${owner} còn link đặt lịch cũ`}
        </span>
        <span className="text-muted-foreground truncate font-mono text-[11px]" title={url}>
          {url}
        </span>
      </span>
      <Button
        size="sm"
        variant="secondary"
        type="button"
        className="pointer-coarse:h-12"
        onClick={() => onDrop(!dropped)}
      >
        {dropped ? 'Giữ lại' : 'Bỏ link đặt lịch cũ'}
      </Button>
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------
// The preview
// ---------------------------------------------------------------------------

/** Where the frame stops growing and starts scrolling. Tall enough to hold a
 *  normal first-touch letter whole; a letter that overflows it is telling the
 *  writer something the `body-long` hint also says. */
const FRAME_MAX = 560

/** One line of the envelope above the letter: sender, recipient, reply-to. */
export type MailEnvelopeLine = { label: string; value: string }

export type MailPreviewCardProps = {
  letter?: MasPreviewResponse
  pending: boolean
  error: string
  /** Whose data filled the merge slots. Omitted when nothing is picked yet — the
   *  server then renders sample values and the caption says so. */
  recipients?: readonly { code: string; label: string }[]
  recipientCode?: string
  onRecipient?: (code: string) => void
  /** The header lines of the letter, drawn above its subject. Absent for a door
   *  that has no recipient to name (the template book). */
  envelope?: readonly MailEnvelopeLine[]
  /** Replaces the line under the frame. The run editor needs it: its audience
   *  was frozen into `email_delivery` when the batch opened, so the default
   *  sentence about nobody being picked yet would be false there. */
  caption?: string
}

/** The letter AS THE RECIPIENT SEES IT — one view, no toolbar. The format and
 *  width switches were dropped with the G-Bulk board: a preview offering four
 *  renderings answers a question the sender never asked. */
export function MailPreviewCard({
  letter,
  pending,
  error,
  recipients,
  recipientCode,
  onRecipient,
  envelope,
  caption,
}: MailPreviewCardProps) {
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold leading-5">
          <Icon icon={Mail} size={16} />
          Thư sẽ gửi đi
        </span>
        {recipients && recipients.length > 1 && onRecipient && (
          <Select
            label="Xem trước theo người nhận"
            hideLabel
            size="sm"
            value={recipientCode ?? ''}
            onChange={onRecipient}
            options={recipients.map((item) => ({ value: item.code, label: item.label }))}
          />
        )}
      </div>

      {/* THE SUBJECT SITS OUTSIDE THE FRAME, under the envelope: it is the inbox
          row, not the page, and drawing it inside the body would put it where
          it never appears. */}
      <div className="bg-surface-ink/5 flex min-w-0 flex-col gap-3 rounded-sm p-4">
        {envelope && envelope.length > 0 && (
          <>
            <dl className="m-0 grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] leading-5">
              {envelope.map((line) => (
                <Fragment key={line.label}>
                  <dt className="text-muted-foreground">{line.label}</dt>
                  <dd className="m-0 min-w-0 truncate">{line.value}</dd>
                </Fragment>
              ))}
            </dl>
            <Separator />
          </>
        )}
        <span className="truncate text-[15px] font-semibold leading-6">
          {letter?.subject || '—'}
        </span>
      </div>

      {error ? (
        <p className="text-warning bg-surface-ink/5 m-0 rounded-sm px-3 py-2 text-[11.5px] leading-[1.6]">
          <Icon icon={TriangleAlert} size={14} className="mr-2 inline align-middle" />
          {error}
        </p>
      ) : !letter ? (
        <Skeleton height={160} />
      ) : (
        <LetterFrame html={letter.html} stale={pending} />
      )}

      <p className="text-muted-foreground m-0 text-[11px] leading-[1.5]">
        {caption ??
          (recipients && recipients.length > 0
            ? 'Đây là thư thật, dựng bằng đúng bộ khung máy chủ dùng khi gửi. Mỗi người nhận được thay tên riêng.'
            : 'Chưa chọn người nhận nên tên và công ty đang là dữ liệu mẫu. Bố cục thì đúng như thư gửi đi.')}
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
function LetterFrame({ html, stale }: { html: string; stale: boolean }) {
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
  }, [html])

  return (
    <div
      className={cn(
        'motion-std bg-surface-ink/5 overflow-hidden rounded-sm',
        stale && 'opacity-60',
      )}
    >
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
          width: '100%',
        }}
      />
    </div>
  )
}
