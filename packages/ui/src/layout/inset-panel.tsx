import type { ComponentPropsWithRef } from 'react'
import { cn } from '../lib/cn'

/** A-22 · InsetPanel — ô lồng TRONG một thẻ. Không phải mặt kính.
 *
 *  Hai mươi chỗ trong app đang gõ tay `rounded-md bg-white/5`, và ngay cạnh đó
 *  là `bg-white/7`, `/9`, `/12` — cùng vai "ô lồng", bốn độ sáng. Component này
 *  thu bốn thứ đó về một mức, và cố tình KHÔNG nhận nền hay đệm qua tham số:
 *  mở một prop `bg` là mức nền thứ mười hai quay lại ngay tuần sau.
 *
 *  Luật 12 — nền đúng bốn lớp:
 *   · InsetPanel KHÔNG có `backdrop-blur`, không dùng class `.glass-*`. Nó là
 *     một mảng trắng mờ VẼ TRÊN mặt kính đang có, không phải mặt kính thứ hai.
 *   · Vì vậy: KHÔNG bọc `GlassCard` bên trong InsetPanel, và KHÔNG lồng
 *     InsetPanel trong InsetPanel. Hai mảng trắng chồng nhau đọc thành một lớp
 *     nền nữa — đúng thứ luật 12 cấm.
 *   · Bảng vẫn phải nằm trên `GlassCard variant="b"` CẤP MỘT (luật 8), không
 *     nhét vào đây.
 *
 *  Chữ phụ bên trong: khi panel nằm trên `.glass-a` đã nhuộm, `muted-foreground`
 *  chỉ còn ~3,8–4,4:1 — dùng `text-glass-foreground` cho đủ 4,5:1 (luật 13).
 *
 *  Nền lấy token `--surface-inset` (`bg-surface-inset`) — cùng giá trị .05 của
 *  hai mươi bản chép tay `bg-white/5`, nhưng có tên. Đổi mức nền là đổi ĐÚNG
 *  một dòng trong `packages/tokens/globals.css`, không phải hai mươi chỗ.
 *
 *  Bấm được thì KHÔNG nhét `onClick` vào đây — ô bấm được cần con trỏ, nền
 *  hover, vòng tiêu điểm và đường vào bằng bàn phím; đó là một component khác. */
/*  Nhận nốt thuộc tính DOM còn lại — `ref`, `role`, `aria-*`, `tabIndex`, `id`.
 *  Thiếu chúng thì một thẻ cần `ref` (để nút "Thêm đợt" cuộn tới và đặt tiêu
 *  điểm) hay cần `role="group" aria-labelledby` phải bỏ InsetPanel mà gõ tay
 *  `bg-surface-inset rounded-md p-4` — tức mức nền có tên vừa gom xong lại rò
 *  ra ngoài đúng chỗ khó thấy nhất.
 *
 *  React 19 nhận `ref` như một prop thường, không cần `forwardRef`.
 *
 *  `style` bị CẮT có chủ đích: nó là cửa sau duy nhất còn lại để đặt nền hay
 *  đệm mà không đi qua `pad`. Đóng prop `bg` ở trên rồi bỏ ngỏ `style` thì mức
 *  nền thứ mười hai vẫn quay lại, chỉ là bằng lối khác. */
export type InsetPanelProps = Omit<ComponentPropsWithRef<'div'>, 'style'> & {
  /** 'md' = p-4, thẻ lồng · 'sm' = p-3, ô lồng cấp hai */
  pad?: 'md' | 'sm'
}

export function InsetPanel({ children, pad = 'md', className, ...rest }: InsetPanelProps) {
  return (
    <div
      className={cn('bg-surface-inset rounded-md', pad === 'sm' ? 'p-3' : 'p-4', className)}
      {...rest}
    >
      {children}
    </div>
  )
}
