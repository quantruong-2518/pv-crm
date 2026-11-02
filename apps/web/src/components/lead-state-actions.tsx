import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Drawer, Timer } from '@pv/ui'
import { LEAD_STOP_REASON_OTHER, type LeadProfile } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n, type Lang } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import { MeetingsCancelNote } from '@/components/meetings-cancel-note'
import { RecontactField } from '@/components/recontact-field'
import { RECONTACT_DEFAULT, recontactOnOf } from '@/components/recontact-pick'
import { StopReasonField } from '@/components/stop-reason-field'
import { StepFooter } from '@/components/step-footer'
import { LabelPicker } from '@/components/lead-labels'
import { useNurtureLead } from '@/data/lead-exit'
import { useEndLeadHold } from '@/data/holds'
import { sameLabels, useSetLeadLabels } from '@/data/lead-labels'
import { meetingsCancelled } from '@/data/meetings'
import { leadStateLabel } from '@/data/sales-labels-i18n'

const pool = (to: Lang) => leadStateLabel('nurturing', to)
const MOVE_LABEL = message(
  `Chuyển vào ${pool('vi')}`,
  `Move to ${pool('en')}`,
  `${pool('ko')}(으)로 이동`,
)
const movedMessage = (code: string) =>
  message(
    `Đã chuyển ${code} vào ${pool('vi')}.`,
    `Moved ${code} to ${pool('en')}.`,
    `${code}을(를) ${pool('ko')}(으)로 이동했습니다.`,
  )
const HINT_READY = message(
  'Ghi ngay, không cần duyệt.',
  'Saved right away, no approval needed.',
  '승인 없이 바로 저장됩니다.',
)
const HINT_DATE = message(
  'Chọn ngày liên hệ lại.',
  'Choose a recontact date.',
  '재연락 날짜를 선택하세요.',
)
const HINT_REASON = message('Chọn lý do.', 'Choose a reason.', '사유를 선택하세요.')
const POOL_NOTE = message(
  'Lead về kho chung, ai cũng nhận lại được.',
  'The lead returns to the shared pool and anyone can claim it.',
  '리드가 공용 목록으로 돌아가며 누구나 다시 받을 수 있습니다.',
)
const LABELS_UNSAVED = message(
  'Chưa lưu được nhãn.',
  'Labels were not saved.',
  '라벨을 저장하지 못했습니다.',
)

/** The drawer behind the one park door (ADR 0109) — opened from the lead
 *  profile's more menu and from a hold's strip. The door answers a 409 when
 *  the state moved under the reader; the drawer prints the server's own
 *  sentence and stays open. */

/** Into the nurturing pool, which has no holder. Reason and note come from the
 *  `EXIT_REASON` catalogue (ADR 0070, `StopReasonField`). A held lead goes
 *  through `hold/end` instead, which parks it the same way. Labels ride a
 *  second write once the lead is parked — the park body has none. */
export function NurtureDialog({
  profile,
  open,
  onClose,
}: {
  profile: LeadProfile
  open: boolean
  onClose: () => void
}) {
  const client = useQueryClient()
  const { t } = useI18n()
  const [reasonKey, setReasonKey] = useState('')
  const [note, setNote] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [recontact, setRecontact] = useState(RECONTACT_DEFAULT)
  const nurture = useNurtureLead(profile.code)
  const endHold = useEndLeadHold(profile.code)
  const saveLabels = useSetLeadLabels(profile.code)
  const held = profile.hold !== null
  const door = held ? endHold : nurture
  const { reset } = nurture
  const { reset: resetEnd } = endHold
  const current = profile.labels.map((l) => l.id)
  const seedLabels = current.join(',')

  useEffect(() => {
    if (open) {
      setReasonKey('')
      setNote('')
      setRecontact(RECONTACT_DEFAULT)
      setLabels(seedLabels === '' ? [] : seedLabels.split(','))
      reset()
      resetEnd()
    }
  }, [open, reset, resetEnd, seedLabels])

  const recontactOn = recontactOnOf(recontact)
  const reasoned = reasonKey !== '' && (reasonKey !== LEAD_STOP_REASON_OTHER || note.trim() !== '')
  const ready = reasoned && recontactOn !== undefined
  const moveLabel = t(MOVE_LABEL)
  const parked = () => {
    meetingsCancelled(client)
    const moved = t(movedMessage(profile.code))
    if (sameLabels(labels, current)) return done(moved, onClose)
    saveLabels.mutate(
      { labelIds: labels },
      {
        onSuccess: () => done(moved, onClose),
        onError: (e) => {
          toastFail(`${moved} ${t(LABELS_UNSAVED)}`, userMessage(e))
          onClose()
        },
      },
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={moveLabel}
      subtitle={
        <>
          <span className="font-mono">{profile.code}</span> · {profile.company}. {t(POOL_NOTE)}
        </>
      }
      footer={
        <StepFooter
          error={door.error}
          pending={door.isPending || saveLabels.isPending}
          hint={ready ? t(HINT_READY) : reasoned ? t(HINT_DATE) : t(HINT_REASON)}
          onClose={onClose}
          confirm={{
            icon: Timer,
            label: moveLabel,
            disabled: !ready,
            onClick: () => {
              const trimmed = note.trim()
              const body = {
                reasonKey,
                ...(trimmed === '' ? {} : { note: trimmed }),
                recontactOn,
              }
              if (held) endHold.mutate({ to: 'waiting', ...body }, { onSuccess: parked })
              else nurture.mutate(body, { onSuccess: parked })
            },
          }}
        />
      }
    >
      <StopReasonField
        reasonKey={reasonKey}
        onReasonChange={setReasonKey}
        note={note}
        onNoteChange={setNote}
        notePlaceholder={t(
          message(
            'Khách hẹn quay lại khi nào, chờ điều gì…',
            'When the customer will return, what they are waiting for…',
            '고객이 언제 다시 연락할지, 무엇을 기다리는지…',
          ),
        )}
      />
      <div className="mt-6">
        <RecontactField value={recontact} onChange={setRecontact} disabled={door.isPending} />
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">
          {t(message('Nhãn nhóm chờ', 'Waiting-group labels', '대기 그룹 라벨'))}
        </span>
        <LabelPicker value={labels} onChange={setLabels} disabled={door.isPending} />
      </div>
      <div className="mt-6 empty:hidden">
        <MeetingsCancelNote enabled={open} subjects={[{ kind: 'lead', code: profile.code }]} />
      </div>
    </Drawer>
  )
}

function done(message: string, onClose: () => void) {
  toastDone(message)
  onClose()
}
