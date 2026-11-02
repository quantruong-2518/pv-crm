import type { ReactNode } from 'react'
import { CalendarClock, RefreshCw, Send } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import { message, useI18n, type Message } from '@/app/i18n'
import { sendLabel } from '@/data/mas-mail-draft'

/** The strip under the mail panel: one sentence about what is missing, and the
 *  one button that moves. Split out of `mas-mail-modal.tsx` so the shell holds
 *  the walk between the steps and nothing about how the walk is painted. */

/** What the footer says when nothing is wrong — one fact per step. */
function footerNote(step: number, picked: number, sendable: number | null): Message {
  if (step === 0) {
    return message(
      `${picked} người nhận · thư đi từ noreply. Khách trả lời được ghi vào hồ sơ và báo người giữ.`,
      `${picked} ${picked === 1 ? 'recipient' : 'recipients'} · emails go out from noreply. Customer replies are logged on the record and sent to its owner.`,
      `수신자 ${picked}명 · 메일은 noreply 주소로 발송됩니다. 고객 답장은 기록에 남고 담당자에게 알려집니다.`,
    )
  }
  return sendable === null
    ? message('Đang kiểm tra người nhận…', 'Checking recipients…', '수신자를 확인하는 중…')
    : message(
        `${sendable} người sẽ nhận. Xem bản bên phải trước khi gửi.`,
        `${sendable} will receive it. Check the preview on the right before sending.`,
        `${sendable}명이 수신합니다. 보내기 전에 오른쪽 미리보기를 확인하세요.`,
      )
}

export function MailFooter({
  failure,
  stepBlocker,
  picked,
  step,
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
  /** 0 = recipients, 1 = the letter; Send lives on the second. */
  step: number
  sendBlocked: boolean
  checking: boolean
  sending: boolean
  /** How many will receive it, per the server's answer for THIS list — `null`
   *  while there is no such answer, which is what keeps Send shut (G2). */
  verdict: number | null
  backBlocked: boolean
  /** How many runs the button is about to open — the ones still to go. */
  waves: number
  timing: 'now' | 'later'
  /** Floats above the strip's right edge — the hints and `?` stack. */
  aids?: ReactNode
  onBack: () => void
  onNext: () => void
  /** Set only when the automatic check failed: the one case a person has to
   *  ask again, because the list did not change and so nothing re-asks. */
  onRetryCheck?: () => void
  /** Opens the confirm box — the send itself happens there. */
  onSend: () => void
}) {
  const { t } = useI18n()
  const note = failure || stepBlocker || t(footerNote(step, picked, verdict))

  return (
    <div className="relative flex min-w-0 flex-wrap items-center justify-between gap-4">
      {aids && <div className="absolute bottom-full right-0 mb-8">{aids}</div>}
      <span
        aria-live="polite"
        className={
          failure
            ? 'text-destructive-foreground min-w-0 max-w-[560px] text-[11.5px] leading-[1.5]'
            : stepBlocker
              ? 'text-warning min-w-0 max-w-[560px] text-[11.5px] leading-[1.5]'
              : 'text-muted-foreground min-w-0 max-w-[560px] text-[11.5px] leading-[1.5]'
        }
      >
        {note}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="lg" variant="ghost" type="button" disabled={backBlocked} onClick={onBack}>
          {step === 0
            ? t(message('Huỷ', 'Cancel', '취소'))
            : t(message('Quay lại', 'Back', '이전'))}
        </Button>
        {step === 0 ? (
          <Button size="lg" type="button" disabled={Boolean(stepBlocker)} onClick={onNext}>
            {t(message('Tiếp: Nội dung', 'Next: Content', '다음: 내용'))}
          </Button>
        ) : onRetryCheck ? (
          <Button size="lg" type="button" onClick={onRetryCheck}>
            <Icon icon={RefreshCw} size={16} />
            {t(message('Kiểm tra lại người nhận', 'Check recipients again', '수신자 다시 확인'))}
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
              ? t(message('Đang tạo lượt gửi…', 'Creating the send…', '발송을 만드는 중…'))
              : verdict === null
                ? checking
                  ? t(message('Đang kiểm tra…', 'Checking…', '확인 중…'))
                  : t(message('Gửi thư', 'Send email', '메일 보내기'))
                : sendLabel(timing === 'later', verdict * waves)}
          </Button>
        )}
      </div>
    </div>
  )
}
