import * as React from 'react'
import { cn } from '../lib/cn'

/** A-22 · Textarea — ô nhập NHIỀU DÒNG, anh em ruột của Input (A-04).
 *
 *  Vì sao là một atom riêng chứ không phải `<textarea className="…">` rải trong
 *  màn: ba thứ dễ trôi khỏi nhau khi chép tay — nền `bg-input`, vòng focus
 *  `ring`, và cỡ chữ 12,5px. Ba màn chép ba lần là ba ô nhập trông hơi khác
 *  nhau, mà "hơi khác nhau" là thứ mắt thấy trước cả nội dung.
 *
 *  KHÁC `RichText` (M-11): ô này giữ VĂN BẢN THUẦN. Dùng nó cho thứ sau này
 *  máy phải đọc — một câu trả lời của khách, một dòng mô tả đi vào phiếu. Dùng
 *  `RichText` cho thứ NGƯỜI đọc và cần định dạng: ghi chú dài, nội dung đợt.
 *  Nhét HTML vào một ô đáng lẽ là chữ thuần thì mọi chỗ đọc lại nó phải tự lọc
 *  thẻ, và sớm muộn có một chỗ quên.
 *
 *  Tự cao theo nội dung khi bật `autoGrow`: ô nhập mà phải cuộn trong lúc gõ là
 *  ô nhập giấu mất câu người ta vừa viết. Cao tối thiểu vẫn do `rows` quyết. */
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean
  /** Cao dần theo nội dung, không bao giờ thấp hơn `rows`. */
  autoGrow?: boolean
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, autoGrow = false, rows = 3, onChange, ...props }, ref) => {
    const inner = React.useRef<HTMLTextAreaElement>(null)

    /* Hai ref trỏ vào một ô: bên ngoài cần ref để focus, bên trong cần ref để
       đo chiều cao. Gộp bằng callback chứ không bắt chỗ gọi phải chọn một. */
    const setRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        inner.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      },
      [ref],
    )

    const grow = React.useCallback(() => {
      const el = inner.current
      if (!el || !autoGrow) return
      /* Về 0 trước rồi mới đọc `scrollHeight`: không hạ thì ô chỉ phình ra được
         mà không co lại khi người dùng xoá bớt chữ. */
      el.style.height = '0px'
      el.style.height = `${el.scrollHeight}px`
    }, [autoGrow])

    /* Chạy cả khi `value` đổi từ BÊN NGOÀI (nạp bản nháp, bấm hoàn tác), không
       chỉ khi người dùng gõ. */
    React.useEffect(grow, [grow, props.value])

    return (
      <textarea
        ref={setRef}
        rows={rows}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          grow()
          onChange?.(event)
        }}
        className={cn(
          /* Padding ngang 12px, không phải 14px của Input (A-04): 14 nằm ngoài
             thang 8 bậc và đang là một dòng nợ lint có sẵn — không nhân bản nó
             sang file mới. Lệch 2px giữa ô một dòng và ô nhiều dòng không nằm
             cạnh nhau trong cùng một hàng thì mắt không đọc ra. */
          'motion-std bg-input text-foreground w-full resize-y rounded-md p-3 text-[12.5px] leading-[1.7] outline-none',
          'placeholder:text-muted-foreground',
          'focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
          autoGrow && 'resize-none overflow-hidden',
          invalid &&
            'text-destructive-foreground shadow-[0_0_0_2px_color-mix(in_srgb,var(--destructive)_50%,transparent)]',
          className,
        )}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'
