import type { ReactNode } from 'react'
import { Button, Icon, Modal, cn, type IconGlyph } from '@pv/ui'
import { userMessage, type ApiError } from '@/app/api'

/** The frame every small write dialog of the money screens shares: a title, the
 *  fields, and a footer that says what blocks the press, what the server
 *  refused, or that the write is under way — in that order of priority. */
export function FormModal({
  open,
  onClose,
  title,
  subtitle,
  line,
  error,
  busy,
  busyLabel,
  submitLabel,
  icon,
  ready,
  onSubmit,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  /** What the footer says while nothing is wrong: the blocker, or nothing. */
  line?: ReactNode
  error: ApiError | null
  busy: boolean
  busyLabel: string
  submitLabel: string
  icon: IconGlyph
  ready: boolean
  onSubmit: () => void
  children: ReactNode
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      className="sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[560px]"
      title={title}
      subtitle={subtitle}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className={cn(
              'min-w-0 flex-1 text-[11.5px] leading-[1.5]',
              error ? 'text-destructive-foreground' : 'text-muted-foreground',
            )}
            aria-live="polite"
          >
            {error ? userMessage(error) : busy ? busyLabel : line}
          </span>
          <div className="flex shrink-0 gap-3">
            <Button size="lg" variant="ghost" disabled={busy} onClick={onClose}>
              Quay lại
            </Button>
            <Button size="lg" disabled={!ready || busy} onClick={onSubmit}>
              <Icon icon={icon} size={16} />
              {submitLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">{children}</div>
    </Modal>
  )
}
