import { useState } from 'react'
import { Bell, Check, Plus, RotateCcw } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import type { ContractDetailRow, InstallmentRow, OpportunityMoneyContract } from '@pv/contracts'
import { useSession } from '@/app/auth'
import { installmentDoorsOf } from './installment-doors'
import { ConditionDialog, PaidDialog, ReminderDialog, UndoPaidDialog } from './installment-dialogs'

type Dialog = 'paid' | 'undo' | 'reminder' | 'condition' | null

/** The action row of one instalment, each button shown only to whoever the
 *  server lets through — a locked action is absent, not greyed out. */
export function InstallmentActions({
  contract,
  installment,
  can,
}: {
  contract: ContractDetailRow
  installment: InstallmentRow
  can: OpportunityMoneyContract['can']
}) {
  const me = useSession((st) => st.actor?.id)
  const [dialog, setDialog] = useState<Dialog>(null)
  const doors = installmentDoorsOf(installment, can, me)
  const shared = { contract, installment, onClose: () => setDialog(null) }

  return (
    <div className="flex flex-wrap gap-2">
      {doors.pay && (
        <Button size="md" className="pointer-coarse:h-12" onClick={() => setDialog('paid')}>
          <Icon icon={Check} size={16} />
          Ghi đã thu
        </Button>
      )}
      {doors.undo && (
        <Button
          size="md"
          variant="secondary"
          className="pointer-coarse:h-12"
          onClick={() => setDialog('undo')}
        >
          <Icon icon={RotateCcw} size={16} />
          Hoàn tác đã thu
        </Button>
      )}
      {doors.remind && (
        <Button
          size="md"
          variant="secondary"
          className="pointer-coarse:h-12"
          onClick={() => setDialog('reminder')}
        >
          <Icon icon={Bell} size={16} />
          Ghi lần nhắc
        </Button>
      )}
      {doors.condition && (
        <Button
          size="md"
          variant="secondary"
          className="pointer-coarse:h-12"
          onClick={() => setDialog('condition')}
        >
          <Icon icon={Plus} size={16} />
          Thêm điều kiện
        </Button>
      )}

      <PaidDialog {...shared} open={dialog === 'paid'} />
      <UndoPaidDialog {...shared} open={dialog === 'undo'} />
      <ReminderDialog {...shared} open={dialog === 'reminder'} />
      <ConditionDialog {...shared} open={dialog === 'condition'} />
    </div>
  )
}
