import { ScanLine } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

/** M-05 · ScanField — tablet.
 *  h-16 font-mono text-[22px] · nút quét 56px · đúng/sai = ring success/destructive + toast. */
export type ScanFieldProps = {
  /** mã lô vừa quét, ví dụ "L-2608-042" */
  code?: string
  state?: 'idle' | 'matched' | 'mismatch'
  /** "✓ Khớp PO-0455 · vị trí đề xuất K1-A2" */
  message?: string
  onScan?: () => void
  className?: string
}

const fieldTone = {
  idle: 'bg-input text-muted-foreground',
  matched:
    'bg-success/13 text-foreground shadow-[var(--shadow-success),inset_0_1px_0_rgb(255_255_255/.10)]',
  mismatch:
    'bg-destructive/13 text-foreground shadow-[0_0_0_2px_color-mix(in_srgb,var(--destructive)_50%,transparent)]',
}

const messageTone = {
  idle: 'text-muted-foreground',
  matched: 'text-success',
  mismatch: 'text-destructive-foreground',
}

export function ScanField({
  code,
  state = 'idle',
  message,
  onScan,
  className,
}: ScanFieldProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            'tnum flex h-16 flex-1 items-center rounded-md px-4 font-mono text-[22px]',
            fieldTone[state],
          )}
        >
          {code ?? 'Chờ quét mã lô…'}
        </div>
        <button
          type="button"
          onClick={onScan}
          aria-label="Quét mã lô"
          className="motion-std flex size-14 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-primary hover:brightness-[1.12]"
        >
          <Icon icon={ScanLine} size={24} strokeWidth={1.9} />
        </button>
      </div>
      {message && (
        <div className={cn('mt-3 text-[11.5px]', messageTone[state])} role="status">
          {message}
        </div>
      )}
    </div>
  )
}
