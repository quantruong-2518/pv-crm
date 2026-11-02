import { useState } from 'react'
import { Button, CalendarClock, Icon, RotateCcw, Timer } from '@pv/ui'
import type { LeadProfile } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { useCan } from '@/app/auth'
import { toastDone, toastFail } from '@/app/toast'
import { useEndLeadHold } from '@/data/holds'
import { leadStateLabel } from '@/data/sales-labels-i18n'
import { HoldDialog } from '@/components/hold-dialog'
import { HoldStrip } from '@/components/hold-strip'
import { NurtureDialog } from '@/components/lead-state-actions'

/** The lead's side of a hold (ADR 0097 §3): the strip with its three ways
 *  out — resume, into the waiting group, change the date — and the dialog
 *  that opens a hold from the profile's more menu. Each owns its drawers so
 *  the profile screen only places them. */

function Caption({ lead }: { lead: LeadProfile }) {
  return (
    <>
      <span className="font-mono">{lead.code}</span> · {lead.company}
    </>
  )
}

/** Opens a hold — from the profile's more menu. */
export function LeadHoldDialog({
  lead,
  open,
  onClose,
}: {
  lead: LeadProfile
  open: boolean
  onClose: () => void
}) {
  return (
    <HoldDialog
      subjectType="lead"
      code={lead.code}
      caption={<Caption lead={lead} />}
      hold={null}
      open={open}
      onClose={onClose}
    />
  )
}

/** No strip when the lead has no open hold; the drawers stay mounted so the
 *  one that just ended the hold can finish its own save and close. The park
 *  way out needs `lead.disqualify` besides the hold's own permission. */
export function LeadHoldStrip({ lead, canWrite }: { lead: LeadProfile; canWrite: boolean }) {
  const { t } = useI18n()
  const [changing, setChanging] = useState(false)
  const [parking, setParking] = useState(false)
  const end = useEndLeadHold(lead.code)
  const canPark = useCan('lead.disqualify')

  const resume = () =>
    end.mutate(
      { to: 'resume' },
      {
        onSuccess: () =>
          toastDone(
            t(
              message(
                `Đã bỏ tạm hoãn ${lead.code}.`,
                `Released the hold on ${lead.code}.`,
                `${lead.code}의 보류를 해제했습니다.`,
              ),
            ),
          ),
        onError: (e) =>
          toastFail(
            t(
              message(
                'Không bỏ tạm hoãn được lead.',
                'Could not release the hold on the lead.',
                '리드의 보류를 해제하지 못했습니다.',
              ),
            ),
            userMessage(e),
          ),
      },
    )

  const actions = canWrite && (
    <>
      <Button size="md" className="pointer-coarse:h-12" disabled={end.isPending} onClick={resume}>
        <Icon icon={RotateCcw} size={16} />
        {t(message('Bỏ tạm hoãn', 'Release hold', '보류 해제'))}
      </Button>
      {canPark && (
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => setParking(true)}
        >
          <Icon icon={Timer} size={16} />
          {t(
            message(
              `Chuyển vào ${leadStateLabel('nurturing', 'vi')}`,
              `Move to ${leadStateLabel('nurturing', 'en')}`,
              `${leadStateLabel('nurturing', 'ko')}(으)로 이동`,
            ),
          )}
        </Button>
      )}
      <Button
        size="md"
        variant="ghost"
        className="pointer-coarse:h-12"
        onClick={() => setChanging(true)}
      >
        <Icon icon={CalendarClock} size={16} />
        {t(message('Đổi ngày hẹn', 'Change date', '날짜 변경'))}
      </Button>
    </>
  )

  return (
    <>
      {lead.hold && <HoldStrip hold={lead.hold} actions={actions} />}
      <HoldDialog
        subjectType="lead"
        code={lead.code}
        caption={<Caption lead={lead} />}
        hold={lead.hold}
        open={changing}
        onClose={() => setChanging(false)}
      />
      <NurtureDialog profile={lead} open={parking} onClose={() => setParking(false)} />
    </>
  )
}
