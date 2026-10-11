import { Avatar, MetaPill } from '@pv/ui'
import type { ContractParticipant } from '@pv/contracts'
import { BD_LANE, SALE_LANE, SALE_PRIMARY_LABEL, marksPrimary } from '@/data/opportunities'
import { RunBlock } from './run-block'
import { SEAT } from './run-owners'

/** Who stood on the deal when the contract was signed — the server's frozen
 *  copy of its SALE and BD lanes (ADR 0086), read-only. Separate from
 *  `RunOwners`, which names who holds the contract TODAY; the two may differ.
 *  Draws nothing for a contract signed with nobody on the deal. */
export function RunSigners({ people }: { people: ContractParticipant[] }) {
  if (people.length === 0) return null
  const sale = people.filter((o) => o.role === 'SALE')

  return (
    <RunBlock title="Người đứng đơn lúc ký">
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {people.map((o) => (
          <li key={`${o.role}-${o.id}`} className="flex min-w-0 items-center gap-3">
            <Avatar name={o.name} size="md" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14px] font-medium leading-[1.5]" title={o.name}>
                {o.name}
              </span>
              <span className={SEAT}>{(o.role === 'SALE' ? SALE_LANE : BD_LANE).label}</span>
            </span>
            {marksPrimary(o, sale) && (
              <MetaPill className="shrink-0">{SALE_PRIMARY_LABEL}</MetaPill>
            )}
          </li>
        ))}
      </ul>
    </RunBlock>
  )
}
