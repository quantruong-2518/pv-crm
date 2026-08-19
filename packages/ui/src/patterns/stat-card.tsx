import type { LucideIcon } from 'lucide-react'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { GlassCard } from '../layout/glass-card'
import { Icon } from '../ui/icon'
import { Sparkline, type SparklineProps, type SparklineTone } from '../ui/sparkline'
import { cn } from '../lib/cn'

/** M-01 · StatCard — Card + font-num + label + delta + Sparkline.
 *
 *  Delta dùng icon Lucide trending-up / trending-down / minus.
 *  Theme kit gốc còn ký tự "▲" ở ô này; luật 15 (docs/luat-thiet-ke.md §1)
 *  cấm ▲▼▬ nên bản dựng theo luật, không theo ký tự cũ.
 *
 *  ---- Vì sao chiều cao không còn cứng ----
 *  Bản 10/08 khoá `h-[150px]` cho MỌI thẻ, vì bento của Home luôn có sparkline
 *  và sparkline được `mt-auto` ghim xuống đáy — 150px là thứ tạo ra khoảng trống
 *  để ghim vào. Thẻ KHÔNG có sparkline thì không có gì ăn hết khoảng trống đó:
 *  còn lại đúng một mảng trắng chết dưới label. Đó là lỗi người dùng nhìn thấy
 *  trên toàn nhánh Sales.
 *
 *  Luật ở đây: **có sparkline thì `h-[150px]`, không thì cao theo nội dung.**
 *  Không dùng `min-h-[150px]` — min-h giữ nguyên sàn 150px, tức giữ nguyên đúng
 *  khoảng trắng cần bỏ, chỉ khác là cho phép cao thêm. Và cũng không cần chiều
 *  cao cứng để các thẻ trong một hàng bằng nhau: ô của CSS grid mặc định
 *  `align-items: stretch`, hàng tự cao bằng thẻ cao nhất.
 *
 *  `compact` là bản cho bảng chỉ số dày (5–6 thẻ một hàng): số 26px, padding
 *  16/12, cao theo nội dung — không `mt-auto`, không khe trống chờ lấp. */
export type StatCardProps = {
  /** đã format sẵn: "890 tr", "1,84 tỷ", "86%" */
  value: string
  label: string
  /** 'hero' = số 42px, bento 1×1 · 'compact' = số 26px, cao theo nội dung */
  size?: 'hero' | 'compact'
  /** dòng thứ ba, 11px muted — chỗ để tỉ lệ / ngữ cảnh, thay vì nhồi vào label */
  hint?: string
  /** icon nhận dạng chỉ số — 16px, muted, cùng hàng với số, sát mép phải */
  icon?: LucideIcon
  delta?: {
    direction: 'up' | 'down' | 'flat'
    text: string
    /** hướng tốt hay xấu — không suy từ direction, vì "công nợ tăng" là xấu */
    tone: 'success' | 'danger' | 'warning' | 'muted'
  }
  sparkline?: Pick<SparklineProps, 'points' | 'source'> & { tone?: SparklineTone }
  className?: string
}

const deltaIcon = { up: TrendingUp, down: TrendingDown, flat: Minus }
const deltaTone = {
  success: 'text-success',
  danger: 'text-destructive-foreground',
  warning: 'text-warning',
  muted: 'text-muted-foreground',
}

export function StatCard({
  value,
  label,
  size = 'hero',
  hint,
  icon,
  delta,
  sparkline,
  className,
}: StatCardProps) {
  const compact = size === 'compact'

  return (
    <GlassCard
      className={cn(
        'flex flex-col',
        // px-5 py-[18px] của bản vẽ gốc không thuộc thang 8 bậc (luật 7) —
        // trả nợ luôn ở đây: p-5 = 20px, bậc gần nhất.
        compact ? 'px-4 py-3' : 'p-5',
        !compact && sparkline && 'h-[150px]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            'tnum font-num min-w-0 font-semibold leading-none',
            compact ? 'text-[26px] tracking-[-.8px]' : 'text-[42px] tracking-[-1.5px]',
          )}
        >
          {value}
        </div>
        {icon && <Icon icon={icon} size={16} className="text-muted-foreground" />}
      </div>

      <div className="text-muted-foreground mt-2 text-[12px]">{label}</div>

      {hint && <div className="text-muted-foreground mt-1 text-[11px] leading-[1.5]">{hint}</div>}

      {delta && (
        <div
          className={cn(
            'mt-3 flex items-center gap-1 text-[11.5px] font-semibold leading-none',
            deltaTone[delta.tone],
          )}
        >
          <Icon icon={deltaIcon[delta.direction]} size={14} />
          {delta.text}
        </div>
      )}

      {sparkline && (
        <Sparkline
          className={cn('shrink-0', compact ? 'mt-3' : 'mt-auto')}
          height={22}
          points={sparkline.points}
          source={sparkline.source}
          tone={sparkline.tone}
        />
      )}
    </GlassCard>
  )
}
