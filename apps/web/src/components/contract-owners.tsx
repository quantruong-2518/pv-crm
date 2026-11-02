import { useState } from 'react'
import { message, useI18n } from '@/app/i18n'
import type { Contract } from '@/data/contracts'
import { ChangeCollectorDrawer } from './contract-collector-change'
import { collectorDoorKey } from './run/owner-doors'
import { RunOwners } from './run/run-owners'

/** A contract's people in the rail, with the collector door on it when the
 *  reader may swap the PIC (head of sales, director) and the paper is live. */
export function ContractOwners({
  contract,
  workstreamCode,
}: {
  contract: Contract
  workstreamCode: string | null
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const canChange = contract.canChangeCollector === true && !contract.termination

  return (
    <>
      <RunOwners
        workstreamCode={workstreamCode}
        focus={contract.code}
        doors={
          canChange
            ? {
                [collectorDoorKey(contract.code)]: {
                  label: t(
                    message('Đổi người thu tiền', 'Change payment collector', '수금 담당자 변경'),
                  ),
                  onClick: () => setOpen(true),
                  bare: true,
                },
              }
            : {}
        }
      />
      {canChange && (
        <ChangeCollectorDrawer contract={contract} open={open} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
