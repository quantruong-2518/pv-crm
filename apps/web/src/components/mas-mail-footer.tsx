import { CalendarClock, Check, Send } from '@pv/ui'
import { Button, Icon } from '@pv/ui'

/** The strip under the mail panel: one sentence about what is missing, and the
 *  one button that moves. Split out of `mas-mail-modal.tsx` so the shell holds
 *  the walk between the steps and nothing about how the walk is painted. */

/** What the footer says when nothing is wrong — one fact per step. */
function footerNote(step: number, picked: number, sendable: number | null): string {
  if (step === 0) {
    return `${picked} người nhận · thư đi từ hộp thư chung của công ty, phiếu này không đổi được địa chỉ gửi.`
  }
  if (step === 1) return 'Xem bản bên phải trước khi sang bước sau.'
  return sendable === null ? 'Kiểm tra lại rồi gửi.' : `${sendable} người sẽ nhận thư này.`
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
  preflightDone,
  sendable,
  backBlocked,
  waves,
  timing,
  onBack,
  onNext,
  onCheck,
  onSend,
}: {
  /** The three sources of the one sentence, in the order they override each
   *  other: a failed send, then what this step is missing, then the plain fact
   *  about the step. Composed here so the shell states each of them once. */
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
  preflightDone: boolean
  sendable: number
  backBlocked: boolean
  /** How many runs the button is about to open. More than one = a chain. */
  waves: number
  timing: 'now' | 'later'
  onBack: () => void
  onNext: () => void
  onCheck: () => void
  onSend: () => void
}) {
  const message =
    failure || stepBlocker || footerNote(step, picked, preflightDone ? sendable : null)

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
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
        ) : preflightDone ? (
          <Button
            size="lg"
            type="button"
            disabled={sendBlocked || sendable === 0 || sending}
            onClick={onSend}
          >
            <Icon icon={timing === 'later' ? CalendarClock : Send} size={16} />
            {sending
              ? 'Đang tạo lượt gửi…'
              : waves > 1
                ? `Gửi ${waves} đợt`
                : `Gửi ${sendable} email`}
          </Button>
        ) : (
          <Button size="lg" type="button" disabled={sendBlocked || checking} onClick={onCheck}>
            <Icon icon={Check} size={16} />
            {checking ? 'Đang kiểm tra…' : 'Kiểm tra người nhận'}
          </Button>
        )}
      </div>
    </div>
  )
}
