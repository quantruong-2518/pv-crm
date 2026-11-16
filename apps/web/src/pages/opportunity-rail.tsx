import { useState } from 'react'
import type { OpportunityProfileResponse } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { CHANGE_SALE_PRIMARY_COPY } from '@/data/opportunities'
import { AssignPresalesModal } from '@/components/opportunity-assign-presales'
import { QuotationRail } from '@/components/deal-money/quotation-rail'
import { CommJourney } from '@/components/run/comm-journey'
import { RunContacts } from '@/components/run/run-contacts'
import { RunDocuments } from '@/components/run/run-documents'
import { presalesDoorKey } from '@/components/run/owner-doors'
import { RunOwners } from '@/components/run/run-owners'
import type { DealMoneyState } from './opportunity-money-state'

/** Module 3 · the deal's run rail: owners, comms, the quotation list of the
 *  paper picked in the money block, people, files. Split out of the page so the
 *  page stays under the function ceiling. `assignHere` = the rail holds the
 *  seller swap (the header holds it while the deal has no seller). */
export function DealRail({
  op,
  money,
  assignHere,
  onAssign,
  canAssignPresales,
}: {
  op: OpportunityProfileResponse
  money: DealMoneyState
  assignHere: boolean
  onAssign: () => void
  canAssignPresales: boolean
}) {
  const { t } = useI18n()
  const [assigningPresales, setAssigningPresales] = useState(false)
  const run = op.workstream?.code ?? null
  const subject = { kind: 'opportunity', code: op.code } as const

  return (
    <>
      <RunOwners
        workstreamCode={run}
        focus={op.code}
        lanes={op.owners}
        hasSeller={op.hasSeller}
        doors={{
          ...(canAssignPresales && {
            [presalesDoorKey(op.code)]: {
              label: op.owners.some((o) => o.role === 'PRESALES')
                ? t(message('Đổi Presales', 'Change presales', '프리세일즈 변경'))
                : t(message('Giao Presales', 'Assign presales', '프리세일즈 지정')),
              onClick: () => setAssigningPresales(true),
            },
          }),
          ...(assignHere && {
            [op.code]: {
              label: op.pendingSign
                ? t(CHANGE_SALE_PRIMARY_COPY)
                : op.hasSeller
                  ? t(message('Đổi Sale', 'Change salesperson', '영업 담당자 변경'))
                  : t(message('Giao Sale', 'Assign salesperson', '영업 담당자 지정')),
              onClick: onAssign,
            },
          }),
        }}
      />
      <AssignPresalesModal
        op={op}
        open={assigningPresales}
        onClose={() => setAssigningPresales(false)}
      />
      <RunContacts subject={subject} />
      <CommJourney workstreamCode={run} subject={subject} />
      <QuotationRail
        paper={money.picked}
        closed={op.money.open.filter((n) => n.pendingId === null).flatMap((n) => n.rounds)}
        workstreamCode={run}
        doors={money.doors}
      />
      <RunDocuments workstreamCode={run} />
    </>
  )
}
