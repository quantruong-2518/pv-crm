import { Button, Check, Icon, RotateCcw, cn } from '@pv/ui'

/** The installment modal's footer: what the step is (or what went wrong) on
 *  the left, then the close button, and ONE primary chosen by the step. Acceptance leads
 *  while a condition holds it up and the reader may tick it, with the received-money
 *  button beside it; otherwise collecting leads. Undo shows to whoever recorded the
 *  payment. A button without its door is absent, not greyed out. */
export function InstallmentFooter({
  hint,
  failed,
  busy,
  canUndo,
  canPay,
  payBlocked,
  canTick,
  onClose,
  onUndo,
  onPay,
  onTick,
}: {
  hint: string
  failed: boolean
  busy: boolean
  canUndo: boolean
  canPay: boolean
  payBlocked: boolean
  canTick: boolean
  onClose: () => void
  onUndo: () => void
  onPay: () => void
  onTick: () => void
}) {
  const pay = (
    <Button
      size="lg"
      variant={canTick ? 'secondary' : 'default'}
      disabled={busy || payBlocked}
      onClick={onPay}
    >
      {!canTick && <Icon icon={Check} size={16} />}
      Đã nhận tiền
    </Button>
  )

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <span
        className={cn(
          'min-w-0 basis-full text-[12px] leading-[1.5] sm:flex-1 sm:basis-0',
          failed ? 'text-destructive-foreground' : 'text-muted-foreground',
        )}
        aria-live="polite"
      >
        {hint}
      </span>
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        <Button size="lg" variant="ghost" onClick={onClose}>
          Đóng
        </Button>
        {canUndo && (
          <Button size="lg" variant="secondary" onClick={onUndo}>
            <Icon icon={RotateCcw} size={16} />
            Hoàn tác đã thu
          </Button>
        )}
        {canPay && pay}
        {canTick && (
          <Button size="lg" disabled={busy} onClick={onTick}>
            <Icon icon={Check} size={16} />
            Đánh dấu xong
          </Button>
        )}
      </div>
    </div>
  )
}
