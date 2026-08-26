import { Skeleton } from '../ui/skeleton'
import { cn } from '../lib/cn'

/** M-16 · LoadingBlock — khung chờ của một khối nội dung.
 *
 *  Luật của khung chờ chỉ có một: CAO XẤP XỈ nội dung thật. Khung thấp hơn thì
 *  màn nhảy một nhịp lúc số về; khung cao hơn thì màn tụt xuống. Vì vậy
 *  `height` là bắt buộc — không có giá trị mặc định nào đoán đúng cho mọi khối.
 *
 *  `height` là chiều cao của MỘT dải. `lines` chỉ xếp thêm dải cùng cỡ, cách
 *  nhau 12px — đúng hình năm chỗ trong app đang gõ tay (`h-32` × 2, `h-40`…).
 *  Hai khối cao khác nhau là HAI LoadingBlock, không phải một cái nhiều dải.
 *
 *  Nhịp lệch pha 200ms mỗi dải: A-08 hứa điều đó trong docblock từ bản chốt
 *  10/08 mà chưa chỗ nào dùng — ba dải nhấp nháy đồng loạt đọc như một khối
 *  chết, lệch pha thì đọc ra là đang chờ.
 *
 *  Trình đọc màn hình: bản thân dải là `aria-hidden` (A-08), nên khối mang
 *  `role="status"` + một câu ẩn. Không có câu đó thì lúc chờ máy đọc ra im
 *  lặng, không phân biệt được với màn rỗng. */
export type LoadingBlockProps = {
  /** cao xấp xỉ nội dung thật, px — cao của MỘT dải */
  height: number
  /** số dải xếp dọc, mặc định 1 */
  lines?: number
  /** bề ngang, ví dụ '256px' cho khung chờ của một tiêu đề. Mặc định kín khối. */
  width?: string
  /** câu đọc cho trình đọc màn hình — nói ra đang chờ CÁI GÌ */
  label?: string
  className?: string
}

export function LoadingBlock({
  height,
  lines = 1,
  width = '100%',
  label = 'Đang tải',
  className,
}: LoadingBlockProps) {
  return (
    <div role="status" aria-busy className={cn('flex flex-col gap-3', className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={width} height={height} delay={i * 200} />
      ))}
    </div>
  )
}
