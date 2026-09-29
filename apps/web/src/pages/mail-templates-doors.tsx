import { Checkbox, GlassCard, MetaPill, SegmentedControl } from '@pv/ui'
import {
  MAIL_DOOR_LABEL,
  MailDoor,
  OPPORTUNITY_STAGE_LABEL,
  type MailTemplateMilestone,
} from '@pv/contracts'

/** The template's "where used" block (G4, G-Template): which doors list it, and
 *  which of those open pre-filled with it. Split off `mail-templates-parts.tsx`
 *  because that panel was already past its function ceiling.
 *
 *  `defaultFor ⊆ doors` is kept here on every toggle — the contract refuses the
 *  other shape, and a default for a door the template is hidden from would
 *  pre-fill a picker that cannot show what it chose. One template per door is
 *  the SERVER's move: ticking a default here takes it off the previous holder.
 *
 *  The milestone field lives here too: it only means something on the
 *  `opportunity` door, so it is drawn from the same door list. */

type DoorSets = { doors: MailDoor[]; defaultFor: MailDoor[] }

const toggle = (list: readonly MailDoor[], door: MailDoor): MailDoor[] =>
  list.includes(door) ? list.filter((d) => d !== door) : [...list, door]

/** In `MailDoor` order, whatever order they were ticked in. */
const ordered = (list: readonly MailDoor[]): MailDoor[] =>
  MailDoor.options.filter((door) => list.includes(door))

export function DoorsField({
  doors,
  defaultFor,
  errors,
  onChange,
}: DoorSets & {
  /** The server's refusals, keyed as `invalid()` names them. */
  errors: { doors?: string[]; defaultFor?: string[] }
  onChange: (next: DoorSets) => void
}) {
  const setDoors = (door: MailDoor) => {
    const next = ordered(toggle(doors, door))
    onChange({ doors: next, defaultFor: defaultFor.filter((d) => next.includes(d)) })
  }
  const setDefault = (door: MailDoor) =>
    onChange({ doors, defaultFor: ordered(toggle(defaultFor, door)) })

  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-3 p-4">
      <span className="text-[13px] font-semibold leading-5">Dùng ở</span>
      <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
        Mẫu chỉ hiện trong ô chọn khi thư mở từ những cửa được đánh dấu.
      </span>
      <div role="group" aria-label="Dùng ở" className="flex flex-wrap gap-x-6">
        {MailDoor.options.map((door) => (
          <Checkbox
            key={door}
            className="min-h-12"
            checked={doors.includes(door)}
            onChange={() => setDoors(door)}
            label={MAIL_DOOR_LABEL[door]}
          />
        ))}
      </div>
      <Problem lines={errors.doors} />
      {doors.length === 0 && !errors.doors?.length && (
        <span className="text-warning text-[11.5px] leading-[1.5]">
          Chọn ít nhất một cửa, không thì mẫu không hiện ở đâu.
        </span>
      )}

      {doors.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          <span className="text-muted-foreground text-[11px]">Là mẫu mặc định khi mở từ</span>
          <div role="group" aria-label="Mẫu mặc định" className="flex flex-wrap gap-x-6">
            {doors.map((door) => (
              <Checkbox
                key={door}
                className="min-h-12"
                checked={defaultFor.includes(door)}
                onChange={() => setDefault(door)}
                label={MAIL_DOOR_LABEL[door]}
              />
            ))}
          </div>
          <Problem lines={errors.defaultFor} />
          <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Mỗi cửa một mẫu mặc định. Chọn ở đây thì mẫu đang mặc định ở cửa đó thôi.
          </span>
        </div>
      )}

      {/* The quote door and its PDF are out of this turn (decision 1): the tag
          is kept so no migration is needed later, and the note says so. */}
      {doors.includes('quote') && (
        <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Cửa báo giá chưa mở — mẫu đánh dấu Báo giá sẽ hiện ở đó khi cửa này có.
        </span>
      )}
    </GlassCard>
  )
}

function Problem({ lines }: { lines?: string[] }) {
  if (!lines?.length) return null
  return (
    <span role="alert" className="text-destructive-foreground text-[11px] leading-[1.5]">
      {lines.join(' · ')}
    </span>
  )
}

/** Sentinel for "no milestone" — a segmented control cannot hold `null`. */
const NO_MILESTONE = 'none'

/** Small pill for a template that records a milestone when its letter leaves. */
export function MilestonePill({ milestone }: { milestone: MailTemplateMilestone }) {
  return <MetaPill tone="accent">{`Mốc ${OPPORTUNITY_STAGE_LABEL[milestone]}`}</MetaPill>
}

/** ADR 0069 §7. The caller renders it only while `opportunity` is a ticked
 *  door; the server refuses the pair otherwise (`errors.milestone`). */
export function MilestoneField({
  milestone,
  errors,
  onChange,
}: {
  milestone: MailTemplateMilestone | null
  errors?: string[]
  onChange: (next: MailTemplateMilestone | null) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-muted-foreground text-[11px]">Gắn mốc cơ hội</span>
      <SegmentedControl
        label="Gắn mốc cơ hội"
        hideLabel
        value={milestone ?? NO_MILESTONE}
        onChange={(value) => onChange(value === 'sample' || value === 'quotation' ? value : null)}
        options={[
          { value: NO_MILESTONE, label: 'Không gắn' },
          { value: 'sample', label: OPPORTUNITY_STAGE_LABEL.sample },
          { value: 'quotation', label: OPPORTUNITY_STAGE_LABEL.quotation },
        ]}
      />
      {errors?.length ? (
        <Problem lines={errors} />
      ) : (
        <span className="text-muted-foreground text-[11px] leading-[1.5]">
          Thư dùng mẫu này rời hệ thống từ một cơ hội thì máy ghi mốc này cho cơ hội.
        </span>
      )}
    </div>
  )
}
