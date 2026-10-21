import { Button, Icon, X, cn, type IconGlyph } from '@pv/ui'
import { userMessage, type ApiError } from '@/app/api'

/** One live sentence on the left (the server's
 *  refusal wins), cancel and confirm on the right. Shared by the park, hold
 *  and account-lock drawers. */
export function StepFooter({
  error,
  pending,
  hint,
  onClose,
  confirm,
}: {
  error: ApiError | null
  pending: boolean
  hint: string
  onClose: () => void
  confirm: { icon: IconGlyph; label: string; disabled: boolean; onClick: () => void }
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <span
        className={cn(
          'text-[11.5px] leading-[1.5]',
          error ? 'text-destructive-foreground' : 'text-foreground',
        )}
        aria-live="polite"
      >
        {error ? userMessage(error) : pending ? 'Đang ghi…' : hint}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={onClose}>
          <Icon icon={X} size={16} />
          Huỷ
        </Button>
        <Button
          size="md"
          className="pointer-coarse:h-12"
          disabled={confirm.disabled || pending}
          onClick={confirm.onClick}
        >
          <Icon icon={confirm.icon} size={16} />
          {confirm.label}
        </Button>
      </div>
    </div>
  )
}
