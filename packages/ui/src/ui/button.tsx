import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'

/** A-01 · Button — 5 variant · 3 size.
 *  default → h-10 px-[18px] rounded-md bg-primary text-primary-foreground shadow-primary
 *  ghost   → bg-surface-ink/9 · destructive → bg-destructive/20 text-destructive-foreground
 *  Nút tablet luôn size lg (≥48px) — luật 13 · docs/design-system/laws.md.
 *
 *  `success` là bản đối xứng của `destructive`: một nền TINT, không phải nền
 *  đặc. Nền đặc `--success` trên theme tối chỉ đạt 2,7:1 với chữ trắng, dưới
 *  sàn 4,5:1 của luật 13; `--on-tint-success-strong` là token sinh ra đúng cho
 *  chữ trên nền success đã nhuộm, và đo được 8,2:1 (midnight) · 6,0:1 (stone).
 *  Nó KHÔNG thay `default` ở hành động chính — azure vẫn giữ vai đó (luật 3);
 *  `success` dành cho hành động tích cực đứng CẠNH hành động chính.
 *
 *  Ghi chú: padding ngang 18/24px lấy đúng từ theme kit; thang spacing 8 bậc
 *  áp cho gap và padding khối, không áp cho padding ngang của control. */
const buttonVariants = cva(
  'motion-std inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-primary hover:brightness-[1.12]',
        secondary: 'bg-secondary text-secondary-foreground shadow-control hover:bg-secondary-hover',
        ghost: 'bg-surface-ink/9 text-foreground shadow-control hover:bg-surface-ink/16',
        destructive:
          'bg-destructive/20 text-destructive-foreground shadow-control-soft hover:bg-destructive/32',
        success:
          'bg-success/20 text-on-tint-success-strong shadow-control-soft hover:bg-success/32',
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
        disabled && 'text-muted-foreground bg-surface-ink/5 cursor-not-allowed shadow-none',
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

export { buttonVariants }
