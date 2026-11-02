import { useState } from 'react'
import { Button, CalendarClock, Icon, RotateCcw } from '@pv/ui'
import type { OpportunityProfileResponse } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import { useEndOpportunityHold } from '@/data/holds'
import { HoldDialog } from '@/components/hold-dialog'
import { HoldStrip } from '@/components/hold-strip'

/** The deal's side of a hold (ADR 0097 §3), the twin of `lead-hold.tsx`: the
 *  strip with its two ways out — resume, change the date — and the dialog the
 *  more menu opens. Giving up on a held deal is the stop door, which stays in
 *  the more menu and ends the hold itself. */

type Profile = OpportunityProfileResponse

function Caption({ op }: { op: Profile }) {
  return (
    <>
      <span className="font-mono">{op.code}</span> · {op.account}
    </>
  )
}

/** Opens a hold — from the floating bar's more menu. */
export function OpportunityHoldDialog({
  op,
  open,
  onClose,
}: {
  op: Profile
  open: boolean
  onClose: () => void
}) {
  return (
    <HoldDialog
      subjectType="opportunity"
      code={op.code}
      caption={<Caption op={op} />}
      hold={null}
      open={open}
      onClose={onClose}
    />
  )
}

/** No strip without an open hold. The buttons follow `acts.editDetails`: the
 *  same scoped `opportunity.edit` the hold doors need, and still open while
 *  held, unlike `acts.hold`, which shuts once a hold exists. */
export function OpportunityHoldStrip({ op }: { op: Profile }) {
  const { t } = useI18n()
  const [changing, setChanging] = useState(false)
  const end = useEndOpportunityHold(op.code)

  const resume = () =>
    end.mutate(
      { to: 'resume' },
      {
        onSuccess: () =>
          toastDone(
            t(
              message(
                `Đã bỏ tạm hoãn ${op.code}.`,
                `${op.code} is no longer on hold.`,
                `${op.code}의 보류를 해제했습니다.`,
              ),
            ),
          ),
        onError: (e) =>
          toastFail(
            t(
              message(
                'Không bỏ tạm hoãn được cơ hội.',
                'Could not take the opportunity off hold.',
                '기회의 보류를 해제하지 못했습니다.',
              ),
            ),
            userMessage(e),
          ),
      },
    )

  const actions = op.acts.editDetails.ok && (
    <>
      <Button size="md" className="pointer-coarse:h-12" disabled={end.isPending} onClick={resume}>
        <Icon icon={RotateCcw} size={16} />
        {t(message('Bỏ tạm hoãn', 'Take off hold', '보류 해제'))}
      </Button>
      <Button
        size="md"
        variant="ghost"
        className="pointer-coarse:h-12"
        onClick={() => setChanging(true)}
      >
        <Icon icon={CalendarClock} size={16} />
        {t(message('Đổi ngày hẹn', 'Change follow-up date', '재연락 날짜 변경'))}
      </Button>
    </>
  )

  return (
    <>
      {op.hold && <HoldStrip hold={op.hold} actions={actions} />}
      <HoldDialog
        subjectType="opportunity"
        code={op.code}
        caption={<Caption op={op} />}
        hold={op.hold}
        open={changing}
        onClose={() => setChanging(false)}
      />
    </>
  )
}
