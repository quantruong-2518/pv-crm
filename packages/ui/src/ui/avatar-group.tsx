import { Avatar } from './avatar'
import { cn } from '../lib/cn'

/** A-17 · AvatarGroup — "ai đang làm việc này", gọn trong một ô bảng.
 *
 *  Bảng lead có cột người, và người thì thường là hai ba người chứ không phải
 *  một: chủ lead, BD đang moi ô, presales đi cùng demo. Xếp tên thành chữ thì ô
 *  vỡ ngay ở người thứ hai; xếp thành cụm avatar thì ô rộng bằng nhau ở mọi
 *  dòng và mắt quét được theo cột.
 *
 *  Tên hiện khi rê chuột — đây là chỗ duy nhất trong hệ có tooltip tự dựng, vì
 *  `title` gốc của trình duyệt trễ nửa giây và không đọc được trên nền tối. Chữ
 *  vẫn giữ trong `aria-label` của từng Avatar cho trình đọc màn hình, nên
 *  tooltip là phần THÊM chứ không phải chỗ duy nhất chứa tên.
 *
 *  Tràn thì gộp thành ô `+N`, và tooltip của ô đó liệt kê nốt phần bị gộp —
 *  không ai phải đoán "+2 là ai". */
export type AvatarGroupProps = {
  names: string[]
  /** Số avatar hiện ra trước khi gộp thành `+N`. Mặc định 3. */
  max?: number
  size?: 'sm' | 'md' | 'lg'
  /** Câu hiện khi danh sách rỗng. Ô trống bị đọc thành "chưa tải xong". */
  emptyLabel?: string
  className?: string
}

function Tip({ children }: { children: string }) {
  return (
    <span
      className={cn(
        'glass-b pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden',
        '-translate-x-1/2 whitespace-nowrap rounded-sm px-2 py-1 text-[11px]',
        'group-hover/av:block',
      )}
    >
      {children}
    </span>
  )
}

export function AvatarGroup({
  names,
  max = 3,
  size = 'sm',
  emptyLabel = 'chưa ai nhận',
  className,
}: AvatarGroupProps) {
  if (names.length === 0) {
    return (
      <span className={cn('text-muted-foreground text-[11.5px]', className)}>{emptyLabel}</span>
    )
  }

  const shown = names.slice(0, max)
  const rest = names.slice(max)

  return (
    <span className={cn('flex items-center', className)} aria-label={names.join(' · ')}>
      {shown.map((name, i) => (
        <span key={name} className={cn('group/av relative', i > 0 && '-ml-2')}>
          <Avatar name={name} size={size} className="shadow-control" />
          <Tip>{name}</Tip>
        </span>
      ))}

      {rest.length > 0 && (
        <span className="group/av relative -ml-2">
          <span
            className={cn(
              'text-glass-foreground shadow-control bg-white/16 flex items-center justify-center rounded-md font-semibold',
              size === 'lg'
                ? 'size-[38px] text-[12.5px]'
                : size === 'md'
                  ? 'size-[30px] text-[11px]'
                  : 'size-6 text-[9.5px]',
            )}
          >
            +{rest.length}
          </span>
          <Tip>{rest.join(' · ')}</Tip>
        </span>
      )}
    </span>
  )
}
