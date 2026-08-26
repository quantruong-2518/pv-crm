import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** T-06 · PageHeader — đầu màn. MỌI màn mở bằng nó, không màn nào tự gõ tiêu đề.
 *
 *  Trước bản này chín màn chép tay cùng một khối `<h2 class="font-display
 *  text-[20px] … lg:text-[22px]">` + một dòng phụ đề 12px, và màn thứ mười
 *  (performance) dùng `SectionTitle size="lg"` 18px làm tiêu đề màn — tức đầu
 *  màn đã có hai cỡ chữ khác nhau cho cùng một vai. Cỡ chữ ở đây render CỨNG,
 *  component KHÔNG nhận `size`: đó chính là thứ giữ cho chỗ lệch đó không quay
 *  lại. Cần cỡ khác thì đó là tiêu đề của một khối, dùng `SectionTitle`.
 *
 *  Ba điều component tự quyết, màn không phải nhớ:
 *   · `rail` xuống HÀNG RIÊNG ngay dưới tiêu đề (luật 10). Trước đây rail bị
 *     nhét chung cụm với nút bên phải, nên ở màn nhiều nút nó trôi mất chỗ và
 *     ở chế độ sửa thì biến mất hẳn. Rail là chuỗi object của câu chuyện đang
 *     mở, không phải một nút phụ.
 *   · `back` đứng TRÊN tiêu đề, đúng quy ước "màn con của một sổ luôn có lối
 *     về sổ" (hồ sơ nguồn · hồ sơ lead · kho danh sách).
 *   · thẻ tiêu đề là `<h1>` — mỗi màn đúng một tiêu đề cấp một, để `<h2>` của
 *     `SectionTitle` nằm đúng một bậc dưới nó.
 *
 *  Component KHÔNG vẽ mặt kính và KHÔNG bọc `GlassCard`: nó nằm trên nền màn,
 *  là lớp 3 của luật 12. Bọc thêm kính là đẻ lớp nền thứ năm. */
export type PageHeaderProps = {
  /** tiêu đề màn — 20px, `lg` 22px, render cứng */
  title: string
  /** icon loại object đứng trước tiêu đề (hồ sơ nguồn: chiến dịch hay sự kiện) */
  icon?: LucideIcon
  /** Badge đứng cùng hàng với tiêu đề — loại, trạng thái. Không đặt nút ở đây. */
  meta?: ReactNode
  /** một câu dưới tiêu đề: kịch bản · kỳ · chủ màn · người gật */
  subtitle?: ReactNode
  /** hàng MetaPill dưới phụ đề — mã, khoảng ngày, người giữ */
  tags?: ReactNode
  /** nút bên phải cùng hàng tiêu đề */
  actions?: ReactNode
  /** <ContextRail> — PageHeader tự đặt thành hàng riêng ngay dưới (luật 10) */
  rail?: ReactNode
  /** lối về sổ, đứng trên tiêu đề. `label` là tên sổ: "Sổ nguồn", "Sổ lead". */
  back?: { label: string; onBack: () => void }
  className?: string
}

export function PageHeader({
  title,
  icon,
  meta,
  subtitle,
  tags,
  actions,
  rail,
  back,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {back && (
        <Button size="md" variant="ghost" className="self-start" onClick={back.onBack}>
          <Icon icon={ArrowLeft} size={16} />
          {back.label}
        </Button>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {icon && <Icon icon={icon} size={20} className="text-accent-foreground" />}
            <h1 className="font-display m-0 text-[20px] font-semibold lg:text-[22px]">{title}</h1>
            {meta}
          </div>

          {subtitle && (
            <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">{subtitle}</p>
          )}

          {tags && <div className="flex flex-wrap items-center gap-2">{tags}</div>}
        </div>

        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>

      {rail}
    </div>
  )
}
