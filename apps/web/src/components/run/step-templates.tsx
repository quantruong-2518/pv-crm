import { Button, Check, MetaPill } from '@pv/ui'
import type { StateAddress, StepOptionsResponse, StepTemplateOption } from '@pv/contracts'
import { ChoiceChip } from '@/components/comm-bits'
import { isApiError, userMessage } from '@/app/api'
import { stateLabelOf } from '@/data/step-frame'
import { ROLE_LABEL } from '@/data/users'

/** The company frame as a step form offers it (ADR 0080) — shared by the step
 *  card and the comm close-out so the two never draw one state's templates two
 *  ways. Display only: each form keeps its own draft and decides what a pick
 *  fills. */

/** A state that takes listed steps only and lists none: the form has nothing
 *  to offer, and only the department head can change that. */
export function EmptyFrameNote({ address }: { address: StateAddress }) {
  return (
    <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
      “{stateLabelOf(address)}” chưa có bước nào trong khung — báo {ROLE_LABEL['head-of-sales']}.
    </p>
  )
}

/** An unread frame is not an empty one: say so and offer the re-read, rather
 *  than a free box the server may refuse or a skeleton that never ends. */
export function FrameUnread({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="alert" className="text-warning m-0 min-w-0 text-[12.5px] leading-[1.6]">
        Không đọc được danh sách bước tiếp theo.{' '}
        {isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}
      </p>
      <Button size="md" variant="secondary" className="pointer-coarse:h-12" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  )
}

/** Pressing the chosen chip again hands back `null`: the pick is cleared. */
export function TemplateChips({
  options,
  pickedId,
  onPick,
}: {
  options: StepOptionsResponse
  pickedId: string | undefined
  onPick: (template: StepTemplateOption | null) => void
}) {
  if (options.templates.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Bước trong khung">
      {options.templates.map((t) => {
        const pressed = t.id === pickedId
        return (
          <ChoiceChip
            key={t.id}
            pressed={pressed}
            icon={pressed ? Check : undefined}
            onClick={() => onPick(pressed ? null : t)}
          >
            {t.name}
          </ChoiceChip>
        )
      })}
    </div>
  )
}

/** The step of a listed-only state: read, not typed — the server stores the
 *  template's own words and kind there and refuses anything else. */
export function PickedStepLine({ picked }: { picked: StepTemplateOption | undefined }) {
  if (!picked) {
    return (
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        Chọn một bước trong danh sách.
      </p>
    )
  }
  return (
    <p className="m-0 flex min-w-0 flex-wrap items-center gap-2">
      <MetaPill>{picked.kind.name}</MetaPill>
      <span className="text-foreground min-w-0 break-words text-[13px] leading-[1.6]">
        {picked.name}
      </span>
    </p>
  )
}
