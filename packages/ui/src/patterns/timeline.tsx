import type { ReactNode } from 'react'
import { Kicker } from '../ui/separator'
import { StatusDot, type StatusDotState } from '../ui/status-dot'
import { cn } from '../lib/cn'

/** M-10 · Timeline — chuỗi việc theo thời gian, mỗi mốc mang được nội dung dày.
 *
 *  Cùng ngôn ngữ hình ảnh với ApprovalChain (M-03): chấm StatusDot + đường nối,
 *  bước hiện tại đọc bằng `current`. Khác một điểm: ApprovalChain là chuỗi NGANG
 *  chỉ có tên người, còn Timeline chạy DỌC và mỗi mốc là một khối — hàng meta,
 *  số liệu, nút. Đó là lý do nó là component riêng chứ không phải một prop của
 *  ApprovalChain.
 *
 *  Đường nối là `bg-surface-ink/8` rộng 1px, KHÔNG phải `border` — hệ borderless
 *  (luật 4 · docs/design-system/laws.md). Đường vẽ trên `<li>` chứ không trên cột
 *  chấm, vì khối định vị tuyệt đối tính theo padding box: nhờ vậy đường chạy
 *  xuyên qua cả khoảng `pb-6` để chạm chấm của mốc kế tiếp. Mốc cuối không có
 *  đường — chuỗi dừng ở đó, không lửng lơ. */
export type TimelineItem = {
  id: string
  /** DOM `id`, for a screen that has to `scrollIntoView` one moment. Separate
   *  from `id`, which is the React key and may collide with another element on
   *  the page — whatever reaches the DOM is the caller's to namespace. */
  domId?: string
  /** Mark the moment just jumped to: a faint ground, never an outline (law 4). */
  highlight?: boolean
  /** chấm trạng thái; mặc định `next` = chưa tới */
  state?: StatusDotState
  /** nhãn ngắn bên trái tiêu đề, ví dụ "Đợt 2" */
  marker?: ReactNode
  title: ReactNode
  /** hàng meta dưới tiêu đề — chỗ nhét MetaPill / ChannelTag */
  meta?: ReactNode
  /** thân: số liệu, progress… */
  children?: ReactNode
  /** hàng nút cuối item */
  actions?: ReactNode
}

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn('m-0 list-none p-0', className)}>
      {items.map((item, i) => (
        <li
          key={item.id}
          id={item.domId}
          className={cn(
            'relative flex gap-4 rounded-md pb-6 transition-colors last:pb-0',
            item.highlight && 'bg-accent/10',
          )}
        >
          {i < items.length - 1 && (
            <span aria-hidden className="bg-surface-ink/8 absolute bottom-0 left-1 top-4 w-px" />
          )}

          <span className="relative z-[1] flex w-2 shrink-0 justify-center pt-1">
            <StatusDot state={item.state ?? 'next'} />
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              {/* Marker là NHÃN ("Đợt 2"), không phải trạng thái — trạng thái
                  đã do StatusDot bên trái nói rồi. Azure chỉ dành cho AI · nút
                  chính · trạng thái active (luật 3), nên nhãn tô azure vừa sai
                  nghĩa vừa làm loãng thứ thật sự đang active trên màn.
                  Và bộ kiểu này chính là Kicker (A-09) chép lại lệch một chút
                  tracking — hai bản đứng cạnh nhau trên cùng màn thì lệch đó
                  đọc ra như lỗi. Dùng thẳng Kicker, khỏi giữ bản sao. */}
              {item.marker && <Kicker tone="muted">{item.marker}</Kicker>}
              <span className="font-display text-[13.5px] font-semibold">{item.title}</span>
            </div>

            {item.meta && <div className="flex flex-wrap items-center gap-2">{item.meta}</div>}

            {item.children && (
              <div className="text-glass-foreground text-[12px] leading-[1.7]">{item.children}</div>
            )}

            {item.actions && (
              <div className="flex flex-wrap items-center gap-2">{item.actions}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
