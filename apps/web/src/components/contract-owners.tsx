import { useState } from 'react'
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
                  label: 'Đổi người thu tiền',
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
