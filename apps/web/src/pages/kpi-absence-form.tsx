import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer, Input, Save, Select } from '@pv/ui'
import { KpiAbsenceCreate, vnDayOf, type KpiAbsence } from '@pv/contracts'
import { toastDone } from '@/app/toast'
import { StepFooter } from '@/components/step-footer'
import { kpiStandInsQuery, useKpiAbsenceWrite } from '@/data/kpi-absence'
import { message, useI18n } from '@/app/i18n'

/** Declare an absence, or move the end of one (ADR 0117). With `editing` only the
 *  end day is open: a running absence cannot start earlier or later (default 4).
 *  `actorId` is set when a target setter declares for someone else.
 *
 *  The form checks what the contract's refine can know; today, overlap and who is
 *  eligible are the server's, and its refusal prints in the footer. */

const NONE = ''
const LABEL = 'text-muted-foreground text-[11px]'

/** The contract's own Vietnamese sentences, matched by their text to give them a translation. */
const KNOWN = [
  message('Ngày là bắt buộc.', 'A date is required.', '날짜를 입력하세요.'),
  message(
    'Ngày không đúng định dạng.',
    'Enter the date in the correct format.',
    '날짜 형식이 올바르지 않습니다.',
  ),
  message('Ngày không có trên lịch.', 'That date does not exist.', '달력에 없는 날짜입니다.'),
  message('Chọn người làm thay.', 'Choose a stand-in.', '대행자를 선택하세요.'),
  message(
    'Ngày kết thúc không được trước ngày bắt đầu.',
    'The end date must be on or after the start date.',
    '종료일은 시작일보다 빠를 수 없습니다.',
  ),
  message(
    'Chọn người khác làm thay.',
    'Choose someone else as the stand-in.',
    '다른 사람을 대행자로 선택하세요.',
  ),
]

/** The first sentence the contract has against the form, or the missing field. */
function hintOf(
  fromDay: string,
  toDay: string,
  standInId: string,
  t: ReturnType<typeof useI18n>['t'],
  actorId?: string,
): string {
  if (fromDay === '' || toDay === '')
    return t(
      message(
        'Chọn ngày bắt đầu và ngày kết thúc.',
        'Choose a start and end date.',
        '시작일과 종료일을 선택하세요.',
      ),
    )
  const parsed = KpiAbsenceCreate.safeParse({ actorId, fromDay, toDay, standInId })
  if (parsed.success) return ''
  const issue = parsed.error.issues[0]?.message ?? ''
  const known = KNOWN.find((copy) => copy.vi === issue)
  return known ? t(known) : issue
}

export function AbsenceForm({
  open,
  onClose,
  actorId,
  who,
  editing,
}: {
  open: boolean
  onClose: () => void
  /** Someone else's absence, declared by a target setter. */
  actorId?: string
  /** That person's name, for the subtitle. */
  who?: string
  editing: KpiAbsence | null
}) {
  const { t } = useI18n()
  const [fromDay, setFromDay] = useState('')
  const [toDay, setToDay] = useState('')
  const [standInId, setStandInId] = useState(NONE)
  const write = useKpiAbsenceWrite()
  const { reset } = write
  const candidates = useQuery(kpiStandInsQuery(actorId, open && editing === null))
  const today = vnDayOf(new Date())

  const seedTo = editing?.toDay ?? ''
  useEffect(() => {
    if (!open) return
    setFromDay('')
    setToDay(seedTo)
    setStandInId(NONE)
    reset()
  }, [open, seedTo, reset])

  const options = candidates.data?.candidates ?? []
  const nobody = candidates.isSuccess && options.length === 0
  const hint = editing
    ? hintOf(editing.fromDay, toDay, editing.standIn.actorId, t)
    : nobody
      ? t(
          message(
            'Không có ai làm thay được.',
            'No eligible stand-in is available.',
            '대행 가능한 사람이 없습니다.',
          ),
        )
      : hintOf(fromDay, toDay, standInId, t, actorId)
  const unchanged = editing !== null && toDay === editing.toDay
  const finish = (message: string) => {
    toastDone(message)
    onClose()
  }
  const submit = () =>
    editing
      ? write.mutate(
          { kind: 'end', absenceId: editing.id, toDay },
          {
            onSuccess: () =>
              finish(
                t(message('Đã đổi ngày kết thúc.', 'End date updated.', '종료일을 변경했습니다.')),
              ),
          },
        )
      : write.mutate(
          { kind: 'declare', body: { actorId, fromDay, toDay, standInId } },
          {
            onSuccess: () =>
              finish(t(message('Đã khai vắng.', 'Absence declared.', '부재를 등록했습니다.'))),
          },
        )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        editing
          ? t(message('Sửa ngày kết thúc', 'Edit end date', '종료일 수정'))
          : t(message('Khai vắng', 'Declare absence', '부재 등록'))
      }
      subtitle={who}
      footer={
        <StepFooter
          error={write.error}
          pending={write.isPending}
          hint={hint}
          onClose={onClose}
          confirm={{
            icon: Save,
            label: t(message('Lưu', 'Save', '저장')),
            disabled: hint !== '' || unchanged,
            onClick: submit,
          }}
        />
      }
    >
      <div className="flex flex-col gap-6">
        {!editing && (
          <label className="flex flex-col gap-2">
            <span className={LABEL}>{t(message('Từ ngày', 'From', '시작일'))}</span>
            <Input
              type="date"
              value={fromDay}
              min={today}
              aria-required
              className="h-12"
              onChange={(e) => setFromDay(e.target.value)}
            />
          </label>
        )}
        <label className="flex flex-col gap-2">
          <span className={LABEL}>{t(message('Đến ngày', 'Through', '종료일'))}</span>
          <Input
            type="date"
            value={toDay}
            min={editing ? (editing.fromDay > today ? editing.fromDay : today) : fromDay || today}
            aria-required
            className="h-12"
            onChange={(e) => setToDay(e.target.value)}
          />
        </label>
        {!editing && (
          <Select
            label={t(message('Người làm thay', 'Stand-in', '대행자'))}
            size="lg"
            required
            value={standInId}
            onChange={setStandInId}
            options={[
              {
                value: NONE,
                label: t(message('Chọn người làm thay', 'Choose a stand-in', '대행자 선택')),
              },
              ...options.map((c) => ({ value: c.actorId, label: c.name })),
            ]}
          />
        )}
      </div>
    </Drawer>
  )
}
