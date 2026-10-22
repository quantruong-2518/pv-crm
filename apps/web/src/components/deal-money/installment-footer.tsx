import { ArrowRight, Button, Check, Icon, cn } from '@pv/ui'

/** The installment modal's footer: what the step is (or what went wrong) on
 *  the left, then the close button, the way to the installment's own screen
 *  (where money is recorded) and ONE primary. Acceptance leads while a
 *  condition holds it up and the reader may tick it; otherwise the way in
 *  leads. A button without its door is absent, not greyed out. */
export function InstallmentFooter({
  hint,
  failed,
  busy,
  canTick,
  onClose,
  onOpen,
  onTick,
}: {
  hint: string
  failed: boolean
  busy: boolean
  canTick: boolean
  onClose: () => void
  onOpen: () => void
  onTick: () => void
}) {
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
        <Button size="lg" variant={canTick ? 'secondary' : 'default'} onClick={onOpen}>
          <Icon icon={ArrowRight} size={16} />
          Mở đợt
        </Button>
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
