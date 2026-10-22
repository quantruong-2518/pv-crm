import { useState } from 'react'
import { Button, Check, Icon, Input, RotateCcw, SegmentedControl } from '@pv/ui'
import type { ContractDetailRow, InstallmentRow } from '@pv/contracts'
import { userMessage, type ApiError } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { dm } from '@/lib/date'
import { momentOfDay, useRecordPaid } from '@/data/contracts-write'
import { RecordCard } from '@/components/record/record-card'
import { UndoPaidDialog } from './installment-dialogs'
import { useLateReason } from './use-late-reason'
import { usePayDay, type DayPick } from './use-pay-day'

type CollectProps = {
  contract: ContractDetailRow
  installment: InstallmentRow
  canPay: boolean
  canUndo: boolean
  leads: boolean
  late: boolean
  onPaid?: () => void
}

/** The collection card of one installment: the day to record and the one
 *  button while unpaid, the fact once paid with its undo. Both doors are the
 *  contract's own (`can.recordPayment`, undo only for whoever recorded) and
 *  an absent door is an absent button. `leads` is true when another primary
 *  already stands on the screen, so this one steps down to secondary. `late`
 *  = overdue, so collecting asks for the reason first. */
export function CollectCard(props: CollectProps) {
  if (props.installment.paidAt === undefined && !props.canPay) return null
  return (
    <RecordCard title="Thu tiền">
      <CollectBody {...props} />
    </RecordCard>
  )
}

/** The card's content alone, for the installment modal's own section. */
export function CollectBody({
  contract,
  installment,
  canPay,
  canUndo,
  leads,
  late,
  onPaid,
}: CollectProps) {
  const pay = usePayDay(true, contract.signedAt)
  const record = useRecordPaid(contract.code)
  const [undoing, setUndoing] = useState(false)
  const paid = installment.paidAt !== undefined
  const reason = useLateReason(contract.code, installment.no, late && canPay && !paid)
  const blocker = pay.blocker || reason.blocker
  const failed = (e: ApiError) => toastFail('Không ghi thu được.', userMessage(e))

  return (
    <>
      {paid ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-success tnum m-0 min-w-0 flex-1 text-[13px]">
            Đã thu {dm(installment.paidAt ?? '')}
            {installment.paidBy && ` · ${installment.paidBy.name} ghi nhận`}
          </p>
          {canUndo && (
            <Button
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12"
              onClick={() => setUndoing(true)}
            >
              <Icon icon={RotateCcw} size={16} />
              Hoàn tác đã thu
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-4">
          <SegmentedControl
            label="Ngày nhận tiền"
            tone="quiet"
            value={pay.pick}
            onChange={(v) => pay.setPick(v as DayPick)}
            options={[
              { value: 'today', label: 'Hôm nay' },
              ...(pay.yesterdayOk ? [{ value: 'yesterday', label: 'Hôm qua' }] : []),
              { value: 'other', label: 'Chọn ngày…' },
            ]}
          />
          {pay.pick === 'other' && (
            <Input
              type="date"
              aria-label="Ngày nhận tiền"
              className="pointer-coarse:h-12 max-w-[200px]"
              value={pay.other}
              min={pay.min}
              max={pay.today}
              onChange={(e) => pay.setOther(e.target.value)}
            />
          )}
          {reason.field && <div className="w-full">{reason.field}</div>}
          {blocker !== '' && (
            <p className="text-muted-foreground m-0 text-[12px] leading-[1.5]" aria-live="polite">
              {blocker}
            </p>
          )}
          <Button
            size="lg"
            variant={leads ? 'secondary' : 'default'}
            disabled={record.isPending || reason.busy || blocker !== ''}
            onClick={() =>
              reason.submit(
                () =>
                  record.mutate(
                    { no: installment.no, body: { paidAt: momentOfDay(pay.day) } },
                    {
                      onSuccess: () => {
                        toastDone(`Đã ghi thu ${installment.label}.`)
                        onPaid?.()
                      },
                      onError: failed,
                    },
                  ),
                failed,
              )
            }
          >
            <Icon icon={Check} size={16} />
            Ghi đã thu
          </Button>
        </div>
      )}
      <UndoPaidDialog
        contract={contract}
        installment={installment}
        open={undoing}
        onClose={() => setUndoing(false)}
      />
    </>
  )
}
