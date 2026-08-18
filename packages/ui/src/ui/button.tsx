import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'

/** A-01 · Button — 4 variant · 3 size.
 *  default → h-10 px-[18px] rounded-md bg-primary text-primary-foreground shadow-primary
 *  ghost   → bg-white/9 · destructive → bg-destructive/20 text-destructive-foreground
 *  Nút tablet luôn size lg (≥48px) — luật 13 · CLAUDE.md.
 *
 *  Ghi chú: padding ngang 18/24px lấy đúng từ theme kit; thang spacing 8 bậc
 *  áp cho gap và padding khối, không áp cho padding ngang của control. */
const buttonVariants = cva(
  'motion-std inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-primary hover:brightness-[1.12]',
        secondary: 'bg-secondary text-secondary-foreground shadow-control hover:bg-brand-blue/75',
        ghost: 'bg-white/9 text-foreground shadow-control hover:bg-white/16',
        destructive:
          'bg-destructive/20 text-destructive-foreground shadow-control-soft hover:bg-destructive/32',
      },
      size: {
        sm: 'h-8 px-3 text-[11.5px]',
        md: 'h-10 px-[18px] text-[12.5px]',
        lg: 'h-12 px-6 text-[14px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        buttonVariants({ variant, size }),
        disabled && 'text-muted-foreground cursor-not-allowed bg-white/5 shadow-none',
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

export { buttonVariants }
