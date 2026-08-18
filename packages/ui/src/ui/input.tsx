import * as React from 'react'
import { cn } from '../lib/cn'

/** A-04 · Input — bg-input h-10 rounded-md focus:ring-2 ring-ring.
 *  Borderless: trạng thái đọc bằng ring, không bằng viền. */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'motion-std bg-input text-foreground h-10 w-full rounded-md px-[14px] text-[12.5px] outline-none',
        'placeholder:text-muted-foreground',
        'focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
        invalid &&
          'text-destructive-foreground shadow-[0_0_0_2px_color-mix(in_srgb,var(--destructive)_50%,transparent)]',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
