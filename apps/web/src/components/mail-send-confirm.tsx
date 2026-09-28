import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CalendarClock, ChevronDown, Send } from '@pv/ui'
import { Button, Icon, Modal, cn } from '@pv/ui'

/** What replaced the old delivery step in both mail panels (send and edit):
 *  the rarely-touched choices folded under the letter, and one look at the
 *  numbers once the button is pressed.
 *
 *  The step existed to hold three controls almost nobody changes and a review
 *  table; walking past it on every send taught people to click through it. A
 *  closed block keeps the defaults in reach, and the confirm box asks only
 *  when the mail is about to leave — the one moment the count matters. */

/** Closed on every mount; the host forces it open when it would hide an error,
 *  since a locked Send with its reason folded away reads as a broken button.
 *  Forcing latches it open: folding again as the error clears would yank the
 *  field being typed into out from under the cursor. */
export function SendOptions({
  forceOpen,
  summary,
  children,
}: {
  forceOpen: boolean
  /** The current values in one line, so a closed block still says what it holds. */
  summary: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(forceOpen)
  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])
  return (
    <section className="bg-surface-ink/5 flex min-w-0 flex-col rounded-md">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="motion-std hover:bg-surface-ink/9 flex min-h-12 w-full min-w-0 items-center gap-3 rounded-md px-4 text-left"
      >
        <span className="shrink-0 text-[13px] font-semibold leading-5">Tuỳ chọn gửi</span>
        {!open && (
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-[12px] leading-4">
            {summary}
          </span>
        )}
        <Icon
          icon={ChevronDown}
          size={16}
          className={cn('text-muted-foreground motion-std ml-auto shrink-0', open && 'rotate-180')}
        />
      </button>
      {open && <div className="flex min-w-0 flex-col gap-4 px-4 pb-4 pt-2">{children}</div>}
    </section>
  )
}

export type ConfirmRow = { label: string; value: string }

/** The last look, on top of the panel rather than instead of it: the back
 *  button drops onto the letter exactly as it was left. Confirming closes the
 *  box first, so a refusal lands in the panel's footer, where the letter is. */
export function MailSendConfirm({
  open,
  title,
  subtitle,
  rows,
  action,
  later,
  onBack,
  onConfirm,
}: {
  open: boolean
  title: string
  subtitle: string
  rows: readonly ConfirmRow[]
  /** The primary button's words — it names the count, not just the verb. */
  action: string
  later: boolean
  onBack: () => void
  onConfirm: () => void
}) {
  /* The Modal keeps drawing this footer through its exit animation, so a
     double-click would reach `onConfirm` twice — and each is a real send. */
  const fired = useRef(false)
  useEffect(() => {
    if (open) fired.current = false
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onBack}
      className="sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[560px]"
      title={title}
      subtitle={subtitle}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button size="lg" variant="ghost" type="button" onClick={onBack}>
            Quay lại
          </Button>
          <Button
            size="lg"
            type="button"
            onClick={() => {
              if (fired.current) return
              fired.current = true
              onBack()
              onConfirm()
            }}
          >
            <Icon icon={later ? CalendarClock : Send} size={16} />
            {action}
          </Button>
        </div>
      }
    >
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((row) => (
          <li
            key={row.label}
            className="bg-surface-ink/5 flex min-w-0 items-center gap-3 rounded-sm px-3 py-2"
          >
            <span className="text-muted-foreground w-28 shrink-0 text-[12px]">{row.label}</span>
            <span className="tnum min-w-0 flex-1 text-[13px] leading-5">{row.value}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
