import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { GlassCard } from '@/components/layout/glass-card'
import { Icon } from '@/components/ui/icon'
import { Sparkline, type SparklineProps, type SparklineTone } from '@/components/ui/sparkline'
import { cn } from '@/lib/cn'

/** M-01 · StatCard — Card + font-num text-5xl + label text-xs + delta + Sparkline.
 *  Bento 1×1 · h-[150px].
 *
 *  Delta dùng icon Lucide trending-up / trending-down / minus.
 *  Theme kit .dc.html còn ký tự "▲" ở ô này; luật 15 (CLAUDE.md) và AGENTS.md §1.11
 *  cấm ▲▼▬ nên bản dựng theo luật, không theo ký tự cũ. */
export type StatCardProps = {
  /** đã format sẵn: "890 tr", "1,84 tỷ", "86%" */
  value: string
  label: string
  delta?: {
    direction: 'up' | 'down' | 'flat'
    text: string
    /** hướng tốt hay xấu — không suy từ direction, vì "công nợ tăng" là xấu */
    tone: 'success' | 'danger' | 'muted'
  }
  sparkline?: Pick<SparklineProps, 'points' | 'source'> & { tone?: SparklineTone }
  className?: string
}

const deltaIcon = { up: TrendingUp, down: TrendingDown, flat: Minus }
const deltaTone = {
  success: 'text-success',
  danger: 'text-destructive-foreground',
  muted: 'text-muted-foreground',
}

export function StatCard({ value, label, delta, sparkline, className }: StatCardProps) {
  return (
    <GlassCard hoverable className={cn('flex h-[150px] flex-col px-5 py-[18px]', className)}>
      <div className="tnum font-num text-[42px] leading-none font-semibold tracking-[-1.5px]">
        {value}
      </div>
      <div className="mt-2 text-[12px] text-muted-foreground">{label}</div>
      {delta && (
        <div
          className={cn(
            'mt-3 flex items-center gap-1 text-[11.5px] leading-none font-semibold',
            deltaTone[delta.tone],
          )}
        >
          <Icon icon={deltaIcon[delta.direction]} size={14} />
          {delta.text}
        </div>
      )}
      {sparkline && (
        <Sparkline
          className="mt-auto shrink-0"
          height={22}
          points={sparkline.points}
          source={sparkline.source}
          tone={sparkline.tone}
        />
      )}
    </GlassCard>
  )
}
