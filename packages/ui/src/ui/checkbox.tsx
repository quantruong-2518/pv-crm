import { useEffect, useRef, type ReactNode } from 'react'
import { Check, Minus } from '../icons'
import { Icon } from './icon'
import { cn } from '../lib/cn'

/** A-16 · Checkbox — chọn nhiều trong một danh sách.
 *
 *  Ô thật là `<input type="checkbox">` nằm dưới `sr-only`: bàn phím, Space,
 *  form và trình đọc màn hình đều là của trình duyệt, phần vẽ mới là của hệ.
 *  Một `<button role="checkbox">` tự dựng phải chép lại cả bốn thứ đó và
 *  thường chép thiếu.
 *
 *  Borderless (luật 4): ô chưa tick đọc bằng nền `white/12`, ô đã tick bằng nền
 *  azure — không viền. Vòng focus là `peer-focus-visible`, tức chỉ hiện khi đi
 *  bằng bàn phím. */
export type CheckboxProps = {
  checked: boolean
  /** Một phần danh sách đã chọn — ô vẽ dấu gạch và lần bấm kế tiếp chọn hết. */
  indeterminate?: boolean
  onChange: (checked: boolean) => void
  /** Dòng chính. Bấm vào chữ cũng tick — nhãn bọc cả ô. */
  label: ReactNode
  /** Dòng phụ 11px dưới nhãn — vai, kỹ năng, lý do được gợi ý. */
  hint?: ReactNode
  /** Khối bên phải: avatar, badge, số. */
  trailing?: ReactNode
  disabled?: boolean
  className?: string
}

export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  hint,
  trailing,
  disabled = false,
  className,
}: CheckboxProps) {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (input.current) input.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <label
      className={cn(
        'motion-std flex items-center gap-3 rounded-md px-3 py-2',
        /* Ô khoá chỉ đổi CON TRỎ, không dìm cả nhãn — luật 13.
         *
         *  Bản trước để `opacity-55` ở đây, tức phủ lên cả `label` lẫn `hint`.
         *  Đo trên mặt Drawer thì `--muted-foreground` @55% ra `#575F77`, tức
         *  **2,95:1** — dưới hẳn ngưỡng 4,5:1. Trớ trêu là `hint` chỉ xuất hiện
         *  đúng trên ô bị khoá, nên câu DUY NHẤT giải thích vì sao control chết
         *  lại là câu đọc không ra.
         *
         *  Cùng lỗi này repo đã bác một lần ở `app-header.tsx` (`opacity-45`
         *  lên cả nút, đo được 2,29:1) và chốt cách sửa ở `nav-item.tsx`: chữ
         *  giữ nguyên màu, chỉ phần đồ hoạ mờ đi. Ô vuông ở dưới nhận
         *  `opacity-55`; chữ không. */
        disabled ? 'cursor-not-allowed' : 'hover:bg-white/8 cursor-pointer',
        checked && !disabled && 'bg-primary/16',
        className,
      )}
    >
      <input
        ref={input}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'motion-std flex size-4 shrink-0 items-center justify-center rounded-sm',
          checked || indeterminate ? 'bg-primary text-primary-foreground' : 'bg-white/12',
          /* Toàn bộ tín hiệu "khoá" nằm ở đây — một hình vuông, không phải chữ.
             Mờ một mảng màu không làm ai đọc khó hơn; mờ một dòng chữ thì có. */
          disabled && 'opacity-55',
          'peer-focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_60%,transparent)]',
        )}
      >
        {indeterminate ? (
          <Icon icon={Minus} size={14} strokeWidth={1.9} />
        ) : (
          checked && <Icon icon={Check} size={14} strokeWidth={1.9} />
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[12.5px] font-semibold">{label}</span>
        {hint && <span className="text-muted-foreground truncate text-[11px]">{hint}</span>}
      </span>

      {trailing && <span className="flex shrink-0 items-center gap-2">{trailing}</span>}
    </label>
  )
}
