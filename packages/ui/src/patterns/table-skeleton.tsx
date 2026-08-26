import { Skeleton } from '../ui/skeleton'
import { cn } from '../lib/cn'

/** M-17 · TableSkeleton — khung chờ của một BẢNG, đo đúng theo DataTable.
 *
 *  Ba màn đang gõ tay `<Skeleton className="h-11 w-full" />` ba lần trong một
 *  `flex-col gap-3`. Hình đó sai hai chỗ: dòng bảng thật cao 44px nhưng KHÔNG
 *  cách nhau 12px, nên khung chờ cao hơn bảng thật 24px và màn tụt xuống lúc
 *  dữ liệu về; và cả dòng tô kín đọc thành một biểu đồ cột nằm ngang chứ không
 *  ra hình bảng.
 *
 *  Ở đây một dòng là một hộp cao `rowHeight` chứa MỘT vạch chữ cao 11px —
 *  đúng cách DataTable đặt chữ giữa ô cao `h-11`. Tổng cao = rows × rowHeight
 *  (+19px nếu có dải tiêu đề: vạch 11px + 8px đệm, đúng `pb-2` của header thật).
 *
 *  `rowHeight` mặc định 44 vì DataTable là `h-11`. Bảng nào đổi chiều cao dòng
 *  thì truyền lại — component không đọc được bảng đứng cạnh nó.
 *
 *  Nhịp lệch pha 200ms mỗi dòng, cùng lý do với M-16.
 *
 *  Component KHÔNG tự vẽ mặt kính — cùng hợp đồng với DataTable: bảng và khung
 *  chờ của bảng đều nằm trong `GlassCard variant="b"` của màn (luật 8). */
export type TableSkeletonProps = {
  /** số dòng giả, mặc định 3 */
  rows?: number
  /** cao một dòng, mặc định 44 — khớp `h-11` của DataTable */
  rowHeight?: number
  /** dải tiêu đề bảng ở trên */
  header?: boolean
  /** câu đọc cho trình đọc màn hình */
  label?: string
  className?: string
}

export function TableSkeleton({
  rows = 3,
  rowHeight = 44,
  header = false,
  label = 'Đang tải bảng',
  className,
}: TableSkeletonProps) {
  return (
    <div role="status" aria-busy className={cn('flex flex-col', className)}>
      <span className="sr-only">{label}</span>

      {header && (
        <div className="pb-2">
          <Skeleton width="38%" height={11} />
        </div>
      )}

      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center" style={{ height: rowHeight }}>
          <Skeleton height={11} delay={i * 200} />
        </div>
      ))}
    </div>
  )
}
