import { useEffect, useState } from 'react'
import { Bell, Check, Plus, RotateCcw } from '@pv/ui'
import { Input, Select, Textarea } from '@pv/ui'
import {
  ConditionSide,
  RecordChannel,
  type ContractDetailRow,
  type InstallmentRow,
} from '@pv/contracts'
import { useSession } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { dmy } from '@/lib/date'
import {
  momentOfDay,
  PAY_TEXT_MAX,
  useAddCondition,
  useAddReminder,
  useRecordPaid,
  useUndoPaid,
} from '@/data/contracts-write'
import { CONDITION_SIDE_LABEL, RECORD_CHANNEL_LABEL } from '@/data/contracts'
import { vnToday } from '@/data/opportunities'
import { vnDayOf } from '@/data/quotations-write'
import { Field } from '@/components/ops-fields'
import { compactMoney } from '@/components/deal-money/money'
import { FormModal } from './form-modal'

type DialogProps = {
  contract: ContractDetailRow
  installment: InstallmentRow
  open: boolean
  onClose: () => void
}

const subtitleOf = ({ contract, installment }: Pick<DialogProps, 'contract' | 'installment'>) => (
  <>
    <span className="font-mono">{contract.code}</span> · {installment.label} ·{' '}
    {compactMoney(installment.amount, contract.currency)}
  </>
)

export function PaidDialog(props: DialogProps) {
  const { contract, installment, open, onClose } = props
  const [day, setDay] = useState(vnToday)
  const record = useRecordPaid(contract.code)
  const min = vnDayOf(contract.signedAt)
  const max = vnToday()
  const range = `Từ ${dmy(min)} đến hôm nay.`

  useEffect(() => {
    if (open) setDay(vnToday())
  }, [open])

  const blocker = day === '' ? 'Chọn ngày thu.' : day < min || day > max ? range : ''

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Ghi đã thu"
      subtitle={subtitleOf(props)}
      line={blocker}
      error={record.error}
      busy={record.isPending}
      busyLabel="Đang ghi…"
      submitLabel="Ghi đã thu"
      icon={Check}
      ready={blocker === ''}
      onSubmit={() =>
        record.mutate(
          { no: installment.no, body: { paidAt: momentOfDay(day) } },
          {
            onSuccess: () => {
              toastDone(`Đã ghi thu ${installment.label}.`)
              onClose()
            },
          },
        )
      }
    >
      <Field label="Ngày thu" required hint={range}>
        <Input
          type="date"
          aria-label="Ngày thu"
          className="pointer-coarse:h-12"
          value={day}
          min={min}
          max={max}
          onChange={(e) => setDay(e.target.value)}
        />
      </Field>
    </FormModal>
  )
}

export function UndoPaidDialog(props: DialogProps) {
  const { contract, installment, open, onClose } = props
  const undo = useUndoPaid(contract.code)

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Hoàn tác đã thu"
      subtitle={subtitleOf(props)}
      error={undo.error}
      busy={undo.isPending}
      busyLabel="Đang hoàn tác…"
      submitLabel="Hoàn tác đã thu"
      icon={RotateCcw}
      ready
      onSubmit={() =>
        undo.mutate(
          { no: installment.no },
          {
            onSuccess: () => {
              toastDone(`Đã hoàn tác thu ${installment.label}.`)
              onClose()
            },
          },
        )
      }
    >
      <p className="m-0 text-[13px] leading-[1.6]">Đợt trở lại trạng thái chưa thu.</p>
    </FormModal>
  )
}

const CHANNEL_OPTIONS = [
  { value: '', label: 'Chọn kênh…' },
  ...RecordChannel.options.map((c) => ({ value: c, label: RECORD_CHANNEL_LABEL[c] })),
]

export function ReminderDialog(props: DialogProps) {
  const { contract, installment, open, onClose } = props
  const [channel, setChannel] = useState('')
  const [what, setWhat] = useState('')
  const [detail, setDetail] = useState('')
  const add = useAddReminder(contract.code)
  const picked = RecordChannel.safeParse(channel)

  useEffect(() => {
    if (!open) return
    setChannel('')
    setWhat('')
    setDetail('')
  }, [open])

  const blocker = !picked.success
    ? 'Chọn kênh nhắc.'
    : what.trim() === ''
      ? 'Nhập nội dung đã nhắc.'
      : detail.trim() === ''
        ? 'Nhập kết quả.'
        : ''

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Ghi lần nhắc"
      subtitle={subtitleOf(props)}
      line={blocker}
      error={add.error}
      busy={add.isPending}
      busyLabel="Đang ghi…"
      submitLabel="Ghi lần nhắc"
      icon={Bell}
      ready={blocker === '' && picked.success}
      onSubmit={() => {
        if (!picked.success) return
        add.mutate(
          {
            no: installment.no,
            body: { channel: picked.data, what: what.trim(), detail: detail.trim() },
          },
          {
            onSuccess: () => {
              toastDone('Đã ghi lần nhắc.')
              onClose()
            },
          },
        )
      }}
    >
      <Field label="Kênh nhắc" required plain>
        <Select
          label="Kênh nhắc"
          hideLabel
          size="lg"
          value={channel}
          onChange={setChannel}
          options={CHANNEL_OPTIONS}
          className="w-full"
        />
      </Field>
      <Field label="Nội dung đã nhắc" required>
        <Textarea
          autoGrow
          rows={2}
          value={what}
          aria-label="Nội dung đã nhắc"
          maxLength={PAY_TEXT_MAX.what}
          onChange={(e) => setWhat(e.target.value)}
        />
      </Field>
      <Field label="Kết quả" required>
        <Textarea
          autoGrow
          rows={2}
          value={detail}
          aria-label="Kết quả"
          maxLength={PAY_TEXT_MAX.detail}
          onChange={(e) => setDetail(e.target.value)}
        />
      </Field>
    </FormModal>
  )
}

const SIDE_OPTIONS = [
  { value: '', label: 'Chọn bên…' },
  ...ConditionSide.options.map((s) => ({ value: s, label: CONDITION_SIDE_LABEL[s] })),
]

export function ConditionDialog(props: DialogProps) {
  const { contract, installment, open, onClose } = props
  const me = useSession((st) => st.actor?.name ?? '')
  const [side, setSide] = useState('')
  const [what, setWhat] = useState('')
  const [day, setDay] = useState('')
  const [who, setWho] = useState(me)
  const add = useAddCondition(contract.code)
  const picked = ConditionSide.safeParse(side)

  useEffect(() => {
    if (!open) return
    setSide('')
    setWhat('')
    setDay('')
    setWho(me)
  }, [open, me])

  const blocker = !picked.success
    ? 'Chọn bên phải làm.'
    : what.trim() === ''
      ? 'Nhập việc cần làm.'
      : day === ''
        ? 'Chọn hạn.'
        : who.trim() === ''
          ? 'Nhập người phụ trách.'
          : ''

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Thêm điều kiện"
      subtitle={subtitleOf(props)}
      line={blocker}
      error={add.error}
      busy={add.isPending}
      busyLabel="Đang thêm…"
      submitLabel="Thêm điều kiện"
      icon={Plus}
      ready={blocker === '' && picked.success}
      onSubmit={() => {
        if (!picked.success) return
        add.mutate(
          {
            no: installment.no,
            body: {
              side: picked.data,
              what: what.trim(),
              due: momentOfDay(day),
              who: who.trim(),
            },
          },
          {
            onSuccess: () => {
              toastDone('Đã thêm điều kiện.')
              onClose()
            },
          },
        )
      }}
    >
      <Field label="Bên phải làm" required plain>
        <Select
          label="Bên phải làm"
          hideLabel
          size="lg"
          value={side}
          onChange={setSide}
          options={SIDE_OPTIONS}
          className="w-full"
        />
      </Field>
      <Field label="Việc cần làm" required>
        <Textarea
          autoGrow
          rows={2}
          value={what}
          aria-label="Việc cần làm"
          maxLength={PAY_TEXT_MAX.condition}
          onChange={(e) => setWhat(e.target.value)}
        />
      </Field>
      <Field label="Hạn" required>
        <Input
          type="date"
          aria-label="Hạn"
          className="pointer-coarse:h-12"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      </Field>
      <Field label="Người phụ trách" required>
        <Input
          aria-label="Người phụ trách"
          className="pointer-coarse:h-12"
          maxLength={PAY_TEXT_MAX.who}
          value={who}
          onChange={(e) => setWho(e.target.value)}
        />
      </Field>
    </FormModal>
  )
}
