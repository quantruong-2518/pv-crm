import { useState } from 'react'
import { Button, CalendarClock, Icon, RotateCcw, Timer } from '@pv/ui'
import { LEAD_STATE_LABEL, type LeadProfile } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { useEndLeadHold } from '@/data/holds'
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
 *  one that just ended the hold can finish its own save and close. A lead
 *  already in the waiting group returns there on resume, so it is not
 *  offered the second way. */
export function LeadHoldStrip({ lead, canWrite }: { lead: LeadProfile; canWrite: boolean }) {
  const [changing, setChanging] = useState(false)
  const [parking, setParking] = useState(false)
  const end = useEndLeadHold(lead.code)

  const resume = () =>
    end.mutate(
      { to: 'resume' },
      {
        onSuccess: () => toastDone(`Đã bỏ tạm hoãn ${lead.code}.`),
        onError: (e) => toastFail('Không bỏ tạm hoãn được lead.', userMessage(e)),
      },
    )

  const actions = canWrite && (
    <>
      <Button size="md" className="pointer-coarse:h-12" disabled={end.isPending} onClick={resume}>
        <Icon icon={RotateCcw} size={16} />
        Bỏ tạm hoãn
      </Button>
      {lead.state !== 'nurturing' && (
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => setParking(true)}
        >
          <Icon icon={Timer} size={16} />
          Chuyển sang {LEAD_STATE_LABEL.nurturing}
        </Button>
      )}
      <Button
        size="md"
        variant="ghost"
        className="pointer-coarse:h-12"
        onClick={() => setChanging(true)}
      >
        <Icon icon={CalendarClock} size={16} />
        Đổi ngày hẹn
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
