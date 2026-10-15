import { useEffect, useState } from 'react'
import { Plus, RotateCcw } from '@pv/ui'
import { Input, Select, Textarea } from '@pv/ui'
import { ConditionSide, type ContractDetailRow, type InstallmentRow } from '@pv/contracts'
import { useSession } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { momentOfDay, PAY_TEXT_MAX, useAddCondition, useUndoPaid } from '@/data/contracts-write'
import { CONDITION_SIDE_LABEL } from '@/data/contracts'
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
