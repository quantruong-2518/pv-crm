import { useEffect, useState } from 'react'
import { Plus, RotateCcw } from '@pv/ui'
import { Input, Select, Textarea } from '@pv/ui'
import { ConditionSide, type ContractDetailRow, type InstallmentRow } from '@pv/contracts'
import { useSession } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { momentOfDay, PAY_TEXT_MAX, useAddCondition, useUndoPaid } from '@/data/contracts-write'
import { conditionSideText } from '@/data/installment-copy'
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
  const { t } = useI18n()
  const undo = useUndoPaid(contract.code)

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t(message('Hoàn tác đã thu', 'Undo collection', '수금 취소'))}
      subtitle={subtitleOf(props)}
      error={undo.error}
      busy={undo.isPending}
      busyLabel={t(message('Đang hoàn tác…', 'Undoing…', '취소 중…'))}
      submitLabel={t(message('Hoàn tác đã thu', 'Undo collection', '수금 취소'))}
      icon={RotateCcw}
      ready
      onSubmit={() =>
        undo.mutate(
          { no: installment.no },
          {
            onSuccess: () => {
              toastDone(
                t(
                  message(
                    `Đã hoàn tác thu ${installment.label}.`,
                    `Collection of ${installment.label} undone.`,
                    `${installment.label} 수금을 취소했습니다.`,
                  ),
                ),
              )
              onClose()
            },
          },
        )
      }
    >
      <p className="m-0 text-[13px] leading-[1.6]">
        {t(
          message(
            'Đợt trở lại trạng thái chưa thu.',
            'The installment goes back to not collected.',
            '이 납부 회차는 미수금 상태로 돌아갑니다.',
          ),
        )}
      </p>
    </FormModal>
  )
}

export function ConditionDialog(props: DialogProps) {
  const { contract, installment, open, onClose } = props
  const { t, lang } = useI18n()
  const sideOptions = [
    { value: '', label: t(message('Chọn bên…', 'Choose a side…', '측 선택…')) },
    ...ConditionSide.options.map((s) => ({ value: s, label: conditionSideText(s, lang) })),
  ]
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
    ? t(message('Chọn bên phải làm.', 'Choose who has to act.', '담당 측을 선택해 주세요.'))
    : what.trim() === ''
      ? t(message('Nhập việc cần làm.', 'Enter the task.', '할 일을 입력해 주세요.'))
      : day === ''
        ? t(message('Chọn hạn.', 'Choose a due date.', '기한을 선택해 주세요.'))
        : who.trim() === ''
          ? t(message('Nhập người phụ trách.', 'Enter the owner.', '담당자를 입력해 주세요.'))
          : ''

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t(message('Thêm điều kiện', 'Add condition', '조건 추가'))}
      subtitle={subtitleOf(props)}
      line={blocker}
      error={add.error}
      busy={add.isPending}
      busyLabel={t(message('Đang thêm…', 'Adding…', '추가 중…'))}
      submitLabel={t(message('Thêm điều kiện', 'Add condition', '조건 추가'))}
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
              toastDone(
                t(message('Đã thêm điều kiện.', 'Condition added.', '조건을 추가했습니다.')),
              )
              onClose()
            },
          },
        )
      }}
    >
      <Field label={t(message('Bên phải làm', 'Responsible side', '담당 측'))} required plain>
        <Select
          label={t(message('Bên phải làm', 'Responsible side', '담당 측'))}
          hideLabel
          size="lg"
          value={side}
          onChange={setSide}
          options={sideOptions}
          className="w-full"
        />
      </Field>
      <Field label={t(message('Việc cần làm', 'Task', '할 일'))} required>
        <Textarea
          autoGrow
          rows={2}
          value={what}
          aria-label={t(message('Việc cần làm', 'Task', '할 일'))}
          maxLength={PAY_TEXT_MAX.condition}
          onChange={(e) => setWhat(e.target.value)}
        />
      </Field>
      <Field label={t(message('Hạn', 'Due', '기한'))} required>
        <Input
          type="date"
          aria-label={t(message('Hạn', 'Due', '기한'))}
          className="pointer-coarse:h-12"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      </Field>
      <Field label={t(message('Người phụ trách', 'Owner', '담당자'))} required>
        <Input
          aria-label={t(message('Người phụ trách', 'Owner', '담당자'))}
          className="pointer-coarse:h-12"
          maxLength={PAY_TEXT_MAX.who}
          value={who}
          onChange={(e) => setWho(e.target.value)}
        />
      </Field>
    </FormModal>
  )
}
