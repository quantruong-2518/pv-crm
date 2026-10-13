import { Input, cn } from '@pv/ui'

/** A whole-number box with its unit riding inside the right edge (`₫`, `$`, `%`).
 *  A keystroke past `max` is refused rather than cut down, because a silently
 *  trimmed tail turns one figure into another plausible one. */
export function NumberBox({
  value,
  onChange,
  label,
  unit,
  max = Number.MAX_SAFE_INTEGER,
  invalid,
  className,
}: {
  value: number | null
  onChange: (next: number | null) => void
  label: string
  unit: string
  max?: number
  invalid?: boolean
  className?: string
}) {
  return (
    <span className="relative flex items-center">
      <Input
        inputMode="numeric"
        aria-label={label}
        invalid={invalid}
        className={cn('tnum font-num pointer-coarse:h-12 pr-8 text-right', className)}
        value={value === null ? '' : value.toLocaleString('vi-VN')}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '')
          if (digits === '') return onChange(null)
          const next = Number(digits)
          if (next <= max) onChange(next)
        }}
      />
      <span className="text-muted-foreground pointer-events-none absolute right-3 text-[12px]">
        {unit}
      </span>
    </span>
  )
}
