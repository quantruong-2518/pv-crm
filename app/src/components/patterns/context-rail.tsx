import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/cn'

/** M-02 · ContextRail — BẮT BUỘC trên mọi màn (luật 10 · CLAUDE.md).
 *  Dãy chip mã mono nối các object của cùng một câu chuyện, dựng thẳng từ E1.
 *  Chip azure = object của câu chuyện đang mở · chip trắng mờ = object liên quan.
 *  Mobile rút gọn còn ≤3 chip. */
export type RailObject = {
  code: string
  /** true = chip nguồn hệ thống (bg-accent), bấm được, mở object */
  source?: boolean
  onOpen?: () => void
}

export type ContextRailProps = {
  objects: RailObject[]
  /** đặt 3 trên mobile — rail tự cắt và giữ chip nguồn */
  max?: number
  className?: string
}

export function ContextRail({ objects, max, className }: ContextRailProps) {
  const shown = typeof max === 'number' ? objects.slice(0, max) : objects

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)} aria-label="Chuỗi object liên quan">
      {shown.map((o) => (
        <Chip key={o.code} variant={o.source ? 'source' : 'object'} onOpen={o.onOpen}>
          {o.code}
        </Chip>
      ))}
    </div>
  )
}
