import type { ReactNode } from 'react'
import { InsetPanel } from '../layout/inset-panel'
import { GlassCard } from '../layout/glass-card'
import { cn } from '../lib/cn'

/** M-18 · NotDoing — khối "Cố tình không làm".
 *
 *  Mỗi màn đều có những thứ nhìn thì thiếu, mà thiếu là CÓ CHỦ Ý. Không nói ra
 *  thì người soát đọc chúng thành nợ, và lần sau có người "sửa" đúng cái vừa
 *  được quyết. Khối này là chỗ nói ra, kèm lý do — một mục là một quyết định.
 *
 *  Gom từ ba bản rời đang có trên màn (mỗi bản một dáng, một cỡ chữ, một màu):
 *  `campaign-parts.tsx` 3 mục · `prospect-lists.tsx` 6 mục · `plan.tsx` 4 mục.
 *
 *  ---- Vì sao `surface` quyết luôn màu chữ, không cho màn tự chọn ----
 *
 *  Đây mới là phần đáng gom. Ba bản kia lệch nhau ở đúng chỗ dễ sai nhất:
 *  bản nằm trong `InsetPanel` dùng `text-glass-foreground`, hai bản kia dùng
 *  `text-muted-foreground`. Không phải gu — là luật 13. `InsetPanel` là LỚP
 *  TRẮNG THỨ HAI đè trên `.glass-a`, và ở đó `--muted-foreground` chỉ còn
 *  ~4,19:1, dưới ngưỡng 4,5:1 (bảng đo trong `packages/tokens/globals.css`).
 *  Nên nền và màu chữ đi thành cặp, và cặp đó do component giữ:
 *
 *    'inset' → InsetPanel (lớp trắng 2) → chữ phụ `--glass-foreground`
 *    'plain' → đi trần, đã nằm trong thẻ của màn → `--muted-foreground`
 *    'card'  → GlassCard cấp một → `--muted-foreground`
 *
 *  Mở một prop màu ở đây là trả lại đúng cái lỗi vừa gom. */
export type NotDoingItem = {
  /** một quyết định, viết thành câu phủ định: "Không dự báo doanh số tháng tới" */
  title: string
  /** vì sao không làm — lý do, không phải lời hứa sẽ làm sau */
  body: ReactNode
}

export type NotDoingProps = {
  items: NotDoingItem[]
  /** nền của khối; quyết luôn màu chữ phụ (xem docblock) */
  surface?: 'inset' | 'plain' | 'card'
  /** 'auto' = xếp hai cột từ lg khi có quá 3 mục · '1' = luôn một cột */
  columns?: 'auto' | '1'
  /** mặc định "Cố tình không làm" */
  title?: string
  className?: string
}

export function NotDoing({
  items,
  surface = 'plain',
  columns = 'auto',
  title = 'Cố tình không làm',
  className,
}: NotDoingProps) {
  const bodyTone = surface === 'inset' ? 'text-glass-foreground' : 'text-muted-foreground'
  const twoCols = columns === 'auto' && items.length > 3

  const inner = (
    <>
      <h3 className="m-0 text-[13px] font-semibold">{title}</h3>
      <ul
        className={cn(
          'm-0 flex list-none flex-col gap-3 p-0',
          twoCols && 'lg:grid lg:grid-cols-2 lg:gap-4',
        )}
      >
        {items.map((it) => (
          <li key={it.title} className="flex flex-col gap-1">
            <b className="text-[13px] font-semibold">{it.title}</b>
            <span className={cn('text-[12.5px] leading-[1.6]', bodyTone)}>{it.body}</span>
          </li>
        ))}
      </ul>
    </>
  )

  if (surface === 'inset') {
    return <InsetPanel className={cn('flex flex-col gap-3', className)}>{inner}</InsetPanel>
  }
  if (surface === 'card') {
    return (
      <GlassCard className={cn('flex flex-col gap-3 p-5 lg:p-6', className)}>{inner}</GlassCard>
    )
  }
  return <div className={cn('flex flex-col gap-3', className)}>{inner}</div>
}
