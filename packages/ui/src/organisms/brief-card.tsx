import { ContextRail, type RailObject } from '../patterns/context-rail'
import { Badge, type BadgeProps } from '../ui/badge'
import { StatusDot, type StatusDotState } from '../ui/status-dot'
import { GlassCard } from '../layout/glass-card'
import { cn } from '../lib/cn'

/** O-03 · BriefCard — bento 2×1.
 *  StatusDot + tiêu đề text-lg + mô tả text-sm + ContextRail + Badge góc phải. */
export type BriefCardProps = {
  state: Extract<StatusDotState, 'bad' | 'warning' | 'ok' | 'current'>
  title: string
  description: string
  badge: { label: string; tone: BadgeProps['tone'] }
  objects: RailObject[]
  className?: string
}

export function BriefCard({
  state,
  title,
  description,
  badge,
  objects,
  className,
}: BriefCardProps) {
  return (
    <GlassCard hoverable className={cn('flex flex-col gap-2.5 px-5 py-[18px]', className)}>
      <div className="flex items-center gap-2.5">
        <StatusDot state={state} />
        <b className="font-display flex-1 text-[15px] font-semibold">{title}</b>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <p className="text-muted-foreground text-pretty text-[12.5px] leading-[1.6]">{description}</p>
      <ContextRail objects={objects} className="mt-auto pt-2" />
    </GlassCard>
  )
}
