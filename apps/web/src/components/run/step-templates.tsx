import { Button, Check, MetaPill } from '@pv/ui'
import type { StateAddress, StepOptionsResponse, StepTemplateOption } from '@pv/contracts'
import { ChoiceChip } from '@/components/comm-bits'
import { isApiError, userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { stateLabelOf } from '@/data/step-frame'
import { kpiRoleText } from '@/data/kpi-i18n'

/** The company frame as a step form offers it (ADR 0080) — shared by the step
 *  card and the comm close-out so the two never draw one state's templates two
 *  ways. Display only: each form keeps its own draft and decides what a pick
 *  fills. */

/** A state that takes listed steps only and lists none: the form has nothing
 *  to offer, and only the department head can change that. */
export function EmptyFrameNote({ address }: { address: StateAddress }) {
  const { t, lang } = useI18n()
  const state = stateLabelOf(address)
  const head = kpiRoleText('head-of-sales', lang)
  return (
    <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
      {t(
        message(
          `“${state}” chưa có bước nào. Báo ${head}.`,
          `“${state}” has no steps yet. Tell the ${head}.`,
          `“${state}”에 아직 단계가 없습니다. ${head}에게 알려 주세요.`,
        ),
      )}
    </p>
  )
}

/** An unread frame is not an empty one: say so and offer the re-read, rather
 *  than a free box the server may refuse or a skeleton that never ends. */
export function FrameUnread({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p
        role="alert"
        className="text-destructive-foreground m-0 min-w-0 text-[12.5px] leading-[1.6]"
      >
        {t(
          message(
            'Không đọc được danh sách bước tiếp theo.',
            'Could not load the list of next steps.',
            '다음 단계 목록을 불러오지 못했습니다.',
          ),
        )}{' '}
        {isApiError(error)
          ? userMessage(error)
          : t(message('Thử lại.', 'Try again.', '다시 시도하세요.'))}
      </p>
      <Button
        type="button"
        size="md"
        variant="secondary"
        className="pointer-coarse:h-12"
        onClick={onRetry}
      >
        {t(message('Thử lại', 'Retry', '다시 시도'))}
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
  const { t } = useI18n()
  if (options.templates.length === 0) return null
  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label={t(message('Bước trong khung', 'Steps in the frame', '프레임 내 단계'))}
    >
      {options.templates.map((tpl) => {
        const pressed = tpl.id === pickedId
        return (
          <ChoiceChip
            key={tpl.id}
            pressed={pressed}
            icon={pressed ? Check : undefined}
            onClick={() => onPick(pressed ? null : tpl)}
          >
            {tpl.name}
          </ChoiceChip>
        )
      })}
    </div>
  )
}

/** The step of a listed-only state: read, not typed — the server stores the
 *  template's own words and kind there and refuses anything else. */
export function PickedStepLine({ picked }: { picked: StepTemplateOption | undefined }) {
  const { t } = useI18n()
  if (!picked) {
    return (
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        {t(
          message(
            'Chọn một bước trong danh sách.',
            'Choose a step from the list.',
            '목록에서 단계를 선택하세요.',
          ),
        )}
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
