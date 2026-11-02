import type { ReactNode } from 'react'
import { Badge, ChannelTag, Icon, MetaPill, cn, type BadgeProps, type IconGlyph } from '@pv/ui'
import {
  COMM_CONFIRM_WITHIN_HOURS,
  type CommRecordState,
  type DebriefStepCopy,
  type ThreadChannel,
} from '@pv/contracts'
import { dmy } from '@/lib/date'
import { message, useI18n } from '@/app/i18n'
import { COMMS_CHANNEL_ICON, COMMS_CHANNEL_LABEL } from '@/data/comms'
import { commStateLabel } from '@/data/comm-record-detail'

/** Small pieces every comm-record screen draws the same way: the state pill,
 *  the late mark, the channel and the answer chip.
 *
 *  One file so the queue, the record page and the mobile flow cannot drift
 *  into three spellings of one state — the labels themselves come from
 *  `COMM_RECORD_STATE_LABEL` in the contract (ADR 0075 §2). */

/** Law 16: a state is a text pill. Red for "nothing typed yet" because it is
 *  the furthest from done; a booked meeting reads as running, not as a debt;
 *  an unreached or cancelled record is closed with nothing owed, so it stays neutral.
 *  Every tone carries its tint's own ink (law 13). */
const STATE_TONE: Record<CommRecordState, BadgeProps['tone']> = {
  empty: 'danger',
  unconfirmed: 'warning',
  done: 'success',
  scheduled: 'running',
  unreached: 'draft',
  cancelled: 'draft',
}

export function CommStateBadge({ state }: { state: CommRecordState }) {
  const { lang } = useI18n()
  return <Badge tone={STATE_TONE[state]}>{commStateLabel(state, lang)}</Badge>
}

/** The server's `late` flag, never a clock on this side (ADR 0075 §6). */
export function CommLateMark({ late }: { late: boolean }) {
  const { t } = useI18n()
  if (!late) return null
  return (
    <MetaPill tone="warning">
      {t(
        message(
          `Quá ${COMM_CONFIRM_WITHIN_HOURS} giờ chưa xác nhận`,
          `Unconfirmed after ${COMM_CONFIRM_WITHIN_HOURS} hr`,
          `${COMM_CONFIRM_WITHIN_HOURS}시간 넘게 미확인`,
        ),
      )}
    </MetaPill>
  )
}

/** A booked meeting past its end, not yet closed out (`meetingOverdue`). */
export function CommOverdueMark({ overdue }: { overdue: boolean }) {
  const { t } = useI18n()
  if (!overdue) return null
  return (
    <MetaPill tone="warning">
      {t(
        message(
          'Quá giờ · chờ Họp xong',
          'Past time · waiting for Meeting held',
          '시간 초과 · 회의 완료 대기',
        ),
      )}
    </MetaPill>
  )
}

/** Tinted per channel so the eye finds the call among the mail; each channel
 *  token reads as text on its own 14% tint in both themes. Zalo borrows the
 *  success pair, the rest stay neutral. */
const CHANNEL_TONE: Record<ThreadChannel, string> = {
  phone: 'bg-channel-phone/14 text-channel-phone',
  meeting: 'bg-channel-meeting/14 text-channel-meeting',
  'zalo-oa': 'bg-success/20 text-on-tint-success',
  email: 'bg-surface-ink/9 text-muted-foreground',
  telegram: 'bg-surface-ink/9 text-muted-foreground',
  whatsapp: 'bg-surface-ink/9 text-muted-foreground',
  'in-app': 'bg-surface-ink/9 text-muted-foreground',
}

export function ChannelPill({ channel }: { channel: ThreadChannel }) {
  return (
    <ChannelTag
      icon={COMMS_CHANNEL_ICON[channel]}
      label={COMMS_CHANNEL_LABEL[channel]}
      className={cn('font-semibold', CHANNEL_TONE[channel])}
    />
  )
}

/** One pickable word — an evaluation answer or a step kind. A toggle with
 *  `aria-pressed`, tinted rather than solid so azure stays countable (law 3);
 *  48px under a coarse pointer (law 13). */
export function ChoiceChip({
  pressed,
  onClick,
  icon,
  children,
  className,
}: {
  pressed: boolean
  onClick: () => void
  icon?: IconGlyph
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'motion-std pointer-coarse:h-12 inline-flex h-10 items-center gap-2 rounded-md px-3 text-[12.5px] font-medium',
        pressed
          ? 'bg-primary/24 text-accent-foreground'
          : 'bg-surface-ink/9 text-foreground hover:bg-surface-ink/16',
        className,
      )}
    >
      {icon && <Icon icon={icon} size={16} />}
      {children}
    </button>
  )
}

/** A step as the record kept it: kind, text, due. No fill of its own — it sits
 *  inside a card that already has one, and two stacked fills cost law 13. */
export function StepCopyLine({ step }: { step: DebriefStepCopy }) {
  const { t } = useI18n()
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <MetaPill>{step.kind.name}</MetaPill>
      <span className="text-foreground min-w-0 flex-1 break-words text-[12px] leading-[1.5]">
        {step.text}
      </span>
      <span className="text-muted-foreground tnum text-[11.5px]">
        {t(message(`hạn ${dmy(step.due)}`, `due ${dmy(step.due)}`, `기한 ${dmy(step.due)}`))}
      </span>
    </span>
  )
}
