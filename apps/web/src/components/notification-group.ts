import {
  BriefcaseDollar,
  CalendarClock,
  FileText,
  Inbox,
  Lock,
  Mail,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  Target,
  Timer,
  type BadgeProps,
  type IconGlyph,
} from '@pv/ui'
import type { NotificationGroup } from '@pv/contracts'

export type Tone = NonNullable<BadgeProps['tone']>

/** What the row is about, said by shape and by ink before it is said by word.
 *  `Record` makes a new group fail to compile until it has both. */
export const GROUP_ICON: Record<NotificationGroup, IconGlyph> = {
  lead: Inbox,
  opportunity: BriefcaseDollar,
  contract: FileText,
  'next-step': CalendarClock,
  hold: Timer,
  approval: ShieldCheck,
  mail: Mail,
  account: Lock,
  campaign: Megaphone,
  kpi: Target,
  comm: MessageSquare,
}

export const GROUP_TONE: Record<NotificationGroup, Tone> = {
  lead: 'running',
  opportunity: 'running',
  contract: 'draft',
  'next-step': 'warning',
  hold: 'warning',
  approval: 'warning',
  mail: 'draft',
  account: 'draft',
  campaign: 'draft',
  kpi: 'running',
  comm: 'warning',
}

export const TONE_INK: Record<Tone, string> = {
  draft: 'text-muted-foreground',
  running: 'text-accent-foreground',
  warning: 'text-on-tint-warning',
  success: 'text-on-tint-success',
  danger: 'text-on-tint-destructive',
}
