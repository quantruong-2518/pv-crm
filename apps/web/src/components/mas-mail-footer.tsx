import type { ReactNode } from 'react'
import { CalendarClock, RefreshCw, Send } from '@pv/ui'
import { Button, Icon } from '@pv/ui'

/** The strip under the mail panel: one sentence about what is missing, and the
 *  one button that moves. Split out of `mas-mail-modal.tsx` so the shell holds
 *  the walk between the steps and nothing about how the walk is painted. */

/** What the footer says when nothing is wrong — one fact per step. */
function footerNote(step: number, picked: number, sendable: number | null): string {
  if (step === 0) {
    return `${picked} người nhận · thư đi từ noreply; khách bấm Trả lời thì máy ghi nhận và báo người giữ.`
  }
  if (step === 1) return 'Xem bản bên phải trước khi sang bước sau.'
  return sendable === null ? 'Đang kiểm tra người nhận…' : `${sendable} người sẽ nhận thư này.`
}

export function MailFooter({
  failure,
  stepBlocker,
  picked,
  step,
  last,
  nextLabel,
  sendBlocked,
  checking,
  sending,
  verdict,
  backBlocked,
  waves,
  timing,
  aids,
  onBack,
  onNext,
  onRetryCheck,
  onSend,
}: {
  /** The three sources of the one sentence, in the order they override each
   *  other: a failed send or check, then what this step is missing, then the
   *  plain fact about the step. Composed here so the shell states each once. */
  failure: string
  stepBlocker: string | null
  picked: number
  step: number
  /** The step list stays in the shell, so its shape arrives as two facts rather
   *  than as a second import of the same array. */
  last: boolean
  nextLabel: string
  sendBlocked: boolean
  checking: boolean
  sending: boolean
  /** How many will receive it, per the server's answer for THIS list — `null`
   *  while there is no such answer, which is what keeps Send shut (G2). */
  verdict: number | null
  backBlocked: boolean
  /** How many runs the button is about to open. More than one = a chain. */
  waves: number
  timing: 'now' | 'later'
  /** Floats above the strip's right edge — the hints and `?` stack. */
  aids?: ReactNode
  onBack: () => void
  onNext: () => void
  /** Set only when the automatic check failed: the one case a person has to
   *  ask again, because the list did not change and so nothing re-asks. */
  onRetryCheck?: () => void
  onSend: () => void
}) {
  const message = failure || stepBlocker || footerNote(step, picked, verdict)

  return (
    <div className="relative flex min-w-0 flex-wrap items-center justify-between gap-4">
      {aids && <div className="absolute bottom-full right-0 mb-8">{aids}</div>}
      <span
        aria-live="polite"
        className={
          failure || stepBlocker
            ? 'text-warning min-w-0 max-w-[560px] text-[11.5px] leading-[1.5]'
            : 'text-muted-foreground min-w-0 max-w-[560px] text-[11.5px] leading-[1.5]'
        }
      >
        {message}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="lg" variant="ghost" type="button" disabled={backBlocked} onClick={onBack}>
          {step === 0 ? 'Huỷ' : 'Quay lại'}
        </Button>
        {!last ? (
          <Button size="lg" type="button" disabled={Boolean(stepBlocker)} onClick={onNext}>
            Tiếp: {nextLabel}
          </Button>
        ) : onRetryCheck ? (
          <Button size="lg" type="button" onClick={onRetryCheck}>
            <Icon icon={RefreshCw} size={16} />
            Kiểm tra lại người nhận
          </Button>
        ) : (
          <Button
            size="lg"
            type="button"
            disabled={sendBlocked || verdict === null || verdict === 0 || sending}
            onClick={onSend}
          >
            <Icon icon={timing === 'later' ? CalendarClock : Send} size={16} />
            {sending
              ? 'Đang tạo lượt gửi…'
              : verdict === null
                ? checking
                  ? 'Đang kiểm tra…'
                  : 'Gửi email'
                : waves > 1
                  ? `Gửi ${waves} đợt`
                  : `Gửi ${verdict} email`}
          </Button>
        )}
      </div>
    </div>
  )
}
